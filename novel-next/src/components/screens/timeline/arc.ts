// ============ Timeline "chapter digest" — ตรรกะล้วน (port จาก wireframe) ============
// แปลงข้อมูล Story (characters.arc / relations.beats / timeline) → สถานะ ณ "บทที่ n"
// ทุกฟังก์ชันเป็น pure — ทดสอบ/อ่านง่าย และแยกจาก React ตามกฎ component-granularity
import type { Char, Relation, TLEvent, Chapter, ArcBeat, RelBeat, ArcKind, LookSub } from '@/lib/types';

/** บทที่จัดเรียง + เลข 1-based + คำอธิบายสั้น */
export interface ChapterRef {
  id: string;
  num: number;
  title: string;
  blurb: string;
  importance?: TLEvent['importance'];
}

/** ตัดข้อความยาวเป็นประโยคสั้นๆ สำหรับ blurb */
function excerpt(s = '', max = 160): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const dot = clean.indexOf('. ');
  const cut = dot > 30 && dot < max ? dot + 1 : Math.min(clean.length, max);
  return clean.slice(0, cut).trim() + (cut < clean.length ? '…' : '');
}

/** บทเรียงตาม order + เลข 1-based + blurb + ระดับความสำคัญ (จาก event ที่ผูกบทนั้น) */
export function chapterRefs(chapters: Chapter[], events: TLEvent[]): ChapterRef[] {
  const impOf = (id: string): TLEvent['importance'] => {
    const evs = events.filter((e) => e.chapterId === id);
    if (evs.some((e) => e.importance === 'pivotal')) return 'pivotal';
    if (evs.some((e) => e.importance === 'major')) return 'major';
    return evs.find((e) => e.importance)?.importance;
  };
  return [...chapters]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((c, i) => ({
      id: c.id,
      num: i + 1,
      title: c.title || `Chapter ${i + 1}`,
      blurb: c.summary?.trim() || excerpt(c.content),
      importance: impOf(c.id),
    }));
}

const arcOf = (c: Char): ArcBeat[] => c.arc ?? [];

/** ความสัมพันธ์ที่ไม่มี beats (ข้อมูลเก่า) → สังเคราะห์ 1 beat ที่บท 1 เพื่อให้ยังโชว์ */
export function relBeats(r: Relation): RelBeat[] {
  if (r.beats?.length) return [...r.beats].sort((a, b) => a.ch - b.ch);
  return [{ ch: 1, type: r.type || 'linked' }];
}

/** ตัวละครปรากฏแล้วหรือยัง ณ บท ch (มี beat แรก ≤ ch) */
export function introducedBy(c: Char, ch: number): boolean {
  const a = arcOf(c);
  if (!a.length) return true; // ไม่มี arc → ถือว่ามีตลอด
  return Math.min(...a.map((b) => b.ch)) <= ch;
}

/** ตัวละครมีการเปลี่ยนแปลงในบท ch พอดีไหม (arc หรือความสัมพันธ์) */
export function hasChangeAt(c: Char, rels: Relation[], ch: number): boolean {
  if (arcOf(c).some((b) => b.ch === ch)) return true;
  return rels.some((r) => (r.from === c.id || r.to === c.id) && relBeats(r).some((b) => b.ch === ch));
}

/** สถานะย่อ (skill/mindset/status ล่าสุด ≤ ch) สำหรับการ์ดตัวละคร */
export function charStateAt(c: Char, ch: number): Record<'skill' | 'mindset' | 'status', string | null> {
  const out = { skill: null, mindset: null, status: null } as Record<'skill' | 'mindset' | 'status', string | null>;
  for (const b of arcOf(c)) {
    if (b.ch <= ch && (b.kind === 'skill' || b.kind === 'mindset' || b.kind === 'status')) out[b.kind] = b.label;
  }
  return out;
}

/** ประเภทความสัมพันธ์ ณ บท ch (beat ล่าสุด ≤ ch) */
export function relTypeAt(r: Relation, ch: number): RelBeat | null {
  let cur: RelBeat | null = null;
  for (const b of relBeats(r)) if (b.ch <= ch) cur = b;
  return cur;
}

