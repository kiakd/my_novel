'use client';
import { useEffect, useRef, useState } from 'react';
import { SectionTitle, Card, Btn, Avatar, IconBtn, Spinner, EmptyState, Modal, toast } from '@/components/ui';
import { pal } from '@/lib/theme';
import { useChat } from '@/lib/store/ChatProvider';
import { sendChat, summarizeChat, judgeRel, chatSceneImage } from '@/lib/chat-api';
import { applyItem, parseRelTag, clampRel, relLevel, floorRel } from '@/lib/chat-rel';
import { useChatFontSize } from '@/lib/uiPrefs';
import type { ChatChar, ChatItem, ChatMsg, ChatSession } from '@/lib/chat-types';
import { ChatCharModal } from './ChatCharModal';
import { ChatBubble } from './ChatBubble';
import { RelMeter } from './RelMeter';
import { ItemBar } from './ItemBar';

type Provider = 'deepseek' | 'lmstudio';
const LS_PROVIDER = 'ns_gen_provider';
const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'deepseek', label: '☁️ DeepSeek' },
  { id: 'lmstudio', label: '💻 Gemma local' },
];

const preview = (s: ChatSession) => {
  const last = s.messages.filter((m) => !m.item).slice(-1)[0];
  return last ? last.text.replace(/\*/g, '').slice(0, 64) : 'แชทใหม่';
};

