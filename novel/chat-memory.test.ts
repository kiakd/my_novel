import { test, expect } from 'bun:test';
import { tmpdir } from 'os';
import { rmSync } from 'fs';
import { Database } from 'bun:sqlite';
import { openMemDb, ingestMemory, ftsSearch, cosine, vectorSearch, recall, deleteMemory, deleteScope, syncScope } from './chat-memory';

test('ingest + fts trigram จับคำไทยได้', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นสารภาพว่ากลัวความมืดมาตั้งแต่เด็ก' },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: false, speaker: 'user', turnIdx: 1, ts: 2, text: 'ดยุคยื่นมือช่วยพยุงเธอขึ้น' },
  ]);
  const hits = ftsSearch(db, { scopeId: 's1', query: 'ความมืด', activeChar: 'เรย์น', narratorMode: false, excludeFromIdx: 999, limit: 5 });
  expect(hits.map((h) => h.turnIdx)).toEqual([0]);
});

test('ingest ซ้ำ id เดิม ไม่เพิ่มแถว (idempotent — รองรับ backfill ซ้ำ)', () => {
  const db = openMemDb(':memory:');
  const row = { id: 's1:0', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'สวัสดีตอนเช้า' };
  ingestMemory(db, [row]);
  ingestMemory(db, [row]);
  const hits = ftsSearch(db, { scopeId: 's1', query: 'สวัสดี', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 });
  expect(hits.length).toBe(1);
});

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
  const hits = vectorSearch(db, { scopeId: 's1', queryVec: new Float32Array([0.9, 0.1, 0]), activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 });
  expect(hits[0].turnIdx).toBe(0);
  expect(hits[0].cos).toBeGreaterThan(hits[1].cos!);
});

test('recall: รวม FTS + vector, dedup, คืน top-K, ตัด secret ใน char mode', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นกลัวความมืด', embedding: new Float32Array([1, 0, 0]) },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: true, speaker: 'narrator', turnIdx: 1, ts: 2, text: 'แผนลับของศัตรู', embedding: new Float32Array([0, 1, 0]) },
    { id: 's1:2', scopeId: 's1', kind: 'chat', charId: 'เรย์น', secret: false, speaker: 'user', turnIdx: 2, ts: 3, text: 'ดยุคปลอบเธอ', embedding: new Float32Array([0.9, 0.1, 0]) },
  ]);
  // char mode: ตัด turnIdx 1 (secret) ออกเสมอ
  const hitsChar = recall(db, { scopeId: 's1', query: 'ความมืด', queryVec: new Float32Array([1, 0, 0]), activeChar: 'เรย์น', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 0.5, wVec: 0.5 });
  expect(hitsChar.find((h) => h.turnIdx === 1)).toBeUndefined();
  expect(hitsChar.find((h) => h.turnIdx === 0)).toBeDefined();
});

test('recall: degrade เป็น FTS-only เมื่อ queryVec = null', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟพ่นเปลวเพลิง' },
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'มังกร', queryVec: null, activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 0.5, wVec: 0.5 });
  expect(hits.length).toBe(1);
  expect(hits[0].turnIdx).toBe(0);
});

test('recall: recency tiebreak — ข้อความสดกว่า (turnIdx สูง) มาก่อนเมื่อ relevance เท่ากัน', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ' },
    { id: 's1:5', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 5, ts: 2, text: 'มังกรไฟ' },
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'มังกรไฟ', queryVec: null, activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 1, wVec: 0, wRecency: 0.5 });
  expect(hits[0].turnIdx).toBe(5);
});

test('deleteMemory: ลบ id ออกจากทั้ง mem และ mem_fts', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นกลัวความมืด' },
  ]);
  deleteMemory(db, ['s1:0']);
  const hits = ftsSearch(db, { scopeId: 's1', query: 'ความมืด', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 });
  expect(hits.length).toBe(0);
  expect((db.query('SELECT count(*) c FROM mem').get() as any).c).toBe(0);
});

