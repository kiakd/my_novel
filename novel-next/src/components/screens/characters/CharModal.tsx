'use client';
import { useState } from 'react';
import { Modal, Avatar, Tag, IconBtn, Btn, Input, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';
import type { Char } from '@/lib/types';
import { charInitial, charColor } from './util';
import { ProfileTab } from './ProfileTab';
import { VisualTab } from './VisualTab';

interface CharModalProps {
  char: Char;
  onClose: () => void;
  onSave: (c: Char) => void;
  onDelete: (id: string) => void;
}

/** โมดัลแก้ตัวละคร — แก้บน draft แล้วกด Save ค่อย commit */
export function CharModal({ char, onClose, onSave, onDelete }: CharModalProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'profile' | 'visual'>('profile');
  const [draft, setDraft] = useState<Char>(char);
  const set = (patch: Partial<Char>) => setDraft((d) => ({ ...d, ...patch }));
  const accent = charColor(draft);
  const P = pal(accent);

  const tabs: [typeof tab, string][] = [
    ['profile', `📋 ${t('characters.profile')}`],
    ['visual', `🎨 ${t('characters.visual')}`],
  ];

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur px-6 pt-6 pb-3 border-b border-line">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <Avatar initial={charInitial(draft)} color={accent} size={52} ring />
            <div>
              <Input value={draft.name} onChange={(e) => set({ name: e.target.value })}
                className="font-display text-2xl font-semibold !py-1 !border-transparent !bg-transparent focus:!bg-white" />
              {draft.role && <div className="mt-0.5"><Tag color={accent}>{draft.role}</Tag></div>}
            </div>
          </div>
          <IconBtn onClick={onClose} title={t('common.close')}>✕</IconBtn>
        </div>
        <div className="flex gap-1.5 mt-4">
          {tabs.map(([id, lbl]) => (
            <button key={id} onClick={() => setTab(id)} className="rounded-full px-4 py-1.5 font-bold text-sm transition"
              style={tab === id ? { background: P.c, color: '#fff' } : { color: '#988C7C' }}>{lbl}</button>
          ))}
        </div>
      </div>
      <div className="p-6 pt-5">
        {tab === 'profile' ? <ProfileTab draft={draft} set={set} /> : <VisualTab draft={draft} set={set} />}
      </div>
      <div className="sticky bottom-0 bg-cream/95 backdrop-blur px-6 py-4 border-t border-line flex justify-between items-center">
        <button className="text-coral font-bold text-sm hover:underline" onClick={() => { onDelete(draft.id); onClose(); }}>🗑 {t('characters.deleteCharacter')}</button>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn variant="primary" color={accent} onClick={() => { onSave(draft); onClose(); toast(t('toast.charSaved'), '💾'); }}>{t('common.saveChanges')}</Btn>
        </div>
      </div>
    </Modal>
  );
}
