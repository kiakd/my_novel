'use client';
import { useState } from 'react';
import { Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import { StorySelector } from './StorySelector';
import { SaveIndicator } from './SaveIndicator';
import { LangToggle } from './LangToggle';

/** แถบหัวด้านบน — เดสก์ท็อป: actions เรียงเต็ม · มือถือ: บางแถวเดียว ยุบ actions เข้าเมนู ⋯ */
export function Header({ onToggleNav }: { onToggleNav?: () => void }) {
  const { t } = useI18n();
  const { status, story, addStory, renameStory, deleteStory, saveNow } = useStory();
  const [menuOpen, setMenuOpen] = useState(false);

  const onNew = () => {
    const name = window.prompt(t('header.newStory') + '?', 'Untitled');
    if (name) { addStory(name); toast(t('toast.newStory'), '✨'); }
  };
  const onRename = () => {
    const name = window.prompt(t('header.rename'), story?.name ?? '');
    if (name) { renameStory(name); toast(t('toast.rename'), '✏️'); }
  };
  const onDelete = () => {
    if (window.confirm(t('toast.deletePrompt'))) { deleteStory(); toast(t('common.delete'), '🗑'); }
  };
  const onSync = () => { saveNow(); toast(t('toast.synced'), '🔄'); };
  const onExportMd = async () => {
    try {
      const r = await fetch('/api/export-md', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((x) => x.json());
      toast(r?.ok ? t('toast.exportedMd') : (r?.error ?? 'error'), r?.ok ? '📝' : '⚠️');
    } catch { toast(t('common.offline'), '⚠️'); }
  };
  // เลือกในเมนู ⋯ แล้วปิดเมนู
  const pick = (fn: () => void) => () => { setMenuOpen(false); fn(); };
  const menuItem = 'flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-xl text-[14px] font-bold text-ink hover:bg-ink/[.05] transition';

  return (
    <header className="shrink-0 relative z-50 bg-white/80 backdrop-blur border-b border-line px-3 sm:px-4 lg:px-6 py-3 flex items-center gap-2 sm:gap-3">
      <button
        onClick={onToggleNav}
        title={t('common.toggleNav')}
        aria-label={t('common.toggleNav')}
        className="h-9 w-9 grid place-items-center rounded-xl text-xl text-ink/70 hover:bg-ink/[.06] transition active:scale-90 shrink-0"
      >
        ☰
      </button>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-2xl floaty">📖</span>
        <span className="font-display text-xl font-semibold text-ink hidden lg:block whitespace-nowrap">Novel Studio</span>
      </div>
      <div className="min-w-0 flex-1 md:flex-none"><StorySelector /></div>

      {/* เดสก์ท็อป: จัดการเรื่อง */}
      <div className="hidden md:flex items-center gap-1.5">
        <Btn variant="ghost" size="sm" onClick={onNew}>＋ {t('header.newStory')}</Btn>
        <Btn variant="ghost" size="sm" onClick={onRename}>✏️ {t('header.rename')}</Btn>
        <Btn variant="ghost" size="sm" onClick={onDelete}>🗑 {t('header.deleteStory')}</Btn>
      </div>

      <SaveIndicator status={status} variant="inline" />

      {/* เดสก์ท็อป: spacer + actions ขวา */}
      <div className="hidden md:block flex-1" />
      <div className="hidden md:flex items-center gap-1.5">
        <Btn variant="soft" color="sky" size="sm" onClick={onSync}>🔄 <span className="hidden lg:inline">{t('header.syncDb')}</span></Btn>
        <Btn variant="soft" color="sun" size="sm" onClick={onExportMd}>📝 <span className="hidden lg:inline">{t('header.md')}</span></Btn>
        <LangToggle />
      </div>

      {/* มือถือ: เมนู ⋯ รวม actions ทั้งหมด */}
      <div className="md:hidden relative shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="More"
          className="h-9 w-9 grid place-items-center rounded-xl text-xl text-ink/70 hover:bg-ink/[.06] transition active:scale-90"
        >
          ⋯
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-ink/10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-11 z-50 w-56 bg-white rounded-2xl shadow-pop border border-line p-2 anim-pop flex flex-col gap-0.5">
              <button className={menuItem} onClick={pick(onNew)}>＋ {t('header.newStory')}</button>
              <button className={menuItem} onClick={pick(onRename)}>✏️ {t('header.rename')}</button>
              <button className={menuItem} onClick={pick(onDelete)}>🗑 {t('header.deleteStory')}</button>
              <div className="h-px bg-line my-1" />
              <button className={menuItem} onClick={pick(onSync)}>🔄 {t('header.syncDb')}</button>
              <button className={menuItem} onClick={pick(onExportMd)}>📝 {t('header.md')}</button>
              <div className="h-px bg-line my-1" />
              <div className="px-2 py-1.5"><LangToggle /></div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
