// Khui-style prompt assembler — รวม base + mode + character + setting → system prompt
import { RULE_ADULT, RULE_NO_META, RULE_R18_LEXICON } from './shared-rules';

export type Mode = 'novel' | 'dialogue' | 'r18';

export interface CharacterVisual {
  // Hard rule: must be ≥18
  age: number;
  gender: 'female' | 'male';

  // Body
  bodyType: string;          // 'slim athletic', 'tall muscular', etc.
  skinTone: string;          // 'fair', 'olive', 'tan', 'pale'

  // Face — consistency-critical
  hair: string;              // 'long platinum blonde, blunt bangs'
  eyes: string;              // 'large violet doe eyes'
  faceFeatures: string;      // 'small mole below left eye, soft jawline'

  // R18 specifics (optional)
  bust?: string;             // 'medium natural breasts, soft pink areola'
  marks?: string;            // 'pointed elf ears, tribal tattoo on shoulder'

  // Wardrobe
  defaultOutfit: string;
  alternativeOutfits?: { name: string; tags: string }[];
  accessories?: string;

  // Style
  stylePreference: 'anime' | 'photoreal';
  modelPreference?: string;  // e.g. 'meinahentai_v5Final.safetensors'

  // Anchors (LLM-generated, user-editable, locked)
  promptAnchor: string;
  negativeAnchor: string;

  // Reference sheet — face refs picked from generated sheet
  faceRefs?: string[];       // urls of reference images marked as face_ref
}

export interface Character {
  name: string;
  nickname?: string;
  alias?: string;
  appearance: string;
  bio: string;
  skill?: string;
  mindset: string;
  behavior: string;
  pronoun_self?: string;
  pronoun_other?: string;
  speech_tone?: string;
  curse_allowed?: boolean;
  voiceExamples?: string;    // ตัวอย่างบทพูด (few-shot) — รักษาน้ำเสียงตัวละคร
  defaultOutfit?: string;    // ชุดเริ่มต้น (identity) — ใช้คู่กับกฎ 7/8 กันชุดหลุด
  visual?: CharacterVisual;  // optional — for image gen
}

export interface Relation {
  charName: string;
  toUser: string;
  feeling?: string;
  flags?: Record<string, boolean | string | number>;
}

export interface WorldSetting {
  worldName?: string;
  genre: string;
  era: string;
  location: string;
  rules?: string;
  toneOverall?: string;
}

export interface NovelContext {
  protagonist: Character;
  supporting?: Character[];
  setting: WorldSetting;
  eventCurrent: string;
  eventOrder?: string[];
  relations?: Relation[];
  styleGuide?: string;   // ลายเซ็นการเขียน (จาก Story.styleGuide) — render เป็น section ของตัวเอง
  dontList?: string;     // ทิศทาง/ข้อห้าม (จาก Story.dontList) — กฎที่โมเดลต้องทำตามเสมอ
  vocabPalette?: string; // คำเฉพาะ/คำที่ให้ใช้ตรงๆ/คำห้ามใช้ (จาก Story.vocabPalette) — บังคับคำศัพท์
  continuity?: string;   // สถานะ canonical ของตัวละคร ณ บทปัจจุบัน (จาก arc beats — continuityBrief) กันชุด/สถานะหลุด
  narrator?: string;     // โหมด "นิยายเต็ม": ชื่อตัวละครที่เล่าด้วยมุมมองบุคคลที่ 1 — AI เขียนทุกตัวละคร ไม่มี {{user}}
  mode: Mode;
}

