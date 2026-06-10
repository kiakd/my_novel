'use client';
import type { ChatItem } from '@/lib/chat-types';

const kindHint = (it: ChatItem) =>
  it.kind === 'boost' ? `${(it.amount ?? 0) >= 0 ? '+' : ''}${it.amount}` :
  it.kind === 'set' ? `→ ${it.amount}` : 'ล้าง';

/** แถบไอเท็ม/ของโกง — กดเพื่อใช้กับตัวละครที่กำลังแชท */
export function ItemBar({ items, onUse, disabled }: { items: ChatItem[]; onUse: (it: ChatItem) => void; disabled?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      <span className="text-[12px] font-bold text-muted shrink-0 self-center pr-1">🎒 ของโกง:</span>
      {items.map((it) => (
        <button key={it.id} disabled={disabled} onClick={() => onUse(it)} title={it.note}
          className="shrink-0 rounded-full border-2 border-line bg-white px-3 py-1.5 text-[12.5px] font-bold hover:border-grape hover:bg-grape/5 disabled:opacity-40 transition flex items-center gap-1">
          <span>{it.emoji}</span>
          <span>{it.name}</span>
          <span className="text-muted font-normal tabular-nums">{kindHint(it)}</span>
        </button>
      ))}
    </div>
  );
}
