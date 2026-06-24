'use client';
import { usePathname } from 'next/navigation';
import { NAV, type NavGroupKey } from '@/lib/nav';
import { pal, cx } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { NavItem } from './NavItem';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/** เมนูข้างซ้าย — desktop: ย่อ/ขยายด้วยความกว้าง · mobile: overlay slide */
export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useI18n();

  const content = (
    <div className="w-[232px] p-3.5 overflow-auto h-full flex flex-col">
      {(Object.entries(NAV) as [NavGroupKey, typeof NAV.CONTENT][]).map(([group, items]) => (
        <div key={group} className="mb-3">
          <div className="px-3 py-2 text-[11px] font-extrabold tracking-[.14em] text-muted">{t(`group.${group}`)}</div>
          <div className="flex flex-col gap-1">
            {items.map((it) => <NavItem key={it.id} item={it} active={pathname === it.href} onNavigate={onClose} />)}
          </div>
        </div>
      ))}
      <div className="mt-auto px-3 pt-3">
        <div className="rounded-3xl p-4 text-center" style={{ background: pal('grape').soft }}>
          <div className="text-2xl mb-1">✨</div>
          <div className="font-display font-medium text-ink text-sm">12,120 {t('header.charsThisWeek')}</div>
          <div className="text-[12px] font-bold text-muted">{t('header.keepGoing')}</div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* desktop: ย่อ/ขยายด้วยความกว้าง */}
      <aside
        className="hidden md:block shrink-0 overflow-hidden border-r border-line bg-white/55 transition-[width] duration-300"
        style={{ width: open ? 232 : 0 }}
      >
        {content}
      </aside>

      {/* mobile: backdrop + overlay slide จากซ้าย */}
      <div
        className={cx('md:hidden fixed inset-0 z-50 bg-ink/30 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        onClick={onClose}
      />
      <aside
        className={cx(
          'md:hidden fixed inset-y-0 left-0 z-50 bg-white shadow-pop border-r border-line overflow-hidden transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {content}
      </aside>
    </>
  );
}
