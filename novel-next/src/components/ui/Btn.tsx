'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { pal, darken, cx } from '@/lib/theme';

export type BtnVariant = 'primary' | 'soft' | 'outline' | 'ghost';
export type BtnSize = 'sm' | 'md' | 'lg';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  color?: string;
  size?: BtnSize;
  children?: ReactNode;
}

const SIZES: Record<BtnSize, string> = {
  sm: 'text-sm px-3 py-1.5 gap-1.5',
  md: 'text-[15px] px-4 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2',
};

/** ปุ่มกลม มี base เงา 3D นุ่มๆ — แก้สไตล์ปุ่มทั้งแอปที่นี่ที่เดียว */
export function Btn({
  children, variant = 'soft', color = 'grape', size = 'md', className = '', ...rest
}: BtnProps) {
  const P = pal(color);
  const base =
    'inline-flex items-center justify-center font-bold rounded-full transition-all duration-150 active:translate-y-[2px] whitespace-nowrap select-none disabled:opacity-50';
  let style: React.CSSProperties = {};
  let extra = '';
  if (variant === 'primary') {
    style = { background: P.c, color: '#fff', boxShadow: `0 4px 0 ${darken(P.c)}` };
    extra = 'hover:brightness-105';
  } else if (variant === 'soft') {
    style = { background: P.soft, color: darken(P.c, 0.78) };
    extra = 'hover:brightness-[.97]';
  } else if (variant === 'outline') {
    style = { border: `2px solid ${P.c}`, color: darken(P.c, 0.8), background: '#fff' };
    extra = 'hover:bg-black/[.03]';
  } else {
    style = { color: '#6f6555' };
    extra = 'hover:bg-ink/[.06]';
  }
  return (
    <button className={cx(base, SIZES[size], extra, className)} style={style} {...rest}>
      {children}
    </button>
  );
}
