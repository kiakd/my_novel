'use client';
// ============ StoryProvider — state กลางของแอป (โหลด/แก้/autosave/optimistic-lock) ============
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { getState, putState } from '@/lib/api';
import { initPrefsSync } from '@/lib/prefs-sync';
import { seedState, emptyStory } from '@/lib/seed';
import { toast } from '@/components/ui';
import type { AppState, Story } from '@/lib/types';

export type SaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
const SAVE_DEBOUNCE = 900;
const RETRY_DELAY = 4000;   // network error → ลองเซฟใหม่อีกครั้ง (กันเสียงานที่เพิ่งเจนบนมือถือเน็ตหลุด)
/** กู้คืนงานที่เจนแล้วแต่เซฟไม่ลง (เก็บไว้ window กัน reload หาย) — debug/manual recovery */
const RECOVERY_KEY = 'ns_save_recovery';

interface StoryCtx {
  loaded: boolean;
  status: SaveStatus;
  stories: { id: string; name: string }[];
  activeStoryId: string;
  story: Story | null;
  /** แก้เรื่องที่เปิดอยู่ (มี autosave) */
  mutateStory: (fn: (s: Story) => Story) => void;
  setActiveStory: (id: string) => void;
  addStory: (name: string) => void;
  renameStory: (name: string) => void;
  deleteStory: () => void;
  saveNow: () => void;
}

const Ctx = createContext<StoryCtx | null>(null);

export function StoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [rev, setRev] = useState(0);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [loaded, setLoaded] = useState(false);

  // refs ให้ debounced save เห็นค่าล่าสุดเสมอ
  const stateRef = useRef<AppState | null>(null);
  const revRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const retryTimer = useRef<ReturnType<typeof setTimeout>>();
  const retriedRef = useRef(false);   // กัน retry วนไม่จบ — network error retry ได้ครั้งเดียวต่อรอบ
  stateRef.current = state;
  revRef.current = rev;

  // sync UI prefs (ขนาดอักษร/ธีม ฯลฯ) จาก DB หลัง mount — localStorage เป็น instant cache กันกระพริบ
  useEffect(() => { initPrefsSync(); }, []);

  // --- โหลด state ตอน mount ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getState();
        if (cancelled) return;
        if (s && s.stories && Object.keys(s.stories).length) {
          const { __rev, ...rest } = s;
          setState(rest as AppState);
          setRev(__rev ?? 0);
          setStatus('saved');
        } else {
          setState(seedState());
          setRev(0);
          setStatus('idle'); // seed ยังไม่บันทึก — แก้ครั้งแรกจะ save ลง DB
        }
      } catch {
        // backend/Mongo ไม่ติด → ใช้ seed ทำงานต่อได้ (เซฟไม่ได้จนกว่าจะต่อ DB)
        if (!cancelled) {
          setState(seedState());
          setRev(0);
          setStatus('error');
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const doSave = useCallback(async () => {
    const cur = stateRef.current;
    if (!cur) return;
    setStatus('saving');
    try {
      const res = await putState(cur, revRef.current);
      if (res.ok) {
        retriedRef.current = false;
        try { localStorage.removeItem(RECOVERY_KEY); } catch { /* ignore */ }
        setRev(res.rev ?? revRef.current + 1);
        setStatus('saved');
      } else if (res.conflict) {
        // server ใหม่กว่า (แก้จากแท็บ/สคริปต์อื่น) → ก่อนทับ local เก็บสำเนา local ไว้ใน recovery buffer
        // กันเสียเนื้อที่ AI เพิ่งเจน (มือถือ: ผู้ใช้ reload/สลับแท็บได้) — แล้วค่อยดึง server มาทับเพื่อรักษา rev-reconcile เดิม
        try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ ts: Date.now(), rev: revRef.current, state: cur })); } catch { /* ignore */ }
        const fresh = await getState();
        if (fresh) {
          const { __rev, ...rest } = fresh;
          setState(rest as AppState);
          setRev(__rev ?? 0);
        }
        setStatus('conflict');
        toast('โหลดข้อมูลล่าสุดจากเซิร์ฟเวอร์ (มีการแก้จากที่อื่น — เก็บสำเนางานที่เพิ่งเขียนไว้กู้คืนได้)', '⚠️');
      } else {
        setStatus('error');
      }
    } catch {
      // network error → เก็บสำเนาไว้กู้คืน + ตั้งเวลาลองเซฟใหม่อีกครั้ง (กันเงียบหายบนเน็ตมือถือ)
      try { localStorage.setItem(RECOVERY_KEY, JSON.stringify({ ts: Date.now(), rev: revRef.current, state: cur })); } catch { /* ignore */ }
      setStatus('error');
      if (!retriedRef.current) {
        retriedRef.current = true;
        clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => { void doSave(); }, RETRY_DELAY);
      }
    }
  }, []);

  const scheduleSave = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void doSave(); }, SAVE_DEBOUNCE);
  }, [doSave]);

  /** เปลี่ยน state + ตั้งเวลา autosave */
  const commit = useCallback((next: AppState) => {
    setState(next);
    setStatus('saving');
    scheduleSave();
  }, [scheduleSave]);

  const mutateStory = useCallback((fn: (s: Story) => Story) => {
    const cur = stateRef.current;
    if (!cur) return;
    const id = cur.activeStoryId;
    const story = cur.stories[id];
    if (!story) return;
    commit({ ...cur, stories: { ...cur.stories, [id]: fn(story) } });
  }, [commit]);

  const setActiveStory = useCallback((id: string) => {
    const cur = stateRef.current;
    if (!cur || !cur.stories[id]) return;
    commit({ ...cur, activeStoryId: id });
  }, [commit]);

  const addStory = useCallback((name: string) => {
    const cur = stateRef.current ?? { stories: {}, activeStoryId: '' };
    const id = 's' + Date.now();
    commit({ ...cur, stories: { ...cur.stories, [id]: emptyStory(name) }, activeStoryId: id });
  }, [commit]);

  const renameStory = useCallback((name: string) => {
    mutateStory((s) => ({ ...s, name }));
  }, [mutateStory]);

  const deleteStory = useCallback(() => {
    const cur = stateRef.current;
    if (!cur) return;
    const rest = { ...cur.stories };
    delete rest[cur.activeStoryId];
    const nextIds = Object.keys(rest);
    if (nextIds.length === 0) {
      const id = 's' + Date.now();
      commit({ stories: { [id]: emptyStory('Untitled') }, activeStoryId: id });
    } else {
      commit({ stories: rest, activeStoryId: nextIds[0] });
    }
  }, [commit]);

  const saveNow = useCallback(() => {
    clearTimeout(timer.current);
    clearTimeout(retryTimer.current);
    retriedRef.current = false;   // force-save → ให้สิทธิ์ retry ใหม่ (เช่นหลัง AI เจนเสร็จ)
    void doSave();
  }, [doSave]);

  const stories = state ? Object.entries(state.stories).map(([id, s]) => ({ id, name: s.name ?? '(untitled)' })) : [];
  const story = state ? state.stories[state.activeStoryId] ?? null : null;

  const value: StoryCtx = {
    loaded, status, stories,
    activeStoryId: state?.activeStoryId ?? '',
    story,
    mutateStory, setActiveStory, addStory, renameStory, deleteStory, saveNow,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStory(): StoryCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStory must be used within <StoryProvider>');
  return c;
}