export function ChatScreen() {
  const { state, mutate, loaded } = useChat();
  const [view, setView] = useState<'chars' | 'sessions' | 'chat' | 'settings'>('chars');
  const [charId, setCharId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatMode, setChatMode] = useState<'char' | 'narrator'>('char');  // คุยกับตัวละคร / บรรยายฉาก(ผู้เล่าเรื่อง)
  const [secret, setSecret] = useState(false);                            // (narrator) ตัวละครไม่รับรู้
  const [usePower, setUsePower] = useState(false);                        // (char) ข้อความนี้ใช้อำนาจบังคับ
  const [drawing, setDrawing] = useState(false);                          // กำลังวาดรูปฉาก (ComfyUI)
  const [memoDraft, setMemoDraft] = useState('');                         // draft ความจำ (ใน view settings)
  const [provider, setProvider] = useState<Provider>('deepseek');
  const scrollRef = useRef<HTMLDivElement>(null);
  const font = useChatFontSize();

  useEffect(() => { const p = localStorage.getItem(LS_PROVIDER); if (p === 'lmstudio' || p === 'deepseek') setProvider(p); }, []);
  const pickProvider = (p: Provider) => { setProvider(p); try { localStorage.setItem(LS_PROVIDER, p); } catch { /* ignore */ } };

  const chars = state.chars;
  const char = chars.find((c) => c.id === charId) ?? null;
  const editChar = chars.find((c) => c.id === editId) ?? null;
  const delSess = state.sessions.find((s) => s.id === delId) ?? null;
  const charSessions = state.sessions.filter((s) => s.charId === charId).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const session = state.sessions.find((s) => s.id === sessionId) ?? null;
  const sessChar = session?.char ?? char;          // ใช้ snapshot ของแชทนั้น (เอกเทศ)
  const rel = session?.rel ?? sessChar?.relStart ?? 0;
  const messages = session?.messages ?? [];

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages.length, busy, view]);

  // ---- template CRUD ----
  const addChar = () => { const id = 'cc' + Date.now(); mutate((st) => ({ ...st, chars: [...st.chars, { id, name: 'ตัวละครใหม่', color: 'coral', guard: 40, relStart: 0 }] })); setEditId(id); };
  const saveChar = (c: ChatChar) => mutate((st) => ({ ...st, chars: st.chars.map((x) => (x.id === c.id ? c : x)) }));
  const deleteChar = (id: string) => {
    mutate((st) => ({ ...st, chars: st.chars.filter((x) => x.id !== id), sessions: st.sessions.filter((s) => s.charId !== id) }));
    if (charId === id) { setCharId(null); setView('chars'); }
  };

  // ---- sessions ----
  const updateSession = (id: string, up: (s: ChatSession) => ChatSession) =>
    mutate((st) => ({ ...st, sessions: st.sessions.map((s) => (s.id === id ? up(s) : s)) }));

  const newChat = () => {
    if (!char) return;
    const snap: ChatChar = { ...char };  // snapshot — แก้ template ภายหลังไม่กระทบแชทนี้
    const s: ChatSession = {
      id: 'sess' + Date.now(), charId: char.id, char: snap,
      rel: clampRel(char.relStart ?? 0),
      messages: char.greeting?.trim() ? [{ role: 'char', text: char.greeting.trim(), ts: Date.now() }] : [],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    mutate((st) => ({ ...st, sessions: [...st.sessions, s] }));
    setSessionId(s.id); setView('chat');
  };
  const delSession = (id: string) => {
    mutate((st) => ({ ...st, sessions: st.sessions.filter((s) => s.id !== id) }));
    setDelId(null);
    if (sessionId === id) { setSessionId(null); setView('sessions'); }
  };

  // ---- ส่งข้อความ ----
  // Rolling summary: เก็บข้อความล่าสุดแบบดิบ ที่เก่ากว่านั้นพับเข้า summary
  // พับเมื่อ "จำนวน" เกิน FOLD_TRIGGER หรือ "ความยาวรวม" เกินงบของ provider — Gemma local ctx ~8K token ต้องพับไวกว่า cloud มาก
  const RAW_KEEP = 16;
  const FOLD_TRIGGER = 30;
  const rawBudget = provider === 'lmstudio' ? 6000 : 20000;   // งบ history ดิบ (ตัวอักษร)
  const totalLen = (ms: ChatMsg[]) => ms.reduce((n, m) => n + m.text.length, 0);
  const speaker = (m: ChatMsg) => (m.role === 'user' ? 'ผู้เล่น' : m.role === 'narrator' ? '[ผู้เล่าเรื่อง]' : (sessChar?.name ?? 'ตัวละคร'));
  const toHist = (m: ChatMsg) =>
    m.role === 'narrator'
      ? { role: 'user' as const, content: `${m.secret ? '[ผู้เล่าเรื่องบรรยาย — ฉากลับที่ตัวละครหลักไม่รับรู้]' : '[ผู้เล่าเรื่องบรรยาย]'} ${m.text}` }
      : m.role === 'user' && m.power
        ? { role: 'user' as const, content: `(⚡ ผู้เล่นใช้อำนาจบังคับร่างกายกับคำสั่งนี้) ${m.text}` }
        : { role: m.role, content: m.text };

  // เลือกจำนวนข้อความท้ายที่เก็บดิบ: ไม่เกิน maxKeep อัน และไม่เกินงบตัวอักษร (เก็บอย่างน้อย minKeep = เทิร์นล่าสุด)
  const pickKeep = (raw: ChatMsg[], maxKeep: number, charBudget: number, minKeep: number): number => {
    let keep = 0, acc = 0;
    for (let i = raw.length - 1; i >= 0 && keep < maxKeep; i--) {
      acc += raw[i].text.length;
      if (keep >= minKeep && acc > charBudget) break;
      keep++;
    }
    return keep;
  };

  // พับความจำถ้าจำเป็น (ใช้ร่วมทั้ง "แชท" และ "บรรยาย") → คืน {summary, raw} ของไทม์ไลน์สาธารณะ (ตัดไอเท็ม/ฉากลับ)
  const buildMemory = async (hist: ChatMsg[]): Promise<{ summary: string; raw: ChatMsg[] }> => {
    if (!sessChar || !sessionId) return { summary: '', raw: [] };
    let summary = session?.summary ?? '';
    let summarized = session?.summarizedCount ?? 0;
    const conv = hist.filter((m) => !m.item && !(m.role === 'narrator' && m.secret));
    let raw = conv.slice(summarized);
    if (raw.length > FOLD_TRIGGER || totalLen(raw) > rawBudget) {
      const foldN = raw.length - pickKeep(raw, RAW_KEEP, rawBudget / 2, 2);
      if (foldN > 0) {
        const toFold = raw.slice(0, foldN);
        const transcript = toFold.map((m) => `${speaker(m)}: ${m.text}`).join('\n');
        const sm = await summarizeChat({ prevSummary: summary, transcript, charName: sessChar.name, provider });
        if (sm.ok && sm.text?.trim()) {
          summary = sm.text.trim();
          summarized += foldN;
          raw = raw.slice(foldN);
          updateSession(sessionId, (s) => ({ ...s, summary, summarizedCount: summarized }));
        } else {
          toast('ย่อความจำไม่สำเร็จ — ถ้าแชทยาวต่อ เรื่องเก่าอาจเริ่มหลุด', '⚠️');
        }
      }
    }
    return { summary, raw };
  };

  // ความจำฝั่ง "ฉากลับ" (ตัวละครหลักไม่รับรู้) — พับแยกจาก summary หลัก ฉีดเฉพาะโหมดผู้เล่าเรื่อง
  const SECRET_KEEP = 6;
  const SECRET_TRIGGER = 10;
  const buildSecretMemory = async (hist: ChatMsg[]): Promise<{ summary: string; raw: ChatMsg[] }> => {
    if (!sessChar || !sessionId) return { summary: '', raw: [] };
    let summary = session?.secretSummary ?? '';
    let summarized = session?.secretSummarizedCount ?? 0;
    const secrets = hist.filter((m) => m.role === 'narrator' && m.secret);
    let raw = secrets.slice(summarized);
    if (raw.length > SECRET_TRIGGER || totalLen(raw) > rawBudget / 3) {
      const foldN = raw.length - pickKeep(raw, SECRET_KEEP, rawBudget / 3, 1);
      if (foldN > 0) {
        const toFold = raw.slice(0, foldN);
        const transcript = toFold.map((m) => `[ฉากลับ] ${m.text}`).join('\n');
        const sm = await summarizeChat({ prevSummary: summary, transcript, charName: sessChar.name, provider });
        if (sm.ok && sm.text?.trim()) {
          summary = sm.text.trim();
          summarized += foldN;
          raw = raw.slice(foldN);
          updateSession(sessionId, (s) => ({ ...s, secretSummary: summary, secretSummarizedCount: summarized }));
        } else {
          toast('ย่อความจำฉากลับไม่สำเร็จ', '⚠️');
        }
      }
    }
    return { summary, raw };
  };

  const callModel = async (userInput: string, baseRel: number, hist: ChatMsg[], maxTok?: number, judge = false) => {
    if (!sessChar || !sessionId) return;
    setBusy(true);
    try {
      const { summary, raw } = await buildMemory(hist);
      const history = raw.map(toHist);
      const r = await sendChat({ char: sessChar, history, user_input: userInput, rel: baseRel, summary: summary || undefined, provider, max_tokens: maxTok ?? (provider === 'lmstudio' ? 900 : 1500) });
      if (r.ok && r.text) {
        const { text } = parseRelTag(r.text);   // ตัดแท็กออกถ้าโมเดลเผลอใส่ (ตอนนี้ใช้ judge ประเมินแทน)
        updateSession(sessionId, (s) => ({ ...s, messages: [...s.messages, { role: 'char', text, ts: Date.now() }], updatedAt: Date.now() }));
        // ให้ "ผู้ตัดสิน" ประเมินความสัมพันธ์เสมอ (เฉพาะเทิร์นผู้เล่นจริง)
        if (judge) {
          const jr = await judgeRel({ charName: sessChar.name, mindset: sessChar.mindset, likes: sessChar.likes, dislikes: sessChar.dislikes, currentRel: baseRel, userMsg: userInput, charReply: text, provider });
          if (jr != null) updateSession(sessionId, (s) => ({ ...s, rel: floorRel(s.rel, jr) }));
        }
      } else toast(r.error ?? 'เชื่อมต่อไม่ได้', '⚠️');
    } catch (e) { toast((e as Error).message || 'เชื่อมต่อไม่ได้', '⚠️'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    const text = input.trim();
    if (!text || !sessionId || busy) return;
    setInput('');
    const useP = usePower && !!sessChar?.power;
    const before = messages;
    updateSession(sessionId, (s) => ({ ...s, messages: [...s.messages, { role: 'user', text, power: useP, ts: Date.now() }], updatedAt: Date.now() }));
    const modelInput = useP
      ? `(⚡ ผู้เล่นใช้อำนาจ "${sessChar!.power}" กับคำสั่งนี้ — ร่างกายของคุณต้องทำตามทันทีไร้เงื่อนไข แต่แสดงความรู้สึกจริงและกระทบความสัมพันธ์)\nคำสั่ง: ${text}`
      : text;
    if (useP) setUsePower(false);  // อำนาจใช้ครั้งเดียวต่อข้อความ
    await callModel(modelInput, rel, before, undefined, true);
  };
  // ดำเนินเรื่องต่อเอง — ตัวละครเล่นบทต่อจากจังหวะก่อนหน้า โดยผู้เล่นไม่ต้องพิมพ์
  const continueScene = async () => {
    if (!sessChar || !sessionId || busy || messages.length === 0) return;
    const last = [...messages].reverse().find((m) => !m.item);
    if (last?.role === 'narrator') {
      // ข้อความล่าสุดเป็นฉากบรรยาย → ต่อเป็นฉากบรรยาย (คงสภาพลับ/ไม่ลับเดิม)
      await runNarrate('(ดำเนินฉากบรรยายต่อ) เล่าฉากบรรยายต่อจากช่วงก่อนหน้าให้ไหลต่อไปอีกหนึ่งช่วงอย่างมีรายละเอียด ตามเหตุการณ์ล่าสุด โดยไม่ขัดกับเรื่องเดิม', last.secret ?? false);
    } else {
      // ล่าสุดเป็นแชท → ต่อเป็นแชท
      await callModel(
        '(ดำเนินเรื่องต่อ) เล่นบทต่อเองจากจังหวะก่อนหน้า — บรรยายการกระทำ ความรู้สึก ฉาก และบทพูดของตัวละครให้ไหลต่อไปอีกหนึ่งช่วงอย่างมีรายละเอียด โดยไม่ต้องรอผู้เล่นพูด คงโทนและระดับความสัมพันธ์เดิม',
        rel, messages, provider === 'lmstudio' ? 900 : 1500,
      );
    }
  };

  // โหมดผู้เล่าเรื่อง: ยิงคำกำกับ → โมเดลบรรยายฉาก/บุคคลที่ 3/NPC แล้วแนบเป็นข้อความ narrator (secretFlag)
  const runNarrate = async (userInput: string, secretFlag: boolean) => {
    if (!sessChar || !sessionId || busy) return;
    setBusy(true);
    try {
      const { summary, raw } = await buildMemory(messages);
      // ผู้เล่าเรื่องรอบรู้: เห็นทั้งไทม์ไลน์สาธารณะ + ฉากลับ (ความจำลับพับแยก ไม่ปนเข้า summary ที่ตัวละครเห็น)
      const { summary: secretSummary, raw: secretRaw } = await buildSecretMemory(messages);
      const history = [...raw, ...secretRaw].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0)).map(toHist);
      const fullSummary = [summary, secretSummary ? `[เหตุการณ์ลับที่ ${sessChar.name} ไม่รับรู้ — ใช้ประกอบการบรรยายเท่านั้น]\n${secretSummary}` : '']
        .filter(Boolean).join('\n\n');
      const r = await sendChat({ char: sessChar, history, user_input: userInput, rel, summary: fullSummary || undefined, mode: 'narrator', provider, max_tokens: provider === 'lmstudio' ? 900 : 1500 });
      if (r.ok && r.text) {
        const { text: out } = parseRelTag(r.text);
        updateSession(sessionId, (s) => ({ ...s, messages: [...s.messages, { role: 'narrator', text: out, secret: secretFlag, ts: Date.now() }], updatedAt: Date.now() }));
      } else toast(r.error ?? 'เชื่อมต่อไม่ได้', '⚠️');
    } catch (e) { toast((e as Error).message || 'เชื่อมต่อไม่ได้', '⚠️'); }
    finally { setBusy(false); }
  };
  const narrateScene = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    await runNarrate(`[กำกับฉาก] ${text}`, secret);
  };

  const submitComposer = () => { void (chatMode === 'narrator' ? narrateScene() : send()); };

  // ลบข้อความรายอัน (เช่น ฉากบรรยายล่าสุดที่ไม่เอา)
  // ⚠️ summarizedCount เป็น offset ในไทม์ไลน์ — ถ้าลบข้อความที่ "ถูกย่อไปแล้ว" ต้องลด counter ตาม ไม่งั้นข้อความถัดมาหลุดจาก context
  const deleteMessage = (m: ChatMsg) => {
    if (!sessionId) return;
    updateSession(sessionId, (s) => {
      const match = (x: ChatMsg) => x.ts === m.ts && x.role === m.role && x.text === m.text;
      const next: ChatSession = { ...s, messages: s.messages.filter((x) => !match(x)) };
      if (!m.item) {
        if (m.role === 'narrator' && m.secret) {
          const idx = s.messages.filter((x) => x.role === 'narrator' && x.secret).findIndex(match);
          if (idx >= 0 && idx < (s.secretSummarizedCount ?? 0)) next.secretSummarizedCount = (s.secretSummarizedCount ?? 0) - 1;
        } else {
          const idx = s.messages.filter((x) => !x.item && !(x.role === 'narrator' && x.secret)).findIndex(match);
          if (idx >= 0 && idx < (s.summarizedCount ?? 0)) next.summarizedCount = (s.summarizedCount ?? 0) - 1;
        }
      }
      return next;
    });
  };

  // วาดรูปประกอบฉากล่าสุด (ฉาก → SD prompt อังกฤษ → ComfyUI) แล้วแนบเข้าข้อความนั้น
  const drawScene = async (target?: ChatMsg) => {
    if (!sessChar || !sessionId || drawing) return;
    const t = target ?? [...messages].reverse().find((m) => (m.role === 'char' || m.role === 'narrator') && !m.item);
    if (!t) { toast('ยังไม่มีฉากให้วาด', '⚠️'); return; }
    setDrawing(true);
    toast(target ? 'กำลังวาดใหม่…' : 'กำลังวาดฉาก… (~1 นาที)', '🎨');
    try {
      const r = await chatSceneImage({ char: sessChar, sceneText: t.text, summary: session?.summary || undefined, sessionId });
      if (r.ok && r.url) {
        updateSession(sessionId, (s) => ({ ...s, messages: s.messages.map((m) => (m.ts === t.ts && m.role === t.role ? { ...m, image: r.url } : m)) }));
        toast('วาดเสร็จ', '🖼️');
      } else toast(r.error ?? 'วาดไม่สำเร็จ (ComfyUI เปิดอยู่ไหม?)', '⚠️');
    } catch (e) { toast((e as Error).message || 'วาดไม่สำเร็จ', '⚠️'); }
    finally { setDrawing(false); }
  };
  const removeImage = (m: ChatMsg) => {
    if (!sessionId) return;
    updateSession(sessionId, (s) => ({ ...s, messages: s.messages.map((x) => (x.ts === m.ts && x.role === m.role ? { ...x, image: undefined } : x)) }));
  };

  const useItem = async (it: ChatItem) => {
    if (!sessChar || !sessionId || busy) return;
    const nr = applyItem(rel, it, sessChar.relStart ?? 0);
    const before = messages;
    updateSession(sessionId, (s) => ({
      ...s, rel: nr,
      messages: [...s.messages, { role: 'user', item: true, text: `ใช้ ${it.emoji ?? '🎁'} ${it.name} (${rel}→${nr})`, ts: Date.now() }],
      updatedAt: Date.now(),
    }));
    await callModel(`(ผู้เล่นใช้ของวิเศษ "${it.name}"${it.note ? ' — ' + it.note : ''}) ความรู้สึกของคุณต่อผู้เล่นถูกบิดเปลี่ยนทันที ตอบสนองตามความรู้สึกใหม่นี้`, nr, before);
  };

  if (!loaded) return <div className="grid place-items-center py-20 text-muted gap-2"><Spinner /> กำลังโหลด…</div>;

  // ================= VIEW: chat (เต็มจอ mobile) =================
  if (view === 'chat' && session && sessChar) {
    const accent = sessChar.color ?? 'coral';
    return (
      <>
        <div className="fixed inset-0 z-30 flex flex-col bg-cream md:static md:z-auto md:max-w-3xl md:mx-auto md:h-[calc(100vh-160px)] md:rounded-3xl md:border-2 md:border-line md:overflow-hidden md:shadow-pop">
          {/* header */}
          <div className="shrink-0 px-3 py-2.5 border-b border-line flex items-center gap-2.5 bg-white/70 backdrop-blur">
            <IconBtn onClick={() => { setView('sessions'); setSessionId(null); }} title="กลับ">←</IconBtn>
            <Avatar initial={(sessChar.name || '?').slice(0, 1)} color={accent} size={38} ring />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-ink truncate leading-tight">{sessChar.name}</div>
              <div className="mt-0.5"><RelMeter rel={rel} /></div>
            </div>
            {/* ขนาดตัวอักษร + ตั้งค่า */}
            <div className="flex items-center gap-0.5 shrink-0">
              <button onClick={font.dec} title="ตัวอักษรเล็กลง" className="h-8 w-7 grid place-items-center rounded-lg text-[12px] font-bold text-muted hover:bg-ink/[.06] active:scale-90 transition">A−</button>
              <button onClick={font.inc} title="ตัวอักษรใหญ่ขึ้น" className="h-8 w-7 grid place-items-center rounded-lg text-[15px] font-bold text-muted hover:bg-ink/[.06] active:scale-90 transition">A+</button>
              <button onClick={() => { setMemoDraft(session.summary ?? ''); setView('settings'); }} title="ตั้งค่าแชท / แก้ความจำ"
                className="h-8 w-8 grid place-items-center rounded-lg text-[16px] text-muted hover:bg-ink/[.06] active:scale-90 transition">⚙️</button>
            </div>
          </div>

          {/* messages */}
          <div ref={scrollRef} style={{ fontSize: font.size }} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 flex flex-col gap-2.5">
            {messages.length === 0 && <div className="text-muted text-[13px] text-center py-8">เริ่มทักได้เลย</div>}
            {messages.map((m, i) => <ChatBubble key={m.ts ? `${m.ts}-${m.role}` : i} msg={m} charColor={accent} drawing={drawing} onRegen={() => drawScene(m)} onDelete={() => removeImage(m)} onDeleteMsg={() => deleteMessage(m)} />)}
            {busy && <div className="flex justify-start"><div className="rounded-2xl bg-ink/[.05] px-3.5 py-2.5"><Spinner size={16} /></div></div>}
          </div>

          {/* footer: โมเดล + ไอเท็ม + ช่องพิมพ์ */}
          <div className="shrink-0 border-t border-line px-3 pt-2 pb-3 flex flex-col gap-2 bg-white/70 backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-muted shrink-0">โมเดล:</span>
              {PROVIDERS.map((p) => (
                <button key={p.id} onClick={() => pickProvider(p.id)}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold transition ${provider === p.id ? 'bg-grape text-white shadow-pop' : 'bg-ink/[.05] text-muted'}`}>
                  {p.label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                <button onClick={() => drawScene()} disabled={drawing || messages.length === 0}
                  className="rounded-full px-3 py-1 text-[11.5px] font-bold bg-grape/15 text-grape hover:bg-grape/25 disabled:opacity-40 transition">
                  {drawing ? '🎨…' : '📷 วาดฉาก'}
                </button>
                <button onClick={continueScene} disabled={busy || messages.length === 0}
                  className="rounded-full px-3 py-1 text-[11.5px] font-bold bg-bubble/15 text-bubble hover:bg-bubble/25 disabled:opacity-40 transition">
                  ▶ ดำเนินต่อ
                </button>
              </div>
            </div>
            <ItemBar items={state.items} onUse={useItem} disabled={busy} />
            {/* โหมดป้อน: คุยกับตัวละคร / บรรยายฉาก(ผู้เล่าเรื่อง) */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-full bg-ink/[.05] p-0.5">
                {([['char', '💬 คุย'], ['narrator', '🎬 บรรยาย']] as const).map(([m, lbl]) => (
                  <button key={m} onClick={() => setChatMode(m)}
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold transition ${chatMode === m ? 'bg-white shadow-pop text-ink' : 'text-muted'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              {chatMode === 'narrator' && (
                <label className="flex items-center gap-1.5 text-[11.5px] font-bold text-muted cursor-pointer select-none">
                  <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="accent-grape" />
                  👁️ ลับ (ตัวละครไม่รับรู้)
                </label>
              )}
              {chatMode === 'char' && sessChar.power?.trim() && (
                <button onClick={() => setUsePower((v) => !v)} title={sessChar.power}
                  className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold transition ${usePower ? 'bg-grape text-white shadow-pop' : 'bg-ink/[.05] text-muted'}`}>
                  ⚡ ใช้อำนาจ
                </button>
              )}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComposer(); } }}
                placeholder={chatMode === 'narrator' ? 'กำกับฉาก เช่น "ชายแปลกหน้าแอบใส่ยาในเครื่องดื่ม"…' : `พูดกับ ${sessChar.name}…`}
                rows={3}
                className="flex-1 bg-cream/70 rounded-2xl px-4 py-2.5 text-ink placeholder:text-muted/70 border-2 border-line focus:border-grape focus:bg-white focus:outline-none transition resize-none leading-relaxed overflow-y-auto"
              />
              <Btn variant="primary" color={chatMode === 'narrator' ? 'grape' : 'bubble'} disabled={busy || !input.trim()} onClick={submitComposer}>
                {chatMode === 'narrator' ? 'บรรยาย' : 'ส่ง'}
              </Btn>
            </div>
          </div>
        </div>

      </>
    );
  }

  // ================= VIEW: settings (ตั้งค่าแชท / แก้ความจำ) =================
  if (view === 'settings' && session && sessChar) {
    const saveMemo = () => {
      if (sessionId) updateSession(sessionId, (s) => ({ ...s, summary: memoDraft.trim() || undefined }));
      toast('บันทึกความจำแล้ว', '🧠');
      setView('chat');
    };
    return (
      <div className="max-w-2xl mx-auto pb-6">
        <div className="flex items-center gap-2.5 mb-4">
          <IconBtn onClick={() => setView('chat')} title="กลับไปแชท">←</IconBtn>
          <div className="font-display text-xl font-semibold text-ink truncate">⚙️ ตั้งค่าแชท — {sessChar.name}</div>
        </div>
        <Card className="p-4 sm:p-5 flex flex-col gap-2">
          <div className="font-bold text-ink">🧠 ความจำของแชทนี้ (สรุป)</div>
          <p className="text-[12.5px] text-muted">ก้อนนี้ถูกฉีดเข้า prompt ทุกครั้งที่ตอบ — แก้ตรงนี้เพื่อกัน context หลุด/เพี้ยน เช่นเพิ่ม “ออเรเลียได้พลังเวทกลับมาแล้ว, ตอนนี้อยู่เมือง X, กำลังตามล่านักค้าทาส”. ระบบจะรวมกับสรุปอัตโนมัติให้ ไม่ทับทิ้ง</p>
          <textarea value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)} rows={14}
            placeholder="ยังไม่มีสรุป — เขียนความจำหลัก ๆ ของเรื่องที่อยากให้ตัวละครจำได้ที่นี่"
            className="w-full bg-cream/70 rounded-2xl px-4 py-3 text-ink text-[14px] border-2 border-line focus:border-grape focus:bg-white focus:outline-none transition resize-none leading-relaxed" />
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-muted">{memoDraft.length} ตัวอักษร{(session.summarizedCount ?? 0) > 0 ? ` · ย่อแล้ว ${session.summarizedCount} ข้อความ` : ''}</span>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={() => setView('chat')}>ยกเลิก</Btn>
              <Btn variant="primary" color="grape" onClick={saveMemo}>บันทึก</Btn>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ================= VIEW: sessions (รายการแชทของตัวละคร) =================
  if (view === 'sessions' && char) {
    const accent = char.color ?? 'coral';
    return (
      <div className="max-w-3xl mx-auto pb-6">
        <div className="flex items-center gap-2.5 mb-4">
          <IconBtn onClick={() => { setView('chars'); setCharId(null); }} title="กลับ">←</IconBtn>
          <Avatar initial={(char.name || '?').slice(0, 1)} color={accent} size={44} ring />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl font-semibold text-ink truncate">{char.name}</div>
            <div className="text-[12px] text-muted truncate">{char.scenario || char.description || 'เลือกแชท หรือเริ่มใหม่'}</div>
          </div>
          <IconBtn onClick={() => setEditId(char.id)} title="แก้ตัวละคร">✏️</IconBtn>
        </div>
        <Btn variant="primary" color="bubble" className="w-full" onClick={newChat}>＋ เริ่มแชทใหม่</Btn>
        <div className="flex flex-col gap-2 mt-3">
          {charSessions.length === 0 && <div className="text-muted text-[13px] text-center py-6">ยังไม่มีแชท — กด “เริ่มแชทใหม่”</div>}
          {charSessions.map((s) => {
            const L = relLevel(s.rel);
            return (
              <Card key={s.id} className="p-3 flex items-center gap-3">
                <button className="flex-1 min-w-0 text-left" onClick={() => { setSessionId(s.id); setView('chat'); }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: pal(L.color).soft, color: pal(L.color).c }}>{L.label} {s.rel > 0 ? `+${s.rel}` : s.rel}</span>
                    <span className="text-[12px] text-muted shrink-0">{s.messages.filter((m) => !m.item).length} ข้อความ</span>
                  </div>
                  <div className="text-[13.5px] text-ink truncate mt-1">{preview(s)}</div>
                </button>
                <IconBtn onClick={() => setDelId(s.id)} title="ลบแชท">🗑</IconBtn>
              </Card>
            );
          })}
        </div>

        {delSess && (
          <Modal open onClose={() => setDelId(null)} size="sm">
            <div className="p-6 flex flex-col gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">ลบแชทนี้?</h2>
                <p className="text-[13px] text-muted mt-1">ประวัติการสนทนานี้จะหายถาวร ({delSess.messages.filter((m) => !m.item).length} ข้อความ)</p>
              </div>
              <div className="flex gap-2 justify-end">
                <Btn variant="ghost" onClick={() => setDelId(null)}>ยกเลิก</Btn>
                <Btn variant="primary" color="coral" onClick={() => delSession(delSess.id)}>ลบ</Btn>
              </div>
            </div>
          </Modal>
        )}
        {editChar && <ChatCharModal char={editChar} onClose={() => setEditId(null)} onSave={saveChar} onDelete={deleteChar} />}
      </div>
    );
  }

  // ================= VIEW: chars (รายชื่อตัวละคร) =================
  return (
    <div className="max-w-3xl mx-auto pb-6">
      <SectionTitle emoji="💬" color="bubble" title="แชท RP" sub="คุยกับตัวละครที่มีชีวิตของตัวเอง — ความสัมพันธ์ต้องค่อย ๆ สร้าง"
        right={<Btn variant="primary" color="bubble" onClick={addChar}>＋ ตัวละครใหม่</Btn>} />
      {chars.length === 0 ? (
        <EmptyState emoji="💬" title="ยังไม่มีตัวละคร" sub="กด “＋ ตัวละครใหม่” เพื่อสร้างคนแรก" />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {chars.map((c) => {
            const P = pal(c.color ?? 'coral');
            const n = state.sessions.filter((s) => s.charId === c.id).length;
            return (
              <Card key={c.id} className="p-3.5 flex items-center gap-3 relative">
                <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={() => { setCharId(c.id); setView('sessions'); }}>
                  <Avatar initial={(c.name || '?').slice(0, 1)} color={c.color ?? 'coral'} size={48} ring />
                  <div className="min-w-0">
                    <div className="font-bold text-ink truncate">{c.name}</div>
                    <div className="text-[12px] text-muted truncate">{c.scenario || c.description || 'ตัวละครแชท'}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: P.c }}>{n ? `${n} แชท` : 'ยังไม่มีแชท'}</div>
                  </div>
                </button>
                <IconBtn onClick={() => setEditId(c.id)} title="แก้ตัวละคร">✏️</IconBtn>
              </Card>
            );
          })}
        </div>
      )}
      {editChar && <ChatCharModal char={editChar} onClose={() => setEditId(null)} onSave={saveChar} onDelete={deleteChar} />}
    </div>
  );
}
