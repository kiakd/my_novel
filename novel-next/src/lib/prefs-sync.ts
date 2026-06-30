'use client';
// ============ Prefs sync — รวม UI prefs (localStorage) แล้ว sync ขึ้น/ลง MongoDB ข้ามเครื่อง ============
//
// ดีไซน์ (กันกระพริบ / FOUC):
//   • localStorage = instant cache — hook อ่าน sync ตอน mount เหมือนเดิม ค่าจึงถูกต้องทันที ไม่กระพริบ
//   • MongoDB (/api/prefs) = source of truth ที่ sync ทีหลัง (reconcile แบบ async หลัง mount)
//   • on mount: fetch /api/prefs → ถ้า DB rev > rev ที่เคย sync (ns_prefs_rev) → เขียนค่าจาก DB ลง localStorage
//     แล้ว dispatch event ในหน้าให้ hook อัปเดต state สด ๆ (ไม่ remount)  [กติกา single-user: DB ใหม่กว่า → ใช้ DB]
//   • on change: hook เขียน localStorage (เหมือนเดิม) แล้วเรียก notifyPrefChange() → debounced PUT รวมทุก pref เป็นก้อนเดียว
//
// optimistic locking ด้วย rev เหมือน /api/state: ถ้า PUT ชน 409 → ดึง DB ล่าสุดมาทับ local (DB ใหม่กว่าชนะ)

import { getPrefs, putPrefs } from './api';

/** คีย์ localStorage ทั้งหมดที่อยู่ในชุด prefs ที่ sync — เพิ่มที่นี่ที่เดียวเวลามี pref ใหม่ */
export const PREF_KEYS = [
  'ns_chat_fontsize',
  'ns_concise',
  'ns_show_recall',
  'ns_reader_prefs',
  'ns_reader_last',
] as const;
export type PrefKey = (typeof PREF_KEYS)[number];

/** rev ของ DB ที่ sync สำเร็จล่าสุด (เก็บใน localStorage เพื่อเทียบว่า DB ใหม่กว่า cache ไหม) */
const LS_REV = 'ns_prefs_rev';
/** event ในหน้า — แจ้ง hook ว่าค่า prefs ใน localStorage ถูกอัปเดตจาก DB ให้ rerender ด้วยค่าใหม่ */
export const PREFS_RECONCILE_EVENT = 'ns:prefs-reconcile';

const SAVE_DEBOUNCE = 800;
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

function readRev(): number {
  try { return Number(localStorage.getItem(LS_REV)) || 0; } catch { return 0; }
}
function writeRev(rev: number): void {
  try { localStorage.setItem(LS_REV, String(rev)); } catch { /* ignore */ }
}

/** อ่าน prefs ทั้งชุดจาก localStorage เป็น object (เฉพาะคีย์ที่มีค่า) — ส่งขึ้น DB เป็นก้อนเดียว */
function collectLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of PREF_KEYS) {
    try { const v = localStorage.getItem(k); if (v != null) out[k] = v; } catch { /* ignore */ }
  }
  return out;
}

/** เขียน prefs ที่ได้จาก DB ลง localStorage แล้วแจ้ง hook ให้ rerender (เรียกตอน reconcile/หลังชน 409) */
function applyToLocal(prefs: Record<string, unknown>): void {
  for (const k of PREF_KEYS) {
    const v = prefs[k];
    try {
      if (typeof v === 'string') localStorage.setItem(k, v);
      // ค่าที่ไม่มีใน DB ปล่อย localStorage เดิมไว้ (ไม่ลบ) — กันค่าหายตอน DB ยังไม่เคยเก็บคีย์นั้น
    } catch { /* ignore */ }
  }
  try { window.dispatchEvent(new Event(PREFS_RECONCILE_EVENT)); } catch { /* ignore */ }
}

async function pushNow(): Promise<void> {
  const bundle = collectLocal();
  try {
    const res = await putPrefs(bundle, readRev());
    if (res.ok) {
      writeRev(res.rev ?? readRev() + 1);
    } else if (res.conflict) {
      // DB ถูกแก้จากเครื่องอื่น → ดึงล่าสุดมาทับ local (DB ใหม่กว่าชนะ) แล้ว retry push ค่าตัวเองทับอีกที
      const fresh = await getPrefs();
      if (fresh) {
        const { __rev, ...rest } = fresh;
        writeRev(__rev ?? 0);
        applyToLocal(rest as Record<string, unknown>);
      }
    }
  } catch { /* offline → ค่าอยู่ใน localStorage แล้ว ครั้งหน้าค่อย sync */ }
}

/** เรียกทุกครั้งที่ pref เปลี่ยน (จาก hook) — debounce แล้ว PUT รวมทุก pref เป็นก้อนเดียว */
export function notifyPrefChange(): void {
  if (typeof window === 'undefined') return;
  clearTimeout(timer);
  timer = setTimeout(() => { void pushNow(); }, SAVE_DEBOUNCE);
}

/** เรียกครั้งเดียวตอนแอป mount — reconcile prefs จาก DB (ถ้า DB ใหม่กว่า cache) */
export function initPrefsSync(): void {
  if (typeof window === 'undefined' || started) return;
  started = true;
  (async () => {
    try {
      const fresh = await getPrefs();
      if (!fresh) return;             // DB ยังไม่มี prefs — รอจน user แก้ค่าแรกแล้วค่อย PUT สร้าง
      const { __rev, ...rest } = fresh;
      const dbRev = __rev ?? 0;
      if (dbRev > readRev()) {
        // DB ใหม่กว่าที่เครื่องนี้ sync ไว้ → ใช้ DB (เขียนลง localStorage + แจ้ง hook ให้ใช้ค่าใหม่)
        writeRev(dbRev);
        applyToLocal(rest as Record<string, unknown>);
      } else {
        // เครื่องนี้ทันสมัยอยู่แล้ว — แค่ sync rev ให้ตรง (กัน rev cache เพี้ยน)
        writeRev(dbRev);
      }
    } catch { /* offline → ใช้ค่า localStorage ต่อไปได้ */ }
  })();
}
