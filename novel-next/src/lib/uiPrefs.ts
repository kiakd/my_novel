'use client';
// ============ UI prefs (localStorage + sync MongoDB) — ขนาดตัวอักษรแชท ฯลฯ ============
// localStorage = instant cache (อ่าน sync ตอน mount → ไม่กระพริบ); sync ขึ้น/ลง DB ผ่าน prefs-sync.ts
import { useCallback, useEffect, useState } from 'react';
import { notifyPrefChange, PREFS_RECONCILE_EVENT } from './prefs-sync';

/** subscribe event reconcile (DB → localStorage) + storage (แท็บอื่น) แล้วอ่านค่าใหม่จาก localStorage */
function useReconcile(read: () => void) {
  useEffect(() => {
    const onSync = () => read();
    window.addEventListener(PREFS_RECONCILE_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(PREFS_RECONCILE_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, [read]);
}

const LS_CHAT_FONT = 'ns_chat_fontsize';
export const CHAT_FONT_MIN = 12;
export const CHAT_FONT_MAX = 24;
export const CHAT_FONT_DEFAULT = 15;
const STEP = 1;
const clamp = (n: number) => Math.min(CHAT_FONT_MAX, Math.max(CHAT_FONT_MIN, n));

/** ขนาดตัวอักษรในหน้าต่างแชท (px) — ปรับด้วย A−/A+ เก็บถาวร + sync ข้ามเครื่อง */
export function useChatFontSize() {
  const [size, setSize] = useState(CHAT_FONT_DEFAULT);

  const readLs = useCallback(() => {
    try { const v = Number(localStorage.getItem(LS_CHAT_FONT)); if (v) setSize(clamp(v)); } catch { /* ignore */ }
  }, []);
  useEffect(() => { readLs(); }, [readLs]);
  useReconcile(readLs);

  const persist = (v: number) => {
    try { localStorage.setItem(LS_CHAT_FONT, String(v)); } catch { /* ignore */ }
    notifyPrefChange();
  };
  const set = useCallback((n: number) => setSize(() => { const v = clamp(n); persist(v); return v; }), []);
  const inc = useCallback(() => setSize((p) => { const v = clamp(p + STEP); persist(v); return v; }), []);
  const dec = useCallback(() => setSize((p) => { const v = clamp(p - STEP); persist(v); return v; }), []);

  return { size, set, inc, dec };
}

// ============ โหมดกระชับ — ลดพรรณนาฟุ่มเฟือย เน้นบทสนทนา+การกระทำ (global pref) ============
const LS_CONCISE = 'ns_concise';

/** โหมดกระชับ: ให้ AI เขียนพรรณนาน้อยลง เน้นบทพูด/การกระทำ — ใช้ร่วมทั้งแชทและนิยาย เก็บถาวร (default ปิด) */
export function useConciseMode() {
  const [concise, setConcise] = useState(false);

  const readLs = useCallback(() => {
    try { setConcise(localStorage.getItem(LS_CONCISE) === '1'); } catch { /* ignore */ }
  }, []);
  useEffect(() => { readLs(); }, [readLs]);
  useReconcile(readLs);

  const set = useCallback((v: boolean) => setConcise(() => {
    try { localStorage.setItem(LS_CONCISE, v ? '1' : '0'); } catch { /* ignore */ }
    notifyPrefChange();
    return v;
  }), []);

  return { concise, set };
}

// ============ ตัวดูความจำที่ฉีดเข้า prompt (Injection Viewer) — ดีบั๊ก/ความเชื่อมั่น (default ปิด) ============
const LS_SHOW_RECALL = 'ns_show_recall';

/** โชว์ว่าเทิร์นล่าสุด recall ความจำอะไรเข้า prompt บ้าง — ช่วยตรวจว่าระบบ "จำ" ถูกไหม เก็บถาวร (default ปิด) */
export function useShowRecall() {
  const [show, setShow] = useState(false);

  const readLs = useCallback(() => {
    try { setShow(localStorage.getItem(LS_SHOW_RECALL) === '1'); } catch { /* ignore */ }
  }, []);
  useEffect(() => { readLs(); }, [readLs]);
  useReconcile(readLs);

  const set = useCallback((v: boolean) => setShow(() => {
    try { localStorage.setItem(LS_SHOW_RECALL, v ? '1' : '0'); } catch { /* ignore */ }
    notifyPrefChange();
    return v;
  }), []);

  return { show, set };
}
