'use client';
import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/theme';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
  children?: ReactNode;
}

/** การ์ดพื้นขาว ขอบมน เงานุ่ม — hover ให้ยกตัวขึ้น */
export function Card({ children, className = '', hover, ...rest }: CardProps) {
  return (
    <div
      className={cx(
        'bg-white rounded-4xl border border-line shadow-soft',
        hover && 'transition-all duration-200 hover:-translate-y-1 hover:shadow-pop cursor-pointer',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
