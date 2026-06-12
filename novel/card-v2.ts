// card-v2.ts — Character Card V2/V3 (มาตรฐาน TavernAI/SillyTavern) import/export + PNG embed/extract
// สเปก: chara_card_v2 (keyword tEXt 'chara') และ chara_card_v3 (keyword tEXt 'ccv3') ฝัง base64(JSON) ใน PNG
// ใช้: server endpoints /api/characters/:name/export-card(.png) และ /api/characters/import-card
//
// หลักการ map: field มาตรฐาน (description/personality/scenario/...) ไว้ให้แอปอื่นอ่านรู้เรื่อง
// + เก็บ field เต็มของเรา (appearance/outfit/guard/power/visual/...) ใน extensions.novelapp เพื่อ round-trip ไม่สูญข้อมูล
import { deflateSync } from 'node:zlib';

// ===== ชนิดข้อมูล =====
/** entry ของ lorebook (character_book) — เก็บบน character doc field `lorebook` */
export interface LoreEntry {
  keys: string[];
  content: string;
  enabled?: boolean;
  insertion_order?: number;
  comment?: string;
}

/** character doc ของเรา (เท่าที่ card สนใจ) — ส่วนเกินถูกเก็บ/คืนผ่าน extensions.novelapp */
export interface NovelChar {
  name: string;
  appearance?: string;
  outfit?: string;
  description?: string;
  mindset?: string;
  behavior?: string;
  pronounSelf?: string;
  pronounOther?: string;
  speechTone?: string;
  voiceExamples?: string;
  scenario?: string;
  greeting?: string;
  likes?: string;
  dislikes?: string;
  guard?: number;
  power?: string;
  powerStanding?: boolean;
  visual?: Record<string, unknown>;
  lorebook?: LoreEntry[];
  tags?: string[];
}

// ===== map: our → V2/V3 =====

/** ประกอบ description ที่ "แอปอื่นอ่านรู้เรื่อง" จาก field ย่อยของเรา */
function composeDescription(c: NovelChar): string {
  const L: string[] = [];
  if (c.appearance) L.push(`รูปลักษณ์: ${c.appearance}`);
  if (c.outfit) L.push(`การแต่งตัว: ${c.outfit}`);
  if (c.description) L.push(`ภูมิหลัง: ${c.description}`);
  if (c.pronounSelf || c.pronounOther) L.push(`สรรพนาม: แทนตัว "${c.pronounSelf ?? 'ฉัน'}" · เรียกผู้เล่น "${c.pronounOther ?? 'คุณ'}"`);
  if (c.speechTone) L.push(`โทนการพูด: ${c.speechTone}`);
  return L.join('\n');
}

function composePersonality(c: NovelChar): string {
  const L: string[] = [];
  if (c.mindset) L.push(`วิธีคิด/ค่านิยม: ${c.mindset}`);
  if (c.behavior) L.push(`นิสัย/พฤติกรรม: ${c.behavior}`);
  if (c.likes) L.push(`ชอบ: ${c.likes.replace(/\n/g, ', ')}`);
  if (c.dislikes) L.push(`ไม่ชอบ: ${c.dislikes.replace(/\n/g, ', ')}`);
  return L.join('\n');
}

/** voiceExamples (บรรทัดละบทพูด) → mes_example รูปแบบ TavernAI (<START> + {{char}}: ...) */
function composeMesExample(c: NovelChar): string {
  const lines = (c.voiceExamples ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return '';
  return '<START>\n' + lines.map((l) => `{{char}}: ${l}`).join('\n');
}

function toCharacterBook(c: NovelChar) {
  if (!c.lorebook?.length) return undefined;
  return {
    name: `${c.name} lorebook`,
    extensions: {},
    entries: c.lorebook.map((e, i) => ({
      keys: e.keys ?? [],
      content: e.content ?? '',
      enabled: e.enabled !== false,
      insertion_order: e.insertion_order ?? i,
      case_sensitive: false,
      name: e.comment ?? '',
      priority: 10,
      id: i,
      comment: e.comment ?? '',
      selective: false,
      secondary_keys: [],
      constant: false,
      position: 'before_char',
      extensions: {},
    })),
  };
}

/** สร้าง object Character Card (รองรับทั้ง v2/v3 ผ่าน spec) */
export function toCard(c: NovelChar, spec: 'v2' | 'v3' = 'v3'): any {
  const data: any = {
    name: c.name,
    description: composeDescription(c),
    personality: composePersonality(c),
    scenario: c.scenario ?? '',
    first_mes: c.greeting ?? '',
    mes_example: composeMesExample(c),
    creator_notes: 'Exported from novelapp — full fidelity in extensions.novelapp',
    system_prompt: '',
    post_history_instructions: '',
    alternate_greetings: [],
    tags: c.tags?.length ? c.tags : ['novelapp'],
    creator: 'novelapp',
    character_version: '1.0',
    // เก็บ field เต็มของเรา → import กลับได้ครบไม่สูญ
    extensions: {
      novelapp: {
        appearance: c.appearance ?? '',
        outfit: c.outfit ?? '',
        description: c.description ?? '',
        mindset: c.mindset ?? '',
        behavior: c.behavior ?? '',
        pronounSelf: c.pronounSelf ?? '',
        pronounOther: c.pronounOther ?? '',
        speechTone: c.speechTone ?? '',
        voiceExamples: c.voiceExamples ?? '',
        scenario: c.scenario ?? '',
        greeting: c.greeting ?? '',
        likes: c.likes ?? '',
        dislikes: c.dislikes ?? '',
        guard: c.guard ?? null,
        power: c.power ?? '',
        powerStanding: !!c.powerStanding,
        visual: c.visual ?? null,
        lorebook: c.lorebook ?? [],
      },
    },
  };
  const book = toCharacterBook(c);
  if (book) data.character_book = book;

  if (spec === 'v2') {
    return { spec: 'chara_card_v2', spec_version: '2.0', data };
  }
  // v3 — เพิ่ม field เฉพาะ v3
  data.nickname = '';
  data.creator_notes_multilingual = {};
  data.source = [];
  data.group_only_greetings = [];
  data.assets = [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }];
  return { spec: 'chara_card_v3', spec_version: '3.0', data };
}

