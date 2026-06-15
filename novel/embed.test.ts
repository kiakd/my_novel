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
