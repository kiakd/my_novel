// story-md.ts — สร้าง ground-truth markdown (storyline/character/event) จาก Story object
// ใช้ร่วมกัน 2 ที่: CLI (`export-story-md.ts`) และ server endpoint (POST /api/export-md)
//
// Source of truth = MongoDB — ไฟล์ .md เป็น snapshot ห้ามแก้มือ แก้ในแอปแล้ว gen ใหม่

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface Char {
  name: string; role?: string; description?: string; appearance?: string;
  skill?: string; mindset?: string; behavior?: string;
  pronounSelf?: string; pronounOther?: string; speechTone?: string; voiceExamples?: string;
}
export interface Chapter { id: string; title?: string; order?: number; content?: string; summary?: string }
export interface TLEvent { id: string; time?: string; order?: number; label?: string; description?: string; chapterId?: string }
export interface Loc { name: string; zone?: string; mood?: string; description?: string; details?: string }
export interface Relation { from?: string; to?: string; type?: string; feeling?: string; flags?: Record<string, unknown> }
export interface Story {
  name?: string; genre?: string; theme?: string; premise?: string; plot?: string;
  worldRules?: string; dontList?: string; styleGuide?: string; vocabPalette?: string;
  characters?: Char[]; chapters?: Chapter[]; timeline?: TLEvent[]; locations?: Loc[]; relations?: Relation[];
}

const GEN_NOTE = '> ⚙️ ไฟล์นี้ auto-generated จาก MongoDB (ปุ่ม "Export .md" ในแอป หรือ `bun export-story-md.ts`) — อย่าแก้ด้วยมือ แก้ในแอปแล้ว gen ใหม่\n';

/** เลือกเรื่องจาก map: ตาม id, index 1-based, หรือชื่อ — default = active */
export function pickStory(stories: Record<string, Story>, activeId: string, sel?: string): [string, Story] {
  const entries = Object.entries(stories);
  if (!sel) return [activeId, stories[activeId] ?? entries[0][1]];
  if (stories[sel]) return [sel, stories[sel]];
  const asIdx = Number(sel);
  if (Number.isInteger(asIdx) && entries[asIdx - 1]) return entries[asIdx - 1];
  const byName = entries.find(([, s]) => s.name === sel);
  if (byName) return byName;
  throw new Error(`ไม่พบเรื่อง "${sel}" — มี: ${entries.map(([id, s]) => `${id} (${s.name})`).join(', ')}`);
}

function nonEmpty(...lines: (string | false | undefined | null)[]): string {
  return lines.filter(Boolean).join('\n');
}

export function buildStoryline(s: Story): string {
  const locBlock = (s.locations ?? []).map((l) =>
    nonEmpty(`### ${l.name}${l.zone ? ` — ${l.zone}` : ''}`, l.mood && `- บรรยากาศ: ${l.mood}`,
      l.description && `- คำอธิบาย: ${l.description}`, l.details && `- รายละเอียด: ${l.details}`)
  ).join('\n\n');

  return nonEmpty(
    `# โครงเรื่อง — ${s.name ?? '(ไม่มีชื่อ)'}`, '', GEN_NOTE,
    s.genre && `**แนวเรื่อง:** ${s.genre}`,
    s.theme && `**แก่นเรื่อง (Theme):** ${s.theme}`,
    '',
    s.premise && nonEmpty('## Premise', s.premise, ''),
    s.plot && nonEmpty('## โครงเรื่องโดยละเอียด', s.plot, ''),
    s.worldRules && nonEmpty('## ⚙️ กฎของโลก / World Rules & Lore (ห้ามเปลี่ยน)', s.worldRules, ''),
    s.styleGuide && nonEmpty('## ✍️ Style Guide — ลายเซ็นต์การเขียน (รักษาสไตล์นี้เสมอ)', s.styleGuide, ''),
    s.vocabPalette && nonEmpty('## 🗂️ Vocabulary Palette — คำเฉพาะ / คำห้ามใช้', s.vocabPalette, ''),
    s.dontList && nonEmpty('## 🎯 Do / Don\'t — ทิศทางเรื่อง (กฎที่ต้องปฏิบัติเสมอ)', s.dontList, ''),
    locBlock && nonEmpty('## 📍 สถานที่ในเรื่อง (บรรยายให้ consistent ห้ามสร้างใหม่)', '', locBlock, ''),
  ) + '\n';
}

