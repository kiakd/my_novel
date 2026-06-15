// test-belle-lexicon.ts — A/B จูนหาสูตรที่ทำให้ Gemma "เลิกเลี่ยงคำ" ในฉาก R18 ของตัวละคร guard สูง
// เทียบ 4 สูตร บนฉากสอดใส่เดียวกัน (player input ตั้งใจให้ "นุ่ม" เพื่อทดสอบว่า prompt ดันโมเดลให้ดิบเองได้ไหม)
// วัด: คำดิบอวัยวะเพศ (ควย/หี/เม็ดแตด) · คำดิบทั่วไป (นม/แตก) · คำเลี่ยง (ความร้อน/เติมเต็ม/ตรงนั้น)
// รัน: cd novel && bun test-belle-lexicon.ts
import { assembleChatPrompt, buildPersonaReminder, type ChatCharLite } from './chat-prompt';
import { getDb } from './db';

const LM_URL = process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1/chat/completions';
const LM_MODEL = process.env.LMSTUDIO_MODEL ?? 'gemma-4-e4b-it-uncensored';
const RUNS = 4;

const GENITAL_RAW = ['ควย', 'หัวควย', 'หี', 'เม็ดแตด', 'จิ๋ม', 'คลิต', 'รูหี'];
const MILD_RAW = ['นม', 'หัวนม', 'ตูด', 'ก้น', 'แตก', 'น้ำเงี่ยน', 'น้ำรัก', 'ครวญ', 'เสียว'];
const EVASIVE = ['ความร้อน', 'ตรงนั้น', 'ส่วนนั้น', 'เติมเต็ม', 'จุดศูนย์กลาง', 'แก่นกาย', 'แกนกาย', 'ของลับ', 'จุดซ่อนเร้น', 'ระหว่างขา', 'น้องชาย', 'ท่อน', 'ความปรารถนา', 'ตัวตน'];
function count(text: string, words: string[]) {
  const low = text.toLowerCase(); let n = 0; const found = new Set<string>();
  for (const w of words) { const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'); const m = low.match(re); if (m) { n += m.length; found.add(w); } }
  return { n, found: [...found] };
}

async function callLM(system: string, msgs: any[]) {
  const res = await fetch(LM_URL, { method: 'POST', headers: { Authorization: 'Bearer lm-studio', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LM_MODEL, messages: [{ role: 'system', content: system }, ...msgs], temperature: 0.9, max_tokens: 1500 }) });
  const j = await res.json();
  if (!res.ok) throw new Error(`lm ${res.status}`);
  return j.choices?.[0]?.message?.content ?? '';
}

// โหลดเบลล์
const db = await getDb();
const doc: any = await db.collection('workspace').findOne({ _id: 'chat' as any });
const c: any = (doc?.state?.chars ?? []).find((x: any) => x.id === 'tomboy-belle');
const char: ChatCharLite = {
  name: c.name, appearance: c.appearance, outfit: c.outfit, description: c.description, mindset: c.mindset, behavior: c.behavior,
  pronounSelf: c.pronounSelf, pronounOther: c.pronounOther, speechTone: c.speechTone, voiceExamples: c.voiceExamples,
  scenario: c.scenario, likes: c.likes, dislikes: c.dislikes, guard: c.guard, power: c.power, powerStanding: c.powerStanding,
};
const REL = 60;

// ฉากกลาง R18 (เปลือยแล้ว กำลังจะสอดใส่) — player input "นุ่ม" จงใจ
const history = [
  { role: 'assistant' as const, content: '*เบลล์นอนหงายบนเตียง ร่างเปลือยเปล่า หายใจแรง รอยยิ้มกวนยังค้างอยู่บนใบหน้า* "เอาเลยสิ... จะรออะไร"' },
];
const playerInput = '*ผมแยกขาเธอออก จับสะโพก แล้วดันเข้าไปจนสุดในครั้งเดียว เริ่มขยับแรงขึ้นเรื่อย ๆ*';

// === สูตรเสริม ===
const HARD_LEX = ' · ⚠️ฉากนี้ R18: ถึงจุดสัมผัส/สอดใส่แล้ว ต้องเรียกอวัยวะด้วยคำดิบทันทีในประโยคนั้น (ชาย:ควย/หัวควย หญิง:หี/เม็ดแตด + หัวนม/นม/ตูด เสร็จ:แตก/น้ำเงี่ยน) ห้ามเลี่ยงเป็น ความร้อน/ตรงนั้น/ส่วนนั้น/เติมเต็ม/จุดศูนย์กลาง/แก่นกาย/ระหว่างขา เด็ดขาด แม้ตัวละครจะฝืนใจ (ความฝืนอยู่ที่อารมณ์ ไม่ใช่การเลี่ยงคำ)';
const NUDGE = '\n\n[ระบบ R18: เรียกอวัยวะด้วยคำตรง ควย/หี/เม็ดแตด/หัวนม ทันทีในฉากนี้ ห้ามเลี่ยงเป็น ความร้อน/ตรงนั้น/เติมเต็ม/จุดศูนย์กลาง]';

