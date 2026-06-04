'use client';
import { pal } from '@/lib/theme';
import type { ReaderTheme } from '@/lib/store/readerPrefs';

interface ReaderNavProps {
  idx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  faint: string;
  border: string;
  labels: { prev: string; next: string; counter: string };
}

/** ปุ่มบทก่อนหน้า/ถัดไป + ตัวนับ (ต่อท้ายเนื้อหาบท) */
export function ReaderNav({ idx, total, onPrev, onNext, faint, border, labels }: ReaderNavProps) {
  const first = idx <= 0;
  const last = idx >= total - 1;
  const accent = pal('sun').c;
  const btn = (disabled: boolean): React.CSSProperties => ({
    color: disabled ? faint : accent,
    opacity: disabled ? 0.4 : 1,
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 800,
  });
  return (
    <nav className="mt-14 pt-6 flex items-center justify-between gap-3 text-[15px]" style={{ borderTop: `1px solid ${border}` }}>
      <button onClick={onPrev} disabled={first} style={btn(first)} className="transition active:scale-95">‹ {labels.prev}</button>
      <span className="text-sm font-bold" style={{ color: faint }}>{labels.counter}</span>
      <button onClick={onNext} disabled={last} style={btn(last)} className="transition active:scale-95">{labels.next} ›</button>
    </nav>
  );
}
