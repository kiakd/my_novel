// Khui-style prompt assembler — รวม base + mode + character + setting → system prompt
import { RULE_ADULT, RULE_NO_META, RULE_R18_LEXICON, RULE_CONTINUITY, RULE_CONCISE } from './shared-rules';
import { renderStateCard, STATE_DELTA_INSTRUCTION, type StateCard } from './state-card';

export type Mode = 'novel' | 'dialogue' | 'r18';

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
  stateCard?: StateCard; // บัตรสถานะ structured (opt-in) — ถ้าส่งมา: render + สั่งโมเดลปล่อย [[state:]] delta + พาร์สเองในโค้ด (auto-track ข้ามบท เหมือนแชท)
  narrator?: string;     // โหมด "นิยายเต็ม": ชื่อตัวละครที่เรื่องติดตาม — AI เขียนทุกตัวละคร ไม่มี {{user}}
  pov?: '1st' | '3rd';   // มุมมองเล่าในโหมดนิยายเต็ม: '1st'=บุคคลที่หนึ่ง (default) · '3rd'=บุคคลที่สาม limited ติดตาม narrator
  recalled?: string[];   // RAG long-term memory: เหตุการณ์เก่าที่กู้คืนตามความเกี่ยวข้อง (เฟส 2 — scope=storyId) จัดอันดับ "ใต้" live state
  concise?: boolean;     // โหมดกระชับ (opt-in): ลดพรรณนาฟุ่มเฟือย เน้นบทสนทนา+การกระทำ จังหวะเร็ว (override ratio ของ mode)
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
7. ${RULE_CONTINUITY}
8. ${RULE_NO_META} (โหมดนิยายห้ามใช้ดอกจัน *…* คั่นฉาก และห้ามป้ายกำกับขั้นตอน [เริ่มต้น]/[ไคลแม็กซ์] — เขียนเป็น prose ต่อเนื่องตามโครงสร้าง output ของโหมด)`;

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

// cap กันโอเวอร์โฟลว์ context (โดยเฉพาะ Gemma 8K): เก็บบทล่าสุด MAX_EVENTS + ตัดความยาวต่อรายการ
// (ฝั่ง client ควรเลือกบท pivotal มาเองด้วย — นี่เป็น safety net ฝั่ง prompt)
const MAX_EVENT_ORDER = 40;
const MAX_EVENT_CHARS = 500;
function eventOrderBlock(order?: string[]): string {
  if (!order || order.length === 0) return '';
  const kept = order.length > MAX_EVENT_ORDER ? order.slice(-MAX_EVENT_ORDER) : order;
  const offset = order.length - kept.length; // คงเลขลำดับเดิมให้ตรงบท
  const lines = kept.map((e, i) => `${offset + i + 1}. ${e.length > MAX_EVENT_CHARS ? e.slice(0, MAX_EVENT_CHARS) + '…' : e}`);
  const note = offset > 0 ? `\n(แสดง ${kept.length} บทล่าสุดจากทั้งหมด ${order.length})` : '';
  return `\n=== ลำดับเหตุการณ์ที่ผ่านมา ===${note}\n${lines.join('\n')}`;
}

// RAG recalled memory (เฟส 2) — เหตุการณ์เก่าที่กู้คืนตามความเกี่ยวข้อง วางใต้ live state แต่เหนือ eventCurrent
function recalledBlock(recalled?: string[]): string {
  if (!recalled || recalled.length === 0) return '';
  return `\n=== ความทรงจำที่เกี่ยวข้องกับตอนนี้ (กู้จากบทเก่า — ใช้เป็นข้อมูลอ้างอิง ห้ามคัดลอกคำต่อคำ) ===\n${recalled.map((r) => `- ${r}`).join('\n')}`;
}

function novelFrame(narrator: string, pov: '1st' | '3rd' = '1st'): string {
  const povBlock = pov === '3rd'
    ? `=== โหมด: นิยายเต็ม (มุมมองบุคคลที่สาม — limited ติดตาม "${narrator}") ===
