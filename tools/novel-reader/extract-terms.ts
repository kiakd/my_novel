// เก็บชื่อ/ศัพท์เฉพาะจากต้นฉบับที่ดึงไว้ล่วงหน้า (raw/) ก่อนแปล → คลังครบตั้งแต่ตอนแรกที่โผล่ และแปลหลายช่วงพร้อมกันได้โดยชื่อไม่เพี้ยน
// อ่านทีละชุด ~10 บท ; รายการคำที่มีในคลังแล้วส่งแค่คำจีน (อยู่ใน system → cache ถูก)
// ผลลัพธ์: library/<เรื่อง>/terms-candidates.json (ให้ตรวจก่อน) ; --apply = รวมเข้า glossary.json (ไม่ทับของเดิม)
//
//   node extract-terms.ts --book 45305 [--batch 10] [--workers 4] [--apply]
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { merge, type Glossary } from './glossary.ts';

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const book = opt('--book') ?? process.exit(console.error('ต้องใส่ --book') ?? 1);
const BATCH = Number(opt('--batch') ?? 10);
const WORKERS = Number(opt('--workers') ?? 4);
const ROOT = import.meta.dirname;
const DIR = join(ROOT, 'library', book);
const OUT = join(DIR, 'terms-candidates.json');
const gPath = join(DIR, 'glossary.json');
const g: Glossary = JSON.parse(readFileSync(gPath, 'utf8'));

type Cand = { zh: string; th: string; kind: 'person' | 'term'; gender?: string; role?: string; first: number; seen: number; alt?: string[] };

if (argv.includes('--apply')) {
  const cands: Cand[] = JSON.parse(readFileSync(OUT, 'utf8')).items;
  const before = { c: Object.keys(g.characters).length, t: Object.keys(g.terms).length };
  // ตัวละคร: แค่ชื่อ/เพศ/บทบาทย่อ — self/called ให้ขั้นแปลเติมเมื่อเห็นบทพูดจริง
  merge(g, {
    characters: Object.fromEntries(cands.filter((c) => c.kind === 'person' && !g.characters[c.zh]).map((c) => [c.zh, { th: c.th, ...(c.gender ? { gender: c.gender } : {}), role: `${c.role ?? ''} (โผล่ครั้งแรกราวบท ${c.first})`.trim() }])),
    terms: Object.fromEntries(cands.filter((c) => c.kind === 'term').map((c) => [c.zh, c.th])),
  });
  writeFileSync(gPath, JSON.stringify(g, null, 2));
  console.log(`รวมเข้าคลัง: ตัวละคร ${before.c}→${Object.keys(g.characters).length} · คำศัพท์ ${before.t}→${Object.keys(g.terms).length}`);
  process.exit(0);
}

const idx = JSON.parse(readFileSync(join(DIR, 'raw', 'index.json'), 'utf8'));
const prog = JSON.parse(readFileSync(join(DIR, 'progress.json'), 'utf8'));
const base = prog.order.length; // บทใน raw เริ่มต่อจากนี้
const chapters = (idx.chapters as { cid: string }[]).map((c, i) => ({ n: base + i + 1, ...c })).filter((c) => existsSync(join(DIR, 'raw', `${c.cid}.json`)));
const batches: (typeof chapters)[] = [];
for (let i = 0; i < chapters.length; i += BATCH) batches.push(chapters.slice(i, i + BATCH));

const known = [...Object.keys(g.characters), ...Object.keys(g.terms)];
const sample = Object.entries(g.terms).slice(0, 40).map(([z, t]) => `${z}=${t}`).join(' · ');
const SYSTEM = `คุณเตรียมคลังคำสำหรับแปลนิยายเว็บจีน→ไทย (แนวลอร์ด/ระบบเกม/แฟนตาซี) ก่อนเริ่มแปล
อ่านต้นฉบับที่ให้ แล้วดึง "ชื่อเฉพาะและศัพท์เฉพาะของเรื่อง" ที่ยังไม่มีในรายการที่มีแล้ว:
- ชื่อคน/สัตว์/ตัวละคร (kind=person) — ถอดเสียงจีนกลางเป็นไทยแบบนิยายแปล (เช่น 周舟=โจวโจว) ; ฉายา/ชื่อที่มีความหมาย (เช่น 枯萎树魔领主) แปลความหมาย ; ระบุเพศถ้าต้นฉบับบอก (他=ชาย 她=หญิง) และบทบาทสั้นๆ ≤12 คำ
- ศัพท์เฉพาะ (kind=term): สถานที่ อาณาจักร กลุ่มอำนาจ เผ่า หน่วยทหาร อาชีพ สกิล ไอเทม สิ่งก่อสร้าง ระดับ คำในระบบเกม — แปลความหมายเป็นไทยให้สม่ำเสมอกับสไตล์คลังเดิม
- ห้ามดึงคำทั่วไป (คำที่มีในพจนานุกรม เช่น 领主 骑兵 药剂) เว้นแต่เป็นชื่อเฉพาะในเรื่อง ; ห้ามดึงคำที่มีในรายการแล้ว ; ภาษาไทยล้วน ห้ามอักษรจีน/อังกฤษในคำแปล
ตัวอย่างสไตล์คลังเดิม: ${sample}
คำที่มีในคลังแล้ว (ห้ามดึงซ้ำ): ${known.join('、')}
ตอบ JSON อย่างเดียว: {"items":[{"zh":"","th":"","kind":"person|term","gender":"ชาย|หญิง|","role":"","ch":<เลขบทที่เจอครั้งแรก>}]}`;

