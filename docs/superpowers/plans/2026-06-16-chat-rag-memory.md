# Chat RAG Long-Term Memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มชั้น RAG ที่ "กู้" turn เก่าที่เกี่ยวข้องกลับมา inject ในแชท RP โดยไม่แตะ rolling-summary/live-state เดิม

**Architecture:** เก็บความจำลง `bun:sqlite` ฝั่ง server (FTS5 trigram + เวกเตอร์ BLOB) บน SSD. recall = hybrid (FTS keyword + cosine semantic) → rerank → top-K. embedding ผ่าน provider แบบ pluggable (degrade เป็น FTS-only ถ้าไม่ตั้งค่า). client เรียก 3 endpoint (backfill/ingest/recall) แล้วส่ง `recalled[]` เข้า `/api/chat` → ฉีดเป็น section ใน prompt.

**Tech Stack:** Bun, `bun:sqlite` (FTS5), Elysia, TypeScript, `bun:test`. embedding = OpenAI-compatible `/embeddings`.

**ตัดสิน §7 ของ spec:** recall ทำ **ฝั่ง client** (เรียก endpoint แยก) เพื่อให้สอดคล้องกับ `buildMemory`/`pickLore` ที่ client orchestrate อยู่แล้ว — `/api/chat` แค่รับ `recalled[]` ส่งต่อ. embedding ทำ **ฝั่ง server ทั้งหมด** (client ไม่แตะเวกเตอร์).

**หมายเหตุการรัน:** ทุกคำสั่งรันใน `novel/` (ฝั่ง backend) เว้นแต่ระบุ `novel-next/`. test รันด้วย `bun test <file>`.

---

## File Structure

| ไฟล์ | สร้าง/แก้ | หน้าที่ |
|---|---|---|
| `novel/chat-memory.ts` | สร้าง | sqlite store: schema, ingest, recall (FTS+cosine+rerank). pure, unit-test ได้ |
| `novel/chat-memory.test.ts` | สร้าง | test ของ chat-memory |
| `novel/embed.ts` | สร้าง | embedding client แบบ pluggable (env-driven, คืน null ถ้าไม่ตั้งค่า) |
| `novel/embed.test.ts` | สร้าง | test ของ embed |
| `novel/server.ts` | แก้ | +3 endpoint memory, +pass `recalled` ใน `/api/chat` |
| `novel/chat-prompt.ts` | แก้ | `assembleChatPrompt` รับ `recalled?: string[]` → render section |
| `novel/chat-prompt.test.ts` | สร้าง | test ว่า recalled ถูก render |
| `novel-next/src/lib/chat-api.ts` | แก้ | client fn: `memBackfill`, `memIngest`, `memRecall` + `recalled` ใน sendChat |
| `novel-next/src/components/screens/chat/ChatScreen.tsx` | แก้ | backfill ตอนเปิด session, ingest ตอนส่ง, recall ก่อน sendChat |
| `.env.docker.example` | แก้ | +EMBED_* + คำอธิบาย Mongo cache cap |
| `docker-compose.yml` | แก้ | จำกัด Mongo wiredTiger cache + mount volume sqlite |

---

## Task 1: chat-memory schema + ingest (FTS only)

**Files:**
- Create: `novel/chat-memory.ts`
- Test: `novel/chat-memory.test.ts`

- [ ] **Step 1: เขียน failing test**

```ts
// novel/chat-memory.test.ts
import { test, expect } from 'bun:test';
import { openMemDb, ingestMemory, ftsSearch } from './chat-memory';

test('ingest + fts trigram จับคำไทยได้', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นสารภาพว่ากลัวความมืดมาตั้งแต่เด็ก' },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: false, speaker: 'user', turnIdx: 1, ts: 2, text: 'ดยุคยื่นมือช่วยพยุงเธอขึ้น' },
  ]);
  const hits = ftsSearch(db, { scopeId: 's1', query: 'ความมืด', activeChar: 'เรย์น', secret: false, excludeFromIdx: 999, limit: 5 });
  expect(hits.map((h) => h.turnIdx)).toEqual([0]);
});

test('ingest ซ้ำ id เดิม ไม่เพิ่มแถว (idempotent — รองรับ backfill ซ้ำ)', () => {
  const db = openMemDb(':memory:');
  const row = { id: 's1:0', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'สวัสดีตอนเช้า' };
  ingestMemory(db, [row]);
  ingestMemory(db, [row]);
  const hits = ftsSearch(db, { scopeId: 's1', query: 'สวัสดี', activeChar: 'a', secret: false, excludeFromIdx: 999, limit: 5 });
  expect(hits.length).toBe(1);
});
```

- [ ] **Step 2: รัน test ให้ FAIL**

Run: `bun test chat-memory.test.ts`
Expected: FAIL — `Cannot find module './chat-memory'`

- [ ] **Step 3: เขียน implementation ขั้นต่ำ**

