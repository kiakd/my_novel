// rebuild-chat-summary.ts — สร้าง "ความจำ/สรุป" ของแชทใหม่จากต้นฉบับทั้งหมด (hierarchical)
// แก้ปัญหา summary เสื่อมจากการสรุปซ้ำหลายรอบ — สรุปแต่ละข้อความครั้งเดียว แล้วรวม
// ใช้: bun rebuild-chat-summary.ts            (session ล่าสุด)
//      bun rebuild-chat-summary.ts <sessionId>
import { getDb } from './db';

const API = process.env.LOG_API ?? 'http://localhost:3000';
const COLLECTION = 'workspace';
const CHUNK = 40;        // ข้อความต่อช่วง
const RAW_KEEP = 16;     // เก็บดิบล่าสุดไว้ (ไม่รวมเข้า summary)

const argId = process.argv[2];

async function gen(system: string, user: string): Promise<string> {
  const r = await fetch(`${API}/api/generate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, user, temperature: 0.3, max_tokens: 1200 }),
  }).then((x) => x.json());
  return (r.text || '').trim();
}

const CHUNK_SYS =
  'สรุป "ช่วงหนึ่ง" ของนิยายโรลเพลย์อย่างละเอียดและแม่นยำ เพื่อเป็นความทรงจำของตัวละคร. ' +
  'เก็บข้อเท็จจริงรูปธรรมให้ครบ: เหตุการณ์/พล็อตสำคัญ, พลัง/ความสามารถที่ได้คืนหรือเสียไป, สิ่งของ/อาวุธ/ภารกิจ, สถานที่ที่ไป, ตัวละคร/NPC ที่เจอ, พัฒนาการความสัมพันธ์, และสถานะล่าสุดของช่วงนี้. ' +
  'อย่าเก็บแต่ฉากผู้ใหญ่จนลืมพล็อต. เขียนไทยมุมบุคคลที่สาม เรียงตามเวลา ~200-250 คำ.';

const FINAL_SYS =
  'รวม "สรุปแต่ละช่วง" ต่อไปนี้ให้เป็นบันทึกความทรงจำเดียวที่ต่อเนื่อง ครบถ้วน เรียงตามเวลา เก็บข้อเท็จจริงสำคัญทั้งหมด (พล็อต/พลัง/ของ/สถานที่/ตัวละคร/ความสัมพันธ์) ไม่ตัดทิ้ง. ' +
  'ปิดท้ายด้วยย่อหน้าหัวข้อ "สถานะปัจจุบัน:" ที่ระบุชัดว่า ตอนนี้อยู่ที่ไหน, มีพลัง/ความสามารถ/ของอะไร, กำลังทำ/ตามล่าอะไร, และความสัมพันธ์อยู่ระดับไหน. ' +
  'เขียนไทยมุมบุคคลที่สาม ~500-700 คำ.';

const db = await getDb();
const sessCol = db.collection('chat_sessions');
const docs = await sessCol.find({}).toArray();

let sess: any = null;
let sessDoc: any = null;     // doc ใน chat_sessions (ฟอร์แมตใหม่ — doc ละ session)
let legacyState: any = null; // ฟอร์แมตเก่า (sessions ปนใน doc 'chat') เผื่อยังไม่ migrate
if (docs.length) {
  docs.sort((a: any, b: any) => (b.session?.updatedAt || 0) - (a.session?.updatedAt || 0));
  sessDoc = argId ? docs.find((d: any) => d.session?.id === argId) : docs[0];
  sess = sessDoc?.session;
} else {
  const doc = await db.collection(COLLECTION).findOne({ _id: 'chat' as any });
  legacyState = doc?.state;
  const list: any[] = legacyState?.sessions ?? [];
  if (!list.length) { console.log('ไม่มี session'); process.exit(0); }
  const sorted = [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  sess = argId ? list.find((s) => s.id === argId) : sorted[0];
}
if (!sess) { console.log('ไม่เจอ session', argId ?? ''); process.exit(0); }

const charName = sess.char?.name || 'ตัวละคร';
const conv = (sess.messages || []).filter((m: any) => !m.item && !(m.role === 'narrator' && m.secret));
const toFold = conv.slice(0, Math.max(0, conv.length - RAW_KEEP));
console.log(`session ${sess.id} · ${charName} · conv ${conv.length} · จะสรุป ${toFold.length} (เหลือดิบ ${conv.length - toFold.length})`);

const speaker = (m: any) => (m.role === 'user' ? 'ผู้เล่น' : m.role === 'narrator' ? '[ผู้เล่าเรื่อง]' : charName);

// 1) สรุปทีละช่วง
const sections: string[] = [];
for (let i = 0; i < toFold.length; i += CHUNK) {
  const part = toFold.slice(i, i + CHUNK);
  const transcript = part.map((m: any) => `${speaker(m)}: ${m.text}`).join('\n');
  process.stdout.write(`  สรุปช่วง ${Math.floor(i / CHUNK) + 1}/${Math.ceil(toFold.length / CHUNK)} … `);
  const s = await gen(CHUNK_SYS, `[ตัวละครหลัก: ${charName}]\n${transcript}`);
  sections.push(s);
  console.log(`${s.length} ตัวอักษร`);
}

// 2) รวมเป็นความจำเดียว
console.log('  รวมเป็นความจำเดียว …');
const final = await gen(FINAL_SYS, `[ตัวละครหลัก: ${charName}]\nสรุปแต่ละช่วงตามลำดับเวลา:\n\n` + sections.map((s, i) => `[ช่วง ${i + 1}]\n${s}`).join('\n\n'));

// 3) เขียนกลับ — เช็ค rev กันชนกับเว็บที่เปิดอยู่ (optimistic concurrency เหมือนฝั่ง server)
sess.summary = final;
sess.summarizedCount = toFold.length;
if (sessDoc) {
  const r = await sessCol.updateOne(
    { _id: sessDoc._id, rev: sessDoc.rev },
    { $set: { session: sess, updatedAt: new Date() }, $inc: { rev: 1 } },
  );
  if (r.matchedCount === 0) {
    console.error('❌ session ถูกแก้ระหว่างรัน (เว็บเปิดค้างอยู่?) — ไม่เขียนทับ ปิด/พักหน้าเว็บแล้วรันใหม่');
    process.exit(1);
  }
} else {
  await db.collection(COLLECTION).updateOne({ _id: 'chat' as any }, { $set: { state: legacyState, updatedAt: new Date() }, $inc: { rev: 1 } });
}

console.log(`\n✅ สรุปใหม่ ${final.length} ตัวอักษร · summarizedCount=${toFold.length} · เขียนกลับแล้ว`);
console.log('\n--- ตัวอย่างท้ายสรุป (สถานะปัจจุบัน) ---\n' + final.slice(-600));
process.exit(0);
