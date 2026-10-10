import { describe, expect, test } from 'bun:test';
import { mergeFragmentedProse } from './prose-format';

describe('mergeFragmentedProse', () => {
  test('merges short *blocks* split by blank lines', () => {
    const in_ = `*โรสกลืนน้ำลายลงคอ*\n\n*ด้วยความยากลำบาก*\n\n*สายตามองควย*`;
    const out = mergeFragmentedProse(in_);
    expect(out).toBe('*โรสกลืนน้ำลายลงคอ ด้วยความยากลำบาก สายตามองควย*');
  });

  test('merges when separated by single newline', () => {
    const in_ = `*เธอย่นจมูก*\n*แต่ต้องฝืนกลืน*`;
    expect(mergeFragmentedProse(in_)).toBe('*เธอย่นจมูก แต่ต้องฝืนกลืน*');
  });

  test('does not merge across dialogue', () => {
    const in_ = `*เธอเงียบ*\n\n"อย่า..."\n\n*สายตาแดงก่ำ*`;
    const out = mergeFragmentedProse(in_);
    expect(out).toContain('"อย่า..."');
    expect(out).toContain('*เธอเงียบ*');
    expect(out).toContain('*สายตาแดงก่ำ*');
    expect(out.indexOf('"อย่า..."')).toBeGreaterThan(out.indexOf('*เธอเงียบ*'));
  });

  test('keeps header and thought tags', () => {
    const in_ =
      `[⏰ เช้า · 🏡 ห้อง · 👗 ชุด]\n\n` +
      `*ก้าวเข้ามา*\n\n*สายตาจ้อง*\n\n` +
      `[💭 ความคิดในใจ: ไม่ไว้ใจ]`;
    const out = mergeFragmentedProse(in_);
    expect(out.startsWith('[⏰')).toBe(true);
    expect(out).toContain('[💭 ความคิดในใจ: ไม่ไว้ใจ]');
    expect(out).toContain('*ก้าวเข้ามา สายตาจ้อง*');
  });
});
