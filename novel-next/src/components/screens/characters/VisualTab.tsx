'use client';
import { Field, Input } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { PALETTE, pal, cx, type ColorKey } from '@/lib/theme';
import type { Char } from '@/lib/types';
import { charColor } from './util';

const COLORS = Object.keys(PALETTE) as ColorKey[];

interface VisualTabProps {
  draft: Char;
  set: (patch: Partial<Char>) => void;
}

/** แท็บลุค/สีตัวละครในโมดัล (controlled) — ชุดเริ่มต้น + สีประจำตัว */
export function VisualTab({ draft, set }: VisualTabProps) {
  const { t } = useI18n();
  const accent = charColor(draft);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
      <Field label={t('characters.fields.defaultOutfit')} className="col-span-2"><Input value={draft.defaultOutfit ?? ''} onChange={(e) => set({ defaultOutfit: e.target.value })} /></Field>
      <div className="col-span-2">
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
