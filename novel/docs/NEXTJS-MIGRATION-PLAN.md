# แผน Migrate "คลังนิยาย" → Next.js

> เป้าหมาย: ย้ายจาก `novel.html` (vanilla JS ไฟล์เดียว ~5,000 บรรทัด) + Bun/Elysia + MongoDB
> ไปเป็น Next.js (App Router) โดยคงฟีเจอร์เดิมครบ และเปิดทางให้ขยาย/ดูแลง่ายขึ้น

---

## 1. ภาพรวมสถาปัตยกรรม

### ปัจจุบัน
```
novel.html (SPA, inline CSS+JS)  ──fetch──▶  Elysia (server.ts)  ──▶  MongoDB
                                                  │
                                                  ├─ OpenRouter / DeepSeek (LLM)
                                                  ├─ ComfyUI (127.0.0.1:8188)
                                                  └─ NovelAI / TensorArt / Civitai
```
- State ทั้งแอป = JSON ก้อนเดียว (`workspace/main`) โหลดทีเดียว แก้ในเมมโมรี autosave ทับทั้งก้อน
- Optimistic locking ด้วย `__rev` กัน autosave แท็บเก่าทับของใหม่

### เป้าหมาย (Next.js App Router)
```
Next.js (React Server + Client Components)
   │
   ├─ app/(workspace)/...        ◀ UI แต่ละแท็บเป็น route จริง
   ├─ app/api/...                ◀ Route Handlers แทน Elysia endpoints
   ├─ lib/db.ts (mongo singleton) lib/ai.ts (callAI) lib/image-gen.ts ...
   └─ React Query (TanStack)     ◀ จัดการ server state + optimistic update
```

### สิ่งที่ตัดสินใจไว้ล่วงหน้า (แนะนำ)
| หัวข้อ | เลือก | เหตุผล |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | RSC + Route Handlers ครบในที่เดียว |
| Runtime | **Node.js** (ไม่ใช่ Edge) | ต้องใช้ `mongodb` driver, fs, ComfyUI local |
| Styling | **Tailwind CSS + shadcn/ui** | คุม design system ได้, dark theme พร้อม |
| Server state | **TanStack Query** | cache + optimistic + invalidate ต่อ entity |
| Editor (บท) | **Tiptap (React)** | ของเดิมก็ Tiptap-like อยู่แล้ว |
| Forms | **react-hook-form + zod** | validate + type-safe |
| รูปภาพ | เสิร์ฟผ่าน route handler / static `public` หรือ object storage |

> ⚠️ ของเดิมรันบน **Bun**; Next.js รันบน Node ได้ตามปกติ ไม่ต้องใช้ Bun runtime
> แต่โค้ดที่เรียก `Bun.file` / `Bun.Glob` / `Bun.write` ต้องเขียนใหม่เป็น `fs/promises` + `fast-glob`

---

## 2. Data Model (คงเดิม — ดู `story-md.ts`, `prompts.ts`)

MongoDB collections เดิม **ไม่ต้องแก้**:
- `workspace` — `{_id:'main', state:{stories, activeStoryId}, rev}` และ `{_id:'dict', words}`
- `characters` — ตัวละคร + `visual` (promptAnchor/negativeAnchor) สำหรับเจนรูป
- `ai_logs` — log ทุกครั้งที่เรียก LLM

ดึง interface กลางมาไว้ที่ `lib/types.ts` (Story, Char, Chapter, TLEvent, Loc, Relation, CharacterVisual, NovelContext)
ใช้ `zod` schema คู่กับ type เพื่อ validate ทั้ง API และ form

> **ข้อควรพิจารณา:** ของเดิมเก็บทั้ง state เป็น JSON ก้อนเดียว ทำให้ทุกการแก้ = เขียนทับทั้งก้อน
> ระยะแรกให้คงรูปแบบนี้ (1:1) เพื่อลดความเสี่ยง แล้วค่อยพิจารณาแตก chapters/characters เป็น
> document แยกใน Phase ท้าย (ดู §6)

---

## 3. Mapping: Elysia endpoint → Next.js Route Handler

