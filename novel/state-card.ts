// state-card.ts — "บัตรสถานะ" แบบ structured (แทน prose) สำหรับแชท RP
// แนวคิดเหมือน truth-files ของ InkOS แต่ทำให้ "ตรวจ contradiction ได้ในโค้ด ไม่ต้องเรียก LLM เพิ่ม"
//
// flow ต่อเทิร์น (ไม่มี LLM call เพิ่ม — delta ขี่มากับคำตอบเดิม):
//   1. server render StateCard → ข้อความ แทรกท้าย system prompt (กัน drift)
//   2. โมเดลตอบ + ปิดท้ายด้วยแท็ก [[state: ...]] ระบุ "เฉพาะสิ่งที่เปลี่ยน"
//   3. server พาร์ส delta → strip แท็กออกจากคำตอบ → apply → bump rev
//   4. checkContradiction(prev, next) แบบ deterministic → คืน warnings ให้ client เตือน/รีเจน

// ===== ชนิดข้อมูล =====
export interface StateIdentity {
  realName?: string;   // ชื่อจริง (ไม่ควรเปลี่ยน)
  form?: string;       // ร่าง/รูปลักษณ์ที่ปรากฏตอนนี้
  alias?: string;      // ชื่อที่ใช้ตอนนี้ (อาจเป็นชื่อปลอม)
  gender?: string;     // เพศที่ปรากฏตอนนี้
  disguised?: boolean; // กำลังปลอมตัว/แปลงร่างอยู่ไหม
}

export interface StateCard {
  identity?: StateIdentity;
  time?: string;         // ช่วงเวลา/วันปัจจุบัน (เช่น "เช้าตรู่", "บ่าย 3 โมง", "ดึกสงัด วันที่ 2") — เลื่อนตามเหตุการณ์ (นอน→เช้า, เวลาผ่านไป)
  location?: string;     // สถานที่ปัจจุบัน
  outfit?: string;       // ชุดที่ใส่ตอนนี้
  inventory?: string[];  // ของในครอบครอง
  conditions?: string[]; // บาดเจ็บ/สถานะ (เช่น "แขนซ้ายหัก", "พิษกำลังออกฤทธิ์")
  powers?: string[];     // พลัง/ความสามารถที่ใช้ได้ตอนนี้
  rel?: number;          // ความสัมพันธ์ปัจจุบัน (sync กับ rel หลัก)
  facts?: string[];      // ข้อเท็จจริง canon เบ็ดเตล็ด
  rev?: number;          // เลขรุ่น (bump ทุกครั้งที่ apply delta)
}

export interface StateDelta {
  set: Partial<Pick<StateCard, 'time' | 'location' | 'outfit' | 'rel'>> & { identity?: Partial<StateIdentity> };
  add: { inventory: string[]; conditions: string[]; powers: string[]; facts: string[] };
  remove: { inventory: string[]; conditions: string[]; powers: string[]; facts: string[] };
  raw: string;           // เนื้อในแท็กดิบ (ดีบั๊ก)
}

// ===== render: StateCard → ข้อความ (แทรกท้าย prompt) =====
/** คืน "" ถ้า card ว่าง — เพื่อให้ assembleChatPrompt ข้าม section ไปเลย */
export function renderStateCard(s?: StateCard | null): string {
  if (!s) return '';
  const L: string[] = [];
  const id = s.identity;
  if (id) {
    const parts: string[] = [];
    if (id.realName) parts.push(`ชื่อจริง=${id.realName}`);
    if (id.disguised) {
      parts.push('สถานะ=กำลังปลอมตัว/แปลงร่าง');
      if (id.alias) parts.push(`ใช้ชื่อ=${id.alias}`);
      if (id.form) parts.push(`ร่างที่ปรากฏ=${id.form}`);
      if (id.gender) parts.push(`เพศที่ปรากฏ=${id.gender}`);
    } else {
      parts.push('สถานะ=ร่างจริง (ไม่ได้ปลอมตัว)');
    }
    if (parts.length) L.push(`- ตัวตน/ร่างตอนนี้: ${parts.join(' · ')}`);
  }
  if (s.time) L.push(`- เวลาปัจจุบัน: ${s.time}`);
  if (s.location) L.push(`- สถานที่ปัจจุบัน: ${s.location}`);
  if (s.outfit) L.push(`- ชุดที่ใส่อยู่: ${s.outfit}`);
  if (s.inventory?.length) L.push(`- ของในครอบครอง: ${s.inventory.join(', ')}`);
  if (s.conditions?.length) L.push(`- สภาพร่างกาย/สถานะ: ${s.conditions.join(', ')}`);
  if (s.powers?.length) L.push(`- พลัง/ความสามารถที่ใช้ได้: ${s.powers.join(', ')}`);
  if (s.facts?.length) L.push(...s.facts.map((f) => `- ${f}`));
  return L.join('\n');
}

