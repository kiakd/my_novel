'use client';
import { pal } from '@/lib/theme';
import { relLevel, isDevoted } from '@/lib/chat-rel';

/** แถบความสัมพันธ์ -100..100 (0 ตรงกลาง, ติดลบ = ศัตรู) */
export function RelMeter({ rel }: { rel: number }) {
  const { label, color } = relLevel(rel);
  const P = pal(color);
  const pct = ((rel + 100) / 200) * 100; // -100..100 → 0..100%
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-bold" style={{ color: P.c }}>{label}{isDevoted(rel) ? ' 🔒' : ''}</span>
          <span className="text-[11px] text-muted tabular-nums">{rel > 0 ? `+${rel}` : rel}</span>
        </div>
        <div className="relative h-2 rounded-full bg-ink/[.08] overflow-hidden">
          {/* เส้นกลาง (0) */}
          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-ink/20" />
          <div className="absolute top-0 bottom-0 rounded-full transition-all"
            style={ rel >= 0
              ? { left: '50%', width: `${pct - 50}%`, background: P.c }
              : { right: `${100 - pct}%`, width: `${50 - pct}%`, background: P.c } } />
        </div>
      </div>
    </div>
  );
}
