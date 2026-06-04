'use client';
import { useState, useEffect } from 'react';

interface ToastItem { id: string; msg: string; emoji?: string }

/** เรียกได้จากทุกที่: toast('saved','💾') — ไม่ผูกกับ context */
export function toast(msg: string, emoji?: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { msg, emoji } }));
}

/** วางครั้งเดียวใน root layout */
export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const h = (e: Event) => {
      const detail = (e as CustomEvent).detail as { msg: string; emoji?: string };
      const id = Math.random().toString(36);
      setItems((x) => [...x, { id, ...detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2600);
    };
    window.addEventListener('app-toast', h);
    return () => window.removeEventListener('app-toast', h);
  }, []);

  return (
    <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 items-center pointer-events-none">
      {items.map((i) => (
        <div
          key={i.id}
          className="anim-pop bg-ink text-cream pl-3 pr-4 py-2.5 rounded-full shadow-pop font-bold text-sm flex items-center gap-2"
        >
          <span className="text-base">{i.emoji || '✨'}</span>
          {i.msg}
        </div>
      ))}
    </div>
  );
}