```ts
// novel/chat-memory.ts
import { Database } from 'bun:sqlite';

export interface MemRow {
  id: string;          // `${scopeId}:${turnIdx}`
  scopeId: string;     // sessionId (เฟส 2: storyId)
  kind: 'chat' | 'novel';
  charId?: string | null;
  secret: boolean;
  speaker: string;     // 'user' | 'char' | 'narrator' | ชื่อ NPC
  turnIdx: number;
  ts: number;
  text: string;
  embedding?: Float32Array | null;
}

export interface FtsQuery {
  scopeId: string;
  query: string;
  activeChar: string;
  secret: boolean;       // true = narrator (เห็นฉากลับ); false = char mode (ตัด secret ออก)
  excludeFromIdx: number; // ตัด turnIdx >= ค่านี้ (อยู่ใน raw context อยู่แล้ว)
  limit: number;
}

export interface MemHit extends MemRow { ftsRank?: number; cos?: number }

let _db: Database | null = null;

/** เปิด/migrate. path=':memory:' สำหรับ test */
export function openMemDb(path: string): Database {
  const db = new Database(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA cache_size = -8000'); // ~8MB page cache (คุม RAM บน VPS 3GB)
  db.exec(`CREATE TABLE IF NOT EXISTS mem (
    id TEXT PRIMARY KEY, scopeId TEXT NOT NULL, kind TEXT NOT NULL,
    charId TEXT, secret INTEGER NOT NULL DEFAULT 0, speaker TEXT,
    turnIdx INTEGER NOT NULL, ts INTEGER NOT NULL, text TEXT NOT NULL, embedding BLOB
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_mem_scope ON mem(scopeId, turnIdx)');
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS mem_fts USING fts5(id UNINDEXED, text, tokenize='trigram')`);
  return db;
}

/** singleton สำหรับ runtime (server) — ใช้ MEM_DB_PATH หรือ default ไฟล์บน disk */
export function getMemDb(): Database {
  if (!_db) _db = openMemDb(process.env.MEM_DB_PATH ?? './chat-mem.sqlite');
  return _db;
}

export function ingestMemory(db: Database, rows: MemRow[]): void {
  const insMem = db.prepare(
    `INSERT OR IGNORE INTO mem (id, scopeId, kind, charId, secret, speaker, turnIdx, ts, text, embedding)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  );
  const insFts = db.prepare('INSERT INTO mem_fts (id, text) VALUES (?, ?)');
  const tx = db.transaction((items: MemRow[]) => {
    for (const r of items) {
      const blob = r.embedding ? Buffer.from(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength) : null;
      const res = insMem.run(r.id, r.scopeId, r.kind, r.charId ?? null, r.secret ? 1 : 0, r.speaker, r.turnIdx, r.ts, r.text, blob);
      if (res.changes > 0) insFts.run(r.id, r.text); // เพิ่ม FTS เฉพาะตอน mem เพิ่มจริง (กันซ้ำตอน backfill ซ้ำ)
    }
  });
  tx(rows);
}

/** แปลง query → FTS5 MATCH string (trigram): เอา token ยาว >=3, escape, OR-join. คืน null ถ้าไม่มี token ใช้ได้ */
export function toFtsMatch(query: string): string | null {
  const toks = query.split(/\s+/).map((t) => t.trim()).filter((t) => t.length >= 3);
  if (!toks.length) {
    const whole = query.trim();
    if (whole.length < 3) return null;
    return `"${whole.replace(/"/g, '""')}"`;
  }
  return toks.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
}

function visibilitySql(secret: boolean, activeChar: string): { clause: string; params: any[] } {
  if (secret) return { clause: '1=1', params: [] }; // narrator เห็นหมด
  return { clause: '(m.secret = 0 AND (m.charId IS NULL OR m.charId = ?))', params: [activeChar] };
}

export function ftsSearch(db: Database, q: FtsQuery): MemHit[] {
  const match = toFtsMatch(q.query);
  if (!match) return [];
  const vis = visibilitySql(q.secret, q.activeChar);
  const sql = `SELECT m.*, f.rank AS ftsRank FROM mem_fts f JOIN mem m ON m.id = f.id
    WHERE mem_fts MATCH ? AND m.scopeId = ? AND m.turnIdx < ? AND ${vis.clause}
    ORDER BY f.rank LIMIT ?`;
  const rows = db.query(sql).all(match, q.scopeId, q.excludeFromIdx, ...vis.params, q.limit) as any[];
  return rows.map(rowToHit);
}

function rowToHit(r: any): MemHit {
  return {
    id: r.id, scopeId: r.scopeId, kind: r.kind, charId: r.charId, secret: !!r.secret,
    speaker: r.speaker, turnIdx: r.turnIdx, ts: r.ts, text: r.text,
    embedding: r.embedding ? new Float32Array((r.embedding as Buffer).buffer, (r.embedding as Buffer).byteOffset, (r.embedding as Buffer).byteLength / 4) : null,
    ftsRank: typeof r.ftsRank === 'number' ? r.ftsRank : undefined,
  };
}
```

- [ ] **Step 4: รัน test ให้ PASS**

Run: `bun test chat-memory.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add novel/chat-memory.ts novel/chat-memory.test.ts
git commit -m "feat(rag): chat-memory sqlite store + FTS5 trigram ingest/search"
```

---

## Task 2: cosine similarity + vector search

**Files:**
- Modify: `novel/chat-memory.ts`
- Test: `novel/chat-memory.test.ts`

- [ ] **Step 1: เขียน failing test (เพิ่มท้ายไฟล์ test)**

```ts
import { cosine, vectorSearch } from './chat-memory';

