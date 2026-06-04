'use client';
import { useState } from 'react';
import { Textarea, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { cx } from '@/lib/theme';

export interface PlotFieldDef {
  prop: string;     // ฟิลด์จริงใน Story
  labelKey: string; // คีย์ i18n (plot.fields.*)
  emoji: string;
  rows: number;
}

interface PlotFieldProps {
  f: PlotFieldDef;
  value: string;
  onChange: (prop: string, value: string) => void;
}

/** ฟิลด์โครงเรื่อง 1 ช่อง + ปุ่ม AI assist */
export function PlotField({ f, value, onChange }: PlotFieldProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const label = t(`plot.fields.${f.labelKey}`);

  const assist = () => {
    setBusy(true);
    toast(t('toast.drafting'), '✦');
    setTimeout(() => { setBusy(false); toast(t('toast.suggestionReady'), '✅'); }, 1100);
  };

  return (
    <div className="anim-rise">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{f.emoji}</span>
          <span className="font-display text-[17px] font-medium text-ink">{label}</span>
        </div>
        <button
          onClick={assist}
          className="group inline-flex items-center gap-1.5 text-[13px] font-extrabold rounded-full px-3 py-1 transition"
          style={{ color: '#7C6FE8', background: busy ? '#ECE9FB' : 'transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#ECE9FB')}
          onMouseLeave={(e) => !busy && (e.currentTarget.style.background = 'transparent')}
        >
          <span className={cx('transition-transform', busy ? 'animate-pulse' : 'group-hover:rotate-12')}>✦</span>
          {busy ? t('common.thinking') : t('common.aiAssist')}
        </button>
      </div>
      <Textarea rows={f.rows} value={value} onChange={(e) => onChange(f.prop, e.target.value)} placeholder={t('plot.placeholder', { label: label.toLowerCase() })} />
    </div>
  );
}