// ===== map: V2/V3 → our =====

/** แทน {{char}}/{{user}} ในข้อความที่มาจาก card นอก */
function fillMacros(s: string, name: string): string {
  return (s ?? '').replace(/\{\{char\}\}/gi, name).replace(/\{\{user\}\}/gi, 'คุณ');
}

/** mes_example (TavernAI) → voiceExamples (บรรทัดละบทพูดของตัวละคร) */
function parseMesExample(mes: string, name: string): string {
  if (!mes?.trim()) return '';
  return mes
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^<start>$/i.test(l))
    .map((l) => fillMacros(l, name).replace(/^\{\{char\}\}:\s*/i, '').replace(new RegExp(`^${name}:\\s*`, 'i'), '').replace(/^\{\{user\}\}:.*$/i, '').trim())
    .filter(Boolean)
    .join('\n');
}

/** รับ Character Card (v2 หรือ v3) → NovelChar (พร้อม upsert) */
export function fromCard(card: any): NovelChar {
  const data = card?.data ?? card; // เผื่อบาง card ส่ง data ตรง ๆ
  const name = String(data?.name ?? '').trim();
  if (!name) throw new Error('card has no data.name');

  // ถ้าเป็น card ที่ export จากเรา → คืนค่าเต็มจาก extensions.novelapp (lossless)
  const ext = data?.extensions?.novelapp;
  if (ext) {
    return {
      name,
      appearance: ext.appearance || '',
      outfit: ext.outfit || '',
      description: ext.description || '',
      mindset: ext.mindset || '',
      behavior: ext.behavior || '',
      pronounSelf: ext.pronounSelf || '',
      pronounOther: ext.pronounOther || '',
      speechTone: ext.speechTone || '',
      voiceExamples: ext.voiceExamples || '',
      scenario: ext.scenario || data?.scenario || '',
      greeting: ext.greeting || data?.first_mes || '',
      likes: ext.likes || '',
      dislikes: ext.dislikes || '',
      guard: typeof ext.guard === 'number' ? ext.guard : undefined,
      power: ext.power || '',
      powerStanding: !!ext.powerStanding,
      visual: ext.visual || undefined,
      lorebook: Array.isArray(ext.lorebook) ? ext.lorebook : undefined,
      tags: Array.isArray(data?.tags) ? data.tags : undefined,
    };
  }

  // card จากแอปอื่น (SillyTavern ฯลฯ) → map field มาตรฐานเข้าโครงของเรา
  const lorebook: LoreEntry[] | undefined = Array.isArray(data?.character_book?.entries)
    ? data.character_book.entries.map((e: any) => ({
        keys: Array.isArray(e.keys) ? e.keys : [],
        content: fillMacros(String(e.content ?? ''), name),
        enabled: e.enabled !== false,
        insertion_order: e.insertion_order ?? 0,
        comment: e.comment || e.name || '',
      }))
    : undefined;

  return {
    name,
    // description ของ card รวมทุกอย่าง → ใส่ใน description (ภูมิหลัง) ของเรา
    appearance: '',
    outfit: '',
    description: fillMacros(String(data?.description ?? ''), name),
    mindset: fillMacros(String(data?.personality ?? ''), name),
    behavior: '',
    pronounSelf: '',
    pronounOther: '',
    speechTone: '',
    voiceExamples: parseMesExample(String(data?.mes_example ?? ''), name),
    scenario: fillMacros(String(data?.scenario ?? ''), name),
    greeting: fillMacros(String(data?.first_mes ?? ''), name),
    likes: '',
    dislikes: '',
    power: '',
    powerStanding: false,
    lorebook,
    tags: Array.isArray(data?.tags) ? data.tags : undefined,
  };
}