- เรื่องนี้เป็น "นิยาย" ไม่ใช่แชตโรลเพลย์ — คุณคือผู้เขียน เขียน prose เล่าทั้งเรื่องเอง
- เล่าด้วย "บุคคลที่สาม" ที่กล้องติดตาม "${narrator}": บรรยายเขา/เธอด้วยชื่อหรือสรรพนามบุรุษที่ 3 (เขา/เธอ/นาง) — เห็นได้เฉพาะสิ่งที่ ${narrator} รับรู้/มองเห็น/รู้สึกเท่านั้น ห้ามกระโดดเข้าหัวตัวละครอื่น
- สรรพนามบุรุษที่ 1 ของ ${narrator} (เช่น ผม/ฉัน/กู) ใช้ได้ "เฉพาะในบทพูดและความคิดในใจ" เท่านั้น — ส่วนบรรยายให้ใช้บุรุษที่ 3 เสมอ
- ตัวละครอื่นทุกตัว คุณเขียนคำพูด/การกระทำ/สีหน้าให้ได้ (เห็นจากภายนอกผ่านสายตา ${narrator}) แต่ห้ามบรรยาย "ความคิดภายใน" ของพวกเขาตรง ๆ`
    : `=== โหมด: นิยายเต็ม (มุมมองบุคคลที่หนึ่ง) ===
- เรื่องนี้เป็น "นิยาย" ไม่ใช่แชตโรลเพลย์ — คุณคือผู้เขียน เขียน prose เล่าทั้งเรื่องเอง
- เล่าจากมุมมองบุคคลที่หนึ่งของ "${narrator}" (ใช้สรรพนามตามที่กำหนดในตัวละคร) — ความคิด/การกระทำของ ${narrator} เขียนได้เต็มที่
- ตัวละครอื่นทุกตัว คุณเขียนการกระทำ/คำพูด/ปฏิกิริยาให้ได้ทั้งหมด`;
  return `${povBlock}
