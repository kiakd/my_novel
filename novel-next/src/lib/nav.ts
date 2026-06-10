// ============ โครงเมนู (พอร์ตจาก data.jsx NAV) ============
// label มาจาก i18n (key = `nav.${id}`) — ที่นี่เก็บแค่ id/emoji/สี/เส้นทาง
import type { ColorKey } from './theme';

export interface NavItemDef {
  id: string;
  emoji: string;
  color: ColorKey;
  href: string;
}

export type NavGroupKey = 'CONTENT' | 'SYSTEM';

export const NAV: Record<NavGroupKey, NavItemDef[]> = {
  CONTENT: [
    { id: 'read', emoji: '📚', color: 'sun', href: '/read' },
    { id: 'plot', emoji: '📝', color: 'grape', href: '/plot' },
    { id: 'characters', emoji: '👤', color: 'coral', href: '/characters' },
    { id: 'locations', emoji: '🗺️', color: 'mint', href: '/locations' },
    { id: 'relations', emoji: '🔗', color: 'bubble', href: '/relations' },
    { id: 'chapters', emoji: '📖', color: 'sky', href: '/chapters' },
    { id: 'chat', emoji: '💬', color: 'bubble', href: '/chat' },
    { id: 'timeline', emoji: '⏱️', color: 'sun', href: '/timeline' },
    { id: 'imagegen', emoji: '🖼️', color: 'lilac', href: '/imagegen' },
  ],
  SYSTEM: [
    { id: 'ailog', emoji: '📋', color: 'slate', href: '/ailog' },
    { id: 'settings', emoji: '⚙️', color: 'slate', href: '/settings' },
  ],
};

export const NAV_FLAT: NavItemDef[] = [...NAV.CONTENT, ...NAV.SYSTEM];
