// แปลนิยายจากแท็บ Chrome ที่เปิดอยู่ (ต่อผ่าน CDP :9222 — เปิดด้วย open-chrome.cmd)
//
//   node translate.ts                 แปลบทในแท็บที่เปิดอยู่ 1 บท
//   node translate.ts --n 5           แปล 5 บทต่อเนื่อง (กดบทถัดไปเอง)
//   node translate.ts --continue --n 3   ต่อจากบทล่าสุดที่แปลไว้ของเรื่องในแท็บ/เรื่องล่าสุด
//   node translate.ts --url <ลิงก์บท>   เปิดลิงก์นี้ก่อนแล้วแปล
//   node translate.ts --continue --book 43484 --n 5   ต่อเรื่องที่ระบุ (มีหลายเรื่อง)
//   node translate.ts --list          ดูเรื่องทั้งหมดใน library
//   node translate.ts --repolish --book 43484 --ch 3,5-7   เกลาสำนวนบทที่แปลแล้วใหม่ (ไม่ต้องต่อ Chrome)
//   node translate.ts --translator <ชื่อ> --book 90442   ผูกนักแปลประจำแนว (translators/<ชื่อ>/) กับเรื่อง — จำไว้ ครั้งต่อไปไม่ต้องใส่
//   node translate.ts --url <ลิงก์> --model deepseek-v4-pro [--thinking low|high|max]   เลือกรุ่น (ค่าเริ่มต้นปิดการคิด)
//   node translate.ts --provider ollama [--model <ชื่อ>] [--ollama-url <url>]   ใช้โมเดล local ผ่าน Ollama แทน DeepSeek
//
// stdout = สรุปสั้น (สำหรับ skill) — เนื้อหาคำแปลอยู่ใน library/<book>/chapters/*.md และ reader.html
import { CdpPage, listTabs, responsive, type Page } from './cdp-page.ts';
import { HttpPage } from './http-page.ts';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { siteFor, SITES, type Chapter } from './sites.ts';
import { emptyGlossary, merge, pronounRules, relevant, type Delta, type Glossary } from './glossary.ts';

const ROOT = import.meta.dirname;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LIB = join(ROOT, 'library');

// ---------- args ----------
const argv = process.argv.slice(2);
const flag = (k: string) => argv.includes(k);
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const N = Number(opt('--n') ?? 1);
const PORT = opt('--port') ?? '9222';
// วิธีดึงหน้าเว็บ: chrome = คุมแท็บ Chrome ผ่าน CDP · http = impit ไม่ต้องมี Chrome (ใช้บน VPS) — ดู http-page.ts
// ค่าเริ่มต้น: Windows ใช้ chrome (เหมือนเดิม) อย่างอื่น http · เปลี่ยนด้วย --fetch หรือ NR_FETCH
const HTTP = (opt('--fetch') ?? process.env.NR_FETCH ?? (process.platform === 'win32' ? 'chrome' : 'http')) === 'http';
// แปลทั้งบทในคำขอเดียว (ได้ภาพรวมทั้งฉากก่อน แล้วค่อยเกลาทั้งบท) — บทจริงยาวสุด ~3.7k ตัวจีน
// คำแปลไทยของบท 2k ตัวจีนราว 3k token ยังห่าง max_tokens 8000 ; เกินเพดานนี้ค่อยหั่น (กันชนเพดาน output)
const CHUNK = 6000;