test('deleteScope: ลบทั้ง scope แต่ไม่แตะ scope อื่น', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟตัวที่หนึ่ง' },
    { id: 's2:0', scopeId: 's2', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟตัวที่สอง' },
  ]);
  deleteScope(db, 's1');
  expect(ftsSearch(db, { scopeId: 's1', query: 'มังกร', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(0);
  expect(ftsSearch(db, { scopeId: 's2', query: 'มังกร', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(1);
});

test('syncScope: added/updated/deleted/unchanged ถูกต้อง', () => {
  const db = openMemDb(':memory:');
  // seed: เคยถูก embed มาแล้ว (มี vector) — re-sync ไม่ควร re-embed แถวที่ไม่เปลี่ยน
  // ใช้คำเฉพาะตัวต่อแถว (ไม่แชร์ prefix) เพื่อให้ trigram FTS แยกแถวได้ชัด ไม่ชนกัน
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'user', turnIdx: 0, ts: 1, text: 'สวัสดีตอนเช้านะ', embedding: new Float32Array([1, 0, 0]) },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'เรย์นกลัวความมืด', embedding: new Float32Array([0, 1, 0]) },
    { id: 's1:2', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 2, ts: 3, text: 'มังกรไฟพ่นเปลวเพลิง', embedding: new Float32Array([0, 0, 1]) },
  ]);
  // current transcript: s1:0 เหมือนเดิม, s1:1 ถูกแก้, s1:2 ถูกลบ (หายไป), s1:3 เพิ่มใหม่
  const rows = [
    { id: 's1:0', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'user', turnIdx: 0, ts: 1, text: 'สวัสดีตอนเช้านะ' },
    { id: 's1:1', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'ดยุคยื่นมือช่วยพยุงเธอ' },
    { id: 's1:3', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 3, ts: 4, text: 'หิมะโปรยปรายทั่วเมือง' },
  ];
  const { toEmbed, stats } = syncScope(db, 's1', rows);
  expect(stats).toEqual({ added: 1, updated: 1, deleted: 1, unchanged: 1 });
  expect(toEmbed.map((r) => r.id).sort()).toEqual(['s1:1', 's1:3']); // เปลี่ยน+ใหม่ ต้อง embed
  // s1:2 ถูกลบจริงทั้ง mem + fts
  expect(ftsSearch(db, { scopeId: 's1', query: 'มังกรไฟ', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(0);
  // s1:1 ค้นด้วยเนื้อใหม่เจอ, เนื้อเก่าไม่เจอ
  expect(ftsSearch(db, { scopeId: 's1', query: 'ช่วยพยุง', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(1);
  expect(ftsSearch(db, { scopeId: 's1', query: 'กลัวความมืด', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(0);
  // s1:3 เพิ่มใหม่ ค้นเจอ
  expect(ftsSearch(db, { scopeId: 's1', query: 'หิมะโปรยปราย', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(1);
});

test('syncScope: แถว unchanged ที่ embedding ยังเป็น NULL → ถูกใส่ใน toEmbed (re-embed เมื่อเปิด EMBED ทีหลัง)', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [   // ingest แบบไม่มี embedding (FTS-only)
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ' },
  ]);
  const rows = [{ id: 's1:0', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ' }];
  const { toEmbed, stats } = syncScope(db, 's1', rows);
  expect(stats.unchanged).toBe(1);
  expect(toEmbed.map((r) => r.id)).toEqual(['s1:0']); // unchanged แต่ยังไม่มีเวกเตอร์ → re-embed
});

test('syncScope: แถว unchanged ที่มี embedding แล้ว → ไม่ต้อง embed ซ้ำ', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ', embedding: new Float32Array([1, 0, 0]) },
  ]);
  const rows = [{ id: 's1:0', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ' }];
  const { toEmbed, stats } = syncScope(db, 's1', rows);
  expect(stats.unchanged).toBe(1);
  expect(toEmbed.length).toBe(0); // มีเวกเตอร์แล้ว + เนื้อไม่เปลี่ยน → ข้าม
});

test('vectorSearch: ข้ามแถวที่มิติเวกเตอร์ไม่ตรง query (กัน dim-mismatch เพี้ยนเงียบ)', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'ก', embedding: new Float32Array([1, 0]) },        // มิติ 2 (เก่า)
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'ข', embedding: new Float32Array([0.9, 0.1, 0]) }, // มิติ 3 (ใหม่)
  ]);
  const hits = vectorSearch(db, { scopeId: 's1', queryVec: new Float32Array([1, 0, 0]), activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 });
  expect(hits[0].turnIdx).toBe(1);                 // มิติตรงเท่านั้นได้คะแนน
  expect(hits.find((h) => h.turnIdx === 0)?.cos ?? 0).toBe(0); // มิติไม่ตรง → 0
});

test('recall (rrf): ก้อนที่ติดทั้ง FTS+vector ชนะก้อนที่เด่นทางเดียว', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    // s1:0 ติดทั้ง keyword 'ความมืด' + vector ใกล้ query · s1:1 ใกล้ vector แต่ไม่มี keyword (ติดทางเดียว)
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'ความมืด', embedding: new Float32Array([1, 0, 0]) },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'แสงแดดยามเช้า', embedding: new Float32Array([0.9, 0.1, 0]) },
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'ความมืด', queryVec: new Float32Array([1, 0, 0]), activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 2, wFts: 0.5, wVec: 0.5, fusion: 'rrf' });
  expect(hits[0].turnIdx).toBe(0); // ติดทั้ง FTS + vector → ชนะก้อนที่ติด vector อย่างเดียว
});

test('recall: fusion default (weighted) ยังทำงานเมื่อไม่ระบุ fusion', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟพ่นเปลวเพลิง' },
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'มังกร', queryVec: null, activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 0.5, wVec: 0.5 });
  expect(hits[0].turnIdx).toBe(0);
});

// ===== Part B — importance/persistence-aware recall =====

