'use client';
import { Textarea } from '@/components/ui';
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
  busy: boolean;                              // กำลังเจนช่องนี้อยู่ (คุมจากแม่)
  onChange: (prop: string, value: string) => void;
  onGenerate: (prop: string) => void;         // กดเจน → แม่เรียก AI + เขียนค่ากลับ
}

/** ฟิลด์โครงเรื่อง 1 ช่อง + ปุ่ม AI assist (อิงช่องอื่น + ของเดิมในช่อง แล้วปรับ/เติม) */
export function PlotField({ f, value, busy, onChange, onGenerate }: PlotFieldProps) {
  const { t } = useI18n();
  const label = t(`plot.fields.${f.labelKey}`);

  return (
    <div className="anim-rise">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{f.emoji}</span>
          <span className="font-display text-[17px] font-medium text-ink">{label}</span>
        </div>
        <button
          onClick={() => onGenerate(f.prop)}
          disabled={busy}
          className="group inline-flex items-center gap-1.5 text-[13px] font-extrabold rounded-full px-3 py-1 transition disabled:cursor-not-allowed"
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
