'use client';
import { SectionTitle, Btn } from '@/components/ui';
import { SaveIndicator } from '@/components/layout/SaveIndicator';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import type { Story } from '@/lib/types';
import { PlotField, type PlotFieldDef } from './PlotField';

// prop = ฟิลด์จริงใน Story, labelKey = คีย์ i18n (plot.fields.*)
const FIELDS: PlotFieldDef[] = [
  { prop: 'genre', labelKey: 'genre', emoji: '🎭', rows: 2 },
  { prop: 'theme', labelKey: 'theme', emoji: '💭', rows: 2 },
  { prop: 'premise', labelKey: 'premise', emoji: '✨', rows: 3 },
  { prop: 'plot', labelKey: 'plot', emoji: '🧭', rows: 5 },
  { prop: 'worldRules', labelKey: 'rules', emoji: '🌍', rows: 4 },
  { prop: 'styleGuide', labelKey: 'style', emoji: '🖋️', rows: 3 },
  { prop: 'vocabPalette', labelKey: 'vocab', emoji: '🎨', rows: 2 },
  { prop: 'dontList', labelKey: 'donts', emoji: '🚦', rows: 3 },
];

/** หน้าโครงเรื่อง — ผูกกับ Story ใน StoryProvider (autosave) */
export function PlotScreen() {
  const { t } = useI18n();
  const { story, status, mutateStory } = useStory();

  const onChange = (prop: string, v: string) =>
    mutateStory((s) => ({ ...s, [prop]: v }));

  // มุมมองการเล่า — ไม่ตั้ง = backend default '1st'; โชว์ค่าจริงที่ใช้เจน
  const pov = story?.pov ?? '1st';
  const setPov = (v: '1st' | '3rd') => mutateStory((s) => ({ ...s, pov: v }));

  return (
    <div className="max-w-3xl mx-auto">
      <SectionTitle emoji="📝" color="grape" title={t('plot.title')} sub={t('plot.sub')} right={<SaveIndicator status={status} variant="pill" />} />
      <div className="flex flex-col gap-6 pb-10">
        <div className="anim-rise">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">👁️</span>
            <span className="font-display text-[17px] font-medium text-ink">{t('plot.pov.label')}</span>
            <span className="text-[12px] text-ink/40">{t('plot.pov.hint')}</span>
          </div>
          <div className="flex gap-2">
            <Btn variant={pov === '1st' ? 'primary' : 'outline'} color="grape" size="sm" onClick={() => setPov('1st')}>{t('plot.pov.first')}</Btn>
            <Btn variant={pov === '3rd' ? 'primary' : 'outline'} color="grape" size="sm" onClick={() => setPov('3rd')}>{t('plot.pov.third')}</Btn>
          </div>
        </div>
        {FIELDS.map((f) => (
          <PlotField key={f.prop} f={f} value={(story?.[f.prop as keyof Story] as string) || ''} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}
