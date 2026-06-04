'use client';
import { Input } from '@/components/ui';

interface PronounProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

/** ช่องสรรพนามเล็กๆ (ใช้ใน Speech block) */
export function Pronoun({ label, value, onChange }: PronounProps) {
  return (
    <div className="flex-1">
      <div className="text-[12px] font-extrabold text-muted mb-1">{label}</div>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="py-1.5 text-sm" />
    </div>
  );
}
