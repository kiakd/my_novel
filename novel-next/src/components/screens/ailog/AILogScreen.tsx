'use client';
import { useState } from 'react';
import { SectionTitle } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';
import { AiLogTable } from './AiLogTable';
import { AppLogTable } from './AppLogTable';

type Tab = 'ai' | 'system';

/** หน้า AI Log — แท็บ การเรียก AI (ai_logs) / ระบบ (app_logs) */
export function AILogScreen() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('ai');
  const P = pal('slate');

  const tabs: [Tab, string][] = [['ai', t('ailog.tabs.ai')], ['system', t('ailog.tabs.system')]];

  return (
    <div className="max-w-5xl mx-auto">
      <SectionTitle
        emoji="📋"
        color="slate"
        title={t('ailog.title')}
        sub={t('ailog.sub')}
        right={
          <div className="flex gap-1.5">
            {tabs.map(([id, lbl]) => (
              <button key={id} onClick={() => setTab(id)} className="rounded-full px-4 py-1.5 font-bold text-sm transition"
                style={tab === id ? { background: P.c, color: '#fff' } : { background: P.soft, color: '#7E889B' }}>{lbl}</button>
            ))}
          </div>
        }
      />
      {tab === 'ai' ? <AiLogTable /> : <AppLogTable />}
    </div>
  );
}
