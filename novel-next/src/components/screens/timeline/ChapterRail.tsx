'use client';
// แถบเลื่อนทีละบทใน overlay — บทปัจจุบันเด่น, บทที่ตัวละครมีการเปลี่ยนมีจุด +++, บทก่อนปรากฏจางลง
import { pal, cx } from '@/lib/theme';
import type { Char, Relation } from '@/lib/types';
import type { ChapterRef } from './arc';
import { introducedBy, hasChangeAt } from './arc';

interface ChapterRailProps {
  chapters: ChapterRef[];
  char: Char;
  rels: Relation[];
  ch: number;
  onSet: (n: number) => void;
}

export function ChapterRail({ chapters, char, rels, ch, onSet }: ChapterRailProps) {
  const ADD = pal('mint');
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chapters.map((c) => {
        const on = c.num === ch;
        const has = hasChangeAt(char, rels, c.num);
        const intro = introducedBy(char, c.num);
        return (
          <button
            key={c.id}
            onClick={() => onSet(c.num)}
            className={cx('rounded-lg border-2 px-2 py-1 text-[12px] font-extrabold leading-none text-center min-w-[42px] transition', on ? 'text-ink' : 'text-muted')}
            style={{
              borderColor: on ? '#2A2724' : has ? ADD.tint : '#E6DCC9',
              background: on ? '#FBF6EC' : '#fff',
              boxShadow: on ? '2px 2px 0 #2A2724' : undefined,
              opacity: intro ? 1 : 0.4,
            }}
          >
            Ch{c.num}
            {has && <span className="block text-[9px] mt-0.5" style={{ color: ADD.c }}>+++</span>}
          </button>
        );
      })}
    </div>
  );
}
