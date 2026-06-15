// test-gemma-state.ts — วัดว่า Gemma E4B (local) ปล่อยแท็ก [[state:...]] ได้ถูกฟอร์แมต/ตรงเหตุการณ์แค่ไหน
// เทียบ DeepSeek เป็น baseline (cloud ฉลาดกว่า) · รัน: cd novel && bun test-gemma-state.ts
// วัด: tag present? · parse ได้? · วางท้าย (ไม่ปนกลางเรื่อง)? · จับ field ที่ควรเปลี่ยน? · contradiction warnings
import { assembleChatPrompt, buildPersonaReminder, type ChatCharLite } from './chat-prompt';
import { renderStateCard, parseStateDelta, applyDelta, checkContradiction, type StateCard } from './state-card';

const LM_URL = process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1/chat/completions';
const LM_MODEL = process.env.LMSTUDIO_MODEL ?? 'gemma-4-e4b-it-uncensored';
const DS_KEY = process.env.DEEPSEEK_API_KEY;
const DS_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
const RUNS = 3;                 // ยิงซ้ำ/สถานการณ์ เพื่อวัดความเสถียร (local สุ่ม)
const PROVIDERS: ('E4B' | 'DeepSeek')[] = DS_KEY ? ['E4B', 'DeepSeek'] : ['E4B'];

// ตัวละคร: จอมเวทหนีตามล่า ที่ "ต้องปลอมตัวก่อนเข้าที่สาธารณะ" — บีบให้ state เปลี่ยนบ่อย
const char: ChatCharLite = {
  name: 'ออเรเลีย',
  appearance: 'หญิงสาวผมเงินยาว ตาสีม่วงเรืองแสง (ลักษณะเด่นที่คนจำได้)',
  outfit: 'เสื้อคลุมเดินทางเปื้อนโคลน',
  description: 'จอมเวทที่ถูกราชสำนักตามล่า ต้องปลอมตัวเสมอเมื่ออยู่ในเมือง',
  mindset: 'ระแวง รอบคอบ',
  behavior: 'พูดน้อย เฝ้าระวังรอบตัว',
  pronounSelf: 'ข้า', pronounOther: 'เจ้า',
  speechTone: 'สุภาพโบราณ เย็น',
  scenario: 'เจอกันที่ชายป่านอกเมืองหลวง',
  guard: 70,
};

const baseState: StateCard = {
  identity: { realName: 'ออเรเลีย', form: 'หญิงสาวผมเงิน ตาม่วง', disguised: false, gender: 'หญิง' },
  location: 'ชายป่านอกเมือง',
  outfit: 'เสื้อคลุมเดินทางเปื้อนโคลน',
  inventory: ['ขนมปังแห้ง 2 ก้อน', 'จี้คริสตัลผนึกพลัง'],
  rel: 35,
};

interface Scenario { id: string; user: string; expect: string; check: (d: ReturnType<typeof parseStateDelta>['delta']) => boolean }
const scenarios: Scenario[] = [
  { id: 'enter-town', user: '*ข้าชี้ไปยังประตูเมืองหลวงที่อยู่เบื้องหน้า* "ไปกันเถอะ เราจะเข้าเมืองทางประตูนั้น" *แล้วก้าวเท้ามุ่งหน้าเข้าเขตเมือง*',
    expect: 'set location=ในเมือง + (ควร) disguised=true', check: (d) => !!d && ((!!d.set.location && !/ชายป่า|นอกเมือง/.test(d.set.location)) || d.set.identity?.disguised === true) },
  { id: 'use-item', user: '"ข้าหิวเหลือเกิน" *ข้าหยิบขนมปังแห้งในย่ามออกมากินจนหมดทั้งสองก้อน*',
    expect: '-inv ขนมปัง', check: (d) => !!d && d.remove.inventory.length > 0 },
  { id: 'gain-item', user: '*ชายชรายื่นมีดสั้นเล่มงามให้ข้า* "รับไว้เถิด เจ้าจะได้ป้องกันตัว" *ข้ารับมันมาเหน็บไว้ที่เอว*',
    expect: '+inv มีดสั้น', check: (d) => !!d && d.add.inventory.length > 0 },
  { id: 'change-outfit', user: '"เสื้อคลุมนี้เปื้อนเกินไป" *ข้าถอดมันออกแล้วเปลี่ยนเป็นชุดกระโปรงชาวเมืองสีน้ำตาลเรียบ ๆ*',
    expect: 'set outfit', check: (d) => !!d && !!d.set.outfit },
  { id: 'no-change', user: '"เจ้าคิดว่าดวงดาวคืนนี้สวยไหม" *ข้าเงยหน้ามองท้องฟ้า*',
    expect: '[[state: none]] (ไม่ควรเปลี่ยนอะไร)', check: (d) => !!d && !d.set.location && !d.set.outfit && d.add.inventory.length === 0 && d.remove.inventory.length === 0 && !d.set.identity },
];

const history = [
  { role: 'assistant' as const, content: '*นางยืนนิ่งอยู่ริมป่า สายตาเฝ้าระวัง* "เจ้าตามข้ามาทำไม..."' },
  { role: 'user' as const, content: 'ข้าแค่อยากช่วยเจ้าหนีจากการตามล่า' },
];

