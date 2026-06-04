'use client';
import { useI18n } from '@/lib/i18n';
import { pal, cx } from '@/lib/theme';

interface ChapterRowProps {
  title: string;
  words: number;
  idx: number;
  active: boolean;
  onClick: () => void;
}

/** แถวบทในลิสต์ซ้าย */
export function ChapterRow({ title, words, idx, active, onClick }: ChapterRowProps) {
  const { t } = useI18n();
  return (
    <button onClick={onClick}
      className={cx('w-full text-left rounded-3xl p-3 pr-2.5 transition border-2 group', active ? 'bg-white shadow-soft' : 'border-transparent hover:bg-white/60')}
      style={active ? { borderColor: pal('sky').c } : {}}>
      <div className="flex items-center gap-2.5">
        <span className="h-7 w-7 rounded-xl grid place-items-center font-display font-semibold text-sm shrink-0" style={{ background: active ? pal('sky').c : '#ECE2D1', color: active ? '#fff' : '#988C7C' }}>{idx + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-ink truncate text-[15px]">{title || t('chapters.untitled')}</div>
          <div className="text-[12px] font-bold text-muted">{t('chapters.words', { n: words.toLocaleString() })}</div>
        </div>
        <span className="opacity-0 group-hover:opacity-100 transition text-muted cursor-grab">⠿</span>
      </div>
    </button>
  );
}
