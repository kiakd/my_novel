import { test, expect } from 'bun:test';
import { parseStateDelta, deltaImportance } from './state-card';

const imp = (tag: string) => deltaImportance(parseStateDelta(tag).delta);

test('deltaImportance: delta null → 0/false', () => {
  expect(deltaImportance(null)).toEqual({ importance: 0, persistent: false });
});

test('deltaImportance: [[state: none]] → 0/false (ไม่มีอะไรเปลี่ยน)', () => {
  expect(imp('[[state: none]]')).toEqual({ importance: 0, persistent: false });
});

test('deltaImportance: เปลี่ยนแค่เวลา/สถานที่ → ไม่สำคัญ (0, ไม่ persistent)', () => {
  const r = imp('[[state: time=เช้าตรู่; location=ตลาดกลางเมือง]]');
  expect(r.importance).toBe(0);
  expect(r.persistent).toBe(false);
});

test('deltaImportance: ได้ของชิ้นเดียว → สำคัญน้อย ไม่ persistent', () => {
  const r = imp('[[state: +inv=เหรียญทอง]]');
  expect(r.importance).toBe(1);
  expect(r.persistent).toBe(false);
});

test('deltaImportance: fact ใหม่ → สำคัญ + persistent', () => {
  const r = imp('[[state: +fact=เรย์นสาบานจะแก้แค้นให้พ่อ]]');
  expect(r.importance).toBeGreaterThanOrEqual(2);
  expect(r.persistent).toBe(true);
});

test('deltaImportance: ได้พลังใหม่ → persistent', () => {
  const r = imp('[[state: +power=เรียกไฟจากฝ่ามือ]]');
  expect(r.importance).toBeGreaterThanOrEqual(2);
  expect(r.persistent).toBe(true);
});

test('deltaImportance: เผยตัวตน (realname/disguised) → persistent + สำคัญ', () => {
  const r = imp('[[state: disguised=false; realname=เจ้าหญิงเอเลน]]');
  expect(r.importance).toBeGreaterThanOrEqual(3);
  expect(r.persistent).toBe(true);
});

test('deltaImportance: หลายเหตุการณ์เชิงปม → cap ที่ 5', () => {
  const r = imp('[[state: +fact=ก; +fact=ข; +power=ค; disguised=true; realname=ง]]');
  expect(r.importance).toBe(5);
  expect(r.persistent).toBe(true);
});

test('deltaImportance: บาดเจ็บอย่างเดียว → ปานกลาง ไม่ persistent (อาการชั่วคราว)', () => {
  const r = imp('[[state: +cond=แขนซ้ายหัก]]');
  expect(r.importance).toBe(1);
  expect(r.persistent).toBe(false);
});