test('cosine: เวกเตอร์เดียวกัน = 1, ตั้งฉาก = 0', () => {
  const a = new Float32Array([1, 0, 0]);
  const b = new Float32Array([1, 0, 0]);
  const c = new Float32Array([0, 1, 0]);
  expect(cosine(a, b)).toBeCloseTo(1, 5);
  expect(cosine(a, c)).toBeCloseTo(0, 5);
});

test('vectorSearch: คืนแถวที่ embedding ใกล้ query ที่สุดก่อน', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'ก', embedding: new Float32Array([1, 0, 0]) },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'ข', embedding: new Float32Array([0, 1, 0]) },
  ]);
  const hits = vectorSearch(db, { scopeId: 's1', queryVec: new Float32Array([0.9, 0.1, 0]), activeChar: 'a', secret: false, excludeFromIdx: 999, limit: 5 });
  expect(hits[0].turnIdx).toBe(0);
  expect(hits[0].cos).toBeGreaterThan(hits[1].cos!);
});
```

- [ ] **Step 2: รัน test ให้ FAIL**

Run: `bun test chat-memory.test.ts`
Expected: FAIL — `cosine is not exported` / `vectorSearch is not a function`

- [ ] **Step 3: เพิ่ม implementation (ท้าย chat-memory.ts)**

```ts
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface VecQuery {
  scopeId: string; queryVec: Float32Array; activeChar: string;
  secret: boolean; excludeFromIdx: number; limit: number;
}

export function vectorSearch(db: Database, q: VecQuery): MemHit[] {
  const vis = visibilitySql(q.secret, q.activeChar);
  const sql = `SELECT m.* FROM mem m
    WHERE m.scopeId = ? AND m.turnIdx < ? AND m.embedding IS NOT NULL AND ${vis.clause}`;
  const rows = db.query(sql).all(q.scopeId, q.excludeFromIdx, ...vis.params) as any[];
  const hits = rows.map(rowToHit).map((h) => ({ ...h, cos: h.embedding ? cosine(q.queryVec, h.embedding) : 0 }));
  hits.sort((x, y) => (y.cos ?? 0) - (x.cos ?? 0));
  return hits.slice(0, q.limit);
}
```

- [ ] **Step 4: รัน test ให้ PASS**

Run: `bun test chat-memory.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add novel/chat-memory.ts novel/chat-memory.test.ts
git commit -m "feat(rag): cosine + per-scope vector search"
```

---

## Task 3: hybrid recall (merge + rerank)

**Files:**
- Modify: `novel/chat-memory.ts`
- Test: `novel/chat-memory.test.ts`

- [ ] **Step 1: เขียน failing test**

```ts
import { recall } from './chat-memory';

test('recall: รวม FTS + vector, dedup, คืน top-K, ตัด secret ใน char mode', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นกลัวความมืด', embedding: new Float32Array([1, 0, 0]) },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: true, speaker: 'narrator', turnIdx: 1, ts: 2, text: 'แผนลับของศัตรู', embedding: new Float32Array([0, 1, 0]) },
    { id: 's1:2', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: false, speaker: 'user', turnIdx: 2, ts: 3, text: 'ดยุคปลอบเธอ', embedding: new Float32Array([0.9, 0.1, 0]) },
  ]);
  // char mode: ตัด turnIdx 1 (secret) ออกเสมอ
  const hitsChar = recall(db, { scopeId: 's1', query: 'ความมืด', queryVec: new Float32Array([1, 0, 0]), activeChar: 'เรย์น', secret: false, excludeFromIdx: 999, k: 5, wFts: 0.5, wVec: 0.5 });
  expect(hitsChar.find((h) => h.turnIdx === 1)).toBeUndefined();
  expect(hitsChar.find((h) => h.turnIdx === 0)).toBeDefined();
});

test('recall: degrade เป็น FTS-only เมื่อ queryVec = null', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟพ่นเปลวเพลิง' },
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'มังกร', queryVec: null, activeChar: 'a', secret: false, excludeFromIdx: 999, k: 5, wFts: 0.5, wVec: 0.5 });
  expect(hits.length).toBe(1);
  expect(hits[0].turnIdx).toBe(0);
});
```

- [ ] **Step 2: รัน test ให้ FAIL**

Run: `bun test chat-memory.test.ts`
Expected: FAIL — `recall is not a function`

- [ ] **Step 3: เพิ่ม implementation (ท้าย chat-memory.ts)**

```ts
export interface RecallQuery {
  scopeId: string; query: string; queryVec: Float32Array | null; activeChar: string;
  secret: boolean; excludeFromIdx: number; k: number; wFts: number; wVec: number;
}

