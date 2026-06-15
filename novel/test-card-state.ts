// test-card-state.ts — เทสต์ card-v2 (V2/V3 + PNG round-trip) และ state-card (delta + contradiction)
// ไม่แตะ Mongo/server — ทดสอบ pure function ล้วน
// รัน: cd novel && bun test-card-state.ts
import { toCard, fromCard, embedCardInPng, extractCardFromPng, makeSolidPng, type NovelChar } from './card-v2';
import { renderStateCard, parseStateDelta, applyDelta, checkContradiction, processChatState, type StateCard } from './state-card';

let pass = 0, fail = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); }
}

// ===== 1) Character Card round-trip (our → V3 → our) =====
console.log('\n[1] Character Card V3 round-trip (lossless ผ่าน extensions.novelapp)');
const src: NovelChar = {
  name: 'ออเรเลีย',
  appearance: 'หญิงสาวผมเงินยาว ตาสีม่วง',
  outfit: 'ชุดคลุมไหมสีเข้ม',
  description: 'จอมเวทผู้สูญเสียพลังหลังศึกพันปี',
  mindset: 'ระแวงคน แต่ลึก ๆ โหยหาความอบอุ่น',
  behavior: 'พูดน้อย เย็นชา ป้องกันตัวสูง',
  pronounSelf: 'ข้า',
  pronounOther: 'เจ้า',
  speechTone: 'สุภาพโบราณ เย็น',
  voiceExamples: '"เจ้าต้องการสิ่งใดกันแน่..."\n"อย่าเข้ามาใกล้กว่านี้"',
  scenario: 'พบกันครั้งแรกในป่าลึกยามค่ำคืน',
  greeting: '*นางจ้องเจ้าด้วยสายตาระแวง* "ผู้ใด..."',
  likes: 'ความซื่อสัตย์\nชา',
  dislikes: 'การโกหก\nฝูงชน',
  guard: 75,
  power: 'พันธนาการวิญญาณ',
  powerStanding: true,
  visual: { gender: 'female', hair: 'silver long', eyes: 'purple' },
  lorebook: [{ keys: ['พลัง', 'เวท'], content: 'พลังของออเรเลียถูกผนึกไว้ที่จี้คริสตัล', enabled: true }],
};
const v3 = toCard(src, 'v3');
ok(v3.spec === 'chara_card_v3' && v3.spec_version === '3.0', 'spec = chara_card_v3 / 3.0');
ok(v3.data.name === src.name, 'data.name ตรง');
ok(typeof v3.data.description === 'string' && v3.data.description.includes('ผมเงิน'), 'description ประกอบจาก field ย่อย');
ok(!!v3.data.character_book && v3.data.character_book.entries.length === 1, 'character_book มี 1 entry');
ok(v3.data.first_mes.includes('ผู้ใด'), 'first_mes = greeting');

const back = fromCard(v3);
ok(back.guard === 75, `guard round-trip = ${back.guard}`);
ok(back.powerStanding === true, 'powerStanding round-trip');
ok(back.power === 'พันธนาการวิญญาณ', 'power round-trip');
ok(back.appearance === src.appearance, 'appearance round-trip (lossless)');
ok(back.pronounSelf === 'ข้า' && back.pronounOther === 'เจ้า', 'สรรพนาม round-trip');
ok((back.lorebook?.length ?? 0) === 1, 'lorebook round-trip');
ok((back.visual as any)?.hair === 'silver long', 'visual round-trip');

// ===== 2) Import external V2 card (ไม่มี extensions.novelapp) =====
console.log('\n[2] Import V2 card จากแอปอื่น (map field มาตรฐาน + แทน {{char}}/{{user}})');
const external = {
  spec: 'chara_card_v2', spec_version: '2.0',
  data: {
    name: 'Luna',
    description: '{{char}} is a shy librarian who secretly loves adventure novels.',
    personality: 'introverted, kind, curious',
    scenario: '{{user}} meets {{char}} at the old library.',
    first_mes: 'Oh! {{user}}, I didn\'t see you there...',
    mes_example: '<START>\n{{char}}: "P-please be quiet in the library."\n{{user}}: hi\n{{char}}: "...hello."',
    character_book: { entries: [{ keys: ['library'], content: 'The library is {{char}}\'s sanctuary.', enabled: true }] },
    tags: ['oc', 'fantasy'],
  },
};
const imp = fromCard(external);
ok(imp.name === 'Luna', 'name = Luna');
ok((imp.description ?? '').includes('Luna') && !(imp.description ?? '').includes('{{char}}'), '{{char}} ถูกแทนใน description');
ok(imp.mindset === 'introverted, kind, curious', 'personality → mindset');
ok((imp.greeting ?? '').includes('คุณ') && !(imp.greeting ?? '').includes('{{user}}'), '{{user}} ถูกแทนใน greeting');
ok((imp.voiceExamples ?? '').includes('library') && !(imp.voiceExamples ?? '').includes('{{char}}:'), 'mes_example → voiceExamples (ตัด prefix)');
ok((imp.lorebook?.[0]?.content ?? '').includes('Luna'), 'lorebook content แทน macro');
ok((imp.tags ?? []).includes('fantasy'), 'tags ติดมา');

