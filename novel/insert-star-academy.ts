// insert-star-academy.ts — ฉีดเรื่อง "ทะลุมิติพันปี: เพลงแห่งดวงดารา" (star-academy) เข้า Mongo
// อ่าน prose ตอน 1–7 จาก ../story/star-academy/ep00N.md + canon จาก ./star-academy-meta.json
// รัน: bun insert-star-academy.ts (จากโฟลเดอร์ novel/)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db';
import { readStory, patchState } from './state-store';

const STORY_ID = 'star-academy';
const __dir = dirname(fileURLToPath(import.meta.url));
const STORY_DIR = join(__dir, '..', 'story', 'star-academy');

const meta = JSON.parse(readFileSync(join(__dir, 'star-academy-meta.json'), 'utf8'));

// --- อ่าน ep001–007 → chapters (แยกชื่อตอนจาก heading บรรทัดแรก) ---
const EP_COUNT = 9;
const chapters = Array.from({ length: EP_COUNT }, (_, i) => {
  const n = i + 1;
  const raw = readFileSync(join(STORY_DIR, `ep00${n}.md`), 'utf8');
  const lines = raw.split('\n');
  // heading: "# «ชื่อเรื่อง» — ตอนที่ N — TITLE" → เอา TITLE (ส่วนหลัง "—" สุดท้าย)
  const head = (lines[0] || '').replace(/^#\s*/, '');
  const parts = head.split('—').map((s) => s.trim()).filter(Boolean);
  const title = parts.length ? parts[parts.length - 1] : `ตอนที่ ${n}`;
  const content = lines.slice(1).join('\n').trim();
  return { id: `sa${n}`, title, order: i, status: 'done', content };
});

// --- timeline: 1 เหตุการณ์/ตอน ผูกกับ chapter ---
const TL_COLORS = ['sun', 'lilac', 'mint', 'rose', 'slate', 'grape', 'coral'];
const timeline = chapters.map((c, i) => ({
  id: `sat${i + 1}`,
  time: `ตอนที่ ${i + 1}`,
  order: i,
  label: c.title,
  description: (c.content.slice(0, 90).replace(/\s+/g, ' ')) + '…',
  chapterId: c.id,
  color: TL_COLORS[i % TL_COLORS.length],
  importance: i === 0 ? 'pivotal' : 'major',
}));

// --- nodePos: จัด grid ให้กราฟ relations แสดงผลได้ ---
const nodePos: Record<string, { x: number; y: number }> = {};
meta.characters.forEach((ch: any, i: number) => {
  nodePos[ch.id] = { x: 180 + (i % 4) * 230, y: 140 + Math.floor(i / 4) * 200 };
});

const story: any = { ...meta, chapters, timeline, nodePos };

const db = await getDb();
const existing = await readStory(db, STORY_ID);
// preserve: ถ้า re-run และบทเดิมในแอปยาวกว่า (เคยแก้มือ) ให้คงไว้ ไม่ทับด้วย prose จากไฟล์
let preserved = 0;
if (existing?.chapters?.length) {
  const byId = new Map<string, any>(existing.chapters.map((c: any) => [c.id, c]));
  story.chapters = story.chapters.map((c: any) => {
    const old = byId.get(c.id);
    if (old?.content && old.content.length > (c.content?.length ?? 0)) { preserved++; return { ...c, content: old.content }; }
    return c;
  });
}

await patchState(db, { [`stories.${STORY_ID}`]: story, activeStoryId: STORY_ID });
const verify = await readStory(db, STORY_ID);

console.log(existing ? `↻ updated existing "${STORY_ID}" (คงบทที่ยาวกว่าในแอป ${preserved} บท)` : `+ created new story "${STORY_ID}"`);
console.log(`  name: ${verify?.name}`);
console.log(`  characters: ${verify?.characters?.length}  chapters: ${verify?.chapters?.length}  timeline: ${verify?.timeline?.length}  locations: ${verify?.locations?.length}  relations: ${verify?.relations?.length}`);
verify?.chapters?.forEach((c: any) => console.log(`   ${c.id} "${c.title}" — ${(c.content?.length ?? 0).toLocaleString()} chars [${c.status}]`));
console.log(`  activeStoryId → ${STORY_ID}`);
process.exit(0);