/** hybrid: FTS + (optional) vector → normalize → weighted rerank → top-K */
export function recall(db: Database, q: RecallQuery): MemHit[] {
  const N = Math.max(q.k * 3, 12); // ดึงผู้สมัครเผื่อ rerank
  const ftsHits = ftsSearch(db, { scopeId: q.scopeId, query: q.query, activeChar: q.activeChar, secret: q.secret, excludeFromIdx: q.excludeFromIdx, limit: N });
  const vecHits = q.queryVec
    ? vectorSearch(db, { scopeId: q.scopeId, queryVec: q.queryVec, activeChar: q.activeChar, secret: q.secret, excludeFromIdx: q.excludeFromIdx, limit: N })
    : [];

  const score = new Map<string, { hit: MemHit; s: number }>();
  // FTS: คะแนนตามอันดับ (อันดับแรก = สูงสุด) — f.rank ยิ่งน้อยยิ่งดี เลยใช้ตำแหน่งแทน
  ftsHits.forEach((h, i) => {
    const s = q.wFts * (1 - i / Math.max(ftsHits.length, 1));
    score.set(h.id, { hit: h, s });
  });
  // vector: cosine [−1,1] → [0,1]
  vecHits.forEach((h) => {
    const cs = q.wVec * (((h.cos ?? 0) + 1) / 2);
    const ex = score.get(h.id);
    if (ex) ex.s += cs;
    else score.set(h.id, { hit: h, s: cs });
  });

  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, q.k).map((e) => e.hit);
}
```

- [ ] **Step 4: รัน test ให้ PASS**

Run: `bun test chat-memory.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add novel/chat-memory.ts novel/chat-memory.test.ts
git commit -m "feat(rag): hybrid recall (FTS+vector rerank, graceful FTS-only)"
```

---

## Task 4: embedding client (pluggable)

**Files:**
- Create: `novel/embed.ts`
- Test: `novel/embed.test.ts`

- [ ] **Step 1: เขียน failing test**

```ts
// novel/embed.test.ts
import { test, expect } from 'bun:test';
import { embedConfigured, embedTexts } from './embed';

test('embedConfigured: false เมื่อไม่มี EMBED_URL/EMBED_API_KEY', () => {
  delete process.env.EMBED_URL;
  delete process.env.EMBED_API_KEY;
  expect(embedConfigured()).toBe(false);
});

test('embedTexts: คืน null เมื่อไม่ได้ตั้งค่า (degrade ไป FTS-only)', async () => {
  delete process.env.EMBED_URL;
  delete process.env.EMBED_API_KEY;
  const r = await embedTexts(['สวัสดี']);
  expect(r).toBeNull();
});

test('embedTexts: เรียก endpoint + แปลงเป็น Float32Array เมื่อตั้งค่าแล้ว', async () => {
  process.env.EMBED_URL = 'https://fake.embed/v1/embeddings';
  process.env.EMBED_API_KEY = 'k';
  process.env.EMBED_MODEL = 'text-embedding-3-small';
  process.env.EMBED_DIM = '3';
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 })) as any;
  try {
    const r = await embedTexts(['hi']);
    expect(r).not.toBeNull();
    expect(Array.from(r![0])).toEqual([0.1, 0.2, 0.3].map((x) => Math.fround(x)));
  } finally { globalThis.fetch = orig; }
});
```

- [ ] **Step 2: รัน test ให้ FAIL**

Run: `bun test embed.test.ts`
Expected: FAIL — `Cannot find module './embed'`

- [ ] **Step 3: เขียน implementation**

```ts
// novel/embed.ts
// embedding client แบบ pluggable (OpenAI-compatible /embeddings) — env-driven, degrade ได้
export function embedConfigured(): boolean {
  return !!process.env.EMBED_URL && !!process.env.EMBED_API_KEY;
}

const DIM = () => Number(process.env.EMBED_DIM ?? 512);

/** คืน Float32Array[] หรือ null ถ้าไม่ได้ตั้งค่า/เรียกพลาด (caller degrade เป็น FTS-only) */
export async function embedTexts(texts: string[]): Promise<Float32Array[] | null> {
  if (!embedConfigured() || texts.length === 0) return null;
  try {
    const res = await fetch(process.env.EMBED_URL!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.EMBED_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.EMBED_MODEL ?? 'text-embedding-3-small',
        input: texts,
        dimensions: DIM(),
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    if (!json.data?.length) return null;
    return json.data.map((d) => Float32Array.from(d.embedding));
  } catch { return null; }
}

/** embed ข้อความเดียว (สำหรับ query) — คืน null ถ้า degrade */
export async function embedOne(text: string): Promise<Float32Array | null> {
  const r = await embedTexts([text]);
  return r ? r[0] : null;
}
```

- [ ] **Step 4: รัน test ให้ PASS**

Run: `bun test embed.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add novel/embed.ts novel/embed.test.ts
git commit -m "feat(rag): pluggable embedding client (OpenAI-compatible, degradable)"
```

---

## Task 5: server endpoints (backfill / ingest / recall)

**Files:**
- Modify: `novel/server.ts` (เพิ่มหลัง endpoint `/api/chat` ที่ลงท้ายบรรทัด `})` ~801)

- [ ] **Step 1: เขียน failing test**

```ts
// novel/chat-memory-endpoints.test.ts
import { test, expect } from 'bun:test';
import { openMemDb, ingestMemory, recall } from './chat-memory';

