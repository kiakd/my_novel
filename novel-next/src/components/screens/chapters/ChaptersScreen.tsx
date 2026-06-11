'use client';
import { useEffect, useRef, useState } from 'react';
import { SectionTitle, Card, Tag, Btn, EmptyState, toast } from '@/components/ui';
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
import { generate, generateRoleplay } from '@/lib/api';
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
const statusOf = (content?: string, stored?: ChapterStatus): ChapterStatus =>
  !htmlToText(content).trim() ? 'empty' : stored && stored !== 'empty' ? stored : 'draft';

/** หน้าบทนิยาย — ผูกกับ story.chapters */
export function ChaptersScreen() {
  const { t } = useI18n();
  const { story, status, mutateStory } = useStory();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editorRef = useRef<ChapterEditorHandle>(null);
  const [expandOpen, setExpandOpen] = useState(false);
  const [expandDraft, setExpandDraft] = useState('');
  const [contOpen, setContOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [provider, setProviderState] = useState<GenProvider>('deepseek');

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
  const chars = charCount(active?.content);

  const patchActive = (patch: Partial<{ title: string; content: string; status: ChapterStatus; summary: string }>) => {
    if (!active) return;
    mutateStory((s) => ({ ...s, chapters: s.chapters.map((c) => (c.id === active.id ? { ...c, ...patch } : c)) }));
  };
  const patchChapter = (id: string, patch: Partial<{ summary: string }>) =>
    mutateStory((s) => ({ ...s, chapters: s.chapters.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
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

  const act = (id: string, lbl: string) => {
    if (id === 'summary') { void runSummarize(); return; }
    // review ยังเป็น stub
    setBusy(true);
    toast(lbl.replace(/^[^ ]+ /, '') + '…', '✦');
    setTimeout(() => { setBusy(false); toast(t('common.done'), '✅'); }, 1300);
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
          st = { ...st, chapters: st.chapters.map((x) => (x.id === c.id ? { ...x, summary: s } : x)) };
        }
      }
      const ctx = buildNovelContext(st, { mode, eventCurrent, chapterNum });
      // local ช้า + ctx เล็ก → ขอ output สั้นลง
      const maxTokens = isLocal ? (mode === 'r18' ? 1500 : 1200) : (mode === 'r18' ? 2600 : 2200);
      const r = await generateRoleplay({ context: ctx, user_input: `เขียนต่อบท "${active.title || ''}"`, provider, max_tokens: maxTokens });
      if (r.ok && r.text) {
        editorRef.current?.insertHtmlAtEnd(textToHtml(cleanRoleplayArtifacts(r.text)));
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
    mutateStory((s) => ({ ...s, chapters: [...s.chapters, { id, title: '', order: s.chapters.length, content: '', status: 'empty' }] }));
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
    </div>
  );
}
