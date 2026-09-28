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

export type Delta = { characters?: Record<string, Partial<Character>>; terms?: Record<string, string> };

// merge delta จาก AI: ค่าที่ไม่ว่างทับค่าเดิม ยกเว้นตัวที่ locked; คืนรายชื่อตัวใหม่ที่เพิ่ง
export function merge(g: Glossary, d: Delta): string[] {
  const added: string[] = [];
  for (const [zh, c] of Object.entries(d.characters ?? {})) {
    const cur = g.characters[zh];
    if (cur?.locked) continue;
    if (!cur && !c.th) continue;
    if (!cur) added.push(`${c.th} (${zh}${c.gender ? ', ' + c.gender : ''})`);
    const clean = Object.fromEntries(Object.entries(c).filter(([k, v]) => k !== 'locked' && typeof v === 'string' && v.trim()));
    g.characters[zh] = { ...cur, ...clean } as Character;
  }
  for (const [zh, th] of Object.entries(d.terms ?? {})) {
    if (typeof th === 'string' && th.trim() && !g.terms[zh]) g.terms[zh] = th.trim();
  }
  return added;
}
