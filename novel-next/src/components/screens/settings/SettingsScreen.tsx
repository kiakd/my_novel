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
          {/* honest note: keys ตั้งผ่าน env ของเซิร์ฟเวอร์เท่านั้น — ช่องนี้ยังไม่ wiring เข้าระบบ */}
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-800">
            ⚠️ ตั้งค่า API key ผ่าน environment ของเซิร์ฟเวอร์ (.env) เท่านั้น — ช่องด้านล่างยังไม่บันทึกเข้าระบบ
          </div>
          <div className="flex flex-col gap-4 opacity-60">
            {PROVIDERS.map((p) => <Field key={p} label={p}><Input type="password" placeholder="ตั้งค่าผ่าน .env บนเซิร์ฟเวอร์" disabled /></Field>)}
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
