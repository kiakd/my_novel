// ============ Design tokens + helpers (พอร์ตจาก data.jsx / ui.jsx) ============
// แหล่งความจริงเดียวของ palette + helper สี — ใช้ทั่วทั้งแอป

export type ColorKey =
  | 'grape' | 'coral' | 'mint' | 'sun' | 'sky' | 'bubble' | 'lilac' | 'slate';

export interface Swatch {
  c: string;     // base
  soft: string;  // tint background
  tint: string;  // gradient light end
}

export const PALETTE: Record<ColorKey, Swatch> = {
  grape: { c: '#7C6FE8', soft: '#ECE9FB', tint: '#9A8FF0' },
  coral: { c: '#FB8C6E', soft: '#FDE9E1', tint: '#FCA88F' },
  mint: { c: '#1FB587', soft: '#DDF4EC', tint: '#4FCBA4' },
  sun: { c: '#E9A52B', soft: '#FBEFD3', tint: '#F2BC5A' },
  sky: { c: '#4E9CE8', soft: '#E2EFFB', tint: '#79B5EE' },
  bubble: { c: '#EB6FA6', soft: '#FCE3EE', tint: '#F291BD' },
  lilac: { c: '#A07EE8', soft: '#EFE8FB', tint: '#B69BEF' },
  slate: { c: '#7E889B', soft: '#ECEEF2', tint: '#9AA2B2' },
};

/** คืน swatch ของสี (fallback = grape) */
export const pal = (k?: string): Swatch =>
  (k && PALETTE[k as ColorKey]) || PALETTE.grape;

/** มืดลง factor f (0..1) — ใช้ทำสีตัวอักษร/เงาบนพื้นสีอ่อน */
export function darken(hex: string, f = 0.82): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** join className แบบกรอง falsy */
export const cx = (...a: Array<string | false | null | undefined>): string =>
  a.filter(Boolean).join(' ');
