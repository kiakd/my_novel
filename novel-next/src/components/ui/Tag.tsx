'use client';
import type { ReactNode } from 'react';
import { pal, darken, cx } from '@/lib/theme';

interface TagProps {
  children: ReactNode;
  color?: string;
  solid?: boolean;
  className?: string;
}

/** ชิป/แท็กกลม */
export function Tag({ children, color = 'slate', solid, className = '' }: TagProps) {
  const P = pal(color);
  const style = solid
    ? { background: P.c, color: '#fff' }
    : { background: P.soft, color: darken(P.c, 0.74) };
  return (
    <span
      className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-extrabold', className)}
      style={style}
    >
      {children}
    </span>
  );
}
