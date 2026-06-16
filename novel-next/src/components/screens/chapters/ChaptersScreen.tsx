'use client';
import { useEffect, useRef, useState } from 'react';
import { SectionTitle, Card, Tag, Btn, EmptyState, Modal, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';
import { useStory } from '@/lib/store/StoryProvider';
import { SaveIndicator } from '@/components/layout/SaveIndicator';
import type { ChapterStatus } from '@/lib/types';
import { textToHtml } from '@/lib/chapter';
import { ChapterRow } from './ChapterRow';
import { ChapterEditor, type ChapterEditorHandle } from './ChapterEditor';
import { AIBar } from './AIBar';
import { ExpandPanel } from './ExpandPanel';
import { ContinueMenu, type ContinueKind } from './ContinueMenu';
import { generate, generateRoleplay, memBackfillNovel, memIngestNovel, memRecallNovel } from '@/lib/api';
import { buildNovelContext, cleanRoleplayArtifacts } from '@/lib/novel-context';

const LS_LIST_OPEN = 'ns_chapterlist_open';
const LS_PROVIDER = 'ns_gen_provider';

/** provider ที่ใช้เจน prose — สลับ DeepSeek (cloud) ↔ Gemma local (LM Studio) */
export type GenProvider = 'deepseek' | 'lmstudio';

const STATUS_COLOR: Record<ChapterStatus, string> = { done: 'mint', draft: 'sun', empty: 'slate' };

/** ตัด tag HTML → ข้อความล้วน (content เก็บเป็น HTML) */
const htmlToText = (html?: string): string => {
  if (!html) return '';
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, ' ');
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent ?? '';
};
const charCount = (html?: string) => htmlToText(html).replace(/\s+/g, '').length;

/** แตกเนื้อบท (HTML) เป็น "ย่อหน้า" — หน่วยความจำของ RAG ฝั่งนิยาย (ตัดย่อหน้าว่างทิ้ง)
 *  content เก็บเป็น HTML <p> ต่อกัน — textContent ไม่มี \n คั่น จึงพาร์ส <p> ตรง ๆ (fallback แตกบรรทัด) */
const htmlToParagraphs = (html?: string): string[] => {
  if (!html) return [];
  if (typeof document === 'undefined') {
    return html.replace(/<[^>]+>/g, '\n').split(/\n+/).map((p) => p.trim()).filter(Boolean);
  }
  const d = document.createElement('div');
  d.innerHTML = html;
  const ps = d.querySelectorAll('p');
  const parts = ps.length
    ? Array.from(ps).map((p) => p.textContent ?? '')
    : (d.textContent ?? '').split(/\n+/);
  return parts.map((p) => p.trim()).filter(Boolean);
};
const statusOf = (content?: string, stored?: ChapterStatus): ChapterStatus =>
  !htmlToText(content).trim() ? 'empty' : stored && stored !== 'empty' ? stored : 'draft';

