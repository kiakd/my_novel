import { Elysia } from 'elysia';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getDb } from './db';
import { assembleSystemPrompt, type NovelContext } from './prompts';
import { pickStory, writeStoryMd, type Story } from './story-md';
import { runWD14, categorizeTags, REF_SCENE_SYSTEM, buildRefSceneUser } from './ref-tag';
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
const DICT_ID = 'dict';
const COLLECTION = 'workspace';
const LOG_COLLECTION = 'ai_logs';
const CHAR_COLLECTION = 'characters';

function slugifyName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-฀-๿]/g, '_').slice(0, 60);
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

type Provider = 'openrouter' | 'deepseek';

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
};

const DEFAULT_PROVIDER: Provider =
  (process.env.AI_PROVIDER as Provider) === 'deepseek' ? 'deepseek' : 'openrouter';

function providerAvailable(p: Provider): boolean {
  return !!process.env[PROVIDER_CONFIG[p].keyEnv];
}

function resolveProvider(req?: string): Provider {
  if (req === 'openrouter' || req === 'deepseek') {
    if (!providerAvailable(req)) {
      throw new Error(`provider "${req}" requested but ${PROVIDER_CONFIG[req].keyEnv} not set`);
    }
    return req;
  }
  if (providerAvailable(DEFAULT_PROVIDER)) return DEFAULT_PROVIDER;
  const fallback: Provider = DEFAULT_PROVIDER === 'openrouter' ? 'deepseek' : 'openrouter';
  if (providerAvailable(fallback)) return fallback;
  throw new Error('no provider API key set (OPENROUTER_API_KEY or DEEPSEEK_API_KEY)');
}

async function callAI(payload: {
  model?: string;
  system?: string;
  user: string;
  temperature?: number;
  max_tokens?: number;
  provider?: string;
  prefill?: string;   // assistant prefix — บังคับโมเดล "เขียนต่อ" จากท่อนนี้ ลด soft-refusal/การเลี่ยงคำ
}) {
  const provider = resolveProvider(payload.provider);
  const cfg = PROVIDER_CONFIG[provider];
  const apiKey = process.env[cfg.keyEnv]!;

  const messages: any[] = [];
  if (payload.system) messages.push({ role: 'system', content: payload.system });
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

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: payload.model ?? cfg.defaultModel,
      messages,
      temperature: payload.temperature ?? 0.9,
      max_tokens: payload.max_tokens ?? 1200,
    }),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${provider} ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return {
    provider,
    text: json.choices?.[0]?.message?.content ?? '',
    usage: json.usage,
    model: json.model,
  };
}

/* ============================================================
   AI Prompt Logger
   ============================================================ */

function extractPromptMeta(system: string, user: string) {
  const has = (s: string) => system.includes(s);

  // Count locations: find section, stop at next === header or end
  const locMatch = system.match(/=== สถานที่[\s\S]*?(?=\n===|$)/);
  const locationCount = locMatch ? (locMatch[0].match(/\n\[/g)?.length ?? 0) : 0;

  // Count characters: find section, stop at กฎการ keep or next === header
  const charMatch = system.match(/=== ตัวละคร[\s\S]*?(?:กฎการ keep|(?=\n===)|$)/);
  const characterCount = charMatch ? (charMatch[0].match(/\n\[/g)?.length ?? 0) : 0;

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
    hasWorldRules: has('กฎของโลก'),
    hasDontList: has("Do / Don't"),
    hasCharacters: has('ตัวละคร (AI ต้อง keep character'),
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

const app = new Elysia()
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
      return { ok: true, rev: 1 };
    }
    const hasRev = existing.rev !== undefined && existing.rev !== null;
    const cur = hasRev ? existing.rev : 0;
    if (baseRev !== cur) {
      set.status = 409;
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
      return { ok: false, conflict: true, currentRev: d?.rev ?? 0, error: 'rev changed during write' };
    }
    return { ok: true, rev: cur + 1 };
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
      },
      models: {
        openrouter: PROVIDER_CONFIG.openrouter.defaultModel,
        deepseek: PROVIDER_CONFIG.deepseek.defaultModel,
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
    };
    if (!b?.context?.protagonist || !b?.context?.setting || !b?.context?.eventCurrent) {
      return { ok: false, error: 'context.protagonist, context.setting, context.eventCurrent are required' };
    }
    if (!b?.user_input) return { ok: false, error: 'missing "user_input"' };
    const t0 = Date.now();
    try {
      const system = assembleSystemPrompt(b.context);
      const max_tokens = b.max_tokens ?? (b.context.mode === 'dialogue' ? 1200 : 2500);
      const out = await callAI({
        system,
        user: b.user_input,
        model: b.model,
        provider: b.provider,
        temperature: b.temperature ?? 0.85,
        max_tokens,
      });
      const ms = Date.now() - t0;
      logCall({
        endpoint: 'generate-roleplay',
        system,
        user: b.user_input,
        response: out.text,
        provider: out.provider,
        model: out.model ?? '',
        usage: out.usage,
        temperature: b.temperature ?? 0.85,
        maxTokens: max_tokens,
        ok: true,
        ms,
      }).catch(() => {});
      return { ok: true, ...out, prompt_chars: system.length };
    } catch (e: any) {
      const ms = Date.now() - t0;
      logCall({
        endpoint: 'generate-roleplay',
        system: assembleSystemPrompt(b.context),
        user: b.user_input,
        response: '',
        provider: resolveProvider(b.provider),
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
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  })
  .delete('/api/characters/:name', async ({ params }) => {
    try {
      const db = await getDb();
      await db.collection(CHAR_COLLECTION).deleteOne({ _id: params.name as any });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message };
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

  // --- serve uploaded images ---
  .get('/uploads/*', ({ params }) => Bun.file(`./uploads/${params['*']}`))

  .onError(({ error, code }) => {
    console.error(`[error ${code}]`, error);
    return { ok: false, error: String(error) };
  })

  .listen(PORT);

// warm up mongo connection on boot
getDb().catch((e) => console.error('[mongo] initial connect failed:', e.message));

console.log(`\n  🚀 Novel server: http://localhost:${PORT}\n`);
