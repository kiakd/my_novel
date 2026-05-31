# Scene → Image Pipeline (Design Doc)

**สถานะ:** Design / not implemented yet
**Reviewers:** user
**Decisions ที่ได้แล้ว:**
- ตัวละครหลักในรูป ≤ 2 คน (พระเอก + นางเอก) — case ส่วนน้อยมีตัวประกอบไม่มีหน้า (เห็นแค่ขา/อวัยวะ)
- Camera angle เน้นสไตล์ manga: selfie portrait, high angle (กอด/ทับ), missionary/mounting, ฯลฯ
- เริ่มจากเขียน design ก่อน implement
- รองรับทั้ง R18 และ ฉากต่อสู้/combat

---

## 1. เป้าหมาย

แปลงฉากบรรยายไทยจากบทละคร → SD prompt → ComfyUI gen รูป โดย:
1. **ตัวละครหน้าตา/ทรงผม/รูปร่างคงที่** ทุกรูป (consistency)
2. **มุมกล้องสไตล์ manga** ตามที่ user ใช้บ่อย (selfie, high angle, mounting, close-up)
3. **รองรับ multi-character** โดยเลี่ยงปัญหา face leak (กลยุทธ์: หันหน้าตัวเอกหลัก ตัวอีกคนแสดงจากด้านหลัง/ข้าง/ POV)
4. **เลือก pose preset อัตโนมัติ** ตามฉาก (oral / mounting / combat / ฯลฯ)
5. **เก็บ metadata ของรูป** ผูกกับ chapter + scene excerpt เพื่อทำ variation/re-render ได้

---

## 2. Use Case Catalogue (จากที่ user ระบุ)

### 2.1 Solo — นางเอกคนเดียวโพสท่า
- **ความถี่:** บ่อยรอง
- **ตัวอย่าง:** posing บนเตียง, M-legs presenting, อาบน้ำ, ยืน selfie
- **กลยุทธ์:** 1-character prompt + pose preset จาก `solo/`
- **Camera:** selfie / front / low angle / high angle
- **ปัญหาที่ต้องระวัง:** ไม่มี (case ง่ายสุด)

### 2.2 Couple — พระเอก + นางเอก (use case หลัก)
- **ความถี่:** บ่อยที่สุด
- **ตัวอย่าง:** กอด, จูบ, mounting, missionary, oral
- **กลยุทธ์ป้องกัน face leak:**
  - Default: หน้านางเอกชัดเต็ม, พระเอกแสดงจาก back/side/POV (ไม่เห็นหน้าเต็ม)
  - มี toggle "หน้านางเอก" / "หน้าพระเอก" / "ทั้งคู่" (ทั้งคู่ = เสี่ยง face leak — มี option ใช้ regional prompt ใน phase หลัง)
- **Camera ที่ใช้:** high angle (สำหรับ mounting/hug), POV (สำหรับ oral), side view (สำหรับ missionary)
- **prompt pattern:**
  ```
  {heroine_anchor}, {hero_back_view_descriptor}, {action}, {camera_angle}, ...
  negative: (two faces:1.4), (multiple distinct faces:1.3), ...
  ```

### 2.3 Gangbang — นางเอก + ตัวประกอบไม่มีหน้า
- **ความถี่:** น้อย
- **ตัวอย่าง:** นางเอกถูกหลายคนรุม, เห็นแค่ขา/มือ/อวัยวะของตัวประกอบ
- **กลยุทธ์:** prompt explicit "faceless men" / "out of frame faces" / ระบุจำนวน "two men" / "three men"
- **prompt pattern:**
  ```
  {heroine_anchor}, surrounded by faceless men, multiple penises from off-frame, focus on heroine's face and body, ...
  negative: (faces of other people:1.5), (multiple distinct faces:1.4), full body of side characters
  ```

---

## 3. Camera Angle Library (สำหรับ Novel นี้)

