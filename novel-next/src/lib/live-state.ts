// live-state.ts — "สถานะติดตามอัตโนมัติ" แบบ structured ฝั่ง frontend
// mirror โครง StateCard ของ backend (novel/state-card.ts) เป๊ะ ๆ
// อัปเดตทุกเทิร์นผ่านแท็ก [[state:]] delta ที่ขี่มากับคำตอบ (ไม่มี LLM call เพิ่ม)
// — แยกจาก ChatStateCard (extractState) ที่เรียก LLM สกัดทุก ~6 เทิร์น

/** ตัวตน/ร่างที่ปรากฏตอนนี้ (ตรงกับ StateIdentity ของ backend) */
export interface LiveIdentity {
  realName?: string;   // ชื่อจริง (ไม่ควรเปลี่ยน)
  form?: string;       // ร่าง/รูปลักษณ์ที่ปรากฏตอนนี้
  alias?: string;      // ชื่อที่ใช้ตอนนี้ (อาจเป็นชื่อปลอม)
  gender?: string;     // เพศที่ปรากฏตอนนี้
  disguised?: boolean; // กำลังปลอมตัว/แปลงร่างอยู่ไหม
}

/** บัตรสถานะ structured — โครงตรงกับ StateCard ของ backend เป๊ะ */
export interface LiveState {
  identity?: LiveIdentity;
  location?: string;     // สถานที่ปัจจุบัน
  outfit?: string;       // ชุดที่ใส่ตอนนี้
  inventory?: string[];  // ของในครอบครอง
  conditions?: string[]; // บาดเจ็บ/สถานะ
  powers?: string[];     // พลัง/ความสามารถที่ใช้ได้ตอนนี้
  rel?: number;          // ความสัมพันธ์ปัจจุบัน (sync กับ rel หลัก — frontend ไม่เอามาทับ rel)
  facts?: string[];      // ข้อเท็จจริง canon เบ็ดเตล็ด
  rev?: number;          // เลขรุ่น (bump ทุกครั้งที่ backend apply delta)
}

/** สถานะว่าง — ส่งให้ backend ตอนยังไม่เคยมี delta */
export function emptyLiveState(): LiveState {
  return {};
}

/** LiveState → บรรทัดภาษาไทยอ่านง่าย สำหรับโชว์ read-only ในหน้าตั้งค่า (UI เท่านั้น — backend render prompt เอง) */
export function renderLiveStateLines(s?: LiveState): string[] {
  if (!s) return [];
  const L: string[] = [];
  const id = s.identity;
  if (id) {
    const parts: string[] = [];
    if (id.realName) parts.push(`ชื่อจริง=${id.realName}`);
    if (id.disguised) {
      parts.push('กำลังปลอมตัว/แปลงร่าง');
      if (id.alias) parts.push(`ใช้ชื่อ=${id.alias}`);
      if (id.form) parts.push(`ร่างที่ปรากฏ=${id.form}`);
      if (id.gender) parts.push(`เพศที่ปรากฏ=${id.gender}`);
    } else if (id.realName || id.form || id.gender) {
      parts.push('ร่างจริง (ไม่ได้ปลอมตัว)');
    }
    if (parts.length) L.push(`ตัวตน/ร่างตอนนี้: ${parts.join(' · ')}`);
  }
  if (s.location) L.push(`สถานที่: ${s.location}`);
  if (s.outfit) L.push(`ชุดที่ใส่: ${s.outfit}`);
  if (s.inventory?.length) L.push(`ของในครอบครอง: ${s.inventory.join(', ')}`);
  if (s.conditions?.length) L.push(`สภาพ/สถานะ: ${s.conditions.join(', ')}`);
  if (s.powers?.length) L.push(`พลังที่ใช้ได้: ${s.powers.join(', ')}`);
  if (s.facts?.length) L.push(...s.facts.map((f) => `• ${f}`));
  return L;
}