| เดิม (Elysia) | ใหม่ (`app/api/...`) | หมายเหตุ |
|---|---|---|
| `GET /api/health` | `app/api/health/route.ts` | |
| `GET/PUT /api/state` | `app/api/state/route.ts` | คง optimistic locking `__rev` |
| `POST /api/export-md` | `app/api/export-md/route.ts` | ใช้ `story-md.ts` ตามเดิม (เปลี่ยน fs API) |
| `GET/PUT /api/dict` | `app/api/dict/route.ts` | |
| `GET /api/providers` | `app/api/providers/route.ts` | |
| `GET/DELETE /api/logs`, `/api/logs/:id` | `app/api/logs/route.ts` + `[id]/route.ts` | |
| `POST /api/generate` | `app/api/generate/route.ts` | callAI + logCall |
| `POST /api/generate-roleplay` | `app/api/generate-roleplay/route.ts` | assembleSystemPrompt |
| `POST /api/image/generate` | `app/api/image/generate/route.ts` | 4 providers |
| `GET /api/image/list/:book/:ch` | `app/api/image/list/[book]/[ch]/route.ts` | glob → fast-glob |
| `* /api/characters[/:name][/...]` | `app/api/characters/[[...slug]]/route.ts` | CRUD + anchor + reference-sheet + reference |
| `POST /api/scene-to-image-prompt` | `app/api/scene-to-image-prompt/route.ts` | |
| `GET /api/poses`, `POST /api/poses/extract|upload` | `app/api/poses/...` | ComfyUI OpenPose |
| `POST /api/ref/tag`, `/api/ref/to-scene` | `app/api/ref/...` | WD14 + brief |
| `GET /uploads/*` | `app/api/uploads/[...path]/route.ts` หรือ symlink ไป `public/` | ดู §5 |

**แพทเทิร์น Route Handler มาตรฐาน:**
```ts
// app/api/state/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
export const runtime = 'nodejs';          // บังคับ Node runtime
export const dynamic = 'force-dynamic';   // ไม่ cache

export async function GET() { /* ... return NextResponse.json(...) */ }
export async function PUT(req: NextRequest) {
  const body = await req.json();
  // ... optimistic-lock logic เดิม
}
```

> โค้ด `lib/` (db, ai, image-gen, prompts, story-md, ref-tag) เกือบทั้งหมด **ยกมาได้ตรงๆ**
> แก้เฉพาะ: `Bun.file/write/Glob/sleep` → `node:fs/promises` + `fast-glob` + `setTimeout` promise

---

## 4. โครงสร้างโฟลเดอร์เป้าหมาย

```
novel-next/
├─ app/
│  ├─ layout.tsx                 ◀ shell: header + sidebar + providers
│  ├─ page.tsx                   ◀ redirect → /plot
│  ├─ (workspace)/
│  │  ├─ plot/page.tsx           ◀ แท็บโครงเรื่อง
│  │  ├─ characters/page.tsx
│  │  ├─ locations/page.tsx
│  │  ├─ relations/page.tsx
│  │  ├─ chapters/page.tsx       ◀ list + editor (Tiptap)
│  │  ├─ timeline/page.tsx
│  │  ├─ images/page.tsx         ◀ เจนรูป / reference / pose
│  │  ├─ ai-logs/page.tsx
│  │  └─ settings/page.tsx
│  └─ api/...                    ◀ ตาม §3
├─ components/
│  ├─ ui/                        ◀ shadcn primitives
│  ├─ layout/{Sidebar,Header,SaveIndicator}.tsx
│  ├─ story/{StorySelector,StoryProvider}.tsx
│  ├─ character/{CharacterCard,CharacterModal,ColorPicker}.tsx
│  ├─ chapter/{ChapterList,ChapterEditor,ContinueDialog}.tsx
│  ├─ relations/RelationGraph.tsx
│  └─ images/{GenPanel,PosePicker,ReferenceSheet}.tsx
├─ lib/
│  ├─ db.ts ai.ts image-gen.ts prompts.ts story-md.ts ref-tag.ts
│  ├─ types.ts (+ zod schemas)
│  └─ api-client.ts (fetch wrappers สำหรับ React Query)
├─ hooks/
│  ├─ useStoryState.ts           ◀ โหลด/เซฟ state + optimistic-lock
│  ├─ useDebouncedSave.ts
│  └─ useCharacters.ts useLogs.ts ...
└─ .env.local                    ◀ MONGODB_URI, OPENROUTER_API_KEY, COMFYUI_URL ...
```

---