async function callE4B(system: string, msgs: any[]) {
  const res = await fetch(LM_URL, {
    method: 'POST', headers: { Authorization: 'Bearer lm-studio', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LM_MODEL, messages: [{ role: 'system', content: system }, ...msgs], temperature: 0.9, max_tokens: 700 }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`lmstudio ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.choices?.[0]?.message?.content ?? '';
}
async function callDS(system: string, msgs: any[]) {
  const body: any = { model: DS_MODEL, messages: [{ role: 'system', content: system }, ...msgs], temperature: 0.9, max_tokens: 700 };
  if (DS_MODEL.includes('v4')) body.thinking = { type: 'disabled' };
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${DS_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`deepseek ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.choices?.[0]?.message?.content ?? '';
}

const system = assembleChatPrompt(char, baseState.rel ?? 0, undefined, true, undefined, renderStateCard(baseState), true);
const reminder = buildPersonaReminder(char, baseState.rel ?? 0, 'char', true);

// ตำแหน่งแท็ก: อยู่ใน 25% ท้ายของข้อความ = "วางท้าย" ถูก
function tagAtEnd(raw: string): boolean {
  const i = raw.search(/\[\[\s*state/i);
  if (i < 0) return false;
  return i >= raw.length * 0.6;
}

interface Row { provider: string; scn: string; tag: number; parse: number; atEnd: number; correct: number; warns: number; samples: string[] }
const rows: Row[] = [];

for (const provider of PROVIDERS) {
  const call = provider === 'E4B' ? callE4B : callDS;
  for (const scn of scenarios) {
    const row: Row = { provider, scn: scn.id, tag: 0, parse: 0, atEnd: 0, correct: 0, warns: 0, samples: [] };
    for (let r = 0; r < RUNS; r++) {
      process.stdout.write(`▶ ${provider} / ${scn.id} #${r + 1} ... `);
      try {
        const nudge = '\n\n[ระบบ: ปิดท้ายคำตอบนี้ด้วยบรรทัด [[state: ...]] เสมอ — สรุปเฉพาะสิ่งที่เปลี่ยน หรือ [[state: none]] ถ้าไม่เปลี่ยน]';
        const msgs = [...history, { role: 'user' as const, content: `${reminder}\n\n${scn.user}${nudge}` }];
        const raw = await call(system, msgs);
        const hasTag = /\[\[\s*state/i.test(raw);
        if (hasTag) row.tag++;
        if (tagAtEnd(raw)) row.atEnd++;
        const { delta } = parseStateDelta(raw);
        if (delta) row.parse++;
        if (scn.check(delta)) row.correct++;
        if (delta) {
          const next = applyDelta(baseState, delta);
          const w = checkContradiction(baseState, next, delta);
          row.warns += w.length;
        }
        // เก็บตัวอย่างแท็กที่เจอ (รันแรก)
        if (r === 0) {
          const m = raw.match(/\[\[\s*state:[\s\S]*?\]\]/i);
          row.samples.push(m ? m[0] : '(ไม่มีแท็ก)');
        }
        console.log(`tag=${hasTag ? 'Y' : 'N'} parse=${delta ? 'Y' : 'N'} correct=${scn.check(delta) ? 'Y' : 'N'}`);
      } catch (e: any) {
        console.log(`ERR ${e.message}`);
        if (r === 0) row.samples.push(`[ERROR] ${e.message}`);
      }
    }
    rows.push(row);
  }
}

// ===== รายงาน =====
let md = `# Gemma E4B — ความแม่นของแท็ก [[state:]] (เทียบ DeepSeek)\n\n`;
md += `> ${RUNS} รัน/สถานการณ์ · temp 0.9 · ฉาก: จอมเวทหนีตามล่า ที่ต้องปลอมตัวก่อนเข้าเมือง\n\n`;
md += `เกณฑ์: **tag**=ใส่แท็กไหม · **parse**=parser จับได้ · **atEnd**=วางท้าย(ไม่ปนกลางเรื่อง) · **correct**=จับ field ที่ควรเปลี่ยน · **warns**=contradiction รวม\n\n`;
md += `| Provider | สถานการณ์ | tag | parse | atEnd | correct | warns |\n|---|---|---|---|---|---|---|\n`;
const pct = (n: number) => `${n}/${RUNS}`;
for (const r of rows) md += `| ${r.provider} | ${r.scn} | ${pct(r.tag)} | ${pct(r.parse)} | ${pct(r.atEnd)} | ${pct(r.correct)} | ${r.warns} |\n`;
// สรุปรวมต่อ provider
md += `\n## สรุปรวมต่อ provider\n\n| Provider | tag% | parse% | atEnd% | correct% |\n|---|---|---|---|---|\n`;
for (const provider of PROVIDERS) {
  const rs = rows.filter((r) => r.provider === provider);
  const tot = rs.length * RUNS;
  const sum = (k: keyof Row) => rs.reduce((n, r) => n + (r[k] as number), 0);
  const p = (n: number) => `${Math.round((n / tot) * 100)}%`;
  md += `| ${provider} | ${p(sum('tag'))} | ${p(sum('parse'))} | ${p(sum('atEnd'))} | ${p(sum('correct'))} |\n`;
}
md += `\n## ตัวอย่างแท็กที่โมเดลปล่อย (รันแรกของแต่ละสถานการณ์)\n\n`;
for (const r of rows) md += `- **${r.provider}/${r.scn}**: \`${(r.samples[0] ?? '-').replace(/\n/g, ' ')}\`\n`;

await Bun.write('../review/gemma-state.md', md);
console.log('\n' + md.split('## สรุปรวม')[1]?.split('## ตัวอย่าง')[0]);
console.log('saved → review/gemma-state.md');
process.exit(0);
