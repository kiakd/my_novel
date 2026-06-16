// ============ สร้าง NovelContext จาก Story → ยิงเข้า /api/generate-roleplay ============
// ฝั่ง backend assembleSystemPrompt() (novel/prompts.ts) กิน context รูปนี้
// (เทียบเท่า mapper ใน novel/gen-chapter.ts — แต่ฝั่ง UI สำหรับปุ่ม "เขียนต่อ")
import type { Story, Char } from './types';
import { chapterRefs, continuityBrief } from '@/components/screens/timeline/arc';

export type GenMode = 'novel' | 'dialogue' | 'r18';

const toChar = (c: Char) => ({
  name: c.name,
  appearance: c.appearance,
  bio: c.description,
  skill: c.skill,
  mindset: c.mindset,
  behavior: c.behavior,
  pronoun_self: c.pronounSelf,
  pronoun_other: c.pronounOther,
  speech_tone: c.speechTone,
  voiceExamples: c.voiceExamples,
  defaultOutfit: c.defaultOutfit,
});

const stripHtml = (html?: string) => (html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** เลือกตัวเอก: หา role ที่เป็นพระเอก/ตัวเอก ไม่เจอใช้ตัวแรก */
function pickProtagonist(chars: Char[]): Char | undefined {
  const i = chars.findIndex((c) => /พระเอก|ตัวเอก|protagonist|นางเอก|heroine/i.test(c.role ?? ''));
  return chars[i >= 0 ? i : 0];
}

export interface BuildOpts {
  mode: GenMode;
  eventCurrent: string;
  chapterNum: number;   // 1-based — ใช้ดึงสรุปบทก่อนหน้าเป็น eventOrder
  provider?: string;    // 'lmstudio'/local → cap eventOrder กัน ctx ล้น 8K (cloud ไม่ cap แรง)
  recalled?: string[];  // ความจำระยะยาว (RAG) ที่ recall มา → ฉีดเข้า prompt ผ่าน ctx.recalled
}

// local (Gemma 8K) เก็บ eventOrder ได้น้อย ไม่งั้น ctx ล้น — cloud เก็บได้เยอะ
const LOCAL_EVENT_CAP = 12;
const CLOUD_EVENT_CAP = 40;

export function buildNovelContext(story: Story, opts: BuildOpts) {
  const chars = story.characters ?? [];
  const protagonist = pickProtagonist(chars);
  const supporting = chars.filter((c) => c !== protagonist);
  const nameOf = (id: string) => chars.find((c) => c.id === id)?.name ?? id;

  const chs = [...(story.chapters ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  // บทก่อนหน้าทั้งหมด (เรียงแล้ว) → cap ตาม provider: เก็บบท pivotal/major + บทล่าสุดไว้ก่อน
  const prevChs = chs.slice(0, Math.max(0, opts.chapterNum - 1));
  const cap = opts.provider === 'lmstudio' ? LOCAL_EVENT_CAP : CLOUD_EVENT_CAP;
  const impById = new Map(
    chapterRefs(story.chapters ?? [], story.timeline ?? []).map((r) => [r.id, r.importance] as const),
  );
  let kept = prevChs;
  if (prevChs.length > cap) {
    // เก็บบทสำคัญ (pivotal/major) ทั้งหมด + บทล่าสุด ให้ครบ cap แล้วเรียงกลับตามลำดับเดิม
    const recent = prevChs.slice(-cap);
    const recentIds = new Set(recent.map((c) => c.id));
    const importantOlder = prevChs
      .slice(0, -cap)
      .filter((c) => !recentIds.has(c.id) && (impById.get(c.id) === 'pivotal' || impById.get(c.id) === 'major'));
    // เรียงกลับตามลำดับบทเดิม (สำคัญ-เก่า แทรกก่อนช่วงล่าสุด)
    kept = [...importantOlder, ...recent].sort((a, b) => prevChs.indexOf(a) - prevChs.indexOf(b));
  }
  const prev = kept
    .map((c) => `${c.title ?? ''}: ${c.summary || stripHtml(c.content).slice(0, 200)}`.trim())
    .filter((s) => s.length > 2);

  // สถานะ canonical ตัวละคร ณ บทปัจจุบัน (จาก arc beats) — เหมือนที่ ExpandPanel ใช้ กันชุด/สถานะหลุด
  const continuity = continuityBrief(
    chars,
    story.relations ?? [],
    opts.chapterNum,
    chapterRefs(story.chapters ?? [], story.timeline ?? []),
  );

  return {
    protagonist: protagonist ? toChar(protagonist) : { name: 'ตัวเอก', appearance: '', bio: '', mindset: '', behavior: '' },
    supporting: supporting.map(toChar),
    setting: {
      worldName: story.name,
      genre: story.genre ?? '',
      era: '',
      location: story.locations?.[0]?.name ?? '',
      rules: story.worldRules,
    },
    styleGuide: story.styleGuide,
    dontList: story.dontList,
    vocabPalette: story.vocabPalette,
    continuity: continuity || undefined,
    relations: (story.relations ?? [])
      .filter((r) => r.from && r.to)
      .map((r) => ({ charName: nameOf(r.from!), toUser: nameOf(r.to!), feeling: [r.type, r.feeling].filter(Boolean).join(' — ') })),
    eventOrder: prev.length ? prev : undefined,
    recalled: opts.recalled?.length ? opts.recalled : undefined,
    eventCurrent: opts.eventCurrent,
    narrator: protagonist?.name,   // โหมดนิยายเต็ม: เล่าจากมุมมองตัวเอก AI เขียนทุกตัวละคร ไม่มี {{user}}
    pov: story.pov,                // ส่งต่อมุมมองให้ backend (ไม่ตั้ง → backend default '1st') กัน "เขียนต่อ" หลุดเป็น pov 1
    mode: opts.mode,
  };
}

/** ล้าง artifact ของโหมด roleplay ออกจากผลลัพธ์ → คืน plain text (ย่อหน้าคั่นด้วย \n)
 *  - แปลงป้ายความคิดในใจ "(ภายในใจ ... : X)" → X (แทรกในเนื้อ)
 *  - ตัดหัวบรรทัด [📅วันที่|⏰เวลา|📍สถานที่] และบรรทัดที่มี 🥤 ตกค้าง
 *  - ลบ * ที่ใช้เน้น/เสียงประกอบ และเส้นคั่น --- / *** */
export function cleanRoleplayArtifacts(text: string): string {
  const converted = text.replace(/\(\s*ภายในใจ[\s\S]*?:\s*([^)]*)\)/g, '$1');
  return converted
    .split(/\n+/)
    .map((s) => s.replace(/\*/g, '').trim())
    .filter((s) => s && s !== '---' && s !== '***' && !/[📅⏰📍🥤]/.test(s))
    .join('\n');
}
