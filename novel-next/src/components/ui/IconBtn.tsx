'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { pal, cx } from '@/lib/theme';

interface IconBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  color?: string;
  active?: boolean;
  children?: ReactNode;
}

/** ปุ่มไอคอนสี่เหลี่ยมมน 36px */
export function IconBtn({ children, color = 'slate', active, className = '', ...rest }: IconBtnProps) {
  const P = pal(color);
  return (
    <button
      className={cx('h-9 w-9 grid place-items-center rounded-2xl transition active:scale-90', className)}
      style={active ? { background: P.soft, color: P.c } : { color: '#8a7f6e' }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(74,65,56,.06)'; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
      {...rest}
    >
      {children}
    </button>
  );
}