| Slug | ใช้กับฉาก | SD Tag |
|---|---|---|
| `selfie` | นางเอกถ่ายเอง โพสให้กล้อง | `selfie, looking at viewer, holding camera, POV camera, first person view, arm out of frame` |
| `phone-portrait` | ภาพคล้ายถ่ายมือถือ ไม่ถือกล้องเอง | `cellphone photo quality, portrait orientation, looking at viewer, candid pose, vertical composition` |
| `high-angle-hug` | พระเอกกอดนางเอก มุมสูง | `high angle shot, from above, two people embracing, focus on woman's face, man seen from behind` |
| `mounting-top-down` | พระเอกทับนางเอกอยู่บน | `from above, high angle, man on top of woman, woman lying on back beneath, focus on woman's face, man's back visible` |
| `missionary-side` | missionary มุมข้าง | `side view, missionary position, woman lying on back legs apart, man between her legs from side angle` |
| `pov-oral` | POV ฝ่ายชาย รับ oral | `POV shot from male perspective, looking down at her face, she is performing fellatio, only male hands and lap visible` |
| `pov-cowgirl` | POV ฝ่ายชาย ใต้นางเอก | `POV from below, woman riding on top of viewer, looking down at camera, low angle` |
| `over-shoulder` | สนทนา/กอด มุมจากข้างหลังคนหนึ่ง | `over the shoulder shot, focus on facing character, partial shoulder of other character in foreground` |
| `close-up-face` | เน้นใบหน้า | `close-up shot, face focus, detailed eyes, shallow depth of field` |
| `cowboy-shot` | ครึ่งตัว (manga คลาสสิก) | `cowboy shot, waist up, dynamic pose` |
| `full-body` | เต็มตัวเห็น pose | `full body shot, complete view from head to toe` |
| `combat-low-angle` | ฉากสู้ มุมต่ำดูใหญ่ | `low angle dynamic shot, action pose, dramatic lighting, motion blur on weapon` |
| `combat-side-action` | ฉากสู้ มุมข้าง | `side view action shot, mid-strike pose, dynamic motion lines` |

> เก็บเป็น `camera_angles.json` ที่ฝั่ง backend ใช้ map slug → SD tag เวลา compose prompt

---

## 4. Character.visual Schema

### 4.1 ขยาย `Character` interface (prompts.ts)

```ts
export interface CharacterVisual {
  // Hard rule
  age: number;                       // ≥ 18 — system reject ถ้าน้อยกว่า

  // Basic identity
  gender: 'female' | 'male';
  bodyType: string;                  // 'slim athletic', 'curvy', 'petite', ...
  skinTone: string;                  // 'fair', 'olive', 'tan', 'pale', ...

  // Face (consistency-critical)
  hair: string;                      // 'long platinum blonde, straight, side bang covering right eye'
  eyes: string;                      // 'violet eyes, sharp gaze'
  faceFeatures: string;              // 'delicate features, small mole below left eye, soft jawline'

  // Body (R18-relevant)
  bust?: string;                     // 'medium natural breasts, soft pink areola'
  marks?: string;                    // 'pointed elf ears, small scar on left collarbone'

  // Wardrobe
  defaultOutfit: string;             // ใส่ตอน gen แบบมาตรฐาน
  alternativeOutfits?: { name: string; tags: string }[];  // 'sleepwear', 'combat', 'formal'
  accessories: string;               // ของที่ใส่ตลอด (collar, pendant, ring)

  // Style preferences
  stylePreference: 'anime' | 'photoreal';
  modelPreference?: string;          // 'meinahentai_v5Final.safetensors' (override default)

  // Anchor strings (final ready-to-use)
  promptAnchor: string;              // DNA ของตัวละคร — prepend ทุกรูป
  negativeAnchor: string;            // negative ที่ต้องห้ามเสมอ (เช่น flat chest ถ้าตัวละครหน้าอกใหญ่)
}

export interface Character {
  // ...fields เดิม...
  visual?: CharacterVisual;          // optional — character ที่ไม่ใช้ gen รูปไม่ต้องมี
}
```