// ---- "what changes this chapter" ----
export interface Change {
  key: string;
  kind: ArcKind | 'rel' | 'event';
  text: string;
  color?: string;
  pivotal?: boolean;
}

/** รวมทุกอย่างที่ "เพิ่งเกิด" ในบท ch: arc ตัวละคร + ความสัมพันธ์ + เหตุการณ์ */
export function changesAt(chars: Char[], rels: Relation[], events: TLEvent[], chapterId: string, ch: number): Change[] {
  const out: Change[] = [];
  chars.forEach((c) =>
    arcOf(c).forEach((b) => {
      if (b.ch === ch) out.push({ key: `${c.id}-${b.kind}-${b.ch}-${b.label}`, kind: b.kind, text: `${c.name} — ${b.kind}: ${b.label}`, color: c.color });
    }),
  );
  rels.forEach((r) => {
    const at = relBeats(r).find((b) => b.ch === ch);
    if (!at) return;
    const a = chars.find((c) => c.id === r.from)?.name ?? r.from;
    const b = chars.find((c) => c.id === r.to)?.name ?? r.to;
    out.push({ key: `${r.id}-${ch}`, kind: 'rel', text: `${a} × ${b} → ${at.type}` });
  });
  events
    .filter((e) => e.chapterId === chapterId)
    .forEach((e) => out.push({ key: `ev-${e.id}`, kind: 'event', text: e.label || 'Event', pivotal: e.importance === 'pivotal', color: e.color }));
  return out;
}

// ---- rich state (สำหรับ overlay) ----
export interface StateBeat extends ArcBeat { isNew: boolean; prev?: ArcBeat | null }
export interface BondState {
  other: string;
  type: string;
  intensity?: number;
  ch: number;
  isNew: boolean;
  brandNew: boolean;
  prev?: RelBeat | null;
}
export interface RichState {
  skills: StateBeat[];
  milestones: StateBeat[];
  mindset: StateBeat | null;
  status: StateBeat | null;
  look: StateBeat[];
  bonds: BondState[];
}

/** สถานะเต็มของตัวละคร ณ บท ch พร้อมธง isNew (เพิ่งได้ในบทนี้) — port จาก wireframe richState */
export function richState(c: Char, rels: Relation[], ch: number): RichState {
  const beats = arcOf(c);
  const upto = beats.filter((b) => b.ch <= ch);
  const priorOf = (kind: ArcKind, curCh: number): ArcBeat | null => {
    let p: ArcBeat | null = null;
    beats.forEach((b) => { if (b.kind === kind && b.ch < curCh) p = b; });
    return p;
  };
  const latest = (kind: ArcKind): ArcBeat | null => {
    let cur: ArcBeat | null = null;
    upto.forEach((b) => { if (b.kind === kind) cur = b; });
    return cur;
  };
  const wrap = (b: ArcBeat | null, kind: ArcKind): StateBeat | null =>
    b ? { ...b, isNew: b.ch === ch, prev: b.ch === ch ? priorOf(kind, ch) : null } : null;

  const skills = upto.filter((b) => b.kind === 'skill').map((b) => ({ ...b, isNew: b.ch === ch }));
  const milestones = upto.filter((b) => b.kind === 'milestone').map((b) => ({ ...b, isNew: b.ch === ch }));
  const subs: Record<string, ArcBeat> = {};
  upto.filter((b) => b.kind === 'look').forEach((b) => { subs[b.sub || 'item'] = b; });
  const look = Object.keys(subs).map((s) => ({ ...subs[s], sub: s as LookSub, isNew: subs[s].ch === ch }));

  const bonds: BondState[] = rels
    .filter((r) => r.from === c.id || r.to === c.id)
    .map((r): BondState | null => {
      const cur = relTypeAt(r, ch);
      if (!cur) return null;
      const other = r.from === c.id ? r.to! : r.from!;
      const bs = relBeats(r);
      const isNew = cur.ch === ch;
      const brandNew = isNew && bs[0].ch === cur.ch;
      let prev: RelBeat | null = null;
      if (isNew && !brandNew) bs.forEach((b) => { if (b.ch < cur.ch) prev = b; });
      return { other, type: cur.type, intensity: cur.intensity, ch: cur.ch, isNew, brandNew, prev };
    })
    .filter((b): b is BondState => b !== null);

  return { skills, milestones, mindset: wrap(latest('mindset'), 'mindset'), status: wrap(latest('status'), 'status'), look, bonds };
}

