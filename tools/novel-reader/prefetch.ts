// ดึงต้นฉบับทั้งเรื่องล่วงหน้า (ยังไม่แปล) → library/<เรื่อง>/raw/<รหัสบท>.json + raw/index.json (ลำดับบท)
// แยกการดึงออกจากการแปล: ดึงหลายบทพร้อมกันได้, เก็บคำศัพท์ทั้งเรื่องก่อนแปลได้, แปลหลายช่วงพร้อมกันได้
//
//   node prefetch.ts --book 45305 [--from <รหัสบท>] [--workers 3]
//   --from: เริ่มหลังรหัสบทนี้ (ไม่ใส่ = ต่อจากบทสุดท้ายใน progress.json)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpPage } from './http-page.ts';
import { siteFor } from './sites.ts';

const argv = process.argv.slice(2);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const book = opt('--book') ?? process.exit(console.error('ต้องใส่ --book') ?? 1);
const WORKERS = Number(opt('--workers') ?? 3);
const DIR = join(import.meta.dirname, 'library', book);
const RAW = join(DIR, 'raw');
mkdirSync(RAW, { recursive: true });

// สารบัญ 69shuba: ลิงก์ /txt/<เรื่อง>/<รหัสบท> ทุกบท — รหัสบทเรียงตามลำดับที่ลง (สารบัญแสดงล่าสุดก่อน จึงต้องเรียงเอง)
const toc = new HttpPage();
await toc.goto(`https://www.69shuba.com/book/${book}/`, { waitUntil: 'domcontentloaded' });
const links: { cid: string; title: string }[] = await toc.evaluate((id: string) => {
  const seen = new Set<string>();
  return [...document.querySelectorAll<HTMLAnchorElement>(`a[href*="/txt/${id}/"]`)].flatMap((a) => {
    const cid = a.getAttribute('href')?.match(/\/txt\/\d+\/(\d+)/)?.[1];
    if (!cid || seen.has(cid)) return [];
    seen.add(cid);
    return [{ cid, title: a.textContent?.trim() ?? '' }];
  });
}, book);
links.sort((a, b) => Number(a.cid) - Number(b.cid));

const prog = existsSync(join(DIR, 'progress.json')) ? JSON.parse(readFileSync(join(DIR, 'progress.json'), 'utf8')) : { order: [] };
const after = opt('--from') ?? prog.order.at(-1);
const start = after ? links.findIndex((l) => Number(l.cid) > Number(after)) : 0;
const todo = start < 0 ? [] : links.slice(start);
writeFileSync(join(RAW, 'index.json'), JSON.stringify({ at: Date.now(), after, chapters: todo }, null, 1));
console.log(`สารบัญ ${links.length} บท · ต้องดึง ${todo.length} บท (หลังรหัส ${after ?? '-'})`);

let done = 0, failed = 0;
const queue = todo.filter((l) => !existsSync(join(RAW, `${l.cid}.json`)));
async function worker() {
  const page = new HttpPage();
  for (let l = queue.shift(); l; l = queue.shift()) {
    const url = `https://www.69shuba.com/txt/${book}/${l.cid}`;
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        const ch = await siteFor(url)!.extract(page);
        if (!ch.paragraphs.length) throw new Error('ว่าง');
        writeFileSync(join(RAW, `${l.cid}.json`), JSON.stringify({ url, cid: l.cid, title: ch.title, paragraphs: ch.paragraphs }));
        ok = true;
      } catch (e) {
        if (attempt === 3) { failed++; console.error(`✗ ${l.cid} ${l.title}: ${(e as Error).message}`); }
        else await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    if (ok && ++done % 50 === 0) console.log(`ดึงแล้ว ${done}/${queue.length + done}`);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));
console.log(`เสร็จ: ดึงใหม่ ${done} บท · ล้มเหลว ${failed} · รวมใน raw ${todo.filter((l) => existsSync(join(RAW, `${l.cid}.json`))).length}/${todo.length}`);
