// gen-chapter.ts — เจนเนื้อบทผ่าน DeepSeek (/api/generate-roleplay) แล้วเซฟเข้า chapters[].content ใน Mongo
// ใช้:  bun gen-chapter.ts <chapterId> [mode] ["scene brief override"]
//   mode = novel | dialogue | r18   (default: novel)
//   ถ้าไม่ใส่ scene brief จะใช้ chapter.summary เป็นบรีฟฉาก
// ตัวอย่าง:  bun gen-chapter.ts nc1 novel
//           bun gen-chapter.ts nc2 r18 "คืนต่อเนื่องที่เวสเปอร์ส เลิฟซีนเต็มอารมณ์ เต็มใจทั้งคู่ ..."
import { getDb } from './db';
import { readStory, patchStory } from './state-store';

const BASE = 'http://localhost:3000';
const STORY_ID = 'neoncharm';

const chapterId = process.argv[2];
const mode = (process.argv[3] ?? 'novel') as 'novel' | 'dialogue' | 'r18';
const sceneOverride = process.argv[4];
if (!chapterId) { console.error('usage: bun gen-chapter.ts <chapterId> [mode] ["scene brief"]'); process.exit(1); }

const db = await getDb();
const story: any = await readStory(db, STORY_ID);
if (!story) throw new Error('story not found');
const chapters: any[] = story.chapters;
const ch = chapters.find((c) => c.id === chapterId);
if (!ch) throw new Error(`chapter "${chapterId}" not found (มี: ${chapters.map((c) => c.id).join(', ')})`);

const [kai, mira, amp] = story.characters;
const toChar = (c: any) => ({
  name: c.name, appearance: c.appearance, bio: c.description, skill: c.skill,
  mindset: c.mindset, behavior: c.behavior,
  pronoun_self: c.pronounSelf, pronoun_other: c.pronounOther, speech_tone: c.speechTone,
});

// บทก่อนหน้า → eventOrder (ให้ AI เขียนต่อเนื่อง ไม่ขัด timeline)
const prevSummaries = chapters
  .filter((c) => (c.order ?? 0) < (ch.order ?? 0))
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((c) => `${c.title}: ${c.summary ?? ''}`);

const ctx = {
  protagonist: toChar(kai),
  supporting: [toChar(mira), toChar(amp)],
  setting: {
    worldName: 'สิบมหานคร / สภาคอนคอร์ด', genre: story.genre,
    era: 'อนาคต ไซเบอร์พังก์', location: 'นครลีร่า', rules: story.worldRules,
  },
  styleGuide: story.styleGuide,
  dontList: story.dontList,
  relations: story.relations.map((r: any) => ({ charName: r.from, toUser: r.to, feeling: `${r.type} — ${r.feeling}` })),
  eventOrder: prevSummaries.length ? prevSummaries : undefined,
  eventCurrent: sceneOverride ?? ch.summary ?? ch.title,
  mode,
};

console.log(`▶ generate "${ch.title}" (${chapterId}) mode=${mode}…`);
const res = await fetch(`${BASE}/api/generate-roleplay`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ context: ctx, user_input: `เขียนเนื้อบท "${ch.title}" ให้เต็มบทตามบรีฟฉาก`, temperature: 0.85, max_tokens: 2600 }),
});
const out: any = await res.json();
if (!out.ok) { console.error('✗ generate failed:', out.error); process.exit(1); }

// ทำความสะอาด artifact ของโหมด roleplay แล้วแปลงเป็น HTML
// 1) ป้ายความคิดในใจ "(ภายในใจ ... 🥤: XXX)" → 'XXX' (มุมมองผม แทรกในเนื้อ)
// 2) ตัดหัวบรรทัด [📅วันที่|⏰เวลา|📍สถานที่] และบรรทัดที่ยังมี 🥤 หลงเหลือ
// 3) ลบ * ที่ใช้เน้น/เสียงประกอบ
// จับทุกแบบ: "(ภายในใจผม: 'X')" หรือ "(ภายในใจชื่อ 🥤: X)" → คงเฉพาะเนื้อความคิด (X) แทรกในเนื้อ
const cleaned = out.text.replace(/\(\s*ภายในใจ[\s\S]*?:\s*([^)]*)\)/g, '$1');
const html = cleaned
  .split(/\n+/).map((s: string) => s.replace(/\*/g, '').trim())
  .filter((s: string) => s && s !== '---' && s !== '***' && !/[📅⏰📍🥤]/.test(s))
  .map((s: string) => `<p>${s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
  .join('');

const updated = chapters.map((c) => (c.id === chapterId ? { ...c, content: html, status: 'done' } : c));
await patchStory(db, STORY_ID, { chapters: updated });

const plainLen = out.text.replace(/\s+/g, '').length;
console.log(`✓ saved → ${chapterId}.content (${html.length} chars HTML, ~${plainLen} ตัวอักษรเนื้อ), status=done`);
console.log(`  provider=${out.provider} model=${out.model}`);
console.log('\n── preview (300 ตัวแรก) ──\n' + out.text.slice(0, 300) + '…');
console.log('\n↻ รีเฟรชหน้า /chapters เพื่อเห็นเนื้อ');
process.exit(0);
