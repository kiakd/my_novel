'use client';
import { useRef } from 'react';
import { Card } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal, darken } from '@/lib/theme';
import type { Relation, Char } from '@/lib/types';
import { charInitial, charColor } from '../characters/util';

interface NodePos { x: number; y: number }

interface RelationGraphProps {
  rels: Relation[];
  chars: Char[];
  pos: Record<string, NodePos>;
  setPos: (updater: (p: Record<string, NodePos>) => Record<string, NodePos>) => void;
  onPersist: (pos: Record<string, NodePos>) => void;
  selId: string;
  setSelId: (id: string) => void;
}

/** กราฟความสัมพันธ์ SVG — ลากโหนดได้ (เซฟตำแหน่งตอนปล่อยเมาส์) */
export function RelationGraph({ rels, chars, pos, setPos, onPersist, selId, setSelId }: RelationGraphProps) {
  const { t } = useI18n();
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const posRef = useRef(pos);
  posRef.current = pos;

  const charById = (id?: string) => chars.find((c) => c.id === id);

  // แปลงพิกัดหน้าจอ (px) → พิกัด viewBox (700×470) ตามสเกลจริง รองรับทุกความกว้าง
  const toViewBox = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 700, y: (e.clientY - r.top) / r.height * 470 };
  };

  const onDown = (id: string, e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId); // จับ pointer ไว้กับโหนด — ลากต่อได้แม้นิ้วออกนอกขอบ
    const v = toViewBox(e);
    const p = pos[id] ?? { x: 200, y: 200 };
    drag.current = { id, ox: v.x - p.x, oy: v.y - p.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const v = toViewBox(e);
    const x = Math.max(50, Math.min(650, v.x - drag.current.ox));
    const y = Math.max(40, Math.min(420, v.y - drag.current.oy));
    const id = drag.current.id;
    setPos((p) => ({ ...p, [id]: { x, y } }));
  };
  const onUp = () => {
    if (drag.current) { drag.current = null; onPersist(posRef.current); }
  };

  const posOf = (id?: string) => (id ? pos[id] : undefined);

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 1px 1px, #ECE2D1 1.5px, transparent 0)', backgroundSize: '22px 22px', opacity: 0.6 }} />
      <svg ref={svgRef} viewBox="0 0 700 470" className="w-full h-auto block touch-none select-none" style={{ aspectRatio: '700 / 470' }}>
        {rels.map((r) => {
          const a = posOf(r.from), b = posOf(r.to);
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const on = r.id === selId;
          const col = pal(charColor(charById(r.from) ?? ({} as Char))).c;
          const ty = r.type ?? '';
          return (
            <g key={r.id} onPointerDown={() => setSelId(r.id)} style={{ cursor: 'pointer' }}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? col : '#D8CDBA'} strokeWidth={on ? 3 : 2} strokeLinecap="round" />
              <g transform={`translate(${mx},${my})`}>
                <rect x={-(ty.length * 3.6 + 14)} y={-12} width={ty.length * 7.2 + 28} height={24} rx={12} fill={on ? col : '#fff'} stroke={on ? col : '#E2D6C2'} strokeWidth="1.5" />
                <text textAnchor="middle" dy="4.5" fontFamily="Nunito" fontWeight="800" fontSize="12.5" fill={on ? '#fff' : '#988C7C'}>{ty}</text>
              </g>
            </g>
          );
        })}
        {chars.map((c) => {
          const p = pos[c.id];
          if (!p) return null;
          const P = pal(charColor(c));
          return (
            <g key={c.id} transform={`translate(${p.x},${p.y})`} onPointerDown={(e) => onDown(c.id, e)} onPointerMove={onMove} onPointerUp={onUp} style={{ cursor: 'grab', touchAction: 'none' }}>
              <circle r="27" fill="#fff" stroke={P.c} strokeWidth="3" />
              <circle r="24" fill={P.c} opacity="0.16" />
              <text textAnchor="middle" dy="2" fontFamily="Fredoka" fontWeight="600" fontSize="20" fill={darken(P.c, 0.7)}>{charInitial(c)}</text>
              <text textAnchor="middle" y="44" fontFamily="Nunito" fontWeight="800" fontSize="13" fill="#4A4138">{(c.name || '').split(' ')[0]}</text>
            </g>
          );
        })}
      </svg>
      <div className="absolute bottom-3 right-4 text-[12px] font-bold text-muted flex items-center gap-1.5">✋ {t('relations.dragHint')}</div>
    </Card>
  );
}
