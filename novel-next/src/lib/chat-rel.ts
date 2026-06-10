// ============ ตรรกะความสัมพันธ์ + ไอเท็ม (pure) ============
import type { ColorKey } from './theme';
import type { ChatItem, ChatState } from './chat-types';

export const REL_MIN = -100;
export const REL_MAX = 100;
export const clampRel = (n: number) => Math.max(REL_MIN, Math.min(REL_MAX, Math.round(n)));

// ระดับ "ผูกพันสุดหัวใจ" — ถึงจุดนี้ตัวละครยอมเล่นด้วยทุกอย่าง และความสัมพันธ์จะไม่ลดต่ำกว่านี้อีก (จากบทสนทนา)
export const DEVOTED = 90;
export const isDevoted = (rel: number) => rel >= DEVOTED;
/** กันความสัมพันธ์ลดจากบทสนทนา: ถ้าเคยถึง devoted แล้ว ห้ามต่ำกว่า DEVOTED */
export const floorRel = (prev: number, next: number) => (prev >= DEVOTED ? Math.max(next, DEVOTED) : next);

/** ระดับความสัมพันธ์ → ป้าย + สี (ตรงกับ backend relLevel) */
export function relLevel(rel: number): { label: string; color: ColorKey } {
  if (rel <= -50) return { label: 'ศัตรู', color: 'coral' };
  if (rel < 0) return { label: 'ไม่ชอบ', color: 'coral' };
  if (rel < 20) return { label: 'คนแปลกหน้า', color: 'slate' };
  if (rel < 50) return { label: 'เริ่มคุ้นเคย', color: 'sky' };
  if (rel < 75) return { label: 'สนิทสนม', color: 'mint' };
  if (rel < 90) return { label: 'ชอบ/ใกล้ชิด', color: 'sun' };
  return { label: 'คนรัก', color: 'bubble' };
}

/** ใช้ไอเท็ม → คืนค่าความสัมพันธ์ใหม่ (relStart = ค่าเริ่มต้นของตัวละคร สำหรับ reset) */
export function applyItem(rel: number, item: ChatItem, relStart = 0): number {
  if (item.kind === 'boost') return clampRel(rel + (item.amount ?? 0));
  if (item.kind === 'set') return clampRel(item.amount ?? 0);
  return clampRel(relStart); // reset
}

/** แยกแท็ก ‹rel:NN› (หรือ <rel:NN> / [rel:NN]) ออกจากข้อความ → คืนข้อความสะอาด + ค่าใหม่ */
export function parseRelTag(text: string): { text: string; rel?: number } {
  // รองรับ [[rel:NN]] · [rel:NN] · ‹rel:NN› · <rel:NN> (และ = แทน :)
  const m = text.match(/(?:‹|<|\[+)\s*rel\s*[:=]\s*(-?\d{1,3})\s*(?:›|>|\]+)?/i);
  const rel = m ? clampRel(Number(m[1])) : undefined;
  const clean = text.replace(/(?:‹|<|\[+)\s*rel\s*[:=]\s*-?\d{1,3}\s*(?:›|>|\]+)?/gi, '').trim();
  return { text: clean, rel };
}

/** ไอเท็ม/ของโกงเริ่มต้น */
export const DEFAULT_ITEMS: ChatItem[] = [
  { id: 'charm', name: 'เสน่ห์แรง', emoji: '💝', kind: 'boost', amount: 20, note: 'ปล่อยออร่าเสน่ห์ — ความรู้สึกดีขึ้นทันที' },
  { id: 'soulmate', name: 'พรหมลิขิต', emoji: '💍', kind: 'set', amount: 90, note: 'บิดให้รู้สึกราวกับเป็นคนรักที่ผูกพันลึกซึ้ง' },
  { id: 'curse', name: 'คำสาปเกลียด', emoji: '😈', kind: 'set', amount: -60, note: 'บิดให้มองผู้เล่นเป็นศัตรู เกลียดชัง' },
  { id: 'wipe', name: 'ล้างความทรงจำ', emoji: '🧹', kind: 'reset', note: 'ลบความรู้สึกทั้งหมด กลับสู่จุดเริ่มต้น' },
];

export const emptyChatState = (): ChatState => ({ chars: [], items: DEFAULT_ITEMS, sessions: [] });
