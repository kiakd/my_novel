// ds-gen.ts — สะพานให้ทีม agent โยนงานเขียน/ตรวจภาษาให้ DeepSeek (Claude กำกับ ไม่เขียนเอง)
// ใช้: bun tools/ds-gen.ts --prompt <ไฟล์ prompt> --out <ไฟล์ผลลัพธ์> [--system <ไฟล์ system>] [--max-tokens 8000] [--temp 0.9]
// อ่าน DEEPSEEK_API_KEY / DEEPSEEK_MODEL จาก env หรือ novel/.env อัตโนมัติ
// V4 ต้องปิด thinking เสมอ ไม่งั้น content ว่าง (ตรรกะเดียวกับ novel/server.ts:213)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

function loadEnvFallback() {
  if (process.env.DEEPSEEK_API_KEY) return;
  const envPath = join(dirname(import.meta.dir), 'novel', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

loadEnvFallback();
const key = process.env.DEEPSEEK_API_KEY;
if (!key) { console.error('no DEEPSEEK_API_KEY'); process.exit(1); }

const promptFile = arg('prompt');
const outFile = arg('out');
if (!promptFile || !outFile) { console.error('usage: bun tools/ds-gen.ts --prompt <file> --out <file> [--system <file>] [--max-tokens N] [--temp x]'); process.exit(1); }

const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
const messages: { role: string; content: string }[] = [];
const systemFile = arg('system');
if (systemFile) messages.push({ role: 'system', content: readFileSync(systemFile, 'utf8') });
messages.push({ role: 'user', content: readFileSync(promptFile, 'utf8') });

const body: Record<string, unknown> = {
  model,
  messages,
  temperature: Number(arg('temp', '0.9')),
  max_tokens: Number(arg('max-tokens', '8000')),
};
if (model.includes('v4')) body.thinking = { type: 'disabled' };

const t0 = Date.now();
const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
if (!res.ok) { console.error(`deepseek ${res.status}: ${await res.text()}`); process.exit(1); }
const data = await res.json();
const content: string = data.choices?.[0]?.message?.content ?? '';
if (!content.trim()) { console.error('empty content from deepseek'); process.exit(1); }

writeFileSync(outFile, content, 'utf8');
const sec = ((Date.now() - t0) / 1000).toFixed(1);
const u = data.usage ?? {};
console.log(`ok: ${outFile} | model=${model} | ${sec}s | prompt_tokens=${u.prompt_tokens} completion_tokens=${u.completion_tokens} | finish=${data.choices?.[0]?.finish_reason}`);
