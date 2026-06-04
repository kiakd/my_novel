'use client';
import { SectionTitle } from '@/components/ui';
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

  return (
    <div className="max-w-3xl mx-auto">
      <SectionTitle emoji="📝" color="grape" title={t('plot.title')} sub={t('plot.sub')} right={<SaveIndicator status={status} variant="pill" />} />
      <div className="flex flex-col gap-6 pb-10">
        {FIELDS.map((f) => (
          <PlotField key={f.prop} f={f} value={(story?.[f.prop as keyof Story] as string) || ''} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}
