'use client';
// "ตัวละครในเรื่อง" — กริดการ์ดเฉพาะตัวที่ปรากฏแล้ว ณ บทที่เลือก + นับที่ยังไม่โผล่
import { Card } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import type { Char, Relation } from '@/lib/types';
import { introducedBy, hasChangeAt } from './arc';
import { CharStateCard } from './CharStateCard';

interface CharactersInPlayProps {
  chars: Char[];
  rels: Relation[];
  ch: number;
  onOpen: (id: string) => void;
}

export function CharactersInPlay({ chars, rels, ch, onOpen }: CharactersInPlayProps) {
  const { t } = useI18n();
  const inPlay = chars.filter((c) => introducedBy(c, ch));
  const notYet = chars.length - inPlay.length;

  return (
    <Card className="p-4">
      <p className="text-muted font-bold text-[13px] mb-3">
        {t('timeline.charsInPlay', { n: inPlay.length, total: chars.length })} · {t('timeline.clickForState')}
      </p>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {inPlay.map((c) => (
          <CharStateCard key={c.id} char={c} ch={ch} changed={hasChangeAt(c, rels, ch)} onOpen={() => onOpen(c.id)} />
        ))}
      </div>
      {notYet > 0 && (
        <p className="text-[13px] text-muted font-semibold mt-3">
          {t(notYet > 1 ? 'timeline.notIntroducedPlural' : 'timeline.notIntroduced', { n: notYet })}
        </p>
      )}
    </Card>
  );
}