// ---------- env (ใช้ key เดียวกับ backend) ----------
function loadEnv() {
  const p = join(ROOT, '../../novel/.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();
// --provider ollama → ใช้โมเดล local ผ่าน Ollama (ฟรี แต่ช้ากว่า/คุณภาพต่ำกว่า DeepSeek)
// DeepSeek เงินหมด (402) → สลับไป Ollama อัตโนมัติ (ปิดด้วย --no-fallback)
let PROVIDER = opt('--provider') ?? process.env.NR_PROVIDER ?? 'deepseek';
const OLLAMA_URL = (opt('--ollama-url') ?? process.env.OLLAMA_URL ?? 'http://localhost:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4-e4b-uncensored:latest';
const KEY = process.env.DEEPSEEK_API_KEY;
// รุ่นที่ใช้: --model > library/settings.json (ตั้งจากหน้าเว็บ ⚙ → โมเดล AI) > DEEPSEEK_MODEL ใน .env
const SETTINGS = (() => { try { return JSON.parse(readFileSync(join(LIB, 'settings.json'), 'utf8')) as { model?: string }; } catch { return {}; } })();
let MODEL = opt('--model') ?? (PROVIDER === 'ollama' ? OLLAMA_MODEL : SETTINGS.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat');
const THINKING = opt('--thinking'); // ไม่ใส่ = ปิดการคิด (เร็ว/ถูก เหมือน deepseek-chat)
if (THINKING && !['low', 'high', 'max'].includes(THINKING)) fail('--thinking ต้องเป็น low|high|max');
if (PROVIDER !== 'deepseek' && PROVIDER !== 'ollama') fail(`ไม่รู้จัก --provider ${PROVIDER} (deepseek|ollama)`);
if (PROVIDER === 'deepseek' && !KEY) fail('ไม่พบ DEEPSEEK_API_KEY ใน novel/.env');

function fail(msg: string): never { console.log('ERROR: ' + msg); process.exit(1); }

// ---------- storage ----------
type Progress = { bookTitle: string; lastUrl?: string; nextUrl?: string | null; order: string[]; translator?: string };
const bookDir = (id: string) => join(LIB, id);
const readJson = <T>(p: string, d: T): T => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
const writeJson = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 2));

function latestBook(): string | undefined {
  if (!existsSync(LIB)) return;
  return readdirSync(LIB)
    .map((d) => ({ d, t: existsSync(join(LIB, d, 'progress.json')) ? statSync(join(LIB, d, 'progress.json')).mtimeMs : 0 }))
    .sort((a, b) => b.t - a.t)[0]?.d;
}

// ---------- AI ----------
// คลังความรู้สำนวน: tools/novel-reader/style/*.md (แก้ไฟล์ได้เลย มีผลรอบถัดไป)
// ขั้นแปลใช้ไฟล์ 03+04+05, ขั้นเกลาใช้ทั้งคลัง — อยู่ใน system prompt ส่วนต้นที่ซ้ำทุกคำขอ DeepSeek จึงคิดราคาแบบ cache
const STYLE_DIR = join(ROOT, 'style');
// --no-style: ปิดคลังสำนวน (ไว้เทียบผล A/B)
const styleFiles = !flag('--no-style') && existsSync(STYLE_DIR) ? readdirSync(STYLE_DIR).filter((f) => f.endsWith('.md')).sort() : [];
const readStyle = (f: string) => readFileSync(join(STYLE_DIR, f), 'utf8').trim();
// ขั้นแปลร่างได้ 03 (สำนวน) + 04 (โครงจีน/คำทักทาย) + 05 (น้ำเสียง/อารมณ์): คำแปลตรงตัว ("เช้า!", "พวกคุณเช้า")
// และมุกแบน ๆ เกิดตั้งแต่ร่างแรก ขั้นเกลาไม่กล้าแก้บทพูดเพราะถูกสั่งห้ามเพิ่มเนื้อหา
const STYLE = styleFiles.filter((f) => /^0[345]/.test(f)).map(readStyle).join('\n\n');
const KNOWLEDGE = styleFiles.map(readStyle).join('\n\n');

// นักแปลประจำแนว: translators/<ชื่อ>/{ตัวตน.md, ความรู้.md, canon.json} — ผูกกับเรื่องใน progress.json
// ต่อท้าย system prompt (ส่วนที่คงที่อยู่หน้า → DeepSeek ยัง cache ได้)
const TRANSLATORS = join(ROOT, 'translators');
let PROFILE = '';
function loadProfile(name: string): string {
  const dir = join(TRANSLATORS, name);
  if (!existsSync(dir)) fail(`ไม่มีนักแปล "${name}" — มี: ${existsSync(TRANSLATORS) ? readdirSync(TRANSLATORS).join(', ') : '-'}`);
  const body = readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n');
  return `\n\n===== นักแปลประจำเรื่องนี้: ${name} (ถ้าขัดกับ GLOSSARY ให้ยึด GLOSSARY) =====\n${body}`;
}

const SYSTEM = `คุณคือนักแปลนิยายเว็บจีน→ไทยมืออาชีพ แปลให้อ่านลื่นเป็นธรรมชาติแบบนิยายแปลไทยคุณภาพดี ไม่แปลตรงตัวแข็งๆ
กฎ:
- ใช้ชื่อไทยตาม GLOSSARY เสมอ ห้ามเปลี่ยนการสะกด
- ภาษาจีน 他/她 ออกเสียงเหมือนกัน — เลือกสรรพนามไทย (เขา/เธอ/นาง) และคำแทนตัว (ผม/ฉัน/ข้า/หนู…) ตามเพศ อายุ บริบท และช่อง self/called/speech ใน GLOSSARY
- คำเรียกคู่สนทนา (你) เลือกตามเพศของ "คนที่ถูกพูดด้วย" ไม่ใช่ผู้พูด: พูดกับผู้ชาย → นาย/แก, พูดกับผู้หญิง → เธอ (ห้ามเรียกผู้หญิงว่า "นาย"), ผู้ใหญ่/ผู้อาวุโส → คุณ/ท่าน/คำเรียกญาติ — เช็คเพศจาก GLOSSARY ทุกครั้ง
- 你 ในคำบรรยายที่หมายถึง "ใครก็ตาม/คนทั่วไป" (ไม่ได้พูดกับใคร) → ใช้ "ใคร" "คนเรา" หรือละไว้ ห้ามแปลเป็น แก/นาย/เธอ
- ห้ามใช้ "กู" "มึง" เด็ดขาด แม้ต้นฉบับจะหยาบหรือสนิทกันมาก (老子/你丫/他妈的 ฯลฯ) → ใช้ ฉัน/นาย/แก/เธอ และแสดงความหยาบ/ความสนิทผ่านน้ำเสียงและคำลงท้ายแทน
- คงน้ำเสียงการพูดของแต่ละตัวละครตาม speech
- คำลงท้าย (ครับ/ขอรับ/ค่ะ/เจ้าค่ะ) ต้องตรงเพศ "ผู้พูด" และตาม self ใน GLOSSARY ทุกครั้ง (ผู้หญิงห้ามลงท้าย ครับ/ขอรับ ผู้ชายห้าม ค่ะ/เจ้าค่ะ) ; ราชาศัพท์ (พ่ะย่ะค่ะ/เพคะ/พระราชทาน) ใช้กับเชื้อพระวงศ์จริงเท่านั้น
- คำเรียกขานและศัพท์ระบบที่อยู่ใน GLOSSARY terms (เช่น 领主大人 ป้ายในแผงสถานะ ระดับขั้น ชื่อไอเทม) ต้องใช้คำนั้นตรงตัว ห้ามเลือกคำใหม่
${STYLE}
- แปลครบทุกย่อหน้า ไม่ย่อ ไม่เพิ่มเนื้อหา คงการแบ่งย่อหน้าเดิม ไม่ใส่หมายเหตุผู้แปลอื่นนอกจากหมายเหตุสำนวนจีนตามข้อด้านล่าง
- ในส่วน TRANSLATION ห้ามมีอักษรจีนแม้แต่ตัวเดียว และห้ามทับศัพท์อังกฤษ (breakthrough, deal ฯลฯ) ให้ใช้คำไทย ยกเว้นชื่อแบรนด์ ทุกคำต้องเป็นภาษาไทย (ชื่อ/สถานที่ถอดเสียงเป็นไทย)
- สกุลเงินจีนคงเป็น "หยวน" เสมอ (元/块/块钱 = หยวน) และแปลงตัวเลขเป็นหลักไทยให้ถูก: 万=หมื่น, 十万=แสน, 百万=ล้าน เช่น 三十万=สามแสน, 六十多万=หกแสนกว่า, 两百万=สองล้าน ห้ามเขียน "หกสิบหมื่น"/"สามร้อยหมื่น" ห้ามแปลงเป็นบาทหรือสกุลอื่น
- ชื่ออาหาร/ขนม/ของเฉพาะจีน: ใช้ชื่อที่คนไทยรู้จัก (เช่น 糖葫芦=ถังหูลู่, 淀粉肠=ไส้กรอกแป้งทอด, 臭豆腐=เต้าหู้เหม็น, 棉花糖=สายไหม) ถ้าไม่มีชื่อไทยให้ถอดเสียง + อธิบายสั้นในวงเล็บ ห้ามแปลตามตัวอักษรจนผิดความหมาย
- แฟนฟิค/อ้างอิงงานดัง (แฮร์รี่ พอตเตอร์, วันพีซ, นารูโตะ ฯลฯ): ชื่อคน สถานที่ คาถา ศัพท์เฉพาะ ใช้ตามฉบับแปลไทยทางการที่คนไทยคุ้น (เช่น 霍格沃茨=ฮอกวอตส์, 邓布利多=ดัมเบิลดอร์, 斯内普=สเนป, 格兰芬多=กริฟฟินดอร์) ไม่ใช่ถอดเสียงจีน
- ชื่อวิชา/สถานที่/สิ่งของในงานดังที่ฉบับไทยมีชื่อแปลแล้ว (เช่น 变形术=วิชาแปลงร่าง) ใช้ชื่อไทยนั้น ห้ามถอดเสียงอังกฤษ — ยกเว้นเมื่อต้นฉบับยกคำอังกฤษ/ละตินมาเป็น "คำร่ายคาถา" หรืออธิบายการออกเสียง ให้คงคำร่ายแบบถอดเสียง/ตัวอังกฤษไว้
- สำนวน/คำพังเพย/成语/การอ้างเรื่องเล่าโบราณ แบ่ง 3 แบบ (แบบนิยายจีนแปลไทย):
  (1) มีสำนวนไทยน้ำหนักเท่ากันที่คนไทยใช้จริง (一箭双雕=ยิงปืนนัดเดียวได้นกสองตัว, 引狼入室=ชักศึกเข้าบ้าน) → ใช้สำนวนไทย ไม่มีหมายเหตุ
  (2) สำนวนที่มีภาพเปรียบ/ที่มาเฉพาะแบบจีน ไม่มีสำนวนไทยตรงกัน (井底之蛙, 画蛇添足, 卧薪尝胆, 塞翁失马) → คงภาพแบบจีนไว้ แปลเป็นถ้อยคำไทยสละสลวย (เช่น "กบในก้นบ่อ" "วาดงูเติมขา") แล้วต่อท้ายสำนวนทันทีด้วยเครื่องหมาย [^1] [^2] … และอธิบายความหมายในส่วน NOTES
  (3) คำสี่พยางค์ที่ใช้เป็นคำบรรยายธรรมดา (一模一样, 莫名其妙, 目瞪口呆) และมุกอินเทอร์เน็ต/คำแสลงสมัยใหม่ → แปลตามความหมายเป็นไทยธรรมดา ไม่มีหมายเหตุ
  ใส่หมายเหตุเฉพาะจุดที่ผู้อ่านไทยไม่เข้าใจจริงๆ ไม่เกินราว 6 จุดต่อคำขอ เลขเริ่มที่ 1 ทุกคำขอ
- เขียนแบบนิยายไทย: บทพูดในเครื่องหมาย "..." บรรยายกระชับ ไม่ติดโครงประโยคจีน

รูปแบบคำตอบ (ต้องตรงเป๊ะ):
=== TRANSLATION ===
<คำแปล>
=== NOTES ===
<บรรทัดละข้อ: [^เลข]: สำนวนตามที่เขียนในคำแปล — ความหมาย (และที่มาสั้นๆ ถ้ามี) ภาษาไทยล้วน ห้ามมีอักษรจีน; ถ้าไม่มีสำนวนแบบ (2) ให้เว้นบรรทัดว่าง
=== GLOSSARY ===
<JSON: {"characters":{"ชื่อจีน":{"th":"","gender":"ชาย|หญิง","role":"","self":"","called":"","speech":"","relations":""}},"terms":{"คำจีน":"คำไทย"}}>
characters = เฉพาะบุคคลที่มีชื่อจริง (ห้ามใส่สรรพนาม/คำเรียกแทนตัว เช่น 老子 我 他 เป็นตัวละคร) ใช้ชื่อเต็มภาษาจีนเป็น key
ตัวละครที่ถูกกล่าวถึงแต่ยังไม่รู้เพศ ให้เว้น gender ว่างไว้
self = คำแทนตัวคำเดียว + คำลงท้าย (เช่น "ข้า · เจ้าค่ะ") ห้ามใส่หลายตัวเลือกแบบ "ฉัน/ผม" ; called = คนอื่นเรียก/บรรยายถึงตัวละครนี้ว่าอะไร
terms = ใส่คำเรียกขานที่วนซ้ำ (เช่น 领主大人) ศัพท์ระบบ/ป้ายในแผงสถานะ ระดับขั้น ชื่อสถานที่ ที่ยังไม่มีใน GLOSSARY ด้วย เพื่อให้ตอนถัดไปแปลเหมือนกัน
ใน GLOSSARY ใส่เฉพาะตัวละคร/คำใหม่ที่ยังไม่มี หรือข้อมูลที่เพิ่งรู้เพิ่ม (เช่นเพิ่งรู้เพศ นิสัย ความสัมพันธ์) ถ้าไม่มีให้ใส่ {}`;

// GPU เครื่องเดียวทำทีละคำขออยู่แล้ว — ต่อคิวเองกันคำขอค้างคิวจน fetch timeout
let ollamaQueue: Promise<unknown> = Promise.resolve();
function ollamaChat(system: string, user: string, temperature: number): Promise<string> {
  const run = async () => {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // think:false — Gemma 4 คิดยาวก่อนตอบ เปลืองเวลาและหลุดรูปแบบ; num_ctx ค่าเริ่มต้น 4k ไม่พอสำหรับ prompt+GLOSSARY
      body: JSON.stringify({ model: MODEL, stream: false, think: false, options: { temperature, num_ctx: 16384, num_predict: 8000 }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).message.content as string;
  };
  const p = ollamaQueue.then(run, run);
  ollamaQueue = p.catch(() => {});
  return p;
}

const USAGE = { calls: 0, hit: 0, miss: 0, out: 0 };

// บันทึกทุกคำขอ AI ลง library/usage.jsonl ไว้วิเคราะห์ว่าเงินไปหมดที่ขั้นไหน (ดูสรุปที่ /usage ในเว็บ)
// CTX = งานที่กำลังทำ: mode new|retranslate|repolish|check|fix, ch = เลขตอน
const CTX = { book: '', ch: 0, mode: '' };
const USAGE_LOG = join(LIB, 'usage.jsonl');
function logUsage(stage: string, ms: number, u?: { prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number; prompt_tokens?: number; completion_tokens?: number }, err?: string) {
  const row = {
    t: new Date().toISOString(), book: CTX.book, ch: CTX.ch, mode: CTX.mode || 'other', stage, provider: PROVIDER, model: MODEL, ms,
    hit: u?.prompt_cache_hit_tokens ?? 0, miss: u?.prompt_cache_miss_tokens ?? u?.prompt_tokens ?? 0, out: u?.completion_tokens ?? 0, ...(err ? { err } : {}),
  };
  try { mkdirSync(LIB, { recursive: true }); appendFileSync(USAGE_LOG, JSON.stringify(row) + '\n'); } catch {}
}

// stage = ขั้นที่เรียก (translate / translate-retry / polish / fix-lines / fix-words / fix-para) — ไว้แยกค่าใช้จ่ายใน log
async function chat(system: string, user: string, temperature = 0.7, stage = 'other'): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    const t0 = Date.now();
    try {
      if (PROVIDER === 'ollama') { const r = await ollamaChat(system, user, temperature); logUsage(stage, Date.now() - t0); return r; }
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
        // V4.x "คิดก่อนตอบ" เมื่อเรียกชื่อรุ่นตรงๆ (deepseek-flash/deepseek-v4-pro) — ความคิดนับเป็น token ขาออก
        // และเคยกิน max_tokens หมดจนคำแปลว่าง → ปิดไว้ (deepseek-chat ปิดอยู่แล้ว) เปิดด้วย --thinking low|high|max
        body: JSON.stringify({
          model: MODEL, temperature, messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          ...(THINKING ? { reasoning_effort: THINKING, max_tokens: 32000 } : { thinking: { type: 'disabled' }, max_tokens: 8000 }),
        }),
      });
      if (res.status === 402 && !flag('--no-fallback')) {
        if (PROVIDER === 'deepseek') {
          console.error(`DeepSeek เงินหมด (402) → สลับไปใช้ Ollama ${OLLAMA_MODEL} (${OLLAMA_URL})`);
          PROVIDER = 'ollama';
          MODEL = OLLAMA_MODEL;
        }
        const r = await ollamaChat(system, user, temperature);
        logUsage(stage, Date.now() - t0);
        return r;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const j = await res.json();
      logUsage(stage, Date.now() - t0, j.usage);
      // นับ token จริงที่ DeepSeek คิดเงิน (cache hit = ส่วนหัว prompt ที่ซ้ำ คิดถูกกว่ามาก)
      USAGE.calls++;
      USAGE.hit += j.usage?.prompt_cache_hit_tokens ?? 0;
      USAGE.miss += j.usage?.prompt_cache_miss_tokens ?? j.usage?.prompt_tokens ?? 0;
      USAGE.out += j.usage?.completion_tokens ?? 0;
      return j.choices[0].message.content;
    } catch (e) {
      logUsage(stage, Date.now() - t0, undefined, String((e as Error).message ?? e).slice(0, 200));
      if (attempt >= 3) throw e;
      await sleep(1500 * attempt);
    }
  }
}

const RUDE = /(?<!ตระ|ฟิ)กู(?![่้๊๋]|เกิล|รู)|มึง/; // ข้าม ตระกูล/กูรู/กู้/กูเกิล/ฟิกูเรชัน
// หมายเหตุที่เป็นความเห็นของโมเดลเรื่องคำแปล ไม่ใช่คำอธิบายสำนวน (เคยหลุด: "ควรคงไว้ให้สม่ำเสมอ", "คำแปลใช้ 'ข้า' ซึ่งเหมาะ", "แปลเป็น… ซึ่งผิด")
// (ห้ามจับ "แปลตรงตัวว่า…" — หมายเหตุสำนวนดีๆ ใช้คำนี้อธิบายภาพเดิมของสำนวน ; ทดสอบกับหมายเหตุ 235 ข้อของเรื่อง 45305 แล้ว)
const META_NOTE = /คำแปล(ไทย)?(ใช้|สื่อ|นี้|ตรงนี้|เดิม)|ควร(แปล|คง|ใช้|เน้น)|ซึ่งผิด|ผู้แปล|สม่ำเสมอ|ทุกตอน|ทับศัพท์|ไม่ตรงกับ(ต้นฉบับ|ความหมาย)/;
// จุดแทรก [^n] ต้องไม่อยู่กลางคำ — เคยได้ th="ข้า" แล้วไปแทรกกลาง "ข้างๆ" กลายเป็น "ข้า[^5]งๆ"
// (Intl.Segmenter ภาษาไทยของ Node ตัดคำเพี้ยน ใช้ไม่ได้) → คำสั้นต้องตามด้วยอักขระที่ไม่ใช่ไทย ; คำยาวห้ามตามด้วยสระหลัง/วรรณยุกต์
const atWordEnd = (s: string, i: number, len: number) =>
  i >= s.length || !/[฀-๿]/.test(s[i]) || (len > 4 && !/[ะ-ฺๅ-๎]/.test(s[i]));
const CJK = /[㐀-鿿豈-﫿]/;

// อักษรต่างชาติอื่นที่โมเดลหลุดมา (รัสเซีย/อาหรับ/คานะ/ฮันกึล) เช่น "четыวีสลีย์"
const OTHER = /[Ѐ-ӿ؀-ۿ぀-ゟ가-힯]+|[ァ-ヺ]{2,}/; // ไม่นับกรีก/คาตาคานะตัวเดียว — มักเป็นอีโมติคอน (=ω=) （￣（エ）￣）
const OTHER_G = new RegExp(OTHER.source, 'g');

