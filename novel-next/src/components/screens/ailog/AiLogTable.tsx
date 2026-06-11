'use client';
import { useEffect, useState } from 'react';
import { Card, Drawer, IconBtn, Tag, Spinner, EmptyState, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal, cx } from '@/lib/theme';
import { getAiLogs, getAiLog } from '@/lib/api';
import type { AILogRow, AILogDetail } from '@/lib/types';
import { StatusDot } from './StatusDot';
import { fmtTime } from './util';

const GRID = 'grid grid-cols-[90px_1fr_1fr_1fr_90px_70px] gap-3';

/** ตาราง log การเรียก LLM (ai_logs) */
export function AiLogTable() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AILogRow[] | null>(null);
  const [open, setOpen] = useState<AILogRow | null>(null);
  const [detail, setDetail] = useState<AILogDetail | null>(null);  // log เต็ม (ไม่ถูกตัด) ของรายการที่เปิด
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => { getAiLogs(150).then(setRows).catch(() => setRows([])); }, []);

  // เปิด drawer → ดึง log เต็มมาแทน preview ที่ถูกตัด 200 ตัว
  useEffect(() => {
    if (!open) { setDetail(null); return; }
    let alive = true;
    setLoadingDetail(true);
    getAiLog(open.id)
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => { if (alive) setDetail(null); })
      .finally(() => { if (alive) setLoadingDetail(false); });
    return () => { alive = false; };
  }, [open]);

  const copy = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => toast(`คัดลอก${label}แล้ว`, '📋'))
      .catch(() => toast('คัดลอกไม่สำเร็จ', '⚠️'));
  };

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
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              <Tag color="grape">{open.provider}</Tag>
              <Tag color="sky">{open.model}</Tag>
              <StatusDot status={open.ok ? 'ok' : 'error'} />
              {loadingDetail && <Spinner size={14} />}
            </div>
            {/* คัดลอก prompt ที่ป้อนโมเดล (system + user) ไปลองเทสต่อ */}
            <button
              onClick={() => copy(`${detail?.system ?? ''}\n\n=== USER ===\n${detail?.user ?? ''}`, 'Prompt (system+user)')}
              disabled={loadingDetail || !detail}
              className="w-full mb-4 rounded-2xl py-2.5 font-bold text-[13px] text-white transition disabled:opacity-50 active:scale-[.98]"
              style={{ background: pal('grape').c }}>
              📋 คัดลอก Prompt (system + user) ไปลองเทส
            </button>
            {open.error && <div className="mb-4 bg-white rounded-2xl border border-line p-3.5 text-coral font-bold text-sm">{open.error}</div>}
            {([
              ['systemPrompt', detail?.system, open.systemPreview],
              ['user', detail?.user, open.userPreview],
              ['response', detail?.response, open.responsePreview],
            ] as const).map(([key, full, prev]) => {
              const val = full ?? prev ?? '';
              const truncated = !detail && !!prev && prev.length >= 200;  // ยังโชว์ preview ตัดอยู่
              return (
                <div key={key} className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: pal('grape').c }}>{t(`ailog.${key}`)}</span>
                    <button onClick={() => copy(val, t(`ailog.${key}`))} disabled={!val}
                      title="คัดลอก" className="text-[11px] font-bold text-muted hover:text-ink disabled:opacity-40 transition px-1.5 py-0.5 rounded-lg hover:bg-ink/[.06]">📋 คัดลอก</button>
                  </div>
                  <div className="bg-white rounded-2xl border border-line p-3.5 font-mono text-[12.5px] leading-relaxed text-ink/80 whitespace-pre-wrap break-words">
                    {val || '—'}{truncated && <span className="text-muted italic">… (กำลังโหลดส่วนที่เหลือ)</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Drawer>
    </>
  );
}
