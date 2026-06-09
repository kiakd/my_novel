// test-generate.ts — เทสต์ pipeline เขียนบทผ่าน /api/generate-roleplay (DeepSeek)
// + ตรวจ ai_log ว่า system prompt ครบ/ไม่หลุด และตรงทิศทางเรื่อง
// รัน: bun test-generate.ts   (server :3000 ต้องรันอยู่)
import { getDb } from './db';
import { readStory } from './state-store';

const BASE = 'http://localhost:3000';
const STORY_ID = 'neoncharm';

const db = await getDb();
const story: any = await readStory(db, STORY_ID);
if (!story) throw new Error('story not found');

const [kai, mira, amp] = story.characters;

// map story.Char → prompts.Character
const toChar = (c: any) => ({
  name: c.name,
  appearance: c.appearance,
  bio: c.description,
  skill: c.skill,
  mindset: c.mindset,
  behavior: c.behavior,
  pronoun_self: c.pronounSelf,
  pronoun_other: c.pronounOther,
  speech_tone: c.speechTone,
});

const ctx = {
  protagonist: toChar(kai),
  supporting: [toChar(mira), toChar(amp)],
  setting: {
    worldName: 'สิบมหานคร / สภาคอนคอร์ด',
    genre: story.genre,
    era: 'อนาคต ไซเบอร์พังก์',
    location: 'นครลีร่า',
    rules: story.worldRules,   // lore + LORE LOCK (ยินยอม/ไม่สะกดจิต) อยู่ในนี้
  },
  styleGuide: story.styleGuide,   // → render เป็น section "Style Guide" ของตัวเอง (แก้ใหม่)
  dontList: story.dontList,       // → render เป็น section "Do / Don't" ของตัวเอง (แก้ใหม่)
  relations: story.relations.map((r: any) => ({
    charName: r.from,
    toUser: r.to,
    feeling: `${r.type} — ${r.feeling}`,
  })),
  eventCurrent:
    'คืนนี้ที่ตลาดใต้ ชั้น –9 ไคเพิ่งได้คัมภีร์มหาเสน่ห์โบราณมา เขาเดินกลับผ่านย่านบาร์ แล้วตัดสินใจรวบรวมความกล้าเดินเข้าร้าน "เวสเปอร์ส" ของมิราที่แอบชอบมานาน ' +
    'เปิดฉากบทสนทนาจีบกันแบบหยอกล้อขำ ๆ มีแอมป์แทรกมุกจากแขน. เขียนช่วงเปิดเรื่องจนถึงตอนทั้งคู่เริ่มสนิทกัน ' +
    '— ยังไม่ต้องลงฉากเลิฟซีน ให้หยุดที่จังหวะก่อนใกล้ชิด (นี่เป็นการเทสต์ pipeline)',
  mode: 'novel',
};

console.log('▶ POST /api/generate-roleplay (mode=novel, scene=ch1 setup non-explicit)…\n');
const res = await fetch(`${BASE}/api/generate-roleplay`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ context: ctx, user_input: 'เริ่มเขียนฉากเปิดบทที่ 1 ได้เลย', temperature: 0.85 }),
});
const out: any = await res.json();
if (!out.ok) {
  console.error('✗ generate failed:', out.error);
  process.exit(1);
}
console.log('─── ผลลัพธ์ที่ DeepSeek เขียน (response) ───');
console.log(out.text);
console.log(`\n(prompt_chars=${out.prompt_chars}, provider=${out.provider}, model=${out.model})`);

// ----- ดึง log ล่าสุด แล้ว audit system prompt -----
await Bun.sleep(800); // รอ logCall เขียนเสร็จ
const listRes = await fetch(`${BASE}/api/logs?limit=1`);
const list: any[] = await listRes.json();
const logId = list?.[0]?.id;
const fullRes = await fetch(`${BASE}/api/logs/${logId}`);
const full: any = (await fullRes.json()).log;

const sys: string = full.system ?? '';
console.log('\n\n═══════════ AUDIT: ai_log ' + logId + ' ═══════════');
console.log(`endpoint=${full.endpoint}  ok=${full.ok}  ms=${full.ms}  model=${full.model}`);
console.log(`system prompt length = ${sys.length} chars (ไม่ถูก truncate ใน DB)`);
console.log(`meta.sections = ${JSON.stringify(full.meta?.sections)}`);
console.log(`meta.characterCount = ${full.meta?.characterCount}  mode=${full.meta?.mode}`);
console.log(`meta.hasCharacters=${full.meta?.hasCharacters}  hasStyleGuide=${full.meta?.hasStyleGuide}  hasDontList=${full.meta?.hasDontList}  hasWorldRules=${full.meta?.hasWorldRules}`);

const checks: [string, boolean][] = [
  ['ตัวเอก ไค อยู่ใน prompt', sys.includes('ไค')],
  ['มิรา (สมทบ) อยู่ใน prompt', sys.includes('มิรา')],
  ['แอมป์ (สมทบ) อยู่ใน prompt', sys.includes('แอมป์')],
  ['พลังจิต/telekinesis', sys.includes('telekinesis') || sys.includes('พลังจิต')],
  ['แขนกีตาร์ไฟฟ้า', sys.includes('กีตาร์')],
  ['world rules: สภาคอนคอร์ด', sys.includes('คอนคอร์ด')],
  ['LORE LOCK (ยินยอม/ไม่สะกดจิต)', sys.includes('LORE LOCK') || sys.includes('ขยายเสน่ห์')],
  ["don't: non-consent", sys.includes('non-consent') || sys.includes('ยินยอม')],
  ['relations (คนรัก)', sys.includes('คนรัก')],
  ['สถานที่: ลีร่า', sys.includes('ลีร่า')],
  ['eventCurrent: คัมภีร์', sys.includes('คัมภีร์')],
  ['style: ภาษาบ้าน ๆ', sys.includes('บ้าน')],
];
console.log('\n── prompt completeness / alignment ──');
for (const [label, ok] of checks) console.log(`  ${ok ? '✅' : '❌'} ${label}`);

const missing = checks.filter(([, ok]) => !ok).map(([l]) => l);
console.log(`\nสรุป: ${checks.length - missing.length}/${checks.length} ผ่าน` + (missing.length ? `  | หลุด: ${missing.join(', ')}` : '  | ครบทุกข้อ'));
process.exit(0);
