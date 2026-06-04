'use client';
import Link from 'next/link';
import { pal, cx } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import type { NavItemDef } from '@/lib/nav';

interface NavItemProps {
  item: NavItemDef;
  active: boolean;
  onNavigate?: () => void;  // ปิด overlay sidebar บนมือถือหลังคลิก
}

/** ปุ่มเมนูข้าง 1 ชิ้น */
export function NavItem({ item, active, onNavigate }: NavItemProps) {
  const { t } = useI18n();
  const P = pal(item.color);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cx(
        'w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 font-bold text-[15px] transition-all duration-150 active:scale-[.98]',
        !active && 'hover:bg-ink/[.05]',
      )}
      style={active ? { background: P.c, color: '#fff', boxShadow: `0 5px 14px -5px ${P.c}` } : { color: '#6f6555' }}
    >
      <span
        className={cx('h-8 w-8 rounded-xl grid place-items-center text-base transition', active && 'scale-110')}
        style={{ background: active ? 'rgba(255,255,255,.25)' : P.soft }}
      >
        {item.emoji}
      </span>
      {t(`nav.${item.id}`)}
    </Link>
  );
}
