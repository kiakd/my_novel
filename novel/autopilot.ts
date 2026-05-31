// autopilot.ts — engine "เจนทั้งเรื่อง": PLAN (arc → threads → outline) แล้วค่อย WRITE
// แยกวางแผนออกจากการเขียน + thread ledger (เบาๆ เชิงผจญภัย) + plant/payoff ผูกกับ thread อัตโนมัติ (ไม่ให้โมเดล drift)
import type { Db } from 'mongodb';

const DS_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

async function callJSON(system: string, user: string, temperature = 0.7, max_tokens = 4096): Promise<any> {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(DS_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL, temperature, max_tokens,
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        }),
      });
      const j: any = await res.json();
      if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(j).slice(0, 160)}`);
      return JSON.parse(j.choices?.[0]?.message?.content ?? '{}');
    } catch (e) { if (a === 2) throw e; await new Promise(r => setTimeout(r, 4000)); }
  }
}

// แปลงชื่อย่อ (เช่น "เคเลน") → ชื่อเต็มตาม bible ("เคเลน ไวร์")
export function resolveName(s: any, nm: string): string {
  const all = (s.characters || []).map((c: any) => c.name);
  if (all.includes(nm)) return nm;
  const tok = String(nm).trim().split(/\s+/)[0];
  return all.find((n: string) => n.startsWith(nm) || n.split(/\s+/)[0] === tok) || nm;
}

function bibleBrief(s: any): string {
  return [
    `ชื่อเรื่อง: ${s.name}`, `แนว: ${s.genre}`, `ธีม: ${s.theme}`,
    `เรื่องย่อ: ${s.premise}`,
    `โครงรวม: ${(s.plot || '').slice(0, 800)}`,
    `โลก: ${(s.worldRules || '').slice(0, 900)}`,
    `ตัวละคร: ${(s.characters || []).map((c: any) => `${c.name}(${c.role || ''})`).join(' | ')}`,
  ].join('\n');
}

const TONE = 'โทนสบายๆ "ชีวิตประจำวันในสถาบัน" เน้นภารกิจ-ฝึกฝน-ลุยดันเจี้ยน-มิตรภาพ-โรแมนซ์ตามใจ เป็นสไลซ์ออฟไลฟ์ผจญภัย "ลดปริศนา/สิ่งลี้ลับ" (ไม่ใช่แนวสืบสวน). ห้าม drama หนัก การเมือง ทรยศ แค้น หรือดูถูกตัวเอก/พล็อต "ตบหน้า". อุปสรรค = มอนสเตอร์/ดันเจี้ยน/โจทย์ฝึก/ขีดจำกัดตัวเอง. "พื้นที่ลับ (ดันเจี้ยนลึกลับในป่า) ให้แค่โปรยไว้เฉยๆ — ไม่เข้าไปสำรวจและไม่ขยายความในองก์นี้".';

// ---------- STAGE 1a: Arc map ----------
export async function planArcs(s: any, N: number): Promise<any> {
  const sys = `คุณคือนักวางโครงนิยายมือโปร ตอบ JSON เท่านั้น
แบ่งเรื่อง (Act 1 ${N} ตอน วนอยู่ในสถาบันเป็นหลัก) เป็น 5 อาร์คย่อยต่อเนื่อง ครอบคลุมตอน 1..${N}
${TONE}
แต่ละอาร์ค = ช่วงฝึกฝน/ผจญภัยหนึ่งก้อน (เช่น ปฐมนิเทศ+เพื่อนใหม่, ดันเจี้ยนฝึกหัด, ภารกิจป่า/มอนสเตอร์, การแข่งในสถาบัน, ดันเจี้ยนใหญ่ปิดองก์)
จบ Act 1 = ดันเจี้ยนใหญ่/บอสมอนสเตอร์ + หมุดหมายความแข็งแกร่งที่น่าพอใจ (ไม่ใช่จุดพลิกดราม่า)
รูปแบบ: {"acts":[{"name":"...","from":1,"to":10,"goal":"เป้าหมายผจญภัย/ฝึกฝนของอาร์ค","turn":"ไฮไลต์/ความสำเร็จท้ายอาร์ค"}]}
ช่วงตอนต่อกันไม่ทับซ้อน ครบ 1..${N}`;
  return await callJSON(sys, bibleBrief(s) + `\n\nจำนวนตอน: ${N}`, 0.7, 2000);
}

// ---------- STAGE 1b: Thread ledger (เบาๆ) ----------
export async function planThreads(s: any, arcs: any, N: number): Promise<any> {
  const sys = `คุณคือนักวางเส้นเรื่อง ตอบ JSON เท่านั้น
