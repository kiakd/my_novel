'use client';
import type { ChangeEvent } from 'react';
import { pal, cx } from '@/lib/theme';

interface SelectProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  className?: string;
  color?: string;
}

/** dropdown สไตล์ pill */
export function Select({ value, onChange, options, className = '', color = 'slate' }: SelectProps) {
  const P = pal(color);
  return (
    <div className={cx('relative inline-block', className)}>
      <select
        value={value}
        onChange={onChange}
        className="appearance-none font-bold rounded-full pl-4 pr-9 py-2 border-2 cursor-pointer focus:outline-none"
        style={{ borderColor: P.soft, background: '#fff', color: '#4A4138' }}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted text-xs">▾</span>
    </div>
  );
}
