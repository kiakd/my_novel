// insert-novel-rayne.ts — แทรกเรื่อง "เขี้ยวใต้ปลอกคอ" (ดยุค × ทาสสาวหมาป่า) เข้า Mongo
// canon ร่วมกับตัวละครแชท seed-chat-rayne.ts — รัน: bun insert-novel-rayne.ts (จากโฟลเดอร์ novel/)
import { getDb } from './db';
import { readStory, patchState } from './state-store';
import { RAYNE_STORY, RAYNE_STORY_ID } from './seed-novel-rayne';

const STORY_ID = RAYNE_STORY_ID;
const story: any = { ...RAYNE_STORY };

const db = await getDb();
const existing = await readStory(db, STORY_ID);
// merge: ถ้าบทเดิมมีเนื้อ (content) ที่เจนไว้แล้ว ให้คงไว้ ไม่ถูก reset ตอน re-run
let preserved = 0;
if (existing?.chapters?.length) {
  const byId = new Map<string, any>(existing.chapters.map((c: any) => [c.id, c]));
  story.chapters = (story.chapters ?? []).map((c: any) => {
    const old = byId.get(c.id);
    if (old?.content && old.content.length > (c.content?.length ?? 0)) {
      preserved++;
      return { ...c, content: old.content, status: old.status ?? c.status };
    }
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
