'use client';
import { Btn, Spinner } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';
import type { BtnVariant } from '@/components/ui/Btn';

interface AIBarProps {
  onAct: (id: string, label: string) => void;
  onExpand: () => void;
  onContinue: () => void;
  busy: boolean;
}

/** แถบ AI ลอยล่างจอ (ขยาย/เขียนต่อ/รีวิว/สรุป) */
export function AIBar({ onAct, onExpand, onContinue, busy }: AIBarProps) {
  const { t } = useI18n();
  // summary ทำงานจริงแล้ว (สรุปบท → ความจำข้ามบท) — review ยังเป็น placeholder (stub)
  const acts: [string, string, BtnVariant][] = [
    ['review', `🔍 ${t('chapters.aiReview')}`, 'soft'],
    ['summary', `📝 ${t('chapters.aiSummary')}`, 'soft'],
  ];
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[94vw]">
      <div className="bg-white rounded-full shadow-pop border-2 border-line px-2.5 py-2 flex items-center gap-2 overflow-x-auto">
        <span className="pl-2 pr-1 text-[13px] font-extrabold flex items-center gap-1.5 shrink-0" style={{ color: pal('sky').c }}>
          {busy ? <Spinner size={14} color={pal('sky').c} /> : '✦'} AI
        </span>
        <Btn variant="primary" color="sky" size="sm" className="shrink-0" disabled={busy} onClick={onContinue}>▶ {t('chapters.aiContinue')}</Btn>
        <Btn variant="primary" color="lilac" size="sm" className="shrink-0" disabled={busy} onClick={onExpand}>✨ {t('chapters.aiExpand')}</Btn>
        {acts.map(([id, lbl, v]) => (
          <Btn key={id} variant={v} color="sky" size="sm" className="shrink-0" disabled={busy} onClick={() => onAct(id, lbl)}>{lbl}</Btn>
        ))}
      </div>
    </div>
  );
}
