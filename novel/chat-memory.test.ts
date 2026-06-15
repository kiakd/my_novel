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
