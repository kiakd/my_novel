// ============ API client ของระบบแชท RP (แยกจาก api.ts ของเนื้อเรื่อง) ============
import type { ChatMeta, ChatMetaWithRev, ChatSession, ChatSessionWithRev, ChatChar, ChatMsg, ChatStateCard, ChatMemFact, PlayerPersona } from './chat-types';
import type { LiveState } from './live-state';

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
export interface ChatReply {
  ok: boolean; text?: string; error?: string; provider?: string; model?: string;
  stateCard?: LiveState;      // live state ที่ backend apply delta แล้ว (เมื่อส่ง stateCard มาในคำขอ)
  stateDelta?: unknown;       // delta ที่พาร์สได้ (ดีบั๊ก)
  stateWarnings?: string[];   // คำเตือนความขัดแย้ง deterministic (ว่าง = ไม่มีปัญหา)
}
export const sendChat = (body: {
  char: Partial<ChatChar> & { name: string };
  history: { role: ChatMsg['role']; content: string }[];
  user_input: string;
  rel: number;
  summary?: string;
  lore?: string[];
  state?: string;        // บัตรสถานะปัจจุบัน (ข้อความ format แล้ว) — ฉีดใกล้ท้าย system prompt
  stateCard?: LiveState;  // structured live state — backend ส่งกลับ delta + warnings (ไม่ส่ง = พฤติกรรมเดิม)
  playerPersona?: { name?: string; role?: string; appearance?: string };  // บทบาทของผู้เล่นในแชทนี้
  mode?: 'char' | 'narrator';
  recalled?: string[];   // ความทรงจำที่ recall มา — ฉีดเข้า prompt
  provider?: string;
  max_tokens?: number;
  temperature?: number;
  prefill?: string;
}) => jsonFetch<ChatReply>('/api/chat', { method: 'POST', body: JSON.stringify(body) });

// ---- RAG memory (ฝั่ง client เรียก server-side sqlite store) ----
export interface MemRowInput {
  id: string; scopeId: string; charId?: string | null; secret: boolean;
  speaker: string; turnIdx: number; ts: number; text: string;
}
// resp ของ ingest/backfill — มี embedConfigured/embedError เพื่อเตือน client ว่า embedding ใช้งานได้ไหม
export interface MemWriteResult { ok: boolean; count?: number; embedded?: boolean; embedConfigured?: boolean; embedError?: string; error?: string }
export const memBackfill = (scopeId: string, rows: MemRowInput[]) =>
  jsonFetch<MemWriteResult>(
    '/api/chat/memory/backfill', { method: 'POST', body: JSON.stringify({ scopeId, kind: 'chat', rows }) });

export const memIngest = (scopeId: string, rows: MemRowInput[]) =>
  jsonFetch<MemWriteResult>(
    '/api/chat/memory/ingest', { method: 'POST', body: JSON.stringify({ scopeId, kind: 'chat', rows }) });

export const memRecall = (body: { scopeId: string; query: string; activeChar: string; mode?: 'char' | 'narrator'; excludeFromIdx: number; k?: number }) =>
  jsonFetch<{ ok: boolean; memories: string[]; error?: string }>(
    '/api/chat/memory/recall', { method: 'POST', body: JSON.stringify(body) });

// ลบ row ความจำ: ส่ง ids[] เพื่อลบเฉพาะ turn (regen) · ส่ง scopeId เพื่อล้างทั้ง session
export const memDelete = (body: { scopeId?: string; ids?: string[] }) =>
  jsonFetch<{ ok: boolean; error?: string }>(
    '/api/chat/memory/delete', { method: 'POST', body: JSON.stringify(body) });

// สถานะระบบความจำ (embedding ตั้งไว้ไหม/จำนวน row/ฯลฯ)
export const memStatus = () =>
  jsonFetch<{ ok: boolean; mode?: string; embeddingConfigured?: boolean; embedModel?: string; embedDim?: number; rows?: number; embeddedRows?: number; scopes?: number; embedError?: string }>(
    '/api/chat/memory/status');

// ---- AI สร้าง "บทบาทผู้เล่น" ที่เข้ากับฉากของตัวละคร (auto-fill) ----
export const generatePlayerPersona = (body: {
  char: { name: string; appearance?: string; description?: string; scenario?: string };
  provider?: string;
}) => jsonFetch<{ ok: boolean; persona?: { name: string; role: string; appearance: string }; error?: string }>(
  '/api/chat/generate-persona', { method: 'POST', body: JSON.stringify(body) },
);

