import { Elysia } from 'elysia';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getDb } from './db';
import { logRequest, logActivity, logError, ensureLogIndexes, APP_LOG_COLLECTION } from './logger';
import { assembleSystemPrompt, buildNovelReminder, type NovelContext } from './prompts';
import { assembleChatPrompt, assembleNarratorPrompt, buildPersonaReminder, type ChatCharLite, type PlayerPersonaLite } from './chat-prompt';
import { getMemDb, ingestMemory, recall, type MemRow } from './chat-memory';
import { embedTexts, embedOne } from './embed';
import { RULE_ADULT, RULE_R18_LEXICON } from './shared-rules';
import { pickStory, writeStoryMd, type Story } from './story-md';
import { runWD14, categorizeTags, REF_SCENE_SYSTEM, buildRefSceneUser } from './ref-tag';
import { toCard, fromCard, embedCardInPng, extractCardFromPng, makeSolidPng, type NovelChar } from './card-v2';
import { renderStateCard, processChatState, type StateCard } from './state-card';
import {
  generateNovelAI,
  generateTensorArt,
  generateCivitai,
  generateComfyUI,
  type ImageProvider,
  type ImageGenParams,
} from './image-gen';

const PORT = Number(process.env.PORT ?? 3000);

const STATE_ID = 'main';
const CHAT_STATE_ID = 'chat';   // state ก้อนแยกของระบบแชท RP (ไม่ปนกับ stories) — เก็บเฉพาะ chars+items
const CHAT_SESSIONS_COLLECTION = 'chat_sessions';   // session แชทเก็บ doc ละอัน (_id = session.id)
const DICT_ID = 'dict';
const COLLECTION = 'workspace';
const LOG_COLLECTION = 'ai_logs';
const CHAR_COLLECTION = 'characters';

function slugifyName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-฀-๿]/g, '_').slice(0, 60);
}

// heuristic: ฉากนี้เข้าโซน R18 ไหม (ดูจาก input ผู้เล่น + บทล่าสุดของตัวละคร) — ใช้ตัดสินว่าจะยิง explicit nudge
const R18_KW = ['จูบ', 'เปลือย', 'ถอด', 'เตียง', 'คร่อม', 'สอด', 'สอดใส่', 'ขยับ', 'เสียว', 'ครวญ', 'หน้าอก', 'หัวนม', 'ก้น', 'ตูด', 'ควย', 'หัวควย', 'หี', 'เม็ดแตด', 'จิ๋ม', 'แตก', 'เงี่ยน', 'น้ำรัก', 'ลูบ', 'ไล้', 'โอบ', 'กอด', 'หอบ', 'อสุจิ', 'ช่วยตัวเอง', 'สำเร็จความใคร่', 'cock', 'pussy', 'cunt', 'fuck', 'nipple', 'breast', 'naked', 'nude', 'kiss', 'bed', 'moan'];
function looksExplicit(...texts: (string | undefined)[]): boolean {
  const low = texts.filter(Boolean).join(' ').toLowerCase();
  return R18_KW.some((k) => low.includes(k.toLowerCase()));
}

function charSeed(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h) % 999_999_999;
}

const ANCHOR_SYSTEM = `You are an expert Stable Diffusion prompt engineer for anime SD1.5 models (Meina v5 / DreamShaper).
Convert character visual fields (Thai or English) into a SD promptAnchor + negativeAnchor.

Rules for promptAnchor:
- Start with "1girl" or "1boy" based on gender
- Order: count, body type, age (e.g. "age 22"), hair description, eyes description, face features, bust (if female), distinctive marks, accessories always worn
- Booru-style English tags, comma-separated
- DO NOT include: pose, outfit, clothing, camera angle, lighting (these are scene-specific)
- AVOID "pink/red nipples" → use "natural nipples, soft pink areola"
- AVOID "shiny wet skin" → use "natural skin, dewy skin"
- Length: under 350 chars

Rules for negativeAnchor:
- Negate distinct traits: long hair → "short hair", large breasts → "flat chest", pointed ears → "round ears, no ears"
- Always include base: "deformed face, asymmetric face, painted nipples, neon nipples, plastic skin"
- Length: under 250 chars

Return JSON only:
{"promptAnchor": "...", "negativeAnchor": "..."}`;

const SCENE_SYSTEM = `You are an expert Stable Diffusion prompt engineer for Thai anime NSFW novels (Meina v5 SD1.5).
Given a Thai scene paragraph + character profiles + camera angle + intensity, output a full SD generation spec.

Rules:
1. Prepend ONLY the focus_character's promptAnchor at the start of positive
2. Non-focus characters: do NOT include their full promptAnchor. Instead, add a SHORT partial description tag (e.g. "muscular male hands visible, man's lap in foreground") so the composition shows them partially but doesn't conflict with focus_character's identity
3. NEGATIVE PROMPT — strict:
   - Include ONLY focus_character's negativeAnchor (one character)
   - Do NOT include non-focus characters' promptAnchor or negativeAnchor in the negative — that would conflict with the focus character (e.g. putting "long hair" in negative would erase the long-haired focus_character)
   - Add scene-level negatives: "(two faces:1.4), (multiple distinct faces:1.3), (painted nipples:1.4), (neon nipples:1.4), pasties, plastic skin"
3. Camera angle slug → SD tags:
   - "selfie": "selfie, looking at viewer, holding camera, POV camera, arm out of frame"
   - "phone-portrait": "cellphone photo quality, portrait orientation, candid pose"
   - "high-angle-hug": "high angle shot, from above, two people embracing, focus on woman's face, man seen from behind"
   - "mounting-top-down": "from above, high angle, man on top of woman, focus on woman's face, man's back visible"
   - "missionary-side": "side view, missionary position, woman lying on back legs apart, man between her legs from side"
   - "pov-oral": "POV shot from male perspective, looking down at her face, only male hands and lap visible"
   - "pov-cowgirl": "POV from below, woman riding on top of viewer, low angle"
   - "over-shoulder": "over the shoulder shot, partial shoulder of other character in foreground"
   - "close-up-face": "close-up shot, face focus, shallow depth of field"
   - "full-body": "full body shot"
   - "combat-low-angle": "low angle dynamic shot, action pose, dramatic lighting"
   - "combat-side-action": "side view action shot, mid-strike pose, motion lines"
4. Detect action/pose from the Thai narrative and include relevant booru tags (e.g. "kneeling, leaning forward, mouth around penis, fellatio, hand on shaft")
5. Multi-char negatives: always add "(two faces:1.4), (multiple distinct faces:1.3)"
6. Faceless extras > 0: add "{n} faceless men, out of frame faces" + negative "(faces of side characters:1.5)"
7. R18 anti-artifact (ALWAYS):
   - prompt avoids: "pink nipples", "shiny wet skin", "glistening"
   - negative includes: "(painted nipples:1.4), (neon nipples:1.4), pasties, plastic skin"
8. Quality boosters at end: "masterpiece, best quality, absurdres, ultra detailed"
9. Suggest pose preset cn_path — IMPORTANT: must be an EXACT path from "Available pose presets" list given by user. If none fit, return null. DO NOT invent or modify any path.
10. Recommend model based on stylePreference of focus_character

Return JSON only:
{
  "positive": "...",
  "negative": "...",
  "suggested_pose": "poses/xxx.png" | null,
  "camera_angle_resolved": "...",
  "reasoning": "Thai 1-2 sentences",
  "model": "meinahentai_v5Final.safetensors" | "DreamShaper_8_pruned.safetensors",
  "size": {"w": 512, "h": 768},
  "steps": 24,
  "cfg": 7
}`;

// ระบบช่วย "ขยายงานเขียน": ผู้เขียนให้เนื้อเรื่อง+บทพูด AI เสริมบรรยายฉาก/แอ็กชัน
const EXPAND_SYSTEM = `คุณเป็นนักเขียนนิยายไทยมืออาชีพ หน้าที่คือ "ขยาย" ข้อความต้นฉบับของผู้เขียนให้เป็นร้อยแก้วที่เห็นภาพและมีชีวิตขึ้น
กฎเหล็ก:
- คงบทพูด (ข้อความในเครื่องหมายคำพูด) และใจความเดิมไว้ทั้งหมด ห้ามแต่งเหตุการณ์ใหม่หรือเปลี่ยนสิ่งที่เกิดขึ้น
- เสริมเฉพาะรายละเอียดบรรยายตามโหมดที่สั่ง (ฉาก / แอ็กชัน-ท่าทาง / ขยายสำนวน)
- ถ้ามี "รายละเอียดจากรูปอ้างอิง" ให้ใช้เป็นแนวทางบรรยาย (ท่าทาง เสื้อผ้า ฉาก มุมมอง สีหน้า) แต่ห้ามเอ่ยชื่อ tag ตรงๆ ให้ร้อยเป็นภาษาเล่าเรื่องธรรมชาติ
- รักษาน้ำเสียง/บุคลิกตัวละครและสไตล์ของเรื่อง เคารพข้อห้าม (don'ts) ที่ให้มา
- ตอบกลับเป็นร้อยแก้วภาษาไทยล้วน ไม่ต้องอธิบาย ไม่ต้องใส่หัวข้อ/มาร์กดาวน์/คำนำ

=== นโยบายอายุ (กฎกลาง — ห้ามฝ่าฝืน) ===
${RULE_ADULT}

=== คำเรียกฉาก R18 (กฎกลาง — ใช้เมื่อต้นฉบับเป็นฉากผู้ใหญ่) ===
${RULE_R18_LEXICON}`;

type Provider = 'openrouter' | 'deepseek' | 'lmstudio';

// keyEnv ว่าง = ไม่ต้องใช้ API key (local เช่น LM Studio) → ถือว่า available เสมอ
const PROVIDER_CONFIG: Record<Provider, { url: string; defaultModel: string; keyEnv: string }> = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat-v3-0324',
    keyEnv: 'OPENROUTER_API_KEY',
  },
  deepseek: {
    url: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY',
  },
  // LM Studio (local, OpenAI-compatible) — ไม่ต้องมี key, รัน Gemma local ได้
  lmstudio: {
    url: process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1/chat/completions',
    defaultModel: process.env.LMSTUDIO_MODEL ?? 'gemma-4-e4b-it-uncensored',
    keyEnv: '',
  },
};