// ---- continuity brief: สรุปสถานะ canonical ของตัวละครทุกตัว ณ บท ch (สำหรับป้อนให้ AI) ----
/** ข้อความสรุปให้ AI อ่านก่อนแต่งบทถัดไป เพื่อไม่ให้ตัวละครหลุดสกิล/สถานะ/รูปลักษณ์/ความสัมพันธ์ */
export function continuityBrief(chars: Char[], rels: Relation[], ch: number, chapters: ChapterRef[]): string {
  const cref = chapters.find((c) => c.num === ch);
  const nameOf = (id: string) => chars.find((c) => c.id === id)?.name ?? id;
  const inPlay = chars.filter((c) => introducedBy(c, ch));
  if (!inPlay.length) return '';

  const lines = inPlay.map((c) => {
    const S = richState(c, rels, ch);
    const segs: string[] = [];
    if (S.skills.length) segs.push(`สกิล: ${S.skills.map((s) => s.label).join(', ')}`);
    if (S.mindset) segs.push(`วิธีคิด: ${S.mindset.label}`);
    if (S.status) segs.push(`สถานะ: ${S.status.label}`);
    if (S.look.length) segs.push(`รูปลักษณ์: ${S.look.map((l) => l.label).join(', ')}`);
    if (S.milestones.length) segs.push(`ผ่านเหตุการณ์: ${S.milestones.map((m) => m.label).join(', ')}`);
    if (S.bonds.length) segs.push(`ความสัมพันธ์: ${S.bonds.map((b) => `${nameOf(b.other)}=${b.type}`).join(', ')}`);
    const role = c.role ? ` (${c.role})` : '';
    return `• ${c.name}${role} — ${segs.join(' · ') || 'ยังไม่ระบุรายละเอียด'}`;
  });

  const head = `[ความต่อเนื่องตัวละคร ณ บท ${ch}${cref ? ` · ${cref.title}` : ''}] ตัวละครต้องคงสกิล/สถานะ/รูปลักษณ์/ความสัมพันธ์ตามนี้ ห้ามขัดแย้งหรือย้อนกลับโดยไม่มีเหตุในเรื่อง`;
  return `${head}\n${lines.join('\n')}`;
}

// ---- relationship type → สไตล์เส้น/สี/ไอคอน (map ประเภท free-text เป็นหมวด) ----
export interface RelStyle { color: string; emoji: string; pattern: 'solid' | 'dashed' | 'double' }

export function relStyle(type = ''): RelStyle {
  const t = type.toLowerCase();
  if (/(rival|enem|conflict|war|foe)/.test(t)) return { color: 'coral', emoji: '⚔️', pattern: 'dashed' };
  if (/(love|romance|lover)/.test(t)) return { color: 'bubble', emoji: '❤️', pattern: 'double' };
  if (/(all|friend|trust|bond)/.test(t)) return { color: 'mint', emoji: '🤝', pattern: 'solid' };
  if (/(mentor|teach|master|student)/.test(t)) return { color: 'grape', emoji: '🎓', pattern: 'solid' };
  if (/(sibl|famil|brother|sister|kin)/.test(t)) return { color: 'sun', emoji: '👪', pattern: 'solid' };
  if (/(employ|serv|debt|hire)/.test(t)) return { color: 'slate', emoji: '⛓️', pattern: 'dashed' };
  if (/(watch|keep|guard)/.test(t)) return { color: 'sky', emoji: '👁️', pattern: 'solid' };
  return { color: 'slate', emoji: '🔗', pattern: 'solid' };
}
