'use client';
// แกลเลอรีรูปหลายช่อง — จำนวนช่องเก็บใน localStorage, แต่ละช่องเก็บรูปเองผ่าน <ImageSlot>
// ＋ เพิ่มช่อง · − ลบช่องสุดท้าย (พร้อมล้างรูปในช่องนั้น)
import { useEffect, useState } from 'react';
import { pal } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { ImageSlot } from './ImageSlot';

const COUNT_PREFIX = 'tl:galcount:';
const SLOT_PREFIX = 'tl:slot:';

interface SlotGalleryProps {
  galKey: string;
  placeholder: string;
  start?: number;
  w?: number;
  h?: number;
  radius?: number;
}

export function SlotGallery({ galKey, placeholder, start = 2, w = 120, h = 104, radius = 12 }: SlotGalleryProps) {
  const { t } = useI18n();
  const [count, setCount] = useState(start);
  const P = pal('lilac');
  const ckey = COUNT_PREFIX + galKey;

  useEffect(() => {
    const v = localStorage.getItem(ckey);
    const n = v == null ? start : parseInt(v, 10);
    setCount(Math.max(1, isNaN(n) ? start : n));
  }, [ckey, start]);

  const setN = (n: number) => {
    const next = Math.max(1, n);
    setCount(next);
    try { localStorage.setItem(ckey, String(next)); } catch { /* ignore quota */ }
  };

  const add = () => setN(count + 1);
  const removeLast = () => {
    if (count <= 1) return;
    localStorage.removeItem(`${SLOT_PREFIX}${galKey}-${count}`); // ล้างรูปของช่องที่ตัดทิ้ง
    setN(count - 1);
  };

  return (
    <div className="flex flex-wrap gap-2.5 items-stretch">
      {Array.from({ length: count }, (_, i) => (
        <ImageSlot key={i} slotKey={`${galKey}-${i + 1}`} placeholder={`${placeholder} ${i + 1}`} w={w} h={h} radius={radius} />
      ))}
      <div className="flex flex-col gap-1.5">
        <button
          onClick={add}
          className="flex-1 grid place-items-center rounded-xl border-2 border-dashed transition hover:brightness-[.97]"
          style={{ width: 64, borderColor: P.c, background: P.soft, color: P.c }}
          title={t('timeline.addImage')}
        >
          <span className="text-2xl leading-none">＋</span>
        </button>
        {count > 1 && (
          <button
            onClick={removeLast}
            className="grid place-items-center rounded-xl border-2 border-dashed text-muted transition hover:brightness-[.97]"
            style={{ width: 64, height: 30, borderColor: '#E6DCC9', background: '#fff' }}
            title="−"
          >
            <span className="text-lg leading-none">−</span>
          </button>
        )}
      </div>
    </div>
  );
}
