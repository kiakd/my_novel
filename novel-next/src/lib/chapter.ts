// ============ helper เกี่ยวกับบท (content เก็บเป็น HTML) ============
import type { Chapter } from './types';

/** ตัด tag HTML → ข้อความล้วน */
export const htmlToText = (html?: string): string => {
  if (!html) return '';
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, ' ');
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
};

/** จำนวนตัวอักษร (ไม่นับช่องว่าง/ขึ้นบรรทัด) — เหมาะกับไทยที่ไม่เว้นวรรคระหว่างคำ */
export const charCount = (html?: string): number =>
  htmlToText(html).replace(/\s+/g, '').length;

export const hasContent = (html?: string): boolean => htmlToText(html).trim().length > 0;

/** เรียงบทตาม order (ไม่ mutate ของเดิม) */
export const sortChapters = <T extends { order?: number }>(cs: readonly T[]): T[] =>
  [...cs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** ข้อความล้วน (อาจหลายย่อหน้า) → HTML <p> ต่อบรรทัด (สำหรับแทรกเข้า editor) */
export const textToHtml = (text: string): string =>
  text.split(/\n+/).map((s) => s.trim()).filter(Boolean).map((s) => `<p>${escapeHtml(s)}</p>`).join('');

export type { Chapter };
