'use client';
import { useI18n } from '@/lib/i18n';
import { cx } from '@/lib/theme';
import type { SaveStatus } from '@/lib/store/StoryProvider';

interface SaveIndicatorProps {
  status: SaveStatus;
  /** pill = ป้ายใหญ่ (หน้า Plot), inline = ข้อความเล็กมีจุด (header / editor) */
  variant?: 'pill' | 'inline';
}

interface Look { dot: string; text: string; key: string; pulse?: boolean }

function look(status: SaveStatus): Look {
  switch (status) {
    case 'saving': return { dot: '#E9A52B', text: '#E9A52B', key: 'common.saving', pulse: true };
    case 'conflict': return { dot: '#FB8C6E', text: '#FB8C6E', key: 'common.conflict' };
    case 'error': return { dot: '#FB8C6E', text: '#FB8C6E', key: 'common.offline' };
    case 'loading': return { dot: '#988C7C', text: '#988C7C', key: 'common.loading', pulse: true };
    default: return { dot: '#1FB587', text: '#1FB587', key: 'common.saved' }; // saved | idle
  }
}

/** ตัวบอกสถานะบันทึก — ขับด้วย SaveStatus จาก StoryProvider */
export function SaveIndicator({ status, variant = 'inline' }: SaveIndicatorProps) {
  const { t } = useI18n();
  const l = look(status);
  const label = variant === 'inline' && status === 'saved' ? t('common.savedShort') : t(l.key);

  if (variant === 'pill') {
    return (
      <span className="inline-flex items-center gap-2 font-bold text-sm rounded-full px-3.5 py-2"
        style={{ background: l.dot + '22', color: l.text }}>
        <span className={cx('h-2 w-2 rounded-full', l.pulse && 'animate-ping')} style={{ background: l.dot }} />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-bold text-[13px] ml-1" style={{ color: l.text }}>
      <span className={cx('h-2 w-2 rounded-full', l.pulse && 'animate-ping')} style={{ background: l.dot }} />
      {label}
    </span>
  );
}
