'use client';
// ============ StoryProvider — state กลางของแอป (โหลด/แก้/autosave/optimistic-lock) ============
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { getState, putState } from '@/lib/api';
import { initPrefsSync } from '@/lib/prefs-sync';
import { initGallerySync } from '@/lib/gallery-sync';
import { seedState, emptyStory } from '@/lib/seed';
import { toast } from '@/components/ui';
import type { AppState, Story } from '@/lib/types';

export type SaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
const SAVE_DEBOUNCE = 900;

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
  stateRef.current = state;
  revRef.current = rev;

  // sync UI prefs (ขนาดอักษร/ธีม ฯลฯ) จาก DB หลัง mount — localStorage เป็น instant cache กันกระพริบ
  useEffect(() => { initPrefsSync(); initGallerySync(); }, []);

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
          // DB ว่างจริง (first-run) → seed template ให้เห็นตัวอย่าง (แก้ครั้งแรกจะ save ลง DB)
          setState(seedState());
          setRev(0);
          setStatus('idle');
        }
      } catch {
        // โหลดล้มเหลว (network/DB down) → online-only: ห้าม seed ทับเงียบ ๆ
        // คง state = null ไว้ → mutate/doSave จะ no-op (กันเขียน empty ทับ DB) + UI แจ้ง error
        if (!cancelled) {
          setStatus('error');
          toast('โหลดข้อมูลไม่ได้ ตรวจการเชื่อมต่อแล้วลองรีโหลด', '⚠️');
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
        setRev(res.rev ?? revRef.current + 1);
        setStatus('saved');
      } else if (res.conflict) {
        // server ใหม่กว่า (แก้จากแท็บ/สคริปต์อื่น) → ดึง server มาทับ (DB ชนะ) เพื่อรักษา rev-reconcile
        const fresh = await getState();
        if (fresh) {
          const { __rev, ...rest } = fresh;
          setState(rest as AppState);
          setRev(__rev ?? 0);
        }
        setStatus('conflict');
        toast('ดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์ (มีการแก้จากที่อื่น)', '⚠️');
      } else {
        setStatus('error');
        toast('บันทึกไม่สำเร็จ — งานล่าสุดยังไม่ถูกบันทึก ลองอีกครั้ง', '⚠️');
      }
    } catch {
      // network/DB down → online-only: ไม่ retry, ไม่เก็บ recovery buffer; แจ้ง user ให้รู้ว่ายังไม่เซฟ
      // ⚠️ state ใน memory ยังอยู่ครบ → กด saveNow ลองใหม่ได้เอง (ไม่มีอะไรถูกทับ)
      setStatus('error');
      toast('บันทึกไม่สำเร็จ — เช็กการเชื่อมต่อแล้วลองบันทึกอีกครั้ง', '⚠️');
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
    const cur = stateRef.current;
    if (!cur) return;   // โหลดยังไม่สำเร็จ → ห้ามสร้าง state ใหม่ทับ DB ที่ยังโหลดไม่ได้
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