### 4.2 ตัวอย่างของ "โฟล์เทียร์"
```json
{
  "name": "โฟล์เทียร์",
  "visual": {
    "age": 22,
    "gender": "female",
    "bodyType": "slim, soft body, hourglass figure",
    "skinTone": "fair pale skin",
    "hair": "long platinum blonde hair, straight, blunt cut bangs",
    "eyes": "large violet eyes, doe-eyed, long lashes",
    "faceFeatures": "delicate features, small mole below left eye, soft jawline, full lips",
    "bust": "medium natural breasts, soft pink areola, natural nipples",
    "marks": "pointed elf ears (subtle)",
    "defaultOutfit": "white silk nightgown, no underwear",
    "alternativeOutfits": [
      { "name": "combat", "tags": "light leather armor, leg guards, dagger at hip" },
      { "name": "casual", "tags": "white blouse, beige skirt, brown boots" }
    ],
    "accessories": "thin silver pendant always worn",
    "stylePreference": "anime",
    "modelPreference": "meinahentai_v5Final.safetensors",
    "promptAnchor": "1girl, slim hourglass body, age 22, long platinum blonde hair with blunt bangs, large violet doe eyes, small mole below left eye, fair pale skin, medium natural breasts, soft pink areola, subtle pointed ears, thin silver pendant",
    "negativeAnchor": "flat chest, plain ears, brown hair, blue eyes, dark skin, multiple moles, neon nipples"
  }
}
```

### 4.3 ตัวอย่างของ "กร"
```json
{
  "name": "กร",
  "visual": {
    "age": 28,
    "gender": "male",
    "bodyType": "tall muscular, broad shoulders, lean waist",
    "skinTone": "warm tan",
    "hair": "short black hair, slightly messy, undercut",
    "eyes": "dark grey eyes, sharp",
    "faceFeatures": "strong jawline, light stubble, calm expression",
    "marks": "tribal tattoo on right shoulder blade",
    "defaultOutfit": "black dress shirt unbuttoned, dark trousers",
    "accessories": "silver ring on left thumb",
    "stylePreference": "anime",
    "promptAnchor": "1boy, tall muscular man, age 28, broad shoulders lean waist, short black messy hair undercut, dark grey sharp eyes, light stubble, warm tan skin, tribal tattoo on right shoulder",
    "negativeAnchor": "feminine face, beard, child, short height"
  }
}
```

### 4.4 promptAnchor — ใครเขียน
- **Default:** LLM gen จาก visual fields อื่นๆ (auto-compose) → user แก้/lock
- มี endpoint `POST /api/character/generate-anchor` → ใช้ DeepSeek/OpenRouter
- เก็บ version history เผื่อ rollback

---

## 5. Pose Preset Library — โครงสร้างใหม่

### 5.1 File tree
```
uploads/poses/
├── _meta.json                     ← metadata ทุก preset (category, description, intended_chars)
├── solo/
│   ├── m-legs-spread.png          ← ที่มีอยู่ (ย้าย)
│   ├── kneeling-presenting.png
│   ├── standing-selfie.png
│   └── lying-back-relaxed.png
├── couple/
│   ├── hug-standing.png
│   ├── mounting-top-down.png      ← พระเอกทับนางเอก
│   ├── missionary-side.png
│   ├── cowgirl.png
│   └── doggy-side.png
├── oral/
│   ├── kneeling-bedside-pov.png
│   ├── kneeling-floor-side.png
│   └── deepthroat-side.png
├── gangbang/
│   ├── surrounded-3men.png
│   └── on-knees-2men.png
└── combat/
    ├── sword-stance-side.png
    ├── casting-spell.png
    └── mid-strike-low-angle.png
```

