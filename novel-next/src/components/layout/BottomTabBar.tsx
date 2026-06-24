'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { pal } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import type { ColorKey } from '@/lib/theme';

// แท็บหลัก 4 ช่อง (พอร์ตจาก NAV) + ปุ่ม "เพิ่ม" เปิดลิ้นชักเมนูเต็ม
const TABS: { id: string; emoji: string; href: string; color: ColorKey }[] = [
  { id: 'read', emoji: '📚', href: '/read', color: 'sun' },
  { id: 'plot', emoji: '📝', href: '/plot', color: 'grape' },
  { id: 'chapters', emoji: '📖', href: '/chapters', color: 'sky' },
  { id: 'chat', emoji: '💬', href: '/chat', color: 'bubble' },
];

/** แถบแท็บล่าง — มือถือเท่านั้น (md:hidden) · เมนูที่เหลืออยู่ใน "เพิ่ม" → เปิดลิ้นชัก */
export function BottomTabBar({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex bg-white/95 backdrop-blur border-t border-line shadow-[0_-4px_20px_rgba(74,65,56,.06)] pb-[env(safe-area-inset-bottom)]">
      {TABS.map((tb) => {
        const active = pathname === tb.href;
        const P = pal(tb.color);
        return (
          <Link key={tb.id} href={tb.href} className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 active:scale-95 transition">
            <span className="h-8 w-12 grid place-items-center text-[19px] rounded-xl transition" style={active ? { background: P.soft } : undefined}>{tb.emoji}</span>
            <span className="text-[11px] font-extrabold" style={{ color: active ? P.c : '#988C7C' }}>{t(`nav.${tb.id}`)}</span>
          </Link>
        );
      })}
      <button onClick={onMore} className="flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 active:scale-95 transition">
        <span className="h-8 w-12 grid place-items-center text-[19px] text-muted">⋯</span>
        <span className="text-[11px] font-extrabold text-muted">{t('nav.more')}</span>
      </button>
    </nav>
  );
}