// DeepSeek ชอบหลุดคำจีนสั้นๆ ปนในคำแปล → ส่งเฉพาะบรรทัดที่ยังมีจีนกลับไปเกลาใหม่ (สูงสุด 2 รอบ)
const FIX_SYSTEM = `คุณคือบรรณาธิการนิยายแปลไทย บรรทัดคำแปลต่อไปนี้ยังมีคำภาษาจีน/ภาษาอังกฤษ/ภาษาอื่น (เช่น รัสเซีย) หลงเหลือ หรือใช้ กู/มึง (ห้ามใช้ — เปลี่ยนเป็น ฉัน และเรียกคนฟังตามเพศ: ผู้ชาย=นาย ผู้หญิง=เธอ)
ให้เขียนแต่ละบรรทัดใหม่เป็นภาษาไทยล้วน สำนวนนิยายลื่นไหล คงความหมายและชื่อตัวละครเดิม ใช้ต้นฉบับจีนเป็นบริบท
ห้ามมีอักษรจีน อักษรต่างชาติอื่น หรือคำอังกฤษ (ยกเว้นชื่อแบรนด์) เครื่องหมายหมายเหตุ [^1] [^2] ในบรรทัดให้คงไว้ตำแหน่งเดิม ตอบเป็นบรรทัดรูปแบบ [เลข] ข้อความ ตามเลขเดิม ครบทุกบรรทัด ไม่ต้องอธิบาย`;

// ส่งเฉพาะย่อหน้าต้นฉบับที่เกี่ยวกับบรรทัดที่ต้องแก้ แทนต้นฉบับทั้งชิ้น (ประหยัด token):
// ย่อหน้าตำแหน่งใกล้เคียงตามสัดส่วน ±2 + ย่อหน้าที่มีคำจีนที่หลุดมา
function sourceContext(source: string, thLines: number, bad: (readonly [number, string])[]): string {
  const paras = source.split('\n').map((l) => l.trim()).filter(Boolean);
  if (paras.length <= 8) return source;
  const keep = new Set<number>();
  for (const [i, l] of bad) {
    const j = Math.round((i * (paras.length - 1)) / Math.max(1, thLines - 1));
    for (let k = Math.max(0, j - 2); k <= Math.min(paras.length - 1, j + 2); k++) keep.add(k);
    for (const w of l.match(/[㐀-鿿豈-﫿]+/g) ?? []) paras.forEach((p, k) => p.includes(w) && keep.add(k));
  }
  return [...keep].sort((a, b) => a - b).map((k) => paras[k]).join('\n');
}

// สถิติรอบแก้คำหลุด — ดูว่าอะไรทำให้ต้องเรียกเพิ่ม (สรุปท้ายรอบ)
const FIXLOG = { cjk: new Set<string>(), eng: new Set<string>(), rude: 0 };

async function fixCJK(th: string, source: string, g: Glossary): Promise<string> {
  const lines = th.split('\n');
  for (let round = 0; round < 2; round++) {
    // จีนปน หรือคำอังกฤษตัวเล็กหลุด (breakthrough ฯลฯ — ชื่อแบรนด์มักขึ้นต้นตัวใหญ่ เลยไม่โดน)
    const bad = lines.map((l, i) => [i, l] as const).filter(([, l]) => CJK.test(l) || OTHER.test(l) || /\b[a-z]{4,}\b/.test(l) || RUDE.test(l));
    if (!bad.length) break;
    for (const [, l] of bad) {
      for (const w of l.match(/[㐀-鿿豈-﫿]+/g) ?? []) FIXLOG.cjk.add(w);
      for (const w of l.match(/\b[a-z]{4,}\b/g) ?? []) FIXLOG.eng.add(w);
      for (const w of l.match(OTHER_G) ?? []) FIXLOG.eng.add(w);
      if (RUDE.test(l)) FIXLOG.rude++;
    }
    const names = Object.entries(relevant(g, source).characters).map(([zh, c]) => `${zh}=${c.th}`).join(', ');
    const out = await chat(FIX_SYSTEM, `ชื่อ: ${names || '-'}\n\nต้นฉบับ (เฉพาะช่วงที่เกี่ยวข้อง):\n${sourceContext(source, lines.length, bad)}\n\nบรรทัดที่ต้องแก้:\n${bad.map(([i, l]) => `[${i}] ${l}`).join('\n')}`, 0.3, 'fix-lines');
    for (const m of out.matchAll(/^\[(\d+)\]\s*(.+)$/gm)) {
      const i = Number(m[1]);
      if (bad.some(([j]) => j === i) && m[2].trim()) lines[i] = m[2].trim();
    }  }
  // ชั้นสุดท้าย: คำเดี่ยวที่ยังดื้อ → แปลรายคำแล้ว replace ตรงๆ
  let joined = lines.join('\n');
  for (let round = 0; round < 3; round++) {
    const words = [...new Set(joined.match(/[㐀-鿿豈-﫿]+/g) ?? [])];
    if (!words.length) break;
    // ส่งประโยครอบๆ ไปด้วย → ได้คำที่เข้าบริบท (เช่น 凭什么 = มีสิทธิ์อะไร ไม่ใช่ "อาศัยอะไร")
    const ctx = words.map((w) => `${w}: ${joined.split('\n').find((l) => l.includes(w))?.slice(0, 120) ?? ''}`).join('\n');
    const out = await chat('แปลคำ/วลีจีนแต่ละคำเป็นภาษาไทยให้เข้ากับประโยคที่ให้มา (คำไทยต้องไม่มีอักษรจีน) ตอบ JSON object {"คำจีน":"คำไทย"} เท่านั้น', ctx, 0.2 + round * 0.3, 'fix-words');
    try {
      const map: Record<string, string> = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
      // ใช้ทุก key ที่โมเดลตอบมา ไม่ใช่แค่ที่ตรงเป๊ะ — คำซ้ำอย่าง 正经正经 มักถูกตอบกลับเป็น key "正经"
      const keys = Object.keys(map).filter((k) => CJK.test(k) && map[k] && !CJK.test(map[k]));
      for (const k of keys.sort((a, b) => b.length - a.length)) joined = joined.split(k).join(map[k]);
    } catch {}
  }
  return joined;
}

// รอบเกลาสำนวน: บรรณาธิการอ่านร่างเทียบต้นฉบับ แล้วเขียนให้เป็นนิยายไทยลื่นๆ (ปิดด้วย --no-polish)
const POLISH_SYSTEM = `คุณคือบรรณาธิการนิยายแปลจีน→ไทยมือทอง ได้รับต้นฉบับจีนและร่างคำแปล
ให้เกลาร่างเป็นนิยายไทยที่อ่านลื่นเหมือนคนไทยเขียนเอง:
- ตัดโครงประโยคจีนที่แข็ง คำซ้ำ คำเชื่อมเกินจำเป็น ใช้ลำดับคำและคำลงท้ายแบบไทย
- บทพูดต้องฟังเป็นธรรมชาติ ตรงบุคลิก อายุ ความสนิท ของผู้พูด (ดูช่อง self/called/speech)
- ชื่อวิชา/สถานที่ในงานดังใช้ชื่อฉบับแปลไทย (ดู GLOSSARY) แต่ถ้าเป็นคำร่ายคาถาหรือการสอนออกเสียง ให้คงคำร่ายไว้
- เทียบต้นฉบับ: ชื่ออาหาร/ขนม/สิ่งของเฉพาะจีน ต้องเป็นชื่อที่คนไทยรู้จักหรือถอดเสียง+อธิบายสั้น; สำนวนจีนต้องแปลตามความหมาย ไม่ใช่ตามตัวอักษร — ยกเว้นสำนวนที่มีเครื่องหมายหมายเหตุ [^1] [^2] ต่อท้าย: คงภาพแบบจีนและเครื่องหมายไว้ตำแหน่งเดิม ห้ามลบ ห้ามเปลี่ยนเลข ห้ามเพิ่มเครื่องหมายใหม่
- คำเรียกคู่สนทนา (你) เลือกตามเพศของ "คนที่ถูกพูดด้วย" ไม่ใช่ผู้พูด: พูดกับผู้ชาย → นาย/แก, พูดกับผู้หญิง → เธอ (ห้ามเรียกผู้หญิงว่า "นาย"), ผู้ใหญ่/ผู้อาวุโส → คุณ/ท่าน/คำเรียกญาติ — เช็คเพศจาก GLOSSARY ทุกครั้ง; 你 ในคำบรรยายที่หมายถึงคนทั่วไป → "ใคร"/ละไว้
- ห้ามใช้ "กู" "มึง" เด็ดขาด แม้ต้นฉบับจะหยาบหรือสนิทกันมาก (老子/你丫/他妈的 ฯลฯ) → ใช้ ฉัน/นาย/แก/เธอ และแสดงความหยาบ/ความสนิทผ่านน้ำเสียงและคำลงท้ายแทน
- สกุลเงินคงเป็น "หยวน" ห้ามเปลี่ยนเป็นบาท และตัวเลขต้องเป็นหลักไทยที่ถูก (六十万=หกแสน ไม่ใช่ หกสิบหมื่น)
- สรรพนาม/คำแทนตัวต้องตรงเพศและบริบท ชื่อตาม GLOSSARY เป๊ะ
- เทียบต้นฉบับ: แก้จุดที่แปลผิดความหมาย ห้ามตัด ห้ามเพิ่มเนื้อหา คงจำนวนย่อหน้า
- ภาษาไทยล้วน ห้ามมีอักษรจีน
ตอบเฉพาะคำแปลที่เกลาแล้ว ไม่ต้องมีหัวข้อหรือคำอธิบาย

===== คลังความรู้สำนวน (ใช้ประกอบการเกลา — เลือกใช้ให้เข้ากับฉาก ไม่ต้องใส่ทุกข้อ) =====
${KNOWLEDGE}`;

// ตรวจผลที่ผิดรูป: โมเดลติดลูปพิมพ์ซ้ำ (บท 116 เคยได้บรรทัดเดียว 15k ตัวอักษร), ตัด/ขาดหาย, marker หลุด
// ปกติ ไทย ≈ 2.6× ความยาวจีน
export function insane(th: string, source: string): string | null {
  if (source.length < 40) return null; // ชื่อบท/ข้อความสั้น — อัตราส่วนไม่นิ่ง
  const r = th.length / source.length;
  if (r > 4.5) return `ยาวผิดปกติ (${r.toFixed(1)}×)`;
  if (r < 1.2) return `สั้นผิดปกติ (${r.toFixed(1)}×)`;
  if (th.split('\n').some((l) => l.length > 1500)) return 'บรรทัดยาวผิดปกติ (ติดลูป)';
  if (/^===/m.test(th)) return 'marker หลุด';
  const mid = th.slice(th.length / 2, th.length / 2 + 15);
  if (mid.length === 15 && th.split(mid).length > 6) return 'ข้อความซ้ำวน';
  const srcParas = source.split('\n').filter((l) => l.trim()).length;
  const thParas = th.split('\n').filter((l) => l.trim()).length;
  if (srcParas >= 8 && thParas < srcParas * 0.6) return `ย่อหน้าหาย (${thParas}/${srcParas})`;
  return null;
}

async function polish(draft: string, source: string, g: Glossary, hasTitle = false): Promise<string> {
  const note = hasTitle ? 'บรรทัดแรกคือชื่อบท — คงไว้เป็นบรรทัดแรกบรรทัดเดียว (เกลาถ้อยคำได้)\n\n' : '';
  const rel = relevant(g, source);
  const out = await chat(POLISH_SYSTEM + PROFILE, `${note}${pronounRules(rel)}GLOSSARY:\n${JSON.stringify(rel)}\n\nต้นฉบับ:\n${source}\n\nร่างคำแปล:\n${draft}`, 0.6, 'polish');
  let th = out.trim().replace(/^=== TRANSLATION ===\s*/, '');
  // เครื่องหมายหมายเหตุสำนวน [^n]: ตัดตัวที่เกลาเพิ่มเอง; ทำตัวเดิมหาย → ใช้ร่างเดิม (หมายเหตุท้ายบทจะไม่มีที่อ้าง)
  const had = new Set(draft.match(/\[\^\d+\]/g) ?? []);
  th = th.replace(/\[\^\d+\]/g, (m) => (had.has(m) ? m : ''));
  const kept = [...had].every((m) => th.includes(m));
  // เกลาแล้วผิดรูป/สั้นลงมาก → ใช้ร่างเดิม
  return kept && th.length > draft.length * 0.7 && !insane(th, source) ? th : draft;
}

