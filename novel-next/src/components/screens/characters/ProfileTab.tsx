'use client';
import { Field, Input, Textarea } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { Char } from '@/lib/types';
import { Pronoun } from './Pronoun';

interface ProfileTabProps {
  draft: Char;
  set: (patch: Partial<Char>) => void;
}

/** แท็บโปรไฟล์ในโมดัลตัวละคร (controlled) */
export function ProfileTab({ draft, set }: ProfileTabProps) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
      <Field label={t('characters.fields.appearance')} className="col-span-2"><Textarea rows={2} value={draft.appearance ?? ''} onChange={(e) => set({ appearance: e.target.value })} /></Field>
      <Field label={t('characters.fields.bio')} className="col-span-2"><Textarea rows={2} value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
      <Field label={t('characters.fields.skill')}><Input value={draft.skill ?? ''} onChange={(e) => set({ skill: e.target.value })} /></Field>
      <Field label={t('characters.fields.mindset')}><Input value={draft.mindset ?? ''} onChange={(e) => set({ mindset: e.target.value })} /></Field>
      <Field label={t('characters.fields.behavior')} className="col-span-2"><Textarea rows={2} value={draft.behavior ?? ''} onChange={(e) => set({ behavior: e.target.value })} /></Field>
      <div className="col-span-2 bg-white rounded-3xl border border-line p-4">
        <div className="font-display text-[15px] font-medium text-ink mb-3 flex items-center gap-2">🗣️ {t('characters.fields.speech')}</div>
        <div className="flex gap-3 mb-3">
          <Pronoun label={t('characters.fields.selfPronoun')} value={draft.pronounSelf ?? ''} onChange={(v) => set({ pronounSelf: v })} />
          <Pronoun label={t('characters.fields.otherPronoun')} value={draft.pronounOther ?? ''} onChange={(v) => set({ pronounOther: v })} />
          <div className="flex-[1.4]">
            <div className="text-[12px] font-extrabold text-muted mb-1">{t('characters.fields.tone')}</div>
            <Input value={draft.speechTone ?? ''} onChange={(e) => set({ speechTone: e.target.value })} className="py-1.5 text-sm" />
          </div>
        </div>
        <Field label={t('characters.fields.sampleLines')}><Textarea rows={2} value={draft.voiceExamples ?? ''} onChange={(e) => set({ voiceExamples: e.target.value })} /></Field>
      </div>
    </div>
  );
}
