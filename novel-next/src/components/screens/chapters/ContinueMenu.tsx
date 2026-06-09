'use client';
import { Modal, Spinner } from '@/components/ui';
import { pal } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

export type ContinueKind = 'continue' | 'scene' | 'r18';

interface ContinueMenuProps {
  open: boolean;
  onClose: () => void;
  onPick: (kind: ContinueKind) => void;
  busy: boolean;
}

/** เมนูเลือกวิธีเขียนต่อบท — ปุ่มใหญ่ กดง่ายบนมือถือ */
export function ContinueMenu({ open, onClose, onPick, busy }: ContinueMenuProps) {
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
