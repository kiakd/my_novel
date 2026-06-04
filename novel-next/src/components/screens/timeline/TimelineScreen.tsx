'use client';
import { SectionTitle, Card, Tag, Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';
import { useStory } from '@/lib/store/StoryProvider';

const EVENT_ICONS = ['🔥', '🧭', '📜', '💡', '🪨', '⭐', '🌙', '⚔️'];

/** หน้าไทม์ไลน์ — ผูกกับ story.timeline */
export function TimelineScreen() {
  const { t } = useI18n();
  const { story, mutateStory } = useStory();

  const events = [...(story?.timeline ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const chapTitle = (id?: string) => story?.chapters.find((c) => c.id === id)?.title || '—';

  const addEvent = () => {
    mutateStory((s) => ({
      ...s,
      timeline: [...s.timeline, { id: 'e' + Date.now(), order: s.timeline.length, label: 'New event', time: '', description: '', color: 'sun' }],
    }));
    toast(t('toast.newEvent'), '⏱️');
  };

  return (
    <div className="max-w-3xl mx-auto">
      <SectionTitle emoji="⏱️" color="sun" title={t('timeline.title')} sub={t('timeline.sub')}
        right={<Btn variant="primary" color="sun" onClick={addEvent}>＋ {t('timeline.add')}</Btn>} />
      <div className="relative pl-8 pb-10">
        <div className="absolute left-[11px] top-2 bottom-2 w-1 rounded-full" style={{ background: 'linear-gradient(#F2B23E, #ECE2D1)' }} />
        <div className="flex flex-col gap-4">
          {events.map((e, i) => {
            const P = pal(e.color ?? 'sun');
            return (
              <div key={e.id} className="relative anim-rise" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="absolute -left-[29px] top-4 h-5 w-5 rounded-full border-[3px] border-cream" style={{ background: P.c, boxShadow: `0 0 0 3px ${P.soft}` }} />
                <Card hover className="p-4 flex items-start gap-3">
                  <div className="h-11 w-11 rounded-2xl grid place-items-center text-xl shrink-0" style={{ background: P.soft }}>{EVENT_ICONS[i % EVENT_ICONS.length]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display text-[17px] font-medium text-ink">{e.label}</span>
                      {e.time && <Tag color={e.color ?? 'sun'}>{e.time}</Tag>}
                    </div>
                    <p className="text-[14px] text-muted font-semibold mt-1 leading-snug">{e.description}</p>
                    {e.chapterId && <span className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-extrabold rounded-full px-2.5 py-1" style={{ color: pal('sky').c, background: pal('sky').soft }}>📖 {chapTitle(e.chapterId)}</span>}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
