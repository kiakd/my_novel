'use client';
// ช่องวางรูปเดี่ยว — เก็บ dataURL ใน localStorage (ไม่ขึ้น DB เพื่อไม่ให้ JSON บวม)
// ลาก/คลิกเพื่อใส่รูป, ย่อผ่าน canvas เป็น webp ก่อนเก็บ. คอนเซ็ปต์เดียวกับ sidecar ของ wireframe
import { useEffect, useRef, useState } from 'react';
import { pal } from '@/lib/theme';

const PREFIX = 'tl:slot:';

/** ย่อรูปให้ด้านยาวสุด ≤ max แล้ว encode เป็น webp (เล็กกว่า PNG ~10x) */
async function downscale(file: File, max = 1000): Promise<string> {
  const bmp = await createImageBitmap(file);
  try {
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    return cv.toDataURL('image/webp', 0.85);
  } finally {
    bmp.close?.();
  }
}

interface ImageSlotProps {
  slotKey: string;
  placeholder: string;
  w?: number | string;
  h?: number;
  radius?: number;
}

export function ImageSlot({ slotKey, placeholder, w = 120, h = 104, radius = 14 }: ImageSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const P = pal('lilac');
  const lsKey = PREFIX + slotKey;

  // hydrate หลัง mount (เลี่ยง SSR mismatch)
  useEffect(() => { setUrl(localStorage.getItem(lsKey)); }, [lsKey]);

  const handle = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setBusy(true);
    try {
      const data = await downscale(file);
      try { localStorage.setItem(lsKey, data); } catch { /* quota — ยังโชว์ในเซสชันได้ */ }
      setUrl(data);
    } finally {
      setBusy(false);
    }
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.removeItem(lsKey);
    setUrl(null);
  };

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) void handle(f); }}
      className="relative group cursor-pointer overflow-hidden border-2 transition hover:brightness-[.98] shrink-0"
      style={{ width: w, height: h, borderRadius: radius, borderStyle: url ? 'solid' : 'dashed', borderColor: url ? '#E6DCC9' : P.c, background: url ? '#000' : P.soft }}
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={placeholder} className="w-full h-full object-cover" />
          <button
            onClick={clear}
            className="absolute top-1 right-1 h-6 w-6 grid place-items-center rounded-full bg-black/55 text-white text-xs opacity-0 group-hover:opacity-100 transition"
            title="Remove"
          >✕</button>
        </>
      ) : (
        <div className="h-full grid place-items-center text-center px-1.5" style={{ color: P.c }}>
          <div>
            <div className="text-2xl leading-none">{busy ? '⏳' : '＋'}</div>
            <div className="text-[11px] font-bold mt-1 leading-tight">{placeholder}</div>
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
    </div>
  );
}
