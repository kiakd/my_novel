'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStory } from '@/lib/store/StoryProvider';
import { useReaderPrefs, READER_THEMES, getLastChapter, setLastChapter } from '@/lib/store/readerPrefs';
import { useI18n } from '@/lib/i18n';
import { sortChapters, hasContent } from '@/lib/chapter';
import { EmptyState, Btn, Spinner } from '@/components/ui';
import { ReaderTopBar } from './ReaderTopBar';
import { ReaderToc } from './ReaderToc';
import { ReaderContent } from './ReaderContent';
import { ReaderNav } from './ReaderNav';
import { ReaderSettings } from './ReaderSettings';

/** โหมดอ่าน — immersive เต็มจอ (ทับ AppShell) อ่าน story.chapters */
export function ReaderScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { story, activeStoryId, loaded } = useStory();
  const { prefs, update, hydrated } = useReaderPrefs();

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const chapters = useMemo(() => sortChapters(story?.chapters ?? []), [story]);

  // เลือกบทเริ่มต้น: บทล่าสุดที่อ่าน → บทแรกที่มีเนื้อหา → บทแรก
  useEffect(() => {
    if (!hydrated || !chapters.length) return;
    setCurrentId((cur) => {
      if (cur && chapters.some((c) => c.id === cur)) return cur;
      const last = getLastChapter(activeStoryId);
      if (last && chapters.some((c) => c.id === last)) return last;
      return (chapters.find((c) => hasContent(c.content)) ?? chapters[0]).id;
    });
  }, [hydrated, chapters, activeStoryId]);

  const idx = chapters.findIndex((c) => c.id === currentId);
  const current = idx >= 0 ? chapters[idx] : null;

  // จำบทล่าสุด
  useEffect(() => {
    if (current && activeStoryId) setLastChapter(activeStoryId, current.id);
  }, [current, activeStoryId]);

  const theme = READER_THEMES[prefs.theme];
  const exit = () => router.push('/chapters');
  const pick = (id: string) => { setCurrentId(id); setTocOpen(false); };
  const step = (d: number) => { const n = chapters[idx + d]; if (n) setCurrentId(n.id); };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: theme.bg, color: theme.fg }}>
      <ReaderTopBar
        title={current?.title?.trim() || (loaded ? t('reader.title') : '')}
        progress={progress}
        chrome={theme.chrome} fg={theme.fg} border={theme.border}
        onExit={exit} onToc={() => setTocOpen(true)} onSettings={() => setSetOpen((v) => !v)}
        labels={{ exit: t('reader.exit'), toc: t('reader.toc'), settings: t('reader.settings') }}
      />

      {!loaded || !hydrated ? (
        <div className="flex-1 grid place-items-center"><Spinner /></div>
      ) : current ? (
        <ReaderContent
          key={current.id}
          chapter={current}
          fontSize={prefs.fontSize}
          faint={theme.faint}
          chapterLabel={t('reader.chapterN', { n: idx + 1 })}
          untitled={t('reader.untitled')}
          emptyNote={t('reader.chapterEmpty')}
          onProgress={setProgress}
        >
          <ReaderNav
            idx={idx} total={chapters.length}
            onPrev={() => step(-1)} onNext={() => step(1)}
            faint={theme.faint} border={theme.border}
            labels={{ prev: t('reader.prev'), next: t('reader.next'), counter: t('reader.chapterOf', { n: idx + 1, total: chapters.length }) }}
          />
        </ReaderContent>
      ) : (
        <div className="flex-1 grid place-items-center px-6">
          <EmptyState
            emoji="📚" color="sun"
            title={t('reader.emptyTitle')} sub={t('reader.emptySub')}
            action={<Btn variant="primary" color="sun" onClick={exit}>{t('reader.goWrite')}</Btn>}
          />
        </div>
      )}

      <ReaderToc
        open={tocOpen} onClose={() => setTocOpen(false)}
        chapters={chapters} currentId={currentId} onPick={pick}
        chrome={theme.chrome} fg={theme.fg} faint={theme.faint} border={theme.border}
        labels={{ toc: t('reader.toc'), story: t('reader.story'), untitled: t('reader.untitled'), words: (n: number) => t('reader.words', { n: n.toLocaleString() }) }}
      />

      <ReaderSettings
        open={setOpen} onClose={() => setSetOpen(false)}
        prefs={prefs} update={update}
        chrome={theme.chrome} fg={theme.fg} faint={theme.faint} border={theme.border}
        labels={{ fontSize: t('reader.fontSize'), theme: t('reader.theme'), paper: t('reader.themePaper'), sepia: t('reader.themeSepia'), night: t('reader.themeNight') }}
      />
    </div>
  );
}