// ท้ายชิ้นก่อนหน้า (ต้นฉบับ) — ให้แต่ละชิ้นรู้ว่าเล่าต่อจากอะไร รอยต่อระหว่างชิ้นจะได้ไม่ขาดห้วน แต่ยังแปลขนานได้
const tailOf = (prev?: string) => (prev ? prev.split('\n').filter((l) => l.trim()).slice(-3).join('\n').slice(-400) : '');

const TITLE_NOTE = 'บรรทัดแรกของต้นฉบับคือชื่อบท — ให้บรรทัดแรกของคำแปลเป็นชื่อบทที่แปลแล้ว (บรรทัดเดียว) แล้วจึงตามด้วยเนื้อหา';

// แยกคำแปล/GLOSSARY จากคำตอบ ; โมเดลลืม marker บ้าง → ตัดบรรทัด === ออกแล้วใช้คำแปลได้เลย (ข้ามคลังส่วนนี้)
// แทนการสั่งแปลใหม่ทั้งชิ้น (เคยเสียค่าแปลซ้ำ 2 รอบใน 10 บท)
function parseAnswer(out: string): { th: string; gl: string; notes: string } {
  // ส่วน NOTES (หมายเหตุสำนวนจีน) อยู่ระหว่าง TRANSLATION กับ GLOSSARY — ตัดออกก่อน
  let notes = '';
  const nm = out.match(/^\s*=+\s*NOTES\s*=+\s*$/m);
  if (nm) {
    const rest = out.slice(nm.index! + nm[0].length);
    const g = rest.search(/^\s*=+\s*GLOSSARY/im);
    notes = g >= 0 ? rest.slice(0, g) : rest;
    out = out.slice(0, nm.index) + (g >= 0 ? '\n' + rest.slice(g) : '');
  }
  const m = out.match(/=== TRANSLATION ===\s*([\s\S]*?)\s*=== GLOSSARY ===\s*([\s\S]*)$/);
  if (m) return { th: m[1], gl: m[2], notes };
  const cut = out.search(/^\s*=+\s*GLOSSARY/im);
  const body = (cut >= 0 ? out.slice(0, cut) : out).replace(/^\s*=+\s*[A-Z ]+=+\s*$/gm, '').trim();
  return { th: body, gl: cut >= 0 ? out.slice(cut) : '{}', notes };
}

// "[^1]: กบในก้นบ่อ — คนที่โลกทัศน์คับแคบ" → Map(1 → ข้อความ) ; ตัดอักษรจีนที่หลุดมาในคำอธิบาย
function parseNotes(t: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const m of t.matchAll(/^\s*\[\^?(\d+)\]:?\s*(.+)$/gm)) {
    const txt = m[2].replace(/[（(]?[㐀-鿿豈-﫿]+[)）]?/g, '').replace(/\s{2,}/g, ' ').trim();
    if (txt && txt !== '-' && !META_NOTE.test(txt)) map.set(Number(m[1]), txt);
  }
  return map;
}

async function translateChunk(text: string, g: Glossary, title: string, prev?: string, hasTitle = false): Promise<{ th: string; delta: Delta; notes: Map<number, string> }> {
  const ctx = relevant(g, text + title);
  const before = tailOf(prev);
  const user = `${pronounRules(ctx)}GLOSSARY ปัจจุบัน:\n${JSON.stringify(ctx)}\n\nบท: ${title}\n\n${hasTitle ? TITLE_NOTE + '\n\n' : ''}${before ? `ช่วงก่อนหน้า (บริบทเท่านั้น ห้ามแปลซ้ำ — ต้นฉบับด้านล่างเล่าต่อจากตรงนี้ ให้ประโยคแรกรับช่วงต่อได้ลื่น ไม่ขึ้นต้นเหมือนเริ่มฉากใหม่):\n${before}\n\n` : ''}ต้นฉบับ:\n${text}`;
  let th = '';
  let gl = '{}';
  let notes = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    ({ th, gl, notes } = parseAnswer(await chat(SYSTEM + PROFILE, user, attempt === 1 ? 0.7 : 0.5, attempt === 1 ? 'translate' : 'translate-retry')));
    const bad = insane(th.trim(), text);
    if (!bad) break;
    console.error(`แปลผิดรูป (${bad}) — ลองใหม่ ${attempt}/3`);
  }
  let delta: Delta = {};
  const json = gl.slice(gl.indexOf('{'), gl.lastIndexOf('}') + 1); // ตัด ```json / ข้อความเกินหน้า-หลัง
  try { delta = JSON.parse(json || '{}'); } catch { console.error('glossary parse fail'); }
  if (process.env.NR_DEBUG) appendFileSync(join(ROOT, 'glossary-debug.log'), gl + '\n----\n');
  if (process.env.NR_DEBUG_RAW) appendFileSync(process.env.NR_DEBUG_RAW, `===== TH\n${th}\n===== NOTES\n${notes}\n`);
  const draft = await fixCJK(th.trim(), text, g);
  const final = flag('--no-polish') ? draft : await fixCJK(await polish(draft, text, g, hasTitle), text, g);
  return { th: final.replaceAll('บทหยวน', 'บทบาท'), delta, notes: parseNotes(notes) }; // 起着…作用 เคยหลุดเป็น "บทหยวน"
}

const CHUNK_MARK = '\n\n<!-- chunk -->\n\n';
// หมายเหตุสำนวนจีนท้ายบท: "<!-- notes -->" แล้วตามด้วย "[^1]: …" — เนื้อบทอยู่ก่อนตัวคั่นนี้เสมอ
const NOTES_MARK = '<!-- notes -->';
// [เนื้อบท, ส่วนหมายเหตุพร้อมตัวคั่น (ไว้ต่อท้ายคืนตอนเขียนไฟล์)]
const splitNotes = (t: string): [string, string] => {
  const i = t.indexOf(NOTES_MARK);
  return i < 0 ? [t, ''] : [t.slice(0, i).replace(/\s+$/, '\n'), '\n' + t.slice(i)];
};
const notesBlock = (notes: string[]) => (notes.length ? `\n${NOTES_MARK}\n\n${notes.join('\n\n')}\n` : '');
const parseNoteLines = (tail: string) => [...tail.matchAll(/^\s*\[\^\d+\]:\s*(.+)$/gm)].map((m) => m[1].trim());

// รอบหมายเหตุสำนวน (หลังเกลา): ขั้นแปลเคยถูกสั่งให้ใส่ [^n] เอง แต่โมเดลตอบ NOTES ว่างแทบทุกครั้ง
// → แยกเป็นงานเดียวโฟกัส: หาสำนวน/คำเปรียบที่คนไทยไม่เข้าใจ + คำสำคัญที่ต้องแปลให้เหมือนกันทุกตอน + แก้ความหมายผิดชัดๆ
// โปรแกรมแทรก [^n] เองตามข้อความที่โมเดลบอก (ไม่พึ่งให้โมเดลเขียนเครื่องหมายเอง)
const IDIOM_SYSTEM = `คุณคือบรรณาธิการนิยายแปลจีน→ไทย ตรวจคำแปลเทียบต้นฉบับเฉพาะเรื่อง "สำนวน คำเปรียบ คำแสลง ศัพท์เฉพาะ"
ตอบ JSON อย่างเดียว:
{"notes":[{"zh":"","th":"","note":""}],"terms":[{"zh":"","th":""}],"replace":[{"from":"","to":"","why":""}]}
- notes: สำนวน/คำเปรียบ/成语/คำแสลงเน็ตจีน/การอ้างอิงวัฒนธรรมจีน ที่คำแปลคงภาพแบบจีนไว้ จนคนไทยอ่านแล้วอาจไม่เข้าใจ (เช่น "แสงจันทร์สีขาว" จาก 白月光, "ปากยื่นจนแขวนขวดน้ำส้มได้" จาก 嘴撅得能挂醋瓶子, "เลี้ยงเป็นภรรยาเด็ก" จาก 童养媳)
  th = ข้อความที่ปรากฏในคำแปล "ตรงตัวอักษรทุกตัว" (คัดลอกมา 2–15 คำ) ; note = อธิบายความหมาย/ที่มาสั้นๆ 1–2 ประโยค ภาษาไทยล้วน
  ไม่ต้องใส่คำที่ไทยเข้าใจอยู่แล้ว หรือที่แปลเป็นความหมายไทยไปแล้ว ; บทละไม่เกิน 6 ข้อ เลือกที่ช่วยคนอ่านที่สุด
- terms: คำสำคัญที่วนซ้ำในเรื่องและควรแปลเหมือนกันทุกตอน (คำเปรียบประจำเรื่อง ชื่อเรียกเฉพาะ) ที่ GLOSSARY ยังไม่มี ; th = คำแปลที่ควรใช้ตลอดเรื่อง
- replace: แก้เฉพาะ (ก) จุดที่ "ผิดความหมายชัดเจน" เทียบต้นฉบับ (เช่น 衣冠禽兽 แปลเป็น "หน้าตัวเมีย") หรือ (ข) คำใน GLOSSARY terms ที่คำแปลใช้คำอื่น → ใส่ "all":true เพื่อแทนทุกที่ ; from = ข้อความในคำแปลตรงตัวทุกตัวอักษร ; to = ข้อความแทน
  ห้ามแก้ตามรสนิยม ห้ามตัดคำ/ชื่อยี่ห้อ ห้ามแก้จุดที่ความหมายถูกอยู่แล้ว ; ถ้าแก้คำหนึ่งที่โผล่หลายที่ ต้อง "all":true ให้สม่ำเสมอ
ห้ามมีอักษรจีนใน th/note/to ; ไม่มีให้ใส่ [] ; ห้ามใช้ กู/มึง`;

