'use client';
import { useState } from 'react';
import { Modal, IconBtn, Field, Input, Textarea, Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';
import type { Loc } from '@/lib/types';

interface LocationModalProps {
  loc: Loc;
  onClose: () => void;
  onSave: (l: Loc) => void;
}

/** โมดัลแก้สถานที่ (controlled draft) */
export function LocationModal({ loc, onClose, onSave }: LocationModalProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Loc>(loc);
  const set = (patch: Partial<Loc>) => setDraft((d) => ({ ...d, ...patch }));
  const color = draft.color ?? 'mint';

  return (
    <Modal open onClose={onClose} size="md">
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-3xl grid place-items-center text-2xl" style={{ background: pal(color).soft }}>📍</div>
            <Input value={draft.name} onChange={(e) => set({ name: e.target.value })}
              className="font-display text-2xl font-semibold !py-1 !border-transparent !bg-transparent focus:!bg-white" />
          </div>
          <IconBtn onClick={onClose} title={t('common.close')}>✕</IconBtn>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('locations.fields.zone')}><Input value={draft.zone ?? ''} onChange={(e) => set({ zone: e.target.value })} /></Field>
          <Field label={t('locations.fields.atmosphere')}><Input value={draft.mood ?? ''} onChange={(e) => set({ mood: e.target.value })} /></Field>
          <Field label={t('locations.fields.description')} className="col-span-2"><Textarea rows={3} value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label={t('locations.fields.details')} className="col-span-2"><Textarea rows={4} value={draft.details ?? ''} onChange={(e) => set({ details: e.target.value })} placeholder={t('locations.fields.detailsPlaceholder')} /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn variant="primary" color="mint" onClick={() => { onSave(draft); onClose(); toast(t('toast.locSaved'), '💾'); }}>{t('common.save')}</Btn>
        </div>
      </div>
    </Modal>
  );
}
