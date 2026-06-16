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

// ============ ผู้ให้บริการโมเดลของแชท (deepseek=cloud เร็ว/ฉลาด · lmstudio=Gemma E4B local) ============
const LS_CHAT_PROVIDER = 'ns_chat_provider';
export type ChatProvider = 'deepseek' | 'lmstudio';
export const CHAT_PROVIDER_DEFAULT: ChatProvider = 'deepseek';
const isProvider = (v: unknown): v is ChatProvider => v === 'deepseek' || v === 'lmstudio';

/** provider ที่ใช้ในหน้าแชท — เลือกได้ระหว่าง DeepSeek (cloud) กับ Gemma E4B (local) เก็บถาวร */
export function useChatProvider() {
  const [provider, setProvider] = useState<ChatProvider>(CHAT_PROVIDER_DEFAULT);

  useEffect(() => {
    try { const v = localStorage.getItem(LS_CHAT_PROVIDER); if (isProvider(v)) setProvider(v); } catch { /* ignore */ }
  }, []);

  const set = useCallback((p: ChatProvider) => setProvider(() => {
    try { localStorage.setItem(LS_CHAT_PROVIDER, p); } catch { /* ignore */ }
    return p;
  }), []);

  return { provider, set };
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
