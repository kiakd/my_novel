'use client';
import { useStory } from '@/lib/store/StoryProvider';

interface ReaderStorySelectProps {
  fg: string;
  faint: string;
  border: string;
  label: string;
}

/** เลือกเรื่องที่จะอ่าน (อยู่บนสุดของสารบัญ) — ขับด้วย StoryProvider เหมือน header */
export function ReaderStorySelect({ fg, faint, border, label }: ReaderStorySelectProps) {
  const { stories, activeStoryId, setActiveStory } = useStory();
  if (stories.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] font-extrabold tracking-[.16em] uppercase mb-1.5" style={{ color: faint }}>{label}</div>
      <div className="relative">
        <select
          value={activeStoryId}
          onChange={(e) => setActiveStory(e.target.value)}
          className="appearance-none w-full font-display font-semibold text-[15px] rounded-xl pl-3.5 pr-9 py-2 cursor-pointer focus:outline-none transition"
          style={{ background: 'rgba(233,165,43,.12)', color: fg, border: `1px solid ${border}` }}
        >
          {/* option list เป็น OS-rendered — บังคับสีอ่านง่ายทุกธีม */}
          {stories.map((s) => <option key={s.id} value={s.id} style={{ color: '#3a322a', background: '#fff' }}>{s.name}</option>)}
        </select>
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: faint }}>▾</span>
      </div>
    </div>
  );
}
