'use client';
import { useEffect, useState } from 'react';
import { Card, Drawer, IconBtn, Tag, Spinner, EmptyState } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal, cx } from '@/lib/theme';
import { getAiLogs } from '@/lib/api';
import type { AILogRow } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { fmtTime } from './util';

const GRID = 'grid grid-cols-[90px_1fr_1fr_1fr_90px_70px] gap-3';

/** ตาราง log การเรียก LLM (ai_logs) */
export function AiLogTable() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AILogRow[] | null>(null);
  const [open, setOpen] = useState<AILogRow | null>(null);

  useEffect(() => { getAiLogs(150).then(setRows).catch(() => setRows([])); }, []);

  if (rows === null) return <div className="grid place-items-center py-20"><Spinner size={26} /></div>;
  if (rows.length === 0) return <Card className="py-6"><EmptyState emoji="🤖" color="slate" title={t('ailog.empty')} /></Card>;

  return (
    <>
      <Card className="overflow-hidden pb-1">
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={cx(GRID, 'px-5 py-3 border-b border-line text-[12px] font-extrabold text-muted tracking-wide uppercase')}>
              <span>{t('ailog.cols.time')}</span><span>{t('ailog.cols.endpoint')}</span><span>{t('ailog.cols.provider')}</span>
              <span>{t('ailog.cols.model')}</span><span>{t('ailog.cols.status')}</span><span className="text-right">{t('ailog.cols.ms')}</span>
            </div>
            {rows.map((r, i) => (
              <button key={r.id} onClick={() => setOpen(r)} className={cx(GRID, 'w-full px-5 py-3.5 items-center text-left transition hover:bg-cream/70', i < rows.length - 1 && 'border-b border-line/70')}>
                <span className="font-mono text-[13px] font-bold text-muted">{fmtTime(r.ts)}</span>
                <span className="font-mono text-[13px] font-bold truncate" style={{ color: pal('grape').c }}>{r.endpoint}</span>
                <span className="font-bold text-ink text-sm truncate">{r.provider}</span>
                <span className="font-semibold text-muted text-sm truncate">{r.model}</span>
                <span><StatusDot status={r.ok ? 'ok' : 'error'} /></span>
                <span className="text-right font-bold text-sm text-ink">{r.ms || '—'}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Drawer open={!!open} onClose={() => setOpen(null)} width={460}>
        {open && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="h-10 w-10 rounded-2xl grid place-items-center text-lg" style={{ background: pal('slate').soft }}>🤖</div>
                <div>
                  <div className="font-display text-lg font-medium text-ink">{open.endpoint}</div>
                  <div className="text-[12px] font-bold text-muted font-mono">{fmtTime(open.ts)} · {open.ms}ms</div>
                </div>
              </div>
              <IconBtn onClick={() => setOpen(null)}>✕</IconBtn>
            </div>
            <div className="flex gap-2 mb-5 flex-wrap">
              <Tag color="grape">{open.provider}</Tag>
              <Tag color="sky">{open.model}</Tag>
              <StatusDot status={open.ok ? 'ok' : 'error'} />
            </div>
            {open.error && <div className="mb-4 bg-white rounded-2xl border border-line p-3.5 text-coral font-bold text-sm">{open.error}</div>}
            {([['systemPrompt', open.systemPreview], ['user', open.userPreview], ['response', open.responsePreview]] as const).map(([key, val]) => (
              <div key={key} className="mb-4">
                <div className="text-[11px] font-extrabold uppercase tracking-wider mb-1.5" style={{ color: pal('grape').c }}>{t(`ailog.${key}`)}</div>
                <div className="bg-white rounded-2xl border border-line p-3.5 font-mono text-[12.5px] leading-relaxed text-ink/80 whitespace-pre-wrap break-words">{val || '—'}</div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}