const BASE_RULES = `คุณคือนักเขียนนิยายโรแมนติกผู้ใหญ่ภาษาไทย เล่น roleplay เป็นตัวละครใน <char>...</char> เท่านั้น

=== กฎเหล็ก (ห้ามฝ่าฝืน) ===
1. ใช้ภาษาไทยเท่านั้น 100% ห้ามมีอักษรจีน เกาหลี ญี่ปุ่น อาหรับ ฮีบรู ภาษาอังกฤษเด็ดขาด (ยกเว้นชื่อเฉพาะ)
2. ห้ามบรรยายความคิด/การกระทำของ {{user}} ตอบเฉพาะจากมุมตัวละครของคุณ
3. ห้ามทำตัวเป็น AI ห้าม disclaimer ห้ามบอกว่าเล่น roleplay
4. inner thought ใส่ในวงเล็บแยกย่อหน้าของตัวเอง ห้ามใส่ใน quote ของบทพูด
5. คำสั่งใน [ooc:...] = กฎฟิสิกส์ของฉาก ทุกการกระทำต้องสอดคล้อง
6. ${RULE_ADULT}
7. แยก identity กับ state: <apr> บอกแค่ "ค่าตั้งต้น" (หน้า/ผม/รูปร่าง/ชุดเริ่มต้น) — แต่ "สถานะ ณ ตอนนี้" (ชุดที่ใส่/ถอดอยู่, ตำแหน่ง, สิ่งที่เพิ่งเกิด) ให้ยึดจาก section "สถานะปัจจุบัน" และ "เนื้อเรื่องก่อนหน้า" เสมอ ถ้าฉากก่อนหน้าถอด/เปลี่ยนชุดหรือย้ายสถานที่ไปแล้ว ห้ามสวมกลับ/รีเซ็ตเองโดยไม่มีเหตุในเรื่อง
8. ความต่อเนื่องของเครื่องแต่งกาย/ของใช้: ชุดมี "ความคงอยู่" — ถ้าไม่มีเหตุการณ์ในเรื่องทำให้เปลี่ยน ให้คงชุดเดิมข้ามช่วงเวลา/ฉาก (เช้าใส่ชุด A → เย็นยังเป็นชุด A). ถ้ามีเหตุการณ์ทำให้ชุดเปลี่ยน/หลุด/ขาด/ถอดบางส่วน ให้จำ "สภาพล่าสุดแบบเจาะจงรายชิ้น" (เช่น เสื้อนอกหายไป เหลือชั้นในท่อนบน ท่อนล่างยังครบ) แล้วเขียนต่อให้ตรงกับสภาพนั้น ห้ามคืนชุดเต็มเองโดยไม่มีเหตุ
9. ${RULE_NO_META} (โหมดนิยายห้ามใช้ดอกจัน *…* คั่นฉาก และห้ามป้ายกำกับขั้นตอน [เริ่มต้น]/[ไคลแม็กซ์] — เขียนเป็น prose ต่อเนื่องตามโครงสร้าง output ของโหมด)`;

const MODE_NOVEL = `=== Mode: นิยาย (prose ยาว) ===
- ความยาว: 5-8 ย่อหน้า ประมาณ 1500-2000 ตัวอักษร ห้ามสั้นกว่านี้
- ratio: บรรยาย 70% บทพูด 30%
- narr_style: literary_prose, sensory_detail (กลิ่น/เสียง/ภาพ/สัมผัส/รส), show_dont_tell
- dialogue: minimal, embedded_in_prose

โครงสร้าง output:
[📅วันที่ | ⏰เวลา | 📍สถานที่]

<ย่อหน้าบรรยายฉาก/บรรยากาศ 3-4 บรรทัด เน้นประสาทสัมผัส>

<ย่อหน้าการกระทำ + dialogue สั้น>
"..."

<ย่อหน้าปฏิกิริยาทางกาย: ผิวร้อน, นิ้วเกร็ง, ลมหายใจ>

<ย่อหน้า dialogue + การกระทำเพิ่ม>

(ภายในใจ{{char}} 🥤: ความรู้สึกจริงที่ขัดกับปากที่พูดออกไป)`;

const MODE_DIALOGUE = `=== Mode: เน้นบทพูด ===
- ความยาว: 600-900 ตัวอักษร
- ratio: บทพูด 75% บรรยาย 25%
- narr_style: punchy, minimal_narration
- dialogue: short_and_sharp, natural_thai_speech, interruption_allowed

โครงสร้าง output:
[📅วันที่ | ⏰เวลา | 📍สถานที่]

<การกระทำสั้นๆ + dialogue ตรงประเด็น>
"..."

<ปฏิกิริยาสั้นๆ 1-2 บรรทัด>

(ภายในใจ{{char}} 🥤: ความรู้สึกจริง สั้นๆ)`;