// ทดสอบ logic ที่ endpoint ใช้ (ไม่ยิง HTTP จริง): backfill = ingest หลายแถว, recall ทำงานต่อ
test('flow: backfill messages → recall กู้ turn เก่าที่ถูกตัดจาก context', () => {
  const db = openMemDb(':memory:');
  const msgs = [
    { role: 'char', text: 'เรย์นเล่าว่าพ่อแม่ตายในไฟไหม้ตอนเด็ก' },
    { role: 'user', text: 'อืม' }, { role: 'char', text: 'อากาศดีนะ' },
    { role: 'user', text: 'ใช่' }, { role: 'char', text: 'เดินเล่นกัน' },
  ];
  ingestMemory(db, msgs.map((m, i) => ({
    id: `s1:${i}`, scopeId: 's1', kind: 'chat' as const, charId: 'เรย์น', secret: false,
    speaker: m.role, turnIdx: i, ts: i + 1, text: m.text,
  })));
  // raw context เก็บแค่ 2 ข้อความท้าย → excludeFromIdx = 3 ; ถาม "ไฟไหม้"
  const hits = recall(db, { scopeId: 's1', query: 'ไฟไหม้', queryVec: null, activeChar: 'เรย์น', secret: false, excludeFromIdx: 3, k: 4, wFts: 0.5, wVec: 0.5 });
  expect(hits[0].turnIdx).toBe(0);
});
```

- [ ] **Step 2: รัน test ให้ FAIL → จริง ๆ test นี้ผ่านได้เลย (ใช้ของ Task 1-3)**

Run: `bun test chat-memory-endpoints.test.ts`
Expected: PASS — ยืนยัน logic backfill+recall ใช้ได้ก่อนต่อสาย HTTP

- [ ] **Step 3: เพิ่ม import ที่หัว `novel/server.ts`**

หาเลขบรรทัด import ของ chat-prompt (`import { assembleChatPrompt, ... } from './chat-prompt';` ~บรรทัด 7) แล้วเพิ่มใต้ block import:

```ts
import { getMemDb, ingestMemory, recall, type MemRow } from './chat-memory';
import { embedTexts, embedOne } from './embed';
```

- [ ] **Step 4: เพิ่ม 3 endpoint (วางต่อจาก `.post('/api/chat', ...)` ก่อน `.post('/api/chat/scene-image', ...)`)**

```ts
  // --- RAG memory: backfill (index session ทั้งก้อนครั้งเดียว) ---
  .post('/api/chat/memory/backfill', async ({ body }) => {
    const b = body as { scopeId: string; kind?: 'chat' | 'novel'; rows: Omit<MemRow, 'embedding' | 'kind'>[] };
    if (!b?.scopeId || !Array.isArray(b.rows)) return { ok: false, error: 'missing scopeId/rows' };
    try {
      const db = getMemDb();
      // FTS sync ทันที (ฟรี/เร็ว) — ยังไม่ใส่ embedding
      const rows: MemRow[] = b.rows.map((r) => ({ ...r, kind: b.kind ?? 'chat', embedding: null }));
      ingestMemory(db, rows);
      // embedding async (best-effort) — เติม BLOB ให้แถวที่เพิ่ง ingest
      const vecs = await embedTexts(rows.map((r) => r.text));
      if (vecs) {
        const upd = db.prepare('UPDATE mem SET embedding = ? WHERE id = ?');
        const tx = db.transaction(() => rows.forEach((r, i) => {
          const v = vecs[i]; upd.run(Buffer.from(v.buffer, v.byteOffset, v.byteLength), r.id);
        }));
        tx();
      }
      return { ok: true, count: rows.length, embedded: !!vecs };
    } catch (e: any) { return { ok: false, error: e.message }; }
  })

  // --- RAG memory: ingest turn ใหม่ (เรียกหลังได้คำตอบ) ---
  .post('/api/chat/memory/ingest', async ({ body }) => {
    const b = body as { scopeId: string; kind?: 'chat' | 'novel'; rows: Omit<MemRow, 'embedding' | 'kind'>[] };
    if (!b?.scopeId || !Array.isArray(b.rows)) return { ok: false, error: 'missing scopeId/rows' };
    try {
      const db = getMemDb();
      const vecs = await embedTexts(b.rows.map((r) => r.text));
      const rows: MemRow[] = b.rows.map((r, i) => ({ ...r, kind: b.kind ?? 'chat', embedding: vecs ? vecs[i] : null }));
      ingestMemory(db, rows);
      return { ok: true, count: rows.length, embedded: !!vecs };
    } catch (e: any) { return { ok: false, error: e.message }; }
  })

  // --- RAG memory: recall (เรียกก่อน sendChat) ---
  .post('/api/chat/memory/recall', async ({ body }) => {
    const b = body as {
      scopeId: string; query: string; activeChar: string;
      mode?: 'char' | 'narrator'; excludeFromIdx: number; k?: number;
    };
    if (!b?.scopeId || !b?.query) return { ok: true, memories: [] };
    try {
      const db = getMemDb();
      const queryVec = await embedOne(b.query);
      const hits = recall(db, {
        scopeId: b.scopeId, query: b.query, queryVec, activeChar: b.activeChar,
        secret: b.mode === 'narrator', excludeFromIdx: b.excludeFromIdx, k: b.k ?? 4, wFts: 0.5, wVec: 0.5,
      });
      // budget ~600 token ≈ ตัด text ที่ยาวเกิน 400 ตัวอักษร/ก้อน
      const memories = hits.map((h) => `[เทิร์น ${h.turnIdx}] ${h.text.slice(0, 400)}`);
      return { ok: true, memories };
    } catch (e: any) { return { ok: false, error: e.message, memories: [] }; }
  })