// ===== 3) PNG embed/extract round-trip =====
console.log('\n[3] PNG embed → extract round-trip');
const basePng = makeSolidPng(64, 64, [50, 40, 60]);
ok(basePng[0] === 137 && basePng[1] === 80, 'makeSolidPng ออก PNG signature ถูก');
const embedded = embedCardInPng(basePng, src);
ok(embedded.length > basePng.length, 'PNG หลังฝัง card ใหญ่ขึ้น');
const extracted = extractCardFromPng(embedded);
ok(!!extracted && extracted.spec === 'chara_card_v3', 'extract ได้ ccv3');
ok(extracted.data.name === 'ออเรเลีย', 'ชื่อใน PNG ตรง (UTF-8 ผ่าน base64)');
const fromPng = fromCard(extracted);
ok(fromPng.guard === 75 && fromPng.power === 'พันธนาการวิญญาณ', 'field เต็ม round-trip ผ่าน PNG');
// embed ซ้ำไม่ทำ chunk บวม (ลบ tEXt เก่าก่อนเขียนใหม่)
const re = embedCardInPng(embedded, src);
ok(Math.abs(re.length - embedded.length) < 8, 'embed ซ้ำไม่ทำ chunk ซ้อน');

// ===== 4) State delta parse + apply =====
console.log('\n[4] parse [[state:...]] delta + apply');
const prev: StateCard = {
  identity: { realName: 'ออเรเลีย', form: 'หญิงสาวผมเงิน', disguised: false, gender: 'หญิง' },
  location: 'ป่าลึก', outfit: 'ชุดคลุมไหม',
  inventory: ['จี้คริสตัล', 'มีดสั้น'], conditions: ['เลือดกำเดา'], rel: 40,
};
const reply = `*นางสวมหมวกคลุมศีรษะก่อนก้าวเข้าเมือง* "อย่าเรียกชื่อจริงข้าในที่นี่"
[[state: location=ตลาดกลางเมือง; disguised=true; alias=หลินเอ๋อร์; form=หญิงชาวบ้านธรรมดา; +inv=เหรียญทอง 3 เหรียญ; -inv=มีดสั้น; -cond=เลือดกำเดา]]`;
const { delta, cleaned } = parseStateDelta(reply);
ok(!!delta, 'พาร์ส delta ได้');
ok(!cleaned.includes('[[state'), 'แท็กถูก strip ออกจากคำตอบ');
ok(delta!.set.location === 'ตลาดกลางเมือง', 'set location');
ok(delta!.set.identity?.disguised === true && delta!.set.identity?.alias === 'หลินเอ๋อร์', 'set identity (disguised/alias)');
ok(delta!.add.inventory.includes('เหรียญทอง 3 เหรียญ'), '+inv parse');
ok(delta!.remove.inventory.includes('มีดสั้น'), '-inv parse');

const next = applyDelta(prev, delta!);
ok(next.location === 'ตลาดกลางเมือง', 'apply: location เปลี่ยน');
ok(next.identity?.disguised === true, 'apply: disguised=true');
ok(next.inventory!.includes('เหรียญทอง 3 เหรียญ') && !next.inventory!.includes('มีดสั้น'), 'apply: inv เพิ่ม/ลบถูก');
ok(!next.conditions || !next.conditions.includes('เลือดกำเดา'), 'apply: cond เลือดกำเดาหาย');
ok(next.rev === 1, `apply: bump rev = ${next.rev}`);

