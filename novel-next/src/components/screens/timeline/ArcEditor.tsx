'use client';
// แก้ไข arc beats ของตัวละคร — เพิ่ม/แก้/ลบ จุดเปลี่ยนรายบท (เขียนลง story ผ่าน mutateStory + autosave)
import { Input, Btn } from '@/components/ui';
import { pal } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useStory } from '@/lib/store/StoryProvider';
import type { Char, ArcBeat, ArcKind, LookSub } from '@/lib/types';
import type { ChapterRef } from './arc';

const KINDS: ArcKind[] = ['skill', 'mindset', 'status', 'look', 'milestone'];
const SUBS: LookSub[] = ['outfit', 'hair', 'weapon', 'item'];
const selCls = 'appearance-none font-bold rounded-xl pl-3 pr-7 py-2 border-2 border-line bg-white text-ink text-[13px] cursor-pointer focus:outline-none';

interface ArcEditorProps {
  char: Char;
  chapters: ChapterRef[];
  defaultCh: number;
}

export function ArcEditor({ char, chapters, defaultCh }: ArcEditorProps) {
  const { t } = useI18n();
  const { mutateStory } = useStory();
  const beats = char.arc ?? [];

  /** เขียน arc กลับเข้า story โดยอ้างอิง index ในอาเรย์จริง */
  const setArc = (next: ArcBeat[]) => {
    mutateStory((s) => ({ ...s, characters: s.characters.map((c) => (c.id === char.id ? { ...c, arc: next } : c)) }));
  };
  const patch = (i: number, p: Partial<ArcBeat>) => setArc(beats.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const remove = (i: number) => setArc(beats.filter((_, j) => j !== i));
  const add = () => setArc([...beats, { ch: defaultCh, kind: 'status', label: '' }]);

  const Caret = () => <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted text-[10px]">▾</span>;

  return (
    <div className="rounded-2xl border-2 border-dashed border-line bg-cream/40 p-3.5 flex flex-col gap-2.5">
      {beats.length === 0 && <p className="text-[13px] text-muted font-semibold">{t('timeline.noBeats')}</p>}

      {beats.map((b, i) => (
        <div key={i} className="rounded-xl bg-white border border-line p-2.5 flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            {/* chapter */}
            <div className="relative">
              <select className={selCls} value={b.ch} onChange={(e) => patch(i, { ch: +e.target.value })}>
                {chapters.map((c) => <option key={c.id} value={c.num}>Ch{c.num}</option>)}
              </select>
              <Caret />
            </div>
            {/* kind */}
            <div className="relative">
              <select className={selCls} value={b.kind} onChange={(e) => patch(i, { kind: e.target.value as ArcKind })}>
                {KINDS.map((k) => <option key={k} value={k}>{t(`timeline.kind.${k}`)}</option>)}
              </select>
              <Caret />
            </div>
            {/* sub (เฉพาะ look) */}
            {b.kind === 'look' && (
              <div className="relative">
                <select className={selCls} value={b.sub ?? 'outfit'} onChange={(e) => patch(i, { sub: e.target.value as LookSub })}>
                  {SUBS.map((s) => <option key={s} value={s}>{t(`timeline.lookSub.${s}`)}</option>)}
                </select>
                <Caret />
              </div>
            )}
            <Input value={b.label} onChange={(e) => patch(i, { label: e.target.value })} placeholder={t('timeline.beatLabelPh')} className="flex-1 min-w-[140px] !py-2 !text-[13px]" />
            <button onClick={() => remove(i)} className="h-8 w-8 grid place-items-center rounded-xl text-muted hover:bg-coral/10 transition shrink-0" title={t('common.delete')} style={{ color: pal('coral').c }}>✕</button>
          </div>
          <Input value={b.why ?? ''} onChange={(e) => patch(i, { why: e.target.value || undefined })} placeholder={t('timeline.beatWhyPh')} className="!py-2 !text-[12.5px] !bg-cream/50" />
        </div>
      ))}

      <Btn variant="soft" color="mint" size="sm" className="self-start" onClick={add}>＋ {t('timeline.addBeat')}</Btn>
    </div>
  );
}
