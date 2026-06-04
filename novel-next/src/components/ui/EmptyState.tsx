'use client';
import type { ReactNode } from 'react';
import { pal } from '@/lib/theme';

interface EmptyStateProps {
  emoji: string;
  title: string;
  sub?: string;
  action?: ReactNode;
  color?: string;
}

/** สถานะว่าง: ไอคอนลอย + ข้อความ + ปุ่ม */
export function EmptyState({ emoji, title, sub, action, color = 'grape' }: EmptyStateProps) {
  const P = pal(color);
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="h-24 w-24 rounded-[2rem] grid place-items-center text-5xl mb-5 floaty" style={{ background: P.soft }}>
        {emoji}
      </div>
      <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
      {sub && <p className="text-muted font-semibold mt-1.5 max-w-sm">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
