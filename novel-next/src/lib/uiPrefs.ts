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

// ============ โหมดกระชับ — ลดพรรณนาฟุ่มเฟือย เน้นบทสนทนา+การกระทำ (global pref) ============
const LS_CONCISE = 'ns_concise';

/** โหมดกระชับ: ให้ AI เขียนพรรณนาน้อยลง เน้นบทพูด/การกระทำ — ใช้ร่วมทั้งแชทและนิยาย เก็บถาวร (default ปิด) */
export function useConciseMode() {
  const [concise, setConcise] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(LS_CONCISE) === '1') setConcise(true); } catch { /* ignore */ }
  }, []);

  const set = useCallback((v: boolean) => setConcise(() => {
    try { localStorage.setItem(LS_CONCISE, v ? '1' : '0'); } catch { /* ignore */ }
    return v;
  }), []);

  return { concise, set };
}

// ============ ตัวดูความจำที่ฉีดเข้า prompt (Injection Viewer) — ดีบั๊ก/ความเชื่อมั่น (default ปิด) ============
const LS_SHOW_RECALL = 'ns_show_recall';

/** โชว์ว่าเทิร์นล่าสุด recall ความจำอะไรเข้า prompt บ้าง — ช่วยตรวจว่าระบบ "จำ" ถูกไหม เก็บถาวร (default ปิด) */
export function useShowRecall() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(LS_SHOW_RECALL) === '1') setShow(true); } catch { /* ignore */ }
  }, []);

  const set = useCallback((v: boolean) => setShow(() => {
    try { localStorage.setItem(LS_SHOW_RECALL, v ? '1' : '0'); } catch { /* ignore */ }
    return v;
  }), []);

  return { show, set };
}
