'use client';
import { pal, cx } from '@/lib/theme';
import { wordCount, type Chapter } from '@/lib/chapter';
import type { ChapterStatus } from '@/lib/types';
import { ReaderStorySelect } from './ReaderStorySelect';

interface ReaderTocProps {
  open: boolean;
  onClose: () => void;
  chapters: Chapter[];
  currentId: string | null;
  onPick: (id: string) => void;
  chrome: string;
  fg: string;
  faint: string;
  border: string;
  labels: { toc: string; story: string; untitled: string; words: (n: number) => string };
}

const DOT: Record<ChapterStatus, string> = { done: pal('mint').c, draft: pal('sun').c, empty: '#b9b0a3' };

/** สารบัญแบบสไลด์จากซ้าย (ธีมตามโหมดอ่าน) */
export function ReaderToc({ open, onClose, chapters, currentId, onPick, chrome, fg, faint, border, labels }: ReaderTocProps) {
  const accent = pal('sun').c;
  return (
    <div className={cx('fixed inset-0 z-[70]', !open && 'pointer-events-none')}>
      <div
        className={cx('absolute inset-0 bg-black/45 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className="absolute top-0 left-0 h-full w-[310px] max-w-[86vw] overflow-auto transition-transform duration-300 shadow-2xl"
        style={{ background: chrome, borderRight: `1px solid ${border}`, transform: open ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="px-5 py-4 sticky top-0 z-10" style={{ background: chrome, borderBottom: `1px solid ${border}` }}>
          <div className="font-display font-bold text-lg mb-3" style={{ color: fg }}>{labels.toc}</div>
          <ReaderStorySelect fg={fg} faint={faint} border={border} label={labels.story} />
        </div>
        <div className="p-2 flex flex-col gap-0.5">
          {chapters.map((c, i) => {
            const active = c.id === currentId;
            const st = (c.status ?? 'empty') as ChapterStatus;
            return (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="text-left rounded-xl px-3 py-2.5 flex items-center gap-2.5 transition active:scale-[.99]"
                style={{ background: active ? 'rgba(233,165,43,.16)' : 'transparent' }}
              >
                <span className="font-extrabold text-xs tabular-nums" style={{ color: active ? accent : faint, minWidth: 20 }}>{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate font-semibold" style={{ color: active ? accent : fg }}>{c.title?.trim() || labels.untitled}</span>
                  <span className="block text-[11px] font-bold" style={{ color: faint }}>{labels.words(wordCount(c.content))}</span>
                </span>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: DOT[st], flex: '0 0 auto' }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
