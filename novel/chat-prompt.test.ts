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

test('concise=true → ใส่กฎโหมดกระชับ + ไม่บังคับ "ตอบยาวเสมอ"', () => {
  const sys = assembleChatPrompt(char, 0, undefined, false, undefined, undefined, false, undefined, undefined, true);
  expect(sys).toContain('กระชับ');
  expect(sys).not.toContain('ต้องตอบยาว');
});

test('concise=false (default) → ยังเป็นสไตล์ยาวเดิม', () => {
  const sys = assembleChatPrompt(char, 0);
  expect(sys).toContain('เขียนให้ยาวและมีเนื้อ');
});
