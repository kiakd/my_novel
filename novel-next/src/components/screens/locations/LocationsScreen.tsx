'use client';
import { useState } from 'react';
import { SectionTitle, Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import type { Loc } from '@/lib/types';
import { LocationCard } from './LocationCard';
import { LocationModal } from './LocationModal';

/** หน้าสถานที่ — ผูกกับ story.locations */
export function LocationsScreen() {
  const { t } = useI18n();
  const { story, mutateStory } = useStory();
  const [activeId, setActiveId] = useState<string | null>(null);

  const list = story?.locations ?? [];
  const active = list.find((l) => l.id === activeId) ?? null;

  const addLocation = () => {
    const id = 'l' + Date.now();
    mutateStory((s) => ({ ...s, locations: [...s.locations, { id, name: 'New location', color: 'mint' }] }));
    setActiveId(id);
    toast(t('toast.newLocation'), '🗺️');
  };
  const saveLocation = (l: Loc) =>
    mutateStory((s) => ({ ...s, locations: s.locations.map((x) => (x.id === l.id ? l : x)) }));

  return (
    <div className="max-w-5xl mx-auto">
      <SectionTitle emoji="🗺️" color="mint" title={t('locations.title')} sub={t('locations.sub', { n: list.length })}
        right={<Btn variant="primary" color="mint" onClick={addLocation}>＋ {t('locations.add')}</Btn>} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-10">
        {list.map((l) => <LocationCard key={l.id} l={l} onOpen={(x) => setActiveId(x.id)} />)}
      </div>
      {active && <LocationModal loc={active} onClose={() => setActiveId(null)} onSave={saveLocation} />}
    </div>
  );
}
