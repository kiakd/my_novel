'use client';
import { Card, Avatar, Field, Textarea, Btn, toast } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';
import type { Relation, Char } from '@/lib/types';
import { charInitial, charColor } from '../characters/util';

const REL_TYPES = ['allies', 'rivals', 'mentored by', 'sibling', 'employs', 'keeps watch', 'loves', 'fears'];

interface RelationEditPanelProps {
  sel: Relation | undefined;
  chars: Char[];
  update: (key: keyof Relation, value: string) => void;
  onDelete: () => void;
}

/** แผงแก้ความสัมพันธ์ที่เลือก */
export function RelationEditPanel({ sel, chars, update, onDelete }: RelationEditPanelProps) {
  const { t } = useI18n();
  const charById = (id?: string) => chars.find((c) => c.id === id);
  const from = charById(sel?.from);
  const to = charById(sel?.to);

  return (
    <Card className="p-5 h-fit">
      <div className="font-display text-lg font-medium text-ink mb-4">{t('relations.edit')}</div>
      {sel ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center gap-2.5 bg-cream/70 rounded-3xl py-4 border border-line">
            <div className="flex flex-col items-center gap-1">
              {from && <Avatar initial={charInitial(from)} color={charColor(from)} size={44} />}
              <span className="text-[12px] font-extrabold text-ink">{(from?.name || '?').split(' ')[0]}</span>
            </div>
            <span className="text-2xl" style={{ color: pal('bubble').c }}>→</span>
            <div className="flex flex-col items-center gap-1">
              {to && <Avatar initial={charInitial(to)} color={charColor(to)} size={44} />}
              <span className="text-[12px] font-extrabold text-ink">{(to?.name || '?').split(' ')[0]}</span>
            </div>
          </div>
          <Field label={t('relations.type')}>
            <div className="flex flex-wrap gap-1.5">
              {REL_TYPES.map((ty) => (
                <button key={ty} onClick={() => update('type', ty)} className="rounded-full px-3 py-1 text-[12.5px] font-extrabold transition border-2"
                  style={sel.type === ty ? { background: pal('bubble').c, color: '#fff', borderColor: pal('bubble').c } : { borderColor: '#ECE2D1', color: '#988C7C' }}>{ty}</button>
              ))}
            </div>
          </Field>
          <Field label={t('relations.feeling')}>
            <Textarea rows={4} value={sel.feeling ?? ''} onChange={(e) => update('feeling', e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <Btn variant="primary" color="bubble" className="flex-1" onClick={() => toast(t('toast.relSaved'), '💾')}>{t('common.save')}</Btn>
            <Btn variant="ghost" onClick={onDelete}>🗑</Btn>
          </div>
        </div>
      ) : (
        <p className="text-muted font-semibold text-sm">{t('relations.hint')}</p>
      )}
    </Card>
  );
}