// ===== parse: ดึงแท็ก [[state: ...]] จากคำตอบโมเดล =====
const STATE_TAG_RE = /\[\[\s*state\s*:\s*([\s\S]*?)\]\]/i;

function emptyDelta(raw = ''): StateDelta {
  return {
    set: {},
    add: { inventory: [], conditions: [], powers: [], facts: [] },
    remove: { inventory: [], conditions: [], powers: [], facts: [] },
    raw,
  };
}

const ADD_KEYS: Record<string, keyof StateDelta['add']> = { inv: 'inventory', cond: 'conditions', power: 'powers', fact: 'facts' };

/** ค่า "ขยะ" ที่โมเดลใส่แทน "ไม่มีข้อมูล" — อย่านำไปทับค่าจริง (เช่น alias=N/A ตอนไม่ได้ปลอมตัว) */
function isJunk(v: string): boolean {
  return /^(n\/?a|none|null|nil|undefined|-+|—+|ไม่มี|ไม่ระบุ|ไม่ทราบ|ว่าง|x)$/i.test(v.trim());
}

/** พาร์สเนื้อในแท็ก เป็น token คั่นด้วย ';' แต่ละ token = key=value (key อาจมี prefix +/-) */
export function parseStateDelta(text: string): { delta: StateDelta | null; cleaned: string } {
  const m = text.match(STATE_TAG_RE);
  if (!m) return { delta: null, cleaned: text };
  const cleaned = text.replace(STATE_TAG_RE, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  const inner = m[1].trim();
  const delta = emptyDelta(inner);
  if (!inner || /^(none|ไม่มี|-)$/i.test(inner)) return { delta, cleaned };

  for (const tokenRaw of inner.split(';')) {
    const token = tokenRaw.trim();
    if (!token) continue;
    const eq = token.indexOf('=');
    if (eq < 0) continue;
    let key = token.slice(0, eq).trim().toLowerCase();
    const val = token.slice(eq + 1).trim();
    if (!val) continue;

    // prefix +/- สำหรับ list
    const sign = key[0] === '+' ? 'add' : key[0] === '-' ? 'remove' : '';
    if (sign) {
      const k = ADD_KEYS[key.slice(1)];
      if (k) delta[sign][k].push(val);
      continue;
    }

    // โมเดล (โดยเฉพาะ local) ชอบใส่ค่าขยะแทน "ไม่มี" — ตัดทิ้ง ไม่ให้ไปทับค่าจริง
    if (isJunk(val) && key !== 'disguised') continue;
    switch (key) {
      case 'time': case 'เวลา': delta.set.time = val; break;
      case 'location': case 'loc': delta.set.location = val; break;
      case 'outfit': delta.set.outfit = val; break;
      case 'rel': { const n = Number(val); if (!Number.isNaN(n)) delta.set.rel = n; break; }
      case 'realname': (delta.set.identity ??= {}).realName = val; break;
      case 'form': (delta.set.identity ??= {}).form = val; break;
      case 'alias': (delta.set.identity ??= {}).alias = val; break;
      case 'gender': (delta.set.identity ??= {}).gender = val; break;
      case 'disguised': (delta.set.identity ??= {}).disguised = /^(true|1|yes|ใช่)$/i.test(val); break;
      default: break; // key แปลก ๆ ข้าม
    }
  }
  return { delta, cleaned };
}

// ===== apply: StateCard + delta → StateCard ใหม่ (bump rev) =====
function mergeList(prev: string[] | undefined, add: string[], remove: string[]): string[] {
  const out = [...(prev ?? [])];
  for (const a of add) if (!out.some((x) => x.toLowerCase() === a.toLowerCase())) out.push(a);
  // remove: ตัดตัวที่ "มีคำของ remove เป็น substring" (เผื่อโมเดลเขียนไม่ตรงเป๊ะ)
  return out.filter((x) => !remove.some((r) => x.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(x.toLowerCase())));
}

export function applyDelta(prev: StateCard | null | undefined, delta: StateDelta): StateCard {
  const base: StateCard = prev ? structuredClone(prev) : {};
  if (delta.set.time !== undefined) base.time = delta.set.time;
  if (delta.set.location !== undefined) base.location = delta.set.location;
  if (delta.set.outfit !== undefined) base.outfit = delta.set.outfit;
  if (delta.set.rel !== undefined) base.rel = Math.max(-100, Math.min(100, delta.set.rel));
  if (delta.set.identity) base.identity = { ...(base.identity ?? {}), ...delta.set.identity };

  base.inventory = mergeList(base.inventory, delta.add.inventory, delta.remove.inventory);
  base.conditions = mergeList(base.conditions, delta.add.conditions, delta.remove.conditions);
  base.powers = mergeList(base.powers, delta.add.powers, delta.remove.powers);
  base.facts = mergeList(base.facts, delta.add.facts, delta.remove.facts);

  // เก็บเฉพาะ list ที่ไม่ว่าง (ลด noise)
  for (const k of ['inventory', 'conditions', 'powers', 'facts'] as const) {
    if (base[k] && base[k]!.length === 0) delete base[k];
  }
  base.rev = (prev?.rev ?? 0) + 1;
  return base;
}

// ===== checkContradiction: ตรวจ "ในโค้ด" ไม่เรียก LLM =====
// คำที่บ่งว่าเป็น "ที่สาธารณะ/มีคนเห็น" (กฎปลอมตัว: ห้ามปรากฏร่างจริงในที่สาธารณะ)
const PUBLIC_KW = ['เมือง', 'ตลาด', 'หมู่บ้าน', 'ชุมชน', 'จัตุรัส', 'ย่าน', 'โรงเตี๊ยม', 'โรงแรม', 'งานเลี้ยง', 'ราชสำนัก', 'วัง', 'ถนน', 'ท่าเรือ', 'สำนัก', 'โรงเรียน', 'ห้องเรียน', 'public', 'market', 'town', 'street', 'tavern', 'court', 'palace'];
// สถานที่ "ลับตา/นอกชุมชน" — override กัน false positive จาก substring (เช่น "ชายป่านอกเมือง" มีคำว่า "เมือง")
const PRIVATE_KW = ['นอกเมือง', 'นอกเขตเมือง', 'นอกชุมชน', 'นอกหมู่บ้าน', 'ชายป่า', 'กลางป่า', 'ในป่า', 'ป่าลึก', 'ป่าทึบ', 'ถ้ำ', 'บ้านร้าง', 'ห้องนอน', 'ห้องส่วนตัว', 'ห้องลับ', 'ห้องพัก', 'ที่ลับตา', 'ที่เปลี่ยว', 'forest', 'cave', 'bedroom', 'private'];

function isPublic(loc?: string): boolean {
  if (!loc) return false;
  const low = loc.toLowerCase();
  if (PRIVATE_KW.some((k) => low.includes(k.toLowerCase()))) return false; // ลับตา → ไม่นับสาธารณะ แม้มี substring เมือง
  return PUBLIC_KW.some((k) => low.includes(k.toLowerCase()));
}

/**
 * คืน array คำเตือน (ว่าง = ผ่าน) — ตรวจความขัดแย้งเชิงตรรกะ deterministic
 * @param delta delta ที่เพิ่ง apply (เพื่อดูว่า "พยายามลบของที่ไม่มี" ไหม)
 */
export function checkContradiction(prev: StateCard | null | undefined, next: StateCard, delta?: StateDelta): string[] {
  const warn: string[] = [];
  const p = prev ?? {};

  // 1) ชื่อจริงห้ามเปลี่ยน
  if (p.identity?.realName && next.identity?.realName && p.identity.realName !== next.identity.realName) {
    warn.push(`ชื่อจริงเปลี่ยนจาก "${p.identity.realName}" → "${next.identity.realName}" (ชื่อจริงไม่ควรเปลี่ยน)`);
  }

  // 2) กฎปลอมตัว: อยู่ที่สาธารณะแต่เป็นร่างจริง
  // ⚠️ ยิงเฉพาะตัวละครที่ "มีกลไกปลอมตัวจริง" = มี alias (ชื่อปลอม) หรือ form ที่ "ไม่ใช่ร่างจริง"
  // กันเคสโมเดลเผลอ set form=ร่างจริง ให้ตัวละครทั่วไป (ทอมบอย/มนุษย์ธรรมดา) แล้วโดนเตือนผิด
  const TRUE_FORM_RE = /ร่างจริง|ตัวจริง|ร่างปกติ|true ?form|real ?form|original/i;
  const fakeForm = (v?: string) => !!v && !TRUE_FORM_RE.test(v);
  const hasDisguiseMechanic = !!(next.identity?.alias || p.identity?.alias || fakeForm(next.identity?.form) || fakeForm(p.identity?.form));
  if (hasDisguiseMechanic && next.identity?.disguised === false && isPublic(next.location)) {
    warn.push(`ปรากฏ "ร่างจริง" ในที่สาธารณะ (${next.location}) — กฎปลอมตัวกำหนดให้ต้องแปลงร่าง/ปลอมตัวก่อนเข้าที่สาธารณะ`);
  }

  // 3) เพศที่ปรากฏเปลี่ยน แต่ไม่ได้ปลอมตัว (เฉพาะตัวที่มีกลไกปลอมตัว — กันทอมบอย/คนข้ามเพศที่ gender ปรากฏนิ่งอยู่แล้วโดนเตือนผิด)
  if (hasDisguiseMechanic && p.identity?.gender && next.identity?.gender && p.identity.gender !== next.identity.gender && !next.identity.disguised) {
    warn.push(`เพศที่ปรากฏเปลี่ยน "${p.identity.gender}" → "${next.identity.gender}" โดยไม่ได้อยู่ในสถานะปลอมตัว/แปลงร่าง`);
  }

  // 4) rel floor: เคยถึง 90 (ผูกพันสุดหัวใจ) ห้ามตกต่ำกว่า 90
  if (typeof p.rel === 'number' && p.rel >= 90 && typeof next.rel === 'number' && next.rel < 90) {
    warn.push(`ความสัมพันธ์ตกจาก ${p.rel} → ${next.rel} (ภาวะผูกพันสุดหัวใจกำหนดไม่ให้ต่ำกว่า 90)`);
  }

  // 5) พยายามลบของ/สถานะ/พลังที่ไม่มีอยู่จริง
  if (delta) {
    const checkRemove = (label: string, removed: string[], list: (string | undefined)[]) => {
      for (const r of removed) {
        const has = list.filter(Boolean).some((x) => x!.toLowerCase().includes(r.toLowerCase()) || r.toLowerCase().includes(x!.toLowerCase()));
        if (!has) warn.push(`${label} "${r}" ที่ไม่มีอยู่ก่อนหน้า`);
      }
    };
    // -inv: นับ outfit เป็นแหล่งด้วย — โมเดลชอบใช้ -inv ตอน "ถอดเสื้อผ้า" (เสื้ออยู่ใน outfit ไม่ใช่ inventory) จึงไม่ใช่ของหาย
    checkRemove('ลบ/ใช้ของในครอบครอง', delta.remove.inventory, [...(p.inventory ?? []), p.outfit]);
    checkRemove('ลบสถานะ', delta.remove.conditions, p.conditions ?? []);
    checkRemove('ลบพลัง', delta.remove.powers, p.powers ?? []);
  }

  return warn;
}

/** สะดวก: รับคำตอบดิบ + state เดิม → ทุกอย่างในก้าวเดียว */
export function processChatState(
  rawReply: string,
  prev: StateCard | null | undefined,
): { cleaned: string; next: StateCard | null; delta: StateDelta | null; warnings: string[] } {
  const { delta, cleaned } = parseStateDelta(rawReply);
  if (!delta) return { cleaned, next: prev ?? null, delta: null, warnings: [] };
  const next = applyDelta(prev, delta);
  const warnings = checkContradiction(prev, next, delta);
  return { cleaned, next, delta, warnings };
}
