// ============ โมเดลข้อมูล — align กับ backend (story-md.ts) ============
// state เก็บใน MongoDB เป็น JSON ก้อนเดียว: { stories: {id: Story}, activeStoryId }
// ฟิลด์ overlap ใช้ชื่อเดียวกับ story-md.ts (เพื่อให้ export-md + แอปเดิมอ่านได้)
// ฟิลด์ UI extra (color/id/status/visual) เก็บเพิ่มในก้อน JSON ได้ (export-md จะมองข้าม)
import type { ColorKey } from './theme';

export interface Char {
  id: string;             // UI key + relation/nodePos reference (slug); export-md ใช้ name เป็นหลัก
  name: string;
  role?: string;
  appearance?: string;
  description?: string;   // = bio
  skill?: string;
  mindset?: string;
  behavior?: string;
  pronounSelf?: string;
  pronounOther?: string;
  speechTone?: string;
  voiceExamples?: string; // = sample lines
  arc?: ArcBeat[];        // UI extra — จุดเปลี่ยนรายบท (timeline digest)
  // UI / image-gen extras (persist ในก้อน JSON)
  color?: ColorKey;
  promptAnchor?: string;
  negativeAnchor?: string;
  defaultOutfit?: string;
  stylePreference?: 'anime' | 'photoreal';
}

export type ChapterStatus = 'done' | 'draft' | 'empty';
export interface Chapter {
  id: string;
  title?: string;
  order?: number;
  content?: string;       // = body
  summary?: string;
  status?: ChapterStatus; // UI extra
}

export interface TLEvent {
  id: string;
  time?: string;          // = when
  order?: number;
  label?: string;         // = title
  description?: string;   // = detail
  chapterId?: string;     // = chapter
  color?: ColorKey;       // UI extra
  importance?: EventImportance; // UI extra — เด่นแค่ไหนใน digest
}

export type EventImportance = 'minor' | 'major' | 'pivotal';

// ---- Timeline "chapter digest" — สถานะตัวละครที่เปลี่ยนทีละบท ----
export type ArcKind = 'skill' | 'mindset' | 'status' | 'look' | 'milestone';
export type LookSub = 'hair' | 'outfit' | 'weapon' | 'item';

/** จุดเปลี่ยนของตัวละคร ผูกกับ "บทที่" (1-based ตาม chapter order) */
export interface ArcBeat {
  ch: number;            // เลขบท (1-based)
  kind: ArcKind;
  label: string;
  sub?: LookSub;         // เฉพาะ kind='look'
  why?: string;          // เหตุผล/บริบทของการเปลี่ยน
}

/** จุดเปลี่ยนของความสัมพันธ์ ผูกกับบท */
export interface RelBeat {
  ch: number;
  type: string;          // ประเภท ณ บทนี้ (allies/rivals/loves/…)
  intensity?: number;    // -100..100 (ลบ = ขัดแย้ง)
}

export interface Loc {
  id: string;
  name: string;
  zone?: string;
  mood?: string;
  description?: string;    // = desc
  details?: string;
  color?: ColorKey;        // UI extra
}

export interface Relation {
  id: string;
  from?: string;
  to?: string;
  type?: string;
  feeling?: string;
  beats?: RelBeat[];      // UI extra — จุดเปลี่ยนรายบท (timeline digest)
  flags?: Record<string, unknown>;
}

export interface Story {
  name?: string;
  genre?: string;
  theme?: string;
  premise?: string;
  plot?: string;
  worldRules?: string;     // = rules
  dontList?: string;       // = donts
  styleGuide?: string;     // = style
  vocabPalette?: string;   // = vocab
  pov?: '1st' | '3rd';     // มุมมองเล่าโหมดนิยายเต็ม: '3rd'=บุคคลที่สาม limited ติดตามตัวเอก · ไม่ตั้ง=backend default '1st'
  track?: string;          // เส้นเรื่อง (เช่น 'dark'/'novel') — เผื่ออ้างอิง
  characters: Char[];
  chapters: Chapter[];
  timeline: TLEvent[];
  locations: Loc[];
  relations: Relation[];
  // UI extra: ตำแหน่งโหนดในกราฟ relations
  nodePos?: Record<string, { x: number; y: number }>;
}

export interface AppState {
  stories: Record<string, Story>;
  activeStoryId: string;
}

// log shapes (จาก backend)
export interface AILogRow {
  id: string;
  ts: string;
  endpoint: string;
  provider: string;
  model: string;
  ok: boolean;
  error?: string;
  ms: number;
  meta?: Record<string, unknown>;
  systemPreview?: string;
  userPreview?: string;
  responsePreview?: string;
}

/** log เต็ม (ดึงทีละรายการจาก /api/logs/:id) — system/user/response ไม่ถูกตัด */
export interface AILogDetail {
  system?: string;
  user?: string;
  response?: string;
}

export interface AppLogRow {
  _id: string;
  ts: string;
  type: 'request' | 'activity' | 'error';
  level: 'info' | 'warn' | 'error';
  method?: string;
  path?: string;
  status?: number;
  ms?: number;
  action?: string;
  target?: string;
  error?: string;
  meta?: Record<string, unknown>;
}