// ===== 5) render state card =====
console.log('\n[5] renderStateCard → ข้อความ');
const rendered = renderStateCard(next);
ok(rendered.includes('กำลังปลอมตัว'), 'render: บอกสถานะปลอมตัว');
ok(rendered.includes('หลินเอ๋อร์'), 'render: มีชื่อปลอม');
ok(rendered.includes('ตลาดกลางเมือง'), 'render: มีสถานที่');
ok(renderStateCard(null) === '', 'render: null → ""');

// ===== 6) contradiction detection (deterministic) =====
console.log('\n[6] checkContradiction — เช็คในโค้ด ไม่เรียก LLM');
// 6a: ร่างจริงในที่สาธารณะ
const w1 = checkContradiction(
  { identity: { disguised: true }, location: 'ป่า' },
  { identity: { disguised: false }, location: 'ตลาดกลางเมือง' },
);
ok(w1.some((w) => w.includes('ร่างจริง') && w.includes('สาธารณะ')), '6a: จับร่างจริงในที่สาธารณะ');

// 6b: ลบของที่ไม่มี
const r6b = processChatState('โอเค [[state: -inv=ดาบวิเศษ]]', { inventory: ['โล่'] });
ok(r6b.warnings.some((w) => w.includes('ดาบวิเศษ')), '6b: จับการลบของที่ไม่มี');

// 6c: rel floor (เคย 90 ห้ามต่ำกว่า)
const w6c = checkContradiction({ rel: 95 }, { rel: 70 });
ok(w6c.some((w) => w.includes('90')), '6c: จับ rel หลุด floor 90');

// 6d: ชื่อจริงเปลี่ยน
const w6d = checkContradiction({ identity: { realName: 'ออเรเลีย' } }, { identity: { realName: 'มายา' } });
ok(w6d.some((w) => w.includes('ชื่อจริง')), '6d: จับชื่อจริงเปลี่ยน');

// 6e: เคสปกติไม่ควรมี warning
const w6e = checkContradiction(prev, next, delta!);
ok(w6e.length === 0, `6e: เคสปลอมตัวถูกต้อง ไม่มี warning (${w6e.length})`);

// 6f: none / ไม่มีการเปลี่ยน
const r6f = processChatState('เนื้อเรื่องล้วน ๆ [[state: none]]', prev);
ok(r6f.delta !== null && r6f.warnings.length === 0, '6f: [[state: none]] = delta ว่าง ไม่มี warning');

// 6g: "นอกเมือง/ชายป่า" ไม่ควรนับเป็นที่สาธารณะ (กัน false positive จาก substring "เมือง")
const w6g = checkContradiction(
  { identity: { disguised: false }, location: 'ชายป่า' },
  { identity: { disguised: false }, location: 'ชายป่านอกเมืองหลวง' },
);
ok(w6g.length === 0, `6g: "ชายป่านอกเมือง" ไม่เด้ง public-warning (${w6g.length})`);

// 6h: ค่าขยะ N/A ต้องไม่ทับค่าจริง (alias=N/A ตอนไม่ปลอมตัว) แต่ key อื่นในแท็กเดียวกันยังทำงาน
const { delta: d6h } = parseStateDelta('โอเค [[state: alias=N/A; location=ในเมืองหลวง; form=-]]');
ok(d6h?.set.identity?.alias === undefined, '6h: alias=N/A ถูกตัดทิ้ง (ไม่ทับ)');
ok(d6h?.set.identity?.form === undefined, '6h: form=- ถูกตัดทิ้ง');
ok(d6h?.set.location === 'ในเมืองหลวง', '6h: location ในแท็กเดียวกันยังถูก set');

// 6i: -inv ที่จริงคือ "ถอดเสื้อผ้า" (อยู่ใน outfit ไม่ใช่ inventory) ต้องไม่เด้ง contradiction
const r6i = processChatState('*ถอดเบลเซอร์ออก* [[state: outfit=เสื้อกล้าม; -inv=เบลเซอร์โอเวอร์ไซส์ดำ]]', { outfit: 'เบลเซอร์โอเวอร์ไซส์ดำ + เสื้อกล้าม', inventory: ['มีดสั้น'] });
ok(!r6i.warnings.some((w) => w.includes('เบลเซอร์')), '6i: ถอดเสื้อ (-inv ที่อยู่ใน outfit) ไม่เด้ง warning');

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