### 5.2 `_meta.json` format
```json
{
  "solo/m-legs-spread": {
    "category": "solo",
    "description": "M-legs spread, lying back, one hand on stomach, one near pussy",
    "intended_chars": 1,
    "intensity": "r18_explicit",
    "tags_hint": "m legs, spread legs, lying back, presenting"
  },
  "couple/mounting-top-down": {
    "category": "couple",
    "description": "Man on top of woman, high angle, woman's face fully visible",
    "intended_chars": 2,
    "intensity": "r18_explicit",
    "tags_hint": "from above, man on top, woman beneath, focus on woman's face"
  },
  "combat/sword-stance-side": {
    "category": "combat",
    "description": "Side view sword stance, dynamic action pose",
    "intended_chars": 1,
    "intensity": "sfw",
    "tags_hint": "side view, sword stance, action pose, dynamic"
  }
}
```

### 5.3 API change
```
GET /api/poses?category=oral&intensity=r18_explicit
→ { ok, poses: [ {name, url, cn_path, category, description, intended_chars, intensity, tags_hint} ] }
```

UI filter ด้วย category tabs

---

## 6. Scene → Prompt — LLM Pipeline

### 6.1 Endpoint
```
POST /api/scene-to-image-prompt
body: {
  scene_text: string,              // ย่อหน้าจากบท
  character_names: string[],        // pick from existing characters (1-2 หลัก)
  faceless_count?: number,          // จำนวนตัวประกอบไม่มีหน้า (default 0)
  focus_character: string,          // ใครเป็นตัวหลักในภาพ (default = character_names[0])
  camera_angle?: string,            // slug จาก camera library (auto-detect ถ้าไม่ส่ง)
  style?: 'anime' | 'photoreal',    // default = focus_character.stylePreference
  intensity: 'sfw' | 'r18_soft' | 'r18_explicit',
  pose_preset?: string,             // optional override (cn_path)
  size?: { w: number, h: number },  // default = portrait 512×768
}
→ response: {
  positive: string,                 // full SD prompt
  negative: string,                 // full negative
  suggested_pose: string | null,    // best-match preset cn_path จาก library
  suggested_camera_angle: string,
  reasoning: string,                // อธิบายว่าทำไมเลือกแบบนี้ (debug/review)
  model: string,                    // ที่แนะนำ
  size: { w, h },
  steps: number,
  cfg: number
}
```

### 6.2 System prompt ของ LLM (ภายใน)
```
คุณคือ Stable Diffusion prompt engineer สำหรับ Meina/anime model
หน้าที่:
1. อ่านฉากภาษาไทยและ character profile
2. ผลิต SD prompt ที่:
   - ขึ้นต้นด้วย {focus_character.promptAnchor}
   - ตามด้วย camera_angle tag
   - ตามด้วย pose/action tag (จากบรรยาย)
   - ตามด้วย mood/emotion/lighting/setting
   - ลงท้ายด้วย quality booster (masterpiece, best quality, absurdres)
3. ถ้ามี character ตัวที่ 2:
   - default: หันหลัง/POV/บัง — ไม่ให้เห็นหน้าเต็ม
   - ใส่ negative `(two faces:1.4), (multiple distinct faces:1.3)`
4. ถ้ามี faceless_count > 0:
   - ระบุจำนวน "{n} faceless men"
   - ใส่ negative `(faces of side characters:1.5), full body of background men`
5. R18 rules:
   - ใช้ tag ที่ไม่ทำหัวนม neon/sticker (natural nipples, soft areola — ห้าม pink nipples)
   - ห้ามใส่ shiny wet skin (ใช้ dewy skin แทน)
   - ใส่ negative ป้องกัน plastic/painted/neon
6. เลือก pose preset จาก library ที่ใกล้บรรยายที่สุด — ตอบ slug, ถ้าไม่มีตอบ null
7. ตอบ JSON เท่านั้น
```

### 6.3 ตัวอย่าง — ฉาก oral ของ user
**Input:**
```json
{
  "scene_text": "โฟล์เทียร์มองหน้าเขา แล้วก็พยักหน้าช้าๆ เธอขยับตัวมาริมเตียง ก้มหน้าลงมา มือจับโคนของ... [ตัด] เธอเริ่มขยับเป็นจังหวะ ช้าๆ แต่สม่ำเสมอ ...",
  "character_names": ["โฟล์เทียร์", "กร"],
  "focus_character": "โฟล์เทียร์",
  "intensity": "r18_explicit",
  "camera_angle": "pov-oral"
}
```

