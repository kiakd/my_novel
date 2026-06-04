'use client';
import { useRef, useState } from 'react';
import { pal } from '@/lib/theme';
import { refTag } from '@/lib/api';

interface ImageDropProps {
  onTags: (tags: string[], buckets: Record<string, string[]> | null) => void;
  labels: { attach: string; analyzing: string; change: string; failed: string };
}

/** ลาก/เลือกรูป → base64 → /api/ref/tag (WD14) → ส่ง tags/buckets กลับ + พรีวิวรูป */
export function ImageDrop({ onTags, labels }: ImageDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const P = pal('lilac');

  const handle = async (file: File) => {
    setErr(null);
    const dataUrl = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    setPreview(dataUrl);
    const base64 = dataUrl.split(',')[1] ?? '';
    setBusy(true);
    try {
      const r = await refTag(base64);
      if (r.ok) onTags(r.tags ?? [], r.buckets ?? null);
      else { setErr(r.error ?? labels.failed); onTags([], null); }
    } catch (e) {
      setErr((e as Error).message || labels.failed);
      onTags([], null);
    } finally {
      setBusy(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type.startsWith('image/')) void handle(f);
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        className="rounded-2xl border-2 border-dashed cursor-pointer overflow-hidden transition hover:brightness-[.98]"
        style={{ borderColor: P.c, background: P.soft }}
      >
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="w-full max-h-52 object-contain bg-black/5" />
            <div className="absolute bottom-1.5 right-1.5 text-[11px] font-bold px-2 py-1 rounded-full bg-white/90" style={{ color: P.c }}>
              {busy ? labels.analyzing : labels.change}
            </div>
          </div>
        ) : (
          <div className="py-7 px-4 text-center">
            <div className="text-3xl mb-1">🖼️</div>
            <div className="text-sm font-bold" style={{ color: P.c }}>{labels.attach}</div>
          </div>
        )}
      </div>
      {err && <div className="text-xs font-bold mt-1.5" style={{ color: pal('coral').c }}>{err}</div>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFiles(e.target.files)} />
    </div>
  );
}