test('B1: ingest importance/persistent แล้วอ่านกลับได้ (default 0/false)', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นสัญญาว่าจะกลับมา', importance: 5, persistent: true },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'อากาศวันนี้ดีจัง' }, // ไม่ระบุ → default
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'สัญญา', queryVec: null, activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 1, wVec: 0 });
  const h0 = hits.find((h) => h.turnIdx === 0)!;
  expect(h0.importance).toBe(5);
  expect(h0.persistent).toBe(true);
  const def = recall(db, { scopeId: 's1', query: 'อากาศ', queryVec: null, activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 1, wVec: 0 }).find((h) => h.turnIdx === 1)!;
  expect(def.importance).toBe(0);
  expect(def.persistent).toBe(false);
});

test('B1: DB เก่า (ไม่มีคอลัมน์ importance/persistent) → migrate ไม่ crash + ingest ได้', () => {
  const path = `${tmpdir()}/chat-mem-migrate-test.sqlite`;
  rmSync(path, { force: true });
  try {
    // จำลอง DB เวอร์ชันเก่า: สร้างตาราง mem แบบไม่มีคอลัมน์ใหม่
    const old = new Database(path);
    old.exec(`CREATE TABLE mem (
      id TEXT PRIMARY KEY, scopeId TEXT NOT NULL, kind TEXT NOT NULL,
      charId TEXT, secret INTEGER NOT NULL DEFAULT 0, speaker TEXT,
      turnIdx INTEGER NOT NULL, ts INTEGER NOT NULL, text TEXT NOT NULL, embedding BLOB
    )`);
    old.exec(`INSERT INTO mem (id, scopeId, kind, secret, speaker, turnIdx, ts, text)
      VALUES ('s1:0','s1','chat',0,'char',0,1,'ข้อความเก่าก่อน migrate')`);
    old.close();

    // openMemDb ต้อง migrate (ALTER TABLE ADD COLUMN) โดยไม่ crash
    const db = openMemDb(path);
    const cols = (db.query('PRAGMA table_info(mem)').all() as any[]).map((c) => c.name);
    expect(cols).toContain('importance');
    expect(cols).toContain('persistent');
    // แถวเก่าได้ค่า default
    const oldRow = db.query("SELECT importance, persistent FROM mem WHERE id='s1:0'").get() as any;
    expect(oldRow.importance).toBe(0);
    expect(oldRow.persistent).toBe(0);
    // ingest แถวใหม่พร้อม importance ได้
    ingestMemory(db, [{ id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'ข้อความใหม่หลัง migrate', importance: 4, persistent: true }]);
    const newRow = db.query("SELECT importance, persistent FROM mem WHERE id='s1:1'").get() as any;
    expect(newRow.importance).toBe(4);
    expect(newRow.persistent).toBe(1);
    db.close();
  } finally {
    // cleanup (best-effort): WAL ทิ้ง sidecar -wal/-shm และ Windows อาจล็อกชั่วครู่ → ไม่ให้ล้มเทส
    for (const p of [path, `${path}-wal`, `${path}-shm`]) {
      try { rmSync(p, { force: true }); } catch { /* ignore lock บน Windows */ }
    }
  }
});

test('B2: recall บูสต์ fact importance สูง เมื่อ relevance ใกล้กัน', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    // สองแถว keyword เดียวกัน (relevance เท่ากัน) — แถวที่ importance สูงต้องนำ
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ', importance: 0 },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'มังกรไฟ', importance: 5 },
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'มังกรไฟ', queryVec: null, activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 1, wVec: 0, wImp: 0.3 });
  expect(hits[0].turnIdx).toBe(1); // importance 5 นำ importance 0
});

test('B2: recall บูสต์ persistent fact เมื่อ relevance ใกล้กัน', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'คำสาป', persistent: false },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'คำสาป', persistent: true },
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'คำสาป', queryVec: null, activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 1, wVec: 0, wPersist: 0.3 });
  expect(hits[0].turnIdx).toBe(1); // persistent นำ non-persistent
});

test('B2: ไม่ระบุ wImp/wPersist → ไม่บูสต์ (ของเดิมไม่ regress)', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ', importance: 0 },
    { id: 's1:5', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 5, ts: 2, text: 'มังกรไฟ', importance: 5 },
  ]);
  // ไม่มี wImp/wPersist/wRecency → ลำดับมาจาก FTS อย่างเดียว (เสมอกัน) ไม่พังเพราะ importance
  const hits = recall(db, { scopeId: 's1', query: 'มังกรไฟ', queryVec: null, activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 5, wFts: 1, wVec: 0 });
  expect(hits.length).toBe(2);
});

test('syncScope: เก็บ importance/persistent ตอน insert + update', () => {
  const db = openMemDb(':memory:');
  const { stats } = syncScope(db, 's1', [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นสัญญาจะกลับมา', importance: 5, persistent: true },
  ]);
  expect(stats.added).toBe(1);
  let row = db.query("SELECT importance, persistent FROM mem WHERE id='s1:0'").get() as any;
  expect(row.importance).toBe(5);
  expect(row.persistent).toBe(1);
  // update: เนื้อเปลี่ยน + importance เปลี่ยน
  syncScope(db, 's1', [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นผิดสัญญา', importance: 3, persistent: false },
  ]);
  row = db.query("SELECT importance, persistent FROM mem WHERE id='s1:0'").get() as any;
  expect(row.importance).toBe(3);
  expect(row.persistent).toBe(0);
});