**Output (สิ่งที่ LLM ควรผลิต):**
```json
{
  "positive": "nsfw, rating:explicit, masterpiece, best quality, absurdres, ultra detailed, 1girl, slim hourglass body, age 22, long platinum blonde hair with blunt bangs, large violet doe eyes, small mole below left eye, fair pale skin, medium natural breasts, soft pink areola, subtle pointed ears, thin silver pendant, kneeling at bedside, leaning forward, mouth around penis, performing fellatio, looking up at viewer, slight blush, gentle expression, soft inexperienced touch, hand at base of shaft, other hand on man's thigh, POV shot from male perspective, looking down at her face, only male hands and lap visible, dim bedroom lighting, intimate atmosphere, soft warm light",
  "negative": "(two faces:1.4), (multiple distinct faces:1.3), (painted nipples:1.4), (neon nipples:1.4), pasties, sticker, plastic skin, shiny wet plastic, (worst quality, low quality:1.4), monochrome, zombie, bad anatomy, bad hands, deformed face, extra fingers, fused fingers, text, watermark, censored, mosaic, child, loli, shota, underage, flat chest, plain ears, brown hair, blue eyes",
  "suggested_pose": "poses/oral/kneeling-bedside-pov.png",
  "suggested_camera_angle": "pov-oral",
  "reasoning": "ฉาก oral นางเอกที่ริมเตียง — เลือก POV จากพระเอก เห็นหน้านางเอกเต็ม ไม่มี face leak. ใช้ทรงผมและตาตามตัวอย่าง. ใส่ gentle/inexperienced ตาม narrative ('ลองขยับลิ้นอย่างระมัดระวัง').",
  "model": "meinahentai_v5Final.safetensors",
  "size": { "w": 512, "h": 768 },
  "steps": 24,
  "cfg": 7
}
```

ผู้ใช้กดยืนยัน → ไปต่อที่ `/api/image/generate` ปกติ (เพิ่ม `pose_image` ถ้ามี suggested_pose)

---

## 7. UI Design

### 7.1 ทาง A — Scene Generator Card (Image tab)
เพิ่ม card ใน tab 🖼️ เจนรูป ก่อน "Prompt" card เดิม:

```
┌─ Scene → Image (auto-prompt) ────────────────────────────┐
│  📝 ฉาก (paste ย่อหน้าจากบท):                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ โฟล์เทียร์มองหน้าเขา แล้วก็พยักหน้าช้าๆ ...           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                            │
│  👥 ตัวละครในรูป:  [☑ โฟล์เทียร์ (หลัก)] [☑ กร]            │
│      Faceless extras: [0 ▾]                                │
│                                                            │
│  📷 Camera angle: [pov-oral ▾]   (auto-detected)            │
│  🎭 Intensity:    [r18_explicit ▾]                          │
│  🎨 Style:        [anime ▾]                                  │
│                                                            │
│  [ ✨ Auto prompt (LLM)  ]   [ ⚡ เจนเลย ]                    │
└────────────────────────────────────────────────────────────┘
```

- กด "Auto prompt" → เรียก `/api/scene-to-image-prompt` → fill ลง prompt/negative/pose/size card ด้านล่าง + แสดง `reasoning` เป็น collapsible
- กด "เจนเลย" = auto prompt + ส่งเข้า image gen pipeline ทันที (skip review)
- prompt/negative ที่ได้แก้ต่อได้ก่อนเจน

### 7.2 ทาง B — Character Library (Sidebar tab ใหม่)
tab ใหม่ "👤 Characters" เก็บ visual schema ของแต่ละตัว

