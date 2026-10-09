// ล็อกอินเจ้าของ: คนทั่วไปอ่านได้ปกติ แต่สั่ง AI (แปล/เกลา/แก้/เปลี่ยนโมเดล/ดูค่าใช้จ่าย) ต้องล็อกอิน
//
// บัญชี (เลือกที่ใดที่หนึ่ง — env ชนะไฟล์):
//   1) .env / env:  NR_AUTH_USER=... NR_AUTH_PASS=...
//   2) ไฟล์ auth.json (หรือ path ใน NR_AUTH_FILE): { "users": [{ "username": "...", "password": "..." }] }
//      อ่านใหม่ทุกครั้งที่ล็อกอิน/เช็ค session — แก้ไฟล์แล้วมีผลทันทีไม่ต้องรีสตาร์ท
// ไม่ได้ตั้งบัญชีไว้เลย → ไม่มีใครใช้ AI ได้ (ปลอดภัยไว้ก่อน)
//
// session = cookie ที่เซ็น HMAC (ไม่มี state ฝั่ง server): user.หมดอายุ.ลายเซ็น
//   กุญแจ: NR_SESSION_SECRET หรือสุ่มเก็บไว้ที่ library/.session-secret (รีสตาร์ทแล้วไม่หลุดล็อกอิน)
//   ลายเซ็นผูกกับรหัสผ่านปัจจุบัน → เปลี่ยนรหัสแล้ว session เก่าใช้ไม่ได้ทันที
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

const ROOT = import.meta.dirname;
const COOKIE = 'nr_s';
const MAX_AGE = 30 * 864e2; // วินาที (30 วัน) — อ่านบนมือถือ ไม่อยากล็อกอินบ่อย

// .env ข้างไฟล์นี้ (ค่าที่ตั้งใน env จริงชนะ) — โปรเซสลูก translate.ts ได้ค่าเดียวกันไปด้วย
export function loadDotEnv(p = join(ROOT, '.env')) {
  let text = '';
  try { text = readFileSync(p, 'utf8'); } catch { return; } // ไม่มีไฟล์/อ่านไม่ได้ = ใช้ env จริงอย่างเดียว
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
}

type User = { username: string; password: string };
const authFile = () => {
  const f = process.env.NR_AUTH_FILE || 'auth.json';
  return isAbsolute(f) ? f : join(ROOT, f);
};
function users(): User[] {
  const u = process.env.NR_AUTH_USER, p = process.env.NR_AUTH_PASS;
  if (u && p) return [{ username: u, password: p }];
  try {
    const j = JSON.parse(readFileSync(authFile(), 'utf8'));
    const list: unknown[] = Array.isArray(j?.users) ? j.users : j?.username ? [j] : [];
    return list.flatMap((x: any) => (x && typeof x.username === 'string' && typeof x.password === 'string' && x.username && x.password ? [{ username: x.username, password: x.password }] : []));
  } catch {
    return [];
  }
}
export const authConfigured = () => users().length > 0;
export const authSource = () => (process.env.NR_AUTH_USER && process.env.NR_AUTH_PASS ? 'env NR_AUTH_USER/NR_AUTH_PASS' : authFile());

let secretCache: Buffer | null = null;
function secret(): Buffer {
  if (secretCache) return secretCache;
  if (process.env.NR_SESSION_SECRET) return (secretCache = Buffer.from(process.env.NR_SESSION_SECRET));
  const f = join(ROOT, 'library', '.session-secret');
  try {
    secretCache = Buffer.from(readFileSync(f, 'utf8').trim(), 'hex');
    if (secretCache.length >= 32) return secretCache;
  } catch {}
  secretCache = randomBytes(32);
  try { mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, secretCache.toString('hex')); } catch {}
  return secretCache;
}

const sha = (s: string) => createHash('sha256').update(s).digest();
const same = (a: string, b: string) => timingSafeEqual(sha(a), sha(b));
const sign = (u: User, exp: number) => createHmac('sha256', secret()).update(`${u.username}\n${exp}\n${u.password}`).digest('base64url');

function check(username: string, password: string): User | null {
  let hit: User | null = null;
  for (const u of users()) if (same(u.username.toLowerCase(), username.trim().toLowerCase()) && same(u.password, password)) hit = u;
  return hit;
}

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** ชื่อผู้ใช้ที่ล็อกอินอยู่ หรือ null */
export function currentUser(req: IncomingMessage): string | null {
  const v = cookies(req)[COOKIE];
  if (!v) return null;
  const [b64, expS, sig] = v.split('.');
  const exp = Number(expS);
  if (!b64 || !sig || !Number.isFinite(exp) || exp * 1000 < Date.now()) return null;
  const name = Buffer.from(b64, 'base64url').toString('utf8');
  const u = users().find((x) => x.username === name);
  if (!u) return null;
  const want = Buffer.from(sign(u, exp)), got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got) ? u.username : null;
}

const secure = (req: IncomingMessage) => process.env.NR_COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
const setCookie = (req: IncomingMessage, res: ServerResponse, value: string, maxAge: number) =>
  res.setHeader('set-cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`);

// กันเดารหัส: ผิด 5 ครั้งใน 15 นาที ต่อ IP → ล็อก 15 นาที
// หลัง reverse proxy ตั้ง NR_TRUST_PROXY=1 ถึงจะเชื่อ x-forwarded-for (ไม่งั้นปลอม header หลบได้)
const fails = new Map<string, { n: number; until: number }>();
const WINDOW = 15 * 60e3;
const clientIp = (req: IncomingMessage) =>
  (process.env.NR_TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || '?';

/** ล็อกอิน: สำเร็จ → ตั้ง cookie แล้วคืน null; ไม่สำเร็จ → ข้อความผิดพลาด */
export function login(req: IncomingMessage, res: ServerResponse, username: string, password: string): string | null {
  const ip = clientIp(req), now = Date.now();
  const f = fails.get(ip);
  if (f && f.n >= 5 && f.until > now) return `ลองผิดหลายครั้งเกินไป — รออีก ${Math.ceil((f.until - now) / 60e3)} นาที`;
  if (!authConfigured()) return 'ยังไม่ได้ตั้งบัญชี (NR_AUTH_USER/NR_AUTH_PASS ใน .env หรือ auth.json)';
  const u = check(String(username ?? ''), String(password ?? ''));
  if (!u) {
    const cur = f && f.until > now ? f : { n: 0, until: 0 };
    fails.set(ip, { n: cur.n + 1, until: now + WINDOW });
    return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  }
  fails.delete(ip);
  const exp = Math.floor(now / 1000) + MAX_AGE;
  setCookie(req, res, `${Buffer.from(u.username).toString('base64url')}.${exp}.${sign(u, exp)}`, MAX_AGE);
  return null;
}

export const logout = (req: IncomingMessage, res: ServerResponse) => setCookie(req, res, '', 0);
