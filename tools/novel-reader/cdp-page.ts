// คุมแท็บเดียวผ่าน CDP ตรงๆ (แทน Playwright connectOverCDP)
// เหตุผล: Playwright ต่อทั้ง browser แล้ว attach ทุกแท็บ — แท็บใดแท็บหนึ่งค้าง (เว็บนิยายบางเว็บจงใจให้ JS วนเมื่อเจอเครื่องมือ)
// ก็ต่อไม่ได้ทั้งตัว → ที่นี่ต่อเฉพาะ websocket ของแท็บเรา แท็บอื่นค้างก็ไม่เกี่ยว
// ไม่เรียก Runtime.enable (ไม่ดัก console) — ลดโอกาสสคริปต์ในหน้าเว็บจับได้
// API เท่าที่ translate.ts / sites.ts ใช้: goto, url, title, evaluate, waitForSelector

type Target = { id: string; type: string; url: string; webSocketDebuggerUrl?: string };

export const listTabs = (port: string): Promise<Target[]> =>
  fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json() as Promise<Target[]>).then((l) => l.filter((t) => t.type === 'page'));

// ตอบคำสั่งภายในเวลาที่กำหนดไหม (แท็บที่ JS วนค้าง จะไม่รับคำสั่งใดๆ เลย ใช้ซ้ำไม่ได้)
export function responsive(t: Target, ms = 3000): Promise<boolean> {
  return new Promise((done) => {
    const ws = new WebSocket(t.webSocketDebuggerUrl!);
    const timer = setTimeout(() => { ws.close(); done(false); }, ms);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: '1' } }));
    ws.onmessage = () => { clearTimeout(timer); ws.close(); done(true); };
    ws.onerror = () => { clearTimeout(timer); done(false); };
  });
}

export class CdpPage {
  readonly targetId: string;
  private ws!: WebSocket;
  private seq = 0;
  private pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  private listeners = new Set<(method: string, params: any) => void>();
  private _url: string;

  private constructor(t: Target) { this._url = t.url; this.targetId = t.id; }

