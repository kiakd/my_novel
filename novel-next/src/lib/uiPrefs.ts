'use client';
// ============ UI prefs (localStorage) — ขนาดตัวอักษรแชท ฯลฯ แยกจาก DB ============
import { useCallback, useEffect, useState } from 'react';

const LS_CHAT_FONT = 'ns_chat_fontsize';
export const CHAT_FONT_MIN = 12;
export const CHAT_FONT_MAX = 24;
export const CHAT_FONT_DEFAULT = 15;
const STEP = 1;
const clamp = (n: number) => Math.min(CHAT_FONT_MAX, Math.max(CHAT_FONT_MIN, n));

/** ขนาดตัวอักษรในหน้าต่างแชท (px) — ปรับด้วย A−/A+ เก็บถาวร */
export function useChatFontSize() {
  const [size, setSize] = useState(CHAT_FONT_DEFAULT);

  useEffect(() => {
    try { const v = Number(localStorage.getItem(LS_CHAT_FONT)); if (v) setSize(clamp(v)); } catch { /* ignore */ }
  }, []);

  const persist = (v: number) => { try { localStorage.setItem(LS_CHAT_FONT, String(v)); } catch { /* ignore */ } };
  const set = useCallback((n: number) => setSize(() => { const v = clamp(n); persist(v); return v; }), []);
  const inc = useCallback(() => setSize((p) => { const v = clamp(p + STEP); persist(v); return v; }), []);
  const dec = useCallback(() => setSize((p) => { const v = clamp(p - STEP); persist(v); return v; }), []);

  return { size, set, inc, dec };
}
