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
  importance?: number;   // 0-5 (จาก extractState) — fact สำคัญถูกบูสต์ตอน recall. default 0
  persistent?: boolean;  // true = fact ถาวร (ปม/ความลับ/คำสัญญา) — บูสต์เพิ่ม. default false
}

export interface FtsQuery {
  scopeId: string;
  query: string;
  activeChar: string;
  narratorMode: boolean; // true = narrator (เห็นฉากลับทั้งหมด); false = char mode (ตัด secret ออก)
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
    turnIdx INTEGER NOT NULL, ts INTEGER NOT NULL, text TEXT NOT NULL, embedding BLOB,
    importance INTEGER NOT NULL DEFAULT 0, persistent INTEGER NOT NULL DEFAULT 0
  )`);
  // migration: เพิ่มคอลัมน์ importance/persistent ให้ DB เดิม (prod) ที่สร้างก่อน Phase 3 Part B
  const cols = (db.query('PRAGMA table_info(mem)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('importance')) db.exec('ALTER TABLE mem ADD COLUMN importance INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('persistent')) db.exec('ALTER TABLE mem ADD COLUMN persistent INTEGER NOT NULL DEFAULT 0');
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
    `INSERT OR IGNORE INTO mem (id, scopeId, kind, charId, secret, speaker, turnIdx, ts, text, embedding, importance, persistent)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insFts = db.prepare('INSERT INTO mem_fts (id, text) VALUES (?, ?)');
  const tx = db.transaction((items: MemRow[]) => {
    for (const r of items) {
      const blob = r.embedding ? Buffer.from(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength) : null;
      const res = insMem.run(r.id, r.scopeId, r.kind, r.charId ?? null, r.secret ? 1 : 0, r.speaker, r.turnIdx, r.ts, r.text, blob, r.importance ?? 0, r.persistent ? 1 : 0);
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

function visibilitySql(narratorMode: boolean, activeChar: string): { clause: string; params: any[] } {
  if (narratorMode) return { clause: '1=1', params: [] }; // narrator เห็นหมด
  return { clause: '(m.secret = 0 AND (m.charId IS NULL OR m.charId = ?))', params: [activeChar] };
}

export function ftsSearch(db: Database, q: FtsQuery): MemHit[] {
  const match = toFtsMatch(q.query);
  if (!match) return [];
  const vis = visibilitySql(q.narratorMode, q.activeChar);
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
    importance: typeof r.importance === 'number' ? r.importance : 0,
    persistent: !!r.persistent,
    ftsRank: typeof r.ftsRank === 'number' ? r.ftsRank : undefined,
  };
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface VecQuery {
  scopeId: string; queryVec: Float32Array; activeChar: string;
  narratorMode: boolean; excludeFromIdx: number; limit: number;
}

export function vectorSearch(db: Database, q: VecQuery): MemHit[] {
  const vis = visibilitySql(q.narratorMode, q.activeChar);
  const sql = `SELECT m.* FROM mem m
    WHERE m.scopeId = ? AND m.turnIdx < ? AND m.embedding IS NOT NULL AND ${vis.clause}`;
  const rows = db.query(sql).all(q.scopeId, q.excludeFromIdx, ...vis.params) as any[];
  const hits = rows.map(rowToHit).map((h) => ({
    ...h,
    cos: h.embedding && h.embedding.length === q.queryVec.length ? cosine(q.queryVec, h.embedding) : 0,
  }));
  hits.sort((x, y) => (y.cos ?? 0) - (x.cos ?? 0));
  return hits.slice(0, q.limit);
}

export interface RecallQuery {
  scopeId: string; query: string; queryVec: Float32Array | null; activeChar: string;
  narratorMode: boolean; excludeFromIdx: number; k: number; wFts: number; wVec: number;
  wRecency?: number; // ถ่วงความจำที่สดกว่าเล็กน้อย (turnIdx สูง = ใหม่). default 0 = ปิด
  wImp?: number;     // บูสต์ตาม importance (0-5 → 0-1). default 0 = ปิด
  wPersist?: number; // บูสต์ fact ถาวร (persistent). default 0 = ปิด
  fusion?: 'weighted' | 'rrf'; // วิธีรวมสัญญาณ FTS+vector. default 'weighted'. rrf = robust กว่า (ใช้อันดับ ไม่ใช่ค่าดิบ)
}

const RRF_K = 60; // ค่าคงที่มาตรฐาน RRF — กันหารศูนย์ + คุมน้ำหนักของอันดับท้าย ๆ

/** hybrid: FTS + (optional) vector → fuse (weighted-normalize หรือ RRF) → recency → top-K */
export function recall(db: Database, q: RecallQuery): MemHit[] {
  const N = Math.max(q.k * 5, 20); // ดึงผู้สมัครเผื่อ rerank (กว้างพอให้ dedup FTS∩vector แล้วยังเหลือ rerank)
  const ftsHits = ftsSearch(db, { scopeId: q.scopeId, query: q.query, activeChar: q.activeChar, narratorMode: q.narratorMode, excludeFromIdx: q.excludeFromIdx, limit: N });
  const vecHits = q.queryVec
    ? vectorSearch(db, { scopeId: q.scopeId, queryVec: q.queryVec, activeChar: q.activeChar, narratorMode: q.narratorMode, excludeFromIdx: q.excludeFromIdx, limit: N })
    : [];

  // FTS-only (queryVec=null): ให้ FTS กินน้ำหนักเต็ม ไม่งั้นคะแนนสูงสุดถูกตรึงที่ wFts (เช่น 0.35)
  const wFts = q.queryVec ? q.wFts : 1;
  const wVec = q.queryVec ? q.wVec : 0;
  const wRec = q.wRecency ?? 0;

  const score = new Map<string, { hit: MemHit; s: number }>();
  if (q.fusion === 'rrf') {
    // RRF: คะแนน = w/(K+อันดับ) — ทนทานกว่า ไม่ต้อง normalize ค่าดิบ; ก้อนที่ติดทั้งสองสัญญาณรวมคะแนนเด่นขึ้น
    // ftsHits เรียงตาม FTS rank แล้ว, vecHits เรียงตาม cosine แล้ว → ใช้ index เป็นอันดับได้ตรง
    ftsHits.forEach((h, rank) => {
      score.set(h.id, { hit: h, s: wFts / (RRF_K + rank) });
    });
    vecHits.forEach((h, rank) => {
      const s = wVec / (RRF_K + rank);
      const ex = score.get(h.id);
      if (ex) { ex.s += s; ex.hit = { ...ex.hit, cos: h.cos }; }
      else score.set(h.id, { hit: h, s });
    });
  } else {
    // weighted-normalize (default): FTS bm25 rank → [0,1] (magnitude จริง ให้ชื่อเฉพาะที่ match แน่นเด่นกว่า match อ่อน)
    if (ftsHits.length > 0) {
      const ranks = ftsHits.map((h) => h.ftsRank ?? 0);
      const best = Math.min(...ranks), worst = Math.max(...ranks); // best = ติดลบสุด
      ftsHits.forEach((h) => {
        const r = h.ftsRank ?? 0;
        const norm = worst === best ? 1 : (worst - r) / (worst - best); // best→1, worst→0
        score.set(h.id, { hit: h, s: wFts * norm });
      });
    }
    // vector: cosine [−1,1] → [0,1]
    vecHits.forEach((h) => {
      const cs = wVec * (((h.cos ?? 0) + 1) / 2);
      const ex = score.get(h.id);
      if (ex) { ex.s += cs; ex.hit = { ...ex.hit, cos: h.cos }; } // match ทั้งสองทาง: รวมคะแนน + ติด cos
      else score.set(h.id, { hit: h, s: cs });
    });
  }

  // recency tiebreak: บูสต์ความจำที่สดกว่าเล็กน้อย (กันของเก่าที่ keyword ซ้ำ แย่งอันดับจากเหตุการณ์ล่าสุด)
  if (wRec > 0 && score.size > 1) {
    const idxs = [...score.values()].map((e) => e.hit.turnIdx);
    const maxIdx = Math.max(...idxs), minIdx = Math.min(...idxs);
    if (maxIdx > minIdx) {
      score.forEach((e) => { e.s += wRec * ((e.hit.turnIdx - minIdx) / (maxIdx - minIdx)); });
    }
  }

  // importance/persistence boost: fact สำคัญ (จาก extractState) ดันขึ้นเมื่อ relevance ใกล้กัน
  const wImp = q.wImp ?? 0;
  const wPersist = q.wPersist ?? 0;
  if (wImp > 0 || wPersist > 0) {
    score.forEach((e) => {
      e.s += wImp * ((e.hit.importance ?? 0) / 5) + wPersist * (e.hit.persistent ? 1 : 0);
    });
  }

  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, q.k).map((e) => e.hit);
}

/** ลบความจำตาม id (ใช้ตอน regen/แก้ข้อความ — ลบของเก่าก่อน ingest ใหม่ ให้ข้อความใหม่ชนะ) */
export function deleteMemory(db: Database, ids: string[]): void {
  if (!ids.length) return;
  const delMem = db.prepare('DELETE FROM mem WHERE id = ?');
  const delFts = db.prepare('DELETE FROM mem_fts WHERE id = ?');
  const tx = db.transaction((items: string[]) => {
    for (const id of items) { delMem.run(id); delFts.run(id); }
  });
  tx(ids);
}

/** ลบความจำทั้ง scope (ใช้ตอนลบข้อความใน session — ให้ backfill สร้าง index ใหม่ กัน id เพี้ยนหลังเลื่อน index) */
export function deleteScope(db: Database, scopeId: string): void {
  const ids = (db.query('SELECT id FROM mem WHERE scopeId = ?').all(scopeId) as { id: string }[]).map((r) => r.id);
  deleteMemory(db, ids);
}

export interface SyncStats { added: number; updated: number; deleted: number; unchanged: number }

/** reconcile ทั้ง scope ให้ตรงกับ rows ปัจจุบัน (heal edit/ลบ/regen/สลับลำดับ).
 *  เทียบ text ที่เก็บไว้กับ text ใหม่ = content hash โดยพฤตินัย — ไม่ต้อง migrate schema.
 *  คืน toEmbed = แถวที่ต้อง embed (ใหม่ + เนื้อเปลี่ยน + unchanged แต่ embedding ยัง NULL) เพื่อให้ caller ยิง embed ทีเดียว */
export function syncScope(db: Database, scopeId: string, rows: MemRow[]): { toEmbed: MemRow[]; stats: SyncStats } {
  const existing = new Map<string, { text: string; hasEmb: boolean }>();
  for (const r of db.query('SELECT id, text, (embedding IS NOT NULL) AS hasEmb FROM mem WHERE scopeId = ?').all(scopeId) as any[]) {
    existing.set(r.id, { text: r.text, hasEmb: !!r.hasEmb });
  }
  const incoming = new Set(rows.map((r) => r.id));
  const insMem = db.prepare(
    `INSERT INTO mem (id, scopeId, kind, charId, secret, speaker, turnIdx, ts, text, embedding, importance, persistent)
     VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)`);
  const updMem = db.prepare('UPDATE mem SET kind=?, charId=?, secret=?, speaker=?, turnIdx=?, ts=?, text=?, embedding=NULL, importance=?, persistent=? WHERE id=?');
  const insFts = db.prepare('INSERT INTO mem_fts (id, text) VALUES (?, ?)');
  const delFts = db.prepare('DELETE FROM mem_fts WHERE id = ?');
  const delMem = db.prepare('DELETE FROM mem WHERE id = ?');
  const toEmbed: MemRow[] = [];
  const stats: SyncStats = { added: 0, updated: 0, deleted: 0, unchanged: 0 };
  const tx = db.transaction(() => {
    for (const r of rows) {
      const ex = existing.get(r.id);
      if (!ex) {
        insMem.run(r.id, r.scopeId, r.kind, r.charId ?? null, r.secret ? 1 : 0, r.speaker, r.turnIdx, r.ts, r.text, r.importance ?? 0, r.persistent ? 1 : 0);
        insFts.run(r.id, r.text);
        toEmbed.push(r); stats.added++;
      } else if (ex.text !== r.text) {
        updMem.run(r.kind, r.charId ?? null, r.secret ? 1 : 0, r.speaker, r.turnIdx, r.ts, r.text, r.importance ?? 0, r.persistent ? 1 : 0, r.id);
        delFts.run(r.id); insFts.run(r.id, r.text);
        toEmbed.push(r); stats.updated++;
      } else {
        stats.unchanged++;
        if (!ex.hasEmb) toEmbed.push(r); // re-embed แถวที่ยังไม่มีเวกเตอร์ (เปิด EMBED ทีหลัง)
      }
    }
    for (const id of existing.keys()) {
      if (!incoming.has(id)) { delMem.run(id); delFts.run(id); stats.deleted++; }
    }
  });
  tx();
  return { toEmbed, stats };
}
