'use client';
import { useState } from 'react';
import { SectionTitle, Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import type { Char } from '@/lib/types';
import { CharCard } from './CharCard';
import { CharModal } from './CharModal';

/** หน้าตัวละคร — ผูกกับ story.characters */
export function CharactersScreen() {
  const { t } = useI18n();
  const { story, mutateStory } = useStory();
  const [activeId, setActiveId] = useState<string | null>(null);

  const list = story?.characters ?? [];
  const active = list.find((c) => c.id === activeId) ?? null;

  const addCharacter = () => {
    const id = 'c' + Date.now();
    mutateStory((s) => ({ ...s, characters: [...s.characters, { id, name: 'New character', color: 'grape' }] }));
    setActiveId(id);
    toast(t('toast.newCharacter'), '✨');
  };
  const saveCharacter = (c: Char) =>
    mutateStory((s) => ({ ...s, characters: s.characters.map((x) => (x.id === c.id ? c : x)) }));
  const deleteCharacter = (id: string) =>
    mutateStory((s) => ({ ...s, characters: s.characters.filter((x) => x.id !== id) }));

  return (
    <div className="max-w-5xl mx-auto">
      <SectionTitle emoji="👤" color="coral" title={t('characters.title')} sub={t('characters.sub', { n: list.length })}
        right={<Btn variant="primary" color="coral" onClick={addCharacter}>＋ {t('characters.add')}</Btn>} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pb-10">
        {list.map((c) => <CharCard key={c.id} c={c} onOpen={(x) => setActiveId(x.id)} />)}
        <button onClick={addCharacter}
          className="rounded-4xl border-2 border-dashed border-line text-muted font-bold flex flex-col items-center justify-center gap-2 py-10 hover:border-coral hover:text-coral transition min-h-[200px]">
          <span className="text-3xl">＋</span>{t('characters.add')}
        </button>
      </div>
      {active && <CharModal char={active} onClose={() => setActiveId(null)} onSave={saveCharacter} onDelete={deleteCharacter} />}
    </div>
  );
}
