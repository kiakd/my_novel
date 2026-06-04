'use client';
import { Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import { StorySelector } from './StorySelector';
import { SaveIndicator } from './SaveIndicator';
import { LangToggle } from './LangToggle';

/** แถบหัวด้านบน: ปุ่มเมนู + โลโก้ + เลือกเรื่อง + จัดการเรื่อง + สถานะเซฟ + actions + ภาษา */
export function Header({ onToggleNav }: { onToggleNav?: () => void }) {
  const { t } = useI18n();
  const { status, story, addStory, renameStory, deleteStory, saveNow } = useStory();

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

  return (
    <header className="shrink-0 bg-white/80 backdrop-blur border-b border-line px-4 lg:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          onClick={onToggleNav}
          title={t('common.toggleNav')}
          aria-label={t('common.toggleNav')}
          className="h-9 w-9 grid place-items-center rounded-xl text-xl text-ink/70 hover:bg-ink/[.06] transition active:scale-90 shrink-0"
        >
          ☰
        </button>
        <div className="flex items-center gap-2 pr-1">
          <span className="text-2xl floaty">📖</span>
          <span className="font-display text-xl font-semibold text-ink hidden sm:block whitespace-nowrap">Novel Studio</span>
        </div>
        <StorySelector />
        <div className="hidden md:flex items-center gap-1.5">
          <Btn variant="ghost" size="sm" onClick={onNew}>＋ {t('header.newStory')}</Btn>
          <Btn variant="ghost" size="sm" onClick={onRename}>✏️ {t('header.rename')}</Btn>
          <Btn variant="ghost" size="sm" onClick={onDelete}>🗑 {t('header.deleteStory')}</Btn>
        </div>
        <SaveIndicator status={status} variant="inline" />
      </div>
      <div className="flex items-center gap-1.5">
        <Btn variant="soft" color="sky" size="sm" onClick={onSync}>🔄 <span className="hidden lg:inline">{t('header.syncDb')}</span></Btn>
        <Btn variant="soft" color="sun" size="sm" onClick={onExportMd}>📝 <span className="hidden lg:inline">{t('header.md')}</span></Btn>
        <LangToggle />
      </div>
    </header>
  );
}
