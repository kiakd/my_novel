// insert-mindcontrol.ts — แทรกเรื่องทดสอบ "คำสั่งในใจ" (พลังควบคุมจิต ซีล×อีฟ) เข้า Mongo
// ใช้ข้อมูลเดียวกับ fixture ที่ verify pipeline แล้ว (novel-next/src/lib/seed-mindcontrol.ts) — ไม่ duplicate
// รัน: bun insert-mindcontrol.ts   (จากโฟลเดอร์ novel/ — Bun auto-load .env)
import { getDb } from './db';
import { readStory, patchState } from './state-store';
import { MIND_STORY, MIND_STORY_ID } from '../novel-next/src/lib/seed-mindcontrol';

const STORY_ID = MIND_STORY_ID;
const story: any = { ...MIND_STORY };

// ---- เขียนเข้า Mongo ----
const db = await getDb();
const existing = await readStory(db, STORY_ID);
// merge: ถ้าบทเดิมมีเนื้อ (content) ที่เจนไว้แล้ว ให้คงไว้ ไม่ถูก reset ตอน re-run
let preserved = 0;
if (existing?.chapters?.length) {
  const byId = new Map<string, any>(existing.chapters.map((c: any) => [c.id, c]));
  story.chapters = (story.chapters ?? []).map((c: any) => {
    const old = byId.get(c.id);
    if (old?.content) { preserved++; return { ...c, content: old.content, status: old.status ?? c.status }; }
    return c;
  });
}
await patchState(db, { [`stories.${STORY_ID}`]: story, activeStoryId: STORY_ID });
const verify = await readStory(db, STORY_ID);

console.log(existing ? `↻ updated existing story "${STORY_ID}" (คงเนื้อบทที่เจนไว้ ${preserved} บท)` : `+ created new story "${STORY_ID}"`);
console.log(`  name: ${verify?.name}`);
console.log(`  characters: ${verify?.characters?.length}  chapters: ${verify?.chapters?.length}  timeline: ${verify?.timeline?.length}  locations: ${verify?.locations?.length}  relations: ${verify?.relations?.length}`);
console.log(`  activeStoryId → ${STORY_ID}`);
process.exit(0);
