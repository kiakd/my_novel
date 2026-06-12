// test-r18-en.ts — ทดลองฉาก R18 ภาษาอังกฤษ vs ไทย เทียบ DeepSeek vs Gemma E4B
// วัด "ความตรงของคำ" (direct lexicon) ว่า EN ออกตรงกว่า TH ไหม ทั้งสอง provider
// รัน: cd novel && bun test-r18-en.ts  (โหลด .env จาก cwd)
import { assembleChatPrompt, buildPersonaReminder, type ChatCharLite } from './chat-prompt';

const DS_KEY = process.env.DEEPSEEK_API_KEY!;
const DS_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
const LM_URL = process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1/chat/completions';
const LM_MODEL = process.env.LMSTUDIO_MODEL ?? 'gemma-4-e4b-it-uncensored';

// ตัวละครผู้ใหญ่ยินยอม rel สูง — แยกตัวแปร "ความตรงของคำ" ออกจากพลวัตความยินยอม
const char: ChatCharLite = {
  name: 'Selene',
  appearance: 'a 27-year-old woman, auburn hair, green eyes, full figure',
  outfit: 'a thin silk robe, nothing underneath',
  description: 'a confident, sensual woman who lives with her lover. They are deeply in love.',
  mindset: 'open, bold, knows exactly what she wants',
  behavior: 'teasing, physically forward, speaks her desire plainly',
  pronounSelf: 'I',
  pronounOther: 'you',
  speechTone: 'sultry, blunt, uninhibited',
  guard: 5,
};

const REL = 95; // คนรัก — ยินยอมเต็มใจ

// ฉากเดียวกัน 2 ภาษา — ทั้งคู่นำเข้าสู่ฉากเพศตรง ๆ
const SCENE_EN =
  '*I push you back onto the bed and climb on top of you, my robe slipping off my shoulders. ' +
  'I take your hard length in my hand and guide it against my wet entrance, looking into your eyes.* ' +
  '"I want you inside me. Now. Don\'t hold back." *I sink down onto you slowly.*';
const SCENE_TH =
  '*ฉันผลักเธอลงนอนบนเตียงแล้วปีนขึ้นคร่อม เสื้อคลุมไหมหลุดจากไหล่ ' +
  'มือฉันกำของแข็ง ๆ ของเธอไว้แล้วนำมันมาจ่อตรงปากช่องที่เปียกชุ่ม สบตาเธอ* ' +
  '"ฉันอยากให้เธออยู่ข้างในฉัน เดี๋ยวนี้เลย อย่ายั้ง" *ฉันค่อย ๆ ทรุดตัวลงเสียบเธอเข้าไป*';

// คำ "ตรง" ที่ใช้นับ directness (raw lexicon)
const RAW_EN = ['cock', 'cunt', 'pussy', 'dick', 'nipple', 'clit', 'cum', 'ass', 'tits'];
const RAW_TH = ['ควย', 'หัวควย', 'หี', 'หัวนม', 'นม', 'ตูด', 'ก้น', 'น้ำรัก', 'น้ำเงี่ยน', 'จิ๋ม'];
const EVASIVE = ['manhood', 'member', 'length', 'core', 'entrance', 'sex', 'womanhood', 'แก่นกาย', 'ของลับ', 'จุดซ่อนเร้น', 'ส่วนนั้น', 'ตรงนั้น', 'น้องชาย', 'ความร้อน'];

function countHits(text: string, words: string[]): { n: number; found: string[] } {
  const low = text.toLowerCase();
  const found = words.filter((w) => low.includes(w.toLowerCase()));
  // นับจำนวนครั้งรวม
  let n = 0;
  for (const w of words) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    n += (low.match(re) || []).length;
  }
  return { n, found };
}

async function callDeepSeek(system: string, user: string, reminder: string) {
  const body: Record<string, unknown> = {
    model: DS_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
      { role: 'system', content: reminder },
    ],
    temperature: 0.9,
    max_tokens: 800,
  };
  if (DS_MODEL.includes('v4')) body.thinking = { type: 'disabled' };
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${DS_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`deepseek ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return { text: j.choices?.[0]?.message?.content ?? '', usage: j.usage };
}

async function callLM(system: string, user: string, reminder: string) {
  const res = await fetch(LM_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer lm-studio', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
        { role: 'system', content: reminder },
      ],
      temperature: 0.9,
      max_tokens: 800,
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`lmstudio ${res.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return { text: j.choices?.[0]?.message?.content ?? '', usage: j.usage };
}

const system = assembleChatPrompt(char, REL, undefined, false);
const reminder = buildPersonaReminder(char, REL, 'char');

type Run = { lang: 'EN' | 'TH'; provider: 'DeepSeek' | 'E4B'; text: string; usage: any };
const runs: Run[] = [];

async function go(lang: 'EN' | 'TH', provider: 'DeepSeek' | 'E4B') {
  const user = lang === 'EN' ? SCENE_EN : SCENE_TH;
  const fn = provider === 'DeepSeek' ? callDeepSeek : callLM;
  process.stdout.write(`▶ ${provider} / ${lang} ... `);
  try {
    const { text, usage } = await fn(system, user, reminder);
    runs.push({ lang, provider, text, usage });
    console.log(`ok (${text.length} chars)`);
  } catch (e: any) {
    console.log(`ERROR ${e.message}`);
    runs.push({ lang, provider, text: `[ERROR] ${e.message}`, usage: null });
  }
}

// E4B ก่อน (local เร็ว) แล้ว DeepSeek
await go('EN', 'E4B');
await go('TH', 'E4B');
await go('EN', 'DeepSeek');
await go('TH', 'DeepSeek');

// ===== วิเคราะห์ + เขียนรายงาน =====
let md = `# ทดลอง R18 EN vs TH — DeepSeek vs Gemma E4B\n\n`;
md += `> ฉากเดียวกัน (คนรัก rel ${REL}, ยินยอมเต็มใจ) ยิง 2 ภาษา × 2 provider · กฎ lexicon ปัจจุบัน (ไทยเป็นหลัก, อังกฤษ fallback)\n\n`;
md += `## สรุปความตรงของคำ (raw lexicon hits)\n\n`;
md += `| Provider | Lang | คำตรง (raw) | คำเลี่ยง (evasive) | tokens | ตัวอย่างคำตรงที่เจอ |\n`;
md += `|---|---|---|---|---|---|\n`;
for (const r of runs) {
  const raw = countHits(r.text, r.lang === 'EN' ? RAW_EN : RAW_TH);
  const eva = countHits(r.text, EVASIVE);
  const tk = r.usage?.completion_tokens ?? '-';
  md += `| ${r.provider} | ${r.lang} | **${raw.n}** | ${eva.n} | ${tk} | ${raw.found.join(', ') || '—'} |\n`;
}
md += `\n---\n\n## ข้อความเต็ม\n\n`;
for (const r of runs) {
  md += `### ${r.provider} — ${r.lang}\n\n`;
  md += '```\n' + r.text.trim() + '\n```\n\n';
}

await Bun.write('../review/r18-en-vs-th.md', md);
console.log('\n=== TABLE ===');
console.log(md.split('## สรุป')[1].split('---')[0]);
console.log('saved → review/r18-en-vs-th.md');
