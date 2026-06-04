'use client';
// ============ i18n provider + hook ============
// ใช้: const { t, lang, setLang } = useI18n();  t('plot.title'), t('characters.sub',{n:6})
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { DICT, DEFAULT_LANG, type Lang } from './dict';

const LS_KEY = 'ns_lang';

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

/** ดึงค่าจาก dict ด้วย dot-path เช่น "characters.fields.bio" */
function resolve(lang: Lang, key: string): string {
  const parts = key.split('.');
  let cur: unknown = DICT[lang];
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key; // ไม่เจอ → คืน key เพื่อให้เห็นว่าตกหล่น
    }
  }
  return typeof cur === 'string' ? cur : key;
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const saved = localStorage.getItem(LS_KEY) as Lang | null;
    if (saved === 'th' || saved === 'en') setLangState(saved);
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LS_KEY, l);
    document.documentElement.lang = l;
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => interpolate(resolve(lang, key), vars),
    [lang],
  );

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n must be used within <I18nProvider>');
  return c;
}

/** shortcut: const t = useT() */
export const useT = () => useI18n().t;
