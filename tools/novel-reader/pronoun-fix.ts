// แก้หลังแปลที่ผู้ตรวจต้องตามแก้ซ้ำทุกชุด
//  1) mechanicalFixes — กำหนดตายตัว ไม่เรียกโมเดล (เลขหน่วยหมื่น, เครื่องหมายจีน, ฝ่าหยวน)
//  2) คำแทนตัว "ห้ามใช้" ของตัวละคร — โปรแกรมคัดบรรทัดต้องสงสัย + ตรวจผล ส่วนการระบุผู้พูดให้โมเดลทำ (translate.ts pronounPass)
//     ระบุผู้พูดด้วยกฎล้วนไม่ได้: บทพูดหลายย่อหน้าติดกันไม่มีชื่อกำกับ และคำบรรยายชื่อผู้พูดมักอยู่ "หลัง" บทพูด
//     (บท 134 ของ 45305: ตัวเอกพูด ข้า 6 บรรทัด สลับกับ "หลัวเฟิง" ที่พูด ข้า ได้ถูกต้อง)
import type { Glossary } from './glossary.ts';

export type Rule = { zh: string; th: string; want: string; forbid: string[] };

const PRONOUNS = ['ข้าน้อย', 'ข้า', 'ผม', 'ฉัน', 'หนู'];
// คำที่ขึ้นต้นเหมือนคำแทนตัวแต่ไม่ใช่: ข้าง ข้าม ข้าว ข้าศึก ข้าราชการ ข้าทาส ข้าหลวง / ผมขาว เส้นผม
export const TOKEN: Record<string, RegExp> = {
  // (?<!เ): "เข้า" = เ+ข้า — เคยแทนเป็น "เฉัน" (เข้าใจ→เฉันใจ) ในบทพูดตัวเอก
  'ข้าน้อย': /(?<!เ)ข้าน้อย/g,
  'ข้า': /(?<!เ)ข้า(?!ง|ม|ว|ศึก|ราช|ทาส|หลวง|น้อย)/g,
  'ผม': /(?<!เส้น|ทรง|เกล้า|มวย)ผม(?!ขาว|ยาว|ดำ|หงอก|สั้น|เผ้า|เปีย|ทอง|สี)/g,
  'ฉัน': /ฉัน/g,
  'หนู': /หนู(?!ทดลอง)/g,
};

// อ่านกฎจาก self: คำแทนตัวคำแรก = ที่ต้องใช้ ; คำต้องห้าม = "ห้าม(ใช้) x/y" + คำแทนตัวหลักคำอื่นโดยปริยาย
// (เคยจำกัดแค่ตัวที่เขียน "ห้าม" — ตัวรองอย่าง หลี่ย่า self=ฉัน ไม่มีคำว่าห้าม เลยหลุด "ข้า" โดยไม่มีอะไรจับ)
// ข้า ↔ ข้าน้อย ไม่ห้ามกันโดยปริยาย (ตัวถ่อมตนสลับใช้ได้) เว้นเขียน "ห้าม" ไว้ชัด
const IMPLIED: Record<string, string[]> = {
  'ฉัน': ['ข้า', 'ผม', 'ข้าน้อย'], 'ผม': ['ข้า', 'ฉัน', 'ข้าน้อย'], 'หนู': ['ข้า', 'ผม'],
  'ข้า': ['ฉัน', 'ผม'], 'ข้าน้อย': ['ฉัน', 'ผม'],
};
export function rulesFrom(g: Glossary): Rule[] {
  const out: Rule[] = [];
  for (const [zh, c] of Object.entries(g.characters)) {
    const self = c.self ?? '';
    const want = PRONOUNS.find((p) => self.trimStart().startsWith(p));
    if (!want || !c.th) continue;
    const m = self.match(/ห้าม(?:ใช้)?\s*([^)·]+)/);
    const explicit = m ? m[1].split(/[\/,\s]+/).map((s) => s.trim()) : [];
    const forbid = [...new Set([...explicit, ...IMPLIED[want]])].filter((s) => PRONOUNS.includes(s) && s !== want);
    if (forbid.length) out.push({ zh, th: c.th, want, forbid });
  }
  return out;
}

