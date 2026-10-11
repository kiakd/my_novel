// "แท็บ" แบบไม่ใช้ Chrome: ดึง HTML ด้วย impit (TLS แบบ Chrome) แล้ว parse ด้วย linkedom
// API เดียวกับ CdpPage เท่าที่ translate.ts / sites.ts ใช้ → adapter ใน sites.ts ใช้ได้ทั้งสองแบบ
//
// ทำไมผ่าน Cloudflare ของ 69shuba ได้ (ทดสอบ 2026-10-10 ทั้งเครื่องบ้านและ VPS):
//   ต้องมีครบสองอย่าง — TLS fingerprint แบบ Chrome (impit) + header Referer ของเว็บ ขาดอย่างใดอย่างหนึ่ง = 403 challenge
//   fetch ของ Node/Bun ธรรมดาไม่ผ่าน (fingerprint ไม่ใช่ browser)
// ยิงห่างกันอย่างน้อย 3 วิ — ถี่กว่านี้มีรายงานว่าโดน 403 กลับมา (novel-downloader)
import { Impit } from 'impit';
import { DOMParser, parseHTML } from 'linkedom';

// innerText แบบ Chrome (linkedom คืน textContent ดิบ): <br>/บล็อก = ขึ้นบรรทัด, ช่องว่าง/ขึ้นบรรทัดใน source = เว้นวรรคเดียว
// (sites.ts แยกย่อหน้าจาก innerText — ต้องได้ผลเหมือนตอนดึงผ่าน Chrome ไม่งั้นย่อหน้าติด/แตกต่างจากเดิม)
const BLOCK = /^(P|DIV|H[1-6]|LI|UL|OL|SECTION|ARTICLE|HEADER|FOOTER|TR|TABLE|BLOCKQUOTE|PRE)$/;
function chromeText(el: any): string {
  let out = '';
  const walk = (n: any) => {
    if (n.nodeType === 3) { out += n.data.replace(/[ \t\n\r\f]+/g, ' '); return; }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(n.tagName)) return;
    if (n.tagName === 'BR') { out += '\n'; return; }
    const block = BLOCK.test(n.tagName);
    if (block) out += '\n';
    for (const c of n.childNodes) walk(c);
    if (block) out += '\n';
  };
  for (const c of el.childNodes) walk(c);
  return out.replace(/ *\n */g, '\n').replace(/^\n+|\n+$/g, '');
}
// ทับที่ prototype ที่ linkedom ประกาศ innerText ไว้จริง (ไล่ขึ้นจาก element จริง)
for (let o = Object.getPrototypeOf(parseHTML('<div></div>').document.createElement('div')); o; o = Object.getPrototypeOf(o)) {
  if (Object.getOwnPropertyDescriptor(o, 'innerText')) {
    // element ที่ไม่ได้อยู่ในหน้า (เช่น cloneNode ใน sites.ts) Chrome คืน textContent ดิบ — ต้องทำตาม ไม่งั้นย่อหน้าแตกต่างจากเดิม
    Object.defineProperty(o, 'innerText', { configurable: true, get() { return this.isConnected ? chromeText(this) : this.textContent; } });
    break;
  }
}

// เว้นจังหวะระหว่างคำขอ (ทั้งโปรเซส) — ดึงต้นฉบับทั้งเรื่องล่วงหน้า (prefetch.ts) ลดได้ด้วย NR_GAP_MS
const GAP_MS = Number(process.env.NR_GAP_MS ?? 3000);
const imp = new Impit({ browser: 'chrome', timeout: 30_000 });
let last = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const referer = (u: string) => { try { return new URL(u).origin + '/'; } catch { return undefined; } };

/** fetch แบบ Chrome + Referer + เว้นจังหวะ — คืน Response ของ impit (มี status/ok/headers/arrayBuffer/text) */
export async function politeFetch(url: string) {
  const wait = last + GAP_MS + Math.random() * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const ref = referer(url);
  return imp.fetch(url, { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9', ...(ref ? { Referer: ref } : {}) } });
}

// charset จาก header หรือ <meta> (69shuba ส่ง GBK)
function decode(buf: ArrayBuffer, contentType: string | null): string {
  const pick = (s: string | null | undefined) => s?.match(/charset=["']?([\w-]+)/i)?.[1];
  let cs = pick(contentType);
  if (!cs) cs = pick(new TextDecoder('latin1').decode(buf.slice(0, 2048)));
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

export class HttpPage {
  private _url = 'about:blank';
  private doc: any = parseHTML('<html><head><title></title></head><body></body></html>').document;
  status = 0;

  url(): string { return this._url; }

  async goto(url: string, _opts: { timeout?: number; waitUntil?: string } = {}): Promise<void> {
    const r = await politeFetch(url);
    this.status = r.status;
    this._url = r.url || url;
    this.doc = parseHTML(decode(await r.arrayBuffer(), r.headers.get('content-type'))).document;
  }

  async title(): Promise<string> { return this.doc.title ?? ''; }

  // รันฟังก์ชันเดียวกับที่ CdpPage ส่งเข้า browser — ให้ document/DOMParser/fetch ชี้มาที่หน้านี้ชั่วคราว
  // (ทำทีละคำสั่ง ไม่มีงานซ้อน เพราะ translate.ts ใช้แท็บเดียวเรียงกัน)
  async evaluate<R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A, _timeout?: number): Promise<R> {
    const g = globalThis as any;
    const saved = { document: g.document, DOMParser: g.DOMParser, fetch: g.fetch, location: g.location };
    g.document = this.doc;
    g.DOMParser = DOMParser;
    g.fetch = (u: string) => politeFetch(new URL(u, this._url).href);
    g.location = new URL(this._url === 'about:blank' ? 'http://localhost/' : this._url);
    try {
      return await fn(arg as A);
    } finally {
      Object.assign(g, saved);
    }
  }

  async waitForSelector(sel: string, _opts: { timeout?: number } = {}): Promise<void> {
    if (!this.doc.querySelector(sel)) throw new Error(`ไม่เจอ ${sel} (HTTP ${this.status})`);
  }

  async setScripts(_enabled: boolean): Promise<void> {} // ไม่มี JS ให้ปิด/เปิด
}
