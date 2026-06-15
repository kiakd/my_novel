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
    ftsRank: typeof r.ftsRank === 'number' ? r.ftsRank : undefined,
  };
}
