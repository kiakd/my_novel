// ============ API client — เรียก backend เดิม (proxied ผ่าน Next rewrites) ============
import type { AppState, AILogRow, AppLogRow } from './types';

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok && res.status !== 409) {
    throw new Error((data as { error?: string })?.error ?? `${url} → ${res.status}`);
  }
  return data as T;
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
  jsonFetch<GenerateResult>('/api/generate', { method: 'POST', body: JSON.stringify(body) });

// ---- AI: เขียนต่อบท (roleplay assembler ฝั่ง backend ประกอบ system prompt จาก context) ----
export interface GenRoleplayResult { ok: boolean; text?: string; error?: string; provider?: string; model?: string; prompt_chars?: number }
export const generateRoleplay = (body: { context: unknown; user_input: string; provider?: string; temperature?: number; max_tokens?: number }) =>
  jsonFetch<GenRoleplayResult>('/api/generate-roleplay', { method: 'POST', body: JSON.stringify(body) });

// ---- รูป ref → booru tags (WD14 โลคัล ผ่าน ComfyUI) ----
export interface RefTagResult { ok: boolean; tags?: string[]; buckets?: Record<string, string[]>; error?: string }
export const refTag = (dataBase64: string) =>
  jsonFetch<RefTagResult>('/api/ref/tag', { method: 'POST', body: JSON.stringify({ data_base64: dataBase64 }) });

// ---- ขยายงานเขียน (draft + tag จากรูป + โหมด) ----
export type ExpandMode = 'scene' | 'action' | 'polish';
export interface ExpandResult { ok: boolean; text?: string; error?: string; provider?: string; model?: string }
export const expand = (body: {
  draft: string;
  mode: ExpandMode;
  tags?: string[];
  buckets?: Record<string, string[]>;
  style?: string;
  characters?: string[];
  provider?: string;
  max_tokens?: number;
}) => jsonFetch<ExpandResult>('/api/expand', { method: 'POST', body: JSON.stringify(body) });
