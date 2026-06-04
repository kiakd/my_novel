'use client';
import { pal } from '@/lib/theme';
import { READER_THEMES, FONT_MIN, FONT_MAX, FONT_STEP, type ReaderPrefs, type ReaderTheme } from '@/lib/store/readerPrefs';

interface ReaderSettingsProps {
  open: boolean;
  onClose: () => void;
  prefs: ReaderPrefs;
  update: (patch: Partial<ReaderPrefs>) => void;
  chrome: string;
  fg: string;
  faint: string;
  border: string;
  labels: { fontSize: string; theme: string; paper: string; sepia: string; night: string };
}

const THEME_KEYS: ReaderTheme[] = ['paper', 'sepia', 'night'];

/** ป๊อปโอเวอร์ตั้งค่าการอ่าน: ขนาดอักษร + ธีม */
export function ReaderSettings({ open, onClose, prefs, update, chrome, fg, faint, border, labels }: ReaderSettingsProps) {
  if (!open) return null;
  const accent = pal('sun').c;
  const stepBtn = (disabled: boolean): React.CSSProperties => ({
    background: 'rgba(233,165,43,.16)', color: accent, opacity: disabled ? 0.4 : 1, cursor: disabled ? 'default' : 'pointer',
  });
  const themeLabel: Record<ReaderTheme, string> = { paper: labels.paper, sepia: labels.sepia, night: labels.night };
  return (
    <>
      <div className="fixed inset-0 z-[68]" onClick={onClose} />
      <div
        className="fixed top-[60px] right-2 z-[75] w-[272px] rounded-2xl p-4 shadow-2xl anim-pop"
        style={{ background: chrome, border: `1px solid ${border}`, color: fg }}
      >
        <div className="text-[11px] font-extrabold tracking-[.16em] uppercase mb-2.5" style={{ color: faint }}>{labels.fontSize}</div>
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => update({ fontSize: prefs.fontSize - FONT_STEP })}
            disabled={prefs.fontSize <= FONT_MIN}
            className="h-9 w-12 rounded-xl font-bold text-sm transition active:scale-95"
            style={stepBtn(prefs.fontSize <= FONT_MIN)}
          >A−</button>
          <div className="flex-1 text-center font-bold tabular-nums">{prefs.fontSize}px</div>
          <button
            onClick={() => update({ fontSize: prefs.fontSize + FONT_STEP })}
            disabled={prefs.fontSize >= FONT_MAX}
            className="h-9 w-12 rounded-xl font-bold text-base transition active:scale-95"
            style={stepBtn(prefs.fontSize >= FONT_MAX)}
          >A＋</button>
        </div>

        <div className="text-[11px] font-extrabold tracking-[.16em] uppercase mb-2.5" style={{ color: faint }}>{labels.theme}</div>
        <div className="flex gap-2">
          {THEME_KEYS.map((k) => {
            const tc = READER_THEMES[k];
            const sel = prefs.theme === k;
            return (
              <button
                key={k}
                onClick={() => update({ theme: k })}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-bold transition active:scale-95"
                style={{ background: tc.swatch, color: tc.fg, outline: sel ? `2px solid ${accent}` : `1px solid ${tc.border}`, outlineOffset: sel ? 1 : 0 }}
              >
                {themeLabel[k]}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