```
┌─ Character: โฟล์เทียร์ ──────────────────────────────┐
│  Name: [โฟล์เทียร์         ]                         │
│  ── Visual (สำหรับ AI image) ──────────────────────  │
│  Age:        [22]                                    │
│  Gender:     [female ▾]                              │
│  Body type:  [slim hourglass body, fair pale skin]   │
│  Hair:       [long platinum blonde, blunt bangs]     │
│  Eyes:       [large violet doe eyes]                 │
│  Face:       [delicate, mole below left eye]         │
│  Bust:       [medium natural, soft pink areola]      │
│  Marks:      [subtle pointed ears]                   │
│  Outfit:     [white silk nightgown, no underwear]    │
│  Accessories:[thin silver pendant]                   │
│  Style:      [anime ▾]  Model: [meinahentai_v5 ▾]    │
│                                                       │
│  📝 Prompt Anchor (DNA):                              │
│  ┌──────────────────────────────────────────────┐    │
│  │ 1girl, slim hourglass body, age 22, long...  │    │
│  └──────────────────────────────────────────────┘    │
│  [ 🤖 Generate anchor from fields ]                   │
│                                                       │
│  📝 Negative Anchor:                                  │
│  [flat chest, plain ears, brown hair, ...]            │
│                                                       │
│  🎬 Test Render: [ Quick test ✨ ]                    │
└──────────────────────────────────────────────────────┘
```

ปุ่ม "Quick test" → ส่ง promptAnchor + default outfit + simple pose (standing) → gen ทันที เห็นว่า anchor วาดแล้วได้หน้าที่ต้องการไหม

### 7.3 ทาง C — Pose Library Browser (เพิ่มจาก v7)
ขยายการ์ด "Pose template" ใน image tab:

```
┌─ Pose template ─────────────────────────────────────┐
│  [ทั้งหมด] [solo] [couple] [oral] [combat] [casual]  │
│  ─────────────────────────────────────────────       │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                       │
│  │🧘│ │🧎│ │💑│ │🤺│ │🚶│ │🛋│                        │
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                       │
│  m-leg knee  mount sword stand sit                    │
│                                                       │
│  Selected: ✓ couple/mounting-top-down                 │
│  Strength: [████████──] 1.0                           │
│  [ เคลียร์ pose ]                                      │
└──────────────────────────────────────────────────────┘
```

---

## 8. Multi-character Strategies (สำคัญ)

### Strategy 1: Hide-the-face (default สำหรับ couple)
- prompt ให้พระเอกหันหลัง / มุม POV / ครึ่งตัวด้านล่าง / มือ-แขนเข้าเฟรม
- pose preset เลือกตัวที่ skeleton มีคน 2 แต่หน้าหันออก
- negative: `(two faces:1.4), (multiple distinct faces:1.3)`
- ตัวอย่าง pose: `mounting-top-down`, `hug-from-behind`, `pov-oral`

### Strategy 2: Faceless extras (gangbang)
- prompt: `surrounded by N faceless men`, `out of frame faces`
- focus on heroine — body parts ของชายอื่นใส่ไม่เกินสะดือ (เห็นแค่ขา/มือ/อวัยวะ)
- pose preset จาก `gangbang/` (skeleton heroine ตรงกลาง คนอื่นรอบๆ)
- negative: `(faces of other men:1.5), (background characters with faces:1.4)`

### Strategy 3: Both faces visible (advanced — phase 5+)
- ต้อง **Regional Prompting** custom node — split canvas ซ้าย/ขวา หรือ บน/ล่าง
- ใส่ promptAnchor ตัวที่ 1 ครึ่งซ้าย, ตัวที่ 2 ครึ่งขวา
- เสี่ยง face leak บ้างแต่ดีกว่าใส่รวมกัน
- ใช้ตอนจำเป็น เช่น scene "พระเอกจูบนางเอก" close-up

---

## 9. Image Metadata Sidecar

แต่ละรูปที่เจน เก็บ `.json` คู่กับ `.png`:
```
uploads/{book}/{ch}/{ts}_comfyui.png
uploads/{book}/{ch}/{ts}_comfyui.json
```

