'use client';
// แถบเลือกบท — ‹ ก่อนหน้า · dropdown · ถัดไป › + ตัวนับ "บท n / total"
import { Card, IconBtn, Tag } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { ChapterRef } from './arc';

interface ChapterSelectorProps {
  chapters: ChapterRef[];
  ch: number;
  onSet: (n: number) => void;
}

export function ChapterSelector({ chapters, ch, onSet }: ChapterSelectorProps) {
  const { t } = useI18n();
  const total = chapters.length;
  const cur = chapters.find((c) => c.num === ch);

  return (
    <Card className="p-3 flex items-center gap-3 flex-wrap">
      <IconBtn color="sun" onClick={() => onSet(ch - 1)} disabled={ch <= 1} title={t('reader.prev')}>‹</IconBtn>
      <span className="text-muted font-bold text-sm hidden sm:inline">{t('timeline.showChapter')}</span>
      <div className="relative inline-block">
        <select
          value={ch}
          onChange={(e) => onSet(+e.target.value)}
          className="appearance-none font-bold rounded-full pl-4 pr-9 py-2 border-2 cursor-pointer focus:outline-none max-w-[240px]"
          style={{ borderColor: '#FBEFD3', background: '#fff', color: '#4A4138' }}
        >
          {chapters.map((c) => (
            <option key={c.id} value={c.num}>{t('reader.chapterN', { n: c.num })} · {c.title}</option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-xs">▾</span>
      </div>
      <IconBtn color="sun" onClick={() => onSet(ch + 1)} disabled={ch >= total} title={t('reader.next')}>›</IconBtn>
      <div className="ml-auto flex items-center gap-2">
        {cur?.importance && (
          <Tag color={cur.importance === 'pivotal' ? 'bubble' : cur.importance === 'major' ? 'coral' : 'slate'}>
            {cur.importance === 'pivotal' ? '✦ ' : ''}{t(`timeline.${cur.importance}`)}
          </Tag>
        )}
        <span className="text-muted font-extrabold text-sm whitespace-nowrap">{t('timeline.chapterCount', { n: ch, total })}</span>
      </div>
    </Card>
  );
}
