// ============ Character Card V2/V3 client — import/export การ์ดตัวละครแชท ============
// backend (Bun/Elysia :3000) มี endpoint อยู่แล้ว → ที่นี่แค่ map + เรียก + trigger download
// stateless endpoints (/api/card/*) ใช้กับตัวละครแชท ซึ่งเก็บแยกจาก DB
import type { ChatChar, LoreEntry } from './chat-types';

/** โครง NovelChar ของ backend (card-v2.ts) — นิยามซ้ำที่นี่ (คนละ package ไม่ import ข้าม) */
export interface NovelCardLore {
  keys: string[];
  content: string;
  enabled?: boolean;
  insertion_order?: number;
  comment?: string;
}
export interface NovelCardChar {
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
  lorebook?: NovelCardLore[];
  tags?: string[];
}

// ---- map: ChatChar → NovelChar (สำหรับ export) ----
export function chatCharToNovelChar(c: ChatChar): NovelCardChar {
  return {
    name: c.name,
    appearance: c.appearance,
    outfit: c.outfit,
    description: c.description,
    mindset: c.mindset,
    behavior: c.behavior,
    pronounSelf: c.pronounSelf,
    pronounOther: c.pronounOther,
    speechTone: c.speechTone,
    voiceExamples: c.voiceExamples,
    scenario: c.scenario,
    greeting: c.greeting,
    likes: c.likes,
    dislikes: c.dislikes,
    guard: c.guard,
    power: c.power,
    powerStanding: c.powerStanding,
    lorebook: (c.lore ?? []).map((e) => ({
      keys: e.keys,
      content: e.text,
      enabled: e.always ?? true,
      comment: '',
    })),
  };
}

// ---- map: NovelChar → ChatChar patch (สำหรับ import — เว้น id/color/relStart ให้ caller รักษาของเดิม) ----
export function novelCharToChatPatch(nc: NovelCardChar): Partial<ChatChar> {
  const lore: LoreEntry[] = (nc.lorebook ?? []).map((e, i) => ({
    id: 'lore' + i + Date.now(),
    keys: e.keys ?? [],
    text: e.content,
    always: e.enabled !== false,
  }));
  return {
    name: nc.name,
    appearance: nc.appearance,
    outfit: nc.outfit,
    description: nc.description,
    mindset: nc.mindset,
    behavior: nc.behavior,
    pronounSelf: nc.pronounSelf,
    pronounOther: nc.pronounOther,
    speechTone: nc.speechTone,
    voiceExamples: nc.voiceExamples,
    scenario: nc.scenario,
    greeting: nc.greeting,
    likes: nc.likes,
    dislikes: nc.dislikes,
    guard: nc.guard,
    power: nc.power,
    powerStanding: nc.powerStanding,
    lore,
  };
}

// ---- browser download helper (มาตรฐาน: createObjectURL + anchor + revoke) ----
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const safeName = (name: string) => (name || 'character').replace(/[\\/:*?"<>|]/g, '_').trim() || 'character';

/** export เป็น PNG (มีการ์ดฝัง) → ดาวน์โหลด <name>.card.png */
export async function exportCardPng(c: ChatChar): Promise<void> {
  const res = await fetch('/api/card/export?spec=v3&format=png', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatCharToNovelChar(c)),
  });
  if (!res.ok) throw new Error(`export png → ${res.status}`);
  downloadBlob(await res.blob(), `${safeName(c.name)}.card.png`);
}

/** export เป็น JSON การ์ด → ดาวน์โหลด <name>.card.json (pretty) */
export async function exportCardJson(c: ChatChar): Promise<void> {
  const res = await fetch('/api/card/export?spec=v3&format=json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatCharToNovelChar(c)),
  });
  if (!res.ok) throw new Error(`export json → ${res.status}`);
  const card = await res.json();
  downloadBlob(new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' }), `${safeName(c.name)}.card.json`);
}

const isPngFile = (f: File) => f.type === 'image/png' || /\.png$/i.test(f.name);

/** import ไฟล์การ์ด (PNG ฝัง หรือ JSON) → patch สำหรับเติมฟอร์มแก้ตัวละคร */
export async function importCardFile(file: File): Promise<Partial<ChatChar>> {
  let res: Response;
  if (isPngFile(file)) {
    res = await fetch('/api/card/import', {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: await file.arrayBuffer(),
    });
  } else {
    const card = JSON.parse(await file.text());
    res = await fetch('/api/card/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error ?? `import → ${res.status}`);
  return novelCharToChatPatch(data.char as NovelCardChar);
}