`{ts}_comfyui.json`:
```json
{
  "generated_at": "2026-05-28T01:23:45Z",
  "chapter_id": "ch01",
  "book_slug": "my-novel",
  "scene_excerpt": "โฟล์เทียร์มองหน้าเขา แล้วก็พยักหน้าช้าๆ ...",
  "characters": ["โฟล์เทียร์", "กร"],
  "focus_character": "โฟล์เทียร์",
  "faceless_count": 0,
  "camera_angle": "pov-oral",
  "intensity": "r18_explicit",
  "style": "anime",
  "model": "meinahentai_v5Final.safetensors",
  "prompt": "...",
  "negative": "...",
  "pose_image": "poses/oral/kneeling-bedside-pov.png",
  "pose_strength": 1.0,
  "width": 512, "height": 768,
  "steps": 24, "cfg": 7,
  "seed": 3368277072,
  "llm_reasoning": "..."
}
```

### ประโยชน์
- **Re-render** ด้วย seed เดิม → variation ของรูปเดิม (ปรับ prompt เล็กน้อย)
- **Trace** ว่ารูปนี้มาจากฉากไหน บทไหน
- **Share preset** export prompt+pose ไปใช้ที่อื่น
- **Stats** วัดว่าตัวละครไหนถูกเจนบ่อย, intensity ไหนเยอะ, model ไหนได้ผลดี

---

## 10. API Surface (สรุป)

| Method | Endpoint | หน้าที่ | Phase |
|---|---|---|---|
| GET | `/api/characters` | list ตัวละคร (มี visual schema) | 1 |
| PUT | `/api/characters/:name` | update character + visual | 1 |
| POST | `/api/characters/:name/generate-anchor` | LLM gen promptAnchor จาก fields | 1 |
| POST | `/api/characters/:name/test-render` | quick gen ทดสอบ anchor | 1 |
| POST | `/api/scene-to-image-prompt` | LLM แปลงฉาก→prompt | 2 |
| GET | `/api/poses?category=...` | list poses (filtered) | 4 |
| POST | `/api/poses/extract` | (มีแล้ว) extract skeleton จากรูป | done |
| POST | `/api/image/generate` | (มีแล้ว) เจนรูป — เพิ่ม metadata write | 6 |
| GET | `/api/image/metadata/:filename` | อ่าน sidecar JSON ของรูป | 6 |
| POST | `/api/image/rerender/:filename` | re-render ด้วย metadata เดิม (เปลี่ยน seed/prompt) | 6 |

---

## 11. Implementation Phases

| # | Phase | งาน | Output | Effort |
|---|---|---|---|---|
| 1 | **Character.visual** | ขยาย schema + UI editor + LLM generate-anchor + quick test | gen รูปจาก promptAnchor ของแต่ละตัวได้แม่น | M |
| 2 | **Scene→Prompt LLM** | endpoint + system prompt + UI scene textarea | กรอกฉาก กดปุ่ม → ได้ prompt+pose | L |
| 3 | **Multi-char strategies** | hide-face / faceless logic ใน LLM system prompt + negative templates | คู่กอด/oral ไม่ face leak | M |
| 4 | **Pose library categorize** | reorganize folders + _meta.json + UI tabs | เลือก pose ตาม category ได้ | S |
| 5 | **Combat poses** | สร้าง preset combat 3-5 แบบ (extract จาก reference) | ฉากต่อสู้ใช้ได้ | S |
| 6 | **Metadata sidecar + re-render** | write JSON + endpoint อ่าน + ปุ่ม "Re-render" | trace ได้ + variation ทำง่าย | M |
| 7 | (future) **Regional prompting** | custom node + UI split canvas | 2 หน้าใน 1 รูป | L |

**Effort:** S = ครึ่งวัน, M = 1 วัน, L = 2-3 วัน

---

## 12. Decisions ที่ต้องเลือกก่อน implement

