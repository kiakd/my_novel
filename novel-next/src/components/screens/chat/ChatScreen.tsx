'use client';
import { useEffect, useRef, useState } from 'react';
import { SectionTitle, Card, Btn, Avatar, IconBtn, Spinner, EmptyState, Modal, toast } from '@/components/ui';
import { pal } from '@/lib/theme';
import { useChat } from '@/lib/store/ChatProvider';
import { sendChat, summarizeChat, judgeRel, chatSceneImage, extractState, generatePlayerPersona, memBackfill, memIngest, memRecall, memDelete } from '@/lib/chat-api';
import { applyItem, parseRelTag, clampRel, relLevel, floorRel, stepRel } from '@/lib/chat-rel';
import { activateLore, LORE_SCAN_DEPTH } from '@/lib/chat-lore';
import { useChatFontSize, useChatProvider, useConciseMode, useShowRecall } from '@/lib/uiPrefs';
import type { ChatChar, ChatItem, ChatMsg, ChatSession, ChatStateCard, PlayerPersona } from '@/lib/chat-types';
import { emptyLiveState, renderLiveStateLines } from '@/lib/live-state';
import type { LiveState } from '@/lib/live-state';
import { ChatCharModal } from './ChatCharModal';
import { ChatBubble } from './ChatBubble';
import { RelMeter } from './RelMeter';
import { ItemBar } from './ItemBar';

// แชทเลือก provider ได้ (useChatProvider): deepseek=cloud เร็ว/ฉลาด · lmstudio=Gemma E4B local (~44 tok/s)
// E4B เร็วกว่า 12B เดิม 4 เท่า เลยกลับมาใช้แชทไหว (เดิม 12B ~7 tok/s = ~3 นาที/เทิร์น ช้าเกิน)

const preview = (s: ChatSession) => {
  const last = s.messages.filter((m) => !m.item).slice(-1)[0];
  return last ? last.text.replace(/\*/g, '').slice(0, 64) : 'แชทใหม่';
};

// บัตรสถานะ → ข้อความสำหรับฉีดเข้า prompt (เฉพาะ field ที่มีค่า)
const STATE_FIELDS: { key: keyof ChatStateCard; label: string }[] = [
  { key: 'time', label: 'วัน/เวลา' },
  { key: 'location', label: 'อยู่ที่' },
  { key: 'disguise', label: 'ตัวตน/ร่างตอนนี้' },
  { key: 'whoKnowsTruth', label: 'คนที่รู้ตัวจริง' },
  { key: 'outfit', label: 'ชุดตอนนี้' },
  { key: 'inventory', label: 'ของสำคัญ' },
  { key: 'goals', label: 'เป้าหมายตอนนี้' },
];
const stateToText = (c?: ChatStateCard): string | undefined => {
  if (!c) return undefined;
  const rows = STATE_FIELDS.map(({ key, label }) => (c[key]?.trim() ? `${label}: ${c[key]!.trim()}` : null)).filter(Boolean);
  return rows.length ? rows.join('\n') : undefined;
};

