'use client';
import { pal, darken } from '@/lib/theme';
import { useStory } from '@/lib/store/StoryProvider';

/** dropdown เลือกเรื่อง (header) — ขับด้วย StoryProvider */
export function StorySelector() {
  const { stories, activeStoryId, setActiveStory } = useStory();
  const P = pal('grape');
  return (
    <div className="relative">
      <select
        value={activeStoryId}
        onChange={(e) => setActiveStory(e.target.value)}
        disabled={stories.length === 0}
        className="appearance-none font-display font-medium text-[15px] rounded-full pl-4 pr-9 py-1.5 cursor-pointer focus:outline-none border-2 disabled:opacity-60 w-full md:w-auto max-w-full truncate"
        style={{ background: P.soft, borderColor: P.soft, color: darken(P.c, 0.7) }}
      >
        {stories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: P.c }}>▾</span>
    </div>
  );
}