const ALL_PROVIDERS: Provider[] = ['openrouter', 'deepseek', 'lmstudio'];
const isProvider = (s?: string): s is Provider => !!s && (ALL_PROVIDERS as string[]).includes(s);

const DEFAULT_PROVIDER: Provider = isProvider(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : 'openrouter';

function providerAvailable(p: Provider): boolean {
  const cfg = PROVIDER_CONFIG[p];
  return cfg.keyEnv ? !!process.env[cfg.keyEnv] : true; // keyless = local = พร้อมเสมอ
}

function resolveProvider(req?: string): Provider {
  if (isProvider(req)) {
    if (!providerAvailable(req)) {
      throw new Error(`provider "${req}" requested but ${PROVIDER_CONFIG[req].keyEnv} not set`);
    }
    return req;
  }
  if (providerAvailable(DEFAULT_PROVIDER)) return DEFAULT_PROVIDER;
  const fallback = ALL_PROVIDERS.find((p) => p !== DEFAULT_PROVIDER && providerAvailable(p));
  if (fallback) return fallback;
  throw new Error('no provider available (set OPENROUTER_API_KEY / DEEPSEEK_API_KEY or run LM Studio)');
}

// provider สำหรับใส่ log ตอน error — ห้าม throw ซ้ำใน catch (เช่นกรณี error ต้นทางคือ "no provider available")
function providerForLog(req?: string): string {
  try { return resolveProvider(req); } catch { return req ?? 'unknown'; }
}

async function callAI(payload: {
  model?: string;
  system?: string;
  user: string;
  temperature?: number;
  max_tokens?: number;
  provider?: string;
  prefill?: string;   // assistant prefix — บังคับโมเดล "เขียนต่อ" จากท่อนนี้ ลด soft-refusal/การเลี่ยงคำ
  history?: { role: 'user' | 'assistant'; content: string }[];   // ประวัติสนทนา (โหมดแชทหลายเทิร์น)
}) {
  const provider = resolveProvider(payload.provider);
  const cfg = PROVIDER_CONFIG[provider];
  const apiKey = cfg.keyEnv ? process.env[cfg.keyEnv]! : 'lm-studio'; // local ไม่เช็ค key (ส่ง dummy)

  const messages: any[] = [];
  if (payload.system) messages.push({ role: 'system', content: payload.system });
  if (payload.history?.length) messages.push(...payload.history);
  messages.push({ role: 'user', content: payload.user });

  // prefill / prefix completion
  let url = cfg.url;
  if (payload.prefill) {
    if (provider === 'deepseek') {
      // DeepSeek Chat Prefix Completion (Beta): ต้องใช้ base /beta + prefix:true ที่ message สุดท้าย
      url = 'https://api.deepseek.com/beta/chat/completions';
      messages.push({ role: 'assistant', content: payload.prefill, prefix: true });
    } else {
      messages.push({ role: 'assistant', content: payload.prefill });
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000';
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME ?? 'NovelR18';
  }

  const model = payload.model ?? cfg.defaultModel;
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: payload.temperature ?? 0.9,
    max_tokens: payload.max_tokens ?? 1200,
  };
  // DeepSeek V4 (flash/pro) เปิด thinking เป็น default → token ถูกเผาเป็น reasoning จน content ว่าง
  // แอปนี้ต้องการตอบเร็ว/ตรง ไม่ใช้ reasoning — ปิดเสมอ (ref: api-docs.deepseek.com/guides/thinking_mode)
  if (provider === 'deepseek' && model.includes('v4')) body.thinking = { type: 'disabled' };

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${provider} ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  // prefill เป็น assistant prefix ที่โมเดล "เขียนต่อ" — response คืนเฉพาะส่วนต่อ ไม่รวม prefix
  // ต้อง prepend กลับ ไม่งั้นประโยคเปิดที่ผู้ใช้กำหนดจะหายไป (output ขึ้นต้นกลางประโยค)
  const completion = json.choices?.[0]?.message?.content ?? '';
  return {
    provider,
    text: payload.prefill ? payload.prefill + completion : completion,
    usage: json.usage,
    model: json.model,
  };
}

// บังคับ state tag: ถ้าโมเดล (โดยเฉพาะ DeepSeek cloud) ลืมปิดท้ายด้วย [[state:]] → เรียกซ้ำแบบถูก ๆ
// ขอ "เฉพาะบรรทัดแท็ก" จากฉากที่เพิ่งเขียน (ไม่แตะเนื้อเรื่องเดิม) ใช้ prefill '[[state:' บังคับฟอร์แมต
async function ensureStateTag(reply: string, prev: StateCard | null | undefined, provider?: string): Promise<string> {
  if (/\[\[\s*state\s*:/i.test(reply)) return reply;   // มีแท็กแล้ว — ไม่ต้องเรียกซ้ำ
  try {
    const system = 'คุณเป็นตัวแยกข้อมูลสถานะของเกมโรลเพลย์ หน้าที่: อ่าน "บัตรสถานะก่อนหน้า" + "ฉากที่เพิ่งเกิด" แล้วสรุป "เฉพาะสิ่งที่เปลี่ยนจริงในฉากนี้" เป็นแท็กบรรทัดเดียว ตอบเฉพาะแท็ก ห้ามมีคำอธิบายหรืออย่างอื่น';
    const user =
      `บัตรสถานะก่อนหน้า:\n${renderStateCard(prev) || '(ยังไม่มี)'}\n\n` +
      `ฉากที่เพิ่งเกิด:\n${reply}\n\n` +
      'สรุปสิ่งที่เปลี่ยนเป็นแท็กเดียว รูปแบบ [[state: คีย์=ค่า; คีย์=ค่า]] — ⚠️ คั่นแต่ละคีย์ด้วยเครื่องหมาย ; เสมอ. ' +
      'คีย์ตั้งค่า: time= location= outfit= form= alias= gender= disguised=true/false realname= ; คีย์รายการ: +inv= -inv= +cond= -cond= +power= -power= +fact= ' +
      '(cond=สภาพกายเท่านั้น ห้ามเอาอารมณ์มาใส่ · ใส่เฉพาะคีย์ที่เปลี่ยนจริง). ' +
      'ตัวอย่าง: [[state: time=เช้า; location=สวนหลังคฤหาสน์; outfit=ชุดบางๆ]] · ถ้าไม่มีอะไรเปลี่ยนเลยตอบ [[state: none]]';
    const r = await callAI({ system, user, provider, prefill: '[[state:', temperature: 0.2, max_tokens: 120 });
    const firstLine = r.text.trim().split('\n')[0].trim();
    const closed = firstLine.match(/\[\[\s*state\s*:[\s\S]*?\]\]/i);
    if (closed) return reply.trimEnd() + '\n' + closed[0];
    // เผื่อโมเดลไม่ปิด ]] — เติมให้
    if (/^\[\[\s*state\s*:/i.test(firstLine)) return reply.trimEnd() + '\n' + (/\]\]\s*$/.test(firstLine) ? firstLine : firstLine + ']]');
  } catch { /* เงียบ — ปล่อยให้ไม่มีแท็ก ดีกว่าทำคำตอบพัง */ }
  return reply;
}

/* ============================================================
   AI Prompt Logger
   ============================================================ */

function extractPromptMeta(system: string, user: string) {
  const has = (s: string) => system.includes(s);

  // Count locations: find section, stop at next === header or end
  const locMatch = system.match(/=== สถานที่[\s\S]*?(?=\n===|$)/);
  const locationCount = locMatch ? (locMatch[0].match(/\n\[/g)?.length ?? 0) : 0;

  // Count characters: รองรับ 2 ฟอร์แมต — roleplay XML (<char>/<sup_char>) และ legacy markdown (\n[ ... ])
  const xmlChars = (system.match(/<(?:char|sup_char)\s+name=/g) ?? []).length; // เฉพาะ tag จริง (มี name=) ไม่ใช่ <char> ตัวอย่างใน rules
  const charMatch = system.match(/=== ตัวละคร[\s\S]*?(?:กฎการ keep|(?=\n===)|$)/);
  const bracketChars = charMatch ? (charMatch[0].match(/\n\[/g)?.length ?? 0) : 0;
  const characterCount = xmlChars || bracketChars;

  // Detect mode from the === Mode: ... === section header (avoid false positives from R18 mentions in dontList/worldRules)
  let mode = 'novel';
  if (system.includes('Mode: R18 explicit')) mode = 'r18';
  else if (system.includes('Mode: เน้นบทพูด')) mode = 'dialogue';
  else if (system.includes('Mode: นิยาย')) mode = 'novel';

  // List all === section === headers
  const sections = (system.match(/===.+===/g) || []).map((s) => s.replace(/===/g, '').trim());

  return {
    promptChars: system.length,
    userChars: user.length,
    hasLocations: has('สถานที่ในเรื่อง'),
    locationCount,
    hasStyleGuide: has('Style Guide'),
    hasWorldRules: has('กฎของโลก') || /<rules>/.test(system) || has('=== โลก/setting'),
    hasDontList: has("Do / Don't"),
    hasContinuity: has('สถานะปัจจุบัน'),
    hasVocab: has('Vocabulary Palette'),
    hasCharacters: has('ตัวละคร (AI ต้อง keep character') || /<(?:char|sup_char)\b/.test(system) || has('=== ตัวเอก'),
    characterCount,
    mode,
    sections,
  };
}

async function logCall(data: {
  endpoint: string;
  system: string;
  user: string;
  response: string;
  provider: string;
  model: string;
  usage: any;
  temperature: number;
  maxTokens: number;
  ok: boolean;
  error?: string;
  ms: number;
}) {
  try {
    const db = await getDb();
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await db.collection(LOG_COLLECTION).insertOne({
      _id: id as any,
      ts: new Date(),
      ...data,
      meta: extractPromptMeta(data.system, data.user),
    });
  } catch (e) {
    console.error('[ai_log] write failed:', (e as any).message);
  }
}

// SD prompt builder สำหรับฉากแชท (ChatChar + ฉากไทย → booru อังกฤษ) — Illustrious/SDXL
const CHAT_SCENE_SD_SYSTEM = `You are an expert Stable Diffusion prompt engineer for an anime Illustrious/SDXL model.
Convert a character profile + a Thai roleplay scene into a booru-style English image prompt.

Output JSON ONLY: {"positive": "...", "negative": "..."}

positive rules:
- Start with: masterpiece, best quality, absurdres, ultra detailed
- Character identity (translate the Thai profile into booru tags): count (1girl/1boy), race/species, ears, hair length+color+style, eye color, skin, notable face features, body proportions (breast size, waist, hips, butt)
- ⚠️ DISGUISE OVERRIDE: if the "story so far / scene" indicates the character is currently disguised, transformed, or shapeshifted (different hair color, different race/ears, hidden marks, human-passing form, masked, etc.), build the VISIBLE identity tags from that DISGUISED appearance — NOT the true profile. Draw what others would see in this scene. Only use the true profile's identity when the scene shows the true form revealed.
- Outfit: use the profile's default outfit BUT adjust to the scene — if the scene shows clothes removed/opened/changed/damaged, reflect that exact state instead (e.g. open robe, topless, nude, clothes pulled aside)
- Scene: derive pose, action, interaction with viewer, facial expression, gaze, and any explicit acts from the Thai scene; add the matching booru tags
- Setting & camera: location, time of day, lighting, mood, and camera angle (pov / from above / etc.) from the scene
- Comma-separated booru tags, English only, ~50-80 tags max
negative rules:
- Always include: (worst quality, low quality:1.4), lowres, bad anatomy, bad hands, extra digits, deformed face, text, watermark, signature, child, loli, multiple views
NSFW is allowed (adult fiction, all characters 18+); use explicit booru tags when the scene is explicit.
Return JSON only, no commentary.`;

// จับเวลาแต่ละ request ด้วย WeakMap keyed by Request (ปลอดภัยกับ concurrency)
const reqStart = new WeakMap<Request, number>();

const app = new Elysia()
  // --- request log: stamp เวลาเริ่ม แล้ว log ตอนตอบเสร็จ ---
  .onRequest(({ request }) => {
    reqStart.set(request, Date.now());
  })
  .onAfterResponse(({ request, set, path }) => {
    const start = reqStart.get(request);
    reqStart.delete(request);
    const status = typeof set.status === 'number' ? set.status : 200;
    logRequest({
      method: request.method,
      path: path ?? new URL(request.url).pathname,
      status,
      ms: start ? Date.now() - start : undefined,
    });
  })
  // --- static HTML ---
  .get('/', () => Bun.file('./novel.html'))
  .get('/novel.html', () => Bun.file('./novel.html'))

  // --- health ---
  .get('/api/health', async () => {
    try {
      const db = await getDb();
      await db.command({ ping: 1 });
      return { ok: true, db: db.databaseName };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- workspace state (whole app state JSON) ---
  .get('/api/state', async () => {
    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne({ _id: STATE_ID as any });
    if (!doc?.state) return null;
    // แนบ __rev ไปกับ state เพื่อให้ client ส่งกลับมาตอน PUT (optimistic locking)
    return { ...doc.state, __rev: doc.rev ?? 0 };
  })
  // PUT แบบ optimistic locking: เขียนทับได้เฉพาะเมื่อ rev ตรงกับที่ client โหลดไป
  // กัน autosave ของแท็บเก่า/สคริปต์ background เขียนทับข้อมูลใหม่
  .put('/api/state', async ({ body, set }) => {
    const db = await getDb();
    const col = db.collection(COLLECTION);
    const incoming = { ...(body as any) };
    const baseRev = incoming.__rev;
    delete incoming.__rev;

    const existing = await col.findOne({ _id: STATE_ID as any }, { projection: { rev: 1 } });
    if (!existing) {
      // ยังไม่มี state — สร้างครั้งแรก
      await col.updateOne({ _id: STATE_ID as any }, { $set: { state: incoming, updatedAt: new Date(), rev: 1 } }, { upsert: true });
      logActivity('state.create', STATE_ID, { rev: 1 });
      return { ok: true, rev: 1 };
    }
    const hasRev = existing.rev !== undefined && existing.rev !== null;
    const cur = hasRev ? existing.rev : 0;
    if (baseRev !== cur) {
      set.status = 409;
      logActivity('state.conflict', STATE_ID, { clientRev: baseRev, serverRev: cur });
      return { ok: false, conflict: true, currentRev: cur, error: `rev mismatch (client=${baseRev}, server=${cur})` };
    }
    // doc legacy อาจไม่มี field rev → ต้อง match ด้วย $exists:false ไม่ใช่ rev:0
    const revFilter = hasRev ? { rev: cur } : { rev: { $exists: false } };
    const r = await col.updateOne(
      { _id: STATE_ID as any, ...revFilter },
      { $set: { state: incoming, updatedAt: new Date() }, $inc: { rev: 1 } },
    );
    if (r.matchedCount === 0) {
      const d = await col.findOne({ _id: STATE_ID as any }, { projection: { rev: 1 } });
      set.status = 409;
      logActivity('state.conflict', STATE_ID, { clientRev: baseRev, serverRev: d?.rev ?? 0, phase: 'write' });
      return { ok: false, conflict: true, currentRev: d?.rev ?? 0, error: 'rev changed during write' };
    }
    logActivity('state.save', STATE_ID, { fromRev: cur, toRev: cur + 1 });
    return { ok: true, rev: cur + 1 };
  })

  // --- chat state (ระบบแชท RP — doc 'chat' เก็บเฉพาะ meta: chars+items; sessions แยก doc ละอันใน chat_sessions) ---
  .get('/api/chat-state', async () => {
    const db = await getDb();
    const col = db.collection(COLLECTION);
    const doc = await col.findOne({ _id: CHAT_STATE_ID as any });
    if (!doc?.state) return null;
    // migrate ครั้งเดียว: ฟอร์แมตเก่าเก็บ sessions ปนใน doc เดียว (ชนเพดาน 16MB + PUT หนัก) → ย้ายออก
    const legacy: any[] = doc.state.sessions ?? [];
    if (legacy.length) {
      const sessCol = db.collection(CHAT_SESSIONS_COLLECTION);
      for (const s of legacy) {
        if (!s?.id) continue;
        await sessCol.updateOne(
          { _id: s.id as any },
          { $setOnInsert: { session: s, rev: 1, updatedAt: new Date() } },
          { upsert: true },
        );
      }
      await col.updateOne({ _id: CHAT_STATE_ID as any }, { $unset: { 'state.sessions': '' } });
      logActivity('chat.migrate-sessions', CHAT_STATE_ID, { count: legacy.length });
    }
    const { sessions: _legacy, ...meta } = doc.state;
    return { ...meta, __rev: doc.rev ?? 0 };
  })
  .put('/api/chat-state', async ({ body, set }) => {
    const db = await getDb();
    const col = db.collection(COLLECTION);
    const incoming = { ...(body as any) };
    const baseRev = incoming.__rev;
    delete incoming.__rev;
    const existing = await col.findOne({ _id: CHAT_STATE_ID as any }, { projection: { rev: 1 } });
    if (!existing) {
      await col.updateOne({ _id: CHAT_STATE_ID as any }, { $set: { state: incoming, updatedAt: new Date(), rev: 1 } }, { upsert: true });
      return { ok: true, rev: 1 };
    }
    const hasRev = existing.rev !== undefined && existing.rev !== null;
    const cur = hasRev ? existing.rev : 0;
    if (baseRev !== cur) {
      set.status = 409;
      return { ok: false, conflict: true, currentRev: cur, error: `rev mismatch (client=${baseRev}, server=${cur})` };
    }
    const revFilter = hasRev ? { rev: cur } : { rev: { $exists: false } };
    const r = await col.updateOne(
      { _id: CHAT_STATE_ID as any, ...revFilter },
      { $set: { state: incoming, updatedAt: new Date() }, $inc: { rev: 1 } },
    );
    if (r.matchedCount === 0) {
      const d = await col.findOne({ _id: CHAT_STATE_ID as any }, { projection: { rev: 1 } });
      set.status = 409;
      return { ok: false, conflict: true, currentRev: d?.rev ?? 0, error: 'rev changed during write' };
    }
    return { ok: true, rev: cur + 1 };
  })

  // --- chat sessions (doc ละ session — เซฟ/โหลดเฉพาะอันที่เปลี่ยน ไม่ต้องส่งทุกแชททุกครั้ง) ---
  .get('/api/chat-sessions', async () => {
    const db = await getDb();
    const docs = await db.collection(CHAT_SESSIONS_COLLECTION).find({}).toArray();
    return docs.map((d: any) => ({ ...d.session, __rev: d.rev ?? 0 }));
  })
  .put('/api/chat-session/:id', async ({ params, body, set }) => {
    const db = await getDb();
    const col = db.collection(CHAT_SESSIONS_COLLECTION);
    const incoming = { ...(body as any) };
    const baseRev = incoming.__rev;
    delete incoming.__rev;
    if (incoming.id !== params.id) return { ok: false, error: `session id mismatch (body=${incoming.id}, url=${params.id})` };
    const existing = await col.findOne({ _id: params.id as any }, { projection: { rev: 1 } });
    if (!existing) {
      await col.updateOne({ _id: params.id as any }, { $set: { session: incoming, updatedAt: new Date(), rev: 1 } }, { upsert: true });
      return { ok: true, rev: 1 };
    }
    const cur = existing.rev ?? 0;
    if (baseRev !== cur) {
      set.status = 409;
      return { ok: false, conflict: true, currentRev: cur, error: `rev mismatch (client=${baseRev}, server=${cur})` };
    }
    const r = await col.updateOne(
      { _id: params.id as any, rev: cur },
      { $set: { session: incoming, updatedAt: new Date() }, $inc: { rev: 1 } },
    );
    if (r.matchedCount === 0) {
      const d = await col.findOne({ _id: params.id as any }, { projection: { rev: 1 } });
      set.status = 409;
      return { ok: false, conflict: true, currentRev: d?.rev ?? 0, error: 'rev changed during write' };
    }
    return { ok: true, rev: cur + 1 };
  })
  .delete('/api/chat-session/:id', async ({ params }) => {
    const db = await getDb();
    await db.collection(CHAT_SESSIONS_COLLECTION).deleteOne({ _id: params.id as any });
    return { ok: true };
  })

  // --- export ground-truth markdown (storyline/character/event) ลง disk จาก state ใน Mongo ---
  .post('/api/export-md', async ({ body }) => {
    const b = (body ?? {}) as { storyId?: string; dir?: string };
    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne({ _id: STATE_ID as any });
    const state = doc?.state as { stories?: Record<string, Story>; activeStoryId?: string } | undefined;
    if (!state?.stories) return { ok: false, error: 'ไม่พบ state.stories ใน MongoDB' };
    try {
      const [id, story] = pickStory(state.stories, state.activeStoryId ?? '', b.storyId);
      const dir = b.dir ?? process.cwd();
      const files = await writeStoryMd(story, dir);
      logActivity('state.exportMd', id, { dir, files: files.length });
      return { ok: true, storyId: id, storyName: story.name ?? '', dir, files };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- user dictionary ---
  .get('/api/dict', async () => {
    const db = await getDb();
    const doc = await db.collection(COLLECTION).findOne({ _id: DICT_ID as any });
    return doc?.words ?? [];
  })
  .put('/api/dict', async ({ body }) => {
    const db = await getDb();
    await db.collection(COLLECTION).updateOne(
      { _id: DICT_ID as any },
      { $set: { words: body, updatedAt: new Date() } },
      { upsert: true },
    );
    logActivity('dict.save', DICT_ID, { count: Array.isArray(body) ? body.length : undefined });
    return { ok: true };
  })

  // --- static setup wizard ---
  .get('/setup', () => Bun.file('./setup.html'))
  .get('/setup.html', () => Bun.file('./setup.html'))

  // --- provider info / availability ---
  .get('/api/providers', () => {
    return {
      default: DEFAULT_PROVIDER,
      available: {
        openrouter: providerAvailable('openrouter'),
        deepseek: providerAvailable('deepseek'),
        lmstudio: providerAvailable('lmstudio'),
      },
      models: {
        openrouter: PROVIDER_CONFIG.openrouter.defaultModel,
        deepseek: PROVIDER_CONFIG.deepseek.defaultModel,
        lmstudio: PROVIDER_CONFIG.lmstudio.defaultModel,
      },
    };
  })

  // --- AI prompt logs ---
  .get('/api/logs', async ({ query }) => {
    try {
      const db = await getDb();
      const limit = Math.min(Number(query?.limit ?? 50), 200);
      const skip = Number(query?.skip ?? 0);
      const docs = await db
        .collection(LOG_COLLECTION)
        .find({})
        .sort({ ts: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      // Return list with truncated prompts to keep response small
      return docs.map((d) => ({
        id: d._id,
        ts: d.ts,
        endpoint: d.endpoint,
        provider: d.provider,
        model: d.model,
        ok: d.ok,
        error: d.error,
        ms: d.ms,
        meta: d.meta,
        systemPreview: (d.system || '').slice(0, 200),
        userPreview: (d.user || '').slice(0, 200),
        responsePreview: (d.response || '').slice(0, 200),
      }));
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  .get('/api/logs/:id', async ({ params }) => {
    try {
      const db = await getDb();
      const doc = await db.collection(LOG_COLLECTION).findOne({ _id: params.id as any });
      if (!doc) return { ok: false, error: 'not found' };
      return { ok: true, log: doc };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  .delete('/api/logs', async () => {
    try {
      const db = await getDb();
      const result = await db.collection(LOG_COLLECTION).deleteMany({});
      return { ok: true, deleted: result.deletedCount };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- AI generate (Khui-style roleplay) ---
  .post('/api/generate-roleplay', async ({ body }) => {
    const b = body as {
      context: NovelContext;
      user_input: string;
      model?: string;
      provider?: string;
      temperature?: number;
      max_tokens?: number;
      prefill?: string;   // assistant prefix — ลด soft-refusal/การเลี่ยงคำ, บังคับให้เขียนต่อจากท่อนนี้
    };
    if (!b?.context?.protagonist || !b?.context?.setting || !b?.context?.eventCurrent) {
      return { ok: false, error: 'context.protagonist, context.setting, context.eventCurrent are required' };
    }
    if (!b?.user_input) return { ok: false, error: 'missing "user_input"' };
    const t0 = Date.now();
    try {
      const system = assembleSystemPrompt(b.context);
      const max_tokens = b.max_tokens ?? (b.context.mode === 'dialogue' ? 1200 : 2500);
      // anti-drift: ย้ำกฎสำคัญท้าย user message (recency) — กันเสียง/ชุด/ฟอร์แมตหลุดตอน prose ยาว
      const userMsg = `${b.user_input}\n\n${buildNovelReminder(b.context)}`;
      const out = await callAI({
        system,
        user: userMsg,
        model: b.model,
        provider: b.provider,
        temperature: b.temperature ?? 0.85,
        max_tokens,
        prefill: b.prefill,
      });
      const ms = Date.now() - t0;
      logCall({
        endpoint: 'generate-roleplay',
        system,
        user: userMsg,
        response: out.text,
        provider: out.provider,
        model: out.model ?? '',
        usage: out.usage,
        temperature: b.temperature ?? 0.85,
        maxTokens: max_tokens,
        ok: true,
        ms,
      }).catch(() => {});
      // structured state (opt-in): ถ้า caller ส่ง context.stateCard มา → บังคับแท็ก + พาร์ส delta + เช็ค contradiction (เหมือนแชท)
      if (b.context.stateCard) {
        const withTag = await ensureStateTag(out.text, b.context.stateCard, b.provider);
        const { cleaned, next, delta, warnings } = processChatState(withTag, b.context.stateCard);
        return { ok: true, ...out, text: cleaned, stateCard: next, stateDelta: delta, stateWarnings: warnings, prompt_chars: system.length };
      }
      return { ok: true, ...out, prompt_chars: system.length };
    } catch (e: any) {
      const ms = Date.now() - t0;
      logCall({
        endpoint: 'generate-roleplay',
        system: assembleSystemPrompt(b.context),
        user: b.user_input,
        response: '',
        provider: providerForLog(b.provider),
        model: '',
        usage: null,
        temperature: b.temperature ?? 0.85,
        maxTokens: b.max_tokens ?? 2500,
        ok: false,
        error: e.message,
        ms,
      }).catch(() => {});
      return { ok: false, error: e.message };
    }
  })

  // --- AI chat (roleplay หลายเทิร์น, ตัวละครมี agency/ปฏิเสธได้) ---
  .post('/api/chat', async ({ body }) => {
    const b = body as {
      char: ChatCharLite;
      history?: { role: 'user' | 'char'; content: string }[];
      user_input: string;
      rel?: number;
      summary?: string;
      lore?: string[];   // lorebook ที่ client เลือกมาแล้ว (keyword match) — แทรกใกล้ท้าย system prompt
      state?: string;    // บัตรสถานะปัจจุบัน (format เป็นข้อความแล้ว) — แทรกใกล้ท้าย system prompt (legacy/manual)
      stateCard?: StateCard;  // บัตรสถานะแบบ structured — ถ้าส่งมา: render เอง + สั่งโมเดลปล่อย [[state:]] delta + เช็ค contradiction
      playerPersona?: PlayerPersonaLite;  // บทบาทของผู้เล่นในแชทนี้ — ฉีดให้ตัวละครรู้จัก+โต้ตอบตามบท
      mode?: 'char' | 'narrator';
      recalled?: string[];   // RAG: ความทรงจำที่ client recall มาแล้ว — ฉีดเข้า prompt
      provider?: string;
      prefill?: string;
      temperature?: number;
      max_tokens?: number;
    };
    if (!b?.char?.name) return { ok: false, error: 'missing "char.name"' };
    if (!b?.user_input) return { ok: false, error: 'missing "user_input"' };
    const rel = Math.max(-100, Math.min(100, b.rel ?? 0));
    const t0 = Date.now();
    try {
      // local (Gemma) token น้อย — สั่งความยาวคำตอบสั้นลง ไม่ให้โดน max_tokens ตัดกลางประโยค
      const compact = resolveProvider(b.provider) === 'lmstudio';
      // structured state: ถ้า client ส่ง stateCard มา → render เป็นข้อความเอง + เปิดโหมดให้โมเดลปล่อย [[state:]] delta
      // (เฉพาะ char mode — narrator ไม่ต้องติดตามสถานะตัวละคร)
      const trackState = !!b.stateCard && b.mode !== 'narrator';
      // ฉีดทั้ง "live state" (structured อัปเดตทุกเทิร์น) + legacy text (จาก extractState ฝั่ง client) ถ้ามีทั้งคู่
      const liveText = b.stateCard ? renderStateCard(b.stateCard) : undefined;
      const stateText = [liveText, b.state].filter(Boolean).join('\n') || undefined;
      const system = b.mode === 'narrator'
        ? assembleNarratorPrompt(b.char, b.summary, compact, b.lore, stateText, b.playerPersona)
        : assembleChatPrompt(b.char, rel, b.summary, compact, b.lore, stateText, trackState, b.playerPersona, b.recalled);
      const history = (b.history ?? []).map((m) => ({
        role: m.role === 'char' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));
      // กัน persona drift: แทรกเตือนความจำ "ใกล้ท้าย" prompt ทุกเทิร์น (recency bias — ตำแหน่งท้ายมีอิทธิพลสูงสุด)
      // เป็น server-side เท่านั้น ไม่ถูกเก็บลง history ฝั่ง client
      const reminder = buildPersonaReminder(b.char, rel, b.mode === 'narrator' ? 'narrator' : 'char', trackState, b.playerPersona);
      // nudge ท้าย user message: ดันให้แท็ก [[state:]] เป็นสิ่งสุดท้ายที่โมเดลเห็น (recency) — cloud อย่าง DeepSeek ลืมใส่บ่อยถ้าไม่ย้ำท้ายสุด
      const stateNudge = trackState ? '\n\n[ระบบ: ปิดท้ายคำตอบนี้ด้วยบรรทัด [[state: ...]] เสมอ — สรุปเฉพาะสิ่งที่เปลี่ยน หรือ [[state: none]] ถ้าไม่เปลี่ยน]' : '';
      // explicit nudge: เฉพาะฉาก R18 (char mode) — "แซนด์วิช" คำสั่ง lexicon ท้ายสุด (recency) ดันให้ Gemma เลิกเลี่ยงคำ. ทดสอบแล้วได้ผลเฉพาะเมื่อมีทั้ง reminder+nudge (สูตร D)
      const lexNudge = (b.mode !== 'narrator' && looksExplicit(b.user_input, b.history?.slice(-1)[0]?.content))
        ? '\n\n[ระบบ R18: ฉากนี้ถึงจุดสัมผัส/ออรัล/สอดใส่ — เรียกอวัยวะด้วยคำดิบทันที (ชาย: ควย/หัวควย · หญิง: หี/เม็ดแตด · หัวนม/นม/ตูด · เสร็จ: แตก/น้ำเงี่ยน) ห้ามเลี่ยงเป็น ความร้อน/ตรงนั้น/ส่วนนั้น/เติมเต็ม/จุดศูนย์กลาง/แก่นกาย/ระหว่างขา แม้ตัวละครจะฝืนใจ. ตัวอย่างระดับความดิบที่ต้องการ: *เธอครางลั่นเมื่อควยเสียบหีจนมิด* "อา...เข้ามาอีกสิ"]'
        : '';
      const userMsg = `${reminder}\n\n${b.user_input}${lexNudge}${stateNudge}`;
      const max_tokens = b.max_tokens ?? 700;
      const out = await callAI({
        system,
        user: userMsg,
        history,
        provider: b.provider,
        prefill: b.prefill,
        temperature: b.temperature ?? 0.9,
        max_tokens,
      });
      logCall({
        endpoint: 'chat', system, user: userMsg, response: out.text,
        provider: out.provider, model: out.model ?? '', usage: out.usage,
        temperature: b.temperature ?? 0.9, maxTokens: max_tokens, ok: true, ms: Date.now() - t0,
      }).catch(() => {});
      // structured state: พาร์ส delta จากท้ายคำตอบ → strip ออก → apply → เช็ค contradiction (deterministic ไม่เรียก LLM)
      if (trackState) {
        // บังคับ state tag: ถ้าไม่มีแท็กในคำตอบ → เรียกซ้ำขอเฉพาะบรรทัดแท็ก (กัน DeepSeek ลืมใส่ ~24%)
        const withTag = await ensureStateTag(out.text, b.stateCard, b.provider);
        const { cleaned, next, delta, warnings } = processChatState(withTag, b.stateCard);
        return { ok: true, ...out, text: cleaned, stateCard: next, stateDelta: delta, stateWarnings: warnings };
      }
      return { ok: true, ...out };
    } catch (e: any) {
      logCall({
        endpoint: 'chat', system: '', user: b.user_input, response: '',
        provider: providerForLog(b.provider), model: '', usage: null,
        temperature: b.temperature ?? 0.9, maxTokens: b.max_tokens ?? 700, ok: false, error: e.message, ms: Date.now() - t0,
      }).catch(() => {});
      return { ok: false, error: e.message };
    }
  })

  // --- RAG memory: backfill (index session ทั้งก้อนครั้งเดียว — FTS ทันที + embedding best-effort) ---
  .post('/api/chat/memory/backfill', async ({ body }) => {
    const b = body as { scopeId: string; kind?: 'chat' | 'novel'; rows: Omit<MemRow, 'embedding' | 'kind'>[] };
    if (!b?.scopeId || !Array.isArray(b.rows)) return { ok: false, error: 'missing scopeId/rows' };
    try {
      const db = getMemDb();
      const rows: MemRow[] = b.rows.map((r) => ({ ...r, kind: b.kind ?? 'chat', embedding: null }));
      ingestMemory(db, rows);   // FTS sync ทันที (ฟรี/เร็ว) — ยังไม่ใส่ embedding
      const vecs = await embedTexts(rows.map((r) => r.text));   // embedding best-effort
      if (vecs) {
        const upd = db.prepare('UPDATE mem SET embedding = ? WHERE id = ?');
        const tx = db.transaction(() => rows.forEach((r, i) => {
          const v = vecs[i]; upd.run(Buffer.from(v.buffer, v.byteOffset, v.byteLength), r.id);
        }));
        tx();
      }
      return { ok: true, count: rows.length, embedded: !!vecs };
    } catch (e: any) { return { ok: false, error: e.message }; }
  })

  // --- RAG memory: ingest turn ใหม่ (เรียกหลังได้คำตอบ) ---
  .post('/api/chat/memory/ingest', async ({ body }) => {
    const b = body as { scopeId: string; kind?: 'chat' | 'novel'; rows: Omit<MemRow, 'embedding' | 'kind'>[] };
    if (!b?.scopeId || !Array.isArray(b.rows)) return { ok: false, error: 'missing scopeId/rows' };
    try {
      const db = getMemDb();
      const vecs = await embedTexts(b.rows.map((r) => r.text));
      const rows: MemRow[] = b.rows.map((r, i) => ({ ...r, kind: b.kind ?? 'chat', embedding: vecs ? vecs[i] : null }));
      ingestMemory(db, rows);
      return { ok: true, count: rows.length, embedded: !!vecs };
    } catch (e: any) { return { ok: false, error: e.message }; }
  })

  // --- RAG memory: recall (เรียกก่อน sendChat) — คืน top-K ข้อความความจำที่เกี่ยวข้อง ---
  .post('/api/chat/memory/recall', async ({ body }) => {
    const b = body as {
      scopeId: string; query: string; activeChar: string;
      mode?: 'char' | 'narrator'; excludeFromIdx: number; k?: number;
    };
    if (!b?.scopeId || !b?.query) return { ok: true, memories: [] };
    try {
      const db = getMemDb();
      const queryVec = await embedOne(b.query);
      const hits = recall(db, {
        scopeId: b.scopeId, query: b.query, queryVec, activeChar: b.activeChar,
        narratorMode: b.mode === 'narrator', excludeFromIdx: b.excludeFromIdx ?? 0, k: b.k ?? 4, wFts: 0.5, wVec: 0.5,
      });
      // budget ~600 token ≈ ตัด text ที่ยาวเกิน 400 ตัวอักษร/ก้อน
      const memories = hits.map((h) => `[เทิร์น ${h.turnIdx}] ${h.text.slice(0, 400)}`);
      return { ok: true, memories };
    } catch (e: any) { return { ok: false, error: e.message, memories: [] }; }
  })

  // --- AI: ฉากแชท → SD prompt (อังกฤษ) → ComfyUI → รูปประกอบ ---
  .post('/api/chat/scene-image', async ({ body }) => {
    const b = body as {
      char: { name: string; appearance?: string; outfit?: string; description?: string };
      sceneText: string;
      summary?: string;
      sessionId?: string;
      provider?: string;
      model?: string;
      width?: number; height?: number; steps?: number; cfg?: number;
    };
    if (!b?.char?.name || !b?.sceneText) return { ok: false, error: 'char.name + sceneText required' };
    const t0 = Date.now();
    try {
      const c = b.char;
      const userMsg =
        `Character profile (TRUE identity):\nname: ${c.name}\nappearance: ${c.appearance ?? ''}\ndefault outfit: ${c.outfit ?? ''}\nextra: ${c.description ?? ''}\n\n` +
        `${b.summary?.trim() ? `Story so far (for current state / disguise — what the character looks like RIGHT NOW may differ from the true profile):\n${b.summary.trim()}\n\n` : ''}` +
        `Scene (Thai):\n${b.sceneText}\n\nApply the DISGUISE OVERRIDE rule using the story-so-far + scene. Build the image prompt JSON.`;
      const out = await callAI({ system: CHAT_SCENE_SD_SYSTEM, user: userMsg, provider: b.provider, temperature: 0.5, max_tokens: 800 });
      let parsed: any = null;
      try { const m = out.text.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : out.text); }
      catch { return { ok: false, error: 'LLM returned non-JSON', raw: out.text.slice(0, 300) }; }
      if (!parsed?.positive) return { ok: false, error: 'no positive prompt from LLM' };

      const img = await generateComfyUI({
        prompt: parsed.positive,
        negative_prompt: parsed.negative,
        model: b.model ?? 'wai_illustrious_v17.safetensors',
        book: 'chat', ch: b.sessionId || 'session',
        width: b.width ?? 832, height: b.height ?? 1216,
        steps: b.steps ?? 28, cfg_scale: b.cfg ?? 5,
      } as any);

      logCall({
        endpoint: 'chat/scene-image', system: CHAT_SCENE_SD_SYSTEM, user: userMsg, response: parsed.positive,
        provider: out.provider, model: out.model ?? '', usage: out.usage, temperature: 0.5, maxTokens: 800,
        ok: true, ms: Date.now() - t0,
      }).catch(() => {});
      return { ok: true, url: (img as any).url, prompt: parsed.positive, negative: parsed.negative };
    } catch (e: any) {
      logCall({
        endpoint: 'chat/scene-image', system: CHAT_SCENE_SD_SYSTEM, user: b.sceneText, response: '',
        provider: providerForLog(b.provider), model: '', usage: null, temperature: 0.5, maxTokens: 800,
        ok: false, error: e.message, ms: Date.now() - t0,
      }).catch(() => {});
      return { ok: false, error: e.message };
    }
  })

  // --- AI สร้าง "บทบาทผู้เล่น" ที่เข้ากับฉากของตัวละคร (player persona auto-fill) ---
  .post('/api/chat/generate-persona', async ({ body }) => {
    const b = body as { char?: { name?: string; appearance?: string; description?: string; scenario?: string }; provider?: string };
    const c = b?.char;
    if (!c?.name) return { ok: false, error: 'char.name required' };
    const system =
      'คุณคือผู้ช่วยออกแบบ "บทบาทของผู้เล่น" สำหรับเล่นโรลเพลย์กับตัวละครที่กำหนด. ' +
      'สร้างตัวตนของ "ผู้เล่น" (อีกฝ่ายที่จะคุยกับตัวละครนี้) ให้เข้ากับฉาก/สถานการณ์ของตัวละครอย่างสมเหตุสมผลและน่าเล่น. ' +
      'ตอบ JSON บรรทัดเดียวเท่านั้น: {"name":"ชื่อผู้เล่น","role":"บทบาท/สถานะ สั้น 1 ประโยค","appearance":"รูปลักษณ์/การแต่งตัว สั้น 1 ประโยค"} ' +
      'ภาษาไทย กระชับ ไม่ต้องอธิบายเพิ่ม ไม่ต้องมี markdown.';
    const user = `ตัวละคร: ${c.name}\nรูปลักษณ์: ${c.appearance ?? '-'}\nภูมิหลัง: ${c.description ?? '-'}\nฉาก/สถานการณ์: ${c.scenario ?? '-'}\n\nออกแบบบทบาทผู้เล่นที่เข้ากับฉากนี้`;
    try {
      const out = await callAI({ system, user, provider: b.provider, temperature: 0.8, max_tokens: 300 });
      let parsed: any = null;
      try { const m = out.text.match(/\{[\s\S]*\}/); parsed = JSON.parse(m ? m[0] : out.text); } catch { return { ok: false, error: 'LLM non-JSON', raw: out.text.slice(0, 200) }; }
      if (!parsed?.name) return { ok: false, error: 'no name in result' };
      return { ok: true, persona: { name: String(parsed.name).trim(), role: String(parsed.role ?? '').trim(), appearance: String(parsed.appearance ?? '').trim() } };
    } catch (e: any) { return { ok: false, error: e.message }; }
  })

  // --- AI generate (raw) ---
  .post('/api/generate', async ({ body }) => {
    const b = body as {
      user: string;
      system?: string;
      model?: string;
      provider?: string;
      temperature?: number;
      max_tokens?: number;
      prefill?: string;
    };
    if (!b?.user) return { ok: false, error: 'missing "user" field' };
    const t0 = Date.now();
    try {
      const out = await callAI(b);
      const ms = Date.now() - t0;
      logCall({
        endpoint: 'generate',
        system: b.system ?? '',
        user: b.user,
        response: out.text,
        provider: out.provider,
        model: out.model ?? '',
        usage: out.usage,
        temperature: b.temperature ?? 0.9,
        maxTokens: b.max_tokens ?? 1200,
        ok: true,
        ms,
      }).catch(() => {});
      return { ok: true, ...out };
    } catch (e: any) {
      const ms = Date.now() - t0;
      logCall({
        endpoint: 'generate',
        system: b.system ?? '',
        user: b.user,
        response: '',
        provider: DEFAULT_PROVIDER,
        model: '',
        usage: null,
        temperature: b.temperature ?? 0.9,
        maxTokens: b.max_tokens ?? 1200,
        ok: false,
        error: e.message,
        ms,
      }).catch(() => {});
      return { ok: false, error: e.message };
    }
  })

  // --- AI: ขยายงานเขียน (draft + tag จากรูป + โหมด) — รูปเข้าใจผ่าน /api/ref/tag (WD14) ---
  .post('/api/expand', async ({ body }) => {
    const b = (body ?? {}) as {
      draft: string;
      mode?: 'scene' | 'action' | 'polish';
      tags?: string[];
      buckets?: Record<string, string[]>;
      style?: string;
      characters?: string[];
      provider?: string;
      max_tokens?: number;
    };
    if (!b?.draft?.trim()) return { ok: false, error: 'missing "draft"' };
    const mode = b.mode ?? 'scene';
    const buckets = b.buckets ?? (b.tags ? categorizeTags(b.tags) : null);

    const MODE_INSTRUCTION: Record<string, string> = {
      scene: 'โหมด: ขยายฉาก/บรรยากาศ — เสริมสถานที่ แสง สี กลิ่น เสียง อุณหภูมิ และอารมณ์ของฉาก ให้ผู้อ่านเห็นภาพชัด',
      action: 'โหมด: ขยายแอ็กชัน/ท่าทาง — เสริมการเคลื่อนไหว ภาษากาย สีหน้า จังหวะ และรายละเอียดร่างกายของตัวละครในช่วงนั้น',
      polish: 'โหมด: ขยายสำนวนให้ลื่น — คงใจความเดิมทุกอย่าง เพิ่มรายละเอียดและสำนวนให้อ่านลื่นและมีชีวิตขึ้น',
    };

    const parts: string[] = [];
    parts.push(`[ข้อความต้นฉบับของผู้เขียน]\n${b.draft.trim()}`);
    parts.push(`\n[คำสั่ง]\n${MODE_INSTRUCTION[mode] ?? MODE_INSTRUCTION.scene}`);
    if (buckets) {
      const lines = Object.entries(buckets)
        .filter(([, v]) => Array.isArray(v) && v.length)
        .map(([k, v]) => `- ${k}: ${(v as string[]).join(', ')}`);
      if (lines.length) {
        parts.push(`\n[รายละเอียดจากรูปอ้างอิง (booru tags — ใช้เป็นแนวทางบรรยาย ไม่ต้องเอ่ยชื่อ tag ตรงๆ)]\n${lines.join('\n')}`);
      }
    }
    if (b.characters?.length) parts.push(`\n[ตัวละครในฉากนี้] ${b.characters.join(', ')}`);
    if (b.style?.trim()) parts.push(`\n[สไตล์/ข้อห้ามของเรื่อง]\n${b.style.trim()}`);
    parts.push('\n[ผลลัพธ์] คืนเฉพาะร้อยแก้วภาษาไทยที่ขยายแล้ว');
    const user = parts.join('\n');

    const t0 = Date.now();
    const max_tokens = b.max_tokens ?? 1400;
    try {
      const out = await callAI({ system: EXPAND_SYSTEM, user, provider: b.provider, temperature: 0.85, max_tokens });
      logCall({
        endpoint: 'expand', system: EXPAND_SYSTEM, user, response: out.text,
        provider: out.provider, model: out.model ?? '', usage: out.usage,
        temperature: 0.85, maxTokens: max_tokens, ok: true, ms: Date.now() - t0,
      }).catch(() => {});
      return { ok: true, text: out.text.trim(), provider: out.provider, model: out.model };
    } catch (e: any) {
      logCall({
        endpoint: 'expand', system: EXPAND_SYSTEM, user, response: '',
        provider: providerForLog(b.provider), model: '', usage: null,
        temperature: 0.85, maxTokens: max_tokens, ok: false, error: e.message, ms: Date.now() - t0,
      }).catch(() => {});
      return { ok: false, error: e.message };
    }
  })

  // --- image generation ---
  .post('/api/image/generate', async ({ body }) => {
    const b = body as ImageGenParams & { provider?: ImageProvider };
    if (!b?.prompt) return { ok: false, error: 'missing "prompt"' };
    if (!b?.book || !b?.ch) return { ok: false, error: 'missing "book" or "ch"' };
    const provider: ImageProvider = b.provider ?? 'novelai';
    try {
      if (provider === 'novelai') return await generateNovelAI(b);
      if (provider === 'tensorart') return await generateTensorArt(b);
      if (provider === 'civitai') return await generateCivitai(b);
      if (provider === 'comfyui') return await generateComfyUI(b);
      return { ok: false, error: `unknown provider "${provider}"` };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- list saved images for a chapter ---
  .get('/api/image/list/:book/:ch', async ({ params }) => {
    try {
      const dir = join('./uploads', params.book, params.ch);
      const glob = new Bun.Glob('*.png');
      const files: string[] = [];
      for await (const f of glob.scan({ cwd: dir })) {
        files.push(`/uploads/${params.book}/${params.ch}/${f}`);
      }
      return { ok: true, images: files.sort() };
    } catch {
      return { ok: true, images: [] };
    }
  })

  // --- characters CRUD ---
  .get('/api/characters', async () => {
    try {
      const db = await getDb();
      const docs = await db.collection(CHAR_COLLECTION).find({}).sort({ name: 1 }).toArray();
      return { ok: true, characters: docs };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })
  .get('/api/characters/:name', async ({ params }) => {
    try {
      const db = await getDb();
      const doc = await db.collection(CHAR_COLLECTION).findOne({ _id: params.name as any });
      return { ok: true, character: doc };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })
  .put('/api/characters/:name', async ({ params, body }) => {
    try {
      const db = await getDb();
      const b = body as any;
      await db.collection(CHAR_COLLECTION).updateOne(
        { _id: params.name as any },
        { $set: { ...b, name: params.name, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      logActivity('character.upsert', params.name);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })
  .delete('/api/characters/:name', async ({ params }) => {
    try {
      const db = await getDb();
      await db.collection(CHAR_COLLECTION).deleteOne({ _id: params.name as any });
      logActivity('character.delete', params.name);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- Character Card V2/V3: export JSON (มาตรฐาน TavernAI/SillyTavern) ---
  .get('/api/characters/:name/card', async ({ params, query, set }) => {
    const db = await getDb();
    const doc = await db.collection(CHAR_COLLECTION).findOne({ _id: params.name as any });
    if (!doc) { set.status = 404; return { ok: false, error: 'character not found' }; }
    const spec = (query as any)?.spec === 'v2' ? 'v2' : 'v3';
    return toCard(doc as unknown as NovelChar, spec);
  })

  // --- Character Card V2/V3: export PNG (ฝัง card ใน tEXt chunk — ลากเข้า SillyTavern ได้) ---
  .get('/api/characters/:name/card.png', async ({ params, set }) => {
    const db = await getDb();
    const doc = await db.collection(CHAR_COLLECTION).findOne({ _id: params.name as any });
    if (!doc) { set.status = 404; return { ok: false, error: 'character not found' }; }
    // ใช้ avatar จริงถ้ามี (uploads/avatars/<name>.png) ไม่งั้น gen สีพื้น
    let base: Uint8Array;
    try {
      const f = Bun.file(`./uploads/avatars/${slugifyName(params.name)}.png`);
      base = (await f.exists()) ? new Uint8Array(await f.arrayBuffer()) : makeSolidPng();
    } catch { base = makeSolidPng(); }
    const png = embedCardInPng(base, doc as unknown as NovelChar);
    logActivity('character.exportCard', params.name, { bytes: png.length });
    return new Response(new Blob([png as BlobPart]), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${slugifyName(params.name)}.card.png"`,
      },
    });
  })

  // --- Character Card V2/V3: import จาก JSON (body = object card) ---
  .post('/api/characters/import-card', async ({ body, set }) => {
    try {
      const nc = fromCard(body);
      const db = await getDb();
      const existed = await db.collection(CHAR_COLLECTION).findOne({ _id: nc.name as any }, { projection: { _id: 1 } });
      await db.collection(CHAR_COLLECTION).updateOne(
        { _id: nc.name as any },
        { $set: { ...nc, name: nc.name, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      logActivity('character.importCard', nc.name, { from: 'json', existed: !!existed });
      return { ok: true, name: nc.name, created: !existed };
    } catch (e: any) {
      set.status = 400; return { ok: false, error: e.message };
    }
  })

  // --- Character Card V2/V3: import จาก PNG (body = raw image/png ที่ฝัง card) ---
  .post('/api/characters/import-card-png', async ({ request, set }) => {
    try {
      const png = new Uint8Array(await request.arrayBuffer());
      if (!png.length) { set.status = 400; return { ok: false, error: 'empty body — POST raw PNG bytes' }; }
      const card = extractCardFromPng(png);
      if (!card) { set.status = 400; return { ok: false, error: 'no character card embedded in PNG (tEXt ccv3/chara)' }; }
      const nc = fromCard(card);
      const db = await getDb();
      const existed = await db.collection(CHAR_COLLECTION).findOne({ _id: nc.name as any }, { projection: { _id: 1 } });
      await db.collection(CHAR_COLLECTION).updateOne(
        { _id: nc.name as any },
        { $set: { ...nc, name: nc.name, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true },
      );
      logActivity('character.importCard', nc.name, { from: 'png', existed: !!existed });
      return { ok: true, name: nc.name, created: !existed };
    } catch (e: any) {
      set.status = 400; return { ok: false, error: e.message };
    }
  })

  // --- Character Card V2/V3: stateless convert (ไม่แตะ DB) — ใช้กับ ChatChar ที่เก็บแยกได้ ---
  // export: body = char object → JSON (default) หรือ PNG (?format=png) · ?spec=v2|v3
  .post('/api/card/export', async ({ body, query, set }) => {
    try {
      const c = body as NovelChar;
      if (!c?.name) { set.status = 400; return { ok: false, error: 'body.name required' }; }
      const spec = (query as any)?.spec === 'v2' ? 'v2' : 'v3';
      if ((query as any)?.format === 'png') {
        const png = embedCardInPng(makeSolidPng(), c);
        return new Response(new Blob([png as BlobPart]), {
          headers: {
            'Content-Type': 'image/png',
            'Content-Disposition': `attachment; filename="${slugifyName(c.name)}.card.png"`,
          },
        });
      }
      return toCard(c, spec);
    } catch (e: any) {
      set.status = 400; return { ok: false, error: e.message };
    }
  })
  // import: body = card JSON (Content-Type json) หรือ raw PNG (Content-Type image/png) → { ok, char }
  .post('/api/card/import', async ({ request, body, set }) => {
    try {
      const ct = request.headers.get('content-type') ?? '';
      let card: any;
      if (ct.includes('image/png') || ct.includes('octet-stream')) {
        const png = new Uint8Array(await request.arrayBuffer());
        card = extractCardFromPng(png);
        if (!card) { set.status = 400; return { ok: false, error: 'no card embedded in PNG' }; }
      } else {
        card = body;
      }
      const char = fromCard(card);
      return { ok: true, char };
    } catch (e: any) {
      set.status = 400; return { ok: false, error: e.message };
    }
  })

  // --- LLM: generate promptAnchor for a character ---
  .post('/api/characters/:name/generate-anchor', async ({ params, body }) => {
    const visual = body as any;
    if (!visual?.gender || !visual?.hair || !visual?.eyes) {
      return { ok: false, error: 'gender, hair, eyes required in body' };
    }
    const userMsg = `Character name: ${params.name}\nVisual fields:\n${JSON.stringify(visual, null, 2)}`;
    const t0 = Date.now();
    try {
      const out = await callAI({ system: ANCHOR_SYSTEM, user: userMsg, temperature: 0.4, max_tokens: 800 });
      let parsed: any = null;
      try {
        const m = out.text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : out.text);
      } catch {
        return { ok: false, error: 'LLM returned non-JSON', raw: out.text.slice(0, 500) };
      }
      logCall({
        endpoint: 'characters/generate-anchor', system: ANCHOR_SYSTEM, user: userMsg,
        response: out.text, provider: out.provider, model: out.model ?? '',
        usage: out.usage, temperature: 0.4, maxTokens: 800,
        ok: true, ms: Date.now() - t0,
      }).catch(() => {});
      return { ok: true, promptAnchor: parsed.promptAnchor, negativeAnchor: parsed.negativeAnchor };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- LLM: scene paragraph → SD prompt+negative+pose ---
  .post('/api/scene-to-image-prompt', async ({ body }) => {
    const b = body as {
      scene_text: string;
      character_names: string[];
      focus_character?: string;
      faceless_count?: number;
      camera_angle?: string;
      style?: 'anime' | 'photoreal';
      intensity?: 'sfw' | 'r18_soft' | 'r18_explicit';
      pose_preset?: string;
    };
    if (!b?.scene_text || !b?.character_names?.length) {
      return { ok: false, error: 'scene_text + character_names[] required' };
    }
    const db = await getDb();
    const chars = await db.collection(CHAR_COLLECTION)
      .find({ _id: { $in: b.character_names } as any })
      .toArray();
    if (chars.length === 0) return { ok: false, error: 'no matching characters in DB' };

    // List available pose presets for LLM to choose from
    let poseList = '';
    try {
      const glob = new Bun.Glob('**/*.png');
      const items: string[] = [];
      for await (const f of glob.scan({ cwd: './uploads/poses' })) items.push(`poses/${f}`);
      poseList = items.length ? items.join('\n') : '(no presets available)';
    } catch { poseList = '(no presets available)'; }

    const userMsg =
      `Scene (Thai paragraph):\n${b.scene_text}\n\n` +
      `Characters in image:\n` +
      chars.map((c: any) => {
        const v = c.visual || {};
        return `### ${c.name}\n` +
          `gender: ${v.gender ?? '?'}\n` +
          `promptAnchor: ${v.promptAnchor ?? '(no anchor — use appearance: ' + (c.appearance ?? 'unknown') + ')'}\n` +
          `negativeAnchor: ${v.negativeAnchor ?? ''}\n` +
          `defaultOutfit: ${v.defaultOutfit ?? ''}\n` +
          `stylePreference: ${v.stylePreference ?? 'anime'}`;
      }).join('\n\n') +
      `\n\nGen settings:\n` +
      `- focus_character: ${b.focus_character ?? b.character_names[0]}\n` +
      `- faceless_count: ${b.faceless_count ?? 0}\n` +
      `- camera_angle: ${b.camera_angle ?? 'auto-detect from scene'}\n` +
      `- intensity: ${b.intensity ?? 'r18_explicit'}\n` +
      `- style: ${b.style ?? 'anime'}\n` +
      `- pose_preset override: ${b.pose_preset ?? '(none — suggest from library)'}\n\n` +
      `Available pose presets (suggest one if it fits, else null):\n${poseList}`;

    const t0 = Date.now();
    try {
      const out = await callAI({ system: SCENE_SYSTEM, user: userMsg, temperature: 0.6, max_tokens: 1800 });
      let parsed: any = null;
      try {
        const m = out.text.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(m ? m[0] : out.text);
      } catch {
        return { ok: false, error: 'LLM returned non-JSON', raw: out.text.slice(0, 500) };
      }
      logCall({
        endpoint: 'scene-to-image-prompt', system: SCENE_SYSTEM, user: userMsg,
        response: out.text, provider: out.provider, model: out.model ?? '',
        usage: out.usage, temperature: 0.6, maxTokens: 1800,
        ok: true, ms: Date.now() - t0,
      }).catch(() => {});
      return { ok: true, ...parsed };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- Reference Sheet generator (6 angles per character, fixed seed) ---
  .post('/api/characters/:name/generate-reference-sheet', async ({ params }) => {
    const db = await getDb();
    const char = await db.collection(CHAR_COLLECTION).findOne({ _id: params.name as any });
    if (!char) return { ok: false, error: 'character not found' };
    const visual = (char as any).visual;
    if (!visual?.promptAnchor) return { ok: false, error: 'no promptAnchor — generate it first' };

    const model = visual.modelPreference ?? 'meinahentai_v5Final.safetensors';
    const seed = charSeed(params.name);
    const baseLight = 'studio neutral lighting, plain off-white background';
    const baseQuality = 'masterpiece, best quality, absurdres, ultra detailed, sharp focus';

    const angles = [
      { name: 'front-portrait',      tag: 'cowboy shot, front view, looking at viewer, neutral expression' },
      { name: 'three-quarter-left',  tag: 'cowboy shot, three quarter view from left side, looking at viewer' },
      { name: 'three-quarter-right', tag: 'cowboy shot, three quarter view from right side, looking at viewer' },
      { name: 'full-body',           tag: 'full body shot, standing, looking at viewer, neutral expression, arms relaxed' },
      { name: 'expression-smile',    tag: 'close-up portrait, gentle smile, looking at viewer' },
      { name: 'expression-intense',  tag: 'close-up portrait, intense focused expression, sharp eyes, serious' },
    ];

    const slug = slugifyName(params.name);
    const destDir = `./uploads/characters/${slug}/reference`;
    await mkdir(destDir, { recursive: true });

    const results: any[] = [];
    for (const [i, a] of angles.entries()) {
      const positive = `${visual.promptAnchor}, ${visual.defaultOutfit ?? ''}, ${a.tag}, ${baseLight}, ${baseQuality}`;
      const negative = `${visual.negativeAnchor ?? ''}, (worst quality, low quality:1.4), bad anatomy, bad hands, deformed face, extra fingers, text, watermark, signature, child, loli, shota, underage`;
      try {
        const out = await generateComfyUI({
          prompt: positive,
          negative_prompt: negative,
          book: 'characters',
          ch: `${slug}_tmp`,
          width: 512,
          height: 768,
          steps: 24,
          cfg_scale: 7,
          model,
          seed: seed + i,   // small offset so 6 images differ but stay deterministic per slot
        } as any);
        // Move from tmp to characters/{slug}/reference/{angle}.png
        const destName = `${a.name}.png`;
        const destPath = `${destDir}/${destName}`;
        await Bun.write(destPath, await Bun.file((out as any).path).bytes());
        results.push({ angle: a.name, url: `/uploads/characters/${slug}/reference/${destName}`, ok: true });
      } catch (e: any) {
        results.push({ angle: a.name, ok: false, error: e.message });
      }
    }
    return { ok: true, character: params.name, seed, sheet: results };
  })

  // --- list reference images ---
  .get('/api/characters/:name/reference', async ({ params }) => {
    try {
      const slug = slugifyName(params.name);
      const dir = `./uploads/characters/${slug}/reference`;
      const glob = new Bun.Glob('*.png');
      const files: string[] = [];
      for await (const f of glob.scan({ cwd: dir })) files.push(`/uploads/characters/${slug}/reference/${f}`);
      return { ok: true, images: files.sort() };
    } catch {
      return { ok: true, images: [] };
    }
  })

  // --- pose presets (ControlNet OpenPose) ---
  .get('/api/poses', async () => {
    try {
      const glob = new Bun.Glob('*.png');
      const files: { name: string; url: string; cn_path: string }[] = [];
      for await (const f of glob.scan({ cwd: './uploads/poses' })) {
        files.push({
          name: f.replace(/\.png$/, ''),
          url: `/uploads/poses/${f}`,
          cn_path: `poses/${f}`,
        });
      }
      return { ok: true, poses: files.sort((a, b) => a.name.localeCompare(b.name)) };
    } catch {
      return { ok: true, poses: [] };
    }
  })
  .post('/api/poses/extract', async ({ body }) => {
    try {
      const b = body as { source_url: string; name: string };
      if (!b?.source_url || !b?.name) return { ok: false, error: 'source_url + name required' };
      const baseUrl = process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188';
      const comfyInput = process.env.COMFYUI_INPUT_DIR ?? `${process.env.HOME}/dru/comfyui/input`;
      const comfyOutput = process.env.COMFYUI_OUTPUT_DIR ?? `${process.env.HOME}/dru/comfyui/output`;

      const safe = b.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
      const srcLocalName = `_pose_src_${Date.now()}.png`;

      // resolve source: either absolute url or "/uploads/..." path → read local file
      let srcBytes: Uint8Array;
      if (b.source_url.startsWith('http')) {
        const r = await fetch(b.source_url);
        srcBytes = new Uint8Array(await r.arrayBuffer());
      } else {
        const localPath = b.source_url.startsWith('/uploads/')
          ? '.' + b.source_url
          : b.source_url;
        srcBytes = new Uint8Array(await Bun.file(localPath).arrayBuffer());
      }
      await Bun.write(`${comfyInput}/${srcLocalName}`, srcBytes);

      const wf = {
        client_id: `pose_extract_${Date.now()}`,
        prompt: {
          '1': { class_type: 'LoadImage', inputs: { image: srcLocalName } },
          '2': {
            class_type: 'OpenposePreprocessor',
            inputs: {
              image: ['1', 0],
              detect_hand: 'enable',
              detect_body: 'enable',
              detect_face: 'enable',
              resolution: 768,
            },
          },
          '3': { class_type: 'SaveImage', inputs: { filename_prefix: `extract_${safe}`, images: ['2', 0] } },
        },
      };
      const sub = await fetch(`${baseUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wf),
      });
      if (!sub.ok) return { ok: false, error: `comfy submit ${sub.status}: ${(await sub.text()).slice(0, 300)}` };
      const { prompt_id } = (await sub.json()) as { prompt_id: string };

      let outFile: { filename: string; subfolder: string; type: string } | null = null;
      for (let i = 0; i < 60; i++) {
        await Bun.sleep(2000);
        const hr = await fetch(`${baseUrl}/history/${prompt_id}`);
        const hist = (await hr.json()) as any;
        const entry = hist[prompt_id];
        if (!entry) continue;
        if (entry.status?.status_str === 'error') return { ok: false, error: `comfy: ${JSON.stringify(entry.status?.messages)}` };
        if (entry.outputs) {
          const node = Object.values(entry.outputs as Record<string, any>).find((o: any) => o.images);
          if (node) { outFile = (node as any).images[0]; break; }
        }
      }
      if (!outFile) return { ok: false, error: 'comfy timeout (120s)' };

      const outBytes = new Uint8Array(await Bun.file(`${comfyOutput}/${outFile.subfolder}/${outFile.filename}`.replace('//', '/')).arrayBuffer());
      const destPath = `./uploads/poses/${safe}.png`;
      await Bun.write(destPath, outBytes);
      return { ok: true, name: safe, url: `/uploads/poses/${safe}.png`, cn_path: `poses/${safe}.png` };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })
  .post('/api/poses/upload', async ({ body }) => {
    try {
      const b = body as { name: string; data_base64: string };
      if (!b?.name || !b?.data_base64) return { ok: false, error: 'name + data_base64 required' };
      const safe = b.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) + '.png';
      const filePath = join('./uploads/poses', safe);
      const buf = Uint8Array.from(atob(b.data_base64), c => c.charCodeAt(0));
      await Bun.write(filePath, buf);
      return { ok: true, name: safe.replace(/\.png$/, ''), url: `/uploads/poses/${safe}`, cn_path: `poses/${safe}` };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- Phase 1+2: รูป ref → booru tags (WD14 โลคัล) → แยกหมวด ---
  .post('/api/ref/tag', async ({ body }) => {
    const b = (body ?? {}) as { image?: string; data_base64?: string; model?: string; threshold?: number };
    try {
      let bytes: Uint8Array;
      if (b.data_base64) {
        bytes = Uint8Array.from(atob(b.data_base64), (c) => c.charCodeAt(0));
      } else if (b.image) {
        const path = b.image.startsWith('/') ? b.image : `./${b.image}`;
        bytes = new Uint8Array(await Bun.file(path).arrayBuffer());
      } else {
        return { ok: false, error: 'ต้องส่ง image (path) หรือ data_base64' };
      }
      const tags = await runWD14(bytes, { model: b.model, threshold: b.threshold });
      return { ok: true, tags, buckets: categorizeTags(tags) };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- Phase 3: tag ที่เลือก (ชุด/ท่า/...) → บรีฟฉากภาษาไทย (DeepSeek) ---
  .post('/api/ref/to-scene', async ({ body }) => {
    const b = (body ?? {}) as {
      tags?: string[]; buckets?: Record<string, string[]>;
      use?: { outfit?: boolean; pose?: boolean; action?: boolean; camera?: boolean; expression?: boolean };
      character_names?: string[]; extra?: string; provider?: string;
    };
    const buckets = b.buckets ?? (b.tags ? categorizeTags(b.tags) : null);
    if (!buckets) return { ok: false, error: 'ต้องส่ง buckets หรือ tags' };
    const user = buildRefSceneUser(buckets, b.use ?? { outfit: true, pose: true, action: true }, {
      characterNames: b.character_names, extra: b.extra,
    });
    const t0 = Date.now();
    try {
      const out = await callAI({ system: REF_SCENE_SYSTEM, user, provider: b.provider, temperature: 0.7, max_tokens: 700 });
      logCall({
        endpoint: 'ref/to-scene', system: REF_SCENE_SYSTEM, user, response: out.text,
        provider: out.provider, model: out.model ?? '', usage: out.usage, temperature: 0.7, maxTokens: 700,
        ok: true, ms: Date.now() - t0,
      }).catch(() => {});
      return { ok: true, brief: out.text.trim(), buckets };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- app logs (request/activity/error) — แยกจาก ai_logs ---
  .get('/api/app-logs', async ({ query }) => {
    try {
      const db = await getDb();
      const limit = Math.min(Number(query?.limit ?? 100), 500);
      const skip = Number(query?.skip ?? 0);
      const filter: Record<string, unknown> = {};
      if (query?.type) filter.type = query.type;        // request | activity | error
      if (query?.level) filter.level = query.level;      // info | warn | error
      const docs = await db
        .collection(APP_LOG_COLLECTION)
        .find(filter)
        .sort({ ts: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      return { ok: true, logs: docs };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })
  .delete('/api/app-logs', async () => {
    try {
      const db = await getDb();
      const r = await db.collection(APP_LOG_COLLECTION).deleteMany({});
      logActivity('appLogs.clear', undefined, { deleted: r.deletedCount });
      return { ok: true, deleted: r.deletedCount };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })

  // --- serve uploaded images ---
  .get('/uploads/*', ({ params }) => Bun.file(`./uploads/${params['*']}`))

  .onError(({ error, code, request, path }) => {
    console.error(`[error ${code}]`, error);
    logError(error, { code, method: request?.method, path: path ?? (request ? new URL(request.url).pathname : undefined) });
    return { ok: false, error: String(error) };
  })

  .listen(PORT);

// warm up mongo connection on boot + เตรียม index ของ log
getDb()
  .then((db) => ensureLogIndexes(db).catch((e) => console.error('[log] ensure index failed:', e.message)))
  .catch((e) => console.error('[mongo] initial connect failed:', e.message));

console.log(`\n  🚀 Novel server: http://localhost:${PORT}\n`);
