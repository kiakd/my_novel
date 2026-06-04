'use client';
import { Field, Input, Textarea, Btn } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { PALETTE, pal, darken, cx, type ColorKey } from '@/lib/theme';
import type { Char } from '@/lib/types';
import { charColor } from './util';

const COLORS = Object.keys(PALETTE) as ColorKey[];

interface VisualTabProps {
  draft: Char;
  set: (patch: Partial<Char>) => void;
}

/** แท็บภาพ/เจนรูปในโมดัลตัวละคร (controlled) */
export function VisualTab({ draft, set }: VisualTabProps) {
  const { t } = useI18n();
  const accent = charColor(draft);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
      <div className="col-span-2 flex gap-4 items-center bg-white rounded-3xl border border-line p-4">
        <div className="h-28 w-28 rounded-3xl grid place-items-center text-4xl shrink-0 relative overflow-hidden"
          style={{ background: `linear-gradient(140deg, ${pal(accent).tint}, ${pal(accent).c})` }}>
          <span className="opacity-90">🖼️</span>
          <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(45deg,rgba(255,255,255,.08) 0 8px,transparent 8px 16px)' }} />
        </div>
        <div className="flex-1">
          <div className="text-[12px] font-extrabold text-muted mb-1.5">{t('characters.fields.referenceImage')}</div>
          <p className="text-sm text-muted font-semibold mb-2.5">{t('characters.fields.referenceHint')}</p>
          <Btn variant="soft" color={accent} size="sm">🖼️ {t('characters.fields.openInImageGen')}</Btn>
        </div>
      </div>
      <Field label={t('characters.fields.promptAnchor')} className="col-span-2"><Textarea rows={2} value={draft.promptAnchor ?? ''} onChange={(e) => set({ promptAnchor: e.target.value })} /></Field>
      <Field label={t('characters.fields.negativeAnchor')} className="col-span-2"><Textarea rows={2} value={draft.negativeAnchor ?? ''} onChange={(e) => set({ negativeAnchor: e.target.value })} /></Field>
      <Field label={t('characters.fields.defaultOutfit')} className="col-span-2"><Input value={draft.defaultOutfit ?? ''} onChange={(e) => set({ defaultOutfit: e.target.value })} /></Field>
      <div>
        <div className="text-[13.5px] font-extrabold text-ink/70 mb-1.5">{t('characters.fields.renderStyle')}</div>
        <div className="flex gap-2">
          {(['anime', 'photoreal'] as const).map((m) => (
            <button key={m} onClick={() => set({ stylePreference: m })}
              className={cx('flex-1 rounded-2xl py-2 font-bold text-sm border-2 transition capitalize')}
              style={draft.stylePreference === m
                ? { borderColor: pal(accent).c, background: pal(accent).soft, color: darken(pal(accent).c, 0.7) }
                : { borderColor: '#ECE2D1', color: '#988C7C' }}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="text-[13.5px] font-extrabold text-ink/70 mb-1.5">{t('characters.fields.accentColor')}</div>
        <div className="flex flex-wrap gap-2 pt-1">
          {COLORS.map((col) => (
            <button key={col} onClick={() => set({ color: col })}
              className={cx('h-8 w-8 rounded-full transition active:scale-90')}
              style={{ background: pal(col).c, boxShadow: accent === col ? `0 0 0 3px #fff, 0 0 0 5px ${pal(col).c}` : '0 2px 6px -1px rgba(0,0,0,.2)' }} />
          ))}
        </div>
      </div>
    </div>
  );
}