export function buildCharacter(s: Story): string {
  const blocks = (s.characters ?? []).map((c) => {
    const speech = [
      c.pronounSelf && `แทนตัว="${c.pronounSelf}"`,
      c.pronounOther && `เรียกอีกฝ่าย="${c.pronounOther}"`,
      c.speechTone && `โทน="${c.speechTone}"`,
    ].filter(Boolean).join(', ');
    const voice = (c.voiceExamples ?? '').split('\n').map((l) => l.trim()).filter(Boolean);

    return nonEmpty(
      `## ${c.name}${c.role ? ` — ${c.role}` : ''}`,
      c.appearance && `- **ลักษณะกาย (apr):** ${c.appearance}`,
      c.description && `- **ประวัติ/bio (prf):** ${c.description}`,
      c.skill && `- **สกิล/พลัง (skill):** ${c.skill}`,
      c.mindset && `- **วิธีคิด (mnd):** ${c.mindset}`,
      c.behavior && `- **นิสัย (behav):** ${c.behavior}`,
      speech && `- **การพูด:** ${speech}`,
      voice.length > 0 && nonEmpty('- **ตัวอย่างบทพูด (few-shot — ล็อกโทนเสียง):**',
        voice.map((l) => `  - ${l}`).join('\n')),
      '',
      '```xml',
      `<char name="${c.name}">`,
      c.appearance && `  <apr>${c.appearance}</apr>`,
      c.description && `  <prf><bio>${c.description}</bio>${c.skill ? `<skill>${c.skill}</skill>` : ''}</prf>`,
      c.mindset && `  <mnd>${c.mindset}</mnd>`,
      c.behavior && `  <behav>${c.behavior}</behav>`,
      speech && `  <ooc>[ooc: speech_pattern { ${speech} }]</ooc>`,
      `</char>`,
      '```',
    );
  });

  const rels = (s.relations ?? []).map((r) =>
    `- **${r.from ?? '?'} → ${r.to ?? '?'}**: ${r.type ?? ''}${r.feeling ? ` (${r.feeling})` : ''}`
  ).join('\n');

  return nonEmpty(
    `# ตัวละคร — ${s.name ?? ''}`, '', GEN_NOTE,
    `> AI ต้อง keep character ตาม block นี้เสมอ ห้ามสลับสกิล/โทน/นิสัยข้ามตัวละคร`, '',
    blocks.join('\n\n'),
    rels && nonEmpty('', '## ความสัมพันธ์ (Relations)', rels),
  ) + '\n';
}

export function buildEvent(s: Story): string {
  const chapters = [...(s.chapters ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const timeline = [...(s.timeline ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const chBlock = chapters.map((c) => {
    const wc = (c.content ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
    return nonEmpty(
      `### ${c.title ?? '(ไม่มีชื่อบท)'}`,
      c.summary && `**สรุป:** ${c.summary.replace(/\n/g, ' / ')}`,
      `*(ความยาวเนื้อหา ~${wc} ตัวอักษร)*`,
    );
  }).join('\n\n');

  const tlBlock = timeline.map((t) =>
    nonEmpty(`- **${t.time ?? '?'}** — ${t.label ?? ''}`, t.description && `  - ${t.description}`)
  ).join('\n');

  return nonEmpty(
    `# เหตุการณ์ / ลำดับเวลา — ${s.name ?? ''}`, '', GEN_NOTE,
    `> ใช้เป็น ground truth ของ "เกิดอะไรขึ้นแล้วบ้าง" — เขียนต่อต้องไม่ขัดกับลำดับนี้`, '',
    chBlock && nonEmpty('## บท (Chapters) ตามลำดับ', '', chBlock, ''),
    tlBlock && nonEmpty('## ไทม์ไลน์ (Timeline)', '', tlBlock),
  ) + '\n';
}

/** สร้างทั้ง 3 ไฟล์เป็น { ชื่อไฟล์: เนื้อหา } */
export function buildStoryMd(story: Story): Record<string, string> {
  return {
    'storyline.md': buildStoryline(story),
    'character.md': buildCharacter(story),
    'event.md': buildEvent(story),
  };
}

/** เขียนทั้ง 3 ไฟล์ลง dir → คืน list ของ { name, bytes } */
export async function writeStoryMd(story: Story, dir: string): Promise<{ name: string; bytes: number }[]> {
  await mkdir(dir, { recursive: true });
  const files = buildStoryMd(story);
  const out: { name: string; bytes: number }[] = [];
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, name), content, 'utf8');
    out.push({ name, bytes: content.length });
  }
  return out;
}
