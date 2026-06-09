'use client';
// คอลัมน์ซ้ายของ digest — หัวบท + คำอธิบาย + แกลเลอรีฉาก + "อะไรเปลี่ยนในบทนี้"
import { Card, Tag } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { Change, ChapterRef } from './arc';
import { WhatChanged } from './WhatChanged';
import { SlotGallery } from './SlotGallery';

interface ChapterDigestProps {
  storyId: string;
  chapter: ChapterRef;
  changes: Change[];
}

export function ChapterDigest({ storyId, chapter, changes }: ChapterDigestProps) {
  const { t } = useI18n();

  return (
    <Card className="p-5 flex-1 min-w-[300px]">
      <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
        <h3 className="font-display text-2xl font-semibold text-ink leading-tight">
          {t('reader.chapterN', { n: chapter.num })} · {chapter.title}
        </h3>
        {chapter.importance === 'pivotal' && <Tag color="bubble">✦ {t('timeline.pivotal')}</Tag>}
      </div>
      {chapter.blurb && <p className="text-[14.5px] text-muted font-semibold leading-relaxed mb-4">{chapter.blurb}</p>}

      <p className="text-muted font-bold text-[13px] mb-2">{t('timeline.scenes')}</p>
      <SlotGallery galKey={`${storyId}-scene-ch${chapter.num}`} placeholder="Scene" start={2} w={116} h={94} radius={12} />

      <p className="text-muted font-bold text-[13px] mt-5 mb-2">{t('timeline.whatChanges')}</p>
      <WhatChanged changes={changes} />
    </Card>
  );
}
