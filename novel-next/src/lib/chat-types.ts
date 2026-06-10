// ============ โมเดลข้อมูลของ "แชท RP" — แยกออกจาก story ทั้งหมด (ไม่ปนกัน) ============
// เก็บใน Mongo เป็น state ก้อนแยก (_id 'chat' ใน workspace) ผ่าน ChatProvider
import type { ColorKey } from './theme';

/** ตัวละครสำหรับแชท RP — โปรไฟล์เหมือนตัวละครเนื้อเรื่อง + ฟิลด์เฉพาะแชท */
export interface ChatChar {
  id: string;
  name: string;
  color?: ColorKey;
  // โปรไฟล์ (สไตล์เดียวกับตัวละครในเนื้อเรื่อง)
  appearance?: string;
  outfit?: string;        // สไตล์การแต่งตัว/ชุดเริ่มต้น
  description?: string;   // bio/ภูมิหลัง
  mindset?: string;       // วิธีคิด/ค่านิยม
  behavior?: string;      // นิสัย/พฤติกรรม
  pronounSelf?: string;
  pronounOther?: string;
  speechTone?: string;
  voiceExamples?: string;
  // เฉพาะแชท RP
  scenario?: string;      // ฉาก/สถานการณ์เริ่มต้น (ผู้เล่นเจอตัวละครที่ไหน อย่างไร)
  greeting?: string;      // ข้อความเปิดของตัวละคร (ทักก่อน)
  likes?: string;         // สิ่งที่ทำให้ "ชอบขึ้น" (หลายบรรทัด) — ป้อนให้โมเดล + โชว์เป็นฮินต์
  dislikes?: string;      // สิ่งที่ทำให้ "ไม่ชอบ/โกรธ/ถอยห่าง"
  guard?: number;         // 0-100 ความหวงตัว/เข้าถึงยาก (สูง = ขยับช้า)
  relStart?: number;      // ความสัมพันธ์เริ่มต้น -100..100 (setup ความสัมพันธ์ไว้แต่แรกได้)
  power?: string;         // อำนาจพิเศษของผู้เล่นที่ "บังคับร่างกายได้ไร้เงื่อนไข ข้ามความสัมพันธ์" (เช่น ตราทาส/พรจากพระเจ้า) — ใจยังเพิ่ม/ลดตามจริง
}

export interface ChatMsg {
  role: 'user' | 'char' | 'narrator';   // narrator = บทบรรยาย/ผู้เล่าเรื่อง (ฉาก/บุคคลที่ 3/NPC)
  text: string;
  ts?: number;
  item?: boolean;         // ข้อความนี้เกิดจากการใช้ไอเท็ม (โชว์ต่างสไตล์)
  secret?: boolean;       // (narrator) ตัวละครหลัก "ไม่รับรู้" เหตุการณ์นี้ → ตัดออกจาก context ตอนแชท
  power?: boolean;        // (user) ข้อความนี้ "ใช้อำนาจ" บังคับร่างกายตัวละคร
  image?: string;         // url รูปประกอบฉาก (เจนจาก ComfyUI)
}

/** ไอเท็ม/ของโกง — ปรับความสัมพันธ์โดยตรง (ข้ามการพัฒนาปกติ) */
export interface ChatItem {
  id: string;
  name: string;
  emoji?: string;
  kind: 'boost' | 'set' | 'reset';  // boost=บวก/ลบค่า, set=ตั้งค่าเป้าหมาย, reset=ล้างกลับ relStart
  amount?: number;        // boost: ส่วนต่าง (+/-) · set: ค่าเป้าหมาย -100..100
  note?: string;          // คำบรรยายผล (ป้อนให้โมเดลรับรู้)
}

export interface ChatSession {
  id: string;
  charId: string;         // อ้างกลับ template (สำหรับจัดกลุ่ม) — 1 ตัวละครมีได้หลายแชท
  char?: ChatChar;        // snapshot ข้อมูลตัวละคร ณ ตอนเริ่มแชท (เอกเทศ — แก้ template ภายหลังไม่กระทบแชทเก่า)
  title?: string;
  messages: ChatMsg[];
  rel: number;            // -100..100 ความสัมพันธ์ปัจจุบัน
  summary?: string;       // rolling summary ของข้อความช่วงเก่า (กัน context ล้น/ลืมเรื่อง)
  summarizedCount?: number; // จำนวนข้อความ (ไม่นับไอเท็ม) ที่ถูกรวมเข้า summary แล้ว
  secretSummary?: string;        // rolling summary ของ "ฉากลับ" (narrator+secret) — ฉีดเฉพาะโหมดผู้เล่าเรื่อง ตัวละครหลักไม่เห็น
  secretSummarizedCount?: number; // จำนวนฉากลับที่ถูกรวมเข้า secretSummary แล้ว
  createdAt?: number;
  updatedAt?: number;
}

/** state ก้อนแยกของระบบแชท (คนละ document กับ stories) */
export interface ChatState {
  chars: ChatChar[];
  items: ChatItem[];      // คลังไอเท็ม/ของโกง (ใช้ร่วมทุกตัวละคร)
  sessions: ChatSession[];
}

/** ส่วน meta (chars+items) — เก็บใน doc 'chat'; ส่วน sessions แยกเก็บ doc ละอันใน chat_sessions */
export type ChatMeta = Pick<ChatState, 'chars' | 'items'>;
export type ChatMetaWithRev = ChatMeta & { __rev: number };
export type ChatSessionWithRev = ChatSession & { __rev: number };
