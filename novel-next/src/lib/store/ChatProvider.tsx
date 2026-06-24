'use client';
// ============ ChatProvider — state ของระบบแชท RP (แยกจาก StoryProvider ทั้งหมด) ============
// การเก็บ: meta (chars+items) อยู่ doc 'chat' · แต่ละ session อยู่ doc ของตัวเองใน chat_sessions
// เซฟแบบ diff: เทียบ reference กับ snapshot ล่าสุดที่เซฟแล้ว → ส่งเฉพาะส่วนที่เปลี่ยน (แชทยาวไม่ต้องส่งทุกอย่างทุกครั้ง)
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { getChatState, putChatState, getChatSessions, putChatSession, deleteChatSession } from '@/lib/chat-api';
import { emptyChatState } from '@/lib/chat-rel';
import { toast } from '@/components/ui';
import type { ChatState, ChatSession } from '@/lib/chat-types';

type SaveStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'conflict' | 'error';
const SAVE_DEBOUNCE = 900;

interface ChatCtx {
  loaded: boolean;
  status: SaveStatus;
  state: ChatState;
  mutate: (fn: (s: ChatState) => ChatState) => void;
}

const Ctx = createContext<ChatCtx | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChatState>(emptyChatState);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [loaded, setLoaded] = useState(false);

  const stateRef = useRef<ChatState>(state);
  const metaRev = useRef(0);
  const sessRevs = useRef<Map<string, number>>(new Map());
  // snapshot ที่เซฟแล้ว — mutate สร้าง object ใหม่เสมอ จึงเทียบ reference ได้ว่าอะไรเปลี่ยน
  const savedMeta = useRef<{ chars: ChatState['chars']; items: ChatState['items']; personas: ChatState['personas']; world: ChatState['world'] } | null>(null);
  const savedSessions = useRef<Map<string, ChatSession>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  stateRef.current = state;

  /** โหลดทุกอย่างจากเซิร์ฟเวอร์ + รีเซ็ต snapshot/rev — คืน true ถ้ามีข้อมูลใน DB แล้ว */
  const loadAll = useCallback(async (): Promise<boolean> => {
    const [meta, sessions] = await Promise.all([getChatState(), getChatSessions()]);
    const next: ChatState = {
      chars: meta?.chars ?? [],
      items: meta?.items?.length ? meta.items : emptyChatState().items,
      personas: meta?.personas ?? [],
      world: meta?.world ?? [],
      sessions: sessions.map(({ __rev, ...s }) => s as ChatSession),
    };
    metaRev.current = meta?.__rev ?? 0;
    sessRevs.current = new Map(sessions.map((s) => [s.id, s.__rev ?? 0]));
    savedMeta.current = { chars: next.chars, items: next.items, personas: next.personas, world: next.world };
    savedSessions.current = new Map(next.sessions.map((s) => [s.id, s]));
    setState(next);
    return meta != null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const had = await loadAll();
        if (!cancelled) setStatus(had ? 'saved' : 'idle');
      } catch {
        if (!cancelled) { setState(emptyChatState()); setStatus('error'); }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [loadAll]);

  const doSave = useCallback(async () => {
    const cur = stateRef.current;
    setStatus('saving');
    try {
      let conflict = false;
      // 1) meta (chars/items) เปลี่ยน → เซฟ doc 'chat'
      if (!savedMeta.current || savedMeta.current.chars !== cur.chars || savedMeta.current.items !== cur.items || savedMeta.current.personas !== cur.personas || savedMeta.current.world !== cur.world) {
        const res = await putChatState({ chars: cur.chars, items: cur.items, personas: cur.personas, world: cur.world }, metaRev.current);
        if (res.ok) {
          metaRev.current = res.rev ?? metaRev.current + 1;
          savedMeta.current = { chars: cur.chars, items: cur.items, personas: cur.personas, world: cur.world };
        } else if (res.conflict) conflict = true;
        else { setStatus('error'); return; }
      }
      // 2) เซฟเฉพาะ session ที่เปลี่ยน
      for (const s of cur.sessions) {
        if (savedSessions.current.get(s.id) === s) continue;
        const res = await putChatSession(s, sessRevs.current.get(s.id) ?? 0);
        if (res.ok) {
          sessRevs.current.set(s.id, res.rev ?? (sessRevs.current.get(s.id) ?? 0) + 1);
          savedSessions.current.set(s.id, s);
        } else if (res.conflict) conflict = true;
        else { setStatus('error'); return; }
      }
      // 3) ลบ session ที่หายไปจาก state
      const ids = new Set(cur.sessions.map((s) => s.id));
      for (const id of [...savedSessions.current.keys()]) {
        if (ids.has(id)) continue;
        await deleteChatSession(id);
        savedSessions.current.delete(id);
        sessRevs.current.delete(id);
      }
      if (conflict) {
        await loadAll();   // มีแก้จากที่อื่น → ยึดของเซิร์ฟเวอร์
        setStatus('conflict');
        toast('โหลดแชทล่าสุดจากเซิร์ฟเวอร์ (มีการแก้จากที่อื่น)', '⚠️');
      } else setStatus('saved');
    } catch { setStatus('error'); }
  }, [loadAll]);

  const scheduleSave = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { void doSave(); }, SAVE_DEBOUNCE);
  }, [doSave]);

  const mutate = useCallback((fn: (s: ChatState) => ChatState) => {
    setState((cur) => { const next = fn(cur); stateRef.current = next; return next; });
    setStatus('saving');
    scheduleSave();
  }, [scheduleSave]);

  return <Ctx.Provider value={{ loaded, status, state, mutate }}>{children}</Ctx.Provider>;
}

export function useChat(): ChatCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useChat must be used within <ChatProvider>');
  return c;
}
