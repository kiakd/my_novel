// เว็บอ่านนิยายแปล (เน้นมือถือ) + สั่งแปล/เกลาเบื้องหลัง
//
//   node server.ts                 เปิดที่ http://<ip เครื่องนี้>:8787 (มือถือในวง LAN เดียวกันเข้าได้)
//   node server.ts --port 9000
//
// หน้า:  /                 ทุกเรื่องใน library/ + อ่านถึงไหน
//        /b/<id>           สารบัญ (เรียงขึ้น/ลง, เลือกบทไปเกลา/แปลใหม่, อ่านต่อ/ล้างเริ่มใหม่)
//        /b/<id>/<n>       อ่านทีละตอน (ก่อน/ถัดไป/สารบัญ, ⚙ ขนาดตัวอักษร ธีม เกลา/แปลตอนนี้ใหม่)
// API:   GET  /api/job                                   งานล่าสุด
//        POST /api/generate {book, n}                    translate.ts --continue --book <id> --n <n>
//        POST /api/redo {book, kind, chapters}           kind=polish → --repolish --ch …, retranslate → --url <ลิงก์บท> ทีละบท
//        POST /api/cancel
//        POST /api/read {book, n, p}  /api/read-reset {book}   ตำแหน่งอ่านล่าสุด (ตอน+ย่อหน้า) → library/<id>/reading.json
// ไม่ reload หน้าให้เอง — แจ้งผ่าน popup แล้วให้ผู้อ่านกดรีโหลดเอง จะได้ไม่ขัดตอนอ่าน
// ล็อกอิน (/login, auth.ts): ไม่ล็อกอิน = อ่านอย่างเดียว ทุก API ที่เรียก AI/แก้ไฟล์ตอบ 401 · บัญชีจาก .env หรือ auth.json
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import { authConfigured, authSource, currentUser, loadDotEnv, login, logout } from './auth.ts';

loadDotEnv();
const ROOT = import.meta.dirname;
// ผู้ชมของคำขอนี้: admin = ล็อกอินแล้ว (ใช้ AI ได้) · ไม่ล็อกอิน = อ่านอย่างเดียว ตำแหน่งอ่านเก็บใน localStorage ของเครื่องตัวเอง
// NR_READONLY=1 (เช่นบน VPS ที่ไม่มี Chrome): ปิดล็อกอิน + AI ทั้งหมด ทุกคนเป็นผู้อ่าน
const READONLY = process.env.NR_READONLY === '1';
const viewer = new AsyncLocalStorage<{ user: string | null }>();
const isAdmin = () => !READONLY && !!viewer.getStore()?.user;
const LIB = join(ROOT, 'library');
// NR_TRANSLATE: ชี้ไปสคริปต์อื่นแทน translate.ts (ไว้ทดสอบหน้าเว็บโดยไม่เรียก AI จริง)
const TRANSLATE = process.env.NR_TRANSLATE ?? join(ROOT, 'translate.ts');
const argv = process.argv.slice(2);
const PORT = Number((argv.includes('--port') && argv[argv.indexOf('--port') + 1]) || process.env.PORT || 8787);
// NR_HOST=127.0.0.1 บน server ที่มี reverse proxy ข้างหน้า (ไม่เปิด port ตรงสู่เน็ต)
const HOST = process.env.NR_HOST || '0.0.0.0';

