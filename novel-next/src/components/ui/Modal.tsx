'use client';
import { useEffect, type ReactNode } from 'react';
import { cx } from '@/lib/theme';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** มือถือ (max-md) เต็มจอเหมือนเปิดหน้าใหม่ · จอใหญ่ยังเป็น popup กลาง */
  mobileFull?: boolean;
}

const WIDTHS = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

/** modal กลางจอ + backdrop เบลอ + ปิดด้วย Esc */
export function Modal({ open, onClose, children, size = 'md', mobileFull }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className={cx('fixed inset-0 z-50 grid place-items-center animate-fadein', mobileFull ? 'p-0 md:p-4' : 'p-4')}>
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[3px]" onClick={onClose} />
      <div
        className={cx(
          'relative w-full bg-cream shadow-pop overflow-auto anim-pop rounded-5xl border-2 border-white max-h-[90vh]',
          WIDTHS[size],
          mobileFull && 'max-md:max-w-none max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:rounded-none max-md:border-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}