| # | คำถาม | Default ผม แนะนำ |
|---|---|---|
| Q1 | promptAnchor user เขียนเอง / LLM gen ให้? | **LLM gen + user lock** — เริ่มเร็ว + ปรับได้ |
| Q2 | Character editor เป็น tab ใหม่ หรือ extend ของเดิม? | Tab ใหม่ "👤 Characters" — แยกชัด ไม่ปนกับโครงเรื่อง |
| Q3 | Scene textarea ใน image tab พอ หรือต้อง integrate กับ chapter editor? | **เริ่มที่ image tab textarea** — phase 1 พอ, integrate กับ chapter ใน phase 5+ |
| Q4 | LLM model สำหรับ scene→prompt — DeepSeek หรือ OpenRouter? | DeepSeek (ถูกกว่า, ตอบเร็ว) — แต่ใช้ตัวที่มี key ตอนนี้ |
| Q5 | Combat scene ใส่ใน phase 1 เลย หรือไว้ทีหลัง? | **ทีหลัง (phase 5)** — focus R18 ก่อนเพราะ use case หลัก |
| Q6 | Regional prompting (2 หน้าในรูปเดียว) ทำหรือไม่? | **ไม่ทำใน 6 phase แรก** — ใช้ hide-face strategy ก่อน, ถ้าจำเป็นจริงค่อยเพิ่ม |
| Q7 | image metadata sidecar — .json คู่ .png พอ หรือเก็บใน MongoDB? | **JSON sidecar** — ไม่ต้อง migration, อ่านง่าย, backup ตรง |

---

## 13. ตัวอย่าง User Journey (End-to-end)

**Setup ครั้งเดียว:**
1. ไป tab 👤 Characters → สร้าง "โฟล์เทียร์" + กรอก visual fields → กด "Generate anchor" → AI ใส่ promptAnchor ให้ → กด "Quick test" → ออกหน้าตรงสไตล์ → lock
2. ทำเหมือนกันกับ "กร"

**Workflow เจนรูปทุกบท:**
1. เปิด tab 🖼️ เจนรูป → card "Scene → Image"
2. paste ย่อหน้าจากบท
3. คลิก checkbox "☑ โฟล์เทียร์ (หลัก)" "☑ กร"
4. เลือก camera angle = `pov-oral` (หรือปล่อย auto-detect)
5. เลือก intensity = `r18_explicit`
6. กด "✨ Auto prompt" → ดู prompt+negative+pose ที่ AI gen ให้ + reasoning → แก้ตามต้องการ
7. กด "เจนรูป" → 80-150s → ออกรูป + sidecar JSON
8. ไม่ชอบ? กด "Re-render" → เปลี่ยน seed อย่างเดียว หรือแก้ prompt แล้วเจนใหม่

---

## 14. Open Questions / TODO

- [ ] LLM prompt ภาษาไทย → SD English ต้องเทสว่า DeepSeek แปลทาง R18 ได้ดีไหม (อาจติด filter? — DeepSeek API ไม่ filter content แต่ภาษาที่ใช้อาจไม่เป็นธรรมชาติ)
- [ ] ทำ "Quick test render" สำหรับ character anchor ใช้ pose ไหน default (standing? cowboy shot?)
- [ ] Faceless gangbang — มี pose preset ใน library ที่ skeleton มีคนหลายคนได้ไหม หรือต้องวาดเอง
- [ ] ฉากต่อสู้: ค้นหาว่ามี reference image ที่ extract pose ได้ดีจากที่ไหน (manga panels? game screenshots?)
- [ ] Style consistency cross-image — ถ้าเจนหลายรูปต่อกันในบทเดียว ต้องการ visual consistency (lighting, color palette) ทำยังไง — บางที embed `LoRA style` ใส่ใน promptAnchor
- [ ] image metadata sidecar — ทำ migration tool ย้อนหลังให้รูปเก่าที่มีอยู่ไหม? (น่าจะไม่จำเป็น)

---

## 15. รอ Approve

อ่านแล้ว comment / answer Decisions section ได้ ผมจะ revise design นี้ตามคำตอบก่อน implement phase 1
