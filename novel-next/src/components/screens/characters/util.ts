import type { Char } from '@/lib/types';
import type { ColorKey } from '@/lib/theme';

/** อักษรย่อสำหรับ avatar (ตัวแรกของชื่อ) */
export const charInitial = (c: Char): string => (c.name || '?').trim().charAt(0).toUpperCase() || '?';

/** สีประจำตัว (fallback grape) */
export const charColor = (c: Char): ColorKey => c.color ?? 'grape';
