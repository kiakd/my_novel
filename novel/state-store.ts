// state-store.ts — helper สำหรับสคริปต์เขียน state เข้า Mongo "อย่างปลอดภัย"
// ทุกการเขียนต้อง bump rev เสมอ → autosave ของแท็บแอปที่ถือ rev เก่าจะโดน server ปฏิเสธ (409) แทนที่จะทับ
//
// ใช้แทนการ updateOne ตรงๆ ในสคริปต์ gen ทุกตัว:
//   import { patchState, patchStory, readStory } from './state-store'
//   await patchStory(db, STORY_ID, { chapters: story.chapters })

import type { Db } from 'mongodb';

const STATE_ID = 'main';
const COLLECTION = 'workspace';

/** อ่าน state ทั้งก้อน */
export async function readState(db: Db): Promise<any | null> {
  const doc = await db.collection(COLLECTION).findOne({ _id: STATE_ID as any });
  return doc?.state ?? null;
}

/** อ่านเรื่องเดียว */
export async function readStory(db: Db, storyId: string): Promise<any | null> {
  const state = await readState(db);
  return state?.stories?.[storyId] ?? null;
}

/** $set ฟิลด์ใต้ state (dot-path) + bump rev เสมอ — เช่น patchState(db, {'stories.x.chapters': arr}) */
export async function patchState(db: Db, setFields: Record<string, unknown>): Promise<void> {
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(setFields)) $set[`state.${k}`] = v;
  await db.collection(COLLECTION).updateOne(
    { _id: STATE_ID as any },
    { $set, $inc: { rev: 1 } },
    { upsert: true },
  );
}

/** อัปเดตฟิลด์ของเรื่องเดียว + bump rev — เช่น patchStory(db, id, {chapters, characters}) */
export async function patchStory(db: Db, storyId: string, fields: Record<string, unknown>): Promise<void> {
  const setFields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) setFields[`stories.${storyId}.${k}`] = v;
  await patchState(db, setFields);
}
