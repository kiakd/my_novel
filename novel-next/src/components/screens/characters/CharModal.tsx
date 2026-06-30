'use client';
import { useRef, useState } from 'react';
import { Modal, Avatar, Tag, IconBtn, Btn, Input, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';
import type { Char } from '@/lib/types';
import { importCardFile } from '@/lib/card-client';
import { charInitial, charColor } from './util';
import { ProfileTab } from './ProfileTab';
import { VisualTab } from './VisualTab';

/** ฟิลด์โปรไฟล์ที่ Char กับการ์ดมีร่วมกัน — เลือกมาเฉพาะที่ Char รองรับ */
const CARD_PROFILE_KEYS = ['name', 'appearance', 'description', 'mindset', 'behavior', 'pronounSelf', 'pronounOther', 'speechTone', 'voiceExamples'] as const;

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

  // ---- การ์ดตัวละคร V2/V3 (import/export) ----
  const fileRef = useRef<HTMLInputElement>(null);
  // export: ตัวละครเนื้อเรื่องเก็บใน DB (collection characters) ตามชื่อ → ดึง PNG ที่ฝังการ์ด
  const onExportCard = () => {
    if (!draft.name.trim()) { toast('ตั้งชื่อตัวละครก่อน', '⚠️'); return; }
    window.open(`/api/characters/${encodeURIComponent(draft.name)}/card.png`, '_blank');
  };
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
      // 1) persist เข้า DB collection characters (DB-coupled endpoint ตามสเปก)
      let res: Response;
      if (isPng) {
        res = await fetch('/api/characters/import-card-png', { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: await file.arrayBuffer() });
      } else {
        res = await fetch('/api/characters/import-card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(JSON.parse(await file.text())) });
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? `import → ${res.status}`);
      // 2) เติม draft ให้รีวิวแล้ว Save เข้าเนื้อเรื่อง (story.characters คนละ store กับ DB) — ใช้ stateless parser ได้ NovelChar สะอาด
      const patch = await importCardFile(file);
      const profile = Object.fromEntries(CARD_PROFILE_KEYS.map((k) => [k, patch[k]]).filter(([, v]) => v != null)) as Partial<Char>;
      setDraft((d) => ({ ...d, ...profile, id: d.id, color: d.color }));
      toast('นำเข้าการ์ดแล้ว', '📥');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'นำเข้าการ์ดไม่สำเร็จ', '⚠️');
    }
  };

  const tabs: [typeof tab, string][] = [
    ['profile', `📋 ${t('characters.profile')}`],
    ['visual', `🎨 ${t('characters.visual')}`],
  ];

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur px-6 pt-6 pb-3 border-b border-line">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            {draft.avatar
              ? <img src={draft.avatar} alt={draft.name} className="h-[52px] w-[52px] rounded-full object-cover ring-2 ring-white shadow shrink-0" />
              : <Avatar initial={charInitial(draft)} color={accent} size={52} ring />}
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
      <div className="sticky bottom-0 bg-cream/95 backdrop-blur px-6 py-4 border-t border-line flex flex-wrap justify-between items-center gap-2">
        <button className="text-coral font-bold text-sm hover:underline" onClick={() => { onDelete(draft.id); onClose(); }}>🗑 {t('characters.deleteCharacter')}</button>
        <div className="flex gap-2 flex-wrap items-center">
          <input ref={fileRef} type="file" accept=".png,.json,image/png,application/json" className="hidden" onChange={onImportFile} />
          <Btn variant="ghost" onClick={() => fileRef.current?.click()}>⬆️ นำเข้าการ์ด</Btn>
          <Btn variant="ghost" onClick={onExportCard}>⬇️ การ์ด PNG</Btn>
          <Btn variant="ghost" onClick={onClose}>{t('common.cancel')}</Btn>
          <Btn variant="primary" color={accent} onClick={() => { onSave(draft); onClose(); toast(t('toast.charSaved'), '💾'); }}>{t('common.saveChanges')}</Btn>
        </div>
      </div>
    </Modal>
  );
}
