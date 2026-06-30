'use client';
// ============ Gallery sync — รูป timeline (localStorage) แล้ว sync ขึ้น/ลง MongoDB ข้ามเครื่อง ============
//
// ดีไซน์ (เหมือน prefs-sync แต่ sharded ต่อ galKey เพื่อกัน 16MB/doc limit เวลารูปเยอะ):
//   • localStorage = instant cache — component อ่าน sync ตอน mount เหมือนเดิม ค่าถูกต้องทันที ไม่กระพริบ
//   • MongoDB (/api/gallery/:key) = source of truth ที่ sync ทีหลัง (reconcile แบบ async หลัง mount)
//   • on mount: GET /api/gallery (ทุก gallery ทีเดียว) → ถ้า DB rev > rev ที่เคย sync (per galKey)
//     → เขียนค่าจาก DB ลง localStorage แล้ว dispatch event ให้ component ที่ mount อยู่ re-read (ไม่ remount)
//   • on change: component เขียน localStorage (เหมือนเดิม) แล้วเรียก notifyGalleryChange(galKey)
//     → debounced PUT เฉพาะ gallery นั้น (ไม่กระทบ gallery อื่น)
//
// optimistic locking ด้วย rev เหมือน /api/prefs: ถ้า PUT ชน 409 → ดึง DB ล่าสุดมาทับ local (DB ใหม่กว่าชนะ)
//
// storage layout ใน localStorage (ของเดิม ไม่เปลี่ยน):
//   • SlotGallery:  tl:galcount:<galKey>            = จำนวนช่อง
//                   tl:slot:<galKey>-<n>            = dataURL ของช่อง n  (n เริ่ม 1)
//   • ImageSlot เดี่ยว (ไม่มี SlotGallery ครอบ เช่น look-slots 48px):
//                   tl:slot:<slotKey>               = dataURL  → เก็บเป็น gallery doc _id=<slotKey>, count=0
//
// DB doc ต่อ galKey: { count: number, slots: { '<galKey>-<n>': dataURL } }  (slots ใช้ slotKey เต็มเป็น key)

import { getGalleries, putGallery, type GalleryDoc } from './api';

const COUNT_PREFIX = 'tl:galcount:';
const SLOT_PREFIX = 'tl:slot:';
/** map galKey → rev ของ DB ที่ sync สำเร็จล่าสุด (เทียบว่า DB ใหม่กว่า cache ไหม) */
const REV_PREFIX = 'tl:galrev:';
/** event ในหน้า — แจ้ง component ว่ารูป/จำนวนช่องใน localStorage ถูกอัปเดตจาก DB ให้ re-read */
export const GALLERY_RECONCILE_EVENT = 'ns:gallery-reconcile';

const SAVE_DEBOUNCE = 800;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;

function readRev(galKey: string): number {
  try { return Number(localStorage.getItem(REV_PREFIX + galKey)) || 0; } catch { return 0; }
}
function writeRev(galKey: string, rev: number): void {
  try { localStorage.setItem(REV_PREFIX + galKey, String(rev)); } catch { /* ignore */ }
}

/** อ่าน gallery หนึ่งก้อนจาก localStorage → { count, slots } (slots = เฉพาะช่องที่มีรูป)
 *  galKey แบบ SlotGallery → ใช้ tl:galcount + ช่อง 1..count
 *  galKey แบบ slot เดี่ยว (count=0 ใน DB) → ก็คือ slotKey เอง, slots = { <slotKey>: dataURL } ถ้ามี */
function collectLocal(galKey: string, isSingle: boolean): { count: number; slots: Record<string, string> } {
  const slots: Record<string, string> = {};
  if (isSingle) {
    try { const v = localStorage.getItem(SLOT_PREFIX + galKey); if (v != null) slots[galKey] = v; } catch { /* ignore */ }
    return { count: 0, slots };
  }
  let count = 0;
  try { const c = localStorage.getItem(COUNT_PREFIX + galKey); count = c == null ? 0 : Math.max(0, parseInt(c, 10) || 0); } catch { /* ignore */ }
  for (let n = 1; n <= count; n++) {
    const sk = `${galKey}-${n}`;
    try { const v = localStorage.getItem(SLOT_PREFIX + sk); if (v != null) slots[sk] = v; } catch { /* ignore */ }
  }
  return { count, slots };
}