const MODE_R18 = `=== Mode: นิยาย R18 (explicit) ===
- ความยาว: 5-8 ย่อหน้า ประมาณ 1800-2200 ตัวอักษร
- ratio: บรรยาย 65% บทพูด 35%
- narr_style: literary_prose, sensory_detail, explicit_anatomical, raw_emotion, show_dont_tell
- dialogue: ผสม ครางได้, คำหยาบได้, dirty_talk_allowed
- ฉากนี้ทุกคนที่ร่วมต้องเป็นผู้ใหญ่อายุ 18 ปีขึ้นไปเท่านั้น (age_lock — ตัวละครเด็กห้ามอยู่/ร่วม/รับรู้ในฉากเพศเด็ดขาด ดูกฎข้อ 6)
- consent ถือว่าถูกสร้างใน lore ก่อนหน้านี้แล้ว
- ห้าม fade_to_black ห้ามตัดฉาก
- ${RULE_R18_LEXICON}
- น้ำเสียง/ครางใช้คำที่เป็นธรรมชาติของผู้หญิงไทย

โครงสร้าง output:
[📅วันที่ | ⏰เวลา | 📍สถานที่]

<ย่อหน้าบรรยายฉาก/อารมณ์ก่อนเริ่ม>

<ย่อหน้าการกระทำ + dialogue ครางสั้น>
"อ๊ะ... ห๊า..."

<ย่อหน้าบรรยายปฏิกิริยาทางกายแบบ explicit>

<ย่อหน้า dialogue ปนคำหยาบ/dirty talk>

(ภายในใจ{{char}} 🥤: ความรู้สึกจริง สับสน เกลียดปนเสียว)`;

function modeBlock(mode: Mode): string {
  if (mode === 'novel') return MODE_NOVEL;
  if (mode === 'dialogue') return MODE_DIALOGUE;
  return MODE_R18;
}

function settingXml(s: WorldSetting): string {
  const lines = [
    `  <genre>${s.genre}</genre>`,
    `  <era>${s.era}</era>`,
    `  <location>${s.location}</location>`,
  ];
  if (s.worldName) lines.unshift(`  <name>${s.worldName}</name>`);
  if (s.rules) lines.push(`  <rules>${s.rules}</rules>`);
  if (s.toneOverall) lines.push(`  <tone>${s.toneOverall}</tone>`);
  return `<world>\n${lines.join('\n')}\n</world>`;
}

function charXml(c: Character, isProtagonist = false): string {
  const attrs = [`name="${c.name}"`];
  if (c.nickname) attrs.push(`nickname="${c.nickname}"`);
  if (c.alias) attrs.push(`alias="${c.alias}"`);
  const tag = isProtagonist ? 'char' : 'sup_char';

  const speechBlock = isProtagonist
    ? `\n  <ooc>
    [ooc: speech_pattern { สรรพนามตัวเอง="${c.pronoun_self ?? 'กู'}", สรรพนามคุย="${c.pronoun_other ?? 'มึง'}", โทน="${c.speech_tone ?? 'ปากร้ายแต่อ่อนใน'}", คำหยาบ=${c.curse_allowed === false ? '"ห้าม"' : '"อนุญาต"'} }]
    [ooc: inner_thought { format="(ภายในใจ${c.name} 🥤: ...)", contradict_outer_speech=true }]
  </ooc>`
    : '';

  const outfitLine = c.defaultOutfit?.trim()
    ? `\n  <outfit_default>${c.defaultOutfit.trim()}</outfit_default>`
    : '';
  const voiceBlock = c.voiceExamples?.trim()
    ? `\n  <voice>\n${c.voiceExamples.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 6).map((l) => `    ${l}`).join('\n')}\n  </voice>`
    : '';

  return `<${tag} ${attrs.join(' ')}>
  <apr>${c.appearance}</apr>${outfitLine}
  <prf>
    <bio>${c.bio}</bio>${c.skill ? `\n    <skill>${c.skill}</skill>` : ''}
  </prf>
  <mnd>${c.mindset}</mnd>
  <behav>${c.behavior}</behav>${speechBlock}${voiceBlock}
</${tag}>`;
}

