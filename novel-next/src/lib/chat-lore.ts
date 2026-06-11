// ============ Lorebook (Phase 2 anti-drift) — keyword-triggered context injection ============
// หลักการเดียวกับ World Info ของ SillyTavern: ข้อเท็จจริงถูกแทรกเข้า prompt "เฉพาะเมื่อเกี่ยวกับฉากปัจจุบัน"
// ภายใต้งบตัวอักษร — จ่าย token เฉพาะ lore ที่จำเป็น (ดู novel/docs/anti-drift-roadmap.md)
import type { LoreEntry } from './chat-types';

export const LORE_SCAN_DEPTH = 6;   // สแกน keyword จาก N ข้อความล่าสุด + ข้อความที่กำลังส่ง
export const LORE_BUDGET = 800;     // งบความยาวรวมของ lore ที่แทรก (ตัวอักษร)

/** เลือก lore ที่ active: always ทั้งหมด + ตัวที่ keyword โผล่ใน recentTexts
 *  เรียง always ก่อน → priority มาก→น้อย แล้วตัดตัวท้ายเมื่อเกินงบ */
export function activateLore(lore: LoreEntry[] | undefined, recentTexts: string[], budget = LORE_BUDGET): LoreEntry[] {
  if (!lore?.length) return [];
  const hay = recentTexts.join('\n').toLowerCase();
  const hit = lore.filter((e) =>
    e.text.trim() && (e.always || e.keys.some((k) => k.trim() && hay.includes(k.trim().toLowerCase()))));
  const ranked = [...hit].sort((a, b) =>
    Number(b.always ?? false) - Number(a.always ?? false) || (b.priority ?? 0) - (a.priority ?? 0));
  const out: LoreEntry[] = [];
  let used = 0;
  for (const e of ranked) {
    if (out.length && used + e.text.length > budget) break;
    out.push(e);
    used += e.text.length;
  }
  return out;
}

// ---- helper สำหรับ UI (กรอก keys เป็นข้อความคั่น ,) ----
export const keysToText = (keys: string[]) => keys.join(', ');
export const textToKeys = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
