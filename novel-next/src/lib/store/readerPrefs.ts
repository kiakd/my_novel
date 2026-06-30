'use client';
// ============ Reader prefs — ขนาดอักษร/ธีม/บทล่าสุด (localStorage + sync MongoDB ข้ามเครื่อง) ============
import { useState, useEffect, useCallback } from 'react';
import { notifyPrefChange, PREFS_RECONCILE_EVENT } from '@/lib/prefs-sync';

export type ReaderTheme = 'paper' | 'sepia' | 'night';

export interface ReaderPrefs {
  fontSize: number;   // px ของเนื้อหา
  theme: ReaderTheme;
}

export const FONT_MIN = 16;
export const FONT_MAX = 26;
export const FONT_STEP = 2;
const DEFAULT: ReaderPrefs = { fontSize: 20, theme: 'paper' };

const LS_PREFS = 'ns_reader_prefs';
const LS_LAST = 'ns_reader_last'; // { [storyId]: chapterId }

/** สีของแต่ละธีม (คุมด้วย inline style เพราะ token tailwind เป็นโทนสว่างอย่างเดียว) */
export const READER_THEMES: Record<ReaderTheme, {
  bg: string; fg: string; faint: string; chrome: string; border: string; swatch: string;
}> = {
  paper: { bg: '#fbf6ec', fg: '#3a322a', faint: '#8a7f6e', chrome: '#fffdf8', border: 'rgba(74,65,56,.10)', swatch: '#fbf6ec' },
  sepia: { bg: '#f4e8d0', fg: '#5b4a36', faint: '#9b8868', chrome: '#f8efdc', border: 'rgba(91,74,54,.14)', swatch: '#e9d8b5' },
  night: { bg: '#1a1714', fg: '#d8cfc2', faint: '#8f857a', chrome: '#231f1b', border: 'rgba(216,207,194,.13)', swatch: '#2a2520' },
};

const clampFont = (n: number) => Math.min(FONT_MAX, Math.max(FONT_MIN, n));

/** อ่าน/แก้ prefs พร้อม persist + flag hydrated (กัน SSR mismatch) */
export function useReaderPrefs() {
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT);
  const [hydrated, setHydrated] = useState(false);

  const readLs = useCallback(() => {
    try {
      const raw = localStorage.getItem(LS_PREFS);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrefs((p) => ({ ...p, ...parsed, fontSize: clampFont(parsed.fontSize ?? p.fontSize) }));
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { readLs(); setHydrated(true); }, [readLs]);

  // reconcile จาก DB (prefs-sync) หรือแท็บอื่น → อ่านค่าใหม่จาก localStorage
  useEffect(() => {
    const onSync = () => readLs();
    window.addEventListener(PREFS_RECONCILE_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(PREFS_RECONCILE_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [readLs]);

  const update = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((p) => {
      const next: ReaderPrefs = { ...p, ...patch };
      if (patch.fontSize != null) next.fontSize = clampFont(patch.fontSize);
      try { localStorage.setItem(LS_PREFS, JSON.stringify(next)); } catch { /* ignore */ }
      notifyPrefChange();
      return next;
    });
  }, []);

  return { prefs, update, hydrated };
}

/** บทล่าสุดที่อ่านของ story นั้นๆ */
export function getLastChapter(storyId: string): string | null {
  try { return (JSON.parse(localStorage.getItem(LS_LAST) || '{}') as Record<string, string>)[storyId] ?? null; }
  catch { return null; }
}
export function setLastChapter(storyId: string, chapterId: string): void {
  try {
    const m = JSON.parse(localStorage.getItem(LS_LAST) || '{}') as Record<string, string>;
    if (m[storyId] === chapterId) return;   // ไม่เปลี่ยน → ไม่ต้อง PUT
    m[storyId] = chapterId;
    localStorage.setItem(LS_LAST, JSON.stringify(m));
    notifyPrefChange();
  } catch { /* ignore */ }
}