type Progress = { bookTitle: string; titleTh?: string; intro?: string; genre?: string; order: string[]; lastUrl?: string; nextUrl?: string | null; translator?: string };
type Reading = { n: number; p: number; at: number };
type Kind = 'gen' | 'polish' | 'retranslate' | 'notes' | 'fix' | 'batch';
type FixItem = { p: number; note: string; old: string; th: string | null; why: string };
// งานทั้งเรื่อง: เก็บความคืบหน้าใน library/<id>/batch.json — ยกเลิก/ปิดเครื่องแล้วกลับมาทำต่อได้
type Batch = {
  kind: 'polish' | 'retranslate' | 'notes'; from: number; to: number; done: number[]; failed: { n: number; why: string }[];
  warn: string[]; tokens: { calls: number; in: number; hit: number; out: number }; startedAt: number; finishedAt?: number; stopped?: string;
};
type Job = {
  id: number; kind: Kind; book: string; title: string; label: string; n: number; chapters: number[];
  status: 'running' | 'done' | 'error' | 'cancelled'; startedAt: number; endedAt?: number; before: number; after?: number; output: string;
  fix?: FixItem[]; fixState?: 'pending' | 'applied' | 'discarded'; // kind=fix: ข้อเสนอแก้ รอผู้อ่านยืนยัน
  batch?: Batch;
  model?: string; // โมเดลตอนเริ่มงาน (จาก settings)
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const validId = (id: string) => /^[\w-]+$/.test(id) && existsSync(join(LIB, id, 'progress.json'));
const progress = (id: string): Progress => JSON.parse(readFileSync(join(LIB, id, 'progress.json'), 'utf8'));
const chFile = (id: string, n: number, zh = false) => join(LIB, id, 'chapters', `chapter${n}${zh ? '.zh' : ''}.md`);
const bookName = (p: Progress, id: string) => p.titleTh || p.bookTitle || id;
const readingFile = (id: string) => join(LIB, id, 'reading.json');
// ตำแหน่งอ่านบน server เป็นของเจ้าของ — คนที่ไม่ล็อกอินไม่เห็น (ฝั่งเว็บใช้ localStorage แทน)
const reading = (id: string): Reading | null => {
  if (!isAdmin()) return null;
  try { return JSON.parse(readFileSync(readingFile(id), 'utf8')); } catch { return null; }
};

// จำนวนตอนที่มีไฟล์จริง (ลำดับต่อเนื่องจาก 1)
function chapterCount(id: string): number {
  let n = 0;
  while (existsSync(chFile(id, n + 1))) n++;
  return n;
}
const headOf = (f: string) => readFileSync(f, 'utf8').split('\n', 1)[0].replace(/^#\s*/, '').trim();

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'เมื่อสักครู่';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  if (m < 60 * 24) return `${Math.round(m / 60)} ชม.ที่แล้ว`;
  return `${Math.round(m / 1440)} วันที่แล้ว`;
}

function books() {
  if (!existsSync(LIB)) return [];
  return readdirSync(LIB)
    .filter(validId)
    .map((id) => {
      const p = progress(id);
      const count = chapterCount(id);
      const r = reading(id);
      return { id, p, count, r, last: count ? headOf(chFile(id, count)) : '', t: Math.max(r?.at ?? 0, statSync(join(LIB, id, 'progress.json')).mtimeMs) };
    })
    .sort((a, b) => b.t - a.t);
}

// แยกเนื้อหาเป็น chunk → ย่อหน้า (ตามรูปแบบที่ translate.ts เขียน)
// หมายเหตุสำนวนจีนท้ายบท (translate.ts เขียน): เนื้อบท แล้ว "<!-- notes -->" ตามด้วย "[^1]: …"
const NOTES_MARK = '<!-- notes -->';
function parse(f: string) {
  const [bodyText, notesText = ''] = readFileSync(f, 'utf8').split(NOTES_MARK);
  const [head, ...rest] = bodyText.split('\n');
  const chunks = rest.join('\n').split('<!-- chunk -->').map((c) => c.split('\n').map((l) => l.trim()).filter(Boolean));
  const notes = new Map<number, string>();
  for (const m of notesText.matchAll(/^\s*\[\^(\d+)\]:\s*(.+)$/gm)) notes.set(Number(m[1]), m[2].trim());
  return { head: head.replace(/^#\s*/, '').trim(), chunks, notes };
}

// ---------- job (ทีละงาน — translate.ts ใช้แท็บ Chrome เดียว) ----------
let job: Job | null = null;
let child: ChildProcess | null = null;

// คืน code + ข้อความครบของรอบนี้ (j.output เก็บแค่ท้ายๆ ไว้โชว์ตอนพัง)
function run(j: Job, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((ok) => {
    const c = spawn(process.execPath, [TRANSLATE, ...args], { cwd: ROOT, windowsHide: true });
    child = c;
    let out = '';
    const add = (d: Buffer) => { out += d.toString(); j.output = (j.output + d.toString()).slice(-8000); };
    c.stdout.on('data', add);
    c.stderr.on('data', add);
    c.on('error', (e) => { out += `\n${e.message}`; j.output += `\n${e.message}`; });
    c.on('close', (code) => { child = null; ok({ code: code ?? 1, out }); });
  });
}

// ลิงก์บทต้นทาง: ลิงก์บทล่าสุดแทนรหัสบทท้ายด้วยรหัสบทที่ต้องการ (https://…/txt/<book>/<chapterId>)
function chapterUrl(p: Progress, n: number): string | null {
  const cid = p.order[n - 1];
  return p.lastUrl && cid ? p.lastUrl.replace(/[^/]+$/, cid) : null;
}

function startJob(kind: Kind, book: string, n: number, chapters: number[], fixReq?: { p: number; note: string }[]): Job {
  const p = progress(book);
  const list = chapters.join(', ');
  const label = kind === 'gen' ? `แปลตอนใหม่ ${n} ตอน` : kind === 'polish' ? `เกลาสำนวนใหม่ ตอนที่ ${list}`
    : kind === 'fix' ? `แก้ตอนที่ ${list} · ${fixReq!.length} ย่อหน้า` : kind === 'notes' ? `หมายเหตุสำนวน ตอนที่ ${list}` : `แปลใหม่ ตอนที่ ${list}`;
  const j: Job = { id: Date.now(), kind, book, title: bookName(p, book), label, n, chapters, status: 'running', startedAt: Date.now(), before: chapterCount(book), output: '', model: readSettings().model };
  job = j;
  // kind=fix: ส่งคำขอผ่านไฟล์ (โน้ตผู้อ่านยาว/มีอักขระพิเศษ) แล้วอ่านข้อเสนอกลับจาก .out.json
  const fixDir = join(LIB, book, 'fixes');
  const fixPath = join(fixDir, `${j.id}.json`);
  if (kind === 'fix') {
    mkdirSync(fixDir, { recursive: true });
    writeFileSync(fixPath, JSON.stringify({ book, n: chapters[0], items: fixReq }, null, 2));
  }
  // สำรองคำแปลเดิมก่อนเขียนทับ (fix สำรองตอนกดยืนยัน)
  if (kind === 'polish' || kind === 'retranslate' || kind === 'notes') {
    const bak = join(LIB, book, 'chapters', '.bak');
    mkdirSync(bak, { recursive: true });
    for (const c of chapters) copyFileSync(chFile(book, c), join(bak, `chapter${c}-${j.id}.md`));
  }
  const runs = kind === 'gen' ? [['--continue', '--book', book, '--n', String(n)]]
    : kind === 'polish' ? [['--repolish', '--book', book, '--ch', chapters.join(',')]]
    : kind === 'notes' ? [['--notes', '--book', book, '--ch', chapters.join(',')]]
    : kind === 'fix' ? [['--fix', fixPath]]
    : chapters.map((c) => ['--url', chapterUrl(p, c)!]);
  (async () => {
    let ok = true;
    for (const args of runs) {
      if (j.status !== 'running') break;
      if ((await run(j, args)).code !== 0) { ok = false; break; }
    }
    j.endedAt = Date.now();
    j.after = chapterCount(book);
    if (j.status === 'cancelled') return;
    if (kind === 'fix' && ok) {
      try { j.fix = JSON.parse(readFileSync(fixPath.replace(/\.json$/, '.out.json'), 'utf8')).items; j.fixState = 'pending'; } catch { ok = false; }
    }
    j.status = ok && (kind !== 'gen' || j.after > j.before) ? 'done' : 'error';
  })();
  return j;
}

const batchFile = (id: string) => join(LIB, id, 'batch.json');
const readBatch = (id: string): Batch | null => {
  try { return JSON.parse(readFileSync(batchFile(id), 'utf8')); } catch { return null; }
};
const batchLeft = (b: Batch) => b.to - b.from + 1 - b.done.length;
const BATCH_NAME = { polish: 'เกลาสำนวนใหม่ทั้งเรื่อง', retranslate: 'แปลใหม่ทั้งเรื่อง', notes: 'หมายเหตุสำนวนทั้งเรื่อง' };
const batchName = (b: Batch) => BATCH_NAME[b.kind] ?? b.kind;

// ทั้งเรื่อง (หรือช่วงตอน): ทำทีละตอน สำรองก่อน ตรวจหลังแปล (translate.ts ตรวจให้ทุกตอนอยู่แล้ว)
// ตอนพลาด → จดไว้แล้วไปตอนถัดไป; พลาดติดกัน 3 ตอน → หยุด (มักเป็นปัญหาทั้งระบบ เช่นเครดิตหมด/Chrome ค้าง)
// resume: ข้ามตอนที่เสร็จแล้ว ลองตอนที่เคยพลาดใหม่
function startBatch(book: string, kind: Batch['kind'], from: number, to: number, resume: boolean): Job {
  const p = progress(book);
  const prev = resume ? readBatch(book) : null;
  const b: Batch = prev
    ? { ...prev, failed: [], finishedAt: undefined, stopped: undefined }
    : { kind, from, to, done: [], failed: [], warn: [], tokens: { calls: 0, in: 0, hit: 0, out: 0 }, startedAt: Date.now() };
  const save = () => writeFileSync(batchFile(book), JSON.stringify(b, null, 2));
  save();
  const j: Job = { id: Date.now(), kind: 'batch', book, title: bookName(p, book), label: batchName(b), n: 0, chapters: [], status: 'running', startedAt: Date.now(), before: chapterCount(book), output: '', batch: b, model: readSettings().model };
  job = j;
  const bak = join(LIB, book, 'chapters', '.bak');
  mkdirSync(bak, { recursive: true });
  (async () => {
    let streak = 0;
    for (let n = b.from; n <= b.to && j.status === 'running'; n++) {
      if (b.done.includes(n)) continue;
      const url = chapterUrl(p, n);
      if (!existsSync(chFile(book, n)) || (b.kind === 'retranslate' && !url)) { b.failed.push({ n, why: 'ไม่มีไฟล์หรือลิงก์ต้นทาง' }); save(); continue; }
      j.chapters = [n];
      copyFileSync(chFile(book, n), join(bak, `chapter${n}-${j.id}.md`));
      const r = await run(j, b.kind === 'retranslate' ? ['--url', url!] : [b.kind === 'polish' ? '--repolish' : '--notes', '--book', book, '--ch', String(n)]);
      if (j.status !== 'running') break; // ยกเลิกกลางตอน — ตอนนี้ยังไม่นับว่าเสร็จ
      const t = r.out.match(/token: เรียก (\d+) ครั้ง \| ขาเข้า (\d+) \(cache hit (\d+)\) \| ขาออก (\d+)/);
      if (t) { b.tokens.calls += +t[1]; b.tokens.in += +t[2]; b.tokens.hit += +t[3]; b.tokens.out += +t[4]; }
      // ผลตรวจที่เหลือแก้ไม่ได้ (⚠ ผิดรูป / ยังเหลือคำหลุด / กู-มึง) → สรุปให้ดูตอนจบ
      for (const l of r.out.split('\n')) if (/^\s+บทที่ \d+:/.test(l) && /⚠|ยังเหลือ|กู\/มึง/.test(l)) b.warn.push(l.trim());
      if (r.code === 0) { b.done.push(n); streak = 0; }
      else {
        b.failed.push({ n, why: r.out.trim().split('\n').filter(Boolean).at(-1)?.slice(0, 200) ?? `exit ${r.code}` });
        if (++streak >= 3) { b.stopped = 'พลาดติดกัน 3 ตอน — หยุดก่อนกันเปลือง (ดูสาเหตุในตอนที่พลาด)'; save(); break; }
      }
      save();
    }
    j.endedAt = Date.now();
    if (j.status === 'cancelled') { save(); return; }
    if (!b.stopped) b.finishedAt = Date.now();
    save();
    j.status = b.stopped ? 'error' : 'done';
  })();
  return j;
}

// ย่อหน้าไทยในไฟล์บท: บรรทัดที่ไม่ว่างและไม่ใช่ตัวคั่นก้อน (บรรทัดแรกคือชื่อบท) — ลำดับเดียวกับ id="p<n>" ในหน้าอ่าน
function paraLines(id: string, n: number) {
  const lines = readFileSync(chFile(id, n), 'utf8').split('\n');
  const idx: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === NOTES_MARK) break;
    if (t && t !== '<!-- chunk -->') idx.push(i);
  }
  return { lines, idx };
}

// แทนย่อหน้าที่ผู้อ่านยืนยัน — ข้ามย่อหน้าที่ถูกแก้ไปแล้วระหว่างรอ (ข้อความไม่ตรงของเดิม)
function applyFix(j: Job, accept: { p: number; th: string }[]) {
  const n = j.chapters[0];
  const { lines, idx } = paraLines(j.book, n);
  const bak = join(LIB, j.book, 'chapters', '.bak');
  mkdirSync(bak, { recursive: true });
  copyFileSync(chFile(j.book, n), join(bak, `chapter${n}-${Date.now()}.md`));
  let applied = 0, skipped = 0;
  for (const a of accept) {
    const item = j.fix?.find((f) => f.p === a.p);
    const i = idx[a.p - 1];
    const th = String(a.th ?? '').replace(/\s*\n\s*/g, ' ').trim();
    if (!item || i === undefined || !th || lines[i].trim() !== item.old) { skipped++; continue; }
    lines[i] = th;
    applied++;
  }
  writeFileSync(chFile(j.book, n), lines.join('\n'));
  j.fixState = 'applied';
  return { applied, skipped };
}

const jobView = (j: Job | null) => {
  if (!j) return null;
  const { output, ...rest } = j;
  // บรรทัด "✓ …" จาก translate.ts = ตอนที่ทำเสร็จ
  const made = j.batch ? [] : output.split('\n').filter((l) => /^[✓✗]/.test(l)).map((l) => l.trim());
  const b = j.batch;
  const label = b ? `${batchName(b)} ${b.done.length + b.failed.length}/${b.to - b.from + 1}${j.status === 'running' && j.chapters[0] ? ` · ตอนที่ ${j.chapters[0]}` : ''}` : j.label;
  return { ...rest, label: `${label} · ${modelName(j.model ?? '')}`, made, tail: j.status === 'error' ? b?.stopped ?? output.trim().split('\n').slice(-12).join('\n') : '' };
};

// ---------- หน้าเว็บ ----------
const GEAR = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const gearBtn = `<button class="ib" data-open="sheet" aria-label="ตั้งค่า">${GEAR}</button>`;

const CSS = `
:root{--fs:19px;--bg:#f4ecd8;--fg:#3b3226;--mut:#8a7d68;--card:#fbf5e6;--line:#e2d6bb;--acc:#9a5b2a;--bar:rgba(244,236,216,.96);--hl:rgba(154,91,42,.16)}
html[data-theme=light]{--bg:#ffffff;--fg:#1d1d1f;--mut:#86868b;--card:#f5f5f7;--line:#e5e5ea;--acc:#0a66d8;--bar:rgba(255,255,255,.96);--hl:rgba(10,102,216,.12)}
html[data-theme=dark]{--bg:#141416;--fg:#d7d3cb;--mut:#85817a;--card:#1f1f22;--line:#2e2e33;--acc:#e0a36a;--bar:rgba(20,20,22,.96);--hl:rgba(224,163,106,.16)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html{background:var(--bg);color-scheme:light}html[data-theme=dark]{color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--fg);font-family:'Sarabun',system-ui,-apple-system,'Segoe UI',sans-serif;-webkit-text-size-adjust:100%}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;cursor:pointer}
.wrap{max-width:720px;margin:0 auto;padding:0 16px}
.top{position:sticky;top:0;z-index:20;background:var(--bar);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding-top:env(safe-area-inset-top);transition:transform .25s}
.top .wrap{display:flex;align-items:center;gap:4px;height:52px}
.top h1{flex:1;min-width:0;font-size:16px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ib{min-width:44px;height:44px;border:0;background:none;border-radius:12px;font-size:18px;display:inline-flex;align-items:center;justify-content:center;padding:0 8px}
.ib:active{background:var(--line)}
.hide-up{transform:translateY(-110%)}.hide-down{transform:translateY(110%)}
/* index */
.list{list-style:none;margin:12px 0 40px;padding:0;display:grid;gap:10px}
.book{display:block;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.book b{display:block;font-size:18px;line-height:1.4}
.meta{color:var(--mut);font-size:14px;margin-top:6px;line-height:1.5}
.chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;background:var(--line);color:var(--fg);margin-right:6px}
.bar{height:4px;border-radius:9px;background:var(--line);margin-top:10px;overflow:hidden}.bar i{display:block;height:100%;background:var(--acc)}
/* toc */
.hero{padding:18px 0 6px}
.hero h2{margin:0;font-size:22px;line-height:1.4}
.btns{display:flex;gap:10px;margin:14px 0}
.btn{flex:1;min-height:48px;border-radius:14px;border:1px solid var(--line);background:var(--card);font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;padding:0 12px;text-align:center;line-height:1.3}
.btn.pri{background:var(--acc);border-color:var(--acc);color:#fff}
.btn:disabled{opacity:.45}
.resume{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;font-size:14px;line-height:1.6;color:var(--mut)}
.resume b{color:var(--fg);font-weight:600}
.link{background:none;border:0;padding:6px 0;color:var(--acc);font-size:14px;text-decoration:underline}
.tools{display:flex;gap:8px;margin:18px 0 0;flex-wrap:wrap}
.numin{display:flex;gap:10px;align-items:center;margin:12px 0}.numin input{width:90px;font:inherit;font-size:16px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg);text-align:center}
.tools .btn{min-height:40px;font-size:14px;font-weight:500;flex:none;padding:0 14px}
.tools .btn.on{border-color:var(--acc);color:var(--acc)}
.toc{list-style:none;margin:6px 0 60px;padding:0;display:flex;flex-direction:column}
html.rev .toc{flex-direction:column-reverse}
.toc a{display:flex;gap:12px;align-items:baseline;padding:14px 4px;border-bottom:1px solid var(--line);font-size:16px;line-height:1.45}
.toc .no{color:var(--mut);font-size:13px;min-width:34px;font-variant-numeric:tabular-nums}
.toc a.cur{color:var(--acc);font-weight:600}
.toc a.read .t{color:var(--mut)}
.toc.sel a::before{content:'';flex:none;width:22px;height:22px;border-radius:50%;border:2px solid var(--line);align-self:center}
.toc.sel a.on::before{background:var(--acc);border-color:var(--acc);box-shadow:inset 0 0 0 3px var(--card)}
.toc.sel a.on{background:var(--hl)}
.toc.sel{margin-bottom:140px}
.selbar{position:fixed;left:0;right:0;bottom:0;z-index:22;background:var(--bar);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:10px 0 calc(10px + env(safe-area-inset-bottom));transform:translateY(110%);transition:transform .25s}
.selbar.on{transform:none}
.selbar .cnt{font-size:14px;color:var(--mut);margin-bottom:8px}
.selbar .btns{margin:0}
/* reading */
.ch{padding-top:20px;padding-bottom:calc(110px + env(safe-area-inset-bottom))}
.ch h2{font-size:calc(var(--fs) * 1.2);line-height:1.5;margin:8px 0 24px}
.ch p{font-size:var(--fs);line-height:1.95;margin:0 0 1.05em;overflow-wrap:anywhere;scroll-margin-top:72px;border-radius:6px;transition:background 1.5s}
.ch p.flash{background:var(--hl)}
.zh{display:none}.showzh .zh{display:block}
p.zh,.zh p{color:var(--mut);font-size:calc(var(--fs) * .8)!important;line-height:1.7!important}
div.zh{border-left:3px solid var(--line);padding-left:10px;margin-bottom:1em}
.endnav{display:flex;gap:10px;margin-top:36px}
.bot{position:fixed;left:0;right:0;bottom:0;z-index:20;background:var(--bar);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom);transition:transform .25s}
.bot .wrap{display:flex;gap:8px;padding-top:8px;padding-bottom:8px}
.bot .btn{min-height:46px;font-size:15px}
.prog{position:fixed;left:0;top:0;height:2px;background:var(--acc);z-index:30;width:0}
/* sheet + modal */
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:40;display:none}
.scrim.on{display:block}
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:41;background:var(--card);border-radius:20px 20px 0 0;padding:10px 16px calc(20px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .25s;max-width:720px;margin:0 auto;max-height:88vh;overflow-y:auto;overscroll-behavior:contain}
.sheet.on{transform:none}
.grab{width:40px;height:5px;border-radius:9px;background:var(--line);margin:0 auto 12px}
.row{display:flex;align-items:center;gap:10px;margin:14px 0}
.row>span{width:84px;color:var(--mut);font-size:14px;flex:none}
.seg{flex:1;display:flex;gap:8px;align-items:center}
.seg .btn{font-weight:500;white-space:nowrap;padding:0 8px}
.seg .btn[data-model]{white-space:normal;line-height:1.25;padding:6px 8px;min-width:0}
.seg .btn.on{border-color:var(--acc);color:var(--acc);box-shadow:inset 0 0 0 1px var(--acc)}
.sheet hr{border:0;border-top:1px solid var(--line);margin:16px 0 4px}
.fsv{min-width:52px;text-align:center;font-variant-numeric:tabular-nums}
.sw-s{background:#f4ecd8!important;color:#3b3226!important}.sw-l{background:#fff!important;color:#1d1d1f!important}.sw-d{background:#141416!important;color:#d7d3cb!important}
.modal{position:fixed;left:16px;right:16px;top:50%;transform:translateY(-50%);z-index:41;background:var(--card);border-radius:20px;padding:22px 18px 16px;max-width:420px;margin:0 auto;display:none;box-shadow:0 20px 50px rgba(0,0,0,.3);max-height:85vh;overflow:auto}
.modal.on{display:block}
.modal h3{margin:0 0 8px;font-size:19px}
.modal p{margin:6px 0;line-height:1.6;color:var(--fg);font-size:15px}
.modal .sm{color:var(--mut);font-size:14px}
.modal pre{white-space:pre-wrap;font-size:12px;max-height:200px;overflow:auto;background:var(--bg);padding:10px;border-radius:10px;color:var(--mut)}
.stepper{display:flex;align-items:center;justify-content:center;gap:14px;margin:16px 0}
.stepper .ib{border:1px solid var(--line);font-size:22px}
.stepper b{font-size:28px;min-width:48px;text-align:center}
/* แถบงานเบื้องหลัง: ติดอยู่ใต้หัวหน้า (ย้ายเข้า .top ด้วย JS) เลื่อนตามหัวหน้า */
.pill{display:none;width:100%;border:0;border-top:1px solid var(--line);background:var(--hl);color:var(--fg);font-size:13px;line-height:1.3;padding:7px 16px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pill.on{display:block}
.pill b{color:var(--acc);font-weight:600}
.empty{color:var(--mut);text-align:center;padding:40px 0}
/* /discover */
.disc{margin-top:12px;border-color:var(--acc)}
.chips{display:flex;gap:8px;overflow-x:auto;padding:12px 0 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.chips::-webkit-scrollbar{display:none}
.chip2{flex:none;padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:var(--card);font-size:14px}
.chip2.on{background:var(--acc);border-color:var(--acc);color:#fff}
.dcard{display:flex;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px;margin:10px 0}
.dcard img{width:72px;height:96px;object-fit:cover;border-radius:8px;flex:none;background:var(--line)}
.dbody{flex:1;min-width:0}.dbody b{font-size:16px;line-height:1.4;display:block}
.dintro{font-size:14px;line-height:1.65;margin:6px 0 0;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer}
.dintro.open{display:block}
.sel{flex:1;min-width:0;font:inherit;font-size:16px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
/* /usage */
.uh{font-size:16px;margin:24px 0 8px}
.ut{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:12px}
.ut table{border-collapse:collapse;font-size:13px;min-width:100%;white-space:nowrap}
.ut th,.ut td{padding:8px 10px;text-align:right;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.ut th{color:var(--mut);font-weight:500}.ut td:first-child,.ut th:first-child{text-align:left;position:sticky;left:0;background:var(--card)}
/* หมายเหตุสำนวน: เลขยกกำลังขยายพื้นที่แตะ, รายการท้ายบท */
sup.fn{line-height:0}
sup.fn a{color:var(--acc);font-weight:600;font-size:.72em;padding:6px 4px;margin:-6px -2px}
.notes{margin-top:40px;padding-top:12px;border-top:1px solid var(--line)}
.notes h3{font-size:calc(var(--fs) * .95);margin:0 0 10px;color:var(--mut)}
.fnote{display:flex;gap:10px;font-size:calc(var(--fs) * .85);line-height:1.7;margin:0 0 10px;scroll-margin-top:72px;border-radius:6px;transition:background 1.5s}
.fnote b{color:var(--acc);min-width:18px}
.fnote.flash{background:var(--hl)}
/* โหมดแก้ไข — ช่องพิมพ์ 16px กัน iOS ซูมตอนแตะ */
html.editing .ch p[id]{cursor:pointer;box-shadow:inset 3px 0 0 var(--line);padding-left:10px}
html.editing .ch p.pick{background:var(--hl);box-shadow:inset 3px 0 0 var(--acc)}
.note textarea,.fxt{width:100%;font:inherit;font-size:16px;line-height:1.6;padding:10px;border-radius:10px;border:1px solid var(--acc);background:var(--card);color:var(--fg)}
.note textarea{margin:-6px 0 20px;resize:vertical}
.fx{border-top:1px solid var(--line);padding:12px 0}.fx.no{opacity:.6}
.fxh{display:flex;gap:8px;align-items:center;font-weight:600;font-size:14px}.fxh input{width:20px;height:20px;accent-color:var(--acc)}
.fxn{font-size:13px;color:var(--mut);margin:4px 0;line-height:1.5}
.fxo{font-size:14px;color:var(--mut);text-decoration:line-through;text-decoration-color:rgba(200,60,60,.55);margin:6px 0;line-height:1.6}
.fxt{background:var(--bg);resize:none;overflow:hidden}
/* ล็อกอิน — ช่องพิมพ์ 16px กัน iOS ซูม */
.login{max-width:420px;margin:24px auto;display:flex;flex-direction:column;gap:14px}
.login label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--mut)}
.login input{font:inherit;font-size:16px;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--fg)}
.login .err{color:#c0392b;margin:0}
`;

// ใส่ใน <head> ก่อนวาด — กันหน้ากระพริบเปลี่ยนธีม/ขนาดตัวอักษร/ลำดับสารบัญ
const HEAD_JS = `(function(){try{var d=document.documentElement,t=localStorage.getItem('nr.theme')||'sepia',f=localStorage.getItem('nr.fs');d.dataset.theme=t;if(f)d.style.setProperty('--fs',f+'px');if(localStorage.getItem('nr.zh'))d.classList.add('showzh');if(localStorage.getItem('nr.rev'))d.classList.add('rev')}catch(e){}})()`;

const APP_JS = `(function(){
var $=function(s){return document.querySelector(s)},$$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
var LS={get:function(k){try{return localStorage.getItem(k)}catch(e){return null}},set:function(k,v){try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}}};
var root=document.documentElement;
function api(u,body){return fetch(u,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}).then(function(r){return r.json()})}
function curModel(){var m=$('meta[name=nr-model]');return m?m.content:''}
function curModelName(){var id=curModel(),m=NR_MODELS.filter(function(x){return x.id===id})[0];return m?m.name:id}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function mm(ms){var s=Math.max(0,Math.round(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60);return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(s%60).padStart(2,'0')}

// ---------- sheet / modal ----------
var scrim=$('#scrim'),modal=$('#modal'),sheet=$('#sheet');
function closeAll(){$$('.sheet.on,.modal.on').forEach(function(e){e.classList.remove('on')});scrim.classList.remove('on')}
function open(el){closeAll();el.classList.add('on');scrim.classList.add('on')}
scrim.onclick=function(){if(!$('.modal.on[data-lock]'))closeAll()};
function show(html,lock){modal.innerHTML=html;if(lock)modal.setAttribute('data-lock','');else modal.removeAttribute('data-lock');open(modal);$$('#modal [data-x]').forEach(function(b){b.onclick=closeAll});$$('#modal [data-reload]').forEach(function(b){b.onclick=function(){location.reload()}})}

// ---------- ตั้งค่า (ฟันเฟือง) ----------
function fs(){return parseInt(getComputedStyle(root).getPropertyValue('--fs'))||19}
function setFs(v){v=Math.max(14,Math.min(32,v));root.style.setProperty('--fs',v+'px');LS.set('nr.fs',v);var e=$('#fsv');if(e)e.textContent=v}
function setTheme(t){root.dataset.theme=t;LS.set('nr.theme',t);var m=$('meta[name=theme-color]');if(m)m.content={sepia:'#f4ecd8',light:'#ffffff',dark:'#141416'}[t];$$('[data-th]').forEach(function(b){b.classList.toggle('on',b.dataset.th===t)})}
function setZh(on){root.classList.toggle('showzh',on);LS.set('nr.zh',on?'1':null);var b=$('#zhb');if(b)b.classList.toggle('on',on)}
if(sheet){
  var chn=sheet.dataset.n;
  sheet.innerHTML='<div class="grab"></div>'
  +'<div class="row"><span>ขนาดอักษร</span><div class="seg"><button class="btn" id="fsm">A−</button><div class="fsv" id="fsv"></div><button class="btn" id="fsp">A+</button></div></div>'
  +'<div class="row"><span>พื้นหลัง</span><div class="seg"><button class="btn sw-s" data-th="sepia">ถนอมตา</button><button class="btn sw-l" data-th="light">สว่าง</button><button class="btn sw-d" data-th="dark">มืด</button></div></div>'
  +'<div class="row"><span>ต้นฉบับ</span><div class="seg"><button class="btn" id="zhb">แสดงจีนคู่</button></div></div>'
  +(NR_USER?'<div class="row"><span>โมเดล AI</span><div class="seg">'+NR_MODELS.map(function(m){return '<button class="btn" data-model="'+m.id+'">'+m.name+'<br><small style="font-weight:400;color:var(--mut);font-size:11px">'+m.note+'</small></button>'}).join('')+'</div></div>':'')
  +(NR_RO?'':'<div class="row"><span>บัญชี</span><div class="seg">'+(NR_USER?'<form method="post" action="/logout" style="display:contents"><button class="btn" type="submit">ออกจากระบบ<br><small style="font-weight:400;color:var(--mut);font-size:11px">'+esc(NR_USER)+'</small></button></form>'
    :'<a class="btn" href="/login?next='+encodeURIComponent(location.pathname)+'">🔑 เข้าสู่ระบบเพื่อใช้ AI</a>')+'</div></div>')
  +(chn&&NR_USER?'<hr><div class="row"><span>แก้คำแปล</span><div class="seg"><button class="btn" id="edm">🛠 โหมดแก้ไข (เลือกย่อหน้า)</button></div></div>'
    +'<div class="row"><span>ทั้งตอน</span><div class="seg"><button class="btn" id="rpol">✨ เกลาสำนวนใหม่</button><button class="btn" id="rtr">↻ แปลใหม่</button></div></div>'
    +'<div class="row"><span>สำนวน</span><div class="seg"><button class="btn" id="rnot">📝 ใส่หมายเหตุสำนวนตอนนี้</button></div></div>':'');
  $('#fsv').textContent=fs();
  $('#fsm').onclick=function(){setFs(fs()-1)};$('#fsp').onclick=function(){setFs(fs()+1)};
  $$('[data-th]').forEach(function(b){b.onclick=function(){setTheme(b.dataset.th)}});
  $('#zhb').onclick=function(){setZh(!root.classList.contains('showzh'))};
  function markModel(){var cur=curModel();$$('[data-model]').forEach(function(b){b.classList.toggle('on',b.dataset.model===cur)})}
  $$('[data-model]').forEach(function(b){b.onclick=function(){api('/api/settings',{model:b.dataset.model}).then(function(r){if(r.settings){$('meta[name=nr-model]').content=r.settings.model;markModel()}})}});markModel();
  if(chn&&NR_USER){$('#rpol').onclick=function(){askRedo('polish',sheet.dataset.book,[+chn])};$('#rtr').onclick=function(){askRedo('retranslate',sheet.dataset.book,[+chn])};$('#edm').onclick=function(){closeAll();editMode(true)};$('#rnot').onclick=function(){askRedo('notes',sheet.dataset.book,[+chn])}}
  setTheme(root.dataset.theme||'sepia');setZh(root.classList.contains('showzh'));
  $$('[data-open=sheet]').forEach(function(b){b.onclick=function(){open(sheet)}});
}

// ---------- งานเบื้องหลัง: สร้างตอนใหม่ / เกลาใหม่ / แปลใหม่ ----------
var pill=$('#pill'),job=null,timer=null;
(function(){var t=$('.top');if(t)t.appendChild(pill)})();
function busy(){
  if(!(job&&job.status==='running'))return false;
  show('<h3>มีงานกำลังทำอยู่</h3><p>'+esc(job.title)+'</p><p class="sm">'+esc(job.label)+' · '+mm(Date.now()-job.startedAt)+'</p><div class="btns"><button class="btn" data-x>ปิด</button><button class="btn" id="cx">ยกเลิกงาน</button></div>');
  $('#cx').onclick=function(){api('/api/cancel',{}).then(function(){closeAll();poll()})};
  return true;
}
function askGenerate(book,title){
  if(busy())return;
  var n=parseInt(LS.get('nr.n'))||1;
  show('<h3>สร้างตอนใหม่</h3><p>'+esc(title)+'</p><p class="sm">แปลต่อจากตอนล่าสุดเบื้องหลัง อ่านต่อได้ตามปกติ เสร็จแล้วจะแจ้ง · โมเดล '+esc(curModelName())+' (เปลี่ยนที่ ⚙)</p>'
    +'<div class="stepper"><button class="ib" id="nm">−</button><b id="nv">'+n+'</b><button class="ib" id="np">+</button></div><p class="sm" style="text-align:center;margin-top:-8px">ตอน</p>'
    +'<div class="btns"><button class="btn" data-x>ยกเลิก</button><button class="btn pri" id="go">เริ่มสร้าง</button></div>');
  function sn(v){n=Math.max(1,Math.min(20,v));$('#nv').textContent=n}
  $('#nm').onclick=function(){sn(n-1)};$('#np').onclick=function(){sn(n+1)};
  $('#go').onclick=function(){LS.set('nr.n',n);start('/api/generate',{book:book,n:n})};
}
// ทั้งเรื่อง: เลือกแบบ + ช่วงตอน แล้วปล่อยทิ้งไว้ (ทำทีละตอน พลาดข้ามไปก่อน ทำต่อได้)
function askBatch(book,count){
  if(busy())return;
  var kind='retranslate';
  show('<h3>↻ ทำใหม่ทั้งเรื่อง</h3><div class="seg" style="margin:10px 0"><button class="btn on" data-k="retranslate">แปลใหม่</button><button class="btn" data-k="polish">เกลาสำนวนใหม่</button><button class="btn" data-k="notes">📝 หมายเหตุ</button></div>'
    +'<p class="sm" id="bk"></p>'
    +'<div class="numin"><span class="sm">ตอนที่</span><input id="bf" type="number" inputmode="numeric" min="1" max="'+count+'" value="1"><span class="sm">ถึง</span><input id="bt" type="number" inputmode="numeric" min="1" max="'+count+'" value="'+count+'"></div>'
    +'<p class="sm">ทำทีละตอนเบื้องหลัง สำรองไฟล์เดิมไว้ใน chapters/.bak/ ตรวจคำหลุดทุกตอน ตอนไหนพลาดข้ามไปก่อนแล้วสรุปตอนจบ พลาดติดกัน 3 ตอนจะหยุดเอง กดยกเลิกแล้วกลับมาทำต่อได้</p>'
    +'<p class="sm">⚠ คอมต้องเปิดค้างไว้ (ห้ามหลับ) และใช้ token ตามจำนวนตอน · โมเดล '+esc(curModelName())+' (เปลี่ยนที่ ⚙)</p>'
    +'<div class="btns"><button class="btn" data-x>ยกเลิก</button><button class="btn pri" id="go">เริ่ม</button></div>');
  function sk(k){kind=k;$$('#modal [data-k]').forEach(function(b){b.classList.toggle('on',b.dataset.k===k)});
    $('#bk').textContent={polish:'เอาคำแปลเดิมมาเกลาตามกฎสำนวนล่าสุด + ใส่หมายเหตุสำนวน เร็วและถูกกว่าแปลใหม่',retranslate:'แปลจากต้นฉบับใหม่ทั้งตอนตามกฎ+คลังคำล่าสุด (ได้หมายเหตุสำนวนจีนด้วย) ช้าและใช้ token มากกว่า ต้องใช้ Chrome',notes:'ใส่หมายเหตุสำนวนจีนให้ตอนที่แปลแล้วอย่างเดียว + แก้จุดที่ผิดความหมายชัดๆ ถูกที่สุด (~1/5 ของการเกลา)'}[k]}
  $$('#modal [data-k]').forEach(function(b){b.onclick=function(){sk(b.dataset.k)}});sk(kind);
  $('#go').onclick=function(){start('/api/batch',{book:book,kind:kind,from:+$('#bf').value,to:+$('#bt').value})};
}
function batchSummary(j){
  var b=j.batch,t=b.tokens;
  return '<p>✓ เสร็จ '+b.done.length+'/'+(b.to-b.from+1)+' ตอน · ใช้เวลา '+mm((j.endedAt||Date.now())-j.startedAt)+'</p>'
    +(b.stopped?'<p>⛔ '+esc(b.stopped)+'</p>':'')
    +(b.failed.length?'<p>✗ พลาด '+b.failed.length+' ตอน</p><pre>'+esc(b.failed.map(function(f){return 'ตอนที่ '+f.n+': '+f.why}).join('\\n'))+'</pre>':'')
    +(b.warn.length?'<p class="sm">ตรวจแล้วยังมีจุดที่ควรดู</p><pre>'+esc(b.warn.join('\\n'))+'</pre>':'')
    +(t.calls?'<p class="sm">token: เรียก '+t.calls+' ครั้ง · ขาเข้า '+t.in.toLocaleString()+' (cache '+t.hit.toLocaleString()+') · ขาออก '+t.out.toLocaleString()+'</p>':'');
}
function askRedo(kind,book,chs){
  if(busy())return;
  var T={polish:['✨ เกลาสำนวนใหม่','ใช้คำแปลเดิมเป็นร่าง เกลาให้ลื่นขึ้นโดยเทียบต้นฉบับ แล้วใส่หมายเหตุสำนวน (เร็ว ไม่ต้องเปิดเว็บต้นทาง)'],retranslate:['↻ แปลใหม่','แปลจากต้นฉบับใหม่ทั้งตอนผ่าน Chrome (ช้ากว่าและใช้ token มากกว่า)'],notes:['📝 หมายเหตุสำนวน','หาสำนวน/คำเปรียบจีนที่อ่านแล้วงง ใส่เลขหมายเหตุ + อธิบายท้ายตอน แก้จุดที่แปลผิดความหมายชัดๆ และจำคำเปรียบประจำเรื่องไว้ (ถูกมาก ไม่เกลาทั้งตอน)']}[kind];
  show('<h3>'+T[0]+'</h3><p>ตอนที่ '+esc(chs.join(', '))+'</p>'
    +'<p class="sm">'+T[1]+'</p>'
    +'<p class="sm">ทำเบื้องหลัง อ่านต่อได้ · คำแปลเดิมสำรองไว้ใน chapters/.bak/ · โมเดล '+esc(curModelName())+' (เปลี่ยนที่ ⚙)</p>'
    +'<div class="btns"><button class="btn" data-x>ยกเลิก</button><button class="btn pri" id="go">เริ่ม</button></div>');
  $('#go').onclick=function(){start('/api/redo',{book:book,kind:kind,chapters:chs},function(){selMode(false)})};
}
function start(url,body,after){
  var g=$('#go');if(g)g.disabled=true;
  api(url,body).then(function(r){
    if(r.error){show('<h3>เริ่มไม่ได้</h3><p>'+esc(r.error)+'</p><div class="btns"><button class="btn" data-x>ปิด</button></div>');return}
    job=r.job;closeAll();render();schedule();if(after)after();
  });
}
function render(){
  if(job&&job.status==='running'){pill.classList.add('on');pill.innerHTML='⏳ <b>'+esc(job.label)+'</b> · '+mm(Date.now()-job.startedAt)+' · แตะเพื่อดู'}
  else pill.classList.remove('on');
  $$('[data-gen]').forEach(function(b){b.textContent=job&&job.status==='running'&&job.kind==='gen'?'⏳ กำลังสร้าง…':b.dataset.label});
}
pill.onclick=busy;
// ข้อเสนอแก้จาก AI: เทียบก่อน-หลัง ติ๊กเลือก/แก้ข้อความต่อได้ แล้วค่อยเขียนลงไฟล์
function review(j){
  var rows=j.fix.map(function(f){
    var same=!f.th||f.th===f.old;
    return '<div class="fx'+(same?' no':'')+'" data-p="'+f.p+'"><label class="fxh"><input type="checkbox"'+(same?' disabled':' checked')+'> ย่อหน้าที่ '+f.p+(same?' · AI ไม่ได้แก้':'')+'</label>'
      +(f.note?'<div class="fxn">💬 '+esc(f.note)+'</div>':'')
      +'<div class="fxo">'+esc(f.old)+'</div>'
      +(same?'':'<textarea class="fxt">'+esc(f.th)+'</textarea>'+(f.why?'<div class="fxn">✓ '+esc(f.why)+'</div>':''))+'</div>';
  }).join('');
  show('<h3>🛠 ข้อเสนอแก้ ตอนที่ '+j.chapters[0]+'</h3><p class="sm">'+esc(j.title)+' · ติ๊กย่อหน้าที่จะใช้ แก้ข้อความต่อได้ก่อนกดใช้</p>'+rows
    +'<div class="btns"><button class="btn" id="fxd">ทิ้ง</button><button class="btn pri" id="fxa">ใช้ที่เลือก</button></div><button class="link" data-x>ไว้ก่อน (แสดงอีกครั้งตอนเปิดหน้าใหม่)</button>',true);
  $$('#modal .fxt').forEach(function(t){t.style.height=t.scrollHeight+4+'px';t.oninput=function(){t.style.height='auto';t.style.height=t.scrollHeight+4+'px'}});
  $('#fxd').onclick=function(){api('/api/fix-discard',{book:j.book,jobId:j.id}).then(function(){j.fixState='discarded';closeAll()})};
  $('#fxa').onclick=function(){
    var acc=$$('#modal .fx').filter(function(d){var c=d.querySelector('input');return c.checked&&!c.disabled}).map(function(d){return{p:+d.dataset.p,th:d.querySelector('textarea').value}});
    if(!acc.length)return;
    $('#fxa').disabled=true;
    api('/api/fix-apply',{book:j.book,jobId:j.id,accept:acc}).then(function(r){
      j.fixState='applied';
      show(r.error?'<h3>ใช้ไม่ได้</h3><p>'+esc(r.error)+'</p><div class="btns"><button class="btn" data-x>ปิด</button></div>'
        :'<h3>แก้แล้ว '+r.applied+' ย่อหน้า</h3>'+(r.skipped?'<p class="sm">ข้าม '+r.skipped+' ย่อหน้า (ข้อความในไฟล์เปลี่ยนไประหว่างรอ)</p>':'')
        +'<p class="sm">คำแปลเดิมสำรองไว้ใน chapters/.bak/ · กดรีโหลดเมื่อพร้อม</p><div class="btns"><button class="btn" data-x>ปิด</button><button class="btn pri" data-reload>รีโหลดเลย</button></div>');
    });
  };
}
function finished(j){
  if(j.kind==='batch'){
    if(LS.get('nr.ack')===String(j.id)||modal.classList.contains('on'))return;
    LS.set('nr.ack',String(j.id));
    var again=j.batch.failed.length||j.batch.stopped;
    show('<h3>'+(j.status==='done'?'✓ ':'')+({polish:'เกลาสำนวนใหม่ทั้งเรื่อง',retranslate:'แปลใหม่ทั้งเรื่อง',notes:'หมายเหตุสำนวนทั้งเรื่อง'}[j.batch.kind])+(j.status==='done'?' เสร็จแล้ว':' หยุดกลางทาง')+'</h3><p class="sm">'+esc(j.title)+'</p>'+batchSummary(j)
      +'<p class="sm">กดรีโหลดเมื่อพร้อม เพื่อดูคำแปลใหม่</p><div class="btns"><button class="btn" data-x>ปิด</button>'+(again?'<button class="btn pri" id="go">'+(j.batch.stopped?'ทำต่อ':'ลองตอนที่พลาดใหม่')+'</button>':'<button class="btn pri" data-reload>รีโหลดเลย</button>')+'</div>',true);
    if(again)$('#go').onclick=function(){start('/api/batch-resume',{book:j.book})};
    return;
  }
  if(j.kind==='fix'&&j.status==='done'){if(j.fixState==='pending'&&!modal.classList.contains('on'))review(j);return}
  // แจ้งครั้งเดียวต่องาน (ต่ออุปกรณ์) — ไม่ reload ให้เอง ผู้อ่านกดเอง
  if(LS.get('nr.ack')===String(j.id)||modal.classList.contains('on'))return;
  LS.set('nr.ack',String(j.id));
  var list=j.made.length?j.made.map(function(m){return '<p>'+esc(m)+'</p>'}).join(''):'';
  if(j.status==='done'&&j.kind==='gen'){
    show('<h3>สร้างตอนใหม่เสร็จแล้ว</h3><p class="sm">'+esc(j.title)+'</p>'+(list||'<p>✓ เพิ่ม '+(j.after-j.before)+' ตอน</p>')
      +'<p class="sm">กดรีโหลดหน้าเว็บเมื่อพร้อม เพื่อดูตอนใหม่</p><p style="margin-top:14px;font-weight:600">สร้างต่อไหม?</p>'
      +'<div class="btns"><button class="btn" data-x>ไว้ก่อน</button><button class="btn pri" id="go">สร้างต่ออีก '+j.n+' ตอน</button></div>'
      +'<button class="link" data-reload>รีโหลดหน้าเว็บตอนนี้</button>'
      +(location.pathname.indexOf('/b/'+j.book)===0?'':' · <a class="link" href="/b/'+esc(j.book)+'">เปิดเรื่องนี้</a>'),true);
    $('#go').onclick=function(){start('/api/generate',{book:j.book,n:j.n})};
  }else if(j.status==='done'){
    show('<h3>'+esc(j.label)+' เสร็จแล้ว</h3><p class="sm">'+esc(j.title)+'</p>'+list
      +'<p class="sm">กดรีโหลดหน้าเว็บเมื่อพร้อม เพื่อดูคำแปลใหม่</p><div class="btns"><button class="btn" data-x>ปิด</button><button class="btn pri" data-reload>รีโหลดเลย</button></div>',true);
  }else if(j.status==='error'){
    show('<h3>ทำไม่สำเร็จ</h3><p class="sm">'+esc(j.title)+' · '+esc(j.label)+'</p>'+list+'<pre>'+esc(j.tail||'-')+'</pre>'
      +'<div class="btns"><button class="btn" data-x>ปิด</button><button class="btn pri" id="go">ลองใหม่</button></div>',true);
    $('#go').onclick=function(){j.kind==='gen'?start('/api/generate',{book:j.book,n:j.n}):start('/api/redo',{book:j.book,kind:j.kind,chapters:j.chapters})};
  }
}
function poll(){return api('/api/job').then(function(r){var was=job&&job.status;job=r.job;render();if(job&&job.status!=='running'&&was!==job.status)finished(job);schedule()}).catch(schedule)}
function schedule(){clearTimeout(timer);timer=setTimeout(poll,job&&job.status==='running'?4000:15000)}
setInterval(render,1000);
$$('[data-gen]').forEach(function(b){b.dataset.label=b.textContent;b.onclick=function(){askGenerate(b.dataset.gen,b.dataset.title)}});
if(NR_USER)poll(); // ไม่ล็อกอิน = อ่านอย่างเดียว ไม่ต้องตามงาน AI

// ไม่ล็อกอิน: ตำแหน่งอ่านเก็บในเครื่องตัวเอง (ไม่ทับของเจ้าของบน server)
var myRead={get:function(b){try{return JSON.parse(LS.get('nr.r.'+b))}catch(e){return null}},set:function(b,n,p){LS.set('nr.r.'+b,JSON.stringify({n:n,p:p,at:Date.now()}))},del:function(b){LS.set('nr.r.'+b,null)}};

// ---------- หน้าอ่าน: ซ่อนแถบตอนเลื่อนลง, บันทึกย่อหน้าที่อ่านถึง ----------
var ch=$('.ch');
if(ch){
  var book=ch.dataset.book,n=+ch.dataset.n,topBar=$('.top'),bot=$('.bot'),bar=$('.prog'),ps=$$('.ch p[id]'),ticking=false,saveT=null,saved=0;
  function flash(el){el.classList.add('flash');setTimeout(function(){el.classList.remove('flash')},1600)}
  // ย่อหน้าแรกที่ยังเห็นอยู่ใต้แถบบน
  function curP(){var off=topBar.classList.contains('hide-up')?8:60;for(var i=0;i<ps.length;i++)if(ps[i].getBoundingClientRect().bottom>off+8)return i+1;return ps.length}
  function save(beacon){var p=curP();if(p===saved)return;saved=p;if(!NR_USER){myRead.set(book,n,p);return}var body=JSON.stringify({book:book,n:n,p:p});
    if(beacon&&navigator.sendBeacon)navigator.sendBeacon('/api/read',new Blob([body],{type:'application/json'}));else fetch('/api/read',{method:'POST',headers:{'content-type':'application/json'},body:body,keepalive:true}).catch(function(){})}
  if(!NR_USER){var mr=myRead.get(book);if(mr&&mr.n===n)ch.dataset.rp=mr.p}
  var target=location.hash?document.getElementById(location.hash.slice(1)):(+ch.dataset.rp>1?document.getElementById('p'+ch.dataset.rp):null);
  if(target){target.scrollIntoView({block:'start'});flash(target)}
  var ly=scrollY;
  setTimeout(function(){save()},600);
  addEventListener('scroll',function(){if(ticking)return;ticking=true;requestAnimationFrame(function(){
    var y=scrollY,max=document.documentElement.scrollHeight-innerHeight,end=y>=max-40;
    bar.style.width=(max>0?y/max*100:0)+'%';
    if(y>ly+4&&y>80&&!end){topBar.classList.add('hide-up');bot.classList.add('hide-down')}
    else if(y<ly-4||end||y<80){topBar.classList.remove('hide-up');bot.classList.remove('hide-down')}
    ly=y;ticking=false;clearTimeout(saveT);saveT=setTimeout(save,700)})},{passive:true});
  addEventListener('pagehide',function(){save(true)});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')save(true)});
  // แตะเลขหมายเหตุ = เด้งคำอธิบายสำนวน อ่านต่อที่เดิมได้เลย
  ch.addEventListener('click',function(e){
    var a=e.target.closest('[data-fn]');if(!a)return;e.preventDefault();e.stopPropagation();
    var d=document.getElementById('fn'+a.dataset.fn);
    show('<h3>หมายเหตุ '+esc(a.dataset.fn)+'</h3><p>'+esc(d?d.querySelector('span').textContent:'')+'</p><div class="btns"><button class="btn" data-x>ปิด</button></div>');
  },true);
  // แตะกลางจอ = เปิด/ปิดแถบ; โหมดแก้ไข = แตะย่อหน้าเพื่อเลือก/เลิกเลือก
  ch.addEventListener('click',function(e){
    if(e.target.closest('a,button,textarea,.note')||getSelection().toString())return;
    if(root.classList.contains('editing')){var p=e.target.closest('p[id]');if(p)pickPara(p);return}
    var h=topBar.classList.toggle('hide-up');bot.classList.toggle('hide-down',h)});
}

// ---------- โหมดแก้ไข: เลือกย่อหน้า + อธิบายว่าผิดยังไง → ส่งให้ AI เสนอแก้ ----------
function edCount(){var k=$$('.ch p.pick').length;$('#edc').textContent=k?'เลือกแล้ว '+k+' ย่อหน้า':'แตะย่อหน้าที่ผิดหรือแปลก แล้วอธิบายสั้น ๆ';$('#eds').disabled=!k}
function editMode(on){
  if(!ch)return;
  if(on&&busy())return;
  root.classList.toggle('editing',on);$('#edbar').classList.toggle('on',on);
  if(on){topBar.classList.remove('hide-up');bot.classList.add('hide-down')}else{bot.classList.remove('hide-down');$$('.ch p.pick').forEach(function(p){pickPara(p)})}
  edCount();
}
function pickPara(p){
  var on=!p.classList.contains('pick');p.classList.toggle('pick',on);
  var nx=p.nextElementSibling;while(nx&&nx.classList.contains('zh'))nx=nx.nextElementSibling;
  if(on){var d=document.createElement('div');d.className='note';d.innerHTML='<textarea rows="2" placeholder="ผิดยังไง เช่น ตัวนี้เป็นผู้หญิง ต้องใช้ &quot;เธอ&quot; / อ่านไม่รู้เรื่อง (เว้นว่างได้)"></textarea>';p.parentNode.insertBefore(d,nx);d.querySelector('textarea').focus({preventScroll:true})}
  else if(nx&&nx.classList.contains('note'))nx.remove();
  edCount();
}
if(ch)addEventListener('keydown',function(e){if(e.key==='ArrowLeft'&&ch.dataset.prev)location.href=ch.dataset.prev;if(e.key==='ArrowRight'&&ch.dataset.next)location.href=ch.dataset.next});
if(ch&&NR_USER){
  $('#edx').onclick=function(){editMode(false)};
  $('#eds').onclick=function(){
    var items=$$('.ch p.pick').map(function(p){var nx=p.nextElementSibling;while(nx&&!nx.classList.contains('note'))nx=nx.nextElementSibling;return{p:+p.id.slice(1),note:nx?nx.querySelector('textarea').value:''}});
    start('/api/fix',{book:ch.dataset.book,n:+ch.dataset.n,items:items},function(){editMode(false)});
  };
}

// ---------- หาเรื่องอ่าน: เลื่อนลงโหลดหน้าถัดไป (หน้าละ 50 เรื่อง) ----------
$$('.dintro').forEach(function(p){p.onclick=function(){p.classList.toggle('open')}});
var dl=$('#dlist');
if(dl){
  var dcat=dl.dataset.cat,dpage=1,dbusy=false,dend=false,dmore=$('#dmore'),seen={};
  var card=function(x){
    var d=document.createElement('div');d.className='dcard';
    d.innerHTML=(x.cover?'<img loading="lazy" referrerpolicy="no-referrer" alt="" src="'+esc(x.cover)+'">':'')
      +'<div class="dbody"><b>'+esc(x.title_th||x.title)+'</b><div class="meta">'+esc(x.title)+'</div>'
      +'<div class="meta">'+[x.author,x.cat,x.chapters?x.chapters+' ตอน':'',x.status].filter(Boolean).map(esc).join(' · ')+'</div>'
      +'<p class="dintro">'+esc(x.intro_th)+'</p>'
      +'<div class="btns" style="margin:10px 0 0">'+(x.inLib?'<a class="btn" href="/b/'+esc(x.id)+'">📖 อยู่ในชั้นแล้ว · อ่าน</a>':NR_USER?'<button class="btn pri" data-start>＋ เริ่มแปลเรื่องนี้</button>':'')+'</div></div>';
    var im=d.querySelector('img');if(im)im.onerror=function(){im.remove()};
    var p=d.querySelector('.dintro');p.onclick=function(){p.classList.toggle('open')};
    var s=d.querySelector('[data-start]');if(s)s.onclick=function(){askStart(x)};
    return d;
  };
  var dload=function(){
    if(dbusy||dend)return;dbusy=true;
    dmore.textContent='⏳ กำลังดึงและแปลหน้า '+dpage+'… (หน้าใหม่ใช้เวลา ~15–30 วิ)';
    api('/api/discover?cat='+dcat+'&page='+dpage).then(function(r){
      if(r.pending){setTimeout(function(){dbusy=false;dload()},3000);return}
      if(r.locked){dend=true;dmore.innerHTML=(dpage>1?'หมดรายการที่แปลไว้แล้ว':'ยังไม่มีรายการที่แปลไว้')+(NR_RO?'':'<br><small>หน้าใหม่ต้องให้ AI แปล — <a class="link" href="/login?next='+encodeURIComponent(location.pathname+location.search)+'">เข้าสู่ระบบ</a></small>');return}
      if(r.error){dmore.innerHTML='โหลดไม่สำเร็จ<br><small>'+esc(r.error)+'</small><br><button class="btn" id="dretry" style="margin:10px auto;max-width:220px">ลองใหม่</button>';$('#dretry').onclick=function(){dbusy=false;dload()};return}
      if(!r.items.length){dend=true;dmore.textContent='หมดรายการแล้ว';return}
      r.items.forEach(function(x){if(seen[x.id])return;seen[x.id]=1;dl.appendChild(card(x))});
      dpage++;dbusy=false;dmore.textContent='เลื่อนลงเพื่อโหลดหน้า '+dpage;
      if(dmore.getBoundingClientRect().top<innerHeight+300)dload(); // ยังไม่ล้นจอ → โหลดต่อเลย
    }).catch(function(){dbusy=false;dmore.textContent='เชื่อมต่อไม่ได้ — เลื่อนเพื่อลองใหม่'});
  };
  new IntersectionObserver(function(es){if(es[0].isIntersecting)dload()},{rootMargin:'600px'}).observe(dmore);
}
function askStart(x){
  if(busy())return;
  var n=3;
  show('<h3>เริ่มแปลเรื่องใหม่</h3><p><b>'+esc(x.title_th||x.title)+'</b></p><p class="sm">'+esc(x.title)+' · '+esc(x.cat)+'</p>'
    +'<div class="row"><span>นักแปล</span><select id="tsel" class="sel"><option value="">— ไม่ใช้ (กฎกลาง) —</option>'+NR_TRANSLATORS.map(function(t){return '<option>'+esc(t)+'</option>'}).join('')+'</select></div>'
    +'<div class="stepper"><button class="ib" id="nm">−</button><b id="nv">'+n+'</b><button class="ib" id="np">+</button></div><p class="sm" style="text-align:center;margin-top:-8px">ตอนแรก ๆ ที่จะแปล</p>'
    +'<p class="sm">แปลเบื้องหลังผ่าน Chrome · โมเดล '+esc(curModelName())+' (เปลี่ยนที่ ⚙) · เสร็จแล้วเรื่องจะขึ้นในชั้นหนังสือ</p>'
    +'<div class="btns"><button class="btn" data-x>ยกเลิก</button><button class="btn pri" id="go">เริ่มแปล</button></div>');
  function sn(v){n=Math.max(1,Math.min(20,v));$('#nv').textContent=n}
  $('#nm').onclick=function(){sn(n-1)};$('#np').onclick=function(){sn(n+1)};
  $('#go').onclick=function(){start('/api/start-book',{book:x.id,n:n,translator:$('#tsel').value,title_th:x.title_th,intro_th:x.intro_th,cat:x.cat})};
}

// ---------- สารบัญ: เรียง, เลือกบท, ล้างประวัติอ่าน ----------
var toc=$('.toc');
function selMode(on){
  if(!toc)return;
  toc.classList.toggle('sel',on);$('#selbar').classList.toggle('on',on);$('#selt').classList.toggle('on',on);
  $('#selt').textContent=on?'✕ เลิกเลือก':'☑ เลือกบทเกลา/แปลใหม่';
  if(!on)$$('.toc a.on').forEach(function(a){a.classList.remove('on')});
  selCount();
}
function picked(){return $$('.toc a.on').map(function(a){return +a.dataset.n}).sort(function(a,b){return a-b})}
function selCount(){var k=picked().length;$('#selc').textContent=k?'เลือกแล้ว '+k+' ตอน':'แตะตอนที่ต้องการ';$('#spol').disabled=$('#str').disabled=$('#snot').disabled=!k}
if(toc){
  var book=toc.dataset.book;
  function sortLabel(){$('#sort').textContent=root.classList.contains('rev')?'⇅ ล่าสุดก่อน':'⇅ ตอนแรกก่อน'}
  sortLabel();
  $('#sort').onclick=function(){var r=root.classList.toggle('rev');LS.set('nr.rev',r?'1':null);sortLabel()};
  if(NR_USER){
  $('#selt').onclick=function(){selMode(!toc.classList.contains('sel'))};
  toc.addEventListener('click',function(e){var a=e.target.closest('a');if(!a||!toc.classList.contains('sel'))return;e.preventDefault();
    if(!a.classList.contains('on')&&picked().length>=30)return;a.classList.toggle('on');selCount()});
  $('#spol').onclick=function(){askRedo('polish',book,picked())};
  $('#snot').onclick=function(){askRedo('notes',book,picked())};
  $('#str').onclick=function(){askRedo('retranslate',book,picked())};
  $('#ball').onclick=function(){askBatch(book,+$('#ball').dataset.count)};
  var br=$('#bres');if(br)br.onclick=function(){start('/api/batch-resume',{book:book})};
  }else{
    // ไม่ล็อกอิน: วาดตำแหน่งอ่านจาก localStorage แทนของ server
    var mr=myRead.get(book),cnt=+toc.dataset.count;
    if(mr&&mr.n>=1&&mr.n<=cnt){
      $$('.toc a').forEach(function(a){var k=+a.dataset.n;a.classList.toggle('read',k<mr.n);a.classList.toggle('cur',k===mr.n)});
      var ra=$('#resume');ra.href='/b/'+book+'/'+mr.n+'#p'+mr.p;ra.textContent='▶ อ่านต่อ ตอนที่ '+mr.n;
      var cur=$('.toc a.cur .t'),d=document.createElement('div');d.className='resume';d.id='rinfo';
      d.innerHTML='อ่านล่าสุด <b>ตอนที่ '+mr.n+' · ย่อหน้าที่ '+mr.p+'</b> (เครื่องนี้)<br>'+(cur?esc(cur.textContent):'')+'<br><button class="link" id="reset">ล้าง · เริ่มอ่านใหม่</button>';
      ra.parentNode.insertAdjacentElement('afterend',d);
    }
  }
  var rs=$('#reset');
  if(rs)rs.onclick=function(){
    show('<h3>ล้างประวัติการอ่าน?</h3><p class="sm">ลืมตำแหน่งที่อ่านค้างของเรื่องนี้ '+(NR_USER?'(ทุกอุปกรณ์)':'(เครื่องนี้)')+' แล้วเริ่มอ่านใหม่ตั้งแต่ตอนที่ 1</p><div class="btns"><button class="btn" data-x>ยกเลิก</button><button class="btn pri" id="go">ล้าง</button></div>');
    $('#go').onclick=function(){(NR_USER?api('/api/read-reset',{book:book}):(myRead.del(book),Promise.resolve())).then(function(){
      closeAll();$$('.toc a').forEach(function(a){a.classList.remove('read','cur')});
      var r=$('#resume');r.href='/b/'+book+'/1';r.textContent='▶ เริ่มอ่านตอนที่ 1';var i=$('#rinfo');if(i)i.remove()})};
  };
}
})()`;

function page(title: string, body: string) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#f4ecd8"><meta name="apple-mobile-web-app-capable" content="yes">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600&display=swap" rel="stylesheet">
<meta name="nr-model" content="${esc(readSettings().model)}">
<script>var NR_MODELS=${JSON.stringify(MODELS.map(({ id, name, note }) => ({ id, name, note })))},NR_USER=${JSON.stringify(isAdmin() ? viewer.getStore()?.user : null).replace(/</g, '\\u003c')},NR_RO=${READONLY};${HEAD_JS}</script><style>${CSS}</style></head><body>
${body}
<div class="scrim" id="scrim"></div><div class="modal" id="modal"></div><button class="pill" id="pill"></button>
<script>${APP_JS}</script></body></html>`;
}

// ---------- /login ----------
// next = หน้าที่จะกลับไปหลังล็อกอิน (รับเฉพาะ path ในเว็บนี้ กัน open redirect)
const safeNext = (s: string | null | undefined) => (s && /^\/(?![/\\])/.test(s) ? s : '/');
function loginPage(next: string, err = '', username = '') {
  return page('เข้าสู่ระบบ', `<header class="top"><div class="wrap"><a class="ib" href="${esc(next)}" aria-label="กลับ">‹</a><h1>🔑 เข้าสู่ระบบ</h1></div></header>
<main class="wrap"><form class="login" method="post" action="/login">
<p class="meta">อ่านได้ทุกคนโดยไม่ต้องล็อกอิน · ล็อกอินเพื่อใช้ AI แปล/เกลา/แก้คำแปล</p>
${err ? `<p class="err">${esc(err)}</p>` : ''}${authConfigured() ? '' : '<p class="err">ยังไม่ได้ตั้งบัญชี — ใส่ NR_AUTH_USER/NR_AUTH_PASS ใน .env หรือสร้าง auth.json</p>'}
<input type="hidden" name="next" value="${esc(next)}">
<label>อีเมล<input name="username" type="email" autocomplete="username" autocapitalize="off" required value="${esc(username)}"></label>
<label>รหัสผ่าน<input name="password" type="password" autocomplete="current-password" required></label>
<button class="btn pri" type="submit">เข้าสู่ระบบ</button></form></main>`);
}

// ---------- /usage: ค่าใช้จ่าย AI จาก library/usage.jsonl (translate.ts เขียนทุกคำขอ) ----------
// ราคา USD ต่อ 1M token — ณ 2026-10-04 (api-docs.deepseek.com/quick_start/pricing, llm-stats.com/models/gpt-6-luna) ราคาเปลี่ยนบ่อย เช็คก่อนตัดสินใจ
// DeepSeek: ช่วง peak (01-04, 06-10 UTC จ.-ศ.) ราคาเต็ม นอกนั้นครึ่งราคา
// โมเดลที่เลือกได้จาก ⚙ — บันทึกใน library/settings.json ซึ่ง translate.ts ใช้เป็นค่าเริ่มต้น (ทั้งงานจากเว็บและ command line)
// ids = ชื่อที่ API ตอบกลับ/ที่ log บันทึก (deepseek-chat ตอบเป็น deepseek-flash)
const MODELS = [
  { id: 'deepseek-chat', ids: ['deepseek-chat', 'deepseek-flash'], name: 'Flash (V4.1)', note: 'เร็ว ถูก' },
  { id: 'deepseek-v4-pro', ids: ['deepseek-v4-pro'], name: 'Pro (V4)', note: 'แปลดีกว่า แพง ~3–4×' },
  { id: 'gpt-5.6-luna', ids: ['gpt-5.6-luna'], name: 'GPT-5.6 Luna', note: 'OpenAI · ทดลอง' },
];
const settingsFile = join(LIB, 'settings.json');
const readSettings = (): { model: string } => {
  try { return { model: 'deepseek-chat', ...JSON.parse(readFileSync(settingsFile, 'utf8')) }; } catch { return { model: 'deepseek-chat' }; }
};
const modelName = (id: string) => MODELS.find((m) => m.ids.includes(id))?.name ?? id;

const PRICES = {
  deepseek: { hit: 0.006, miss: 0.30, out: 1.20 },
  deepseekPro: { hit: 0.044, miss: 1.32, out: 3.96 },
  luna: { hit: 0.01, miss: 0.10, out: 0.50 }, // GPT-6 Luna (ไว้เทียบ "ถ้าใช้ Luna")
  // GPT-5.6 Luna ณ 2026-10-11 (developers.openai.com/api/docs/models/gpt-5.6-luna) — ไม่มีช่วง peak ; ค่าเขียน cache 1.25× ไม่ได้นับ
  luna56: { hit: 0.02, miss: 0.20, out: 1.20 },
};
type UsageRow = { t: string; book: string; ch: number; mode: string; stage: string; provider: string; model?: string; ms: number; hit: number; miss: number; out: number; err?: string };
const dsPrice = (r: UsageRow) => (r.provider === 'openai' ? PRICES.luna56 : /pro/.test(r.model ?? '') ? PRICES.deepseekPro : PRICES.deepseek);
const isPeak = (t: Date) => { const d = t.getUTCDay(), h = t.getUTCHours(); return d >= 1 && d <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10)); };
const costOf = (r: UsageRow, p: { hit: number; miss: number; out: number }, peakAware: boolean) =>
  ((r.hit * p.hit + r.miss * p.miss + r.out * p.out) / 1e6) * (peakAware && r.provider !== 'openai' && !isPeak(new Date(r.t)) ? 0.5 : 1);

function usagePage() {
  const f = join(LIB, 'usage.jsonl');
  const rows: UsageRow[] = existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }) : [];
  const ok = rows.filter((r) => !r.err && (r.provider === 'deepseek' || r.provider === 'openai'));
  type Agg = { calls: number; hit: number; miss: number; out: number; ds: number; luna: number; peak: number; chapters: Set<string> };
  const agg = (key: (r: UsageRow) => string) => {
    const m = new Map<string, Agg>();
    for (const r of ok) {
      const k = key(r);
      const a = m.get(k) ?? { calls: 0, hit: 0, miss: 0, out: 0, ds: 0, luna: 0, peak: 0, chapters: new Set<string>() };
      a.calls++; a.hit += r.hit; a.miss += r.miss; a.out += r.out;
      a.ds += costOf(r, dsPrice(r), true); a.luna += costOf(r, PRICES.luna, false);
      if (r.provider !== 'openai' && isPeak(new Date(r.t))) a.peak += costOf(r, dsPrice(r), true);
      if (r.ch && (r.mode === 'new' || r.mode === 'retranslate' || r.mode === 'repolish')) a.chapters.add(`${r.book}/${r.ch}/${r.mode}`);
      m.set(k, a);
    }
    return [...m].sort((x, y) => y[1].ds - x[1].ds);
  };
  const usd = (v: number) => `$${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`;
  const kt = (v: number) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : `${Math.round(v / 1e3)}k`);
  const table = (title: string, data: [string, Agg][], label: (k: string) => string = (k) => k) => `<h3 class="uh">${title}</h3><div class="ut"><table>
<tr><th></th><th>จ่ายจริง</th><th>ถ้าใช้ Luna</th><th>เรียก</th><th>cache hit</th><th>miss</th><th>ขาออก</th></tr>
${data.map(([k, a]) => `<tr><td>${esc(label(k))}</td><td>${usd(a.ds)}</td><td>${usd(a.luna)}</td><td>${a.calls}</td><td>${kt(a.hit)}</td><td>${kt(a.miss)}</td><td>${kt(a.out)}</td></tr>`).join('')}</table></div>`;
  const total = agg(() => 'รวม')[0]?.[1];
  const names = new Map(books().map((b) => [b.id, bookName(b.p, b.id)]));
  const STAGE: Record<string, string> = { translate: 'แปลร่าง', 'translate-retry': 'แปลซ้ำ (ผลผิดรูป)', polish: 'เกลาสำนวน', 'fix-lines': 'แก้บรรทัดมีคำหลุด', 'fix-words': 'แก้คำจีนรายคำ', 'fix-para': 'โหมดแก้ไขย่อหน้า', idioms: 'หมายเหตุสำนวน', discover: 'หาเรื่องอ่าน', other: 'อื่นๆ' };
  const MODE: Record<string, string> = { new: 'แปลตอนใหม่', retranslate: 'แปลใหม่ตอนเดิม', repolish: 'เกลาใหม่', check: 'ตรวจทั้งเรื่อง', fix: 'โหมดแก้ไข', notes: 'ใส่หมายเหตุสำนวน', discover: 'หาเรื่องอ่าน', other: 'อื่นๆ' };
  const chapters = total ? total.chapters.size : 0;
  const errs = rows.filter((r) => r.err).length;
  const body = !total
    ? `<p class="empty">ยังไม่มีข้อมูล — เริ่มเก็บ log ตั้งแต่ 2026-10-04 ทุกครั้งที่แปล/เกลา/แก้ จะมาโผล่ที่นี่</p>`
    : `<div class="resume" style="margin-top:16px">รวม <b>${total.calls} คำขอ · ${chapters} ตอน</b> · ${rows[0].t.slice(0, 10)} ถึง ${rows.at(-1)!.t.slice(0, 10)}<br>
ค่าใช้จ่าย (ประมาณ) <b>${usd(total.ds)}</b> · เฉลี่ย <b>${usd(total.ds / Math.max(1, chapters))}/ตอน</b><br>
จ่ายช่วง peak ราคาเต็ม ${usd(total.peak)} (${Math.round((total.peak / Math.max(total.ds, 1e-9)) * 100)}%) · ถ้าใช้ GPT-6 Luna ราว ${usd(total.luna)}<br>
cache hit ${Math.round((total.hit / Math.max(1, total.hit + total.miss)) * 100)}% ของขาเข้า${errs ? ` · คำขอพัง ${errs} ครั้ง` : ''}</div>
${table('แยกตามโมเดล', agg((r) => r.model ?? '-'), (k) => MODELS.find((m) => m.ids.includes(k))?.name ?? k)}
${table('แยกตามขั้น', agg((r) => r.stage), (k) => STAGE[k] ?? k)}
${table('แยกตามงาน', agg((r) => r.mode), (k) => MODE[k] ?? k)}
${table('แยกตามเรื่อง', agg((r) => r.book), (k) => names.get(k) ?? k)}
${table('รายวัน (เวลาไทย)', agg((r) => new Date(new Date(r.t).getTime() + 7 * 3600e3).toISOString().slice(0, 10)).sort((a, b) => b[0].localeCompare(a[0])))}
<p class="meta">ราคาประมาณจาก token ใน log × ราคาต่อ 1M token ณ 2026-10-04 (DeepSeek Flash: hit $0.006 · miss $0.30 · out $1.20 / Pro: hit $0.044 · miss $1.32 · out $3.96 ช่วง peak, นอก peak ครึ่งราคา; GPT-5.6 Luna: cached $0.02 · in $0.20 · out $1.20 ไม่มี peak; คอลัมน์ "ถ้าใช้ Luna" = GPT-6 Luna: cached $0.01 · in $0.10 · out $0.50) — ยอดจริงดูที่หน้า billing</p>`;
  return page('ค่าใช้จ่าย AI', `<header class="top"><div class="wrap"><a class="ib" href="/" aria-label="ชั้นหนังสือ">‹</a><h1>📊 ค่าใช้จ่าย AI</h1>${gearBtn}</div></header>
<main class="wrap" style="padding-bottom:40px">${body}</main><div class="sheet" id="sheet"></div>`);
}

// ---------- /discover: หาเรื่องอ่าน (นิยายจบแล้วจาก 69shuba) ----------
// translate.ts --discover <หน้า> --cat <หมวด> ดึง+แปลชื่อ/คำโปรย → library/_discover/<หมวด>-<หน้า>.json (แคช 3 วัน)
const DISCOVER_CATS: [string, string][] = [
  ['0', 'ทั้งหมด'], ['3', 'รักโรแมนติก'], ['1', 'แฟนตาซี'], ['2', 'กำลังภายใน·เซียน'], ['11', 'ข้ามมิติ'],
  ['9', 'ชีวิตเมือง'], ['4', 'ประวัติศาสตร์·การทหาร'], ['5', 'เกม·กีฬา'], ['6', 'ไซไฟ'], ['7', 'ลึกลับ·สยองขวัญ'],
];
const CAT_TH: Record<string, string> = {
  言情小说: 'รักโรแมนติก', 玄幻魔法: 'แฟนตาซี', 修真武侠: 'กำลังภายใน·เซียน', 穿越时空: 'ข้ามมิติ', 都市小说: 'ชีวิตเมือง',
  历史军事: 'ประวัติศาสตร์', 游戏竞技: 'เกม·กีฬา', 科幻空间: 'ไซไฟ', 悬疑惊悚: 'ลึกลับ·สยองขวัญ', 同人小说: 'แฟนฟิค',
};
const STATUS_TH: Record<string, string> = { 全本: 'จบแล้ว', 连载: 'ยังไม่จบ' };
const DISCOVER_TTL = 3 * 864e5;
const discoverFile = (cat: string, page: number) => join(LIB, '_discover', `${cat}-${page}.json`);
const discovering = new Set<string>();
const discoverErr = new Map<string, string>();
const translators = () => {
  const d = join(ROOT, 'translators');
  return existsSync(d) ? readdirSync(d).filter((x) => statSync(join(d, x)).isDirectory()) : [];
};
type DiscoverItem = { id: string; title: string; title_th: string; intro: string; intro_th: string; author: string; cat: string; status: string; latest: string; cover: string };
const discoverView = (x: DiscoverItem) => ({
  id: x.id, title: x.title, title_th: x.title_th, intro_th: x.intro_th || x.intro, author: x.author, cover: x.cover,
  cat: CAT_TH[x.cat] ?? x.cat, status: STATUS_TH[x.status] ?? x.status,
  chapters: Number((x.latest.match(/第\s*(\d+)\s*章/) ?? x.latest.match(/^(\d+)/) ?? [])[1]) || 0,
  inLib: validId(x.id),
});
// มีแคช → ส่งเลย; ไม่มี → สั่งดึงเบื้องหลังแล้วตอบ pending (หน้าเว็บถามซ้ำทุก 3 วิ)
function discoverApi(cat: string, page: number) {
  const key = `${cat}-${page}`;
  const f = discoverFile(cat, page);
  // ไม่ล็อกอิน: ได้แค่แคช (เก่าเกินก็ส่ง) ห้ามสั่งดึง+แปลใหม่ เพราะเรียก AI
  if (existsSync(f) && (!isAdmin() || Date.now() - statSync(f).mtimeMs < DISCOVER_TTL)) return { items: (JSON.parse(readFileSync(f, 'utf8')).items as DiscoverItem[]).map(discoverView) };
  if (!isAdmin()) return { locked: true, items: [] };
  const err = discoverErr.get(key);
  if (err) { discoverErr.delete(key); return { error: err }; }
  if (!discovering.has(key)) {
    discovering.add(key);
    let out = '';
    const c = spawn(process.execPath, [TRANSLATE, '--discover', String(page), '--cat', cat], { cwd: ROOT, windowsHide: true });
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => {
      discovering.delete(key);
      if (code !== 0 || !existsSync(f)) discoverErr.set(key, out.trim().split('\n').slice(-3).join('\n') || `exit ${code}`);
    });
  }
  return { pending: true };
}

// เริ่มแปลเรื่องใหม่จากหน้า /discover: translate.ts --continue --book <id> หาบทแรกจากสารบัญให้เอง
// เสร็จแล้วเติมชื่อไทย/คำโปรย/หมวด ลง progress.json (translate.ts อ่าน-เขียนทั้ง object จึงไม่ทับช่องเหล่านี้)
function startNewBook(book: string, n: number, translator: string, meta: { title_th: string; intro_th: string; cat: string }): Job {
  const j: Job = { id: Date.now(), kind: 'gen', book, title: meta.title_th || book, label: `เริ่มแปลเรื่องใหม่ ${n} ตอน`, n, chapters: [], status: 'running', startedAt: Date.now(), before: chapterCount(book), output: '', model: readSettings().model };
  job = j;
  (async () => {
    const r = await run(j, ['--continue', '--book', book, '--n', String(n), ...(translator ? ['--translator', translator] : [])]);
    j.endedAt = Date.now();
    j.after = chapterCount(book);
    const pf = join(LIB, book, 'progress.json');
    if (existsSync(pf)) {
      const pr = progress(book);
      pr.titleTh ||= meta.title_th; pr.intro ||= meta.intro_th; pr.genre ||= meta.cat;
      writeFileSync(pf, JSON.stringify(pr, null, 2));
    }
    if (j.status === 'cancelled') return;
    j.status = r.code === 0 && j.after > j.before ? 'done' : 'error';
  })();
  return j;
}

function discoverPage(cat: string) {
  const chips = DISCOVER_CATS.map(([id, name]) => `<a class="chip2${id === cat ? ' on' : ''}" href="/discover?cat=${id}">${name}</a>`).join('');
  return page('หาเรื่องอ่าน', `<header class="top"><div class="wrap"><a class="ib" href="/" aria-label="ชั้นหนังสือ">‹</a><h1>🔍 หาเรื่องอ่าน · จบแล้ว</h1>${gearBtn}</div></header>
<main class="wrap"><div class="chips">${chips}</div>
<p class="meta">จาก 69shuba · ชื่อและคำโปรยแปลด้วย AI · เลื่อนลงเพื่อโหลดเพิ่ม (หน้าละ 50 เรื่อง) · แตะคำโปรยเพื่ออ่านเต็ม</p>
<div id="dlist" data-cat="${esc(cat)}"></div><div id="dmore" class="empty">…</div></main><div class="sheet" id="sheet"></div>
<script>var NR_TRANSLATORS=${JSON.stringify(translators())};</script>`);
}

function indexPage() {
  const items = books().map(({ id, p, count, r, last }) => {
    const at = r && r.n <= count ? r.n : 0;
    return `<li><a class="book" href="/b/${id}">
<b>${esc(bookName(p, id))}</b>${p.titleTh ? `<div class="meta">${esc(p.bookTitle)}</div>` : ''}
<div class="meta"><span class="chip">${count} ตอน</span>${p.translator ? esc(p.translator) : ''}</div>
<div class="meta">${at ? `📖 อ่านถึงตอนที่ ${at} ย่อหน้าที่ ${r!.p} · ${ago(r!.at)}` : 'ยังไม่ได้เริ่มอ่าน'}</div>
${last ? `<div class="meta">ล่าสุด: ${esc(last)}</div>` : ''}
${at ? `<div class="bar"><i style="width:${Math.round((at / count) * 100)}%"></i></div>` : ''}</a></li>`;
  }).join('');
  return page('ชั้นหนังสือ', `<header class="top"><div class="wrap"><h1>📚 ชั้นหนังสือ</h1>${isAdmin() ? '<a class="ib" href="/usage" aria-label="ค่าใช้จ่าย AI">📊</a>' : ''}${gearBtn}</div></header>
<main class="wrap"><a class="book disc" href="/discover"><b>🔍 หาเรื่องอ่านใหม่</b><div class="meta">นิยายจบแล้วจาก 69shuba · แปลชื่อและคำโปรยให้${isAdmin() ? ' เลือกแล้วกดเริ่มแปลได้เลย' : ''}</div></a>
${items ? `<ul class="list">${items}</ul>` : '<p class="empty">ยังไม่มีเรื่องใน library/</p>'}</main><div class="sheet" id="sheet"></div>`);
}

function tocPage(id: string) {
  const p = progress(id);
  const count = chapterCount(id);
  const name = bookName(p, id);
  const r = reading(id);
  const admin = isAdmin();
  const at = r && r.n <= count ? r.n : 0;
  const rows = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const cls = at ? (n < at ? ' class="read"' : n === at ? ' class="cur"' : '') : '';
    return `<li><a href="/b/${id}/${n}" data-n="${n}"${cls}><span class="no">${n}</span><span class="t">${esc(headOf(chFile(id, n)))}</span></a></li>`;
  }).join('');
  const resume = at
    ? `<a class="btn" id="resume" href="/b/${id}/${at}#p${r!.p}">▶ อ่านต่อ ตอนที่ ${at}</a>`
    : `<a class="btn" id="resume" href="/b/${id}/1">${count ? '▶ เริ่มอ่านตอนที่ 1' : '—'}</a>`;
  // งานทั้งเรื่องที่ค้าง (ยกเลิก/หยุด/เซิร์ฟเวอร์ปิดไป) → ปุ่มทำต่อ
  const bt = readBatch(id);
  const btRunning = job?.status === 'running' && job.kind === 'batch' && job.book === id;
  const batchInfo = bt && !bt.finishedAt && !btRunning && batchLeft(bt) > 0
    ? `<div class="resume" style="margin-top:10px">${batchName(bt)} ค้างอยู่ <b>เสร็จ ${bt.done.length}/${bt.to - bt.from + 1} ตอน</b>${bt.stopped ? `<br>${esc(bt.stopped)}` : ''}<br><button class="link" id="bres">▶ ทำต่อจากที่ค้าง</button></div>`
    : '';
  const info = at ? `<div class="resume" id="rinfo">อ่านล่าสุด <b>ตอนที่ ${at} · ย่อหน้าที่ ${r!.p}</b> · ${ago(r!.at)}<br>${esc(headOf(chFile(id, at)))}<br><button class="link" id="reset">ล้าง · เริ่มอ่านใหม่</button></div>` : '';
  return page(name, `<header class="top"><div class="wrap"><a class="ib" href="/" aria-label="ชั้นหนังสือ">‹</a><h1>${esc(name)}</h1>${gearBtn}</div></header>
<main class="wrap"><div class="hero"><h2>${esc(name)}</h2><div class="meta">${p.titleTh ? esc(p.bookTitle) + ' · ' : ''}${count} ตอน${p.genre ? ' · ' + esc(p.genre) : ''}${p.translator ? ' · ' + esc(p.translator) : ''}</div>${p.intro ? `<p class="dintro">${esc(p.intro)}</p>` : ''}</div>
<div class="btns">${resume}${admin ? `<button class="btn pri" data-gen="${id}" data-title="${esc(name)}">＋ สร้างตอนใหม่</button>` : ''}</div>
${info}
${admin ? batchInfo : ''}
<div class="tools"><button class="btn" id="sort"></button>${admin ? `<button class="btn" id="selt">☑ เลือกบทเกลา/แปลใหม่</button><button class="btn" id="ball" data-count="${count}">↻ ทั้งเรื่อง</button>` : ''}</div>
<ul class="toc" data-book="${id}" data-count="${count}">${rows || '<p class="empty">ยังไม่มีตอน</p>'}</ul></main>
${admin ? '<div class="selbar" id="selbar"><div class="wrap"><div class="cnt" id="selc"></div><div class="btns"><button class="btn" id="spol">✨ เกลาสำนวนใหม่</button><button class="btn" id="str">↻ แปลใหม่</button><button class="btn" id="snot">📝 หมายเหตุ</button></div></div></div>' : ''}
<div class="sheet" id="sheet"></div>`);
}

function chapterPage(id: string, n: number) {
  const p = progress(id);
  const count = chapterCount(id);
  const name = bookName(p, id);
  const r = reading(id);
  const th = parse(chFile(id, n));
  const zp = chFile(id, n, true);
  const zh = existsSync(zp) ? parse(zp) : null;
  // ย่อหน้าไทยมี id="p<ลำดับ>" ไว้จำ/กระโดดไปย่อหน้าที่อ่านถึง
  let k = 0;
  // [^n] → เลขยกกำลัง แตะแล้วเด้งคำอธิบาย (ไม่กระโดดไปท้ายบท)
  const fn = (s: string) => s.replace(/\[\^(\d+)\]/g, (_, d) => (th.notes.has(Number(d)) ? `<sup class="fn"><a href="#fn${d}" data-fn="${d}">${d}</a></sup>` : ''));
  const tp = (l: string) => `<p id="p${++k}">${fn(esc(l))}</p>`;
  const notes = th.notes.size
    ? `<section class="notes"><h3>หมายเหตุ</h3>${[...th.notes].map(([d, t]) => `<div class="fnote" id="fn${d}"><b>${d}</b><span>${esc(t)}</span></div>`).join('')}</section>`
    : '';
  // ย่อหน้าเท่ากัน → คู่ทีละย่อหน้า; ไม่เท่า → ต้นฉบับทั้งก้อนต่อท้าย chunk
  const body = th.chunks.map((tc, c) => {
    const zc = zh?.chunks[c] ?? [];
    if (zc.length === tc.length) return tc.map((l, j) => `${tp(l)}<p class="zh">${esc(zc[j])}</p>`).join('');
    return tc.map(tp).join('') + (zc.length ? `<div class="zh">${zc.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : '');
  }).join('');
  const prev = n > 1 ? `/b/${id}/${n - 1}` : '';
  const next = n < count ? `/b/${id}/${n + 1}` : '';
  const nextBtn = next ? `<a class="btn pri" href="${next}">ตอนถัดไป ›</a>` : isAdmin() ? `<button class="btn pri" data-gen="${id}" data-title="${esc(name)}">＋ สร้างตอนใหม่</button>` : '<button class="btn" disabled>ตอนล่าสุดแล้ว</button>';
  return page(`${th.head} · ${name}`, `<div class="prog"></div>
<header class="top"><div class="wrap"><a class="ib" href="/b/${id}" aria-label="สารบัญ">☰</a><h1>${esc(name)} <span style="color:var(--mut);font-weight:400">· ${n}/${count}</span></h1>${gearBtn}</div></header>
<main class="wrap ch" data-book="${id}" data-n="${n}" data-rp="${r?.n === n ? r.p : 0}" data-prev="${prev}" data-next="${next}">
<h2>${esc(th.head)}${zh ? `<small class="zh"> ${esc(zh.head)}</small>` : ''}</h2>${body}
${notes}
<div class="endnav">${prev ? `<a class="btn" href="${prev}">‹ ตอนก่อน</a>` : ''}${nextBtn}</div></main>
<nav class="bot"><div class="wrap">${prev ? `<a class="btn" href="${prev}">‹ ก่อน</a>` : '<button class="btn" disabled>‹ ก่อน</button>'}<a class="btn" href="/b/${id}">สารบัญ</a>${next ? `<a class="btn" href="${next}">ถัดไป ›</a>` : '<button class="btn" disabled>ถัดไป ›</button>'}</div></nav>
${isAdmin() ? '<div class="selbar" id="edbar"><div class="wrap"><div class="cnt" id="edc"></div><div class="btns"><button class="btn" id="edx">ออกโหมดแก้ไข</button><button class="btn pri" id="eds">🤖 ส่งให้ AI แก้</button></div></div></div>' : ''}
<div class="sheet" id="sheet" data-book="${id}" data-n="${n}"></div>`);
}

