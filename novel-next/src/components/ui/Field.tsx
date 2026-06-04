'use client';
import type { ReactNode } from 'react';
import { cx } from '@/lib/theme';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** label + (hint ขวา) + ช่องกรอก */
export function Field({ label, hint, children, className = '' }: FieldProps) {
  return (
    <label className={cx('block', className)}>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[13.5px] font-extrabold text-ink/70 tracking-wide">{label}</span>
        {hint}
      </div>
      {children}
    </label>
  );
}
