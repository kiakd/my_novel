'use client';
import type { TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/theme';

/** ช่องกรอกหลายบรรทัด */
export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        'w-full bg-cream/70 rounded-2xl px-4 py-3 text-ink placeholder:text-muted/70 border-2 border-line focus:border-grape focus:bg-white focus:outline-none transition resize-none leading-relaxed',
        className,
      )}
      {...rest}
    />
  );
}
