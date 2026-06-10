// insert-chat-elf.ts — โหลดตัวละครแชท "ออเรเลีย" เข้า chat-state (_id 'chat') แบบ merge
// รัน: bun insert-chat-elf.ts   (จากโฟลเดอร์ novel/)
import { getDb } from './db';
import { ELF_CHAR } from './seed-chat-elf';
import { DEFAULT_ITEMS } from '../novel-next/src/lib/chat-rel';

const CHAT_ID = 'chat';
const COLLECTION = 'workspace';

const db = await getDb();
const col = db.collection(COLLECTION);
const doc = await col.findOne({ _id: CHAT_ID as any });
// ฟอร์แมตใหม่: doc 'chat' เก็บเฉพาะ meta (chars+items) — sessions แยกอยู่ collection chat_sessions
const state: any = doc?.state ?? { chars: [], items: DEFAULT_ITEMS };

// คงไอเท็มเดิม (เติม default ถ้ายังไม่มี)
state.items = state.items?.length ? state.items : DEFAULT_ITEMS;
// merge ตัวละคร: แทนที่ถ้ามี id เดิม ไม่งั้น push
const exists = (state.chars ?? []).some((c: any) => c.id === ELF_CHAR.id);
state.chars = exists
  ? state.chars.map((c: any) => (c.id === ELF_CHAR.id ? ELF_CHAR : c))
  : [...(state.chars ?? []), ELF_CHAR];

await col.updateOne(
  { _id: CHAT_ID as any },
  { $set: { state, updatedAt: new Date() }, $inc: { rev: 1 } },
  { upsert: true },
);

const verify = await col.findOne({ _id: CHAT_ID as any });
console.log(exists ? `↻ updated chat char "${ELF_CHAR.id}"` : `+ added chat char "${ELF_CHAR.id}"`);
console.log(`  name: ${ELF_CHAR.name} | rel เริ่มต้น: ${ELF_CHAR.relStart} | guard: ${ELF_CHAR.guard}`);
console.log(`  chat chars ทั้งหมด: ${verify?.state?.chars?.length} | items: ${verify?.state?.items?.length}`);
process.exit(0);
