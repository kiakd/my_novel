'use client';
// กล่อง state หนึ่งหมวด (Skills/Mindset/…) + แถวรายการในกล่อง — ใช้ใน overlay สถานะตัวละคร
import type { ReactNode } from 'react';
import { pal } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

const ADD = pal('mint');

/** จุดสัญลักษณ์ตามชนิด beat (รูปทรงต่างกันเล็กน้อยเหมือน wireframe) */
const DOT: Record<string, { radius: string; rotate?: boolean }> = {
  skill: { radius: '3px', rotate: true },
  mindset: { radius: '4px' },
  status: { radius: '50% 5px 50% 5px' },
  look: { radius: '50% 50% 50% 3px' },
  milestone: { radius: '50%' },
  bond: { radius: '50%' },
};

interface StateItemProps {
  label: ReactNode;
  meta?: ReactNode;
  why?: string | null;
  isNew?: boolean;
  dotKind?: keyof typeof DOT;
  leading?: ReactNode; // แทนจุด (เช่น avatar / รูป look)
  trailing?: ReactNode;
}

export function StateItem({ label, meta, why, isNew, dotKind = 'status', leading, trailing }: StateItemProps) {
  return (
    <div
      className="flex items-start gap-2.5"
      style={isNew ? { background: ADD.soft, border: `1.5px solid ${ADD.tint}`, borderRadius: 10, margin: '-3px -6px', padding: '5px 6px' } : undefined}
    >
      {leading ?? (
        <span
          className="mt-1 shrink-0"
          style={{ width: 12, height: 12, border: `2px solid ${isNew ? ADD.c : '#2A2724'}`, borderRadius: DOT[dotKind].radius, transform: DOT[dotKind].rotate ? 'rotate(45deg)' : undefined }}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13.5px] font-bold leading-snug" style={{ color: isNew ? pal('mint').c : '#23211E' }}>{label}</div>
        {meta && <div className="text-[11px] text-muted leading-tight">{meta}</div>}
        {why && <div className="text-[11.5px] text-muted italic leading-tight mt-0.5">{why}</div>}
      </div>
      {isNew && <span className="text-[10px] font-extrabold text-white rounded-md px-1.5 py-0.5 shrink-0 mt-0.5" style={{ background: ADD.c }}>+++</span>}
      {trailing}
    </div>
  );
}

interface StateCardProps {
  title: string;
  count?: number | null;
  children?: ReactNode;
  empty?: boolean;
}

export function StateCard({ title, count, children, empty }: StateCardProps) {
  const { t } = useI18n();
  return (
    <div className="bg-white rounded-3xl border border-line overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dashed border-line">
        <h4 className="text-[11px] font-extrabold tracking-widest uppercase text-muted">{title}</h4>
        {count != null && <span className="ml-auto font-display text-base text-muted">{count}</span>}
      </div>
      <div className="px-4 py-3 flex flex-col gap-2.5">
        {empty ? <div className="text-[12.5px] text-muted font-semibold">{t('timeline.noneYet')}</div> : children}
      </div>
    </div>
  );
}
