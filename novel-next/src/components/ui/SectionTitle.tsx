'use client';
import type { ReactNode } from 'react';
import { pal } from '@/lib/theme';

interface SectionTitleProps {
  emoji: string;
  color?: string;
  title: string;
  sub?: string;
  right?: ReactNode;
}

/** หัวข้อหน้า: ไอคอนลอย + title + sub + action ขวา */
export function SectionTitle({ emoji, color = 'grape', title, sub, right }: SectionTitleProps) {
  const P = pal(color);
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-center gap-3.5">
        <div className="h-12 w-12 rounded-3xl grid place-items-center text-2xl shrink-0 floaty" style={{ background: P.soft }}>
          {emoji}
        </div>
        <div>
          <h1 className="font-display text-[28px] leading-none font-semibold text-ink">{title}</h1>
          {sub && <p className="text-muted font-semibold mt-1.5 text-[15px]">{sub}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}
