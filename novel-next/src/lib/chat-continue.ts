/**
 * Continue nudge ฝั่ง client (ปุ่มดำเนินเรื่องต่อ / regen แบบ continue)
 * คู่กับ server: isContinueInput + buildContinueTailNudge ใน novel/chat-prompt.ts
 * Phase 1 anti-loop — ดู docs/superpowers/plans/2026-07-26-chat-continue-anti-loop.md
 */

const CHAR_BODY =
  'ขยับเรื่องไปข้างหน้าหนึ่ง beat ใหม่ — ตัวละครต้องตัดสินใจแล้วลงมือทำสิ่งใหม่ที่สมเหตุผล ' +
  '(ย้ายที่ · ใช้/อ่านของ · คุยกับ NPC · เปิดเผยข้อมูล · เปลี่ยนสถานะ · time-skip ไปจุดถัดไปที่เรื่องต้องการ). ' +
  'ห้ามทวนบทพูด/💭/อารมณ์เทิร์นก่อนด้วยถ้อยคำใหม่ · ห้ามวนรอหรือปลุกใจตัวเองซ้ำ. ' +
  'ถ้าผู้เล่นไม่อยู่ในฉาก ให้เล่นชีวิตตัวละครเองต่อจนจบช่วง โดยไม่ต้องรอผู้เล่นพูด. คงโทนและระดับความสัมพันธ์เดิม';

const NARRATOR_BODY =
  'ขยับเหตุการณ์หนึ่ง beat ใหม่จากช่วงก่อนหน้า — ใส่สิ่งใหม่ (NPC พูด/ทำ · สภาพแวดล้อมเปลี่ยน · เวลาผ่าน · อุปสรรคเล็ก) ' +
  'ห้ามสรุปหรือทวนจังหวะเดิมด้วยถ้อยคำใหม่ ตามเหตุการณ์ล่าสุด โดยไม่ขัดกับเรื่องเดิม';

/** ดึงบทพูดล่าสุดจากข้อความตัวละคร/บรรยาย — ใช้เป็น negative example กัน echo */
export function lastQuotedLine(text?: string): string | undefined {
  if (!text?.trim()) return undefined;
  const quotes = [...text.matchAll(/"([^"]{8,80})"/g)].map((m) => m[1].trim());
  return quotes.length ? quotes[quotes.length - 1] : undefined;
}

export function buildCharContinueInput(prevText?: string): string {
  const echo = lastQuotedLine(prevText);
  const anti = echo ? `\nห้ามพูดซ้ำหรือแปรผันจากประโยคนี้: "${echo}"` : '';
  return `(ดำเนินเรื่องต่อ) ${CHAR_BODY}${anti}`;
}

export function buildNarratorContinueInput(prevText?: string): string {
  const echo = lastQuotedLine(prevText);
  const anti = echo ? `\nห้ามให้ใครพูดซ้ำหรือแปรผันจากประโยคนี้: "${echo}"` : '';
  return `(ดำเนินฉากบรรยายต่อ) ${NARRATOR_BODY}${anti}`;
}