  // แท็บใหม่ของเราเอง — เปิดเบื้องหลัง ไม่สลับแท็บที่ผู้ใช้อ่านอยู่ (Target.createTarget ทำที่ browser process ไม่แตะแท็บอื่น)
  static async open(port: string): Promise<CdpPage> {
    const { webSocketDebuggerUrl } = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
    const bws = new WebSocket(webSocketDebuggerUrl);
    await new Promise((ok, bad) => { bws.onopen = ok; bws.onerror = () => bad(new Error('ต่อ Chrome ไม่ได้')); });
    const targetId: string = await new Promise((ok, bad) => {
      bws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.id === 1) m.error ? bad(new Error(m.error.message)) : ok(m.result.targetId); };
      bws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank', background: true } }));
    });
    bws.close();
    const t = (await listTabs(port)).find((x) => x.id === targetId);
    if (!t?.webSocketDebuggerUrl) throw new Error('เปิดแท็บใหม่ไม่ได้');
    return CdpPage.own(t);
  }

  // แท็บของตัวแปล (ใหม่หรือใช้ซ้ำ) — ปิด JS ของหน้าเว็บทุกครั้ง
  static async own(t: Target): Promise<CdpPage> {
    const p = await CdpPage.attach(t);
    // ปิด JS ของหน้าเว็บในแท็บเรา: เนื้อบทมากับ HTML อยู่แล้ว — สคริปต์ในหน้า (โฆษณา/กันบอท) คือตัวทำให้แท็บวนค้าง
    // (บท 2 ของ 46066 ค้างทุกครั้งตอนเปิด JS → ปิดแล้วโหลด 0.4 วิ) ; Runtime.evaluate ของเรายังทำงานได้
    // ช้าได้ถ้า renderer ของเว็บเดียวกันถูกแท็บค้างแท็บอื่นกินอยู่ (Chrome รวมแท็บเว็บเดียวกันไว้ process เดียว) → ไม่ถึงกับล้ม
    await p.setScripts(false).catch(() => console.error('ปิด JS ในแท็บไม่ทัน — ทำต่อแบบเปิด JS (ถ้ามีแท็บเว็บเดียวกันค้างอยู่ ปิดทิ้งจะเร็วขึ้น)'));
    return p;
  }

  // หน้า Cloudflare ต้องใช้ JS ยืนยัน → เปิดกลับเฉพาะตอนนั้น
  setScripts(enabled: boolean): Promise<void> {
    return this.send('Emulation.setScriptExecutionDisabled', { value: !enabled }, 30_000).then(() => {});
  }

  // ใช้แท็บที่มีอยู่ (โหมดแปลแท็บที่ผู้ใช้เปิดค้างไว้)
  static async attach(t: Target): Promise<CdpPage> {
    const p = new CdpPage(t);
    p.ws = new WebSocket(t.webSocketDebuggerUrl!);
    await new Promise((ok, bad) => { p.ws.onopen = ok; p.ws.onerror = () => bad(new Error('ต่อแท็บไม่ได้')); });
    p.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      if (m.id) {
        const q = p.pending.get(m.id);
        p.pending.delete(m.id);
        if (m.error) q?.rej(new Error(m.error.message));
        else q?.res(m.result);
      } else {
        if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) p._url = m.params.frame.url;
        if (m.method === 'Page.navigatedWithinDocument') p._url = m.params.url;
        for (const l of p.listeners) l(m.method, m.params);
      }
    };
    await p.send('Page.enable', {}, 10_000).catch(() => {}); // ได้ event นำทาง (url ปัจจุบัน / DOMContentLoaded)
    return p;
  }

  // ทุกคำสั่งมีเพดานเวลา — แท็บค้างต้องไม่ทำให้รอตลอดกาล
  private send(method: string, params: object = {}, timeout = 30_000): Promise<any> {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`timeout: ${method}`)); }, timeout);
      this.pending.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  url(): string { return this._url; }

  async goto(url: string, opts: { timeout?: number; waitUntil?: string } = {}): Promise<void> {
    const timeout = opts.timeout ?? 30_000;
    const loaded = new Promise<void>((ok, bad) => {
      const t = setTimeout(() => { this.listeners.delete(l); bad(new Error(`โหลดหน้าไม่ทันเวลา: ${url}`)); }, timeout);
      const l = (m: string) => { if (m === 'Page.domContentEventFired') { clearTimeout(t); this.listeners.delete(l); ok(); } };
      this.listeners.add(l);
    });
    const r = await this.send('Page.navigate', { url }, timeout);
    if (r.errorText) throw new Error(`เปิดหน้าไม่ได้ (${r.errorText}): ${url}`);
    this._url = url;
    await loaded;
  }

  // เหมือน Playwright: ส่งฟังก์ชัน (ต้องไม่อ้างตัวแปรข้างนอก) + อาร์กิวเมนต์ที่ serialize ได้
  async evaluate<R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A, timeout = 30_000): Promise<R> {
    const expression = `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`;
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value as R;
  }

  title(): Promise<string> { return this.evaluate(() => document.title, undefined, 5000); }

  async waitForSelector(sel: string, opts: { timeout?: number } = {}): Promise<void> {
    const end = Date.now() + (opts.timeout ?? 30_000);
    while (Date.now() < end) {
      if (await this.evaluate((s) => !!document.querySelector(s), sel, 3000).catch(() => false)) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`ไม่เจอ ${sel}`);
  }
}

// แท็บ Chrome (CdpPage) หรือแบบไม่ใช้ Chrome (HttpPage ใน http-page.ts) — ใช้แทนกันได้
export type Page = Pick<CdpPage, 'url' | 'goto' | 'title' | 'evaluate' | 'waitForSelector' | 'setScripts'>;
