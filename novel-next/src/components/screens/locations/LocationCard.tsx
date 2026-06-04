'use client';
import { Card, Tag } from '@/components/ui';
import { pal } from '@/lib/theme';
import type { Loc } from '@/lib/types';

interface LocationCardProps {
  l: Loc;
  onOpen: (l: Loc) => void;
}

/** การ์ดสถานที่ */
export function LocationCard({ l, onOpen }: LocationCardProps) {
  const color = l.color ?? 'mint';
  const P = pal(color);
  return (
    <Card hover onClick={() => onOpen(l)} className="p-5 flex gap-4">
      <div className="h-16 w-16 rounded-3xl grid place-items-center text-2xl shrink-0" style={{ background: P.soft }}>📍</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-display text-lg font-semibold text-ink">{l.name}</h3>
          {l.zone && <Tag color={color}>{l.zone}</Tag>}
        </div>
        {l.mood && <p className="text-[12px] font-extrabold text-muted mt-0.5">{l.mood}</p>}
        <p className="text-[14px] text-muted font-semibold mt-1.5 line-clamp-2 leading-snug">{l.description}</p>
      </div>
    </Card>
  );
}
