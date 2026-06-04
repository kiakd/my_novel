'use client';
import { useI18n } from '@/lib/i18n';
import { pal, cx } from '@/lib/theme';

/** สลับภาษา ไทย/EN */
export function LangToggle() {
  const { lang, setLang } = useI18n();
  const P = pal('grape');
  return (
    <div className="inline-flex items-center rounded-full border-2 p-0.5" style={{ borderColor: P.soft }}>
      {(['th', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={cx('rounded-full px-2.5 py-1 text-[12px] font-extrabold uppercase transition')}
          style={lang === l ? { background: P.c, color: '#fff' } : { color: '#988C7C' }}
        >
          {l === 'th' ? 'ไทย' : 'EN'}
        </button>
      ))}
    </div>
  );
}