const QUOTED = /([“"])([^”"]*)([”"])/g;
const paras = (s: string) => s.split('\n').map((l) => l.trim()).filter((l) => l && l !== '<!-- chunk -->');

export type Candidate = { line: number; th: string; ctx: string };

// บรรทัดที่บทพูดในเครื่องหมายคำพูดมีคำต้องห้ามของตัวละครในกฎ และตัวละครนั้นอยู่ในฉาก (ชื่อจีนอยู่ใกล้ๆ ในต้นฉบับ)
// ctx = ย่อหน้าต้นฉบับที่ตรงกัน ±4 (ต้องมีจำนวนย่อหน้าเท่ากันถึงจะเทียบได้)
export function candidates(body: string, source: string, rules: Rule[]): Candidate[] {
  if (!rules.length) return [];
  const src = paras(source);
  const lines = body.split('\n');
  const idx = lines.map((l, i) => [i, l.trim()] as const).filter(([, l]) => l && l !== '<!-- chunk -->').map(([i]) => i);
  if (idx.length !== src.length) return [];
  const out: Candidate[] = [];
  idx.forEach((i, k) => {
    // ตัวละครอยู่ในฉาก: ชื่อจีนในต้นฉบับใกล้ๆ หรือชื่อไทยในคำแปลใกล้ๆ (ต้นฉบับมักเรียกฉายา เช่น 赵老 แทน 赵长守)
    const near = src.slice(Math.max(0, k - 8), k + 3).join('');
    const nearTh = idx.slice(Math.max(0, k - 8), k + 3).map((j) => lines[j]).join('');
    const quoted = [...lines[i].matchAll(QUOTED)].map((m) => m[2]).join(' ');
    const hit = rules.some((r) => (near.includes(r.zh) || nearTh.includes(r.th)) && r.forbid.some((f) => new RegExp(TOKEN[f].source).test(quoted)));
    if (hit) out.push({ line: i, th: lines[i], ctx: src.slice(Math.max(0, k - 4), k + 2).map((s, j) => (Math.max(0, k - 4) + j === k ? `>>> ${s}` : s)).join('\n') });
  });
  return out.slice(0, 40);
}

// แก้ได้เฉพาะคำแทนตัวต้องห้ามในเครื่องหมายคำพูด → ถ้าโมเดลแก้อย่างอื่นด้วย ไม่รับ
export function applyRule(line: string, rule: Rule): string {
  return line.replace(QUOTED, (_, a: string, inner: string, b: string) => {
    let s = inner;
    for (const f of rule.forbid) s = s.replace(TOKEN[f], rule.want);
    return a + s + b;
  });
}

// ---------- เลขผสมเลขอารบิก+หน่วยจีน ในต้นฉบับ → เลขเต็ม (ก่อนส่งให้โมเดล) ----------
// โมเดลแปลงหลักพลาดบ่อย: 18070亿4642万5216 เคยออกมาเป็น 18,070,464,252,216 (ที่ถูก 1,807,046,425,216), 8000万 → "8000 หมื่น"
// คำนวณด้วยโปรแกรมแทน — แตะเฉพาะรูปที่ขึ้นต้นด้วยเลขอารบิก (三十万 ฯลฯ โมเดลแปลงได้ถูกอยู่แล้ว)
const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 }));
export function normalizeZhNumbers(src: string): string {
  return src
    // X亿[Y万][Z] — Y/Z ต้องเป็นเลขล้วน (Z ไม่เกิน 4 หลัก)
    .replace(/(\d+(?:\.\d+)?)亿(?:(\d{1,4})万)?(\d{1,4}(?!\d))?(?![万千百])/g, (m, a: string, b?: string, c?: string) =>
      fmt(Number(a) * 1e8 + Number(b ?? 0) * 1e4 + Number(c ?? 0)))
    // X万Y千 / X万YYYY / X万
    .replace(/(\d+(?:\.\d+)?)万(\d)千/g, (m, a: string, b: string) => fmt(Number(a) * 1e4 + Number(b) * 1000))
    .replace(/(\d+(?:\.\d+)?)万(\d{4})(?!\d)/g, (m, a: string, b: string) => fmt(Number(a) * 1e4 + Number(b)))
    .replace(/(\d+(?:\.\d+)?)万(?![\d千百])/g, (m, a: string) => fmt(Number(a) * 1e4));
}

// ---------- แก้เชิงกล (ไม่เรียกโมเดล) ----------
// เลข + "หมื่น" ที่เลขเกิน 9 = แปลหน่วย 万 ตรงตัว ("8000 หมื่น" = 80 ล้าน) → เขียนเป็นเลขเต็ม
function fixWan(s: string): [string, number] {
  let n = 0;
  const out = s.replace(/(\d[\d,]*(?:\.\d+)?)\s*หมื่น/g, (m, num: string) => {
    const v = Number(num.replace(/,/g, ''));
    if (!Number.isFinite(v) || v < 10) return m; // "5 หมื่น" ถูกอยู่แล้ว
    n++;
    const total = v * 10_000;
    return total % 1_000_000 === 0 ? `${(total / 1_000_000).toLocaleString('en-US')} ล้าน` : total.toLocaleString('en-US');
  });
  return [out, n];
}

// เครื่องหมายจีนเต็มความกว้าง → แบบไทย/ASCII ; 《ชื่อ》 → ‘ชื่อ’ (ผู้ตรวจต้องตามแก้ทุกชุด — ไม่ใช้ “” เพราะชนกับบทพูด)
const PUNCT: [RegExp, string][] = [[/《([^《》\n]{1,60})》/g, '‘$1’'],[/【/g, '['], [/】/g, ']'], [/［/g, '['], [/］/g, ']'], [/（/g, '('], [/）/g, ')'], [/：\s*/g, ': '], [/[，；、]\s*/g, ' '], [/！/g, '!'], [/？/g, '?']];

// กฎ "เงินจีน = หยวน" ทำให้โมเดลเปลี่ยน "บาท" ในคำอื่นเป็น "หยวน" ไปด้วย (ฝ่าบาท/บทบาท)
const BAHT: [RegExp, string][] = [[/ฝ่าหยวน/g, 'ฝ่าบาท'], [/บทหยวน/g, 'บทบาท']];

export function mechanicalFixes(body: string): { body: string; fixed: number } {
  let fixed = 0;
  let s = body;
  // ใช้ฟังก์ชันเพื่อนับจำนวน — ต้องขยาย $1 เอง (ฟังก์ชันแทนที่ไม่ขยายให้)
  for (const [re, to] of [...PUNCT, ...BAHT]) s = s.replace(re, (...m) => { fixed++; return to.replace(/\$(\d)/g, (_, d) => String(m[Number(d)] ?? '')); });
  const [w, n] = fixWan(s);
  return { body: w, fixed: fixed + n };
}
