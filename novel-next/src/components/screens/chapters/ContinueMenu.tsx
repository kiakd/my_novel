'use client';
import { Modal, Spinner } from '@/components/ui';
import { pal } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import type { GenProvider } from './ChaptersScreen';

export type ContinueKind = 'continue' | 'scene' | 'r18';

interface ContinueMenuProps {
  open: boolean;
  onClose: () => void;
  onPick: (kind: ContinueKind) => void;
  busy: boolean;
  provider: GenProvider;
  onProvider: (p: GenProvider) => void;
  concise: boolean;
  onConcise: (v: boolean) => void;
}

const PROVIDERS: { id: GenProvider; label: string; sub: string }[] = [
  { id: 'deepseek', label: '☁️ DeepSeek', sub: 'คลาวด์ เร็ว คุณภาพสูง' },
  { id: 'lmstudio', label: '💻 Gemma local', sub: 'ในเครื่อง ฟรี/ส่วนตัว (LM Studio)' },
];

/** เมนูเลือกวิธีเขียนต่อบท — ปุ่มใหญ่ กดง่ายบนมือถือ */
export function ContinueMenu({ open, onClose, onPick, busy, provider, onProvider, concise, onConcise }: ContinueMenuProps) {
  const { t } = useI18n();
  const opts: { kind: ContinueKind; emoji: string; color: string; title: string; sub: string }[] = [
    { kind: 'continue', emoji: '📖', color: 'sky', title: t('chapters.continue.perChapter'), sub: t('chapters.continue.perChapterSub') },
    { kind: 'scene', emoji: '🎬', color: 'lilac', title: t('chapters.continue.changeScene'), sub: t('chapters.continue.changeSceneSub') },
    { kind: 'r18', emoji: '🔞', color: 'coral', title: t('chapters.continue.r18'), sub: t('chapters.continue.r18Sub') },
  ];

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">▶ {t('chapters.continue.title')}</h2>
            <p className="text-[13px] text-muted mt-0.5">{t('chapters.continue.sub')}</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-xl text-muted hover:bg-ink/[.06] transition shrink-0">✕</button>
        </div>

        {/* เลือกโมเดลที่ใช้เจน — สลับ DeepSeek ↔ Gemma local */}
        <div className="flex gap-1.5 rounded-2xl bg-ink/[.04] p-1">
          {PROVIDERS.map((p) => {
            const on = provider === p.id;
            return (
              <button
                key={p.id}
                disabled={busy}
                onClick={() => onProvider(p.id)}
                className={`flex-1 rounded-xl px-3 py-2 text-left transition disabled:opacity-50 ${on ? 'bg-white shadow-pop' : 'hover:bg-white/50'}`}
              >
                <span className={`block text-[13px] font-bold ${on ? 'text-ink' : 'text-muted'}`}>{p.label}</span>
                <span className="block text-[11px] text-muted leading-tight mt-0.5">{p.sub}</span>
              </button>
            );
          })}
        </div>

        {/* โหมดกระชับ — ลดพรรณนา เน้นบทสนทนา/การกระทำ (global pref ใช้ร่วมกับแชท) */}
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input type="checkbox" checked={concise} disabled={busy} onChange={(e) => onConcise(e.target.checked)} className="accent-grape mt-0.5" />
          <span className="flex flex-col">
            <span className="text-[13px] font-bold text-ink">✂️ โหมดกระชับ (ลดพรรณนา เน้นบทสนทนา)</span>
            <span className="text-[11.5px] text-muted leading-snug">เขียนพรรณนาฟุ่มเฟือยน้อยลง เน้นบทพูด+การกระทำ (มีผลกับทุกแชทและการเขียนนิยาย)</span>
          </span>
        </label>

        <div className="flex flex-col gap-2.5">
          {opts.map((o) => {
            const P = pal(o.color);
            return (
              <button
                key={o.kind}
                disabled={busy}
                onClick={() => onPick(o.kind)}
                className="flex items-center gap-3.5 rounded-2xl border-2 p-3.5 text-left transition active:scale-[.98] disabled:opacity-50 hover:brightness-[.98]"
                style={{ borderColor: P.tint, background: P.soft }}
              >
                <span className="text-2xl shrink-0 leading-none">{o.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-bold text-[15px] text-ink">{o.title}</span>
                  <span className="block text-[12.5px] text-muted leading-snug mt-0.5">{o.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {busy && (
          <div className="flex items-center justify-center gap-2 text-muted text-[13px] font-bold py-1">
            <Spinner size={15} /> {t('chapters.continue.working')}
          </div>
        )}
      </div>
    </Modal>
  );
}
