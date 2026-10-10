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
  'ข้าน้อย': /ข้าน้อย/g,
  'ข้า': /ข้า(?!ง|ม|ว|ศึก|ราช|ทาส|หลวง|น้อย)/g,
  'ผม': /(?<!เส้น|ทรง|เกล้า|มวย)ผม(?!ขาว|ยาว|ดำ|หงอก|สั้น|เผ้า|เปีย|ทอง|สี)/g,
  'ฉัน': /ฉัน/g,
  'หนู': /หนู(?!ทดลอง)/g,
};

// อ่านกฎจาก self: คำแทนตัวคำแรก = ที่ต้องใช้ ; "ห้าม(ใช้) x/y" = คำต้องห้าม
export function rulesFrom(g: Glossary): Rule[] {
  const out: Rule[] = [];
  for (const [zh, c] of Object.entries(g.characters)) {
    const self = c.self ?? '';
    const want = PRONOUNS.find((p) => self.trimStart().startsWith(p));
    const m = self.match(/ห้าม(?:ใช้)?\s*([^)·]+)/);
    if (!want || !m || !c.th) continue;
    const forbid = m[1].split(/[\/,\s]+/).map((s) => s.trim()).filter((s) => PRONOUNS.includes(s) && s !== want);
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
    const near = src.slice(Math.max(0, k - 8), k + 3).join('');
    const quoted = [...lines[i].matchAll(QUOTED)].map((m) => m[2]).join(' ');
    const hit = rules.some((r) => near.includes(r.zh) && r.forbid.some((f) => new RegExp(TOKEN[f].source).test(quoted)));
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

// เครื่องหมายจีนเต็มความกว้าง → แบบไทย/ASCII (คง 《》 ไว้ — ใช้เป็นวงเล็บชื่อหนังสือ)
const PUNCT: [RegExp, string][] = [[/【/g, '['], [/】/g, ']'], [/［/g, '['], [/］/g, ']'], [/（/g, '('], [/）/g, ')'], [/：\s*/g, ': '], [/[，；、]\s*/g, ' '], [/！/g, '!'], [/？/g, '?']];

// กฎ "เงินจีน = หยวน" ทำให้โมเดลเปลี่ยน "บาท" ในคำอื่นเป็น "หยวน" ไปด้วย (ฝ่าบาท/บทบาท)
const BAHT: [RegExp, string][] = [[/ฝ่าหยวน/g, 'ฝ่าบาท'], [/บทหยวน/g, 'บทบาท']];

export function mechanicalFixes(body: string): { body: string; fixed: number } {
  let fixed = 0;
  let s = body;
  for (const [re, to] of [...PUNCT, ...BAHT]) s = s.replace(re, () => { fixed++; return to; });
  const [w, n] = fixWan(s);
  return { body: w, fixed: fixed + n };
}
