// export-story-md.ts — CLI: ดึง state จาก MongoDB แล้ว gen ground-truth markdown
// (storyline.md / character.md / event.md) ที่ skill `novel-writer-r18` อ่านก่อนเขียนทุกครั้ง
//
// logic การ build อยู่ใน ./story-md.ts (ใช้ร่วมกับ server endpoint POST /api/export-md)
//
// ใช้งาน:
//   bun export-story-md.ts                 # active story → root
//   bun export-story-md.ts --story=2       # เลือกเรื่องที่ 2 (index) / --story=<id> / --story="ชื่อ"
//   bun export-story-md.ts --out=story-src # เปลี่ยน output dir

import { getDb } from './db';
import { pickStory, writeStoryMd, type Story } from './story-md';

const STATE_ID = 'main';
const COLLECTION = 'workspace';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ _id: STATE_ID as any });
  const state = doc?.state as { stories?: Record<string, Story>; activeStoryId?: string } | undefined;
  if (!state?.stories) throw new Error('ไม่พบ state.stories ใน MongoDB');

  const [id, story] = pickStory(state.stories, state.activeStoryId ?? '', arg('story'));
  const outDir = arg('out') ?? '.';
  const written = await writeStoryMd(story, outDir);
  for (const f of written) console.log(`✓ ${outDir}/${f.name} (${f.bytes} chars)`);
  console.log(`\nเรื่อง: "${story.name}" (${id}) → ${outDir}/  [${(story.characters ?? []).length} ตัวละคร, ${(story.chapters ?? []).length} บท]`);
  process.exit(0);
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
