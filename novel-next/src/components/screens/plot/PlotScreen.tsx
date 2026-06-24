'use client';
import { useState } from 'react';
import { SectionTitle, Btn, toast } from '@/components/ui';
import { SaveIndicator } from '@/components/layout/SaveIndicator';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import { generate } from '@/lib/api';
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

// คำสั่งเจนเฉพาะของแต่ละช่อง (ใช้ต่อท้าย system instruction)
const GEN_INSTR: Record<string, string> = {
  genre: 'ระบุแนวเรื่องให้กระชับ เช่น แฟนตาซี/โรแมนซ์/ดาร์ก — เป็นคำหรือวลีสั้น ๆ คั่นด้วย /',
  theme: 'สรุปแก่นเรื่อง/ธีมหลักที่เรื่องนี้ต้องการสื่อ 1-2 ประโยค',
  premise: 'เขียน premise: เรื่องนี้เกี่ยวกับใคร ต้องการอะไร และอุปสรรคหลักคืออะไร 2-3 ประโยค',
  plot: 'ร่างโครงเรื่องโดยละเอียดเป็นบีต/องก์สำคัญ ตั้งแต่เปิดเรื่อง → ปม → จุดพีค → คลี่คลาย เป็น bullet',
  worldRules: 'กำหนดกฎของโลก/ระบบพลัง/ข้อจำกัดสำคัญที่เนื้อเรื่องต้องยึดให้คงเส้นคงวา เป็น bullet',
  styleGuide: 'แนะแนวสไตล์การเขียน: โทน จังหวะ ความยาวประโยค น้ำหนักคำบรรยาย/บทสนทนา เป็น bullet 2-4 ข้อ',
  vocabPalette: 'รวบรวมคำ/สำนวน/พาเลตคำที่ใช้บ่อยให้เข้ากับโทนและแนวเรื่อง คั่นด้วย ,',
  dontList: 'ลิสต์สิ่งที่ "ควรทำ (Do)" และ "ไม่ควรทำ (Don\'t)" ในการเขียนเรื่องนี้ เป็น bullet',
};

const GEN_SYSTEM =
  'คุณคือผู้ช่วยวางโครงเรื่องนิยายไทย (รองรับเนื้อหาผู้ใหญ่ R18 ได้). ' +
  'ตอบเป็นภาษาไทย ส่งกลับเฉพาะ "เนื้อหาของช่องที่ขอ" เท่านั้น — ห้ามเกริ่นนำ ห้ามอธิบายเพิ่ม ห้ามใส่ชื่อช่อง/หัวข้อซ้ำ.';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** หน้าโครงเรื่อง — ผูกกับ Story ใน StoryProvider (autosave) */
export function PlotScreen() {
  const { t } = useI18n();
  const { story, status, mutateStory } = useStory();
  const [busyProp, setBusyProp] = useState<string | null>(null);
  const [genAllBusy, setGenAllBusy] = useState(false);

  const onChange = (prop: string, v: string) =>
    mutateStory((s) => ({ ...s, [prop]: v }));

  // มุมมองการเล่า — ไม่ตั้ง = backend default '1st'; โชว์ค่าจริงที่ใช้เจน
  const pov = story?.pov ?? '1st';
  const setPov = (v: '1st' | '3rd') => mutateStory((s) => ({ ...s, pov: v }));

  // ประกอบ user prompt: บริบทจากช่อง "อื่น" ที่กรอกแล้ว + ของเดิมในช่องนี้ (ถ้ามี) → ปรับ/เติม ไม่ใช่สร้างจากศูนย์
  const buildPrompt = (prop: string): string => {
    const cur = ((story?.[prop as keyof Story] as string) || '').trim();
    const self = FIELDS.find((f) => f.prop === prop)!;
    const label = t(`plot.fields.${self.labelKey}`);

    const ctx = FIELDS
      .filter((f) => f.prop !== prop)
      .map((f) => {
        const v = ((story?.[f.prop as keyof Story] as string) || '').trim();
        return v ? `${t(`plot.fields.${f.labelKey}`)}: ${clip(v, 300)}` : null;
      })
      .filter(Boolean);

    const parts: string[] = [];
    if (ctx.length) parts.push('=== บริบทจากช่องอื่น (ให้สอดคล้องกัน) ===', ...(ctx as string[]), '');

    if (cur) {
      parts.push(
        `=== เนื้อหาเดิมของช่อง "${label}" ===`,
        clip(cur, 1500),
        '',
        `งาน: ขัดเกลา/ต่อยอดจากเนื้อหาเดิมข้างบน คงสาระและเจตนาเดิมไว้ ปรับให้สอดคล้องกับช่องอื่น (อย่าทิ้งของเดิมแล้วเขียนใหม่หมด). ${GEN_INSTR[prop] ?? ''}`,
      );
    } else {
      parts.push(`งาน: สร้าง "${label}" ให้สอดคล้องกับบริบทข้างบน. ${GEN_INSTR[prop] ?? ''}`);
    }
    return parts.join('\n');
  };

  // เจน 1 ช่อง → เขียนค่ากลับลงช่อง (ผ่าน autosave เดิม). คืน true ถ้าได้ผลลัพธ์
  const genField = async (prop: string): Promise<boolean> => {
    setBusyProp(prop);
    try {
      const r = await generate({ system: GEN_SYSTEM, user: buildPrompt(prop), temperature: 0.85, max_tokens: 600 });
      const text = r.text?.trim();
      if (r.ok && text) {
        onChange(prop, text);
        return true;
      }
      toast(r.error ?? t('common.offline'), '⚠️');
      return false;
    } catch (e) {
      toast((e as Error).message || t('common.offline'), '⚠️');
      return false;
    } finally {
      setBusyProp(null);
    }
  };

  const onGenerate = (prop: string) => {
    if (busyProp || genAllBusy) return;
    void genField(prop).then((ok) => ok && toast(t('toast.suggestionReady'), '✅'));
  };

  // เจนทุกช่องที่ "ยังว่าง" ทีละช่อง (ช่องที่กรอกแล้วไม่แตะ)
  const genAllEmpty = async () => {
    if (busyProp || genAllBusy) return;
    const empties = FIELDS.filter((f) => !((story?.[f.prop as keyof Story] as string) || '').trim());
    if (!empties.length) { toast(t('plot.allFilled'), '👍'); return; }
    setGenAllBusy(true);
    toast(t('toast.drafting'), '✦');
    let done = 0;
    for (const f of empties) {
      if (await genField(f.prop)) done++;
    }
    setGenAllBusy(false);
    toast(t('plot.genAllDone', { n: String(done) }), '✅');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <SectionTitle emoji="📝" color="grape" title={t('plot.title')} sub={t('plot.sub')} right={<SaveIndicator status={status} variant="pill" />} />
      <div className="flex flex-col gap-6 pb-10">
        <div className="anim-rise flex flex-wrap items-center justify-between gap-3">
          <div>
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
          <Btn variant="outline" color="grape" size="sm" onClick={() => void genAllEmpty()} disabled={genAllBusy || !!busyProp}>
            {genAllBusy ? `✦ ${t('common.thinking')}` : `✦ ${t('plot.genAllEmpty')}`}
          </Btn>
        </div>
        {FIELDS.map((f) => (
          <PlotField
            key={f.prop}
            f={f}
            value={(story?.[f.prop as keyof Story] as string) || ''}
            busy={busyProp === f.prop}
            onChange={onChange}
            onGenerate={onGenerate}
          />
        ))}
      </div>
    </div>
  );
}
