'use client';
import { Tag } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

/** ป้ายสถานะ ok / error */
export function StatusDot({ status }: { status: 'ok' | 'error' }) {
  const { t } = useI18n();
  const ok = status === 'ok';
  return <Tag color={ok ? 'mint' : 'coral'}>{ok ? `● ${t('ailog.ok')}` : `✕ ${t('ailog.error')}`}</Tag>;
}