```

- [ ] **Step 5: รัน server ยืนยันคอมไพล์ได้**

Run: `cd novel && timeout 5 bun server.ts 2>&1 | head -5 || true`
Expected: เห็น log mongo connect / ไม่มี syntax error (ถ้าไม่มี MONGODB_URI จะ error เรื่อง mongo — รับได้ ขอแค่ไม่มี TS/syntax error ของไฟล์ที่แก้)

- [ ] **Step 6: Commit**

```bash
git add novel/server.ts novel/chat-memory-endpoints.test.ts
git commit -m "feat(rag): server endpoints backfill/ingest/recall"
```

---

## Task 6: ฉีด recalled เข้า prompt

**Files:**
- Modify: `novel/chat-prompt.ts` (เพิ่ม section + พารามใหม่), `novel/server.ts` (รับ `recalled` ใน `/api/chat` ส่งต่อ)
- Test: `novel/chat-prompt.test.ts`

- [ ] **Step 1: เขียน failing test**

```ts
// novel/chat-prompt.test.ts
import { test, expect } from 'bun:test';
import { assembleChatPrompt, type ChatCharLite } from './chat-prompt';

const char: ChatCharLite = { name: 'เรย์น' };

test('recalled[] ถูก render เป็น section ความทรงจำ', () => {
  const sys = assembleChatPrompt(char, 0, undefined, false, undefined, undefined, false, undefined, ['[เทิร์น 3] กลัวความมืด']);
  expect(sys).toContain('ความทรงจำที่เกี่ยวข้อง');
  expect(sys).toContain('กลัวความมืด');
});

