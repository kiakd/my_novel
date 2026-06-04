'use client';
import type { ReactNode } from 'react';
import { cx } from '@/lib/theme';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}

/** แผงเลื่อนจากขวา */
export function Drawer({ open, onClose, children, width = 440 }: DrawerProps) {
  return (
    <div className={cx('fixed inset-0 z-50', !open && 'pointer-events-none')}>
      <div
        className={cx('absolute inset-0 bg-ink/30 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <div
        className="absolute top-0 right-0 h-full max-w-[92vw] bg-cream shadow-pop border-l-2 border-line overflow-auto transition-transform duration-300"
        style={{ width, transform: open ? 'translateX(0)' : 'translateX(100%)' }}
      >
        {children}
      </div>
    </div>
  );
}
