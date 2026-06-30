'use client';
import { useRef } from 'react';
import { Field, Input, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { PALETTE, pal, cx, type ColorKey } from '@/lib/theme';
import type { Char } from '@/lib/types';
import { fileToScaledDataUrl } from '@/lib/image-resize';
import { charColor } from './util';

const COLORS = Object.keys(PALETTE) as ColorKey[];

interface VisualTabProps {
  draft: Char;
  set: (patch: Partial<Char>) => void;
}

/** แท็บลุค/สีตัวละครในโมดัล (controlled) — รูปประจำตัว + ชุดเริ่มต้น + สีประจำตัว */
export function VisualTab({ draft, set }: VisualTabProps) {
  const { t } = useI18n();
  const accent = charColor(draft);
  const avatarRef = useRef<HTMLInputElement>(null);
  const onAvatarFile = async (file?: File | null) => {
    if (!file || !file.type.startsWith('image/')) return;
    try { set({ avatar: await fileToScaledDataUrl(file) }); toast('ใส่รูปแล้ว', '🖼️'); }
    catch { toast('อ่านรูปไม่สำเร็จ', '⚠️'); }
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
      {/* รูปประจำตัว — โชว์เต็มใบบนการ์ด */}
      <div className="col-span-2">
        <div className="text-[13.5px] font-extrabold text-ink/70 mb-1.5">🖼️ รูปประจำตัว (โชว์บนการ์ด)</div>
        <div className="flex items-center gap-3">
          <div
            onClick={() => avatarRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void onAvatarFile(e.dataTransfer.files?.[0]); }}
            className="relative h-24 w-20 rounded-2xl overflow-hidden cursor-pointer border-2 border-dashed border-line grid place-items-center shrink-0 transition hover:brightness-95"
            style={{ background: pal(accent).soft }}
          >
            {draft.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.avatar} alt="" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <span className="text-2xl opacity-60">🖼️</span>
            )}
          </div>
          <div className="text-[12px] text-muted leading-relaxed">
            แตะหรือลากรูปมาวาง · ระบบย่อให้อัตโนมัติ
            {draft.avatar && <button type="button" onClick={() => set({ avatar: undefined })} className="block mt-1.5 text-coral font-bold hover:underline">ลบรูป</button>}
          </div>
        </div>
        <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onAvatarFile(e.target.files?.[0])} />
      </div>
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