async function idiomPass(body: string, source: string, g: Glossary, notes: string[]): Promise<{ body: string; notes: string[]; added: number; fixed: number }> {
  const terms = relevant(g, source).terms;
  const out = await chat(IDIOM_SYSTEM, `GLOSSARY terms:\n${JSON.stringify(terms)}\n\nต้นฉบับ:\n${source.replaceAll('<!-- chunk -->', '')}\n\nคำแปล:\n${body.replaceAll('<!-- chunk -->', '')}`, 0.2, 'idioms').catch(() => '');
  let r: { notes?: { zh?: string; th?: string; note?: string }[]; terms?: { zh?: string; th?: string }[]; replace?: { from?: string; to?: string; all?: boolean }[] } = {};
  try { r = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch { return { body, notes, added: 0, fixed: 0 }; }
  // คำอังกฤษห้ามเข้ามาทาง replace ด้วย — รอบนี้รันหลัง fixCJK จึงไม่มีอะไรจับอีก (เคยได้ "โจวโจวsucked ลิ้น", "Cost")
  const thai = (s?: string) => (s ?? '').trim() && !CJK.test(s!) && !RUDE.test(s!) && !/[A-Za-z]{3,}/.test(s!) ? s!.trim() : '';
  let fixed = 0;
  for (const x of r.replace ?? []) {
    const from = (x.from ?? '').trim(), to = thai(x.to);
    // แทนเฉพาะข้อความที่เจอครั้งเดียว — เคยลอง "แทนทุกที่" เพื่อให้คำสม่ำเสมอ แล้วไปตัดนามสกุลชื่อเล่นตัวละครทิ้งทั้งบท
    // ความสม่ำเสมอของคำให้ได้จาก GLOSSARY ในการแปลรอบหน้าแทน
    if (from && to && from !== to && from.length >= 2 && body.split(from).length === 2) { body = body.replace(from, () => to); fixed++; }
  }
  // คำสำคัญประจำเรื่องเข้า GLOSSARY ได้เฉพาะสำนวน/คำเปรียบที่ใส่หมายเหตุในบทนี้ และโผล่ ≥2 ครั้ง (เช่น 白月光)
  // — กันชื่อเล่น/คำครั้งเดียวหลุดเข้าคลัง แล้วไปบังคับคำแปลผิดๆ ทั้งเรื่อง
  const noted = new Set((r.notes ?? []).map((n) => (n.zh ?? '').trim()).filter(Boolean));
  for (const t of r.terms ?? []) {
    const zh = (t.zh ?? '').trim(), th = thai(t.th);
    if (!zh || !th || !CJK.test(zh) || zh.length < 2 || g.terms[zh] || g.characters[zh] || !noted.has(zh)) continue;
    if (source.split(zh).length - 1 < 2) continue;
    g.terms[zh] = th;
  }
  let added = 0;
  for (const n of (r.notes ?? []).slice(0, Math.max(0, 8 - notes.length))) {
    const th = (n.th ?? '').trim(), note = thai(n.note)?.replace(/\s*\n\s*/g, ' ');
    if (!th || !note || th.length < 2 || META_NOTE.test(note)) continue;
    const i = body.indexOf(th);
    if (i < 0 || /^\[\^\d+\]/.test(body.slice(i + th.length))) continue; // ไม่เจอตรงตัว / มีหมายเหตุแล้ว
    if (!atWordEnd(body, i + th.length, th.length)) continue;
    notes = [...notes, `[^${notes.length + 1}]: ${th} — ${note}`];
    body = body.slice(0, i + th.length) + `[^${notes.length}]` + body.slice(i + th.length);
    added++;
  }
  return { body, notes, added, fixed };
}

// เว็บต้นทางชอบขึ้นบรรทัดใหม่กลางประโยค (ลงท้าย ，/、) → ต่อกลับเป็นย่อหน้าเดียว ไม่งั้นคำแปลขาดเป็นท่อนๆ
function joinBroken(paras: string[]): string[] {
  const out: string[] = [];
  for (const p of paras) {
    const prev = out.at(-1);
    if (prev && /[，、,：:]$/.test(prev) && !prev.startsWith('【')) out[out.length - 1] = prev + p;
    else out.push(p);
  }
  return out;
}

function chunk(paras: string[]): string[] {
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length > CHUNK) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + p;
  }
  if (cur) out.push(cur);
  return out;
}