// ---- AI เติม/เจนฟิลด์ตัวละคร (autofill) — ส่ง char ที่กรอกไว้ + บรีฟ → เจนฟิลด์ที่ขาด/ที่ขอ ----
// fields ว่าง = เติมทุกช่องที่ยังว่าง · ส่ง fields=[ช่องเดียว] = เจน/เจนทับเฉพาะช่องนั้น
export const generateCharFields = (body: {
  char: Record<string, unknown>;
  brief?: string;
  fields?: string[];
  provider?: string;
}) => jsonFetch<{ ok: boolean; generated?: Record<string, string>; error?: string }>(
  '/api/chat/characters/generate-fields', { method: 'POST', body: JSON.stringify(body) },
);

// ---- AI แปลฟิลด์ตัวละครเป็นไทย (เอาการ์ดอังกฤษมาเล่นเป็นไทย) — คงความหมาย/โทน ----
// keepNames=true (default ฝั่ง server) คงชื่อเดิม · false = ทับศัพท์ชื่อเป็นไทยด้วย
export const translateCharFields = (body: {
  char: Record<string, unknown>;
  keepNames?: boolean;
  provider?: string;
}) => jsonFetch<{ ok: boolean; translated?: Record<string, string>; error?: string }>(
  '/api/chat/characters/translate', { method: 'POST', body: JSON.stringify(body) },
);

// ---- สรุปบทสนทนาช่วงเก่า (rolling summary) ผ่าน endpoint generate ทั่วไป ----
const SUMMARY_SYSTEM =
  'คุณคือผู้ช่วยสรุปบทสนทนาโรลเพลย์เป็น "ความทรงจำ" ของตัวละคร ให้ครบและแม่นยำ (กันเรื่องเพี้ยนตอนแชทยาว). ' +
  'เก็บข้อเท็จจริง "รูปธรรม" ให้ครบ: ชื่อคน/สถานที่/สิ่งของ, สิ่งที่แต่ละฝ่ายทำและพูดสำคัญ, สิ่งที่ตกลง/สัญญา/เปลี่ยนแปลง, ' +
  'สถานะล่าสุด (อยู่ที่ไหน ใส่/ถอดชุดอะไร ใครอยู่ในฉาก), พัฒนาการความสัมพันธ์และอารมณ์/ท่าทีล่าสุด, ปมที่ค้างอยู่. ' +
  '⚠️ สำคัญ: ต้องเก็บ "พัฒนาการเนื้อเรื่อง/พล็อต" ด้วยเสมอ — พลัง/ความสามารถที่ได้คืนหรือเสียไป, สิ่งของ/อาวุธ/ภารกิจ/เป้าหมายใหม่, การย้ายเมือง/สถานที่, ตัวละครใหม่ที่เจอ. ' +
  'อย่าเก็บแต่ฉากความสัมพันธ์/ฉากผู้ใหญ่จนลืมพล็อต. ' +
  '⚠️ ห้ามเดา/แต่งเติมข้อเท็จจริงที่ไม่ได้ระบุในบทสนทนาหรือสรุปเดิมเด็ดขาด — โดยเฉพาะ "เพศ รูปลักษณ์ และชื่อของร่างปลอมตัว" (อย่าอนุมานเพศจากชื่อ) ถ้าไม่แน่ใจให้คงถ้อยคำตามต้นฉบับ. ' +
  'ตัดเฉพาะบทพูดน้ำ ๆ ที่ไม่มีสาระทิ้ง. เขียนภาษาไทยเล่าต่อเนื่องมุมบุคคลที่สาม เป็นระเบียบตามลำดับเวลา. ' +
  '⚠️ HARD CAP: สรุปรวมทั้งก้อน "ห้ามเกิน ~1,200 ตัวอักษร" — ถ้าจะเกิน ให้บีบ/รวบเหตุการณ์เก่าที่สำคัญน้อยลงให้สั้นลง คงเฉพาะแก่นที่ยังมีผลต่อปัจจุบัน ห้ามให้สรุปยาวขึ้นเรื่อย ๆ ทุกครั้งที่พับ. ' +
  '⚠️ ห้ามเติม/แต่ง/มโน รายละเอียดที่ไม่ปรากฏในบทจริง (ชื่อของ/อาหาร/สถานที่/ชื่อสัตว์เลี้ยง/ที่มาของสิ่งของ) — สรุปเฉพาะที่เกิดขึ้นจริงในบทเท่านั้น. ' +
  'ปิดท้ายด้วยย่อหน้า "สถานะปัจจุบัน:" ระบุชัด: อยู่ที่ไหน, กำลังทำอะไร, การปลอมตัวตอนนี้ (ชื่อปลอม เพศและรูปลักษณ์ของร่างปลอม หรือ "ร่างจริง"), ใครบ้างที่รู้ตัวจริง, ชุด/ของสำคัญที่มี.';

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

