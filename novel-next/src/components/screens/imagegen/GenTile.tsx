'use client';
import { Spinner } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { pal } from '@/lib/theme';

export type TileState = 'loading' | 'done';

const TILE_PALETTES = ['lilac', 'sky', 'bubble', 'mint', 'sun', 'coral'];

/** ช่องรูป 1 ใบในแกลเลอรี (loading / done) */
export function GenTile({ state, idx }: { state: TileState; idx: number }) {
  const { t } = useI18n();
  const P = pal(TILE_PALETTES[idx % TILE_PALETTES.length]);

  if (state === 'loading') {
    return (
      <div className="aspect-square rounded-3xl grid place-items-center border-2 border-dashed" style={{ borderColor: P.c, background: P.soft }}>
        <div className="flex flex-col items-center gap-2">
          <Spinner size={22} color={P.c} />
          <span className="text-[12px] font-extrabold" style={{ color: P.c }}>{t('imagegen.dreaming')}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="aspect-square rounded-3xl relative overflow-hidden grid place-items-center group cursor-pointer" style={{ background: `linear-gradient(140deg, ${P.tint}, ${P.c})` }}>
      <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(45deg,rgba(255,255,255,.10) 0 9px,transparent 9px 18px)' }} />
      <span className="text-4xl opacity-90 relative">🖼️</span>
      <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition">
        <span className="text-white text-[11px] font-extrabold font-mono">render · 1024²</span>
      </div>
    </div>
  );
}
