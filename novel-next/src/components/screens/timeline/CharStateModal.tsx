'use client';
// Overlay สถานะตัวละคร ณ บทที่เลือก — rail เลื่อนบท + แบนเนอร์ของใหม่ + แกลเลอรีอ้างอิง + การ์ด state ทุกหมวด
import { useState } from 'react';
import { Modal, Avatar, IconBtn, Btn } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { Char, Relation } from '@/lib/types';
import { charInitial, charColor } from '@/components/screens/characters/util';
import type { ChapterRef } from './arc';
import { richState } from './arc';
import { ChapterRail } from './ChapterRail';
import { WhatsNewBanner } from './WhatsNewBanner';
import { StateCard, StateItem } from './StateCard';
import { SlotGallery } from './SlotGallery';
import { ImageSlot } from './ImageSlot';
import { RelLine } from './RelThread';
import { ArcEditor } from './ArcEditor';

interface CharStateModalProps {
  storyId: string;
  char: Char;
  chars: Char[];
  rels: Relation[];
  chapters: ChapterRef[];
  ch: number;
  onSet: (n: number) => void;
  onClose: () => void;
}

export function CharStateModal({ storyId, char, chars, rels, chapters, ch, onSet, onClose }: CharStateModalProps) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const color = charColor(char);
  const cur = chapters.find((c) => c.num === ch);
  const S = richState(char, rels, ch);
  const nameOf = (id: string) => chars.find((c) => c.id === id)?.name ?? id;
  const colorOf = (id: string) => { const c = chars.find((x) => x.id === id); return c ? charColor(c) : 'slate'; };
  const subLabel = (sub?: string) => t(`timeline.lookSub.${sub || 'item'}`);

  // ชิปสำหรับแบนเนอร์ "ใหม่ในบทนี้"
  const chips: string[] = [];
  S.skills.filter((x) => x.isNew).forEach((x) => chips.push(`${t('timeline.kind.skill')} · ${x.label}`));
  if (S.mindset?.isNew) chips.push(`${t('timeline.kind.mindset')} → ${S.mindset.label}`);
  if (S.status?.isNew) chips.push(`${t('timeline.kind.status')} → ${S.status.label}`);
  S.look.filter((x) => x.isNew).forEach((x) => chips.push(`${subLabel(x.sub)} · ${x.label}`));
  S.milestones.filter((x) => x.isNew).forEach((x) => chips.push(`${t('timeline.kind.milestone')} · ${x.label}`));
  S.bonds.filter((x) => x.isNew).forEach((x) => chips.push(`${x.brandNew ? t('timeline.newBond') + ' · ' : t('timeline.bond') + ' → '}${nameOf(x.other)} · ${x.type}`));

  return (
    <Modal open onClose={onClose} size="lg">
      {/* header */}
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur px-6 pt-5 pb-3 border-b border-line flex items-center gap-3.5">
        <Btn variant="outline" color={color} size="sm" onClick={onClose}>‹ {t('timeline.backToDigest')}</Btn>
        <Avatar initial={charInitial(char)} color={color} size={48} ring />
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-semibold text-ink leading-none truncate">{char.name}</h2>
          <div className="text-[12.5px] text-muted mt-1">{t('timeline.stateAsOf', { n: ch, title: cur?.title ?? '' })}</div>
        </div>
        <Btn variant={editing ? 'primary' : 'soft'} color={editing ? 'mint' : 'slate'} size="sm" className="ml-auto" onClick={() => setEditing((v) => !v)}>
          {editing ? `✓ ${t('common.done')}` : `✎ ${t('timeline.edit')}`}
        </Btn>
        <IconBtn onClick={onClose} title={t('common.close')}>✕</IconBtn>
      </div>

      <div className="p-6 pt-5 flex flex-col gap-4">
        {/* arc editor (โหมดแก้ไข) */}
        {editing && (
          <div>
            <p className="text-muted font-bold text-[13px] mb-1.5">{t('timeline.editHint')}</p>
            <ArcEditor char={char} chapters={chapters} defaultCh={ch} />
          </div>
        )}

        {/* chapter rail */}
        <div>
          <p className="text-muted font-bold text-[13px] mb-1.5">{t('timeline.stepChapters')}</p>
          <ChapterRail chapters={chapters} char={char} rels={rels} ch={ch} onSet={onSet} />
        </div>

        {/* whats-new */}
        <WhatsNewBanner
          title={t('timeline.newInCh', { n: ch, title: cur?.title ?? '' })}
          emptyText={t('timeline.noChangesFor', { name: char.name, n: ch })}
          chips={chips}
        />

        {/* reference gallery */}
        <div>
          <p className="text-muted font-bold text-[13px] mb-2">{t('timeline.refGallery', { name: char.name })}</p>
          <SlotGallery galKey={`${storyId}-char-${char.id}`} placeholder={char.name} start={2} w={130} h={120} radius={14} />
        </div>

        {/* state cards */}
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          <StateCard title={t('timeline.skills')} count={S.skills.length} empty={!S.skills.length}>
            {S.skills.map((x, i) => (
              <StateItem key={i} dotKind="skill" label={x.label} isNew={x.isNew} meta={t('timeline.gainedCh', { n: x.ch })} why={x.isNew ? x.why : null} />
            ))}
          </StateCard>

          <StateCard title={t('timeline.mindset')} empty={!S.mindset}>
            {S.mindset && (
              <StateItem
                dotKind="mindset"
                label={S.mindset.label}
                isNew={S.mindset.isNew}
                meta={S.mindset.prev ? t('timeline.wasSince', { prev: S.mindset.prev.label, n: S.mindset.ch }) : t('timeline.sinceCh', { n: S.mindset.ch })}
                why={S.mindset.isNew ? S.mindset.why : null}
              />
            )}
          </StateCard>

          <StateCard title={t('timeline.status')} empty={!S.status}>
            {S.status && (
              <StateItem
                dotKind="status"
                label={S.status.label}
                isNew={S.status.isNew}
                meta={S.status.prev ? t('timeline.wasSince', { prev: S.status.prev.label, n: S.status.ch }) : t('timeline.sinceCh', { n: S.status.ch })}
                why={S.status.isNew ? S.status.why : null}
              />
            )}
          </StateCard>

          <StateCard title={t('timeline.lookGear')} empty={!S.look.length}>
            {S.look.map((x, i) => (
              <StateItem
                key={i}
                isNew={x.isNew}
                leading={<ImageSlot slotKey={`${storyId}-look-${char.id}-${x.sub}-${x.ch}`} placeholder={subLabel(x.sub)} w={48} h={48} radius={8} />}
                label={<span><span className="text-[9.5px] font-extrabold uppercase tracking-wide text-muted border border-line rounded px-1 py-0.5 mr-1.5">{subLabel(x.sub)}</span>{x.label}</span>}
                meta={t('timeline.sinceCh', { n: x.ch })}
                why={x.isNew ? x.why : null}
              />
            ))}
          </StateCard>

          <StateCard title={t('timeline.milestones')} count={S.milestones.length} empty={!S.milestones.length}>
            {S.milestones.map((x, i) => (
              <StateItem key={i} dotKind="milestone" label={x.label} isNew={x.isNew} meta={`Ch${x.ch}`} why={x.isNew ? x.why : null} />
            ))}
          </StateCard>

          <StateCard title={t('timeline.bonds')} count={S.bonds.length} empty={!S.bonds.length}>
            {S.bonds.map((x, i) => (
              <StateItem
                key={i}
                isNew={x.isNew}
                leading={<Avatar initial={charInitial(chars.find((c) => c.id === x.other) ?? ({ name: x.other } as Char))} color={colorOf(x.other)} size={24} className="mt-0.5" />}
                label={`${nameOf(x.other)} · ${x.type}`}
                meta={x.brandNew ? t('timeline.formedCh', { n: x.ch }) : x.prev ? t('timeline.wasChanged', { prev: x.prev.type, n: x.ch }) : t('timeline.sinceCh', { n: x.ch })}
                trailing={<span className="mt-2"><RelLine type={x.type} width={28} /></span>}
              />
            ))}
          </StateCard>
        </div>
      </div>
    </Modal>
  );
}