// ตัวกรอง "ไทม์ไลน์สาธารณะ" — ใช้ร่วมกันทั้ง buildMemory (raw/conv) และการคำนวณ excludeFromIdx ให้ขอบตรงกัน
const isPublicConv = (m: ChatMsg) => !m.item && !(m.role === 'narrator' && m.secret);

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
  const [cardDraft, setCardDraft] = useState<ChatStateCard>({});          // draft บัตรสถานะ (ใน view settings)
  const [stateWarnings, setStateWarnings] = useState<string[]>([]);       // คำเตือนความขัดแย้งสถานะ (จาก live-state delta) — โชว์แบนเนอร์
  const [lastRecalled, setLastRecalled] = useState<string[] | null>(null); // ความจำที่ recall เข้า prompt เทิร์นล่าสุด (Injection Viewer)
  const [recallOpen, setRecallOpen] = useState(false);                    // เปิด/ยุบ panel ตัวดูความจำ
  const [personaDraft, setPersonaDraft] = useState<PlayerPersona | null>(null); // draft บทบาทผู้เล่น (gate บังคับ + แก้ในsettings)
  const [personaBusy, setPersonaBusy] = useState(false);                  // กำลังให้ AI กรอกบทบาท
  const { provider, set: setProvider } = useChatProvider();
  const { concise, set: setConcise } = useConciseMode();
  const { show: showRecall, set: setShowRecall } = useShowRecall();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMsgRef = useRef<HTMLDivElement>(null);   // ต้นของข้อความล่าสุด (เพื่อเลื่อนให้คำตอบ AI ขึ้นบน)
  const prevViewRef = useRef(view);
  const prevSessRef = useRef<string | null>(null);
  const prevLenRef = useRef(0);
  const font = useChatFontSize();

  const chars = state.chars;
  const char = chars.find((c) => c.id === charId) ?? null;
  const editChar = chars.find((c) => c.id === editId) ?? null;
  const delSess = state.sessions.find((s) => s.id === delId) ?? null;
  const charSessions = state.sessions.filter((s) => s.charId === charId).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const session = state.sessions.find((s) => s.id === sessionId) ?? null;
  const sessChar = session?.char ?? char;          // ใช้ snapshot ของแชทนั้น (เอกเทศ)
  const rel = session?.rel ?? sessChar?.relStart ?? 0;
  const messages = session?.messages ?? [];

  // เลื่อนอัจฉริยะ: เข้าห้อง/พิมพ์เอง → ลงล่างสุด · AI/ผู้เล่าเรื่องตอบ → เลื่อนให้ "ต้น" คำตอบใหม่อยู่บนสุด (อ่านจากต้นได้เลย ไม่ต้องไล่ขึ้น)
  useEffect(() => {
    const el = scrollRef.current;
    const enteredChat = prevViewRef.current !== 'chat';
    const sessChanged = prevSessRef.current !== sessionId;
    const grew = messages.length > prevLenRef.current;
    const last = messages[messages.length - 1];
    prevViewRef.current = view;
    prevSessRef.current = sessionId;
    prevLenRef.current = messages.length;
    if (view !== 'chat' || !el) return;
    if (enteredChat || sessChanged) {
      el.scrollTo({ top: el.scrollHeight });                                   // โหลดห้อง → ล่างสุดทันที (เห็นข้อความล่าสุด)
    } else if (grew && last) {
      if (last.role === 'user') el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });   // พิมพ์เอง → ลงล่าง
      else lastMsgRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });        // AI ตอบ → ต้นคำตอบขึ้นบน
    }
  }, [messages.length, sessionId, view, busy]);

  // ---- บทบาทผู้เล่น (player persona): เตรียม draft ตามบริบท view/แชท ----
  const blankPersona = (): PlayerPersona => ({ id: 'pp' + Date.now(), name: '', role: '', appearance: '' });
  useEffect(() => {
    if (view === 'settings' && session) setPersonaDraft(session.playerPersona ?? blankPersona());
    else if (view === 'chat' && session && !session.playerPersona) setPersonaDraft(blankPersona());
    else setPersonaDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, sessionId]);

  // RAG: เตือนครั้งเดียวต่อ mount ถ้า embedding ไม่ได้ตั้ง/ใช้งานไม่ได้ (จาก resp ของ ingest/backfill)
  const embedWarnedRef = useRef(false);
  const warnEmbed = (r: { embedConfigured?: boolean; embedError?: string }) => {
    if (embedWarnedRef.current) return;
    if (r.embedError) { embedWarnedRef.current = true; toast(`embedding ใช้งานไม่ได้: ${r.embedError} — ใช้คีย์เวิร์ดแทนชั่วคราว`, '⚠️'); }
    else if (r.embedConfigured === false) { embedWarnedRef.current = true; toast('ความจำระยะยาว: โหมดคีย์เวิร์ดล้วน (ยังไม่ได้ตั้ง embedding)', 'ℹ️'); }
  };

  // RAG: backfill ความจำของ session ครั้งแรกที่เปิด (idempotent ฝั่ง server ด้วย INSERT OR IGNORE)
  const backfilledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sessionId || !sessChar || backfilledRef.current.has(sessionId)) return;
    const msgs = (session?.messages ?? []).filter((m) => !m.item);
    if (!msgs.length) return;                       // empty/not-loaded: do NOT burn the ref
    backfilledRef.current.add(sessionId);
    const rows = msgs.map((m, i) => {
      const secret = m.role === 'narrator' ? !!m.secret : false;
      // narrator = world-level → charId:null (เห็นได้ทุกตัวละคร) · char/user เก็บ charId ไว้
      return {
        id: `${sessionId}:${i}`, scopeId: sessionId,
        charId: m.role === 'narrator' ? null : sessChar.name,
        secret, speaker: m.role, turnIdx: i, ts: m.ts ?? i, text: m.text,
      };
    });
    memBackfill(sessionId, rows).then(warnEmbed).catch(() => {});
  }, [sessionId, sessChar, session?.messages]);

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

  // ---- บทบาทผู้เล่น: AI กรอกให้ / หยิบจากคลัง / บันทึก ----
  const aiFillPersona = async () => {
    if (!sessChar) return;
    setPersonaBusy(true);
    try {
      const r = await generatePlayerPersona({ char: { name: sessChar.name, appearance: sessChar.appearance, description: sessChar.description, scenario: sessChar.scenario }, provider });
      if (r.ok && r.persona) setPersonaDraft((d) => ({ id: d?.id ?? ('pp' + Date.now()), ...r.persona! }));
      else toast(r.error ?? 'ให้ AI กรอกบทบาทไม่สำเร็จ', '⚠️');
    } catch (e) { toast((e as Error).message || 'เชื่อมต่อไม่ได้', '⚠️'); }
    finally { setPersonaBusy(false); }
  };
  const pickPersona = (p: PlayerPersona) => setPersonaDraft({ ...p, id: 'pp' + Date.now() }); // สำเนาใหม่ — แก้แล้วไม่กระทบคลังเดิม
  const savePersona = (toLibrary: boolean) => {
    if (!sessionId || !personaDraft) return;
    const p: PlayerPersona = { id: personaDraft.id, name: personaDraft.name.trim() || 'ผู้เล่น', role: personaDraft.role?.trim() || undefined, appearance: personaDraft.appearance?.trim() || undefined };
    updateSession(sessionId, (s) => ({ ...s, playerPersona: p }));
    if (toLibrary) mutate((st) => {
      const lib = st.personas ?? [];
      const idx = lib.findIndex((x) => x.id === p.id);
      return { ...st, personas: idx >= 0 ? lib.map((x) => (x.id === p.id ? p : x)) : [...lib, p] };
    });
    toast(toLibrary ? 'ตั้งบทบาท + บันทึกเข้าคลังแล้ว' : 'ตั้งบทบาทแล้ว', '🎭');
  };
  // ฟอร์มแก้บทบาทผู้เล่น (ใช้ร่วม gate บังคับ + การ์ดใน settings)
  const setPD = (patch: Partial<PlayerPersona>) => setPersonaDraft((d) => ({ ...(d ?? blankPersona()), ...patch }));
  const personaEditorBody = () => {
    const pd = personaDraft ?? blankPersona();
    const lib = state.personas ?? [];
    const field = 'bg-cream/70 rounded-xl px-3 py-2 text-ink text-[13px] border-2 border-line focus:border-grape focus:bg-white focus:outline-none transition';
    return (
      <>
        {lib.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-bold text-muted">เลือกจากคลัง (หยิบมาแก้ได้ ไม่กระทบตัวเดิม)</span>
            <div className="flex flex-wrap gap-1.5">
              {lib.map((p) => (
                <button key={p.id} onClick={() => pickPersona(p)}
                  className="rounded-full px-3 py-1 text-[12px] font-bold bg-grape/10 text-grape hover:bg-grape/20 active:scale-95 transition">
                  🎭 {p.name}{p.role ? ` · ${p.role.slice(0, 18)}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold text-muted">ชื่อ/ที่ตัวละครเรียกคุณ *</span>
          <input value={pd.name} onChange={(e) => setPD({ name: e.target.value })} placeholder="เช่น เพม, คุณชายอเล็กซ์" className={field} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold text-muted">บทบาท/สถานะ</span>
          <textarea value={pd.role ?? ''} onChange={(e) => setPD({ role: e.target.value })} rows={2} placeholder="เช่น ทายาทตระกูลใหญ่ที่จ้างเธอ / นักล่าปีศาจที่บุกปราสาท / รุ่นพี่ที่ออฟฟิศ" className={`${field} resize-none`} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11.5px] font-bold text-muted">รูปลักษณ์/การแต่งตัว</span>
          <textarea value={pd.appearance ?? ''} onChange={(e) => setPD({ appearance: e.target.value })} rows={2} placeholder="เช่น ชายหนุ่มสูงโปร่ง สูทดำ ท่าทางสุขุม" className={`${field} resize-none`} />
        </label>
        <button onClick={aiFillPersona} disabled={personaBusy}
          className="self-start rounded-full px-3.5 py-1.5 text-[12.5px] font-bold bg-bubble/15 text-bubble hover:bg-bubble/25 disabled:opacity-50 transition">
          {personaBusy ? '✨ กำลังให้ AI กรอก…' : '✨ ให้ AI กรอกบทบาทให้ (ตามฉากตัวละคร)'}
        </button>
      </>
    );
  };

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
  // งบ context แยกตาม provider: local (Gemma E4B ctx ~8K) ต้องบีบกว่า cloud มาก — กัน overflow + prefill เร็วขึ้น
  const isLocalProvider = provider === 'lmstudio';
  const RAW_KEEP = isLocalProvider ? 8 : 14;
  const FOLD_TRIGGER = isLocalProvider ? 16 : 24;
  const rawBudget = isLocalProvider ? 6000 : 12000;   // งบ history ดิบ (ตัวอักษร)
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
    const conv = hist.filter(isPublicConv);
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
    // อัปเดต "บัตรสถานะ" จาก "ช่วงล่าสุด" (decouple จาก fold) — สกัดจากข้อความปัจจุบัน ไม่ใช่ส่วนที่เพิ่งพับ (เก่า)
    // รันทุก ~STATE_REFRESH เทิร์น เพื่อให้ time/location/ปลอมตัว สดเสมอ กัน stateCard ค้างเมื่อ raw ยังไม่ถึงรอบ fold
    const STATE_REFRESH = 6;
    const seenAt = session?.stateCardAt ?? summarized;
    if (conv.length > 0 && conv.length - seenAt >= STATE_REFRESH) {
      const recent = conv.slice(Math.max(seenAt, conv.length - 12));
      const recentTranscript = recent.map((m) => `${speaker(m)}: ${m.text}`).join('\n');
      const total = conv.length;
      void extractState({ prevCard: session?.stateCard, transcript: recentTranscript, charName: sessChar.name, provider }).then((ex) => {
        if (!ex || !sessionId) return;
        // เอาเฉพาะ field ที่สกัดได้จริง — undefined ห้ามทับค่าเดิมในบัตร
        const cleaned = Object.fromEntries(Object.entries(ex.card).filter(([, v]) => v)) as ChatStateCard;
        const now = Date.now();
        updateSession(sessionId, (s) => ({
          ...s,
          stateCard: { ...s.stateCard, ...cleaned },
          memFacts: [...(s.memFacts ?? []), ...ex.facts.map((f) => ({ ...f, ts: now }))],
          stateCardAt: total,
        }));
      }).catch(() => {
        toast('อัปเดตสถานะไม่สำเร็จ — สถานะอาจไม่ตรง', '⚠️');
      });
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

  // lorebook: เลือกข้อเท็จจริงที่ keyword โผล่ในข้อความล่าสุด (จ่าย token เฉพาะที่เกี่ยวกับฉาก)
  const pickLore = (recent: ChatMsg[], userInput: string): string[] | undefined => {
    const hits = activateLore(sessChar?.lore, [...recent.slice(-LORE_SCAN_DEPTH).map((m) => m.text), userInput]);
    return hits.length ? hits.map((e) => e.text) : undefined;
  };

  // snapshot เวลา/สถานที่ ติดไปกับข้อความ AI — ทั้งคู่มาจาก live delta (อัปเดตทุกเทิร์น) ก่อน แล้ว fallback ไป stateCard (extractState ทุก ~6 เทิร์น)
  const snapAt = (card?: LiveState): { time?: string; place?: string } | undefined => {
    const time = (card?.time ?? session?.liveState?.time ?? session?.stateCard?.time)?.trim() || undefined;
    const place = (card?.location ?? session?.liveState?.location ?? session?.stateCard?.location)?.trim() || undefined;
    const out: { time?: string; place?: string } = {};
    if (time) out.time = time;
    if (place) out.place = place;
    return out.time || out.place ? out : undefined;
  };

  const callModel = async (userInput: string, baseRel: number, hist: ChatMsg[], maxTok?: number, judge = false, regen = false) => {
    if (!sessChar || !sessionId) return;
    setBusy(true);
    try {
      const { summary, raw } = await buildMemory(hist);
      const history = raw.map(toHist);
      // RAG: turnIdx ของ ingest ยึดตำแหน่งใน non-item array (ตรงกับ backfill ที่ index ทุก non-item)
      const baseN = hist.filter((m) => !m.item).length;
      // RAG recall: ตัดส่วนที่อยู่ใน raw context อยู่แล้ว (excludeFromIdx)
      // ⚠️ ขอบ exclude ต้องมาจากตัวกรองไทม์ไลน์สาธารณะ (isPublicConv) ตัวเดียวกับที่สร้าง raw/conv
      //    ไม่งั้นเมื่อมีฉากลับ baseN (นับ narrator ลับ) จะเพี้ยนจาก raw (ไม่นับ) → exclude เลื่อน
      const conv = hist.filter(isPublicConv);
      const excludeFromIdx = Math.max(0, conv.length - raw.length);
      // query สำหรับ recall: เทิร์น user จริง (judge) ใช้ข้อความผู้เล่นได้เลย —
      // แต่ continue/regen userInput เป็นคำสั่งสังเคราะห์ ("(ดำเนินเรื่องต่อ)…") ไม่มีคีย์เวิร์ดฉาก → ใช้ข้อความจริงล่าสุดแทน
      const recallQuery = judge
        ? userInput
        : ([...conv].reverse().find((m) => m.role === 'char' || m.role === 'user')?.text ?? userInput);
      let recalled: string[] | undefined;
      try {
        const rc = await memRecall({ scopeId: sessionId, query: recallQuery, activeChar: sessChar.name, mode: 'char', excludeFromIdx, k: 4 });
        recalled = rc.memories.length ? rc.memories : undefined;
      } catch { /* degrade: ไม่มี recall ก็ส่งปกติ */ }
      // dedup: ตัด recalled ที่ข้อความซ้ำกับ raw history ที่กำลังส่งอยู่แล้ว (กันฉีดซ้ำ)
      if (recalled) {
        const rawTexts = raw.map((m) => m.text);
        recalled = recalled.filter((mem) => !rawTexts.some((t) => t.includes(mem) || mem.includes(t)));
        if (!recalled.length) recalled = undefined;
      }
      setLastRecalled(recalled ?? []);   // Injection Viewer: บันทึกความจำที่ฉีดจริงเทิร์นนี้ ([] = ไม่ได้ดึงอะไร)
      const r = await sendChat({ char: sessChar, history, user_input: userInput, rel: baseRel, summary: summary || undefined, lore: pickLore(raw, userInput), state: stateToText(session?.stateCard), stateCard: session?.liveState ?? emptyLiveState(), playerPersona: session?.playerPersona, provider, recalled, concise, max_tokens: maxTok ?? 1500 });
      if (r.ok && r.text) {
        const { text } = parseRelTag(r.text);   // ตัดแท็กออกถ้าโมเดลเผลอใส่ (ตอนนี้ใช้ judge ประเมินแทน) — backend strip แท็ก [[state:]] ให้แล้ว
        const at = snapAt(r.stateCard);          // เก็บเวลา/สถานที่ ณ จังหวะคำตอบนี้
        const ts = Date.now();
        updateSession(sessionId, (s) => ({ ...s, messages: [...s.messages, { role: 'char', text, ts, ...(at ? { at } : {}) }], updatedAt: ts }));
        // RAG: index ข้อความใหม่ (turnIdx = ตำแหน่งใน filtered array — ตรงกับ backfill)
        // judge=true = เทิร์น user จริง (user ถูก append ที่ baseN, char ที่ baseN+1)
        // judge=false = ต่อเรื่อง/regen (ไม่มี user ใหม่ — char อยู่ที่ baseN)
        // Phase 3B: tag เทิร์น char ด้วย importance/persistent (จาก delta ฝั่ง backend) → recall บูสต์เหตุการณ์เชิงปม
        const imp = { importance: r.importance ?? 0, persistent: r.persistent ?? false };
        const ingestRows = judge
          ? [
              { id: `${sessionId}:${baseN}`, scopeId: sessionId, charId: sessChar.name, secret: false, speaker: 'user', turnIdx: baseN, ts: ts - 1, text: userInput },
              { id: `${sessionId}:${baseN + 1}`, scopeId: sessionId, charId: sessChar.name, secret: false, speaker: 'char', turnIdx: baseN + 1, ts, text, ...imp },
            ]
          : [
              { id: `${sessionId}:${baseN}`, scopeId: sessionId, charId: sessChar.name, secret: false, speaker: 'char', turnIdx: baseN, ts, text, ...imp },
            ];
        // regen: id ของ char turn ชนกับของเก่า — backend INSERT OR IGNORE จะคงข้อความเก่าไว้ → ต้องลบก่อน re-ingest
        const doIngest = () => memIngest(sessionId, ingestRows).then(warnEmbed).catch(() => {});
        if (regen) memDelete({ ids: ingestRows.map((row) => row.id) }).then(doIngest).catch(doIngest);
        else void doIngest();
        // live state: backend apply [[state:]] delta แล้วส่ง card ใหม่ + คำเตือนกลับมา (ไม่เอา rel มาทับ rel หลัก)
        if (r.stateCard) updateSession(sessionId, (s) => ({ ...s, liveState: r.stateCard }));
        if (r.stateWarnings?.length) { setStateWarnings(r.stateWarnings); toast('⚠️ ตรวจพบความขัดแย้งของสถานะ', '⚠️'); }
        else setStateWarnings([]);
        // ให้ "ผู้ตัดสิน" ประเมินความสัมพันธ์เสมอ (เฉพาะเทิร์นผู้เล่นจริง)
        if (judge) {
          const jr = await judgeRel({ charName: sessChar.name, mindset: sessChar.mindset, likes: sessChar.likes, dislikes: sessChar.dislikes, currentRel: baseRel, userMsg: userInput, charReply: text, provider });
          if (jr != null) updateSession(sessionId, (s) => ({ ...s, rel: floorRel(s.rel, stepRel(s.rel, jr)) }));
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
        rel, messages, 1500,
      );
    }
  };

  // โหมดผู้เล่าเรื่อง: ยิงคำกำกับ → โมเดลบรรยายฉาก/บุคคลที่ 3/NPC แล้วแนบเป็นข้อความ narrator (secretFlag)
  const runNarrate = async (userInput: string, secretFlag: boolean, hist?: ChatMsg[], regen = false) => {
    if (!sessChar || !sessionId || busy) return;
    setBusy(true);
    try {
      const base = hist ?? messages;   // regen ส่งบริบทที่ตัดคำตอบเดิมออกมาเอง (กัน stale closure)
      const { summary, raw } = await buildMemory(base);
      // ผู้เล่าเรื่องรอบรู้: เห็นทั้งไทม์ไลน์สาธารณะ + ฉากลับ (ความจำลับพับแยก ไม่ปนเข้า summary ที่ตัวละครเห็น)
      const { summary: secretSummary, raw: secretRaw } = await buildSecretMemory(base);
      const merged = [...raw, ...secretRaw].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
      const history = merged.map(toHist);
      const fullSummary = [summary, secretSummary ? `[เหตุการณ์ลับที่ ${sessChar.name} ไม่รับรู้ — ใช้ประกอบการบรรยายเท่านั้น]\n${secretSummary}` : '']
        .filter(Boolean).join('\n\n');
      // RAG recall (mode narrator): กู้ turn เก่าที่เกี่ยวข้อง — exclude ขอบ raw สาธารณะ (เหมือน callModel)
      // ผู้เล่าเรื่องเห็นทั้งฉากปกติ + ฉากลับ แต่ recalled มาจาก store ตามตัวกรอง narrator ของ backend
      const convN = base.filter((m) => !m.item);
      const baseN = convN.length;                  // ตำแหน่ง turn narrator ใหม่ในไทม์ไลน์ non-item (ตรงกับ backfill)
      const excludeFromIdx = Math.max(0, base.filter(isPublicConv).length - raw.length);
      // คำสั่งบรรยายมักเป็น "[กำกับฉาก]…" หรือคำสั่งสังเคราะห์ — ใช้ข้อความจริงล่าสุดเป็น query ถ้าเป็นคำสั่งต่อเรื่อง
      const recallQuery = userInput.startsWith('(') ? ([...base].reverse().find((m) => !m.item)?.text ?? userInput) : userInput;
      let recalled: string[] | undefined;
      try {
        const rc = await memRecall({ scopeId: sessionId, query: recallQuery, activeChar: sessChar.name, mode: 'narrator', excludeFromIdx, k: 4 });
        recalled = rc.memories.length ? rc.memories : undefined;
      } catch { /* degrade: ไม่มี recall ก็บรรยายปกติ */ }
      if (recalled) {
        const rawTexts = merged.map((m) => m.text);
        recalled = recalled.filter((mem) => !rawTexts.some((t) => t.includes(mem) || mem.includes(t)));
        if (!recalled.length) recalled = undefined;
      }
      setLastRecalled(recalled ?? []);   // Injection Viewer (โหมดบรรยาย)
      const r = await sendChat({ char: sessChar, history, user_input: userInput, rel, summary: fullSummary || undefined, lore: pickLore(merged, userInput), state: stateToText(session?.stateCard), playerPersona: session?.playerPersona, mode: 'narrator', provider, recalled, concise, max_tokens: 1500 });
      if (r.ok && r.text) {
        const { text: out } = parseRelTag(r.text);
        const at = snapAt();
        const ts = Date.now();
        updateSession(sessionId, (s) => ({ ...s, messages: [...s.messages, { role: 'narrator', text: out, secret: secretFlag, ts, ...(at ? { at } : {}) }], updatedAt: ts }));
        // RAG: index ข้อความผู้เล่าเรื่อง — charId:null (world-level) · secret = ฉากลับหรือไม่
        // regen narrator: ลบ id เดิมก่อน (id ชนกับคำตอบเก่า) แล้ว re-ingest ให้ข้อความใหม่ชนะ
        const row = { id: `${sessionId}:${baseN}`, scopeId: sessionId, charId: null, secret: secretFlag, speaker: 'narrator', turnIdx: baseN, ts, text: out };
        const doIngest = () => memIngest(sessionId, [row]).then(warnEmbed).catch(() => {});
        if (regen) memDelete({ ids: [row.id] }).then(doIngest).catch(doIngest);
        else void doIngest();
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
    // RAG: เคลียร์ session ออกจาก gate → backfill effect รันใหม่ → syncScope ลบ row ที่หายไป (heal การลบ)
    backfilledRef.current.delete(sessionId);
  };

  // regen "คำตอบ AI" — ลบคำตอบนั้น (และอะไรที่อยู่หลัง) แล้วยิงใหม่จากบริบทเดิม โดยคงข้อความผู้เล่นไว้
  // ⚠️ ไม่ย้อนบัตรสถานะ/rel ที่คำตอบเดิมเคยขยับ — ถ้าคำตอบใหม่ต่างเยอะ อาจต้องแก้บัตรเอง
  const regenMessage = async (m: ChatMsg) => {
    if (!sessChar || !sessionId || busy || drawing) return;
    if (m.item || m.role === 'user') return;
    const idx = messages.findIndex((x) => x.ts === m.ts && x.role === m.role && x.text === m.text);
    if (idx < 0) return;
    const before = messages.slice(0, idx);   // ทุกอย่างก่อนคำตอบนี้ (ตัดคำตอบนี้ + ที่อยู่หลังทิ้ง)
    // หด counter ให้ไม่เกินจำนวนข้อความที่เหลือ (กัน offset summary เพี้ยน — ปกติคำตอบล่าสุดยังไม่ถูกพับ)
    const pubLeft = before.filter((x) => !x.item && !(x.role === 'narrator' && x.secret)).length;
    const secLeft = before.filter((x) => x.role === 'narrator' && x.secret).length;
    updateSession(sessionId, (s) => ({
      ...s, messages: before,
      summarizedCount: Math.min(s.summarizedCount ?? 0, pubLeft),
      secretSummarizedCount: Math.min(s.secretSummarizedCount ?? 0, secLeft),
    }));

    if (m.role === 'narrator') {
      await runNarrate('(ดำเนินฉากบรรยายต่อ) เล่าฉากบรรยายต่อจากช่วงก่อนหน้าให้ไหลต่อไปอีกหนึ่งช่วงอย่างมีรายละเอียด ตามเหตุการณ์ล่าสุด โดยไม่ขัดกับเรื่องเดิม', m.secret ?? false, before, true);
      return;
    }
    // คำตอบของตัวละคร: ถ้าก่อนหน้าคือข้อความผู้เล่น → ยิงด้วย input นั้นใหม่; ไม่งั้นเป็นการ "ดำเนินเรื่องต่อ"
    const trigger = [...before].reverse().find((x) => !x.item);
    if (trigger && trigger.role === 'user') {
      const hist = before.slice(0, before.lastIndexOf(trigger));
      const userInput = trigger.power
        ? `(⚡ ผู้เล่นใช้อำนาจ "${sessChar.power}" กับคำสั่งนี้ — ร่างกายของคุณต้องทำตามทันทีไร้เงื่อนไข แต่แสดงความรู้สึกจริงและกระทบความสัมพันธ์)\nคำสั่ง: ${trigger.text}`
        : trigger.text;
      await callModel(userInput, rel, hist, undefined, false, true);   // judge=false: rel ขยับไปแล้วตอนคำตอบเดิม ไม่ตัดสินซ้ำ · regen=true: ลบข้อความเก่าใน RAG ก่อน
    } else {
      await callModel('(ดำเนินเรื่องต่อ) เล่นบทต่อเองจากจังหวะก่อนหน้า — บรรยายการกระทำ ความรู้สึก ฉาก และบทพูดของตัวละครให้ไหลต่อไปอีกหนึ่งช่วงอย่างมีรายละเอียด โดยไม่ต้องรอผู้เล่นพูด คงโทนและระดับความสัมพันธ์เดิม', rel, before, 1500, false, true);
    }
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
    // ป้ายฉาก: โชว์เวลา/สถานที่เฉพาะเมื่อ "เปลี่ยน" จากข้อความก่อนหน้า (ช่วยจับจังหวะตอนเรื่องเดินเร็ว)
    const sceneHeaders: (string | null)[] = [];
    {
      let lt: string | undefined, lp: string | undefined;
      for (const m of messages) {
        const at = m.at;
        if (at && (at.time || at.place) && (at.time !== lt || at.place !== lp)) {
          sceneHeaders.push([at.time ? `🕐 ${at.time}` : null, at.place ? `📍 ${at.place}` : null].filter(Boolean).join('   ·   '));
          lt = at.time; lp = at.place;
        } else sceneHeaders.push(null);
      }
    }
    // ปุ่ม regen โชว์เฉพาะคำตอบ AI ล่าสุด (มาตรฐานแชต — กัน thread เพี้ยนจากการ regen กลางบท)
    let lastReplyIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) { const m = messages[i]; if (!m.item && (m.role === 'char' || m.role === 'narrator')) { lastReplyIdx = i; break; } }

    // 🎭 gate: บังคับตั้ง "บทบาทผู้เล่น" ก่อนเริ่มเล่น (ถ้ายังไม่มี)
    if (!session.playerPersona) {
      const pd = personaDraft ?? blankPersona();
      return (
        <div className="fixed inset-0 z-30 flex flex-col bg-cream md:static md:z-auto md:max-w-2xl md:mx-auto md:my-6 md:rounded-3xl md:border-2 md:border-line md:shadow-pop overflow-y-auto">
          <div className="shrink-0 px-4 py-3 border-b border-line flex items-center gap-2.5 bg-white/70 backdrop-blur">
            <IconBtn onClick={() => { setView('sessions'); setSessionId(null); }} title="กลับ">←</IconBtn>
            <div className="font-display text-lg font-semibold text-ink leading-tight">🎭 ตั้งบทบาทของคุณ ก่อนเริ่มเล่นกับ {sessChar.name}</div>
          </div>
          <div className="flex-1 p-4 sm:p-5 flex flex-col gap-3">
            <p className="text-[12.5px] text-muted leading-relaxed">เพื่อให้ <b>{sessChar.name}</b> รู้ว่าคุณสวมบทเป็นใคร และอินกับฉากจริง ๆ — ตั้งบทบาทของคุณก่อนสักนิด (ไม่อยากคิดเอง กด <b>✨ ให้ AI กรอกให้</b> ได้เลย)</p>
            {personaEditorBody()}
            <div className="flex flex-wrap gap-2 mt-1">
              <Btn variant="primary" color="grape" disabled={!pd.name.trim()} onClick={() => savePersona(false)}>▶ เริ่มเล่น</Btn>
              <button disabled={!pd.name.trim()} onClick={() => savePersona(true)}
                className="rounded-full px-4 py-2 text-[13px] font-bold border-2 border-grape/40 text-grape hover:bg-grape/10 disabled:opacity-40 transition">💾 เริ่มเล่น + บันทึกเข้าคลัง</button>
            </div>
          </div>
        </div>
      );
    }
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
              <button onClick={() => { setMemoDraft(session.summary ?? ''); setCardDraft(session.stateCard ?? {}); setView('settings'); }} title="ตั้งค่าแชท / แก้ความจำ"
                className="h-8 w-8 grid place-items-center rounded-lg text-[16px] text-muted hover:bg-ink/[.06] active:scale-90 transition">⚙️</button>
            </div>
          </div>

          {/* messages */}
          <div ref={scrollRef} style={{ fontSize: font.size }} className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 flex flex-col gap-2.5">
            {messages.length === 0 && <div className="text-muted text-[13px] text-center py-8">เริ่มทักได้เลย</div>}
            {messages.map((m, i) => (
              <div key={m.ts ? `${m.ts}-${m.role}` : i} ref={i === messages.length - 1 ? lastMsgRef : null}>
                {sceneHeaders[i] && (
                  <div className="flex justify-center my-1.5">
                    <span className="text-[11px] font-bold text-muted bg-ink/[.04] border border-line rounded-full px-3 py-1">{sceneHeaders[i]}</span>
                  </div>
                )}
                <ChatBubble msg={m} charColor={accent} drawing={drawing} busy={busy}
                  onRegen={() => drawScene(m)} onDelete={() => removeImage(m)} onDeleteMsg={() => deleteMessage(m)}
                  onRegenText={i === lastReplyIdx ? () => regenMessage(m) : undefined} />
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="rounded-2xl bg-ink/[.05] px-3.5 py-2.5"><Spinner size={16} /></div></div>}
          </div>

          {/* แบนเนอร์เตือนความขัดแย้งสถานะ (live-state delta) — ปิดได้ */}
          {stateWarnings.length > 0 && (
            <div className="shrink-0 mx-3 mb-2 rounded-2xl border-2 border-coral/40 bg-coral/10 px-3.5 py-2.5">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-bold text-coral">⚠️ สถานะอาจขัดแย้ง — ตรวจ/แก้บัตรสถานะ หรือรีเจนคำตอบ</div>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {stateWarnings.map((w, i) => (
                      <li key={i} className="text-[12px] text-ink/80 leading-snug">⚠️ {w}</li>
                    ))}
                  </ul>
                </div>
                <button onClick={() => setStateWarnings([])} title="ปิด"
                  className="h-6 w-6 grid place-items-center rounded-lg text-[13px] text-coral hover:bg-coral/15 active:scale-90 transition shrink-0">✕</button>
              </div>
            </div>
          )}

          {/* Injection Viewer: ความจำระยะยาวที่ถูกฉีดเข้า prompt เทิร์นล่าสุด (เปิดจากตั้งค่า — ดีบั๊ก/ความเชื่อมั่น) */}
          {showRecall && lastRecalled !== null && (
            <div className="shrink-0 mx-3 mb-2 rounded-2xl border-2 border-grape/30 bg-grape/[.06]">
              <button onClick={() => setRecallOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3.5 py-2 text-[12px] font-bold text-grape">
                <span>🧠 ความจำที่ดึงมาใช้เทิร์นล่าสุด · {lastRecalled.length} ก้อน</span>
                <span className="text-[11px]">{recallOpen ? '▲ ยุบ' : '▼ ดู'}</span>
              </button>
              {recallOpen && (
                <div className="px-3.5 pb-2.5">
                  {lastRecalled.length === 0 ? (
                    <div className="text-[12px] text-muted leading-snug">— ไม่ได้ดึงความจำเก่ามาเทิร์นนี้ (บริบทล่าสุดพอแล้ว หรือยังไม่มีอะไรเข้าเกณฑ์)</div>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {lastRecalled.map((mem, i) => (
                        <li key={i} className="text-[12px] text-ink/80 leading-snug rounded-lg bg-white/60 px-2.5 py-1.5">{mem}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* footer: โมเดล + ไอเท็ม + ช่องพิมพ์ */}
          <div className="shrink-0 border-t border-line px-3 pt-2 pb-3 flex flex-col gap-2 bg-white/70 backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="flex items-center justify-end gap-1.5">
              <button onClick={() => drawScene()} disabled={drawing || messages.length === 0}
                className="rounded-full px-3 py-1 text-[11.5px] font-bold bg-grape/15 text-grape hover:bg-grape/25 disabled:opacity-40 transition">
                {drawing ? '🎨…' : '📷 วาดฉาก'}
              </button>
              <button onClick={continueScene} disabled={busy || messages.length === 0}
                className="rounded-full px-3 py-1 text-[11.5px] font-bold bg-bubble/15 text-bubble hover:bg-bubble/25 disabled:opacity-40 transition">
                ▶ ดำเนินต่อ
              </button>
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
                sessChar.powerStanding ? (
                  <span title={sessChar.power}
                    className="rounded-full px-2.5 py-1 text-[11.5px] font-bold bg-grape text-white shadow-pop">
                    🔒 บังคับถาวร
                  </span>
                ) : (
                  <button onClick={() => setUsePower((v) => !v)} title={sessChar.power}
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold transition ${usePower ? 'bg-grape text-white shadow-pop' : 'bg-ink/[.05] text-muted'}`}>
                    ⚡ ใช้อำนาจ
                  </button>
                )
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
      if (sessionId) {
        const cleaned = Object.fromEntries(Object.entries(cardDraft).map(([k, v]) => [k, v?.trim() || undefined])) as ChatStateCard;
        updateSession(sessionId, (s) => ({ ...s, summary: memoDraft.trim() || undefined, stateCard: cleaned }));
      }
      toast('บันทึกความจำแล้ว', '🧠');
      setView('chat');
    };
    // ซิงค์การ์ด: ดึงโปรไฟล์ตัวละครต้นฉบับล่าสุดมาทับ snapshot ของแชทนี้ (แชทเก็บสำเนา ณ ตอนเริ่ม)
    const tmpl = state.chars.find((c) => c.id === session.charId) ?? null;
    const syncCard = () => {
      if (!tmpl || !sessionId) return;
      updateSession(sessionId, (s) => ({ ...s, char: { ...tmpl } }));
      toast('ซิงค์การ์ดล่าสุดเข้าแชทนี้แล้ว', '🔄');
    };
    return (
      <div className="max-w-2xl mx-auto pb-6">
        <div className="flex items-center gap-2.5 mb-4">
          <IconBtn onClick={() => setView('chat')} title="กลับไปแชท">←</IconBtn>
          <div className="font-display text-xl font-semibold text-ink truncate">⚙️ ตั้งค่าแชท — {sessChar.name}</div>
        </div>
        {/* โมเดล AI ของแชท — global pref (localStorage) ใช้กับทุกแชท: deepseek=cloud · lmstudio=Gemma E4B local */}
        <Card className="p-4 sm:p-5 flex flex-col gap-2.5 mb-3">
          <div className="font-bold text-ink">🤖 โมเดล AI ของแชท</div>
          <p className="text-[12.5px] text-muted">เลือกผู้ให้บริการที่ใช้ตอบแชท (มีผลกับทุกแชท จำค่าไว้ให้). <b>DeepSeek</b> = cloud เร็ว/ฉลาด ต้องมีเน็ต. <b>Gemma E4B</b> = รันในเครื่อง (LM Studio) ส่วนตัว 100% ไม่ผ่านเน็ต ~44 tok/s</p>
          <div className="flex gap-1.5 bg-cream/70 rounded-full p-1 self-start">
            {([
              { id: 'deepseek', label: '☁️ DeepSeek', hint: 'cloud' },
              { id: 'lmstudio', label: '💻 Gemma E4B', hint: 'local' },
            ] as const).map((p) => (
              <button key={p.id} onClick={() => setProvider(p.id)}
                title={p.hint}
                className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition ${provider === p.id ? 'bg-white shadow-pop text-ink' : 'text-muted hover:text-ink'}`}>
                {p.label}
              </button>
            ))}
          </div>
          {/* โหมดกระชับ — global pref (localStorage) ใช้ร่วมกับนิยาย: ลดพรรณนา เน้นบทพูด/การกระทำ */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none mt-1">
            <input type="checkbox" checked={concise} onChange={(e) => setConcise(e.target.checked)} className="accent-grape mt-0.5" />
            <span className="flex flex-col">
              <span className="text-[13px] font-bold text-ink">✂️ โหมดกระชับ (ลดพรรณนา เน้นบทสนทนา)</span>
              <span className="text-[11.5px] text-muted leading-snug">เปิดเพื่อให้ AI เขียนพรรณนาฟุ่มเฟือยน้อยลง เน้นบทพูด+การกระทำ (มีผลกับทุกแชทและการเขียนนิยาย)</span>
            </span>
          </label>
          {/* Injection Viewer toggle — โชว์ความจำที่ระบบดึงเข้า prompt เทิร์นล่าสุด (ดีบั๊ก/ความเชื่อมั่น) */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input type="checkbox" checked={showRecall} onChange={(e) => setShowRecall(e.target.checked)} className="accent-grape mt-0.5" />
            <span className="flex flex-col">
              <span className="text-[13px] font-bold text-ink">🧠 โชว์ความจำที่ระบบดึงมาใช้</span>
              <span className="text-[11.5px] text-muted leading-snug">เปิดเพื่อเห็นว่าแต่ละเทิร์น AI ดึง “ความจำระยะยาว” ก้อนไหนเข้ามาช่วยตอบ — ใช้ตรวจว่าระบบจำเรื่องเก่าได้ถูกไหม</span>
            </span>
          </label>
        </Card>
        {/* บทบาทของผู้เล่น — ตัวตนที่ผู้เล่นสวมในแชทนี้ (ฉีดเข้า prompt ให้ตัวละครโต้ตอบตามบท) */}
        <Card className="p-4 sm:p-5 flex flex-col gap-2.5 mb-3">
          <div className="font-bold text-ink">🎭 บทบาทของฉัน (ผู้เล่น)</div>
          <p className="text-[12.5px] text-muted">ตัวตนที่คุณสวมบทในแชทนี้ — <b>{sessChar.name}</b> จะรู้จักและโต้ตอบตามนี้ · แก้แล้วกดบันทึก (บันทึกเข้าคลังเพื่อหยิบไปใช้แชทอื่นได้)</p>
          {personaEditorBody()}
          <div className="flex flex-wrap gap-2 mt-1">
            <Btn variant="primary" color="grape" disabled={!personaDraft?.name.trim()} onClick={() => savePersona(false)}>💾 บันทึกบทบาท</Btn>
            <button disabled={!personaDraft?.name.trim()} onClick={() => savePersona(true)}
              className="rounded-full px-4 py-2 text-[13px] font-bold border-2 border-grape/40 text-grape hover:bg-grape/10 disabled:opacity-40 transition">💾 บันทึก + เข้าคลัง</button>
          </div>
        </Card>
        {/* บัตรสถานะ — field ตายตัว ฉีดเข้า prompt ทุกเทิร์น (อัปเดตอัตโนมัติตอนพับความจำ แก้มือได้) */}
        <Card className="p-4 sm:p-5 flex flex-col gap-2 mb-3">
          <div className="font-bold text-ink">📌 บัตรสถานะปัจจุบัน</div>
          <p className="text-[12.5px] text-muted">ข้อเท็จจริง "ตอนนี้" ที่ AI ต้องยึดเด็ดขาด — ระบบอัปเดตให้อัตโนมัติตอนย่อความจำ แต่แก้มือตรงนี้ได้เลย (เช่นร่างปลอม/ชุด/ที่อยู่เพี้ยนเมื่อไหร่ มาแก้ที่นี่จุดเดียวจบ)</p>
          <div className="grid sm:grid-cols-2 gap-2.5">
            {STATE_FIELDS.map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-[11.5px] font-bold text-muted">{label}</span>
                <input value={cardDraft[key] ?? ''} onChange={(e) => setCardDraft((c) => ({ ...c, [key]: e.target.value }))}
                  placeholder="—"
                  className="bg-cream/70 rounded-xl px-3 py-2 text-ink text-[13px] border-2 border-line focus:border-grape focus:bg-white focus:outline-none transition" />
              </label>
            ))}
          </div>
        </Card>
        {/* สถานะติดตามอัตโนมัติ (live) — read-only: backend อัปเดตผ่าน [[state:]] delta ทุกเทิร์น */}
        {renderLiveStateLines(session.liveState).length > 0 && (
          <Card className="p-4 sm:p-5 flex flex-col gap-2 mb-3">
            <div className="font-bold text-ink">📍 สถานะติดตามอัตโนมัติ (live)</div>
            <p className="text-[12.5px] text-muted">ระบบติดตามให้อัตโนมัติทุกเทิร์น (ไม่เรียก AI เพิ่ม) — แสดงอย่างเดียว ใช้ตรวจว่าสถานะปัจจุบันตรงกับเรื่องไหม</p>
            <ul className="flex flex-col gap-1">
              {renderLiveStateLines(session.liveState).map((line, i) => (
                <li key={i} className="text-[13px] text-ink/85 leading-snug">{line}</li>
              ))}
            </ul>
          </Card>
        )}
        {/* ซิงค์การ์ด — ดึงโปรไฟล์ตัวละครล่าสุดเข้าแชทนี้ (เช่นหลังเปิด 🔒 บังคับถาวร / แก้บุคลิก-อำนาจที่หน้าตัวละคร) */}
        <Card className="p-4 sm:p-5 flex flex-col gap-2.5 mb-3">
          <div className="font-bold text-ink">🔄 ซิงค์การ์ดตัวละคร</div>
          <p className="text-[12.5px] text-muted">แชทนี้ใช้ "สำเนา" ข้อมูลตัวละคร ณ ตอนเริ่มแชท — ถ้าแก้การ์ดที่หน้าตัวละคร (เปิด 🔒 บังคับถาวร, แก้บุคลิก/อำนาจ/รูปลักษณ์ ฯลฯ) แล้วอยากให้แชทนี้ได้ค่าล่าสุด<b>โดยไม่ต้องเปิดแชทใหม่</b> กดปุ่มนี้ (สรุป/ความจำ/ความสัมพันธ์ของแชทไม่ถูกแตะ)</p>
          {tmpl ? (
            <Btn variant="primary" color="grape" className="self-start" onClick={syncCard}>🔄 ดึงการ์ดล่าสุดเข้าแชทนี้</Btn>
          ) : (
            <div className="text-[12.5px] text-muted">— ตัวละครต้นฉบับถูกลบไปแล้ว ซิงค์ไม่ได้</div>
          )}
        </Card>
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
