'use client';
import { SectionTitle, Card, Field, Input, Select, Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { PROVIDERS } from '@/lib/mock-data';

/** หน้าตั้งค่า — keys + defaults */
export function SettingsScreen() {
  const { t } = useI18n();
  return (
    <div className="max-w-2xl mx-auto">
      <SectionTitle emoji="⚙️" color="slate" title={t('settings.title')} sub={t('settings.sub')} />
      <div className="flex flex-col gap-5 pb-10">
        <Card className="p-6">
          <div className="font-display text-lg font-medium text-ink mb-4 flex items-center gap-2">🔑 {t('settings.providerKeys')}</div>
          <div className="flex flex-col gap-4">
            {PROVIDERS.map((p) => <Field key={p} label={p}><Input type="password" defaultValue="sk-••••••••••••••••" /></Field>)}
          </div>
        </Card>
        <Card className="p-6">
          <div className="font-display text-lg font-medium text-ink mb-4 flex items-center gap-2">🧠 {t('settings.defaults')}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('settings.defaultTextModel')}><Select value="claude-sonnet-4" onChange={() => {}} options={['claude-sonnet-4', 'gpt-4o', 'kayra-v1']} /></Field>
            <Field label={t('settings.defaultImageProvider')}><Select value="NovelAI" onChange={() => {}} options={PROVIDERS} /></Field>
            <Field label={t('settings.comfyUrl')} className="col-span-2"><Input defaultValue="http://127.0.0.1:8188" /></Field>
          </div>
        </Card>
        <div className="flex justify-end">
          <Btn variant="primary" color="slate" size="lg" onClick={() => toast(t('toast.settingsSaved'), '💾')}>{t('settings.saveSettings')}</Btn>
        </div>
      </div>
    </div>
  );
}