/** MERGE gallery จาก DB ลง localStorage แล้วแจ้ง component ให้ re-read (เรียกตอน reconcile/หลังชน 409)
 *  ⚠️ ปลอดภัยต่อรูปงานเขียน: เพิ่ม/อัปเดต slot จาก DB เท่านั้น — *ไม่ลบ* local slot ที่ DB ไม่มี
 *     (รูปที่มีแต่ในเครื่องแต่ยังไม่ push อาจหายได้ถ้าลบ — เหมือน prefs-sync ที่คงคีย์ local ไว้)
 *  count: ใช้ max(localCount, dbCount) — กัน slot ที่ local มีเกิน dbCount หายจอ
 *  trade-off: การลบรูป/ลบช่องจะไม่ sync ข้ามเครื่อง (ต้องลบเองทุกเครื่อง) — ยอมรับได้ ปลอดภัยกว่ารูปหาย */
function applyToLocal(galKey: string, doc: { count: number; slots: Record<string, string> }): void {
  const isSingle = (doc.count ?? 0) === 0 && doc.slots[galKey] !== undefined && !(`${galKey}-1` in doc.slots);
  try {
    if (!isSingle) {
      // count = max(local, db) — ไม่เขียนทับด้วย dbCount ที่อาจน้อยกว่า (กันช่อง local หาย)
      let localCount = 0;
      try { const c = localStorage.getItem(COUNT_PREFIX + galKey); localCount = c == null ? 0 : Math.max(0, parseInt(c, 10) || 0); } catch { /* ignore */ }
      const merged = Math.max(localCount, doc.count ?? 0);
      localStorage.setItem(COUNT_PREFIX + galKey, String(merged));
    }
    // เขียน/อัปเดตเฉพาะ slot ที่ DB มี — ช่อง local ที่ DB ไม่มี ปล่อยไว้ (ไม่ลบ)
    for (const [sk, data] of Object.entries(doc.slots)) {
      if (typeof data === 'string') localStorage.setItem(SLOT_PREFIX + sk, data);
    }
  } catch { /* quota — ยังโชว์ค่าใน DB รอบหน้าได้ */ }
  try { window.dispatchEvent(new CustomEvent(GALLERY_RECONCILE_EVENT, { detail: { galKey } })); } catch { /* ignore */ }
}

async function pushNow(galKey: string, isSingle: boolean): Promise<void> {
  const { count, slots } = collectLocal(galKey, isSingle);
  try {
    const res = await putGallery(galKey, count, slots, readRev(galKey));
    if (res.ok) {
      writeRev(galKey, res.rev ?? readRev(galKey) + 1);
    } else if (res.conflict) {
      // DB ถูกแก้จากเครื่องอื่น → ดึงล่าสุดมาทับ local (DB ใหม่กว่าชนะ)
      const all = await getGalleries().catch(() => null);
      const fresh = all?.[galKey];
      if (fresh) {
        writeRev(galKey, fresh.__rev ?? 0);
        applyToLocal(galKey, { count: fresh.count ?? 0, slots: fresh.slots ?? {} });
      }
    }
  } catch { /* offline → ค่าอยู่ใน localStorage แล้ว ครั้งหน้าค่อย sync */ }
}

/** เรียกทุกครั้งที่ gallery เปลี่ยน (เพิ่ม/ลบ/แก้รูป หรือเพิ่ม/ลบช่อง) — debounce แล้ว PUT เฉพาะ gallery นั้น
 *  isSingle = true สำหรับ ImageSlot เดี่ยวที่ไม่มี SlotGallery ครอบ (galKey = slotKey เต็ม) */