## 5. ประเด็นเทคนิคที่ต้องแก้ตอนย้าย

1. **Bun API → Node:** `Bun.file().bytes()` → `fs.readFile`; `Bun.write` → `fs.writeFile`;
   `new Bun.Glob().scan()` → `fast-glob`; `Bun.sleep` → `await new Promise(r=>setTimeout(r,ms))`
2. **Static `novel.html` → React:** แตก inline CSS เป็น Tailwind + แตก JS module เป็น components/hooks
3. **เสิร์ฟรูป `/uploads/*`:** Next ไม่เสิร์ฟไฟล์นอก `public/` ให้ตรงๆ —
   เลือกทางใดทางหนึ่ง: (ก) ย้าย `uploads/` เข้า `public/uploads` (ง่ายสุด, dev),
   (ข) route handler stream ไฟล์ (คุม path ได้), (ค) object storage (โปรดักชัน)
4. **MongoDB singleton บน dev/HMR:** ต้อง cache client ใน `globalThis` กัน connection รั่วตอน hot-reload
5. **State ก้อนใหญ่ + autosave:** ย้าย logic `loadState/saveState/debouncedSave/__rev` ไปเป็น hook
   `useStoryState` ที่ใช้ React Query mutation + retry เมื่อเจอ 409 (conflict)
6. **Tiptap:** ของเดิมเก็บ HTML ใน `chapter.content` — ใช้ Tiptap React + เก็บ HTML เหมือนเดิม (compatible)
7. **R18 content:** logic/prompt R18 ย้ายมาทั้งหมด ไม่มีผลต่อ migration; เก็บ key ใน env เท่านั้น
8. **ComfyUI/Image providers:** เป็น server-side fetch — ย้ายเข้า route handler ตรงๆ, อย่าเรียกจาก client

---

## 6. Migration Phases (เรียงตามความเสี่ยงต่ำ→สูง)

**Phase 0 — Scaffold (½ วัน)**
- `create-next-app` (TS, Tailwind, App Router), ตั้ง shadcn/ui, React Query provider, dark theme
- ก๊อป `lib/*.ts` มาแล้วแก้ Bun→Node, ตั้ง `.env.local`

**Phase 1 — Backend parity (1–2 วัน)**
- พอร์ตทุก endpoint เป็น Route Handlers (§3) — ทดสอบด้วย curl/REST client ให้ตอบเหมือน Elysia เป๊ะ
- ยังไม่มี UI ก็ได้ ใช้แอป HTML เดิมยิงมาที่ Next API เพื่อพิสูจน์ parity

**Phase 2 — Shell + State (1 วัน)**
- layout: header (story selector, save indicator, sync/export/import) + sidebar tabs
- `useStoryState` hook + optimistic-lock + debounced autosave + save indicator

**Phase 3 — แท็บข้อความ (2–3 วัน)**
- plot / characters / locations / relations / timeline (form + modal + zod)
- relations graph (พิจารณา react-flow แทน DOM graph เดิม)

**Phase 4 — Chapters + AI (2–3 วัน)**
- Tiptap editor, chapter list, auto-summary, review, generate, continue-story
- ต่อ `/api/generate*`

**Phase 5 — เจนรูป (2–3 วัน)**
- GenPanel (4 providers), scene→prompt, character anchor, reference sheet, pose picker/extract, WD14

**Phase 6 — เก็บกวาด + (option) แตก data model (1–2 วัน)**
- AI Log viewer, settings, import/export JSON
- (ทางเลือก) แตก chapters/characters เป็น collection แยก ลดการเขียนทับทั้งก้อน

> รวมประมาณ **10–16 วันทำงาน** (คนเดียว) — ทำทีละ Phase, แต่ละ Phase รันคู่กับของเดิมได้

---

## 7. เกณฑ์ "เสร็จ" (Definition of Done)
- ทุกแท็บเดิมใช้งานได้ครบ, autosave + optimistic lock ทำงาน
- เจนนิยาย/เจนรูป/reference sheet/pose ครบเหมือนเดิม
- เปิดสองแท็บแก้พร้อมกัน → แท็บเก่าโดน 409 ไม่ทับของใหม่ (เหมือนเดิม)
- `Export .md` ได้ไฟล์เหมือน `story-md.ts` เป๊ะ
- ไม่มีการเรียก provider key จากฝั่ง client