// ---------- http ----------
function send(res: ServerResponse, code: number, body: string, type = 'text/html; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
const json = (res: ServerResponse, v: unknown, code = 200) => send(res, code, JSON.stringify(v), 'application/json; charset=utf-8');
// JSON หรือฟอร์ม (หน้า /login) · จำกัด 1MB กันโดนยัดของใหญ่ตอนเปิดสู่เน็ต
const readBody = (req: IncomingMessage) => new Promise<any>((ok) => {
  let s = '';
  req.on('data', (d) => { s += d; if (s.length > 1e6) { s = ''; req.destroy(); } });
  req.on('end', () => {
    if (/x-www-form-urlencoded/.test(req.headers['content-type'] ?? '')) return ok(Object.fromEntries(new URLSearchParams(s)));
    try { ok(JSON.parse(s || '{}')); } catch { ok({}); }
  });
});
const redirect = (res: ServerResponse, to: string) => { res.writeHead(303, { location: to, 'cache-control': 'no-store' }); res.end(); };
const busyMsg = () => (job?.status === 'running' ? `มีงานกำลังทำอยู่: "${job.title}" ${job.label} — รอให้เสร็จก่อน` : '');

createServer((req, res) => viewer.run({ user: currentUser(req) }, () => handle(req, res))).listen(PORT, HOST, () => {
  const ips = Object.values(networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a!.address);
  console.log(`novel-reader: http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') for (const ip of ips) console.log(`  มือถือ: http://${ip}:${PORT}`);
  console.log(READONLY ? '  โหมดอ่านอย่างเดียว (NR_READONLY=1): ปิดล็อกอินและ AI' : authConfigured() ? `  ล็อกอิน: บัญชีจาก ${authSource()}` : '  ⚠ ยังไม่ได้ตั้งบัญชี (NR_AUTH_USER/NR_AUTH_PASS ใน .env หรือ auth.json) — ไม่มีใครใช้ AI ได้');
});

async function handle(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const admin = isAdmin();
    if (READONLY && (url.pathname === '/login' || url.pathname === '/logout')) return redirect(res, '/');
    if (url.pathname === '/login') {
      if (req.method === 'GET') return admin ? redirect(res, safeNext(url.searchParams.get('next'))) : send(res, 200, loginPage(safeNext(url.searchParams.get('next'))));
      if (req.method === 'POST') {
        const b = await readBody(req);
        const next = safeNext(b.next);
        const err = login(req, res, String(b.username ?? ''), String(b.password ?? ''));
        return err ? send(res, 401, loginPage(next, err, String(b.username ?? ''))) : redirect(res, next);
      }
    }
    if (req.method === 'POST' && url.pathname === '/logout') { logout(req, res); return redirect(res, '/'); }
    if (req.method === 'GET' && parts.length === 0) return send(res, 200, indexPage());
    if (req.method === 'GET' && url.pathname === '/usage') return admin ? send(res, 200, usagePage()) : redirect(res, '/login?next=/usage');
    if (req.method === 'GET' && url.pathname === '/discover') {
      const cat = url.searchParams.get('cat') ?? '0';
      return send(res, 200, discoverPage(DISCOVER_CATS.some(([id]) => id === cat) ? cat : '0'));
    }
    if (req.method === 'GET' && url.pathname === '/api/discover') {
      const cat = url.searchParams.get('cat') ?? '0', pg = Number(url.searchParams.get('page'));
      if (!DISCOVER_CATS.some(([id]) => id === cat) || !Number.isInteger(pg) || pg < 1 || pg > 2000) return json(res, { error: 'หน้าไม่ถูกต้อง' }, 400);
      return json(res, discoverApi(cat, pg));
    }
    if (req.method === 'GET' && parts[0] === 'b' && parts[1] && validId(parts[1])) {
      if (parts.length === 2) return send(res, 200, tocPage(parts[1]));
      const n = Number(parts[2]);
      if (parts.length === 3 && Number.isInteger(n) && n >= 1 && existsSync(chFile(parts[1], n))) return send(res, 200, chapterPage(parts[1], n));
    }
    if (url.pathname === '/api/job') return json(res, { job: admin ? jobView(job) : null });
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      // ไม่ล็อกอิน: ห้ามทุกอย่างที่เรียก AI/แก้ไฟล์ · /api/read ตอบ ok เฉย ๆ (ตำแหน่งอ่านเก็บฝั่งเครื่องตัวเอง)
      if (!admin) {
        if (url.pathname === '/api/read') return json(res, { ok: true, ignored: true });
        return json(res, { error: 'ต้องเข้าสู่ระบบก่อนใช้ AI' }, 401);
      }
      const b = await readBody(req);
      if (url.pathname === '/api/start-book') {
        if (busyMsg()) return json(res, { error: busyMsg() }, 409);
        const book = String(b.book ?? '');
        if (!/^\d+$/.test(book)) return json(res, { error: 'รหัสเรื่องไม่ถูกต้อง' }, 400);
        if (validId(book)) return json(res, { error: 'เรื่องนี้อยู่ในชั้นหนังสือแล้ว — ใช้ปุ่มสร้างตอนใหม่ในสารบัญ' }, 409);
        const translator = String(b.translator ?? '');
        if (translator && !translators().includes(translator)) return json(res, { error: 'ไม่มีนักแปลนี้' }, 400);
        const n = Math.max(1, Math.min(20, Number(b.n) || 3));
        const str = (v: unknown) => String(v ?? '').slice(0, 2000);
        return json(res, { job: jobView(startNewBook(book, n, translator, { title_th: str(b.title_th), intro_th: str(b.intro_th), cat: str(b.cat) })) });
      }
      if (url.pathname === '/api/settings') {
        if (!MODELS.some((m) => m.id === b.model)) return json(res, { error: 'ไม่รู้จักโมเดลนี้' }, 400);
        writeFileSync(settingsFile, JSON.stringify({ ...readSettings(), model: b.model }, null, 2));
        return json(res, { ok: true, settings: readSettings() });
      }
      if (url.pathname === '/api/cancel') {
        if (job?.status === 'running') { job.status = 'cancelled'; child?.kill(); }
        return json(res, { job: jobView(job) });
      }
      if (typeof b.book !== 'string' || !validId(b.book)) return json(res, { error: 'ไม่พบเรื่องนี้' }, 400);
      const count = chapterCount(b.book);
      if (url.pathname === '/api/read') {
        const n = Number(b.n), p = Number(b.p);
        if (!Number.isInteger(n) || n < 1 || n > count || !Number.isInteger(p) || p < 1) return json(res, { error: 'ตำแหน่งไม่ถูกต้อง' }, 400);
        writeFileSync(readingFile(b.book), JSON.stringify({ n, p, at: Date.now() }));
        return json(res, { ok: true });
      }
      if (url.pathname === '/api/read-reset') {
        rmSync(readingFile(b.book), { force: true });
        return json(res, { ok: true });
      }
      if (url.pathname === '/api/generate') {
        if (busyMsg()) return json(res, { error: busyMsg() }, 409);
        if (!progress(b.book).nextUrl) return json(res, { error: 'เรื่องนี้ไม่มีลิงก์ตอนถัดไปที่บันทึกไว้ (อาจจบแล้ว หรือต้องแปลผ่าน --url ก่อน)' }, 400);
        return json(res, { job: jobView(startJob('gen', b.book, Math.max(1, Math.min(20, Number(b.n) || 1)), [])) });
      }
      if (url.pathname === '/api/redo') {
        if (busyMsg()) return json(res, { error: busyMsg() }, 409);
        const kind = b.kind === 'polish' || b.kind === 'retranslate' || b.kind === 'notes' ? (b.kind as 'polish' | 'retranslate' | 'notes') : null;
        const chs = [...new Set<number>((Array.isArray(b.chapters) ? b.chapters : []).map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= count).sort((x, y) => x - y);
        if (!kind || !chs.length || chs.length > 30) return json(res, { error: 'เลือกตอน 1–30 ตอน' }, 400);
        if (kind === 'retranslate') {
          const p = progress(b.book);
          if (chs.some((n) => !chapterUrl(p, n))) return json(res, { error: 'ไม่มีลิงก์ต้นทางของตอนนี้ (progress.json ไม่มี lastUrl)' }, 400);
        }
        return json(res, { job: jobView(startJob(kind, b.book, 0, chs)) });
      }
      if (url.pathname === '/api/batch' || url.pathname === '/api/batch-resume') {
        if (busyMsg()) return json(res, { error: busyMsg() }, 409);
        if (url.pathname === '/api/batch-resume') {
          if (!readBatch(b.book)) return json(res, { error: 'ไม่มีงานค้าง' }, 400);
          return json(res, { job: jobView(startBatch(b.book, 'retranslate', 0, 0, true)) });
        }
        const kind = b.kind === 'polish' || b.kind === 'notes' ? (b.kind as 'polish' | 'notes') : 'retranslate';
        const from = Math.max(1, Number(b.from) || 1), to = Math.min(count, Number(b.to) || count);
        if (from > to) return json(res, { error: 'ช่วงตอนไม่ถูกต้อง' }, 400);
        if (kind === 'retranslate' && !progress(b.book).lastUrl) return json(res, { error: 'ไม่มีลิงก์ต้นทาง (progress.json ไม่มี lastUrl)' }, 400);
        return json(res, { job: jobView(startBatch(b.book, kind, from, to, false)) });
      }
      if (url.pathname === '/api/fix') {
        if (busyMsg()) return json(res, { error: busyMsg() }, 409);
        const n = Number(b.n);
        if (!Number.isInteger(n) || n < 1 || n > count) return json(res, { error: 'ไม่พบตอนนี้' }, 400);
        const total = paraLines(b.book, n).idx.length;
        const items = (Array.isArray(b.items) ? b.items : [])
          .map((it: any) => ({ p: Number(it?.p), note: String(it?.note ?? '').slice(0, 500) }))
          .filter((it: { p: number }) => Number.isInteger(it.p) && it.p >= 1 && it.p <= total);
        if (!items.length || items.length > 40) return json(res, { error: 'เลือกย่อหน้า 1–40 ย่อหน้า' }, 400);
        return json(res, { job: jobView(startJob('fix', b.book, 0, [n], items)) });
      }
      if (url.pathname === '/api/fix-apply' || url.pathname === '/api/fix-discard') {
        if (!job || job.id !== Number(b.jobId) || job.kind !== 'fix' || job.fixState !== 'pending') return json(res, { error: 'ไม่มีข้อเสนอแก้ที่รอยืนยัน (อาจใช้/ทิ้งไปแล้ว)' }, 409);
        if (url.pathname === '/api/fix-discard') { job.fixState = 'discarded'; return json(res, { ok: true }); }
        return json(res, applyFix(job, Array.isArray(b.accept) ? b.accept.map((a: any) => ({ p: Number(a?.p), th: String(a?.th ?? '') })) : []));
      }
    }
    send(res, 404, page('ไม่พบหน้า', '<main class="wrap"><p class="empty">ไม่พบหน้านี้ — <a href="/" style="color:var(--acc)">กลับชั้นหนังสือ</a></p></main>'));
  } catch (e) {
    // stack ให้เจ้าของดูเท่านั้น — คนทั่วไปเห็นแค่ข้อความสั้น
    console.error(e);
    if (!res.headersSent) send(res, 500, isAdmin() ? `<pre>${esc(String((e as Error).stack ?? e))}</pre>` : 'เกิดข้อผิดพลาด', isAdmin() ? undefined : 'text/plain; charset=utf-8');
  }
}
