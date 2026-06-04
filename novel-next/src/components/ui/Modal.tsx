'use client';
import { useEffect, type ReactNode } from 'react';
import { cx } from '@/lib/theme';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const WIDTHS = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

/** modal กลางจอ + backdrop เบลอ + ปิดด้วย Esc */
export function Modal({ open, onClose, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 animate-fadein">
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[3px]" onClick={onClose} />
      <div className={cx('relative w-full bg-cream rounded-5xl shadow-pop border-2 border-white max-h-[90vh] overflow-auto anim-pop', WIDTHS[size])}>
        {children}
      </div>
    </div>
  );
}
