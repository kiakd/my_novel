'use client';
import { useReaderPrefs, READER_THEMES, FONT_MIN, FONT_MAX, FONT_STEP, type ReaderTheme } from '@/lib/store/readerPrefs';
import { hasContent, type Chapter } from '@/lib/chapter';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';

const THEME_KEYS: ReaderTheme[] = ['paper', 'sepia', 'night'];

/** โหมดอ่านในการ์ดบท — render เนื้อบทด้วยสไตล์ .ns-reader + theme/ฟอนต์ ใช้ prefs ร่วมกับหน้า /read */
export function ChapterReadView({ chapter, chapterLabel }: { chapter: Chapter; chapterLabel: string }) {
  const { t } = useI18n();
  const { prefs, update } = useReaderPrefs();
  const theme = READER_THEMES[prefs.theme];
  const accent = pal('sky').c;
  const empty = !hasContent(chapter.content);

  return (
    <div className="flex-1 flex flex-col rounded-b-[inherit] overflow-hidden" style={{ background: theme.bg, color: theme.fg }}>
      {/* แถบตั้งค่าอ่าน: ขนาดอักษร + ธีม */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-2.5" style={{ borderBottom: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => update({ fontSize: prefs.fontSize - FONT_STEP })}
            disabled={prefs.fontSize <= FONT_MIN}
            className="h-8 w-10 rounded-lg text-sm font-bold transition active:scale-95 disabled:opacity-40"
            style={{ background: theme.chrome, color: theme.fg }}
          >A−</button>
          <span className="w-12 text-center text-[12px] font-bold tabular-nums" style={{ color: theme.faint }}>{prefs.fontSize}px</span>
          <button
            onClick={() => update({ fontSize: prefs.fontSize + FONT_STEP })}
            disabled={prefs.fontSize >= FONT_MAX}
            className="h-8 w-10 rounded-lg text-base font-bold transition active:scale-95 disabled:opacity-40"
            style={{ background: theme.chrome, color: theme.fg }}
          >A＋</button>
        </div>
        <div className="flex items-center gap-1.5">
          {THEME_KEYS.map((k) => {
            const tc = READER_THEMES[k];
            const sel = prefs.theme === k;
            return (
              <button
                key={k}
                onClick={() => update({ theme: k })}
                aria-label={k}
                className="h-7 w-7 rounded-full transition active:scale-95"
                style={{ background: tc.swatch, outline: sel ? `2px solid ${accent}` : `1px solid ${tc.border}`, outlineOffset: 1 }}
              />
            );
          })}
        </div>
      </div>

      {/* คอลัมน์อ่าน จัดกลาง */}
      <div className="flex-1 overflow-auto">
        <article className="mx-auto w-full px-5 sm:px-7 py-8 sm:py-12" style={{ maxWidth: 680, fontSize: prefs.fontSize }}>
          <div className="text-[11px] font-extrabold tracking-[.18em] uppercase mb-2" style={{ color: theme.faint }}>{chapterLabel}</div>
          <h1 className="ns-reader-title font-display mb-7" style={{ fontSize: '1.7em' }}>{chapter.title?.trim() || t('chapters.untitled')}</h1>
          {empty ? (
            <p style={{ color: theme.faint }}>{t('reader.chapterEmpty')}</p>
          ) : (
            <div className="ns-reader" dangerouslySetInnerHTML={{ __html: chapter.content ?? '' }} />
          )}
        </article>
      </div>
    </div>
  );
}