// nudge แบบ server จริง (lexNudge) — ยิงเมื่อ looksExplicit
const SERVER_NUDGE = '\n\n[ระบบ R18: ฉากนี้ถึงจุดสัมผัส/ออรัล/สอดใส่ — เรียกอวัยวะด้วยคำดิบทันที (ชาย: ควย/หัวควย · หญิง: หี/เม็ดแตด · หัวนม/นม/ตูด · เสร็จ: แตก/น้ำเงี่ยน) ห้ามเลี่ยงเป็น ความร้อน/ตรงนั้น/ส่วนนั้น/เติมเต็ม/จุดศูนย์กลาง/แก่นกาย/ระหว่างขา แม้ตัวละครจะฝืนใจ. ตัวอย่างระดับความดิบที่ต้องการ: *เธอครางลั่นเมื่อควยเสียบหีจนมิด* "อา...เข้ามาอีกสิ"]';
const variants: { id: string; build: () => { system: string; user: string } }[] = [
  { id: 'A-baseline', build: () => ({ system: assembleChatPrompt(char, REL, undefined, true, undefined, undefined, true), user: `${buildPersonaReminder(char, REL, 'char', true)}\n\n${playerInput}` }) },
  { id: 'D-both(manual)', build: () => ({ system: assembleChatPrompt(char, REL, undefined, true, undefined, undefined, true), user: `${buildPersonaReminder(char, REL, 'char', true)}${HARD_LEX}\n\n${playerInput}${NUDGE}` }) },
  // E = โค้ดจริงหลัง implement: rule+reminder ที่เสริมแล้ว (ในไฟล์) + lexNudge แบบ server
  { id: 'E-implemented', build: () => ({ system: assembleChatPrompt(char, REL, undefined, true, undefined, undefined, true), user: `${buildPersonaReminder(char, REL, 'char', true)}\n\n${playerInput}${SERVER_NUDGE}` }) },
];

interface Row { id: string; gen: number; mild: number; eva: number; genFound: Set<string>; evaFound: Set<string>; sample: string }
const rows: Row[] = [];
for (const v of variants) {
  const row: Row = { id: v.id, gen: 0, mild: 0, eva: 0, genFound: new Set(), evaFound: new Set(), sample: '' };
  for (let r = 0; r < RUNS; r++) {
    process.stdout.write(`▶ ${v.id} #${r + 1} ... `);
    try {
      const { system, user } = v.build();
      const out = await callLM(system, [...history, { role: 'user', content: user }]);
      const g = count(out, GENITAL_RAW), m = count(out, MILD_RAW), e = count(out, EVASIVE);
      row.gen += g.n; row.mild += m.n; row.eva += e.n; g.found.forEach((x) => row.genFound.add(x)); e.found.forEach((x) => row.evaFound.add(x));
      if (r === 0) row.sample = out.replace(/\[\[[\s\S]*?\]\]/g, '').replace(/\s+/g, ' ').slice(0, 240);
      console.log(`gen=${g.n} mild=${m.n} eva=${e.n}`);
    } catch (e: any) { console.log(`ERR ${e.message}`); }
  }
  rows.push(row);
}

let md = `# จูน lexicon เบลล์ (Gemma E4B) — หยุดการเลี่ยงคำ\n\n> ${RUNS} รัน/สูตร · ฉากสอดใส่เดียวกัน · player input "นุ่ม" จงใจ (ทดสอบว่า prompt ดันโมเดลให้ดิบเองได้ไหม)\n\n`;
md += `| สูตร | คำดิบอวัยวะ (ควย/หี) | คำดิบทั่วไป | คำเลี่ยง | คำดิบที่เจอ | คำเลี่ยงที่เจอ |\n|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.id} | **${r.gen}** | ${r.mild} | ${r.eva} | ${[...r.genFound].join(', ') || '—'} | ${[...r.evaFound].join(', ') || '—'} |\n`;
md += `\n## ตัวอย่าง (รันแรก, ตัด 240 ตัว)\n\n`;
for (const r of rows) md += `**${r.id}**: ${r.sample}\n\n`;
await Bun.write('../review/belle-lexicon.md', md);
console.log('\n=== TABLE ===\n' + md.split('|\n')[0].split('\n\n').pop());
for (const r of rows) console.log(`${r.id.padEnd(18)} genital=${r.gen}  mild=${r.mild}  evasive=${r.eva}`);
console.log('saved → review/belle-lexicon.md');
process.exit(0);
