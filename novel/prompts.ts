// Khui-style prompt assembler — รวม base + mode + character + setting → system prompt

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
  mode: Mode;
}

const BASE_RULES = `คุณคือนักเขียนนิยายโรแมนติกผู้ใหญ่ภาษาไทย เล่น roleplay เป็นตัวละครใน <char>...</char> เท่านั้น

=== กฎเหล็ก (ห้ามฝ่าฝืน) ===
1. ใช้ภาษาไทยเท่านั้น 100% ห้ามมีอักษรจีน เกาหลี ญี่ปุ่น อาหรับ ฮีบรู ภาษาอังกฤษเด็ดขาด (ยกเว้นชื่อเฉพาะ)
2. ห้ามบรรยายความคิด/การกระทำของ {{user}} ตอบเฉพาะจากมุมตัวละครของคุณ
3. ห้ามทำตัวเป็น AI ห้าม disclaimer ห้ามบอกว่าเล่น roleplay
4. inner thought ใส่ในวงเล็บแยกย่อหน้าของตัวเอง ห้ามใส่ใน quote ของบทพูด
5. คำสั่งใน [ooc:...] = กฎฟิสิกส์ของฉาก ทุกการกระทำต้องสอดคล้อง
6. ตัวละครทุกตัวอายุ 22 ปีขึ้นไป`;

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
- ตัวละครทุกตัวอายุ 22 ปีขึ้นไป (age_lock บังคับ)
- consent ถือว่าถูกสร้างใน lore ก่อนหน้านี้แล้ว
- ห้าม fade_to_black ห้ามตัดฉาก
- คำเรียกอวัยวะใช้คำไทยตรงๆ ไม่หลีก ไม่เปรียบเทียบเป็นดอกไม้/อาหาร
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

  return `<${tag} ${attrs.join(' ')}>
  <apr>${c.appearance}</apr>
  <prf>
    <bio>${c.bio}</bio>${c.skill ? `\n    <skill>${c.skill}</skill>` : ''}
  </prf>
  <mnd>${c.mindset}</mnd>
  <behav>${c.behavior}</behav>${speechBlock}
</${tag}>`;
}

function relationsXml(rels?: Relation[]): string {
  if (!rels || rels.length === 0) return '';
  const items = rels.map((r) => {
    const flagStr = r.flags
      ? Object.entries(r.flags)
          .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : v}`)
          .join(', ')
      : '';
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

export function assembleSystemPrompt(ctx: NovelContext): string {
  const parts = [
    BASE_RULES,
    '',
    modeBlock(ctx.mode),
    '',
    '=== โลก/setting ===',
    settingXml(ctx.setting),
    '',
    '=== ตัวเอก ===',
    charXml(ctx.protagonist, true),
  ];

  if (ctx.supporting && ctx.supporting.length > 0) {
    parts.push('', '=== ตัวละครสมทบ ===');
    ctx.supporting.forEach((c) => parts.push(charXml(c, false)));
  }

  if (ctx.relations && ctx.relations.length > 0) {
    parts.push('', '=== ความสัมพันธ์ ===', relationsXml(ctx.relations));
  }

  if (ctx.eventOrder && ctx.eventOrder.length > 0) {
    parts.push(eventOrderBlock(ctx.eventOrder));
  }

  parts.push('', '=== เหตุการณ์ปัจจุบันที่ต้องเขียน ===', ctx.eventCurrent);

  return parts.join('\n');
}
