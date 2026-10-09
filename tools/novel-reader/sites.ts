// Site adapters — เพิ่มเว็บใหม่ = เพิ่ม object ใน SITES (pattern เดียวกันหมด)
import type { Page } from './cdp-page.ts';

export type Chapter = {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  title: string;
  paragraphs: string[];
  nextUrl: string | null;
};

export type Site = {
  name: string;
  match: (url: string) => boolean;
  contentSelector: string; // รอ selector นี้ = หน้าโหลดเสร็จ / ผ่าน Cloudflare แล้ว
  extract: (page: Page) => Promise<Chapter>;
  firstChapter?: (page: Page, bookId: string) => Promise<string | null>; // เรื่องใหม่: หาลิงก์บทแรกจากสารบัญ
};

// หา link "บทถัดไป" จากข้อความปุ่ม — ใช้ได้กับเว็บจีนส่วนใหญ่
async function findNext(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const a = [...document.querySelectorAll('a')].find((x) => /下一[章页]/.test(x.textContent ?? ''));
    const href = a?.href ?? null;
    return href && !/\/book\/|\.htm$|javascript/.test(href) ? href : null;
  });
}

const shuba69: Site = {
  name: '69shuba',
  match: (u) => /69shu(ba)?\.(com|cx|pro)/.test(u),
  contentSelector: '.txtnav',
  async extract(page) {
    const url = page.url();
    const [, bookId = 'unknown', chapterId = String(Date.now())] = url.match(/\/txt\/(\d+)\/(\d+)/) ?? [];
    const data = await page.evaluate(() => {
      const nav = document.querySelector('.txtnav')!.cloneNode(true) as HTMLElement;
      nav.querySelectorAll('h1, .txtinfo, #txtright, .contentadv, .bottom-ad, .txtcenter, script, style').forEach((e) => e.remove());
      const crumbs = [...document.querySelectorAll('a[href*="/book/"]')].map((a) => a.textContent?.trim() ?? '');
      return {
        title: document.querySelector('.txtnav h1, h1')?.textContent?.trim() ?? '',
        bookTitle: crumbs.find((t) => t.length > 1) ?? '',
        text: nav.innerText,
      };
    });
    const paragraphs = data.text
      .split(/\n+/)
      .map((s) => s.replace(/^[\s　]+|\s+$/g, ''))
      .filter((s) => s && s !== data.title && !/^(\(本章完\)|本章未完)/.test(s));
    return { bookId, chapterId, bookTitle: data.bookTitle, title: data.title, paragraphs, nextUrl: await findNext(page) };
  },
  async firstChapter(page, bookId) {
    await page.goto(`https://www.69shuba.com/book/${bookId}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`a[href*="/txt/${bookId}/"]`, { timeout: 60_000 }).catch(() => null);
    // สารบัญเว็บนี้เรียงตอนล่าสุดขึ้นก่อน (ตอน 448 → 1) — ห้ามหยิบลิงก์แรก (เคยได้ตอนท้ายสุด/ตอนพิเศษ)
    // เลือกลิงก์ที่เลขตอน "第N章" น้อยสุด ; ไม่มีเลขตอน → รหัสบทน้อยสุด (รหัสเรียงตามลำดับที่ลง)
    return page.evaluate((id) => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>(`a[href*="/txt/${id}/"]`)].map((a) => ({
        href: a.href,
        no: Number(a.textContent?.match(/第\s*(\d+)\s*章/)?.[1] ?? NaN),
        cid: Number(a.href.match(/\/txt\/\d+\/(\d+)/)?.[1] ?? NaN),
      }));
      const numbered = links.filter((l) => l.no > 0).sort((a, b) => a.no - b.no || a.cid - b.cid);
      return (numbered[0] ?? links.filter((l) => l.cid > 0).sort((a, b) => a.cid - b.cid)[0])?.href ?? null;
    }, bookId);
  },
};

// fallback: เว็บที่ยังไม่มี adapter — เอา block ข้อความที่ยาวที่สุด
const generic: Site = {
  name: 'generic',
  match: () => true,
  contentSelector: 'body',
  async extract(page) {
    const url = new URL(page.url());
    const data = await page.evaluate(() => {
      let best: HTMLElement = document.body;
      let bestLen = 0;
      document.querySelectorAll<HTMLElement>('div, article, section').forEach((el) => {
        const direct = [...el.childNodes].filter((n) => n.nodeType === 3 || (n as HTMLElement).tagName === 'P' || (n as HTMLElement).tagName === 'BR');
        const len = direct.reduce((s, n) => s + (n.textContent?.length ?? 0), 0);
        if (len > bestLen) { bestLen = len; best = el; }
      });
      return { title: document.querySelector('h1')?.textContent?.trim() ?? document.title, text: best.innerText };
    });
    return {
      bookId: url.hostname + url.pathname.split('/').slice(0, -1).join('_'),
      bookTitle: '',
      chapterId: url.pathname.split('/').pop()?.replace(/\.\w+$/, '') || String(Date.now()),
      title: data.title,
      paragraphs: data.text.split(/\n+/).map((s) => s.trim()).filter(Boolean),
      nextUrl: await findNext(page),
    };
  },
};

export const SITES: Site[] = [shuba69, generic];
export const siteFor = (url: string) => SITES.find((s) => s.match(url))!;