// ===== PNG tEXt chunk (อ่าน/เขียน card ฝังใน PNG) =====
const PNG_SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function isPng(buf: Uint8Array): boolean {
  return buf.length > 8 && PNG_SIG.every((b, i) => buf[i] === b);
}

/** อ่าน tEXt chunks ทั้งหมด → map keyword → text */
function readTextChunks(png: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isPng(png)) return out;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let off = 8;
  while (off + 8 <= png.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(png[off + 4], png[off + 5], png[off + 6], png[off + 7]);
    const dataStart = off + 8;
    if (type === 'tEXt') {
      const data = png.subarray(dataStart, dataStart + len);
      const nul = data.indexOf(0);
      if (nul > 0) {
        const keyword = Buffer.from(data.subarray(0, nul)).toString('latin1');
        const text = Buffer.from(data.subarray(nul + 1)).toString('latin1');
        out[keyword] = text;
      }
    }
    if (type === 'IEND') break;
    off = dataStart + len + 4; // + CRC
  }
  return out;
}

/** ดึง Character Card JSON จาก PNG (รองรับ ccv3 ก่อน, fallback chara) — null ถ้าไม่มี */
export function extractCardFromPng(png: Uint8Array): any | null {
  const chunks = readTextChunks(png);
  const b64 = chunks['ccv3'] ?? chunks['chara'];
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function makeTextChunk(keyword: string, text: string): Uint8Array {
  const kw = Buffer.from(keyword, 'latin1');
  const val = Buffer.from(text, 'latin1');
  const data = Buffer.concat([kw, Buffer.from([0]), val]);
  const typeAndData = Buffer.concat([Buffer.from('tEXt', 'latin1'), data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeAndData.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + data.length);
  return chunk;
}

/** ฝัง card ลง PNG: เขียนทั้ง ccv3 (v3) และ chara (v2) ก่อน IEND เพื่อความเข้ากันได้สูงสุด */
export function embedCardInPng(basePng: Uint8Array, charOrCard: NovelChar | { v2: any; v3: any }): Uint8Array {
  if (!isPng(basePng)) throw new Error('base image is not a valid PNG');
  const v2 = 'v2' in charOrCard ? (charOrCard as any).v2 : toCard(charOrCard as NovelChar, 'v2');
  const v3 = 'v3' in charOrCard ? (charOrCard as any).v3 : toCard(charOrCard as NovelChar, 'v3');
  const charaB64 = Buffer.from(JSON.stringify(v2), 'utf8').toString('base64');
  const ccv3B64 = Buffer.from(JSON.stringify(v3), 'utf8').toString('base64');

  // หา offset ของ IEND แล้วแทรก chunk ก่อนหน้า (ลบ tEXt 'chara'/'ccv3' เดิมถ้ามี)
  const dv = new DataView(basePng.buffer, basePng.byteOffset, basePng.byteLength);
  const keep: Uint8Array[] = [basePng.subarray(0, 8)];
  let off = 8;
  let iend: Uint8Array | null = null;
  while (off + 8 <= basePng.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(basePng[off + 4], basePng[off + 5], basePng[off + 6], basePng[off + 7]);
    const whole = basePng.subarray(off, off + 12 + len);
    if (type === 'IEND') { iend = whole; break; }
    // ข้าม tEXt เก่าที่เป็น card (จะเขียนใหม่)
    if (type === 'tEXt') {
      const data = basePng.subarray(off + 8, off + 8 + len);
      const nul = data.indexOf(0);
      const kw = nul > 0 ? Buffer.from(data.subarray(0, nul)).toString('latin1') : '';
      if (kw === 'chara' || kw === 'ccv3') { off = off + 12 + len; continue; }
    }
    keep.push(whole);
    off = off + 12 + len;
  }
  if (!iend) throw new Error('PNG has no IEND chunk');
  return Buffer.concat([
    ...keep.map((u) => Buffer.from(u)),
    Buffer.from(makeTextChunk('chara', charaB64)),
    Buffer.from(makeTextChunk('ccv3', ccv3B64)),
    Buffer.from(iend),
  ]);
}

/** สร้าง PNG สีพื้นเล็ก ๆ (ใช้เป็น base ตอน export เมื่อไม่มี avatar จริง) */
export function makeSolidPng(w = 256, h = 256, rgb: [number, number, number] = [40, 30, 50]): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  // 10,11,12 = compression/filter/interlace = 0

  // raw scanlines: filter byte 0 + RGB*w ต่อแถว
  const stride = w * 3;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const base = y * (stride + 1);
    raw[base] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const p = base + 1 + x * 3;
      raw[p] = rgb[0]; raw[p + 1] = rgb[1]; raw[p + 2] = rgb[2];
    }
  }
  const idat = deflateSync(raw);

  const chunk = (type: string, data: Buffer): Buffer => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const c = Buffer.alloc(12 + data.length);
    c.writeUInt32BE(data.length, 0);
    td.copy(c, 4);
    c.writeUInt32BE(crc32(td), 8 + data.length);
    return c;
  };
  return Buffer.concat([
    Buffer.from(PNG_SIG),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