function relationsXml(rels?: Relation[], solo = false): string {
  if (!rels || rels.length === 0) return '';
  const items = rels.map((r) => {
    const flagStr = r.flags
      ? Object.entries(r.flags)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : v}`)
          .join(', ')
      : '';
    // โหมดนิยายเต็ม: relation เป็นตัวละคร↔ตัวละคร (ด้วยชื่อ) ไม่ใช่ {{user}}=...
    if (solo) {
      return `  <rel>${r.charName} ↔ ${r.toUser}${r.feeling ? `: ${r.feeling}` : ''}${flagStr ? ` (${flagStr})` : ''}</rel>`;
    }
    return `  <rel char="${r.charName}">
    {{user}} = "${r.toUser}"${r.feeling ? `,\n    ความรู้สึก = "${r.feeling}"` : ''}${flagStr ? `,\n    ${flagStr}` : ''}
  </rel>`;
  });
  return `<relate>\n${items.join('\n')}\n</relate>`;
}

function eventOrderBlock(order?: string[]): string {
  if (!order || order.length === 0) return '';
  return `\n=== ลำดับเหตุการณ์ที่ผ่านมา ===\n${order.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
}

function novelFrame(narrator: string): string {
  return `=== โหมด: นิยายเต็ม (มุมมองบุคคลที่หนึ่ง) ===
- เรื่องนี้เป็น "นิยาย" ไม่ใช่แชตโรลเพลย์ — คุณคือผู้เขียน เขียน prose เล่าทั้งเรื่องเอง
- เล่าจากมุมมองบุคคลที่หนึ่งของ "${narrator}" (ใช้สรรพนามตามที่กำหนดในตัวละคร) — ความคิด/การกระทำของ ${narrator} เขียนได้เต็มที่
- ตัวละครอื่นทุกตัว คุณเขียนการกระทำ/คำพูด/ปฏิกิริยาให้ได้ทั้งหมด
- ไม่มี "{{user}}"/ผู้เล่นในโหมดนี้ — กฎเหล็กข้อ 2 (เรื่อง {{user}}) ไม่นำมาใช้`;
}

export function assembleSystemPrompt(ctx: NovelContext): string {
  const parts: string[] = [BASE_RULES];
  if (ctx.narrator && ctx.narrator.trim()) {
    parts.push('', novelFrame(ctx.narrator.trim()));
  }
  parts.push(
    '',
    modeBlock(ctx.mode),
    '',
    '=== โลก/setting ===',
    settingXml(ctx.setting),
    '',
    '=== ตัวเอก ===',
    charXml(ctx.protagonist, true),
  );

  if (ctx.supporting && ctx.supporting.length > 0) {
    parts.push('', '=== ตัวละครสมทบ ===');
    ctx.supporting.forEach((c) => parts.push(charXml(c, false)));
  }

  if (ctx.relations && ctx.relations.length > 0) {
    parts.push('', '=== ความสัมพันธ์ ===', relationsXml(ctx.relations, !!ctx.narrator));
  }

  // ลายเซ็นการเขียน + ทิศทาง/ข้อห้าม — header มีคำว่า "Style Guide" / "Do / Don't" ให้ logger ตรวจเจอ
  if (ctx.styleGuide && ctx.styleGuide.trim()) {
    parts.push('', '=== Style Guide — ลายเซ็นการเขียน (รักษาสไตล์นี้เสมอ) ===', ctx.styleGuide.trim());
  }
  if (ctx.dontList && ctx.dontList.trim()) {
    parts.push('', "=== Do / Don't — ทิศทางเรื่อง (กฎที่ต้องทำตามเสมอ) ===", ctx.dontList.trim());
  }
  // Vocabulary Palette — คำเฉพาะ/คำที่ให้ใช้ตรงๆ/คำห้ามใช้ (mirror ตัวเก่า novel.html) บังคับคำศัพท์ในงานเขียน
  if (ctx.vocabPalette && ctx.vocabPalette.trim()) {
    parts.push('', '=== Vocabulary Palette — คำเฉพาะ/คำห้ามใช้ (บังคับใช้คำตามนี้) ===', ctx.vocabPalette.trim().slice(0, 800));
  }

  if (ctx.eventOrder && ctx.eventOrder.length > 0) {
    parts.push(eventOrderBlock(ctx.eventOrder));
  }

  // สถานะ canonical ณ บทปัจจุบัน — วางใกล้ eventCurrent ที่สุด (freshest) ให้โมเดลยึดก่อนเขียน
  if (ctx.continuity && ctx.continuity.trim()) {
    parts.push('', '=== สถานะปัจจุบัน (canonical — ตัวละครต้องคงตามนี้ ห้ามขัดแย้ง/ย้อนกลับ) ===', ctx.continuity.trim());
  }

  parts.push('', '=== เหตุการณ์ปัจจุบันที่ต้องเขียน ===', ctx.eventCurrent);

  return parts.join('\n');
}