ออกแบบ "เส้นเรื่องเบาๆ" 6-8 เส้น สำหรับเรื่อง ${N} ตอน — แนวชีวิตประจำวัน/ผจญภัย/พัฒนาการ/โรแมนซ์ ลดปริศนา
${TONE}
ชนิดที่เหมาะ: goal(เป้าหมายไต่ขั้น/ปลดล็อกเทคนิคเสริมกาย), dungeon(ของรางวัล/ภารกิจในดันเจี้ยน), beast(มอนสเตอร์ที่อยากปราบ), rivalry(คู่แข่งที่เป็นมิตร), bond(มิตรภาพ/โรแมนซ์ค่อยๆ พัฒนา)
type: goal|dungeon|beast|rivalry|bond|seed
"ส่วนใหญ่ต้องเป็น mini-arc ที่คลี่คลายภายในองก์ (revealCh > plantCh)"
"ต้องมี 1-2 เส้นแบบ seedOnly:true (type:seed) = โปรยไว้เฉยๆ ไม่เฉลยในองก์นี้" — โดยเฉพาะ "พื้นที่ลับ: ดันเจี้ยนลึกลับในป่า" ให้แค่พบทางเข้า/เอ่ยถึง ไม่เข้าไป ไม่ขยายความ (seedOnly ไม่ต้องมี revealCh)
ห้ามปมสมคบคิด/ทรยศ/แค้น
รูปแบบ: {"threads":[{"id":"T1","title":"...","type":"bond","plantCh":3,"revealCh":12,"breadcrumbs":[6,9],"seedOnly":false,"desc":"..."},{"id":"T2","title":"พื้นที่ลับในป่า","type":"seed","plantCh":20,"seedOnly":true,"breadcrumbs":[33],"desc":"แค่โปรยไว้ ไม่เฉลยองก์นี้"}]}`;
  const u = bibleBrief(s) + `\n\nArc map:\n${JSON.stringify(arcs.acts)}\n\nจำนวนตอน: ${N}`;
  return await callJSON(sys, u, 0.8, 3000);
}

// ---------- STAGE 1c: Outline batch — โมเดลเขียนแค่ beat/title/focus/sceneType, plant/payoff ผูกจาก thread เอง ----------
export async function planOutlineBatch(s: any, arcs: any, directives: string, from: number, to: number, prevTail: any[]): Promise<any> {
  const sys = `คุณคือนักวางโครงรายตอน ตอบ JSON เท่านั้น
เขียน outline ตอน ${from}..${to} ต่อเนื่องจากตอนก่อนหน้า สอดคล้องกับ Arc
${TONE}
แต่ละตอนระบุ: ch, title(ชื่อตอนน่าสนใจ), beat(สิ่งที่เกิด 2-3 ประโยค เน้นผจญภัย/ฝึก/ต่อสู้/มิตรภาพ/โรแมนซ์), focusChars(ชื่อจาก bible), sceneType("training"|"combat"|"dungeon"|"social"|"r18"|"mixed")
"คำสั่งเส้นเรื่องรายตอน" ด้านล่างบอกว่าตอนไหนต้อง 'ฝัง/ใบ้/คลี่คลาย' เส้นเรื่องใด — ให้สอดแทรกลงใน beat ให้เนียน (ไม่ต้องใส่ field plant/payoff เอง ระบบจะผูกให้)
รูปแบบ: {"chapters":[{"ch":${from},"title":"...","beat":"...","focusChars":["..."],"sceneType":"mixed","lenTarget":10000}]}`;
  const u = bibleBrief(s)
    + `\n\nArc map:\n${JSON.stringify(arcs.acts)}`
    + `\n\nคำสั่งเส้นเรื่องรายตอน (ช่วง ${from}-${to}):\n${directives || '(ช่วงนี้ไม่มีคำสั่งเส้นเรื่องเฉพาะ — เป็นตอนผจญภัย/ฝึก/โรแมนซ์อิสระ)'}`
    + (prevTail.length ? `\n\noutline ตอนก่อนหน้า (ต่อเนื่อง):\n${JSON.stringify(prevTail.map(o => ({ ch: o.ch, title: o.title, beat: o.beat })))}` : '')
    + `\n\nเขียนตอน ${from} ถึง ${to}`;
  return await callJSON(sys, u, 0.85, 4096);
}

// ---------- STAGE 1e: แผนผังความสัมพันธ์ (กันบทพูด/โทน/สรรพนามขัดกัน + assign คู่ R18) ----------
export async function planRelationships(s: any, r18Chapters: number[], N: number): Promise<any> {
  const sys = `คุณคือนักออกแบบความสัมพันธ์ตัวละคร ตอบ JSON เท่านั้น