/** หน้าบทนิยาย — ผูกกับ story.chapters */
export function ChaptersScreen() {
  const { t } = useI18n();
  const { story, status, mutateStory, saveNow, activeStoryId } = useStory();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editorRef = useRef<ChapterEditorHandle>(null);
  const [expandOpen, setExpandOpen] = useState(false);
  const [expandDraft, setExpandDraft] = useState('');
  const [contOpen, setContOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [provider, setProviderState] = useState<GenProvider>('deepseek');
  // รีวิว: ผลวิจารณ์บท → โชว์ใน modal (null = ปิด)
  const [review, setReview] = useState<string | null>(null);
  // RAG: backfill ความจำของเรื่องครั้งแรกที่เปิด/โหลด (idempotent ฝั่ง server) — key ด้วย story.id
  const backfilledRef = useRef<Set<string>>(new Set());

  useEffect(() => { if (localStorage.getItem(LS_LIST_OPEN) === '0') setListOpen(false); }, []);
  useEffect(() => { const p = localStorage.getItem(LS_PROVIDER); if (p === 'lmstudio' || p === 'deepseek') setProviderState(p); }, []);
  const setProvider = (p: GenProvider) => { setProviderState(p); try { localStorage.setItem(LS_PROVIDER, p); } catch { /* ignore */ } };
  const toggleList = () => setListOpen((v) => {
    const n = !v;
    try { localStorage.setItem(LS_LIST_OPEN, n ? '1' : '0'); } catch { /* ignore */ }
    return n;
  });
  const openExpand = () => { setExpandDraft(editorRef.current?.getSelectedText() ?? ''); setExpandOpen(true); };
  const insertExpanded = (text: string) => { editorRef.current?.insertHtmlAtEnd(textToHtml(text)); };

  const chapters = [...(story?.chapters ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const active = chapters.find((c) => c.id === activeId) ?? chapters[0] ?? null;
  const activeStatus = active ? statusOf(active.content, active.status) : 'empty';

  // turnIdx ของย่อหน้า = ดัชนีไล่ทั้งเรื่อง (บทตามลำดับ × ย่อหน้า) → คืน [start, paras] ของบท index ที่ระบุ
  const paraOffsetOf = (chIdx: number): number => {
    let off = 0;
    for (let i = 0; i < chIdx; i++) off += htmlToParagraphs(chapters[i]?.content).length;
    return off;
  };

  // RAG backfill: แตกทุกบทเป็นย่อหน้า → ส่งเข้า memory ครั้งแรกที่เปิดเรื่อง (idempotent ฝั่ง server)
  // scopeId = activeStoryId (Story ไม่มี field id — id คือ key ใน state.stories)
  useEffect(() => {
    const sid = activeStoryId;
    if (!sid || !story || backfilledRef.current.has(sid)) return;
    let off = 0;
    const rows = chapters.flatMap((c) => {
      const paras = htmlToParagraphs(c.content);
      const r = paras.map((text, j) => ({
        id: `${sid}:${off + j}`, scopeId: sid, charId: null, secret: false,
        speaker: 'narrator', turnIdx: off + j, ts: off + j, text,
      }));
      off += paras.length;
      return r;
    });
    if (!rows.length) return;        // ยังไม่มีเนื้อ/ยังไม่โหลด: อย่าเผา ref
    backfilledRef.current.add(sid);
    memBackfillNovel(sid, rows).catch(() => {});
  }, [activeStoryId, story, chapters]);
  const chars = charCount(active?.content);

  const patchActive = (patch: Partial<{ title: string; content: string; status: ChapterStatus; summary: string }>) => {
    if (!active) return;
    mutateStory((s) => ({ ...s, chapters: (s.chapters ?? []).map((c) => (c.id === active.id ? { ...c, ...patch } : c)) }));
  };
  const patchChapter = (id: string, patch: Partial<{ summary: string }>) =>
    mutateStory((s) => ({ ...s, chapters: (s.chapters ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const setBody = (v: string) => patchActive({ content: v, status: statusOf(v, active?.status) });

  // ---- สรุปบท = ความจำข้ามบท (กลไกเดียวกับ rolling summary ของแชท — หน่วยพับคือ "บท") ----
  const CH_SUMMARY_SYSTEM =
    'คุณคือผู้ช่วยสรุปบทนิยายเป็น "ความจำข้ามบท" สำหรับให้ AI เขียนบทถัดไปต่อได้ไม่หลุด. ' +
    'เก็บข้อเท็จจริงสำคัญให้ครบ: เหตุการณ์/พล็อตสำคัญ, พัฒนาการความสัมพันธ์, สิ่งที่ได้มา/เสียไป/ตกลงสัญญา, การย้ายสถานที่. ' +
    'ห้ามเดา/แต่งเติมสิ่งที่ไม่อยู่ในเนื้อบทเด็ดขาด (โดยเฉพาะเพศ/รูปลักษณ์ของร่างปลอมตัว — ห้ามอนุมานจากชื่อ). ' +
    'เขียนไทยมุมบุคคลที่สาม ~100-150 คำ ปิดท้ายบรรทัด "สถานะปลายบท:" ระบุชัด ใครอยู่ที่ไหน ใส่ชุดอะไร ความสัมพันธ์/เป้าหมายล่าสุด.';
  const summarizeChapter = async (ch: { title?: string; content?: string }): Promise<string | null> => {
    const text = htmlToText(ch.content).trim();
    if (!text) return null;
    const clipped = text.length > 12000 ? `${text.slice(0, 3000)}\n…\n${text.slice(-9000)}` : text;
    const r = await generate({ system: CH_SUMMARY_SYSTEM, user: `[บท: ${ch.title || '-'}]\n${clipped}`, provider, temperature: 0.3, max_tokens: 500 });
    return r.ok && r.text?.trim() ? r.text.trim() : null;
  };
  const runSummarize = async () => {
    if (!active) return;
    if (!htmlToText(active.content).trim()) { toast(t('chapters.sumEmpty'), '⚠️'); return; }
    setBusy(true);
    toast(t('chapters.sumWorking'), '📝');
    try {
      const s = await summarizeChapter(active);
      if (s) { patchActive({ summary: s }); toast(t('chapters.sumDone'), '🧠'); }
      else toast(t('common.offline'), '⚠️');
    } finally { setBusy(false); }
  };

  // ---- รีวิวบท (วิจารณ์เชิงสร้างสรรค์ผ่าน /api/generate) — แทน stub เดิม ----
  const REVIEW_SYSTEM =
    'คุณคือบรรณาธิการนิยายไทยมือฉมัง วิจารณ์ "บทนี้" อย่างตรงไปตรงมาแต่สร้างสรรค์ เพื่อช่วยนักเขียนปรับให้ดีขึ้น. ' +
    'ดูทั้ง: จังหวะ/การดำเนินเรื่อง, ความสม่ำเสมอของคาแรกเตอร์และโทน, จุดที่เยิ่นเย้อ/ซ้ำ/ขัดความต่อเนื่อง, บทสนทนา, การเปิด-ปิดฉาก. ' +
    'ตอบเป็นภาษาไทย กระชับ เป็นหัวข้อ bullet: "✅ จุดเด่น" 2-3 ข้อ, "🔧 ควรปรับ" 3-5 ข้อ (ชี้จุดให้ชัดพร้อมวิธีแก้), "➡️ ทิศทางบทต่อไป" 1-2 ข้อ. ห้ามเขียนเนื้อเรื่องใหม่ให้.';
  const runReview = async () => {
    if (!active) return;
    const text = htmlToText(active.content).trim();
    if (!text) { toast(t('chapters.sumEmpty'), '⚠️'); return; }
    const clipped = text.length > 12000 ? `${text.slice(0, 3000)}\n…\n${text.slice(-9000)}` : text;
    setBusy(true);
    toast(t('chapters.aiReview') + '…', '🔍');
    try {
      const r = await generate({ system: REVIEW_SYSTEM, user: `[บท: ${active.title || '-'}]\n${clipped}`, provider, temperature: 0.5, max_tokens: 800 });
      if (r.ok && r.text?.trim()) setReview(r.text.trim());
      else toast(r.error ?? t('common.offline'), '⚠️');
    } catch (e) {
      toast((e as Error).message || t('common.offline'), '⚠️');
    } finally { setBusy(false); }
  };

  const act = (id: string) => {
    if (id === 'summary') { void runSummarize(); return; }
    if (id === 'review') { void runReview(); return; }
  };

  // เขียนต่อบทจริง: ประกอบ context จาก story + ท้ายเนื้อบท → ยิง DeepSeek → แทรกผลต่อท้าย
  const runContinue = async (kind: ContinueKind) => {
    if (!active || !story) return;
    const mode = kind === 'r18' ? 'r18' : 'novel';
    const idx = chapters.indexOf(active);
    const chapterNum = idx + 1;
    const INSTR: Record<ContinueKind, string> = {
      continue: 'เขียนต่อจากเนื้อเรื่องด้านล่างอย่างต่อเนื่องลื่นไหล ไม่ทวนซ้ำของเดิม คงโทนและคาแรกเตอร์เดิม',
      scene: 'ข้ามฉากปัจจุบันไป เริ่มฉากใหม่หรือช่วงเวลาใหม่ที่ต่อเนื่องสมเหตุผลจากเรื่องเดิม เปิดฉากใหม่ให้น่าสนใจ',
      r18: 'เขียนต่อจากเนื้อเรื่องด้านล่าง เข้าสู่ฉากเลิฟซีนผู้ใหญ่แบบเต็มอารมณ์ (เต็มใจทั้งสองฝ่ายตาม lore lock)',
    };
    // อ่าน "ทั้งบท" ไม่ใช่แค่ท้าย — กันหลงทาง/ชุดหลุด. ถ้ายาวเกิน cap เก็บหัวบท (setup ชุด/ฉาก) + ท้ายบท (จุดต่อ)
    // local (Gemma 8K ctx) ต้อง cap เล็กกว่า cloud มาก ไม่งั้น context ล้น
    const isLocal = provider === 'lmstudio';
    const CTX_CAP = isLocal ? 4500 : 14000;
    const clip = (s: string) =>
      s.length <= CTX_CAP ? s : `${s.slice(0, 2000)}\n…\n${s.slice(-(CTX_CAP - 2000))}`;
    const full = htmlToText(active.content).trim();
    const intent = active.summary?.trim() ? ` [บทนี้ตั้งใจเล่า: ${active.summary.trim()}]` : '';

    // anchor ต่อเนื้อจริง: เอา "ย่อหน้าสุดท้าย" ของบทเป็น prefill (assistant prefix) → บังคับโมเดล
    // เขียนต่อจากคำของผู้ใช้เป๊ะ ๆ ไม่เอาไปเล่าใหม่/ตีความใหม่. scene = ข้ามไปฉากใหม่ จึงไม่ต้อง anchor
    const lastParagraph = (html?: string): string => {
      if (!html || typeof document === 'undefined') return '';
      const d = document.createElement('div');
      d.innerHTML = html;
      const ps = d.querySelectorAll('p');
      const txt = (ps.length ? ps[ps.length - 1].textContent : d.textContent) ?? '';
      const s = txt.trim();
      return s.length > 500 ? s.slice(-500) : s; // cap กันยาวเกิน (เป็น suffix ของบทอยู่แล้ว)
    };
    const prefill = kind !== 'scene' && full ? lastParagraph(active.content) : '';

    let eventCurrent: string;
    if (full) {
      eventCurrent =
        `${INSTR[kind]}${intent}\n\n` +
        `[เนื้อหาบทนี้ทั้งหมด — อ่านให้เข้าใจว่าเกิดอะไรไปแล้ว ใครอยู่ที่ไหน ใส่/ถอด/ชุดเสียหายอย่างไร ก่อนเขียนต่อ ห้ามทวนซ้ำ]\n${clip(full)}`;
    } else {
      // บทนี้ยังว่าง → ดูบทก่อนหน้าว่าจบยังไง แล้วต่อยอด (คงชุด/สถานะ/สถานที่ล่าสุด)
      const prev = chapters[idx - 1];
      const prevText = prev ? htmlToText(prev.content).trim() : '';
      const prevAnchor = prevText
        ? `\n\n[บทก่อน "${prev?.title || ''}" จบไว้แบบนี้ — ต่อยอดให้สมเหตุผล คงชุด/สถานะ/สถานที่ล่าสุด ไม่รีเซ็ต]\n${clip(prevText)}`
        : '';
      eventCurrent = `${INSTR[kind]}${intent} (เปิดบท "${active.title || ''}")${prevAnchor}`;
    }
    setBusy(true);
    toast(t('chapters.continue.working'), '✦');
    try {
      // auto-fold แบบเดียวกับแชท: บทก่อนหน้าที่มีเนื้อแต่ยังไม่มีสรุป → สรุปเก็บเป็นความจำก่อน (กัน context ข้ามบทหลุด)
      let st = story;
      const pending = chapters.slice(0, idx).filter((c) => !c.summary?.trim() && htmlToText(c.content).trim());
      for (const c of pending) {
        toast(t('chapters.sumFolding', { title: c.title || '…' }), '🧠');
        const s = await summarizeChapter(c);
        if (s) {
          patchChapter(c.id, { summary: s });
          st = { ...st, chapters: (st.chapters ?? []).map((x) => (x.id === c.id ? { ...x, summary: s } : x)) };
        }
      }
      // RAG recall: ดึงความจำระยะยาว (ย่อหน้าบทก่อน ๆ ที่เกี่ยวข้อง) มาเสริม context ก่อนเจน
      // query = บันทึกความจำข้ามบท (intent) + ย่อหน้าสุดท้ายของบทปัจจุบัน · กันดึงย่อหน้าของบทปัจจุบันเองมาซ้ำด้วย excludeFromIdx
      let recalled: string[] | undefined;
      const sid = activeStoryId;
      if (sid) {
        const query = [active.summary?.trim(), lastParagraph(active.content)].filter(Boolean).join('\n').trim();
        if (query) {
          try {
            const rc = await memRecallNovel({
              scopeId: sid, query,
              activeChar: st.characters?.find((c) => /พระเอก|ตัวเอก|protagonist|นางเอก|heroine/i.test(c.role ?? ''))?.name
                ?? st.characters?.[0]?.name ?? 'ผู้เล่าเรื่อง',
              mode: 'narrator', excludeFromIdx: paraOffsetOf(idx), k: 4,
            });
            recalled = rc.memories.length ? rc.memories : undefined;
          } catch { /* degrade: ไม่มี recall ก็เจนปกติ */ }
        }
      }
      const ctx = buildNovelContext(st, { mode, eventCurrent, chapterNum, provider, recalled });
      // local ช้า + ctx เล็ก → ขอ output สั้นลง
      const maxTokens = isLocal ? (mode === 'r18' ? 1500 : 1200) : (mode === 'r18' ? 2600 : 2200);
      const r = await generateRoleplay({ context: ctx, user_input: `เขียนต่อบท "${active.title || ''}"`, provider, max_tokens: maxTokens, prefill: prefill || undefined });
      if (r.ok && r.text) {
        // backend คืน prefill+completion (prepend ย่อหน้าเดิมกลับมา) → ตัด prefill ออก ไม่งั้นย่อหน้าสุดท้ายจะซ้ำ
        let out = r.text;
        if (prefill && out.startsWith(prefill)) out = out.slice(prefill.length);
        const cleaned = cleanRoleplayArtifacts(out);
        editorRef.current?.insertHtmlAtEnd(textToHtml(cleaned));
        // force-save ทันทีหลังแทรกข้อความที่เพิ่งเจน — ลด conflict window กันงานหายบนมือถือ (debounce 900ms)
        saveNow();
        // RAG ingest: index ย่อหน้าใหม่ที่เพิ่งเจน · turnIdx ต่อจากย่อหน้าเดิมของบทปัจจุบัน (ไล่ทั้งเรื่อง)
        if (sid) {
          const baseIdx = paraOffsetOf(idx) + htmlToParagraphs(active.content).length;
          const newParas = htmlToParagraphs(textToHtml(cleaned));
          const now = Date.now();
          const rows = newParas.map((text, j) => ({
            id: `${sid}:${baseIdx + j}`, scopeId: sid, charId: null, secret: false,
            speaker: 'narrator', turnIdx: baseIdx + j, ts: now + j, text,
          }));
          if (rows.length) memIngestNovel(sid, rows).catch(() => {});
        }
        toast(t('chapters.continue.done'), '✨');
        setContOpen(false);
      } else {
        toast(r.error ?? t('common.offline'), '⚠️');
      }
    } catch (e) {
      toast((e as Error).message || t('common.offline'), '⚠️');
    } finally {
      setBusy(false);
    }
  };
  const addChapter = () => {
    const id = 'c' + Date.now();
    mutateStory((s) => ({ ...s, chapters: [...(s.chapters ?? []), { id, title: '', order: (s.chapters ?? []).length, content: '', status: 'empty' }] }));
    setActiveId(id);
    toast(t('toast.chapterAdded'), '📖');
  };

  return (
    <div className="max-w-6xl mx-auto pb-24">
      <SectionTitle emoji="📖" color="sky" title={t('chapters.title')} sub={t('chapters.sub')} />
      <div className="flex flex-col md:flex-row gap-5 items-start">
        {listOpen && (
          <Card className="p-3 w-full md:w-[260px] md:shrink-0">
            <Btn variant="primary" color="sky" className="mb-2 w-full" onClick={addChapter}>＋ {t('chapters.newChapter')}</Btn>
            <div className="flex flex-col gap-1 max-md:max-h-[280px] overflow-auto -mr-1 pr-1">
              {chapters.map((c, i) => (
                <ChapterRow key={c.id} title={c.title ?? ''} chars={charCount(c.content)} idx={i} active={c.id === active?.id} onClick={() => setActiveId(c.id)} />
              ))}
            </div>
          </Card>
        )}

        {active ? (
          <Card className="relative flex flex-col min-h-[560px] w-full md:flex-1">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <div className="flex items-center gap-2.5">
                <button onClick={toggleList} title={t('chapters.toggleList')} className="h-8 w-8 grid place-items-center rounded-xl text-muted hover:bg-ink/[.06] transition shrink-0 text-base">
                  {listOpen ? '‹' : '☰'}
                </button>
                <Tag color={STATUS_COLOR[activeStatus]}>{t(`chapters.status.${activeStatus}`)}</Tag>
                <span className="font-bold text-muted text-sm">{t('chapters.chapterN', { n: chapters.indexOf(active) + 1 })}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-extrabold text-sm" style={{ color: pal('sky').c }}>{t('chapters.chars', { n: chars.toLocaleString() })}</span>
                <SaveIndicator status={status} variant="inline" />
              </div>
            </div>
            <div className="flex-1 px-8 py-6">
              <input value={active.title ?? ''} onChange={(e) => patchActive({ title: e.target.value })}
                className="font-display text-3xl font-semibold text-ink bg-transparent w-full focus:outline-none mb-5 placeholder:text-muted/50" placeholder={t('chapters.untitled')} />
              <ChapterEditor ref={editorRef} chapterId={active.id} html={active.content ?? ''} placeholder={t('chapters.beginPlaceholder')} onChange={setBody} />
              {/* ความจำข้ามบท — ป้อนให้ AI ตอนเขียนบทถัด ๆ ไป (สร้างอัตโนมัติตอน "เขียนต่อ" หรือกด 📝 สรุป) แก้มือได้ */}
              <div className="mt-5 pt-3 border-t border-line/60">
                <div className="text-[12px] font-bold text-muted mb-1.5">🧠 {t('chapters.sumLabel')}</div>
                <textarea value={active.summary ?? ''} onChange={(e) => patchActive({ summary: e.target.value })} rows={3}
                  placeholder={t('chapters.sumPlaceholder')}
                  className="w-full bg-cream/60 rounded-xl px-3 py-2 text-[13px] text-ink border border-line focus:border-sky focus:bg-white focus:outline-none transition resize-y leading-relaxed" />
              </div>
            </div>
          </Card>
        ) : (
          <Card className="flex-1 w-full min-h-[560px] grid place-items-center">
            <EmptyState emoji="📖" color="sky" title={t('chapters.emptyTitle')} sub={t('chapters.sub')}
              action={<Btn variant="primary" color="sky" onClick={addChapter}>＋ {t('chapters.newChapter')}</Btn>} />
          </Card>
        )}
      </div>
      {active && <AIBar onAct={act} onExpand={openExpand} onContinue={() => setContOpen(true)} busy={busy} />}
      <ExpandPanel open={expandOpen} onClose={() => setExpandOpen(false)} initialDraft={expandDraft} chapterNum={active ? chapters.indexOf(active) + 1 : 1} onInsert={insertExpanded} />
      <ContinueMenu open={contOpen} onClose={() => setContOpen(false)} onPick={runContinue} busy={busy} provider={provider} onProvider={setProvider} />
      <Modal open={review != null} onClose={() => setReview(null)} size="md">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-3 font-display text-xl font-semibold text-ink">🔍 {t('chapters.aiReview')}</div>
          <div className="text-[14px] text-ink whitespace-pre-wrap leading-relaxed">{review}</div>
          <div className="mt-5 flex justify-end">
            <Btn variant="primary" color="sky" size="sm" onClick={() => setReview(null)}>{t('common.close')}</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
