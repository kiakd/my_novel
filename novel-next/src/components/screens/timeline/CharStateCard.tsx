'use client';
// การ์ดสรุปตัวละคร ณ บทที่เลือก — คลิกเพื่อเปิด state overlay; ป้าย +++ ถ้าเปลี่ยนในบทนี้
import { Avatar } from '@/components/ui';
import { pal, cx } from '@/lib/theme';
import type { Char } from '@/lib/types';
import { charInitial, charColor } from '@/components/screens/characters/util';
import { charStateAt } from './arc';

interface CharStateCardProps {
  char: Char;
  ch: number;
  changed: boolean;
  onOpen: () => void;
}

export function CharStateCard({ char, ch, changed, onOpen }: CharStateCardProps) {
  const st = charStateAt(char, ch);
  const color = charColor(char);
  const ADD = pal('mint');

  return (
    <button
      onClick={onOpen}
      className={cx(
        'relative text-left bg-white rounded-3xl border p-3 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-pop',
        changed ? 'border-transparent' : 'border-line',
      )}
      style={changed ? { boxShadow: `0 0 0 2px ${ADD.tint}` } : undefined}
    >
      {changed && (
        <span className="absolute top-2.5 right-2.5 text-[10px] font-extrabold text-white rounded-md px-1.5 py-0.5" style={{ background: ADD.c }}>+++</span>
      )}
      <div className="flex items-center gap-2 mb-2">
        <Avatar initial={charInitial(char)} color={color} size={28} />
        <span className="font-bold text-[14px] text-ink truncate">{char.name}</span>
      </div>
      <div className="text-[12px] text-muted leading-relaxed">
        <div>skill: <b className="text-ink font-bold">{st.skill || '—'}</b></div>
        <div>mindset: <b className="text-ink font-bold">{st.mindset || '—'}</b></div>
        <div>status: <b className="text-ink font-bold">{st.status || '—'}</b></div>
      </div>
    </button>
  );
}
