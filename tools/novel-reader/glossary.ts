// คลังตัวละคร/ศัพท์ต่อเรื่อง — แก้มือได้ที่ library/<book>/glossary.json
// ใส่ "locked": true ในตัวละครที่แก้เอง → AI จะไม่เขียนทับ

export type Character = {
  th: string; // ชื่อไทยมาตรฐาน
  gender?: 'ชาย' | 'หญิง' | string;
  role?: string; // บทบาท/อายุ/สถานะ
  self?: string; // สรรพนามแทนตัว (ผม/ฉัน/ข้า/กู…) และบริบท
  called?: string; // คนอื่นเรียก/อ้างถึงว่าอะไร (เขา/เธอ/พี่…)
  speech?: string; // สไตล์การพูด
  relations?: string; // ความสัมพันธ์กับคนอื่น
  locked?: boolean;
};

export type Glossary = {
  characters: Record<string, Character>; // key = ชื่อจีน
  terms: Record<string, string>; // สถานที่/องค์กร/คำเฉพาะ จีน → ไทย
};

export const emptyGlossary = (): Glossary => ({ characters: {}, terms: {} });

// ส่งเฉพาะรายการที่ปรากฏในข้อความ → prompt สั้น เร็ว ประหยัด
export function relevant(g: Glossary, text: string): Glossary {
  const pick = <T>(rec: Record<string, T>) =>
    Object.fromEntries(Object.entries(rec).filter(([zh]) => text.includes(zh)));
  return { characters: pick(g.characters), terms: pick(g.terms) };
}

// สรรพนาม/คำลงท้ายที่ตั้งไว้ → รายการบังคับแยกไว้หัวข้อความ — ถ้าฝังอยู่แค่ใน JSON โมเดลจะลอยตามฉาก
// (เรื่อง 45305: ตัวเอก self="ฉัน" แต่พอรอบข้างพูด ข้า กันหมด ก็ใช้ ข้า ตาม ราว 25 บรรทัดใน 10 ตอน)
export function pronounRules(g: Glossary): string {
  const rows = Object.values(g.characters).filter((c) => c.th && c.self).map((c) => `- ${c.th}${c.gender ? ` (${c.gender})` : ''}: ${c.self}`);
  return rows.length ? `คำแทนตัว/คำลงท้ายที่บังคับใช้ (สำคัญกว่าแนวเรื่อง ฉาก และสไตล์ — ห้ามเปลี่ยนแม้ตัวละครรอบข้างจะพูดแบบอื่น):\n${rows.join('\n')}\n\n` : '';
}

export type Delta ={ characters?: Record<string, Partial<Character>>; terms?: Record<string, string> };

// merge delta จาก AI: ค่าที่ไม่ว่างทับค่าเดิม ยกเว้นตัวที่ locked; คืนรายชื่อตัวใหม่ที่เพิ่ง
const HAN = /[㐀-鿿豈-﫿]/;

export function merge(g: Glossary, d: Delta): string[] {
  const added: string[] = [];
  for (const [zh, c] of Object.entries(d.characters ?? {})) {
    const cur = g.characters[zh];
    if (cur?.locked) continue;
    if (!cur && !c.th) continue;
    if (c.th && HAN.test(c.th)) continue; // ชื่อไทยที่ยังมีอักษรจีนปน = โมเดลแปลไม่จบ ห้ามเข้าคลัง
    if (!cur) added.push(`${c.th} (${zh}${c.gender ? ', ' + c.gender : ''})`);
    // เพศ/สรรพนาม/คำเรียก ที่ตั้งไว้แล้วห้ามทับ — เคยถูกแต่ละบทเขียนทับไปมา (ฉัน↔ข้า, ท่านลอร์ด↔ลอร์ดผู้ทรงเกียรติ) จนคำแปลสลับทุกตอน
    const STICKY = ['gender', 'self', 'called'];
    const clean = Object.fromEntries(Object.entries(c).filter(([k, v]) => k !== 'locked' && typeof v === 'string' && v.trim() && !(STICKY.includes(k) && (cur as any)?.[k])));
    const next = { ...cur, ...clean } as Character;
    // ผู้หญิงห้ามถูกเรียก "นาย" — โมเดลเคยใส่ called: "คุณ/นาย" ให้ตัวละครหญิง แล้วทุกบทก็เรียกตามคลัง
    // (ตัดเฉพาะ "นาย"/"พวกนาย" เดี่ยวๆ — "เจ้านาย" "คุณนาย" ไม่เกี่ยว)
    if (next.gender === 'หญิง' && next.called) {
      const parts = next.called.split('/').map((s) => s.trim()).filter((s) => s && s !== 'นาย' && s !== 'พวกนาย');
      next.called = parts.length ? parts.join('/') : 'เธอ';
    }
    g.characters[zh] = next;
  }
  for (const [zh, th] of Object.entries(d.terms ?? {})) {
    // เช่น 炼丹殿 → "ตำหนัก炼丹" เคยหลุดเข้าคลัง แล้วถูกส่งกลับไปเป็น "คำที่ถูกต้อง" ในบทถัดไป
    if (typeof th === 'string' && th.trim() && !HAN.test(th) && !g.terms[zh]) g.terms[zh] = th.trim();
  }
  return added;
}