ออกแบบ "แผนผังความสัมพันธ์" ระหว่างเคเลน(พระเอก)กับตัวละครหลักแต่ละคน ตลอด ${N} ตอน เพื่อให้บทพูด/โทน/สรรพนาม "ไม่ขัดกัน" และเปลี่ยนอย่างสมเหตุผลเมื่อความสัมพันธ์พัฒนา
ต่อตัวละครให้ระบุ stages (ช่วงตอน) ที่ความสัมพันธ์/วิธีพูดเปลี่ยน:
- from,to: ช่วงตอน · label: สถานะความสัมพันธ์ช่วงนั้น
- kaelenToHer: เคเลนเรียกเธอ/สรรพนาม/โทนคุยกับเธอช่วงนั้น (เจาะจง)
- herToKaelen: เธอเรียกเคเลน/สรรพนาม/โทน
- turningPoint: เหตุการณ์/ตอนที่ทำให้เปลี่ยนมาสเตจนี้
R18: ตอนที่เป็นฉาก R18 คือ [${r18Chapters.join(', ')}] — assign ว่าแต่ละตอน "คู่กับใคร" (เซราฟินเป็นคู่หลัก/โรแมนซ์ค่อยๆ ลึก แต่สลับเป็น นิกซ์/ไลรา/เวสเปอร์ ได้บ้างถ้าสมเหตุผล ตามใจทั้งคู่ ไม่บังคับฮาเร็ม) + ใส่ "r18 dynamic" ต่อตัวละครที่มีฉาก R18: เธอครางเรียกยังไง สรรพนามตอน R18 บทพูด/ท่าที (ปากแข็ง/ยั่ว/เขิน/คุมเกม) ให้ "ต่างกันชัดเจนต่อคน"
ตัวละครที่ไม่มี R18 (เช่นแคสเซียส) ใส่แค่ stages ความสัมพันธ์/โทนคุย
JSON: {"relationships":[{"char":"ชื่อเต็ม","summary":"...","stages":[{"from":1,"to":4,"label":"...","kaelenToHer":"...","herToKaelen":"...","turningPoint":"..."}],"r18":{"chapters":[5,9],"dynamic":"..."}}],"r18assign":{"5":"ชื่อเต็ม","9":"ชื่อเต็ม"}}`;
  const u = bibleBrief(s)
    + `\n\nตัวละครหลัก: ${(s.characters || []).filter((c: any) => !(c.role || '').includes('พระเอก')).map((c: any) => `${c.name}(${c.role})`).join(' | ')}`
    + `\n\nตอนที่เป็นฉาก R18: ${r18Chapters.join(', ')}`
    + `\nหมายเหตุ: คู่ R18 ต่อเนื่อง 2 ตอน (เช่น 9-10) ต้องเป็น "คนเดียวกัน"`;
  return await callJSON(sys, u, 0.75, 4096);
}

// ---------- VALIDATE (เบา — plant/payoff ผูกจาก thread แล้วจึงถูกเสมอ) ----------
export function validateOutline(outline: any[], threads: any[], s: any, N: number): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const charNames = new Set((s.characters || []).map((c: any) => c.name));
  const byCh: Record<number, any> = {};
  for (const o of outline) byCh[o.ch] = o;
  for (let i = 1; i <= N; i++) if (!byCh[i]) issues.push(`ขาด outline ตอน ${i}`);
  for (const t of threads) {
    if (t.revealCh <= t.plantCh) issues.push(`ปม ${t.id}: revealCh ต้อง > plantCh`);
    if (t.plantCh < 1 || t.revealCh > N) issues.push(`ปม ${t.id}: plant/reveal นอกช่วง 1..${N}`);
  }
  for (const o of outline)
    for (const nm of (o.focusChars || [])) if (!charNames.has(nm)) issues.push(`ตอน ${o.ch}: focusChar "${nm}" ไม่มีใน bible`);
  return { ok: issues.length === 0, issues };
}

// ---------- รัน PLAN ครบ ----------
export async function runPlan(s: any, N: number, log: (m: string) => void): Promise<any> {
  log('1a · วาง Arc map…');
  const arcs = await planArcs(s, N);
  log('   อาร์ค: ' + arcs.acts.map((a: any) => `${a.name}(${a.from}-${a.to})`).join(', '));

  log('1b · วางเส้นเรื่องเบาๆ…');
  const tRes = await planThreads(s, arcs, N);
  const threads = (tRes.threads || []).filter((t: any) =>
    t.seedOnly ? (t.plantCh >= 1 && t.plantCh <= N) : (t.revealCh > t.plantCh && t.plantCh >= 1 && t.revealCh <= N));
  log(`   เส้นเรื่อง ${threads.length} เส้น (seed-only ${threads.filter((t: any) => t.seedOnly).length})`);

  // ตาราง R18 บังคับ: ทุก 5 ตอนมี ≥1 (ตอน 5,15,25,…) + ทุก 10 ตอนมีคู่ต่อเนื่อง 2 ตอน (9-10,19-20,…)
  const r18Single = new Set<number>(), r18PairA = new Set<number>(), r18PairB = new Set<number>();
  for (let b = 0; b < N; b += 10) {
    if (b + 5 <= N) r18Single.add(b + 5);
    if (b + 10 <= N) { r18PairA.add(b + 9); r18PairB.add(b + 10); }
  }
  const isR18 = (ch: number) => r18Single.has(ch) || r18PairA.has(ch) || r18PairB.has(ch);

  const dirOf = (ch: number) => ({
    plant: threads.filter((t: any) => t.plantCh === ch),
    payoff: threads.filter((t: any) => !t.seedOnly && t.revealCh === ch),
    hint: threads.filter((t: any) => (t.breadcrumbs || []).includes(ch)),
  });

  log('1c · วาง outline รายตอน (ชุดละ 10)…');
  const outline: any[] = [];
  for (let from = 1; from <= N; from += 10) {
    const to = Math.min(from + 9, N);
    let directives = '';
    for (let ch = from; ch <= to; ch++) {
      const d = dirOf(ch); const parts: string[] = [];
      for (const t of d.plant) parts.push(t.seedOnly
        ? `โปรยเส้นเรื่อง "${t.title}" ไว้เฉยๆ (${t.desc}) — ห้ามขยาย/ห้ามเข้าไปสำรวจในองก์นี้`
        : `ฝังเส้นเรื่องใหม่ "${t.title}" (${t.desc})`);
      for (const t of d.hint) parts.push(`ใบ้/ย้ำถึง "${t.title}"`);
      for (const t of d.payoff) parts.push(`คลี่คลาย/สานจบ "${t.title}" (${t.desc})`);
      if (r18Single.has(ch)) parts.push('** ฉาก R18+ ในตอนนี้ (สมัครใจทั้งคู่ ตามใจทั้งสองฝ่าย) **');
      if (r18PairA.has(ch)) parts.push('** เริ่มฉาก R18+ "ต่อเนื่อง 2 ตอน" — เปิด/ดำเนินฉากค้างไว้ ยังไม่จบในตอนนี้ **');
      if (r18PairB.has(ch)) parts.push('** ฉาก R18+ "ต่อเนื่องจากตอนก่อน" (ฉากเดียวกันยาวข้ามตอน) ดำเนินต่อจนจบ **');
      if (parts.length) directives += `ตอน ${ch}: ${parts.join(' · ')}\n`;
    }
    const batch = await planOutlineBatch(s, arcs, directives, from, to, outline.slice(-2));
    for (const o of (batch.chapters || [])) {
      o.focusChars = (o.focusChars || []).map((n: string) => resolveName(s, n));
      const d = dirOf(o.ch);
      o.plant = d.plant.map((t: any) => t.id); o.hint = d.hint.map((t: any) => t.id); o.payoff = d.payoff.map((t: any) => t.id);
      if (isR18(o.ch)) o.sceneType = 'r18';
      o.r18 = isR18(o.ch);
      if (r18PairA.has(o.ch)) o.r18pair = 'start'; else if (r18PairB.has(o.ch)) o.r18pair = 'cont';
      outline.push(o);
    }
    log(`   ตอน ${from}-${to} ✓`);
  }

  log('1d · ตรวจสอบ…');
  const v = validateOutline(outline, threads, s, N);
  for (let b = 0; b < N; b += 5) {
    const seg = outline.filter(o => o.ch > b && o.ch <= b + 5);
    if (seg.length && !seg.some(o => o.r18)) v.issues.push(`ช่วง ${b + 1}-${b + 5}: ไม่มีฉาก R18`);
  }
  v.ok = v.issues.length === 0;
  log(v.ok ? '   ✓ ผ่าน' : `   ⚠ ${v.issues.length} ปัญหา`);
  return { arcs: arcs.acts, threads, outline, r18: { singles: [...r18Single], pairs: [...r18PairA].map(a => [a, a + 1]) }, validation: v };
}