- ไม่มี "{{user}}"/ผู้เล่นในโหมดนี้ — กฎเหล็กข้อ 2 (เรื่อง {{user}}) ไม่นำมาใช้`;
}

/** เตือนความจำสั้นแทรก "ท้าย" user message ทุกครั้ง (recency anti-drift) — คู่กับ buildPersonaReminder ของแชท
 *  system prompt ยาว → โมเดลดริฟต์เสียง/ชุด/ฟอร์แมตตอน prose ยาว ๆ การย้ำท้ายสุด (ตำแหน่งอิทธิพลสูง) ช่วยตรึง */
export function buildNovelReminder(ctx: NovelContext): string {
  const who = ctx.narrator?.trim() || ctx.protagonist.name;
  const ratio = ctx.concise
    ? (ctx.mode === 'r18'
        ? 'กระชับ เน้นบทสนทนา+การกระทำ ลดพรรณนา + เรียกอวัยวะด้วยคำดิบเมื่อถึงฉากสัมผัส/สอดใส่'
        : 'กระชับ เน้นบทสนทนา+การกระทำที่เดินเรื่อง ประโยคสั้น ลดพรรณนาฟุ่มเฟือย')
    : ctx.mode === 'dialogue'
      ? 'บทพูด 75% บรรยาย 25%'
      : ctx.mode === 'r18'
        ? 'บรรยาย 65% บทพูด 35% + เรียกอวัยวะด้วยคำดิบเมื่อถึงฉากสัมผัส/สอดใส่'
        : 'บรรยาย 70% บทพูด 30% เน้นประสาทสัมผัส';
  const povNote = ctx.narrator
    ? ctx.pov === '3rd'
      ? `เล่าบุคคลที่ 3 ติดตาม "${who}" (บรรยายใช้เขา/เธอ · สรรพนามบุรุษ 1 เฉพาะบทพูด/ความคิด)`
      : `เล่าบุคคลที่ 1 ของ "${who}"`
    : `คงเสียง/บุคลิก/สรรพนามของ "${who}"`;
  const bits = [
    'ภาษาไทยล้วน',
    `${povNote} ให้คงเส้นคงวา`,
    'ยึด "สถานะปัจจุบัน" ล่าสุด (ชุด/ตำแหน่ง/สิ่งที่เพิ่งเกิด) ห้ามย้อนสภาพจุดเริ่มต้น',
    `ออกตามโครงสร้าง+อัตราส่วนของโหมด (${ratio})`,
  ];
  if (ctx.stateCard?.time) bits.push('หัวฉาก ⏰/📅 อิงเวลาจากสถานะปัจจุบัน ห้ามแต่งวันที่เอง');
  if (ctx.stateCard) bits.push('ปิดท้ายด้วยแท็ก [[state: ...]] สรุปสิ่งที่เปลี่ยน (ไม่เปลี่ยน=none)');
  return `[ย้ำก่อนเขียน: ${bits.join(' · ')}]`;
}

export function assembleSystemPrompt(ctx: NovelContext): string {
  const parts: string[] = [BASE_RULES];
  if (ctx.narrator && ctx.narrator.trim()) {
    parts.push('', novelFrame(ctx.narrator.trim(), ctx.pov ?? '1st'));
  }
  parts.push(
    '',
    modeBlock(ctx.mode),
  );
  // โหมดกระชับ: override ratio/สไตล์ของ mode ด้านบน (วางถัดจาก modeBlock ให้มีน้ำหนักทับ ratio เดิม)
  if (ctx.concise) {
    parts.push('', `=== ⚠️ OVERRIDE สไตล์: โหมดกระชับ (ทับ ratio/narr_style ของ Mode ด้านบน) ===\n${RULE_CONCISE}\n- ลดสัดส่วน "บรรยาย" ลง เพิ่ม "บทสนทนา/การกระทำ" · ตัด sensory_detail/literary_prose ที่ไม่จำเป็นออก · ความยาวต่อย่อหน้าสั้นลง`);
  }
  parts.push(
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

  // บัตรสถานะ structured (opt-in) — live state ที่อัปเดตทุกบทผ่าน [[state:]] delta (auto-track เหมือนแชท)
  const liveState = renderStateCard(ctx.stateCard);
  if (liveState) {
    parts.push('', '=== สถานะปัจจุบัน (live — ข้อเท็จจริงล่าสุดแบบ field ยึดเด็ดขาด ห้ามย้อน) ===', liveState);
    // หัวฉาก [📅|⏰|📍] = canonical จากบัตรสถานะ ไม่ให้โมเดลแต่งวันที่/เวลาเอง (กันวันที่เพี้ยนข้ามบท)
    if (ctx.stateCard?.time || ctx.stateCard?.location) {
      const hdr: string[] = [];
      if (ctx.stateCard.time) hdr.push(`⏰/📅 ใช้ "${ctx.stateCard.time}" (เลื่อนต่อได้ถ้าเวลาผ่านไปในฉาก แล้วอัปเดตผ่าน [[state: time=...]])`);
      if (ctx.stateCard.location) hdr.push(`📍 ใช้ "${ctx.stateCard.location}"`);
      parts.push(`⚠️ หัวฉาก [📅วันที่ | ⏰เวลา | 📍สถานที่] ให้อิงค่าจากสถานะปัจจุบันนี้ ห้ามแต่งวันที่/เวลาขึ้นใหม่เอง — ${hdr.join(' · ')}`);
    }
  }

  // RAG recalled — ใต้ live state (live state ยึดเด็ดขาดกว่า) แต่เหนือ eventCurrent
  const recalled = recalledBlock(ctx.recalled);
  if (recalled) parts.push('', recalled.trim());

  parts.push('', '=== เหตุการณ์ปัจจุบันที่ต้องเขียน ===', ctx.eventCurrent);

  // ถ้ามี stateCard → สั่งโมเดลปิดท้ายด้วยแท็ก [[state:]] สรุปสิ่งที่เปลี่ยน (server พาร์สเอง)
  if (ctx.stateCard) {
    parts.push('', STATE_DELTA_INSTRUCTION);
  }

  return parts.join('\n');
}
