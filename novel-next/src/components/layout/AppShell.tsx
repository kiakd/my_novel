'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';

const LS_NAV_OPEN = 'ns_nav_open';

/** เฟรมหลัก: header + sidebar (เปิดปิดได้) + พื้นที่เนื้อหา */
export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  // ดีฟอลต์: เปิดบนจอใหญ่ / ปิดบนมือถือ — เคารพค่าที่เคยตั้ง
  useEffect(() => {
    const saved = localStorage.getItem(LS_NAV_OPEN);
    if (saved === '1') setNavOpen(true);
    else if (saved === '0') setNavOpen(false);
    else setNavOpen(window.matchMedia('(min-width: 768px)').matches);
  }, []);

  const toggle = () => setNavOpen((v) => {
    const n = !v;
    try { localStorage.setItem(LS_NAV_OPEN, n ? '1' : '0'); } catch { /* ignore */ }
    return n;
  });

  return (
    <div className="h-screen flex flex-col">
      <Header onToggleNav={toggle} />
      <div className="flex-1 min-h-0 flex">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <main className="flex-1 min-w-0 overflow-auto p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">{children}</main>
      </div>
      {/* มือถือ: แถบแท็บล่าง · "เพิ่ม" เปิดลิ้นชักเมนูเต็ม */}
      <BottomTabBar onMore={() => setNavOpen(true)} />
    </div>
  );
}
