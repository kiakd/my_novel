// insert-chat-rayne.ts — โหลดตัวละครแชท "เรย์น" (ทาสสาวเผ่าหมาป่า + แม่มาเรียน) เข้า chat-state แบบ merge
// รัน: bun insert-chat-rayne.ts   (จากโฟลเดอร์ novel/)
import { getDb } from './db';
import { RAYNE_CHAR } from './seed-chat-rayne';
import { DEFAULT_ITEMS } from '../novel-next/src/lib/chat-rel';

const CHAT_ID = 'chat';
const COLLECTION = 'workspace';

const db = await getDb();
const col = db.collection(COLLECTION);
const doc = await col.findOne({ _id: CHAT_ID as any });
// ฟอร์แมตใหม่: doc 'chat' เก็บเฉพาะ meta (chars+items) — sessions แยกอยู่ collection chat_sessions
const state: any = doc?.state ?? { chars: [], items: DEFAULT_ITEMS };

state.items = state.items?.length ? state.items : DEFAULT_ITEMS;
const exists = (state.chars ?? []).some((c: any) => c.id === RAYNE_CHAR.id);
state.chars = exists
  ? state.chars.map((c: any) => (c.id === RAYNE_CHAR.id ? RAYNE_CHAR : c))
  : [...(state.chars ?? []), RAYNE_CHAR];

await col.updateOne(
  { _id: CHAT_ID as any },
  { $set: { state, updatedAt: new Date() }, $inc: { rev: 1 } },
  { upsert: true },
);

const verify = await col.findOne({ _id: CHAT_ID as any });
console.log(exists ? `↻ updated chat char "${RAYNE_CHAR.id}"` : `+ added chat char "${RAYNE_CHAR.id}"`);
console.log(`  name: ${RAYNE_CHAR.name} | relStart: ${RAYNE_CHAR.relStart} | guard: ${RAYNE_CHAR.guard} | lore: ${RAYNE_CHAR.lore?.length} entries`);
console.log(`  chat chars ทั้งหมด: ${verify?.state?.chars?.length} | items: ${verify?.state?.items?.length}`);
process.exit(0);