// ---- สกัด "บัตรสถานะ" + ความจำแยกหมวด จากช่วงบทสนทนาที่เพิ่งถูกพับเข้า summary (Phase 3 anti-drift) ----
const STATE_SYSTEM =
  'คุณคือผู้ช่วยสกัด "บัตรสถานะปัจจุบัน" ของตัวละครจากบทสนทนาโรลเพลย์ ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น:\n' +
  '{"time":"วัน/เดือน + เวลานาฬิกา (ระบบ 12 เดือน/24 ชม. เช่น \'เดือน3 วันที่5 เวลา 07:30 (เช้า)\') — เลื่อนไปข้างหน้าตามเวลาที่ผ่านในบท ถ้าบทไม่ระบุชัดให้ประเมินจากแสง/กิจกรรม","location":"อยู่ที่ไหนตอนนี้","disguise":"ตัวตน/ร่างตอนนี้ (ถ้าปลอมตัว: ชื่อปลอม เพศ รูปลักษณ์ของร่างปลอม | ถ้าไม่: ร่างจริง)","whoKnowsTruth":"ใครรู้ตัวจริงบ้าง","outfit":"ชุดที่ใส่ตอนนี้","inventory":"ของสำคัญที่มี","goals":"กำลังทำ/ตามล่าอะไร",' +
  '"facts":[{"kind":"relationship|event|fact|emotion","text":"ข้อเท็จจริงสำคัญ 1 ประโยค"}]}\n' +
  'กฎ: เริ่มจาก "บัตรเดิม" แล้วอัปเดตเฉพาะที่บทสนทนาช่วงใหม่เปลี่ยนจริง · ห้ามเดา/แต่งเติมเด็ดขาด (โดยเฉพาะเพศ/รูปลักษณ์ของร่างปลอม — ห้ามอนุมานจากชื่อ) · ' +
  'field ไหนไม่มีข้อมูลใหม่ให้คงค่าจากบัตรเดิม · facts เอาเฉพาะเรื่องสำคัญที่ควรจำระยะยาว 0-5 ข้อ · ' +
  'time ต้อง "เลื่อนไปข้างหน้า" ตามเวลาที่ผ่านในบทเสมอ (เช้า→บ่าย→ค่ำ→ดึก, ข้ามวัน/เดือนได้ถ้าบทข้ามเวลา) ห้ามถอยหลังเว้นแต่เป็นฉากย้อนอดีตชัดเจน · ' +
  'ชื่อเฉพาะที่ตั้งแล้ว (NPC/สัตว์เลี้ยง/สถานที่/ของสำคัญ) และที่มาของมัน ห้ามเปลี่ยน/แต่งใหม่ — ยึดตามที่เคยระบุในบัตรเดิม/บทก่อนเสมอ (กัน retcon ชื่อ/ที่มา)';

