import { test, expect } from 'bun:test';
import { openMemDb, ingestMemory, ftsSearch, cosine, vectorSearch, recall } from './chat-memory';

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
