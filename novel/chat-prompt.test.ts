import { test, expect } from 'bun:test';
import {
  assembleChatPrompt, assembleNarratorPrompt, isContinueInput, buildContinueTailNudge,
  type ChatCharLite,
} from './chat-prompt';

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

test('concise=true → ใส่กฎโหมดกระชับ + ไม่บังคับ "ตอบยาวเสมอ"', () => {
  const sys = assembleChatPrompt(char, 0, undefined, false, undefined, undefined, false, undefined, undefined, true);
  expect(sys).toContain('กระชับ');
  expect(sys).not.toContain('ต้องตอบยาว');
});

test('concise=false (default) → ยังเป็นสไตล์ยาวเดิม', () => {
  const sys = assembleChatPrompt(char, 0);
  expect(sys).toContain('เขียนให้ยาวและมีเนื้อ');
});

test('isContinueInput รับเฉพาะคำสั่งสังเคราะห์ดำเนินต่อ', () => {
  expect(isContinueInput('(ดำเนินเรื่องต่อ) ขยับเรื่อง')).toBe(true);
  expect(isContinueInput('(ดำเนินฉากบรรยายต่อ) ขยับเหตุการณ์')).toBe(true);
  expect(isContinueInput('  (ดำเนินเรื่องต่อ) x')).toBe(true);
  expect(isContinueInput('ไปต่อสิ')).toBe(false);
  expect(isContinueInput('ดำเนินเรื่องต่อโดยไม่มีวงเล็บ')).toBe(false);
});

test('assembleChatPrompt มีกฎ continue = beat ใหม่ ห้ามทวน', () => {
  const sys = assembleChatPrompt(char, 0);
  expect(sys).toContain('หนึ่ง beat ใหม่');
  expect(sys).toContain('ห้ามทวนบทพูด');
});

test('assembleNarratorPrompt มีกฎดำเนินฉากบรรยายต่อ', () => {
  const sys = assembleNarratorPrompt(char);
  expect(sys).toContain('ดำเนินฉากบรรยายต่อ');
  expect(sys).toContain('หนึ่ง beat ใหม่');
});

test('buildContinueTailNudge แยก char/narrator', () => {
  expect(buildContinueTailNudge('char')).toContain('ตัดสินใจแล้วลงมือ');
  expect(buildContinueTailNudge('narrator')).toContain('NPC');
});