export interface ExtractedState { card: ChatStateCard; facts: Omit<ChatMemFact, 'ts'>[] }
export async function extractState(body: {
  prevCard?: ChatStateCard; transcript: string; charName: string; provider?: string;
}): Promise<ExtractedState | null> {
  try {
    const r = await jsonFetch<{ ok: boolean; text?: string }>('/api/generate', {
      method: 'POST',
      body: JSON.stringify({
        system: STATE_SYSTEM,
        user:
          `[ตัวละครหลัก: ${body.charName}]\n` +
          `[บัตรเดิม]\n${JSON.stringify(body.prevCard ?? {})}\n\n` +
          `[บทสนทนาช่วงใหม่]\n${body.transcript}\n\n[งาน] อัปเดตบัตรสถานะเป็น JSON`,
        provider: body.provider,
        temperature: 0.2,
        max_tokens: 600,
      }),
    });
    const m = r.text?.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    const pick = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const card: ChatStateCard = {
      time: pick(j.time),
      location: pick(j.location), disguise: pick(j.disguise), whoKnowsTruth: pick(j.whoKnowsTruth),
      outfit: pick(j.outfit), inventory: pick(j.inventory), goals: pick(j.goals),
    };
    const KINDS = ['relationship', 'event', 'fact', 'emotion'];
    const facts = (Array.isArray(j.facts) ? j.facts : [])
      .filter((f: any) => typeof f?.text === 'string' && f.text.trim())
      .map((f: any) => ({ kind: (KINDS.includes(f.kind) ? f.kind : 'fact') as ChatMemFact['kind'], text: f.text.trim() }));
    return { card, facts };
  } catch { return null; }
}

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
  'หน้าที่: ดูเหตุการณ์ในเทิร์นล่าสุด (ผู้เล่นทำอะไร + ตัวละครรู้สึก/ตอบสนองยังไง) แล้วให้ค่าใหม่ที่ "สะท้อนน้ำหนักของเหตุการณ์จริง" — ไม่ใช่ขยับเท่ากันทุกครั้ง. ' +
  '⚠️ หัวใจสำคัญ: ตัดสิน "ผ่านแว่นนิสัย + สิ่งที่ชอบ/ไม่ชอบของตัวละครตัวนี้" เสมอ — การกระทำเดียวกันให้ค่าต่างกันได้ตามตัวละคร. ' +
  'เช่น จีบตรง ๆ/แตะตัว = บวกมากกับคนเปิดเผยขี้เล่น แต่ = ลบกับคนเย็นชา/ถือตัว/เกลียดความทะลึ่ง · พูดห้วน ๆ = ลบกับคนอ่อนไหว แต่เฉย ๆ กับคนชอบตรงไปตรงมา. ' +
  'ก่อนให้ค่า ถามตัวเองว่า "ด้วยนิสัยและสิ่งที่ชอบ/ไม่ชอบของเขา เขารู้สึกยังไงกับสิ่งนี้จริง ๆ" แล้วค่อยจัดหมวด. ' +
  'ขนาดการขยับ (เป็นฐาน — ปรับตามว่าเหตุการณ์ "โดน" นิสัย/ความชอบของเขาแค่ไหน): ' +
  'คุยเล่น/ทั่วไป/ไม่มีอะไรพิเศษ → ±0–4 · ' +
  'ถูกใจ/อบอุ่น/ตรงจริตเขา → +5–12 · ' +
  'โมเมนต์สำคัญจริงสำหรับเขา (ปกป้อง เสียสละ ซื่อสัตย์ในจุดเป็นตาย ใกล้ชิดลึกซึ้งที่ยินยอมเต็มใจ คำสัญญาที่มีความหมาย ตรงสิ่งที่เขาโหยหา) → +13–30 · ' +
  'ขัดใจ/หยาบ/ไม่เคารพ/แตะเรื่องที่เขาไม่ชอบ → -5–12 · ' +
  'ทรยศ ทำร้าย หักหลัง บังคับ/ละเมิดที่ไม่ยินยอม ดูถูกศักดิ์ศรี/เหยียบจุดที่เขาแคร์ที่สุด → -20–45 (ดิ่งแรงได้) · ' +
  'เฉย ๆ/ไม่ชัด → ใกล้ค่าเดิม. ' +
  'หลักสำคัญ: ถ้าเหตุการณ์ "โดนใจเขามาก" ขึ้นเร็วได้ ไม่ต้องฝืนช้า — แต่ห้ามขยับโดยไม่มีเหตุในบท. ' +
  'คนเย็นชา/ขี้ระแวง/guard สูง ขยับบวกยากกว่าและไวต่อด้านลบ · คนใจง่าย/ขี้เหงา ขยับบวกไวกว่า. ' +
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
    `ให้ค่าระดับความสัมพันธ์ใหม่ (ขยับจาก ${body.currentRel} ตามน้ำหนักเหตุการณ์ในเทิร์นนี้) เป็น JSON {"rel": NN}`;
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
