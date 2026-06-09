'use client';
// "ความสัมพันธ์ที่มีผล" ณ บทที่เลือก — ไฮไลต์เส้นที่เพิ่งเปลี่ยนในบทนี้ (+++)
import { Card, Avatar } from '@/components/ui';
import { pal } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import type { Char, Relation } from '@/lib/types';
import { charInitial, charColor } from '@/components/screens/characters/util';
import { relTypeAt } from './arc';
import { RelLine, RelTag } from './RelThread';

interface RelationsInEffectProps {
  chars: Char[];
  rels: Relation[];
  ch: number;
}

export function RelationsInEffect({ chars, rels, ch }: RelationsInEffectProps) {
  const { t } = useI18n();
  const byId = (id?: string) => chars.find((c) => c.id === id);
  const ADD = pal('mint');

  const active = rels
    .map((r) => ({ r, cur: relTypeAt(r, ch) }))
    .filter((x) => x.cur);

  return (
    <Card className="p-4">
      <p className="text-muted font-bold text-[13px] mb-3">{t('timeline.relsInEffect')}</p>
      {active.length === 0 ? (
        <p className="text-[13px] text-muted font-semibold">{t('timeline.noRelsYet')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {active.map(({ r, cur }) => {
            const a = byId(r.from); const b = byId(r.to);
            const isNew = cur!.ch === ch;
            return (
              <div
                key={r.id}
                className="flex items-center gap-2.5 rounded-2xl px-3 py-2 border"
                style={isNew ? { background: ADD.soft, borderColor: ADD.tint } : { background: '#fff', borderColor: '#EFE7D8' }}
              >
                <Avatar initial={a ? charInitial(a) : '?'} color={a ? charColor(a) : 'slate'} size={22} />
                <Avatar initial={b ? charInitial(b) : '?'} color={b ? charColor(b) : 'slate'} size={22} />
                <span className="font-bold text-[13px] text-ink truncate">{a?.name ?? r.from} & {b?.name ?? r.to}</span>
                {isNew && <span className="text-[10px] font-extrabold text-white rounded-md px-1.5 py-0.5 shrink-0" style={{ background: ADD.c }}>+++</span>}
                <span className="ml-auto flex items-center gap-2 shrink-0">
                  <RelLine type={cur!.type} />
                  <RelTag type={cur!.type} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
