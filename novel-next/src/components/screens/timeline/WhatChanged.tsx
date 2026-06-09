'use client';
// "อะไรเปลี่ยนในบทนี้" — รายการ change ที่เพิ่งเกิดในบท ch (ตัวละคร/ความสัมพันธ์/เหตุการณ์)
import { pal } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import type { Change } from './arc';

const ADD = pal('mint'); // accent เดียว = "เพิ่มในบทนี้" (ตาม wireframe)

export function WhatChanged({ changes }: { changes: Change[] }) {
  const { t } = useI18n();
  if (!changes.length) {
    return <p className="text-[13.5px] text-muted font-semibold leading-relaxed">{t('timeline.nothingNew')}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {changes.map((c) => (
        <div
          key={c.key}
          className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold"
          style={{ background: ADD.soft, border: `1.5px solid ${ADD.tint}`, color: '#4A4138' }}
        >
          <span className="text-[10px] font-extrabold text-white rounded-md px-1.5 py-0.5 shrink-0" style={{ background: ADD.c }}>+++</span>
          <span className="leading-snug">{c.pivotal ? '✦ ' : ''}{c.text}</span>
        </div>
      ))}
    </div>
  );
}
