'use client';
// เส้นความสัมพันธ์ + ป้ายประเภท — แปลงประเภท free-text เป็นสี/ไอคอน/ลายเส้นผ่าน relStyle
import { pal, darken } from '@/lib/theme';
import { relStyle } from './arc';

const BORDER: Record<'solid' | 'dashed' | 'double', string> = { solid: 'solid', dashed: 'dashed', double: 'double' };

/** เส้นสั้นๆ บอกชนิดความสัมพันธ์ (allies=ทึบ, rivals=ประ, loves=คู่) */
export function RelLine({ type, width = 34 }: { type: string; width?: number }) {
  const s = relStyle(type);
  const P = pal(s.color);
  return (
    <span
      className="inline-block shrink-0 rounded-full"
      style={{ width, borderTop: `${s.pattern === 'solid' ? 6 : 4}px ${BORDER[s.pattern]} ${P.c}` }}
    />
  );
}

/** ป้ายประเภท + ไอคอน */
export function RelTag({ type }: { type: string }) {
  const s = relStyle(type);
  const P = pal(s.color);
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-extrabold" style={{ background: P.soft, color: darken(P.c, 0.74) }}>
      <span>{s.emoji}</span>{type}
    </span>
  );
}

/** แถบความเข้มข้น -100..100 (ลบ = ขัดแย้ง, สีแดง) */
export function IntensityBar({ intensity }: { intensity?: number }) {
  if (intensity == null) return null;
  const mag = Math.min(100, Math.abs(intensity));
  const color = intensity < 0 ? pal('coral').c : pal('mint').c;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-14 rounded-full bg-black/[.06] overflow-hidden">
        <span className="block h-full rounded-full" style={{ width: `${mag}%`, background: color }} />
      </span>
    </span>
  );
}
