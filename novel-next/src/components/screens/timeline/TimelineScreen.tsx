'use client';
// หน้า Timeline = "Chapter digest" (ตาม wireframe) — เลือกบทแล้วเห็นสถานะเรื่อง ณ บทนั้น
// ตัวละคร/สกิล/สถานะ/ความสัมพันธ์ + ไฮไลต์สิ่งที่เพิ่งเปลี่ยน (+++) · คลิกตัวละครดู state card
import { useEffect, useState } from 'react';
import { SectionTitle, EmptyState } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import { chapterRefs, changesAt } from './arc';
import { ChapterSelector } from './ChapterSelector';
import { ChapterDigest } from './ChapterDigest';
import { CharactersInPlay } from './CharactersInPlay';
import { RelationsInEffect } from './RelationsInEffect';
import { CharStateModal } from './CharStateModal';

export function TimelineScreen() {
  const { t } = useI18n();
  const { story, activeStoryId } = useStory();
  const [ch, setCh] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  const chapters = chapterRefs(story?.chapters ?? [], story?.timeline ?? []);
  const total = chapters.length;

  // clamp ch ให้อยู่ในช่วงบทที่มีจริง (กันค่าเกินตอนสลับเรื่อง)
  useEffect(() => {
    if (!total) return;
    setCh((c) => Math.min(total, Math.max(1, c)));
  }, [total]);

  if (!story || total === 0) {
    return (
      <div className="max-w-5xl mx-auto">
        <SectionTitle emoji="⏱️" color="sun" title={t('timeline.title')} sub={t('timeline.sub')} />
        <EmptyState emoji="📖" color="sun" title={t('reader.emptyTitle')} sub={t('reader.emptySub')} />
      </div>
    );
  }

  const safeCh = Math.min(total, Math.max(1, ch));
  const current = chapters.find((c) => c.num === safeCh)!;
  const chars = story.characters ?? [];
  const rels = story.relations ?? [];
  const changes = changesAt(chars, rels, story.timeline ?? [], current.id, safeCh);
  const openChar = openId ? chars.find((c) => c.id === openId) ?? null : null;

  return (
    <div className="max-w-6xl mx-auto">
      <SectionTitle emoji="⏱️" color="sun" title={t('timeline.title')} sub={t('timeline.sub')} />

      <div className="flex flex-col gap-4">
        <ChapterSelector chapters={chapters} ch={safeCh} onSet={setCh} />

        <div className="flex gap-4 items-start flex-wrap lg:flex-nowrap">
          <ChapterDigest storyId={activeStoryId} chapter={current} changes={changes} />
          <div className="flex-1 min-w-[300px] flex flex-col gap-4">
            <CharactersInPlay chars={chars} rels={rels} ch={safeCh} onOpen={setOpenId} />
            <RelationsInEffect chars={chars} rels={rels} ch={safeCh} />
          </div>
        </div>
      </div>

      {openChar && (
        <CharStateModal
          storyId={activeStoryId}
          char={openChar}
          chars={chars}
          rels={rels}
          chapters={chapters}
          ch={safeCh}
          onSet={setCh}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