export function notifyGalleryChange(galKey: string, isSingle = false): void {
  if (typeof window === 'undefined') return;
  const ex = timers.get(galKey);
  if (ex) clearTimeout(ex);
  timers.set(galKey, setTimeout(() => { timers.delete(galKey); void pushNow(galKey, isSingle); }, SAVE_DEBOUNCE));
}

/** สแกน localStorage หา gallery ทั้งหมดที่มีในเครื่องนี้ → set ของ galKey + ว่าเป็น single หรือไม่
 *  - SlotGallery:  คีย์ tl:galcount:<galKey>
 *  - single slot:  คีย์ tl:slot:<slotKey> ที่ไม่ลงท้าย -<number> (ช่องของ SlotGallery จะลงท้าย -n) */
function scanLocalGalleries(): Map<string, boolean> {
  const out = new Map<string, boolean>();   // galKey → isSingle
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(COUNT_PREFIX)) out.set(k.slice(COUNT_PREFIX.length), false);
      else if (k.startsWith(SLOT_PREFIX)) {
        const slotKey = k.slice(SLOT_PREFIX.length);
        if (!/-\d+$/.test(slotKey)) out.set(slotKey, true);   // ไม่ลงท้าย -n → slot เดี่ยว (look-slot)
      }
    }
  } catch { /* ignore */ }
  return out;
}

/** local เป็น superset ของ DB ไหม — มี slot ที่ DB ยังไม่มี หรือ count สูงกว่า (ต้อง backfill local→DB) */
function localIsSuperset(galKey: string, isSingle: boolean, db: { count: number; slots: Record<string, string> } | undefined): boolean {
  const local = collectLocal(galKey, isSingle);
  if (Object.keys(local.slots).length === 0 && local.count === 0) return false;   // local ว่าง ไม่ต้อง push
  if (!db) return true;   // DB ยังไม่มี gallery นี้เลย แต่ local มีรูป → push
  if (!isSingle && local.count > (db.count ?? 0)) return true;
  for (const sk of Object.keys(local.slots)) if (!(sk in (db.slots ?? {}))) return true;
  return false;
}

/** เรียกครั้งเดียวตอนแอป mount — reconcile รูปทุก gallery จาก DB (ถ้า DB ใหม่กว่า cache)
 *  แล้ว backfill: gallery ที่ local เป็น superset ของ DB (รูปเดิมที่มีแต่ในเครื่อง ยังไม่เคย push) → push local→DB */
export function initGallerySync(): void {
  if (typeof window === 'undefined' || started) return;
  started = true;
  (async () => {
    try {
      const all: Record<string, GalleryDoc> = await getGalleries();
      if (!all) return;
      // 1) pull DB→local (merge) สำหรับ gallery ที่ DB ใหม่กว่า cache
      for (const [galKey, doc] of Object.entries(all)) {
        const dbRev = doc.__rev ?? 0;
        if (dbRev > readRev(galKey)) {
          writeRev(galKey, dbRev);
          applyToLocal(galKey, { count: doc.count ?? 0, slots: doc.slots ?? {} });
        } else {
          writeRev(galKey, dbRev);   // เครื่องนี้ทันสมัยอยู่แล้ว — sync rev ให้ตรง
        }
      }
      // 2) backfill local→DB — gallery ที่ local มีรูป/ช่องเกินกว่า DB (รวมที่ DB ยังไม่มีเลย)
      //    push ทันที (ไม่ debounce) เพื่อให้รูปงานเขียนขึ้น DB ครบ. loop-safe: หลัง push สำเร็จ
      //    DB จะมีของครบ → mount ครั้งหน้า localIsSuperset = false → ไม่ push ซ้ำ
      const localGals = scanLocalGalleries();
      for (const [galKey, isSingle] of localGals) {
        if (localIsSuperset(galKey, isSingle, all[galKey] ? { count: all[galKey].count ?? 0, slots: all[galKey].slots ?? {} } : undefined)) {
          await pushNow(galKey, isSingle);   // เซ็ต rev ให้ตรงเองข้างใน → ไม่ลูป
        }
      }
    } catch { /* offline → ใช้ค่า localStorage ต่อไปได้ */ }
  })();
}
