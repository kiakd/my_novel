// ============ API client ของระบบแชท RP (แยกจาก api.ts ของเนื้อเรื่อง) ============
import type { ChatMeta, ChatMetaWithRev, ChatSession, ChatSessionWithRev, ChatChar, ChatMsg } from './chat-types';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok && res.status !== 409) {
    throw new Error((data as { error?: string })?.error ?? `${url} → ${res.status}`);
  }
  return data as T;
}

/** โหลด chat meta: chars+items (null ถ้ายังไม่มีใน DB) — sessions โหลดแยกผ่าน getChatSessions */
export const getChatState = () => jsonFetch<ChatMetaWithRev | null>('/api/chat-state');

export interface PutChatResult { ok: boolean; rev?: number; conflict?: boolean; currentRev?: number; error?: string }
export const putChatState = (meta: ChatMeta, rev: number) =>
  jsonFetch<PutChatResult>('/api/chat-state', { method: 'PUT', body: JSON.stringify({ ...meta, __rev: rev }) });

// ---- sessions (doc ละอัน — เซฟเฉพาะอันที่เปลี่ยน) ----
export const getChatSessions = () => jsonFetch<ChatSessionWithRev[]>('/api/chat-sessions');
export const putChatSession = (s: ChatSession, rev: number) =>
  jsonFetch<PutChatResult>(`/api/chat-session/${encodeURIComponent(s.id)}`, { method: 'PUT', body: JSON.stringify({ ...s, __rev: rev }) });
