'use client';
import { useState, useEffect } from 'react';
import { SectionTitle, Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import type { Relation } from '@/lib/types';
import { RelationGraph } from './RelationGraph';
import { RelationEditPanel } from './RelationEditPanel';

interface NodePos { x: number; y: number }

/** วางโหนดที่ยังไม่มีตำแหน่ง ให้เรียงเป็นวงกลม */
function withDefaults(ids: string[], pos: Record<string, NodePos>): Record<string, NodePos> {
  const out = { ...pos };
  const missing = ids.filter((id) => !out[id]);
  missing.forEach((id, i) => {
    const ang = (i / Math.max(1, missing.length)) * Math.PI * 2;
    out[id] = { x: 350 + Math.cos(ang) * 180, y: 235 + Math.sin(ang) * 150 };
  });
  return out;
}

/** หน้าความสัมพันธ์ — ผูกกับ story.relations + story.nodePos */
export function RelationsScreen() {
  const { t } = useI18n();
  const { story, mutateStory, activeStoryId } = useStory();

  const chars = story?.characters ?? [];
  const rels = story?.relations ?? [];
  const [pos, setPos] = useState<Record<string, NodePos>>({});
  const [selId, setSelId] = useState<string>('');

  // sync ตำแหน่งจาก state (เติม default ให้ตัวที่ยังไม่มี)
  useEffect(() => {
    setPos(withDefaults(chars.map((c) => c.id), story?.nodePos ?? {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoryId, chars.length]);

  const sel = rels.find((r) => r.id === selId);

  const persistPos = (p: Record<string, NodePos>) => mutateStory((s) => ({ ...s, nodePos: p }));
  const update = (k: keyof Relation, v: string) =>
    mutateStory((s) => ({ ...s, relations: s.relations.map((r) => (r.id === selId ? { ...r, [k]: v } : r)) }));
  const addRelation = () => {
    if (chars.length < 2) { toast(t('toast.newRelation'), '🔗'); return; }
    const id = 'r' + Date.now();
    mutateStory((s) => ({ ...s, relations: [...s.relations, { id, from: chars[0].id, to: chars[1].id, type: 'allies', feeling: '' }] }));
    setSelId(id);
    toast(t('toast.newRelation'), '🔗');
  };
  const deleteRel = () => {
    mutateStory((s) => ({ ...s, relations: s.relations.filter((r) => r.id !== selId) }));
    setSelId('');
    toast(t('toast.removed'), '🗑');
  };

  return (
    <div className="max-w-6xl mx-auto">
      <SectionTitle emoji="🔗" color="bubble" title={t('relations.title')} sub={t('relations.sub')}
        right={<Btn variant="primary" color="bubble" onClick={addRelation}>＋ {t('relations.add')}</Btn>} />
      <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-5 pb-10">
        <RelationGraph rels={rels} chars={chars} pos={pos} setPos={setPos} onPersist={persistPos} selId={selId} setSelId={setSelId} />
        <RelationEditPanel sel={sel} chars={chars} update={update} onDelete={deleteRel} />
      </div>
    </div>
  );
}
