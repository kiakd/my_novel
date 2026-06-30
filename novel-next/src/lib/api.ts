// ============ API client — เรียก backend เดิม (proxied ผ่าน Next rewrites) ============
import type { AppState, AILogRow, AILogDetail, AppLogRow } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** opts.retries: ลองใหม่เมื่อ network error (เช่น QUIC_TOO_MANY_RTOS บน edge HTTP3) หรือ gateway 502/503/504
 *  — ใช้เฉพาะ call ที่ยิงซ้ำได้ปลอดภัย (idempotent เช่น generate) ไม่ใช้กับ write (put/upsert) ที่มีผลข้างเคียง */
async function jsonFetch<T>(url: string, init?: RequestInit, opts?: { retries?: number }): Promise<T> {
  const retries = opts?.retries ?? 0;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
      });
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
        await sleep(400 * (attempt + 1)); continue;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok && res.status !== 409) {
        throw new Error((data as { error?: string })?.error ?? `${url} → ${res.status}`);
      }
      return data as T;
    } catch (e) {
      lastErr = e;
      if (e instanceof TypeError && attempt < retries) { await sleep(400 * (attempt + 1)); continue; }
      throw e;
    }
  }
  throw lastErr;
}

export type StateWithRev = AppState & { __rev: number };

/** โหลด state ทั้งก้อน (null ถ้ายังไม่มีใน DB) */
export const getState = () => jsonFetch<StateWithRev | null>('/api/state');

export interface PutStateResult {
  ok: boolean;
  rev?: number;
  conflict?: boolean;
  currentRev?: number;
  error?: string;
}
/** บันทึก state — แนบ __rev เพื่อ optimistic lock (409 ถ้า rev ไม่ตรง) */
export const putState = (state: AppState, rev: number) =>
  jsonFetch<PutStateResult>('/api/state', { method: 'PUT', body: JSON.stringify({ ...state, __rev: rev }) });

/** ai_logs (การเรียก LLM) */
export const getAiLogs = async (limit = 100): Promise<AILogRow[]> =>
  jsonFetch<AILogRow[]>(`/api/logs?limit=${limit}`);

/** ดึง log เต็มทีละรายการ (system/user/response ไม่ถูกตัด) สำหรับ drawer + ปุ่ม copy */
export const getAiLog = async (id: string): Promise<AILogDetail | null> => {
  const r = await jsonFetch<{ ok: boolean; log?: AILogDetail; error?: string }>(`/api/logs/${encodeURIComponent(id)}`);
  return r.ok && r.log ? r.log : null;
};

/** app_logs (request/activity/error) */
export const getAppLogs = async (params: { type?: string; limit?: number } = {}): Promise<AppLogRow[]> => {
  const q = new URLSearchParams();
  if (params.type) q.set('type', params.type);
  q.set('limit', String(params.limit ?? 150));
  const r = await jsonFetch<{ ok: boolean; logs: AppLogRow[] }>(`/api/app-logs?${q}`);
  return r.logs ?? [];
};

export const clearAppLogs = () => jsonFetch<{ ok: boolean; deleted: number }>('/api/app-logs', { method: 'DELETE' });

// ---- AI: raw generate (เผื่อ continue/review ในอนาคต) ----
export interface GenerateResult { ok: boolean; text?: string; error?: string; provider?: string; model?: string }
export const generate = (body: { user: string; system?: string; provider?: string; temperature?: number; max_tokens?: number; prefill?: string }) =>
  jsonFetch<GenerateResult>('/api/generate', { method: 'POST', body: JSON.stringify(body) }, { retries: 2 });

// ---- AI: เขียนต่อบท (roleplay assembler ฝั่ง backend ประกอบ system prompt จาก context) ----
export interface GenRoleplayResult { ok: boolean; text?: string; error?: string; provider?: string; model?: string; prompt_chars?: number }
export const generateRoleplay = (body: { context: unknown; user_input: string; provider?: string; temperature?: number; max_tokens?: number; prefill?: string }) =>
  jsonFetch<GenRoleplayResult>('/api/generate-roleplay', { method: 'POST', body: JSON.stringify(body) }, { retries: 2 });

// ---- RAG memory ฝั่งนิยาย (kind:'novel') — เรียก endpoint เดียวกับแชทแต่แยก scope/kind ----
// หน่วยความจำของนิยาย = ย่อหน้าของแต่ละบท · scopeId = story.id · turnIdx = ดัชนีย่อหน้าไล่ทั้งเรื่อง
export interface MemRowInput {
  id: string; scopeId: string; charId?: string | null; secret: boolean;
  speaker: string; turnIdx: number; ts: number; text: string;
}
export interface MemWriteResult { ok: boolean; count?: number; embedded?: boolean; embedConfigured?: boolean; embedError?: string; error?: string }
export const memBackfillNovel = (scopeId: string, rows: MemRowInput[]) =>
  jsonFetch<MemWriteResult>(
    '/api/chat/memory/backfill', { method: 'POST', body: JSON.stringify({ scopeId, kind: 'novel', rows }) });

export const memIngestNovel = (scopeId: string, rows: MemRowInput[]) =>
  jsonFetch<MemWriteResult>(
    '/api/chat/memory/ingest', { method: 'POST', body: JSON.stringify({ scopeId, kind: 'novel', rows }) });

export const memRecallNovel = (body: { scopeId: string; query: string; activeChar: string; mode?: 'char' | 'narrator'; excludeFromIdx: number; k?: number }) =>
  jsonFetch<{ ok: boolean; memories: string[]; error?: string }>(
    '/api/chat/memory/recall', { method: 'POST', body: JSON.stringify(body) });

// สถานะระบบความจำ (embedding ตั้งไว้ไหม/จำนวน row/ฯลฯ)
export const memStatus = () =>
  jsonFetch<{ ok: boolean; mode?: string; embeddingConfigured?: boolean; embedModel?: string; embedDim?: number; rows?: number; embeddedRows?: number; scopes?: number; embedError?: string }>(
    '/api/chat/memory/status');

// ---- ขยายงานเขียน (draft + โหมด) ----
export type ExpandMode = 'scene' | 'action' | 'polish';
export interface ExpandResult { ok: boolean; text?: string; error?: string; provider?: string; model?: string }
export const expand = (body: {
  draft: string;
  mode: ExpandMode;
  style?: string;
  characters?: string[];
  provider?: string;
  max_tokens?: number;
}) => jsonFetch<ExpandResult>('/api/expand', { method: 'POST', body: JSON.stringify(body) }, { retries: 2 });
