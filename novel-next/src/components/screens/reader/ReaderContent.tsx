'use client';
import { useRef, type ReactNode } from 'react';
import { hasContent, type Chapter } from '@/lib/chapter';

interface ReaderContentProps {
  chapter: Chapter;
  fontSize: number;
  faint: string;
  chapterLabel: string;
  untitled: string;
  emptyNote: string;
  onProgress: (p: number) => void;
  children?: ReactNode; // ReaderNav ต่อท้าย
}

/** เนื้อหาบท — คอลัมน์อ่านจัดกลาง render HTML ผ่าน .ns-reader; คุม scroll + รายงาน progress */
export function ReaderContent({
  chapter, fontSize, faint, chapterLabel, untitled, emptyNote, onProgress, children,
}: ReaderContentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    onProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
  };
  const empty = !hasContent(chapter.content);
  return (
    <div ref={ref} onScroll={onScroll} className="flex-1 overflow-auto">
      <article className="mx-auto w-full px-5 sm:px-7 py-9 sm:py-14" style={{ maxWidth: 680, fontSize }}>
        <div className="text-[11px] font-extrabold tracking-[.18em] uppercase mb-2" style={{ color: faint }}>{chapterLabel}</div>
        <h1 className="ns-reader-title font-display mb-8" style={{ fontSize: '1.7em' }}>{chapter.title?.trim() || untitled}</h1>
        {empty ? (
          <p style={{ color: faint }}>{emptyNote}</p>
        ) : (
          <div className="ns-reader" dangerouslySetInnerHTML={{ __html: chapter.content ?? '' }} />
        )}
        {children}
      </article>
    </div>
  );
}
