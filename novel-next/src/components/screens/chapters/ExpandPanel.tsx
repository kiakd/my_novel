'use client';
import { useEffect, useState } from 'react';
import { Drawer, Btn, Spinner, toast } from '@/components/ui';
import { pal, cx } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import { expand, type ExpandMode } from '@/lib/api';
import { ImageDrop } from './ImageDrop';

interface ExpandPanelProps {
  open: boolean;
  onClose: () => void;
  initialDraft: string;          // ข้อความที่ผู้ใช้เลือกในตอนเปิด (ถ้ามี)
  onInsert: (text: string) => void;
}

const MODES: ExpandMode[] = ['scene', 'action', 'polish'];

/** แผงขยายงานเขียน: ข้อความ + แนบรูป(WD14) + เลือกโหมด → AI ขยาย → แทรก/คัดลอก */
export function ExpandPanel({ open, onClose, initialDraft, onInsert }: ExpandPanelProps) {
  const { t } = useI18n();
  const { story } = useStory();
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<ExpandMode>('scene');
  const [tags, setTags] = useState<string[]>([]);
  const [buckets, setBuckets] = useState<Record<string, string[]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');

  // sync ข้อความที่เลือกทุกครั้งที่เปิด
  useEffect(() => { if (open) { setDraft(initialDraft); setResult(''); } }, [open, initialDraft]);

  // สไตล์/ข้อห้ามของเรื่อง → ส่งเป็น context ให้ AI
  const styleContext = [
    story?.styleGuide && `Style: ${story.styleGuide}`,
    story?.vocabPalette && `Vocab: ${story.vocabPalette}`,
    story?.dontList && `Don't: ${story.dontList}`,
  ].filter(Boolean).join('\n');

  const run = async () => {
    if (!draft.trim()) { toast(t('chapters.expand.needDraft'), '⚠️'); return; }
    setBusy(true);
    setResult('');
    try {
      const r = await expand({ draft, mode, tags: tags.length ? tags : undefined, buckets: buckets ?? undefined, style: styleContext || undefined });
      if (r.ok && r.text) setResult(r.text);
      else toast(r.error ?? t('common.offline'), '⚠️');
    } catch (e) {
      toast((e as Error).message || t('common.offline'), '⚠️');
    } finally {
      setBusy(false);
    }
  };

  const doInsert = () => { onInsert(result); toast(t('chapters.expand.inserted'), '✨'); onClose(); };
  const doCopy = () => { void navigator.clipboard?.writeText(result); toast(t('common.copied'), '📋'); };

  // tag เด่นที่จะโชว์ (หมวดท่า/แอ็กชัน/ชุด)
  const previewTags = buckets
    ? Object.values(buckets).flat().slice(0, 14)
    : tags.slice(0, 14);

  const sky = pal('sky');
  return (
    <Drawer open={open} onClose={onClose} width={480}>
      <div className="p-5 flex flex-col gap-4 min-h-full">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-ink">✨ {t('chapters.expand.title')}</h2>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-xl text-muted hover:bg-ink/[.06] transition">✕</button>
        </div>
        <p className="text-[13px] text-muted -mt-2">{t('chapters.expand.sub')}</p>

        {/* ข้อความที่จะขยาย */}
        <div>
          <label className="text-[11px] font-extrabold tracking-wider uppercase text-muted">{t('chapters.expand.draft')}</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('chapters.expand.draftPlaceholder')}
            rows={4}
            className="mt-1.5 w-full rounded-2xl border-2 border-line bg-white px-3.5 py-2.5 text-[15px] text-ink/90 leading-relaxed focus:outline-none focus:border-sky/40 resize-y"
          />
        </div>

        {/* แนบรูป */}
        <div>
          <label className="text-[11px] font-extrabold tracking-wider uppercase text-muted">{t('chapters.expand.reference')}</label>
          <div className="mt-1.5">
            <ImageDrop
              onTags={(tg, bk) => { setTags(tg); setBuckets(bk); if (tg.length) toast(t('chapters.expand.detected', { n: tg.length }), '🏷️'); }}
              labels={{ attach: t('chapters.expand.attachImage'), analyzing: t('chapters.expand.analyzing'), change: t('chapters.expand.changeImage'), failed: t('chapters.expand.tagFailed') }}
            />
          </div>
          {previewTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {previewTags.map((tg) => (
                <span key={tg} className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: pal('lilac').soft, color: pal('lilac').c }}>{tg}</span>
              ))}
            </div>
          )}
        </div>

        {/* โหมด */}
        <div>
          <label className="text-[11px] font-extrabold tracking-wider uppercase text-muted">{t('chapters.expand.mode')}</label>
          <div className="flex gap-2 mt-1.5">
            {MODES.map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cx('flex-1 rounded-xl py-2 text-[13px] font-bold transition active:scale-95')}
                style={mode === m ? { background: sky.c, color: '#fff' } : { background: sky.soft, color: '#3a6ea5' }}
              >
                {t(`chapters.expand.mode_${m}`)}
              </button>
            ))}
          </div>
        </div>

        <Btn variant="primary" color="sky" className="w-full" disabled={busy || !draft.trim()} onClick={run}>
          {busy ? <Spinner size={15} color="#fff" /> : '✦'} {t('chapters.expand.run')}
        </Btn>

        {/* ผลลัพธ์ */}
        {result && (
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-extrabold tracking-wider uppercase text-muted">{t('chapters.expand.result')}</label>
            <div className="rounded-2xl border-2 border-line bg-white px-3.5 py-3 text-[15px] text-ink/90 leading-[1.8] whitespace-pre-wrap max-h-[40vh] overflow-auto">
              {result}
            </div>
            <div className="flex gap-2">
              <Btn variant="primary" color="mint" className="flex-1" onClick={doInsert}>↘ {t('chapters.expand.insert')}</Btn>
              <Btn variant="soft" color="slate" onClick={doCopy}>📋 {t('chapters.expand.copy')}</Btn>
              <Btn variant="soft" color="sky" onClick={run} disabled={busy}>↻ {t('chapters.expand.regen')}</Btn>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
