'use client';
import { pal } from '@/lib/theme';

interface ReaderTopBarProps {
  title: string;
  progress: number; // 0..1
  chrome: string;
  fg: string;
  border: string;
  onExit: () => void;
  onToc: () => void;
  onSettings: () => void;
  labels: { exit: string; toc: string; settings: string };
}

/** ปุ่มไอคอนในแถบอ่าน — สีตามธีม (ใช้ซ้ำใน TopBar) */
function Ico({ onClick, label, fg, children }: { onClick: () => void; label: string; fg: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="h-10 w-10 grid place-items-center rounded-2xl text-lg transition active:scale-90 hover:bg-black/[.06]"
      style={{ color: fg }}
    >
      {children}
    </button>
  );
}

/** แถบบนของโหมดอ่าน: ออก · ชื่อบท · สารบัญ · ตั้งค่า + progress การเลื่อน */
export function ReaderTopBar({ title, progress, chrome, fg, border, onExit, onToc, onSettings, labels }: ReaderTopBarProps) {
  return (
    <header className="relative shrink-0" style={{ background: chrome, borderBottom: `1px solid ${border}` }}>
      <div className="flex items-center gap-1 px-2 sm:px-3 h-14">
        <Ico onClick={onExit} label={labels.exit} fg={fg}>←</Ico>
        <div className="flex-1 min-w-0 text-center font-display font-semibold truncate px-1" style={{ color: fg }}>{title}</div>
        <Ico onClick={onToc} label={labels.toc} fg={fg}>☰</Ico>
        <Ico onClick={onSettings} label={labels.settings} fg={fg}>
          <span className="font-display font-bold text-base leading-none">A<span className="text-xs align-baseline">a</span></span>
        </Ico>
      </div>
      <div className="absolute bottom-0 left-0 h-[3px] transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%`, background: pal('sun').c }} />
    </header>
  );
}