test('ไม่มี recalled → ไม่มี section', () => {
  const sys = assembleChatPrompt(char, 0);
  expect(sys).not.toContain('ความทรงจำที่เกี่ยวข้อง');
});
```

- [ ] **Step 2: รัน test ให้ FAIL**

Run: `bun test chat-prompt.test.ts`
Expected: FAIL — section ไม่ถูก render (arg ที่ 9 ยังไม่มี)

- [ ] **Step 3: แก้ `chat-prompt.ts`**

(a) เพิ่ม helper ใต้ `stateSection` (~บรรทัด 69):

```ts
/** section ความจำที่ recall มา — วางใกล้ lore (อิทธิพลสูง แต่ไม่ทับ "สถานะปัจจุบัน") */
function recalledSection(recalled?: string[]): string {
  if (!recalled?.length) return '';
  return `\n=== ความทรงจำที่เกี่ยวข้องกับตอนนี้ (กู้จากเหตุการณ์เก่า — ถือว่าเกิดขึ้นจริง ให้สอดคล้อง) ===\n${recalled.map((m) => `- ${m.trim()}`).join('\n')}\n`;
}
```

(b) แก้ signature ของ `assembleChatPrompt` (บรรทัด 72) เพิ่ม arg ท้าย:

```ts
export function assembleChatPrompt(c: ChatCharLite, rel: number, summary?: string, compact = false, lore?: string[], state?: string, emitStateDelta = false, player?: PlayerPersonaLite, recalled?: string[]): string {
```

(c) แก้บรรทัด render lore+state (บรรทัด 135) ให้แทรก recalled ก่อน lore:

```ts
${recalledSection(recalled)}${loreSection(lore)}${stateSection(state)}${emitStateDelta ? STATE_DELTA_INSTRUCTION + '\n' : ''}
```

- [ ] **Step 4: รัน test ให้ PASS**

Run: `bun test chat-prompt.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: แก้ `/api/chat` ใน server.ts ให้รับ `recalled` ส่งต่อ**

(a) ใน type ของ body (หลัง `mode?: 'char' | 'narrator';` ~บรรทัด 734) เพิ่ม:

```ts
      recalled?: string[];   // ความทรงจำที่ client recall มาแล้ว — ฉีดเข้า prompt
```

(b) แก้บรรทัดเรียก `assembleChatPrompt` (บรรทัด 755) เพิ่ม arg ท้าย:

```ts
        : assembleChatPrompt(b.char, rel, b.summary, compact, b.lore, stateText, trackState, b.playerPersona, b.recalled);
```

- [ ] **Step 6: รัน test ทั้งหมด + ยืนยันคอมไพล์**

Run: `bun test chat-prompt.test.ts && cd novel && bun -e "import('./server.ts').catch(e=>{console.error(e.message);process.exit(/MONGODB_URI/.test(e.message)?0:1)})"`
Expected: test PASS; import ไม่ throw syntax/TS error (mongo error รับได้)

- [ ] **Step 7: Commit**

```bash
git add novel/chat-prompt.ts novel/chat-prompt.test.ts novel/server.ts
git commit -m "feat(rag): inject recalled memories section into chat prompt"
```

---

## Task 7: client API functions

**Files:**
- Modify: `novel-next/src/lib/chat-api.ts`

- [ ] **Step 1: เพิ่ม client fn (วางต่อท้าย sendChat ~บรรทัด 53)**

```ts
// ---- RAG memory (ฝั่ง client เรียก server-side sqlite store) ----
export interface MemRowInput {
  id: string; scopeId: string; charId?: string | null; secret: boolean;
  speaker: string; turnIdx: number; ts: number; text: string;
}
export const memBackfill = (scopeId: string, rows: MemRowInput[]) =>
  jsonFetch<{ ok: boolean; count?: number; embedded?: boolean; error?: string }>(
    '/api/chat/memory/backfill', { method: 'POST', body: JSON.stringify({ scopeId, kind: 'chat', rows }) });

export const memIngest = (scopeId: string, rows: MemRowInput[]) =>
  jsonFetch<{ ok: boolean; count?: number; embedded?: boolean; error?: string }>(
    '/api/chat/memory/ingest', { method: 'POST', body: JSON.stringify({ scopeId, kind: 'chat', rows }) });

export const memRecall = (body: { scopeId: string; query: string; activeChar: string; mode?: 'char' | 'narrator'; excludeFromIdx: number; k?: number }) =>
  jsonFetch<{ ok: boolean; memories: string[]; error?: string }>(
    '/api/chat/memory/recall', { method: 'POST', body: JSON.stringify(body) });
```

- [ ] **Step 2: เพิ่ม `recalled` ใน body ของ sendChat**

ใน object type ของ `sendChat` (หลัง `mode?: 'char' | 'narrator';` ~บรรทัด 48) เพิ่ม:

```ts
  recalled?: string[];   // ความทรงจำที่ recall มา — ฉีดเข้า prompt
```

- [ ] **Step 3: ยืนยัน build ผ่าน**

Run: `cd novel-next && bunx tsc --noEmit 2>&1 | head -20`
Expected: ไม่มี error ใหม่จาก chat-api.ts (error เดิมของไฟล์อื่น ถ้ามี ไม่นับ)

- [ ] **Step 4: Commit**

```bash
git add novel-next/src/lib/chat-api.ts
git commit -m "feat(rag): client api memBackfill/memIngest/memRecall + recalled in sendChat"
```

---

## Task 8: ChatScreen wiring (backfill / ingest / recall)

**Files:**
- Modify: `novel-next/src/components/screens/chat/ChatScreen.tsx`

**บริบทที่อิง:** `callModel(userInput, baseRel, hist, ...)` บรรทัด 319; ใน `try` เรียก `buildMemory(hist)` → ได้ `{ summary, raw }` แล้ว `sendChat(...)` บรรทัด 325. `sessionId`, `sessChar`, `messages`, `session` มีใน scope. `raw` คือ context ดิบที่ส่งไป = ส่วนที่ต้องตัดจาก recall.

- [ ] **Step 1: เพิ่ม import**

ใน import จาก chat-api (บรรทัด 6) เพิ่ม `memBackfill, memIngest, memRecall`:

```ts
import { sendChat, summarizeChat, judgeRel, chatSceneImage, extractState, generatePlayerPersona, memBackfill, memIngest, memRecall } from '@/lib/chat-api';
```

- [ ] **Step 2: backfill ตอนเปิด session (เพิ่ม useEffect — วางใกล้ useEffect อื่น ๆ ในคอมโพเนนต์)**

```ts
  // RAG: backfill ความจำของ session ครั้งแรกที่เปิด (idempotent ฝั่ง server ด้วย INSERT OR IGNORE)
  const backfilledRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sessionId || !sessChar || backfilledRef.current.has(sessionId)) return;
    const msgs = (session?.messages ?? []).filter((m) => !m.item);
    if (!msgs.length) { backfilledRef.current.add(sessionId); return; }
    backfilledRef.current.add(sessionId);
    const rows = msgs.map((m, i) => ({
      id: `${sessionId}:${i}`, scopeId: sessionId, charId: sessChar.name,
      secret: m.role === 'narrator' ? !!m.secret : false,
      speaker: m.role, turnIdx: i, ts: m.ts ?? i, text: m.text,
    }));
    memBackfill(sessionId, rows).catch(() => {});
  }, [sessionId, sessChar, session?.messages]);
```

> ถ้า `useRef`/`useEffect` ยังไม่ import ที่หัวไฟล์ ให้เพิ่มใน `import { ... } from 'react'`

- [ ] **Step 3: recall ก่อน sendChat + ingest หลังได้คำตอบ (แก้ใน `callModel`)**

แทนที่บล็อกใน `try` ของ `callModel` (บรรทัด 322-325) ด้วย:

```ts
      const { summary, raw } = await buildMemory(hist);
      const history = raw.map(toHist);
      // RAG recall: กู้ turn เก่าที่เกี่ยวข้อง — ตัดส่วนที่อยู่ใน raw context อยู่แล้ว (excludeFromIdx)
      const allMsgs = (session?.messages ?? []).filter((m) => !m.item);
      const excludeFromIdx = Math.max(0, allMsgs.length - raw.length);
      let recalled: string[] | undefined;
      try {
        const rc = await memRecall({ scopeId: sessionId, query: userInput, activeChar: sessChar.name, mode: 'char', excludeFromIdx, k: 4 });
        recalled = rc.memories.length ? rc.memories : undefined;
      } catch { /* degrade: ไม่มี recall ก็ส่งปกติ */ }
      const r = await sendChat({ char: sessChar, history, user_input: userInput, rel: baseRel, summary: summary || undefined, lore: pickLore(raw, userInput), state: stateToText(session?.stateCard), stateCard: session?.liveState ?? emptyLiveState(), playerPersona: session?.playerPersona, provider, recalled, max_tokens: maxTok ?? 1500 });
```

จากนั้นใน block `if (r.ok && r.text)` หลัง `updateSession(... messages: [...s.messages, { role: 'char', ... }] ...)` (หลังบรรทัด 330) เพิ่ม ingest 2 ข้อความใหม่ (user + char):

```ts
        // RAG: index 2 ข้อความใหม่ (turnIdx = ตำแหน่งจริงใน timeline)
        const baseIdx = allMsgs.length; // user msg ถูก append ก่อนเรียก callModel แล้ว → index ปัจจุบัน
        memIngest(sessionId, [
          { id: `${sessionId}:${baseIdx - 1}`, scopeId: sessionId, charId: sessChar.name, secret: false, speaker: 'user', turnIdx: baseIdx - 1, ts: ts - 1, text: userInput },
          { id: `${sessionId}:${baseIdx}`, scopeId: sessionId, charId: sessChar.name, secret: false, speaker: 'char', turnIdx: baseIdx, ts, text },
        ]).catch(() => {});
```

> หมายเหตุ turnIdx: ใน `send()` ข้อความ user ถูก append เข้า `messages` ก่อนเรียก `callModel` แล้ว ดังนั้น `allMsgs.length` (อ่านตอนต้น callModel) = index ของ char reply ที่กำลังจะเพิ่ม, และ user msg อยู่ที่ `allMsgs.length - 1`. recall ใช้ excludeFromIdx จากค่าเดียวกันนี้จึงสอดคล้อง.

- [ ] **Step 4: ยืนยัน build**

Run: `cd novel-next && bunx tsc --noEmit 2>&1 | head -20`
Expected: ไม่มี error ใหม่จาก ChatScreen.tsx

- [ ] **Step 5: Commit**

```bash
git add novel-next/src/components/screens/chat/ChatScreen.tsx
git commit -m "feat(rag): wire backfill/ingest/recall into ChatScreen"
```

---

## Task 9: config — Mongo cache cap + EMBED env + sqlite volume

**Files:**
- Modify: `.env.docker.example`, `docker-compose.yml`

- [ ] **Step 1: เพิ่ม EMBED_* ใน `.env.docker.example`**

```bash
# --- RAG embedding (ทางเลือก: ไม่ตั้ง = ใช้ FTS keyword อย่างเดียว) ---
# ⚠️ เนื้อหา R18: เลี่ยงผู้ให้บริการที่ moderate เข้ม (เช่น OpenAI อาจแบนบัญชี)
#    เลือกเจ้าที่อนุญาต mature content หรือ self-host embedding ก็ได้
EMBED_URL=
EMBED_API_KEY=
EMBED_MODEL=text-embedding-3-small
EMBED_DIM=512
# path ไฟล์ sqlite ของ RAG (ใน container — map กับ volume ใน docker-compose)
MEM_DB_PATH=/data/chat-mem.sqlite
```

- [ ] **Step 2: แก้ `docker-compose.yml` — cap Mongo cache + volume sqlite**

หา service `mongo` แล้วเพิ่ม `command` จำกัด cache (สำคัญบน VPS 3GB):

```yaml
    command: ["mongod", "--wiredTigerCacheSizeGB", "0.5"]
```

หา service backend (bun server) เพิ่ม volume ให้ sqlite อยู่ถาวร:

```yaml
    volumes:
      - mem-data:/data
```

และใน `volumes:` ระดับบนสุดเพิ่ม:

```yaml
  mem-data:
```

- [ ] **Step 3: ยืนยัน compose valid**

Run: `docker compose config >/dev/null && echo OK`
Expected: `OK` (ถ้าไม่มี docker ในเครื่อง dev ข้าม step นี้ได้ — ตรวจตอน deploy)

- [ ] **Step 4: Commit**

```bash
git add .env.docker.example docker-compose.yml
git commit -m "chore(rag): cap mongo cache, EMBED_* env, persist sqlite volume"
```

---

## Self-Review note (ผู้เขียนแผนตรวจแล้ว)

- **Spec coverage:** §3 store→T1-3; §4 visibility/charId/secret→T1,T3; §5 hybrid+degrade→T3; §4 embed pluggable→T4; endpoints→T5; §6 inject→T6; backfill→T5,T8; client→T7,T8; §8 RAM/Mongo cap→T9. นิยาย (§10) = เฟส 2 ไม่อยู่ในแผนนี้ (โดยตั้งใจ).
- **Type consistency:** `MemRow`/`MemHit`/`recall`/`ftsSearch`/`vectorSearch`/`cosine`/`toFtsMatch` นิยามใน T1-3 ใช้ชื่อเดียวกันตลอด; `embedTexts`/`embedOne`/`embedConfigured` ใน T4 ตรงกับที่ server เรียกใน T5; client `memBackfill/memIngest/memRecall` (T7) ตรงกับที่ ChatScreen เรียก (T8).
- **excludeFromIdx:** นิยามเดียว = `allMsgs.length - raw.length` ใช้ทั้ง recall param และ exclude ใน sqlite (`turnIdx < excludeFromIdx`).
```