// ---------- browser ----------
async function waitContent(page: Page) {
  const site = siteFor(page.url());
  // http: โหลดมาครบแล้วในครั้งเดียว — มีเนื้อบทก็จบ ไม่มีก็ไม่มีทางรอ
  if (HTTP) {
    if (await page.evaluate((sel) => !!document.querySelector(sel), site.contentSelector)) return;
    const t = await page.title().catch(() => '');
    fail(/just a moment|请稍候|attention required/i.test(t)
      ? `ติด Cloudflare (HTTP ${(page as HttpPage).status}) — ลองใหม่ทีหลัง หรือแปลจากเครื่องที่มี Chrome (--fetch chrome): ${page.url()}`
      : `ไม่เจอเนื้อบท (HTTP ${(page as HttpPage).status}): ${page.url()}`);
  }
  // หน้า Cloudflare ("Just a moment...") → รอนานขึ้นให้ผู้ใช้กดยืนยันในหน้าต่าง Chrome
  const cf = /just a moment|请稍候|attention required/i.test(await page.title().catch(() => ''));
  if (cf) {
    // แท็บเราปิด JS ไว้ แต่หน้ายืนยัน Cloudflare ต้องใช้ JS → เปิดกลับแล้วโหลดใหม่ให้ยืนยันได้
    console.error(`เจอหน้า Cloudflare → เปิด JS ให้ยืนยัน (ถ้ามีปุ่ม ไปกดในแท็บนั้น): ${page.url()}`);
    await page.setScripts(true).catch(() => {});
    await page.goto(page.url(), { timeout: 30_000 }).catch(() => {});
  }
  // ไม่ใช้ waitForSelector: มันรอด้วย requestAnimationFrame ซึ่ง Chrome หยุดในแท็บเบื้องหลัง
  // (แท็บใหม่ที่เราเปิดเองอยู่เบื้องหลัง) → ถาม DOM ตรงๆ ทุกครึ่งวินาทีแทน
  const deadline = Date.now() + (cf ? 120_000 : 45_000);
  let hungSince = 0;
  let reloaded = false;
  while (Date.now() < deadline) {
    // evaluate ไม่มี timeout ในตัว — แท็บที่ JS ในหน้าวนไม่รู้จบ (เว็บนิยายบางเว็บจงใจทำเมื่อเจอเครื่องมือคุมเบราว์เซอร์)
    // จะค้างรอตลอดกาล → ตัดที่ 3 วิ
    const r = await withTimeout(page.evaluate((sel) => !!document.querySelector(sel), site.contentSelector), 3000).catch(() => 'hung' as const);
    if (r === true) return;
    if (r === 'hung') {
      hungSince ||= Date.now();
      if (Date.now() - hungSince > 15_000) {
        if (reloaded) fail(`แท็บค้าง (สคริปต์ในหน้าเว็บวนไม่หยุด) แม้โหลดใหม่แล้ว: ${page.url()} — ปิดแท็บนั้นแล้วสั่งใหม่`);
        console.error(`แท็บค้าง → โหลดหน้าใหม่: ${page.url()}`);
        await page.goto(page.url(), { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
        reloaded = true;
        hungSince = 0;
      }
    } else hungSince = 0;
    await sleep(500);
  }
  fail('หน้าไม่โหลด/ติด Cloudflare — ไปกดยืนยันในหน้า Chrome แล้วสั่งใหม่');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// ดึงเนื้อบท — มีเพดานเวลา กันแท็บค้างแล้วรอไม่จบ
const extractChapter = (page: Page) =>
  withTimeout(siteFor(page.url()).extract(page), 30_000).catch(() => fail(`ดึงเนื้อบทไม่ได้ (แท็บค้าง): ${page.url()} — ปิดแท็บนั้นแล้วสั่งใหม่`));


// ยังไม่ได้เปิด Chrome (พอร์ต debug) → เปิดให้เอง ด้วยโปรไฟล์เดียวกับ open-chrome.cmd
async function ensureChrome() {
  const up = () => fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.ok, () => false);
  if (await up()) return;
  const exe = [
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  ].find((p) => existsSync(p));
  if (!exe) fail('ไม่เจอ chrome.exe — เปิดด้วย tools/novel-reader/open-chrome.cmd เอง');
  console.error('ยังไม่ได้เปิด Chrome → เปิดให้ (โปรไฟล์ .chrome-profile)');
  // กัน Chrome แช่แข็งแท็บเบื้องหลัง (แท็บของเราเปิดอยู่เบื้องหลัง)
  const noFreeze = ['--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'];
  spawn(exe, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${join(ROOT, '.chrome-profile')}`, ...noFreeze, 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 30; i++) { await sleep(500); if (await up()) return; }
  fail(`เปิด Chrome แล้วแต่ต่อพอร์ต ${PORT} ไม่ได้ — ถ้ามี Chrome โปรไฟล์นี้เปิดค้างอยู่แบบไม่มีพอร์ต ให้ปิดก่อน`);
}

// แท็บของตัวแปลเอง: จดรหัสแท็บไว้ (.own-tabs.json: รหัสแท็บ → pid ของรอบที่ใช้อยู่)
// รอบถัดไปใช้แท็บเดิมซ้ำ ถ้ายังเปิดอยู่ ตอบสนองได้ และไม่มีรอบอื่นใช้อยู่ — ไม่ต้องเปิดแท็บใหม่ทุกครั้ง และไม่ปิดแท็บใดๆ
const OWN_TABS = join(ROOT, '.own-tabs.json');
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function ownTab(): Promise<Page> {
  const tabs = await listTabs(PORT);
  const own = Object.fromEntries(Object.entries(readJson<Record<string, number>>(OWN_TABS, {})).filter(([id]) => tabs.some((t) => t.id === id)));
  const claim = (id: string) => {
    own[id] = process.pid;
    writeJson(OWN_TABS, own);
    // จบรอบ (ปกติหรือ fail) → คืนแท็บทันที (0 = ว่าง) ; ไม่พึ่งเช็ค pid อย่างเดียว เพราะบน Windows
    // process ที่เพิ่งจบยังดูเหมือน "มีชีวิต" อยู่ครู่หนึ่ง ทำให้รอบถัดไปคิดว่าแท็บยังถูกใช้
    process.on('exit', () => {
      const cur = readJson<Record<string, number>>(OWN_TABS, {});
      if (cur[id] === process.pid) { cur[id] = 0; writeJson(OWN_TABS, cur); }
    });
  };
  const inUse = (pid: number) => pid !== 0 && pid !== process.pid && alive(pid);
  for (const t of tabs.filter((t) => t.id in own && !inUse(own[t.id]))) {
    if (await responsive(t)) {
      claim(t.id);
      return CdpPage.own(t).catch((e) => fail(`ต่อแท็บเดิมไม่ได้: ${e.message}`));
    }
    console.error(`แท็บเดิมของตัวแปลค้าง (ใช้ต่อไม่ได้ ปิดเองได้เลย): ${t.url}`);
  }
  const p = await CdpPage.open(PORT).catch((e) => fail(`เปิดแท็บใหม่ไม่ได้: ${e.message}`));
  claim(p.targetId);
  return p;
}

async function pickPage(): Promise<Page> {
  // --url/--continue ใช้แท็บใหม่ของตัวเองเสมอ (แตะเฉพาะแท็บนี้ แปลเสร็จเปิดค้างไว้ ผู้ใช้ปิดเอง)
  if (opt('--url') || flag('--continue')) return ownTab();
  // ไม่มี flag = แปลแท็บนิยายที่ผู้ใช้เปิดค้างไว้
  const tabs = (await listTabs(PORT)).filter((t) => /^https?:/.test(t.url));
  const t = tabs.filter((x) => SITES.slice(0, -1).some((s) => s.match(x.url))).at(0) ?? tabs.at(0);
  if (!t) fail('ไม่เจอแท็บเว็บใน Chrome — เปิดหน้าบทนิยายไว้ก่อน');
  return CdpPage.attach(t).catch((e) => fail(`ต่อแท็บไม่ได้: ${e.message}`));
}

// ---------- reader.html ----------
function buildReader(id: string, prog: Progress) {
  const dir = bookDir(id);
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const chapters = prog.order
    .map((cid, i) => {
      const p = join(dir, 'chapters', `chapter${i + 1}.md`);
      if (!existsSync(p)) return '';
      const zp = p.replace(/\.md$/, '.zh.md');
      const split = (f: string) => {
        const [head, ...rest] = splitNotes(readFileSync(f, 'utf8'))[0].split('\n');
        const chunks = rest.join('\n').split('<!-- chunk -->').map((c) => c.split('\n').map((l) => l.trim()).filter(Boolean));
        return { head: head.replace(/^#\s*/, ''), chunks };
      };
      const th = split(p);
      const zh = existsSync(zp) ? split(zp) : null;
      // ย่อหน้าเท่ากัน → คู่ทีละย่อหน้า; ไม่เท่า → ต้นฉบับทั้งก้อนต่อท้าย chunk
      const body = th.chunks
        .map((tc, k) => {
          const zc = zh?.chunks[k] ?? [];
          if (zc.length === tc.length) return tc.map((l, j) => `<p>${esc(l)}</p><p class="zh">${esc(zc[j])}</p>`).join('');
          return tc.map((l) => `<p>${esc(l)}</p>`).join('') + (zc.length ? `<div class="zh">${zc.map((l) => `<p>${esc(l)}</p>`).join('')}</div>` : '');
        })
        .join('');
      return `<section id="c${i + 1}"><h2>${esc(th.head)}${zh ? `<small class="zh"> ${esc(zh.head)}</small>` : ''}</h2>${body}</section>`;
    })
    .join('');
  const toc = prog.order.map((_, i) => `<a href="#c${i + 1}">${i + 1}</a>`).join(' ');
  writeFileSync(join(dir, 'reader.html'), `<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(prog.bookTitle || id)}</title>
<style>body{max-width:720px;margin:auto;padding:16px;font:18px/1.9 system-ui,sans-serif;background:#faf8f3;color:#222}h1{font-size:22px}h2{margin-top:48px;font-size:20px}p{margin:0 0 1em}nav a{margin:0 4px}.zh{color:#8a8578;font-size:15px;line-height:1.7}div.zh{border-left:3px solid #d8d2c4;padding-left:10px;margin-bottom:1em}body.hidezh .zh{display:none}#tz{position:fixed;right:12px;bottom:12px;padding:8px 12px;border-radius:20px;border:1px solid #ccc;background:#fff}@media(prefers-color-scheme:dark){body{background:#16161a;color:#ddd}a{color:#8ab4f8}}</style>
<h1>${esc(prog.bookTitle || id)}</h1><nav>${toc}</nav>${chapters}
<button id="tz" onclick="document.body.classList.toggle('hidezh');try{localStorage.hz=document.body.classList.contains('hidezh')?1:''}catch(e){}">中/ไทย</button>
<script>try{if(localStorage.hz)document.body.classList.add('hidezh')}catch(e){}</script></html>`);
}

// ---------- ตรวจคุณภาพหลังแปล ----------
// แก้อัตโนมัติ: จีนปน/อังกฤษหลุด (ส่ง AI เกลาเฉพาะบรรทัด), บาท→หยวน, "หกสิบหมื่น"→"หกแสน"
// รายงานอย่างเดียว: กู/มึง (ต้องดูเพศคนฟังก่อนเลือก นาย/เธอ)
const NUM = 'หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า';
const SAFE_FIXES: [RegExp, (...m: string[]) => string][] = [
  [/(?<!พระ)บาท(?!หลวง|า)/g, () => 'หยวน'],
  [new RegExp(`(${NUM})สิบ(กว่า)?หมื่น`, 'g'), (_, d, k) => `${d}แสน${k ?? ''}`],
  [/(?<![ก-ฮ])สิบ(กว่า)?หมื่น/g, (_, k) => `หนึ่งแสน${k ?? ''}`],
  [new RegExp(`(${NUM})ร้อย(กว่า)?หมื่น`, 'g'), (_, d, k) => `${d}ล้าน${k ?? ''}`],
];
const BRANDS = /^(hello|kitty)$/; // คำอังกฤษที่เป็นชื่อแบรนด์ ไม่นับเป็นปัญหา
const leftovers = (t: string) => [...new Set([...(t.match(/[㐀-鿿豈-﫿]+/g) ?? []), ...(t.match(OTHER_G) ?? []), ...(t.match(/\b[a-z]{4,}\b/g) ?? []).filter((w) => !BRANDS.test(w))])];

async function checkChapter(file: string, g: Glossary): Promise<string | null> {
  const orig = readFileSync(file, 'utf8');
  const [bodyText, notesTail] = splitNotes(orig);
  const [head, ...rest] = bodyText.split('\n');
  const zhFile = file.replace(/\.md$/, '.zh.md');
  const zhChunks = existsSync(zhFile) ? readFileSync(zhFile, 'utf8').split('\n').slice(1).join('\n').split('<!-- chunk -->') : [];
  const chunks = rest.join('\n').split('<!-- chunk -->');
  let fixed = 0;
  for (let k = 0; k < chunks.length; k++) {
    let c = chunks[k];
    for (const [rx, fn] of SAFE_FIXES) c = c.replace(rx, (...m) => (fixed++, fn(...(m as string[]))));
    if (leftovers(c).length || RUDE.test(c)) { const before = leftovers(c).length; c = await fixCJK(c.trim(), zhChunks[k]?.trim() ?? '', g); fixed += before - leftovers(c).length; c = `\n\n${c}\n\n`; }
    chunks[k] = c;
  }
  const out = [head, ...chunks.join('<!-- chunk -->').split('\n')].join('\n').replace(/\n{3,}/g, '\n\n') + notesTail;
  if (out !== orig) writeFileSync(file, out);
  const issues: string[] = [];
  // เทียบแต่ละก้อนกับต้นฉบับ — ผิดรูป (ติดลูป/ขาดหาย) ต้องแปลบทนั้นใหม่
  const broken = chunks.map((c, k) => (zhChunks[k] ? insane(c.trim(), zhChunks[k].trim()) : null)).filter(Boolean);
  if (broken.length) issues.push(`⚠ ผิดรูป: ${broken.join(', ')} → แปลใหม่: --url <ลิงก์บทนี้>`);
  if (fixed) issues.push(`แก้อัตโนมัติ ${fixed} จุด`);
  const left = leftovers(out.replaceAll('<!-- chunk -->', '').replaceAll(NOTES_MARK, ''));
  if (left.length) issues.push(`ยังเหลือ: ${left.join(', ')}`);
  const rude = (out.match(new RegExp(RUDE.source, 'g')) ?? []).length;
  if (rude) issues.push(`กู/มึง ${rude} จุด`);
  return issues.length ? issues.join(' · ') : null;
}

async function checkBook(id: string, only?: string[]): Promise<string[]> {
  const prog = readJson<Progress>(join(bookDir(id), 'progress.json'), { bookTitle: '', order: [] });
  const g = readJson<Glossary>(join(bookDir(id), 'glossary.json'), emptyGlossary());
  const report: string[] = [];
  for (const [i, cid] of prog.order.entries()) {
    if (only && !only.includes(cid)) continue;
    const f = join(bookDir(id), 'chapters', `chapter${i + 1}.md`);
    if (!existsSync(f)) continue;
    Object.assign(CTX, { book: id, ch: i + 1, mode: CTX.mode || 'check' });
    const r = await checkChapter(f, g);
    if (r) report.push(`  บทที่ ${i + 1}: ${r}`);
  }
  buildReader(id, prog);
  return report;
}

// ---------- main ----------
// --list: ดูเรื่องทั้งหมด + บทล่าสุด
if (flag('--list')) {
  for (const d of existsSync(LIB) ? readdirSync(LIB).filter((d) => !d.startsWith('_') && existsSync(join(LIB, d, 'progress.json'))) : []) {
    const p = readJson<Progress>(join(bookDir(d), 'progress.json'), { bookTitle: '', order: [] });
    console.log(`${d}  ${p.bookTitle || '-'}  (${p.order.length} บท)  นักแปล: ${p.translator ?? '-'}`);
  }
  process.exit(0);
}
// --seed <canon.json> --book <id>: เติมชื่อ/ศัพท์ทางการ (เช่น translators/แฮรี่ตัวน้อยนักแปล/canon.json) ลงคลังของเรื่อง
// ค่าจาก canon ทับของเดิม + ตัวละครล็อกไว้; คืนคู่ (ไทยเดิม → ไทยใหม่) ไว้แก้บทที่แปลแล้ว
function seedCanon(id: string, canonPath: string) {
  const canon = readJson<Glossary>(canonPath, emptyGlossary());
  const gPath = join(bookDir(id), 'glossary.json');
  const g = readJson<Glossary>(gPath, emptyGlossary());
  const renames = new Map<string, string>();
  for (const [zh, c] of Object.entries(canon.characters)) {
    const old = g.characters[zh]?.th;
    if (old && old !== c.th && old.length >= 3) renames.set(old, c.th);
    g.characters[zh] = { ...g.characters[zh], ...c, locked: true };
  }
  for (const [zh, th] of Object.entries(canon.terms)) {
    const old = g.terms[zh];
    if (old && old !== th && old.length >= 3) renames.set(old, th);
    g.terms[zh] = th;
  }
  writeJson(gPath, g);
  // แก้ชื่อเดิมในบทที่แปลแล้ว (ยาวก่อน กันแทนซ้อน)
  let n = 0;
  const pairs = [...renames].sort((a, b) => b[0].length - a[0].length);
  const chDir = join(bookDir(id), 'chapters');
  for (const f of existsSync(chDir) ? readdirSync(chDir).filter((f) => /^chapter\d+\.md$/.test(f)) : []) {
    const p = join(chDir, f);
    let t = readFileSync(p, 'utf8');
    for (const [a, b] of pairs) { const k = t.split(a).length - 1; if (k) { n += k; t = t.split(a).join(b); } }
    writeFileSync(p, t);
  }
  if (existsSync(chDir)) buildReader(id, readJson<Progress>(join(bookDir(id), 'progress.json'), { bookTitle: '', order: [] }));
  console.log(`เติมคลังแล้ว: ${Object.keys(canon.characters).length} ตัวละคร, ${Object.keys(canon.terms).length} ศัพท์`);
  console.log(`แก้ชื่อในบทเดิม ${n} จุด: ${pairs.map(([a, b]) => `${a}→${b}`).join(', ') || '-'}`);
}

// ผูกนักแปลกับเรื่อง (จำใน progress.json) + เติม canon ของนักแปลลงคลัง ถ้ามี
function assignTranslator(id: string, name: string) {
  loadProfile(name); // เช็คว่ามีจริง
  mkdirSync(bookDir(id), { recursive: true });
  const pPath = join(bookDir(id), 'progress.json');
  const prog = readJson<Progress>(pPath, { bookTitle: '', order: [] });
  if (prog.translator === name) return;
  prog.translator = name;
  writeJson(pPath, prog);
  console.error(`เรื่อง ${id} ใช้นักแปล: ${name}`);
  const canon = join(TRANSLATORS, name, 'canon.json');
  if (existsSync(canon)) seedCanon(id, canon);
}

if (opt('--seed')) {
  seedCanon(opt('--book') ?? fail('ต้องระบุ --book <รหัสเรื่อง>'), join(ROOT, opt('--seed')!));
  process.exit(0);
}
// --translator <ชื่อ> --book <id> (ไม่มี --continue/--url): ผูกนักแปลอย่างเดียว ไม่ต้องต่อ Chrome
if (opt('--translator') && !flag('--continue') && !opt('--url')) {
  assignTranslator(opt('--book') ?? fail('ต้องระบุ --book <รหัสเรื่อง>'), opt('--translator')!);
  process.exit(0);
}
// --check: ตรวจ+แก้ทั้งเล่ม (ไม่ต้องต่อ Chrome)
if (flag('--check')) {
  const id = opt('--book') ?? latestBook() ?? fail('ยังไม่มีเรื่องใน library');
  const r = await checkBook(id);
  console.log(r.length ? `ผลตรวจ:\n${r.join('\n')}` : 'ผลตรวจ: ไม่พบปัญหา');
  process.exit(0);
}
// --repolish --book <id> --ch 3,5-7: เกลาสำนวนบทที่แปลแล้วใหม่ (ร่าง = คำแปลเดิม เทียบต้นฉบับ .zh.md) ไม่ต้องต่อ Chrome
// --notes --book <id> --ch …: ใส่หมายเหตุสำนวน/คำสำคัญให้บทที่แปลแล้วอย่างเดียว (ไม่เกลา ถูกกว่า)
if (flag('--repolish') || flag('--notes')) {
  const polishToo = flag('--repolish');
  const id = opt('--book') ?? fail('ต้องระบุ --book <รหัสเรื่อง>');
  const prog = readJson<Progress>(join(bookDir(id), 'progress.json'), { bookTitle: '', order: [] });
  PROFILE = prog.translator ? loadProfile(prog.translator) : '';
  const gPath = join(bookDir(id), 'glossary.json');
  const g = readJson<Glossary>(gPath, emptyGlossary());
  const nums = (opt('--ch') ?? fail('ต้องระบุ --ch <เลขบท เช่น 3,5-7>')).split(',').flatMap((s) => {
    const [a, b = a] = s.split('-').map(Number);
    return Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
  });
  const lines: string[] = [];
  for (const n of nums) {
    const file = join(bookDir(id), 'chapters', `chapter${n}.md`);
    const zhFile = file.replace(/\.md$/, '.zh.md');
    Object.assign(CTX, { book: id, ch: n, mode: polishToo ? 'repolish' : 'notes' });
    if (!existsSync(file) || !existsSync(zhFile)) { lines.push(`✗ บทที่ ${n}: ไม่มีไฟล์คำแปลหรือต้นฉบับ`); continue; }
    const [bodyText, notesTail] = splitNotes(readFileSync(file, 'utf8'));
    const [head, ...rest] = bodyText.split('\n');
    let th = rest.join('\n').split('<!-- chunk -->').map((c) => c.trim());
    let zh = readFileSync(zhFile, 'utf8').split('\n').slice(1).join('\n').split('<!-- chunk -->').map((c) => c.trim());
    // ก้อนไม่ตรงกัน → เกลาทั้งบทเป็นก้อนเดียว
    if (th.length !== zh.length) { th = [th.join('\n\n')]; zh = [zh.join('\n\n')]; }
    const out = polishToo ? await Promise.all(th.map(async (c, k) => fixCJK(await polish(c, zh[k], g), zh[k], g))) : th;
    const same = out.every((c, k) => c === th[k]);
    const ip = await idiomPass(out.join(CHUNK_MARK), zh.join(CHUNK_MARK), g, parseNoteLines(notesTail));
    writeFileSync(file, `${head}\n\n${ip.body}\n${notesBlock(ip.notes)}`);
    const extra = `หมายเหตุ +${ip.added}${ip.fixed ? ` · แก้ ${ip.fixed} จุด` : ''}`;
    lines.push(polishToo ? `✓ เกลาใหม่ บทที่ ${n}: ${head.replace(/^#\s*/, '')}${same ? ' (คงเดิม — ผลเกลาผิดรูป)' : ''} · ${extra}` : `✓ บทที่ ${n}: ${extra}`);
  }
  writeJson(gPath, g); // รอบหมายเหตุอาจเพิ่มคำสำคัญประจำเรื่อง
  const report = await checkBook(id, nums.map((n) => prog.order[n - 1]).filter(Boolean));
  console.log(lines.join('\n'));
  console.log(report.length ? `ผลตรวจ:\n${report.join('\n')}` : 'ผลตรวจ: ไม่พบปัญหา');
  if (USAGE.calls) console.log(`token: เรียก ${USAGE.calls} ครั้ง | ขาเข้า ${USAGE.hit + USAGE.miss} (cache hit ${USAGE.hit}) | ขาออก ${USAGE.out}`);
  process.exit(lines.some((l) => l.startsWith('✓')) ? 0 : 1);
}
// --fix <req.json>: แก้เฉพาะย่อหน้าที่ผู้อ่านเลือกจากโหมดแก้ไขในเว็บ (server.ts) ไม่ต้องต่อ Chrome
// req = {book, n, items:[{p, note}]} (p = ลำดับย่อหน้าไทยในบท นับจาก 1 ข้ามก้อน)
// เขียนแค่ข้อเสนอลง <req>.out.json — ไม่แตะไฟล์บท ผู้อ่านเทียบก่อน-หลังแล้วกดยืนยันในเว็บเอง
const FIX_PARA_SYSTEM = `คุณคือบรรณาธิการนิยายแปลจีน→ไทย ผู้อ่านชี้ย่อหน้าที่แปลผิดหรืออ่านแปลก พร้อมบอกว่าผิดอย่างไร
ให้แก้เฉพาะย่อหน้าที่ระบุ:
- ทำตามที่ผู้อ่านบอกเป็นหลัก แล้วเทียบต้นฉบับจีนให้ความหมายถูก (ผู้อ่านไม่ได้บอก → หาจุดผิด/แข็งเอง)
- ชื่อ เพศ สรรพนาม คำเรียก ตาม GLOSSARY; ห้ามใช้ กู/มึง; ภาษาไทยล้วน ห้ามมีอักษรจีน
- คงน้ำเสียงและเนื้อหาเดิม ไม่ตัด ไม่เพิ่มเนื้อหา ย่อหน้าละ 1 บรรทัด ให้ต่อกับย่อหน้าก่อน-หลังลื่น
- เครื่องหมายหมายเหตุ [^1] [^2] ในย่อหน้าเดิม ให้คงไว้ต่อท้ายสำนวนเดิม ห้ามลบ ห้ามเพิ่ม
ตอบเป็น JSON อย่างเดียว: {"fixes":[{"p":<เลขย่อหน้า>,"th":"<ย่อหน้าที่แก้แล้ว>","why":"<สรุปสั้นๆ ว่าแก้อะไร>"}]}

${STYLE}`;
if (opt('--fix')) {
  const reqPath = opt('--fix')!;
  const req = JSON.parse(readFileSync(reqPath, 'utf8')) as { book: string; n: number; items: { p: number; note?: string }[] };
  const dir = bookDir(req.book);
  Object.assign(CTX, { book: req.book, ch: req.n, mode: 'fix' });
  const prog = readJson<Progress>(join(dir, 'progress.json'), { bookTitle: '', order: [] });
  PROFILE = prog.translator ? loadProfile(prog.translator) : '';
  const g = readJson<Glossary>(join(dir, 'glossary.json'), emptyGlossary());
  const file = join(dir, 'chapters', `chapter${req.n}.md`);
  const paras = (f: string) => splitNotes(readFileSync(f, 'utf8'))[0].split('\n').slice(1).join('\n').split('<!-- chunk -->').map((c) => c.split('\n').map((l) => l.trim()).filter(Boolean));
  const th = paras(file);
  const zhFile = file.replace(/\.md$/, '.zh.md');
  const zh = existsSync(zhFile) ? paras(zhFile) : [];
  const flat = th.flatMap((c, ci) => c.map((l, j) => ({ l, ci, j })));
  // ก้อนที่จำนวนย่อหน้าเท่าต้นฉบับ → จับคู่ทีละย่อหน้าได้; ไม่เท่า → ส่งต้นฉบับทั้งก้อนให้หาเอง
  const zhOf = (ci: number, j: number) => (zh[ci]?.length === th[ci].length ? zh[ci][j] : null);
  const items = req.items.filter((it) => flat[it.p - 1]);
  const srcs: string[] = [];
  const blocks = items.map(({ p, note }) => {
    const x = flat[p - 1];
    const src = zhOf(x.ci, x.j) ?? `(จับคู่ทีละย่อหน้าไม่ได้ — หาส่วนที่ตรงจากต้นฉบับทั้งก้อนนี้)\n${(zh[x.ci] ?? []).join('\n')}`;
    srcs.push(src);
    return `### ย่อหน้า ${p}\nย่อหน้าก่อน: ${flat[p - 2]?.l ?? '-'}\nย่อหน้านี้: ${x.l}\nย่อหน้าถัดไป: ${flat[p]?.l ?? '-'}\nต้นฉบับ: ${src}\nผู้อ่านบอกว่า: ${note?.trim() || '(ไม่ได้ระบุ — หาจุดผิด/แข็งเอง)'}`;
  });
  if (!blocks.length) fail('ไม่พบย่อหน้าที่เลือก');
  const rel = relevant(g, srcs.join('\n') + items.map((it) => flat[it.p - 1].l).join('\n'));
  const user = `${pronounRules(rel)}GLOSSARY:\n${JSON.stringify(rel)}\n\n${blocks.join('\n\n')}`;
  let fixes: { p: number; th: string; why?: string }[] = [];
  for (let attempt = 1; attempt <= 2 && !fixes.length; attempt++) {
    const out = await chat(FIX_PARA_SYSTEM + PROFILE, user, 0.4, 'fix-para');
    try { fixes = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).fixes ?? []; } catch { console.error(`อ่าน JSON ไม่ได้ — ลองใหม่ ${attempt}/2`); }
  }
  const result = items.map(({ p, note }) => {
    const f = fixes.find((x) => Number(x.p) === p);
    const t = f?.th?.replace(/\s*\n\s*/g, ' ').trim();
    return { p, note: note ?? '', old: flat[p - 1].l, th: t && !CJK.test(t) ? t : null, why: f?.why ?? '' };
  });
  writeFileSync(reqPath.replace(/\.json$/, '.out.json'), JSON.stringify({ book: req.book, n: req.n, items: result }, null, 2));
  const ok = result.filter((r) => r.th && r.th !== r.old).length;
  console.log(`${ok ? '✓' : '✗'} ตอนที่ ${req.n}: เสนอแก้ ${ok}/${result.length} ย่อหน้า`);
  if (USAGE.calls) console.log(`token: เรียก ${USAGE.calls} ครั้ง | ขาเข้า ${USAGE.hit + USAGE.miss} (cache hit ${USAGE.hit}) | ขาออก ${USAGE.out}`);
  process.exit(ok ? 0 : 1);
}
// --discover <หน้า> [--cat <หมวด>]: ดึงรายการนิยายจบแล้วจาก 69shuba (50 เรื่อง/หน้า) + แปลชื่อ/คำโปรย → library/_discover/<หมวด>-<หน้า>.json
// หน้าเว็บ (server.ts /discover) เรียกตอนเลื่อนลงถึงท้ายรายการ ; หมวด 0 = ทั้งหมด (ดู DISCOVER_CATS ใน server.ts)
const DISCOVER_SYSTEM = `คุณคือบรรณาธิการนิยายแปลจีน→ไทย ได้รับรายการนิยายจีน (ชื่อเรื่อง หมวด คำโปรย) เป็น JSON
ให้แปลแต่ละเรื่องเป็นไทย:
- title_th: ชื่อเรื่องภาษาไทยที่ดึงดูดแบบนิยายแปลไทย (แปลความหมาย ไม่ถอดเสียงทั้งชื่อ; ชื่อคน/สถานที่ถอดเสียง; แฟนฟิคงานดังใช้ชื่อฉบับไทย เช่น 霍格沃茨=ฮอกวอตส์)
- intro_th: คำโปรยภาษาไทยครบใจความ อ่านลื่น 2–5 ประโยค (ตัดชื่ออื่นของเรื่อง/โฆษณาท้ายคำโปรยออก)
- สรรพนามตามยุคของเรื่อง: ยุคปัจจุบัน/ชีวิตเมือง/เกม/ไซไฟ ใช้ ผม/ฉัน/เขา/เธอ; จีนโบราณ/กำลังภายใน/เซียน/แฟนตาซีโลกเก่า ใช้ ข้า/เจ้า
ภาษาไทยล้วน ห้ามมีอักษรจีน ห้ามใช้ กู/มึง
ตอบเป็น JSON อย่างเดียว: {"items":[{"id":"","title_th":"","intro_th":""}]}`;
if (opt('--discover')) {
  const pageNo = Math.max(1, Number(opt('--discover')) || 1);
  const cat = String(Number(opt('--cat') ?? 0) || 0);
  Object.assign(CTX, { book: '_discover', ch: pageNo, mode: 'discover' });
  const tab: Page = HTTP ? new HttpPage() : (await ensureChrome(), await ownTab());
  // ต้องอยู่บนโดเมน 69shuba ก่อน fetch (คุกกี้ Cloudflare) — หน้าแรกของรายการโหลดเร็ว แม้ปิด JS
  if (!HTTP && !/69shuba\.com/.test(tab.url())) await tab.goto('https://www.69shuba.com/novels/full', { timeout: 60_000 }).catch(() => {});
  const grab = () => tab.evaluate(async (u) => {
    const r = await fetch(u);
    if (!r.ok) return { status: r.status, items: [] };
    const html = new TextDecoder('gbk').decode(await r.arrayBuffer()); // เว็บนี้ส่ง GBK
    const doc = new DOMParser().parseFromString(`<ul>${html}</ul>`, 'text/html');
    const items = [...doc.querySelectorAll('li')].map((li) => {
      const a = [...li.querySelectorAll('h3 a')].find((x) => x.textContent?.trim());
      const labels = [...li.querySelectorAll('.labelbox label')].map((l) => l.textContent?.trim() ?? '');
      return {
        id: a?.getAttribute('href')?.match(/book\/(\d+)/)?.[1] ?? '',
        title: a?.textContent?.trim() ?? '',
        author: labels[0] ?? '', cat: labels[1] ?? '', status: labels[2] ?? '',
        intro: (li.querySelector('ol')?.textContent ?? '').trim().replace(/\s*\n\s*/g, '\n'),
        latest: li.querySelector('.zxzj p')?.textContent?.replace('最近章节', '').trim() ?? '',
        cover: li.querySelector('img')?.getAttribute('data-src') ?? '',
      };
    }).filter((x) => x.id && x.title);
    return { status: r.status, items };
  }, `https://www.69shuba.com/ajax_novels/full/${cat}/${pageNo}.htm`, 60_000);
  let got = await grab().catch((e) => ({ status: 0, items: [], err: String(e.message) }));
  if (!got.items.length && !HTTP) {
    // ติด Cloudflare → เปิด JS ให้หน้าเว็บยืนยันตัว แล้วลองใหม่
    await tab.setScripts(true).catch(() => {});
    await tab.goto('https://www.69shuba.com/novels/full', { timeout: 60_000 }).catch(() => {});
    await sleep(8000);
    got = await grab().catch((e) => ({ status: 0, items: [], err: String(e.message) }));
    await tab.setScripts(false).catch(() => {});
  }
  if (!got.items.length) fail(`ดึงรายการไม่ได้ (HTTP ${got.status}) — ลองเปิด https://www.69shuba.com/novels/full ใน Chrome ให้ผ่าน Cloudflare ก่อน`);
  // แปลทีละ 10 เรื่องขนานกัน (คำโปรยยาว — กันชนเพดาน output)
  const groups: (typeof got.items)[] = [];
  for (let i = 0; i < got.items.length; i += 10) groups.push(got.items.slice(i, i + 10));
  const th = new Map<string, { title_th: string; intro_th: string }>();
  await Promise.all(groups.map(async (g) => {
    const input = JSON.stringify(g.map(({ id, title, cat, intro }) => ({ id, title, cat, intro: intro.slice(0, 400) })));
    for (let attempt = 1; attempt <= 2; attempt++) {
      const out = await chat(DISCOVER_SYSTEM, input, 0.4, 'discover').catch(() => '');
      try {
        for (const x of JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)).items ?? []) {
          const clean = (s: unknown) => String(s ?? '').replace(/[㐀-鿿豈-﫿]+/g, '').trim();
          if (x?.id) th.set(String(x.id), { title_th: clean(x.title_th), intro_th: clean(x.intro_th) });
        }
        if (g.every((x) => th.has(x.id))) break;
      } catch { console.error(`อ่าน JSON ไม่ได้ — ลองใหม่ ${attempt}/2`); }
    }
  }));
  const dir = join(LIB, '_discover');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${cat}-${pageNo}.json`);
  writeJson(file, { at: Date.now(), cat, page: pageNo, items: got.items.map((x) => ({ ...x, ...(th.get(x.id) ?? { title_th: '', intro_th: '' }) })) });
  console.log(`✓ หน้า ${pageNo}: ${got.items.length} เรื่อง (แปลแล้ว ${th.size})`);
  console.log(file);
  if (USAGE.calls) console.log(`token: เรียก ${USAGE.calls} ครั้ง | ขาเข้า ${USAGE.hit + USAGE.miss} (cache hit ${USAGE.hit}) | ขาออก ${USAGE.out}`);
  process.exit(0);
}
// --rebuild: สร้าง reader.html ใหม่อย่างเดียว (หลังแก้ไฟล์บทเอง) ไม่ต้องต่อ Chrome
if (flag('--rebuild')) {
  const id = opt('--book') ?? latestBook() ?? fail('ยังไม่มีเรื่องใน library');
  buildReader(id, readJson<Progress>(join(bookDir(id), 'progress.json'), { bookTitle: '', order: [] }));
  console.log(`สร้างใหม่แล้ว: ${join(bookDir(id), 'reader.html')}`);
  process.exit(0);
}
if (HTTP && !opt('--url') && !flag('--continue')) fail('--fetch http ต้องใช้คู่กับ --url หรือ --continue (ไม่มีแท็บ Chrome ให้แปล)');
const page: Page = HTTP ? new HttpPage() : (await ensureChrome(), await pickPage());

let target = opt('--url');
if (flag('--continue') && !target) {
  // แท็บใหม่ยังว่าง → ดูรหัสเรื่องจากแท็บนิยายที่เปิดอ่านอยู่แทน
  const m = HTTP ? null : (await listTabs(PORT)).map((t) => t.url.match(/\/txt\/(\d+)\//)).filter(Boolean).at(0);
  const id = opt('--book') ?? (m && existsSync(bookDir(m[1])) ? m[1] : undefined) ?? latestBook();
  let next = id && readJson<Progress>(join(bookDir(id), 'progress.json'), { bookTitle: '', order: [] }).nextUrl;
  // เรื่องใหม่ที่ยังไม่เคยแปล (--book ระบุมา) → หาบทแรกจากสารบัญ
  const book = opt('--book');
  if (!next && book && !existsSync(join(bookDir(book), 'progress.json'))) {
    const site = SITES.find((s) => s.firstChapter && s.match(page.url())) ?? SITES.find((s) => s.firstChapter);
    next = (await site?.firstChapter?.(page, book)) ?? undefined;
  }
  if (!next) fail('ไม่มีบทถัดไปที่บันทึกไว้ — ใช้ --url <ลิงก์บทแรก> แทน');
  target = next;
}
if (target) await page.goto(target, { waitUntil: 'domcontentloaded' });
await waitContent(page);

const t0 = Date.now();
const lines: string[] = [];
const newChars: string[] = [];
const done: string[] = [];
let ch: Chapter = await extractChapter(page);
let bookId = ch.bookId;

for (let i = 0; i < N; i++) {
  if (!ch.paragraphs.length) fail(`ดึงเนื้อหาบทไม่ได้: ${page.url()}`);
  const dir = bookDir(ch.bookId);
  mkdirSync(join(dir, 'chapters'), { recursive: true });
  const gPath = join(dir, 'glossary.json');
  const pPath = join(dir, 'progress.json');
  if (opt('--translator')) assignTranslator(ch.bookId, opt('--translator')!); // ก่อนอ่านคลัง — อาจเติม canon
  const tName = readJson<Progress>(pPath, { bookTitle: '', order: [] }).translator;
  PROFILE = tName ? loadProfile(tName) : '';
  const g = readJson<Glossary>(gPath, emptyGlossary());
  const prog = readJson<Progress>(pPath, { bookTitle: ch.bookTitle, order: [] });
  prog.bookTitle ||= ch.bookTitle;
  const known = prog.order.indexOf(ch.chapterId);
  Object.assign(CTX, { book: ch.bookId, ch: known >= 0 ? known + 1 : prog.order.length + 1, mode: known >= 0 ? 'retranslate' : 'new' });
  const chapterUrl = page.url(); // เก็บไว้ก่อน prefetch พาแท็บไปบทถัดไป

  // prefetch: ขณะแปลบทนี้ ให้แท็บไปโหลดบทถัดไปรอเลย
  const hasNext = i + 1 < N && ch.nextUrl;
  const nav = hasNext ? page.goto(ch.nextUrl!, { waitUntil: 'domcontentloaded' }).then(() => waitContent(page)) : null;

  // แปลทุกชิ้นขนานกัน (ใช้ glossary snapshot เดียวกัน) แล้วค่อย merge
  const pieces = chunk(joinBroken(ch.paragraphs));
  // ชื่อบทไปเป็นบรรทัดแรกของชิ้นแรก (ไม่แยกคำขอ) → ปกติทั้งบทคือ 1 คำขอแปล + 1 คำขอเกลา
  const results = await Promise.all(pieces.map((p, i) => translateChunk(i === 0 ? `${ch.title}\n\n${p}` : p, g, ch.title, i > 0 ? pieces[i - 1] : undefined, i === 0)));
  const [first, ...rest] = results[0].th.split('\n');
  let titleTh = first.trim();
  if (titleTh && titleTh.length <= 80 && !/[一-鿿]/.test(titleTh)) results[0].th = rest.join('\n').trim();
  else titleTh = (await translateChunk(ch.title, g, ch.title)).th.split('\n')[0]; // โมเดลไม่ได้แยกชื่อบทไว้บรรทัดแรก → แปลชื่อแยก
  for (const r of results) newChars.push(...merge(g, r.delta));

  if (!prog.order.includes(ch.chapterId)) prog.order.push(ch.chapterId);
  // ตั้งชื่อตามลำดับบท: chapter1.md, chapter2.md, …
  const base = join(dir, 'chapters', `chapter${prog.order.indexOf(ch.chapterId) + 1}`);
  // เลขหมายเหตุของแต่ละก้อนเริ่ม 1 → เรียงเลขใหม่ต่อกันทั้งบท; เครื่องหมายที่ไม่มีคำอธิบายตัดทิ้ง
  const notes: string[] = [];
  const bodies = results.map((r) => r.th.replace(/\[\^(\d+)\]/g, (_, d) => {
    const t = r.notes.get(Number(d));
    if (!t) return '';
    notes.push(`[^${notes.length + 1}]: ${t}`);
    return `[^${notes.length}]`;
  }));
  // รอบหมายเหตุสำนวน + คำสำคัญประจำเรื่อง (ปิดด้วย --no-notes)
  const ip = flag('--no-notes') ? { body: bodies.join(CHUNK_MARK), notes, added: 0, fixed: 0 } : await idiomPass(bodies.join(CHUNK_MARK), pieces.join(CHUNK_MARK), g, notes);
  writeFileSync(`${base}.md`, `# ${titleTh}\n\n${ip.body}\n${notesBlock(ip.notes)}`);
  writeFileSync(`${base}.zh.md`, `# ${ch.title}\n\n${pieces.join(CHUNK_MARK)}\n`); // ต้นฉบับ — แสดงคู่ใน reader
  // แปลบทเก่าซ้ำ (--url) ต้องไม่ย้อนจุด --continue กลับไป
  if (prog.order.indexOf(ch.chapterId) === prog.order.length - 1) {
    prog.lastUrl = chapterUrl;
    prog.nextUrl = ch.nextUrl;
  }
  writeJson(gPath, g);
  writeJson(pPath, prog);
  buildReader(ch.bookId, prog);
  lines.push(`✓ บทที่ ${prog.order.indexOf(ch.chapterId) + 1}: ${titleTh}`);
  done.push(ch.chapterId);
  bookId = ch.bookId;

  if (!hasNext) break;
  await nav;
  ch = await extractChapter(page);
}

const report = await checkBook(bookId, done); // ตรวจเฉพาะบทที่เพิ่งแปลรอบนี้
const g = readJson<Glossary>(join(bookDir(bookId), 'glossary.json'), emptyGlossary());
console.log(lines.join('\n'));
console.log(report.length ? `ผลตรวจ:\n${report.join('\n')}` : 'ผลตรวจ: ไม่พบปัญหา');
console.log(`ตัวละครใหม่: ${newChars.length ? newChars.join(', ') : '-'}`);
console.log(`คลังตอนนี้: ${Object.keys(g.characters).length} ตัวละคร, ${Object.keys(g.terms).length} คำศัพท์`);
console.log(`อ่าน: ${join(bookDir(bookId), 'reader.html')}`);
console.log(`เวลา: ${((Date.now() - t0) / 1000).toFixed(0)} วิ`);
if (USAGE.calls) console.log(`token: เรียก ${USAGE.calls} ครั้ง | ขาเข้า ${USAGE.hit + USAGE.miss} (cache hit ${USAGE.hit}) | ขาออก ${USAGE.out}`);
if (FIXLOG.cjk.size || FIXLOG.eng.size || FIXLOG.rude)
  console.log(`คำหลุดที่ต้องแก้: จีน [${[...FIXLOG.cjk].join(' ')}] | อังกฤษ [${[...FIXLOG.eng].join(' ')}] | กู/มึง ${FIXLOG.rude} บรรทัด`);
process.exit(0); // ไม่เรียก browser.close() — กันไปปิด Chrome ของผู้ใช้
