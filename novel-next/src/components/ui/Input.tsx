'use client';
import type { InputHTMLAttributes } from 'react';
import { cx } from '@/lib/theme';

/** ช่องกรอกบรรทัดเดียว สไตล์ pill นุ่ม */
export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full bg-cream/70 rounded-2xl px-4 py-2.5 text-ink placeholder:text-muted/70 border-2 border-line focus:border-grape focus:bg-white focus:outline-none transition font-semibold',
        className,
      )}
      {...rest}
    />
  );
}