const MODEL = opt('--model') ?? 'gpt-5.6-luna';
const KEY = process.env.OPENAI_API_KEY ?? process.exit(console.error('ไม่พบ OPENAI_API_KEY') ?? 1);
const USAGE = { hit: 0, miss: 0, out: 0 };
async function ask(user: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }], temperature: 0.2, reasoning_effort: 'none', max_completion_tokens: 8000, response_format: { type: 'json_object' } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      const hit = j.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      USAGE.hit += hit; USAGE.miss += (j.usage?.prompt_tokens ?? 0) - hit; USAGE.out += j.usage?.completion_tokens ?? 0;
      appendFileSync(join(ROOT, 'library', 'usage.jsonl'), JSON.stringify({ t: new Date().toISOString(), book, ch: 0, mode: 'extract-terms', stage: 'terms', provider: 'openai', model: MODEL, ms: 0, hit, miss: (j.usage?.prompt_tokens ?? 0) - hit, out: j.usage?.completion_tokens ?? 0 }) + '\n');
      return j.choices[0].message.content;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

const found = new Map<string, Cand>();
let done = 0;
const queue = [...batches];
async function worker() {
  for (let b = queue.shift(); b; b = queue.shift()) {
    const text = b.map((c) => {
      const r = JSON.parse(readFileSync(join(DIR, 'raw', `${c.cid}.json`), 'utf8'));
      return `===== บท ${c.n}: ${r.title}\n${r.paragraphs.join('\n')}`;
    }).join('\n\n');
    let items: { zh?: string; th?: string; kind?: string; gender?: string; role?: string; ch?: number }[] = [];
    try { items = JSON.parse(await ask(text)).items ?? []; } catch (e) { console.error(`ชุดบท ${b[0].n}-${b.at(-1)!.n} ล้มเหลว: ${(e as Error).message}`); }
    for (const it of items) {
      const zh = it.zh?.trim(), th = it.th?.trim();
      if (!zh || !th || zh.length < 2 || known.includes(zh) || /[一-鿿A-Za-z]/.test(th)) continue;
      const ch = Number(it.ch) || b[0].n;
      const cur = found.get(zh);
      if (!cur) found.set(zh, { zh, th, kind: it.kind === 'person' ? 'person' : 'term', ...(it.gender ? { gender: it.gender } : {}), ...(it.role ? { role: it.role } : {}), first: ch, seen: 1 });
      else {
        cur.seen++;
        // ชุดที่เจอก่อน (บทต้นกว่า) ชนะ ; คำแปลอื่นเก็บไว้ให้ตรวจ
        if (th !== cur.th) cur.alt = [...new Set([...(cur.alt ?? []), th])];
        if (ch < cur.first) cur.first = ch;
        if (!cur.gender && it.gender) cur.gender = it.gender;
      }
    }
    if (++done % 10 === 0) console.log(`ชุด ${done}/${batches.length} · พบ ${found.size} คำ`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
const items = [...found.values()].sort((a, b) => a.first - b.first);
writeFileSync(OUT, JSON.stringify({ at: Date.now(), model: MODEL, items }, null, 1));
const cost = (USAGE.hit * 0.01 + USAGE.miss * 0.1 + USAGE.out * 0.5) / 1e6;
console.log(`เสร็จ: ${items.length} คำ (ตัวละคร ${items.filter((i) => i.kind === 'person').length}) · มีคำแปลหลายแบบ ${items.filter((i) => i.alt).length} · token เข้า ${USAGE.hit + USAGE.miss} (cache ${USAGE.hit}) ออก ${USAGE.out} ≈ $${cost.toFixed(3)}`);
console.log(OUT);
