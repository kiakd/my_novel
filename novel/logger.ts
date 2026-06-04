// logger.ts — เก็บ log ของแอป 3 ชนิด (request / activity / error)
// เขียน 2 ที่พร้อมกัน: MongoDB collection `app_logs` (ไว้ query ในแอป) + ไฟล์ JSONL รายวัน (ไว้ tail/เก็บถาวร)
// แยกจาก ai_logs เดิม (ที่ log เฉพาะการเรียก LLM) — อันนี้คือ log ระดับระบบ
//
// ใช้:
//   import { logActivity, logError, logRequest } from './logger'
//   logActivity('state.save', 'main', { fromRev, toRev })
//   logError(e, { endpoint: 'generate' })

import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from 'mongodb';
import { getDb } from './db';

export const APP_LOG_COLLECTION = 'app_logs';
const LOG_DIR = process.env.LOG_DIR ?? './logs';
const TO_FILE = process.env.LOG_TO_FILE !== '0';   // ปิดได้ด้วย LOG_TO_FILE=0
const TO_MONGO = process.env.LOG_TO_MONGO !== '0';  // ปิดได้ด้วย LOG_TO_MONGO=0

export type LogType = 'request' | 'activity' | 'error';
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  type: LogType;
  level?: LogLevel;
  msg?: string;
  // request
  method?: string;
  path?: string;
  status?: number;
  ms?: number;
  ip?: string;
  // activity
  action?: string;
  target?: string;
  meta?: Record<string, unknown>;
  // error
  error?: string;
  stack?: string;
}

let dirReady = false;
async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(LOG_DIR, { recursive: true });
  dirReady = true;
}

function dayFile(): string {
  const d = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return join(LOG_DIR, `app-${d}.log`);
}

/** เขียน log 1 รายการ — best-effort ทั้งสองทาง ไม่ throw (กันล้มกระบวนการหลัก) */
export function writeLog(entry: LogEntry): void {
  const doc = {
    ts: new Date(),
    level: entry.level ?? (entry.type === 'error' ? 'error' : 'info'),
    ...entry,
  };

  if (TO_FILE) {
    ensureDir()
      .then(() => appendFile(dayFile(), JSON.stringify(doc) + '\n', 'utf8'))
      .catch((e) => console.error('[log:file]', (e as Error).message));
  }

  if (TO_MONGO) {
    (async () => {
      const db: Db = await getDb();
      const id = `${doc.type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await db.collection(APP_LOG_COLLECTION).insertOne({ _id: id as any, ...doc });
    })().catch((e) => console.error('[log:mongo]', (e as Error).message));
  }

  // mirror ขึ้น console เฉพาะ error เพื่อให้เห็นตอน dev
  if (doc.level === 'error') {
    console.error(`[${doc.type}]`, entry.msg ?? entry.error ?? '', entry.path ?? entry.target ?? '');
  }
}

export const logRequest = (e: Omit<LogEntry, 'type'>): void => writeLog({ type: 'request', ...e });

export const logActivity = (action: string, target?: string, meta?: Record<string, unknown>): void =>
  writeLog({ type: 'activity', action, target, meta });

export const logError = (error: unknown, ctx?: Record<string, unknown>): void =>
  writeLog({
    type: 'error',
    level: 'error',
    error: (error as { message?: string })?.message ?? String(error),
    stack: (error as { stack?: string })?.stack,
    meta: ctx,
  });

/** สร้าง TTL index ให้ app_logs หมดอายุเอง (default 30 วัน, ตั้งผ่าน LOG_TTL_DAYS) */
export async function ensureLogIndexes(db: Db): Promise<void> {
  const days = Number(process.env.LOG_TTL_DAYS ?? 30);
  await db.collection(APP_LOG_COLLECTION).createIndex(
    { ts: 1 },
    { expireAfterSeconds: days * 24 * 60 * 60, name: 'ts_ttl' },
  );
  // index ช่วย query ตามชนิด/เวลา
  await db.collection(APP_LOG_COLLECTION).createIndex({ type: 1, ts: -1 }, { name: 'type_ts' });
}
