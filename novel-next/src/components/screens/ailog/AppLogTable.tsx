'use client';
import { useEffect, useState } from 'react';
import { Card, Drawer, IconBtn, Tag, Spinner, EmptyState } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal, cx } from '@/lib/theme';
import { getAppLogs } from '@/lib/api';
import type { AppLogRow } from '@/lib/types';
import { fmtTime } from './util';

const GRID = 'grid grid-cols-[90px_90px_1fr_80px_70px] gap-3';
const TYPE_COLOR: Record<string, string> = { request: 'sky', activity: 'grape', error: 'coral' };

/** ตาราง log ระบบ (app_logs: request/activity/error) */
export function AppLogTable() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AppLogRow[] | null>(null);
  const [open, setOpen] = useState<AppLogRow | null>(null);

  useEffect(() => { getAppLogs({ limit: 200 }).then(setRows).catch(() => setRows([])); }, []);

  if (rows === null) return <div className="grid place-items-center py-20"><Spinner size={26} /></div>;
  if (rows.length === 0) return <Card className="py-6"><EmptyState emoji="📋" color="slate" title={t('ailog.empty')} /></Card>;

  const detail = (r: AppLogRow) =>
    r.type === 'request' ? `${r.method ?? ''} ${r.path ?? ''}` : r.type === 'activity' ? `${r.action ?? ''}${r.target ? ` · ${r.target}` : ''}` : r.error ?? '';

  return (
    <>
      <Card className="overflow-hidden pb-1">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className={cx(GRID, 'px-5 py-3 border-b border-line text-[12px] font-extrabold text-muted tracking-wide uppercase')}>
              <span>{t('ailog.cols.time')}</span><span>{t('ailog.cols.type')}</span><span>{t('ailog.cols.detail')}</span>
              <span>{t('ailog.cols.level')}</span><span className="text-right">{t('ailog.cols.ms')}</span>
            </div>
            {rows.map((r, i) => (
              <button key={r._id} onClick={() => setOpen(r)} className={cx(GRID, 'w-full px-5 py-3 items-center text-left transition hover:bg-cream/70', i < rows.length - 1 && 'border-b border-line/70')}>
                <span className="font-mono text-[13px] font-bold text-muted">{fmtTime(r.ts)}</span>
                <span><Tag color={TYPE_COLOR[r.type] ?? 'slate'}>{r.type}</Tag></span>
                <span className="font-mono text-[12.5px] font-semibold text-ink truncate">{detail(r)}</span>
                <span className={cx('font-bold text-[12px]', r.level === 'error' ? 'text-coral' : r.level === 'warn' ? 'text-sun' : 'text-muted')}>{r.level}</span>
                <span className="text-right font-bold text-sm text-ink">{r.ms ?? '—'}</span>
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
                <div className="h-10 w-10 rounded-2xl grid place-items-center text-lg" style={{ background: pal(TYPE_COLOR[open.type] ?? 'slate').soft }}>📋</div>
                <div>
                  <div className="font-display text-lg font-medium text-ink">{open.type}</div>
                  <div className="text-[12px] font-bold text-muted font-mono">{fmtTime(open.ts)}{open.ms != null ? ` · ${open.ms}ms` : ''}</div>
                </div>
              </div>
              <IconBtn onClick={() => setOpen(null)}>✕</IconBtn>
            </div>
            <div className="bg-white rounded-2xl border border-line p-3.5 font-mono text-[12.5px] leading-relaxed text-ink/80 whitespace-pre-wrap break-words">
              {JSON.stringify(open, null, 2)}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