export const deleteChatSession = (id: string) =>
  jsonFetch<{ ok: boolean }>(`/api/chat-session/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ---- ส่งข้อความแชท (หลายเทิร์น) ----
export interface ChatReply { ok: boolean; text?: string; error?: string; provider?: string; model?: string }
export const sendChat = (body: {
  char: Partial<ChatChar> & { name: string };
  history: { role: ChatMsg['role']; content: string }[];
  user_input: string;
  rel: number;
  summary?: string;
  mode?: 'char' | 'narrator';
  provider?: string;
  max_tokens?: number;
  temperature?: number;
  prefill?: string;
}) => jsonFetch<ChatReply>('/api/chat', { method: 'POST', body: JSON.stringify(body) });

// ---- สรุปบทสนทนาช่วงเก่า (rolling summary) ผ่าน endpoint generate ทั่วไป ----
const SUMMARY_SYSTEM =
  'คุณคือผู้ช่วยสรุปบทสนทนาโรลเพลย์เป็น "ความทรงจำ" ของตัวละคร ให้ครบและแม่นยำ (กันเรื่องเพี้ยนตอนแชทยาว). ' +
  'เก็บข้อเท็จจริง "รูปธรรม" ให้ครบ: ชื่อคน/สถานที่/สิ่งของ, สิ่งที่แต่ละฝ่ายทำและพูดสำคัญ, สิ่งที่ตกลง/สัญญา/เปลี่ยนแปลง, ' +
  'สถานะล่าสุด (อยู่ที่ไหน ใส่/ถอดชุดอะไร ใครอยู่ในฉาก), พัฒนาการความสัมพันธ์และอารมณ์/ท่าทีล่าสุด, ปมที่ค้างอยู่. ' +
  '⚠️ สำคัญ: ต้องเก็บ "พัฒนาการเนื้อเรื่อง/พล็อต" ด้วยเสมอ — พลัง/ความสามารถที่ได้คืนหรือเสียไป, สิ่งของ/อาวุธ/ภารกิจ/เป้าหมายใหม่, การย้ายเมือง/สถานที่, ตัวละครใหม่ที่เจอ. ' +
  'อย่าเก็บแต่ฉากความสัมพันธ์/ฉากผู้ใหญ่จนลืมพล็อต. ' +
  'ตัดเฉพาะบทพูดน้ำ ๆ ที่ไม่มีสาระทิ้ง. เขียนภาษาไทยเล่าต่อเนื่องมุมบุคคลที่สาม เป็นระเบียบตามลำดับเวลา ~250-320 คำ.';

export const summarizeChat = (body: { prevSummary?: string; transcript: string; charName: string; provider?: string }) =>
  jsonFetch<{ ok: boolean; text?: string; error?: string }>('/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      system: SUMMARY_SYSTEM,
      user:
        `${body.prevSummary ? `[สรุปเดิม]\n${body.prevSummary}\n\n` : ''}` +
        `[บทสนทนาช่วงใหม่ที่ต้องรวมเข้าสรุป — ระหว่างผู้เล่นกับ ${body.charName}]\n${body.transcript}\n\n` +
        `[งาน] รวมสรุปเดิม (ถ้ามี) เข้ากับช่วงใหม่ ให้เป็นบันทึกเดียวที่ต่อเนื่อง กระชับ ไม่ซ้ำซ้อน`,
      provider: body.provider,
      temperature: 0.3,
      max_tokens: 800,
    }),
  });

// ---- ฉากแชท → SD prompt (อังกฤษ) → ComfyUI → รูปประกอบ ----
export const chatSceneImage = (body: {
  char: { name: string; appearance?: string; outfit?: string; description?: string };
  sceneText: string;
  summary?: string;
  sessionId?: string;
  provider?: string;
}) => jsonFetch<{ ok: boolean; url?: string; prompt?: string; negative?: string; error?: string }>(
  '/api/chat/scene-image', { method: 'POST', body: JSON.stringify(body) },
);

// ---- ผู้ตัดสินความสัมพันธ์ (fallback เมื่อโมเดลแชทไม่ใส่แท็ก [[rel:NN]]) ----
const JUDGE_SYSTEM =
  'คุณเป็นผู้ประเมิน "ระดับความสัมพันธ์" ของตัวละครต่อผู้เล่นในเกมโรลเพลย์ สเกล -100..100. ' +
  'พิจารณาข้อความล่าสุดของผู้เล่นและการตอบสนองของตัวละคร เทียบกับนิสัยและสิ่งที่ชอบ/ไม่ชอบ. ' +
  'ขยับจากค่าเดิม "ทีละน้อย" เท่านั้น (ปกติ -8 ถึง +8) ห้ามกระโดด: ถูกใจ/จริงใจ→บวก, หยาบ/ไม่เคารพ/ลามกไม่ดูจังหวะ/บังคับ→ลบ (ติดลบได้), เฉย ๆ→ใกล้ค่าเดิม. ' +
  'ตอบเป็น JSON บรรทัดเดียวเท่านั้น ห้ามมีอย่างอื่น: {"rel": <ตัวเลขใหม่>}';

export async function judgeRel(body: {
  charName: string; mindset?: string; likes?: string; dislikes?: string;
  currentRel: number; userMsg: string; charReply: string; provider?: string;
}): Promise<number | null> {
  const user =
    `ตัวละคร: ${body.charName}\n` +
    `นิสัย: ${body.mindset ?? '-'}\nชอบ: ${body.likes ?? '-'}\nไม่ชอบ: ${body.dislikes ?? '-'}\n` +
    `ระดับความสัมพันธ์เดิม: ${body.currentRel}\n\n` +
    `ผู้เล่นพูด: ${body.userMsg}\nตัวละครตอบ: ${body.charReply}\n\n` +
    `ให้ค่าระดับความสัมพันธ์ใหม่ (ขยับจาก ${body.currentRel} ทีละน้อย) เป็น JSON {"rel": NN}`;
  try {
    const r = await jsonFetch<{ ok: boolean; text?: string }>('/api/generate', {
      method: 'POST',
      body: JSON.stringify({ system: JUDGE_SYSTEM, user, provider: body.provider, temperature: 0.2, max_tokens: 60 }),
    });
    // จับจาก "rel": NN ก่อน — regex เลขลอย ๆ อาจไปจับ "ค่าเดิม" ที่โมเดล (โดยเฉพาะ local) ชอบเล่าแถม
    const t = r.text ?? '';
    const m = t.match(/"?rel"?\s*[:=]\s*(-?\d{1,3})/i)?.[1] ?? t.match(/-?\d{1,3}/)?.[0];
    return m != null ? Math.max(-100, Math.min(100, Number(m))) : null;
  } catch { return null; }
}
