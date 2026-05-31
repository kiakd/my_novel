# Character + Pose Fidelity Workflow (Deep Research + Recommended Stack)

**Focus:** 2 ปัญหาเดียวเท่านั้น
1. **Character consistency** — หน้า/ผม/ชุดของตัวละครต้องตรงทุกรูป
2. **Pose fidelity** — ท่าทางที่บรรยายในบทต้องตรง

**Constraint หลัก:** Mac MPS, 8GB unified memory, ComfyUI 0.22, Meina v5 SD1.5 + DreamShaper SD1.5

**สถานะ:** Research + Design / not implemented yet

---

## 1. State-of-the-art ปี 2026 — เขาทำกันยังไง

### 1.1 Character consistency — 4 ระดับ (cheap → reliable)

| ระดับ | เทคนิค | Face Similarity | VRAM | เครื่องนี้ใช้ได้ไหม |
|---|---|---|---|---|
| L1 | Detailed prompt + seed lock (สถานะปัจจุบัน) | ~50-60% | บวก 0 | ✓ |
| L2 | **IP-Adapter FaceID** + reference image | **76-82%** | บวก ~3GB | **✓ (แนะนำหลัก)** |
| L3 | InstantID | 82-86% | บวก ~5-7GB | ✗ (เกิน 8GB budget เมื่อรวม Meina+CN) |
| L4 | PuLID | 88-93% | บวก ~8-10GB | ✗ (เกินขีดจำกัด) |
| L5 | **Character LoRA (trained)** | 90%+ | บวก ~50MB (inference) | ✓ (inference เท่านั้น — ต้อง train บน cloud) |

**Key insight:** บน Mac 8GB ทางเดียวที่ทำได้ปัจจุบันคือ **L1+L2 stacked** ส่วน L5 ทำในอนาคต (train บน cloud GPU)

### 1.2 Pose fidelity — Stacking ดีกว่า Single

| เทคนิค | ใช้กับอะไร | สถานะที่นี่ |
|---|---|---|
| ControlNet **OpenPose** | skeleton 18-point body + 21-point hands + face landmarks | ✓ มีแล้ว (v7) |
| ControlNet **Depth** | body volume / scene depth | ยังไม่ลง |
| ControlNet **Canny** | edge / silhouette | ยังไม่ลง |
| ControlNet **Reference** | full image reference (style+pose) | ยังไม่ลง |
| **Pose + Depth stacking** | combo ดีสุดสำหรับ action poses | ยังไม่ทำ |

**Key insight:** OpenPose แค่อย่างเดียว → asymmetric hand ทำได้ (v7 ยืนยัน) แต่ pose แอ็คชั่นเร็วๆ เช่นต่อสู้/มุมยาก ต้อง stack `Pose + Depth` (Depth ช่วย volume)

### 1.3 Pattern ที่แพลตฟอร์มอื่นใช้ — สรุปสั้น

| แพลตฟอร์ม | กลยุทธ์ | เอามาใช้ได้แค่ไหน |
|---|---|---|
| **SillyTavern** (chat character) | Character card = profile + 1 avatar + sprite set 28 emotions ที่ pre-generated | "Pre-gen reference sheet ครั้งเดียว แล้วใช้ตลอด" → ตรงกับแนวเรา |
| **AI Manga generators** (Jenova, ComicsAI) | สร้าง **Reference Sheet** (front/side/3-quarter, expressions, costumes) → ใช้เป็น base ทุก panel | "Reference sheet เป็น ground truth" — ใช้ได้ทันที |
| **TheaterGen** (paper, arXiv 2404) | LLM เป็น "Screenwriter" — เขียน prompt book ต่อ character ใส่ context การจำในแต่ละรอบ | ตรง pattern กับ scene→prompt LLM ที่เราออกแบบไว้ |
| **Realistic-Fantasy Network** (paper) | LLM gen layout bounding box ก่อน + detail prompt → diffusion ทำตาม | สำหรับ multi-character / composition complex — phase หลัง |

**Pattern เด่นที่ทุกแพลตฟอร์มทำ:**
> **"Character Reference Sheet"** — pre-generate ครั้งเดียว 6-12 รูปต่อ character → ใช้เป็น face ref สำหรับ IP-Adapter ในการเจนทุกครั้งหลังจากนั้น

นี่คือ workflow ที่เราต้องลง

---

## 2. Recommended Stack สำหรับโปรเจกต์นี้

```
┌─ Per character (ทำครั้งเดียว) ──────────────────────────┐
│                                                          │
│  visual fields (hair, eyes, body, ...)                   │
│     │                                                    │
│     ▼ LLM                                                │
│  promptAnchor (DNA string)                               │
│     │                                                    │
│     ▼ ComfyUI (Meina v5 + seed=fixed)                   │
│  Reference Sheet (6-12 รูป)                              │
│     • front portrait                                     │
│     • 3/4 left, 3/4 right                                │
│     • full body neutral                                  │
│     • 3 expressions (neutral, smile, intense)            │
│     • default outfit + alt outfits                       │
│     │                                                    │
│     ▼ user pick best 1-3 face shots                      │
│  face_refs/{char_name}/*.png                             │
│                                                          │
└──────────────────────────────────────────────────────────┘

┌─ Per scene gen (ทำทุกครั้ง) ────────────────────────────┐
│                                                          │
│  scene_text + character_names + camera + intensity       │
│     │                                                    │
│     ▼ LLM (DeepSeek/OpenRouter)                          │
│  prompt + negative + suggested_pose + suggested_camera   │
│     │                                                    │
│     ▼ ComfyUI workflow (เพิ่มจากที่มี)                    │
│  • CheckpointLoader (Meina v5 / DreamShaper)             │
│  • CLIPTextEncode(positive ที่รวม char_anchor)           │
│  • CLIPTextEncode(negative)                              │
│  • IPAdapterFaceID(face_ref={focus_char})  ◄── NEW       │
│  • ControlNetLoader(openpose) + Apply(pose_image)        │
│  • [optional] ControlNetLoader(depth) + Apply            │
│  • KSampler → VAEDecode → SaveImage + JSON sidecar       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 2.1 ทำไมไม่ใช้ InstantID/PuLID
- บน Mac 8GB unified memory
- Memory budget ที่มีตอนนี้: Meina 2GB + ControlNet 700MB + activations ~1.5GB = **~4.2GB ใช้แล้ว**
- IP-Adapter FaceID + insightface = +3GB → **~7.2GB total** (พอดี ปลอดภัย)
- InstantID = +5-7GB → 9-11GB → **OOM / swap หนัก**
- PuLID = +8-10GB → ใช้ไม่ได้บนเครื่องนี้

### 2.2 ทำไมไม่ทำ Character LoRA ตอนนี้
- Training ต้อง CUDA (Kohya_ss, sd-scripts ไม่รองรับ MPS เต็มที่)
- 1-4 ชั่วโมงต่อ character บน GPU จริง (RTX 3090/4090)
- ต้อง 15-50 รูป training set ต่อ character — แต่เรามีรูป character แค่ไม่กี่รูปตอนเริ่ม
- **เก็บไว้ phase หลัง** — เมื่อมีรูป reference สะสมพอ → train บน Replicate/Runpod/ColabPro

### 2.3 ทำไม Reference Sheet pattern ดีที่สุดสำหรับนิยาย
1. **Pre-gen ครั้งเดียว** — ไม่ต้อง re-compute identity ทุกรอบ
2. **User เลือก** — ถ้า reference ตัวไหนไม่สวย ทิ้งทำใหม่ ไม่เหมือน LoRA ที่ train เสร็จต้องใช้ทั้งหมด
3. **Reuse กับทุก gen** — IP-Adapter อ่าน face ref เดิม ใส่ scene ใหม่
4. **เปลี่ยน outfit ได้ใน prompt** — ไม่ติด identity ลงเสื้อผ้า (ปัญหาของ LoRA ที่ train รูปใส่ชุดเดียว)
5. **Multi-character ง่าย** — 2 IP-Adapter cascading (face ref ของพระเอก + ของนางเอก) ทำได้บน workflow เดียว

---

## 3. ใช้ Pattern นี้กับ AI Flow อื่นในโปรเจกต์ได้อย่างไร

User ถาม: "เพื่อให้นำไปปรับกับทุก flow ที่มีการเจน ai" — pattern **anchor + reference + per-modality control** ใช้ได้ทั่วไป

### 3.1 Text gen (เขียนบทนิยาย) — สถานะปัจจุบันมีอยู่แล้วบางส่วน
- **Anchor** = `Character.bio + appearance + speech_tone + mindset` (มีอยู่ใน `prompts.ts`) ← นี่คือ "DNA ภาษา" ของตัวละคร
- **Reference** = ตัวอย่าง dialogue ก่อนหน้าของตัวละคร (สามารถ inject `recent_chapters` เข้า context)
- **Control** = `mode` (novel/dialogue/r18) + `eventCurrent`

ที่ขาด: ระบบ retrieve "ตัวอย่างบทพูดที่ตัวละครเคยพูด" จาก chapter history ส่งกลับเข้า prompt → text consistency จะดีขึ้นมาก

### 3.2 Image gen — ที่กำลังจะลง (ตามเอกสารนี้)
- **Anchor** = `promptAnchor` (visual DNA)
- **Reference** = `face_refs/{char}/*.png` (IP-Adapter)
- **Control** = ControlNet pose + camera angle

### 3.3 (Future) Voice / TTS — ถ้ามีในอนาคต
- **Anchor** = voice characteristic description
- **Reference** = ตัวอย่างเสียง 30 วินาที (เป็น voice clone reference)
- **Control** = emotion tag, speed, pitch

### 3.4 (Future) Chat character mode
- **Anchor** = character system prompt (มีพร้อมใช้)
- **Reference** = chat history เก่า
- **Control** = current scene/mood/relationship state

**Universal pattern:**
```
output = AI_model(
  anchor: "ใครคือคนนี้ — DNA ที่ไม่เปลี่ยน",
  reference: "ตัวอย่างของคนนี้ที่เคยมี — pin identity ด้วย sample",
  control: "ตอนนี้อยากให้ทำอะไร/อยู่ในโหมดไหน — task-specific",
  context: "fresh input — บทใหม่/ฉากใหม่"
)
```

ทุก modality ต้องมี 4 ชั้นนี้

---

## 4. ขั้นตอน Implementation (focused on 2 ปัญหา)

### Phase 0: Lock current state (มีแล้ว ใช้งานได้)
- ✓ ComfyUI + Meina v5 + DreamShaper + ControlNet OpenPose
- ✓ Pose preset library + UI
- ✓ image-gen.ts รับ pose_image
- Phase 1+ จะเสริม IP-Adapter + Reference Sheet

### Phase 1: Lay foundation (ก่อนใส่ IP-Adapter)
1. **เพิ่ม `Character.visual` schema** + UI editor (ตาม design doc ก่อนหน้า)
2. **LLM endpoint `generate-anchor`** — สร้าง promptAnchor จาก fields
3. **LLM endpoint `scene-to-image-prompt`** — แปลงฉาก→prompt+negative+pose+camera
4. **UI Scene→Image card** ใน image tab

**Output:** เจนรูปจาก promptAnchor + ฉากได้ — แต่ identity ยังเปลี่ยนทุกรอบ (~50-60%)

### Phase 2: Reference Sheet generator
1. **UI ปุ่ม "Generate Reference Sheet"** ในการ์ด character editor
2. ปุ่มนี้เรียก gen 6 รูปติดกัน (front, 3/4 L, 3/4 R, full body, smile, intense) ด้วย:
   - promptAnchor (locked)
   - default outfit (locked)
   - seed = hash(character_name) → seed คงที่
   - pose preset จาก `reference/` (front-portrait, three-quarter, full-body)
   - lighting มาตรฐาน (`studio neutral lighting, plain background`)
3. เซฟที่ `uploads/characters/{name}/reference/`
4. UI ให้ user เลือก 1-3 รูปที่ดีสุด → mark เป็น `face_ref`

**Output:** มี Reference Sheet ของทุก character — ยัง identity ลอย แต่มี ground truth ไว้

### Phase 3: IP-Adapter FaceID integration
1. ลง custom node: `git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus` ใน `~/dru/comfyui/custom_nodes/`
2. ลง `insightface` Python package: `pip install insightface onnxruntime`
3. ดาวน์โหลด models:
   - `ip-adapter-faceid_sd15.bin` (~600MB) — main FaceID model
   - `ip-adapter-faceid_sd15_lora.safetensors` (~70MB) — pair LoRA
   - InsightFace `buffalo_l` (~280MB) — face detector
4. ทดสอบใน ComfyUI web UI ก่อน — ใช้ workflow `ip-adapter-faceid-SD1.5.json` reference
5. **แก้ `image-gen.ts`** เพิ่ม optional `face_ref` parameter ที่ inject 3 nodes:
   - `LoadImage` (face ref)
   - `IPAdapterFaceID` (loader)
   - `IPAdapterApplyFaceID` คั่นระหว่าง model + KSampler
6. **UI:** ปุ่ม "ใช้หน้า {character_name}" ใน Scene→Image card → auto-set `face_ref` ตาม `focus_character`

**Output:** identity match ~76-82% — ตัวละครหน้าเดิมทุกรอบ

### Phase 4: Pose + IP-Adapter combo + sidecar metadata
1. ตรวจสอบ workflow รวม IP-Adapter + ControlNet ใน 1 รอบ (ทั้งคู่ทำงาน parallel ได้)
2. Tune `ip_adapter_weight` (0.5-1.0) vs `controlnet_strength` (0.5-1.0) — balance ระหว่าง face fidelity และ pose fidelity
3. เพิ่ม JSON sidecar เก็บ metadata รูป (chapter, scene, char ref, pose, model, seed)

**Output:** ระบบครบทุกชิ้นสำหรับ R18 single + couple

### Phase 5: Multi-character (couple/gangbang)
1. รองรับ `face_refs` หลายอัน (cascade IP-Adapter หลายตัวใน workflow)
2. Hide-face strategy ใน LLM system prompt
3. Faceless extras logic
4. Combat pose preset + LLM rules สำหรับฉากแอ็คชั่น

### Phase 6: (Optional, far future) Character LoRA
- เก็บ Reference Sheet สะสม → เมื่อมี 20-30 รูปต่อ character → train LoRA บน cloud
- Drop `.safetensors` ลง `~/dru/comfyui/models/loras/`
- เพิ่ม `<lora:char_folter:0.8>` ใน promptAnchor → face similarity 90%+

---

## 5. Decision points

| # | คำถาม | แนะนำ |
|---|---|---|
| D1 | เริ่มจาก Phase 1 (LLM scene→prompt) หรือ Phase 3 (IP-Adapter) ก่อน? | **Phase 1 ก่อน** — ได้ workflow scene→image พื้นฐาน, Phase 3 ค่อยเสริม face fidelity ทับ |
| D2 | Reference Sheet ใช้ seed คงที่ (deterministic) หรือสุ่ม (variety แล้วเลือก)? | **คงที่ผมแนะนำ** — ใช้ `hash(char_name)` ทุกครั้งเหมือนเดิม จะได้ระบบ reproducible |
| D3 | IP-Adapter weight default = 1.0 หรือต่ำกว่า? | เริ่ม 0.8 — เผื่อพื้นที่ให้ scene prompt มีอิทธิพล |
| D4 | ทำ Phase 1+2 รวมกันใน sprint เดียว หรือแยก? | **รวม** — เพราะ Phase 2 ต้องใช้ promptAnchor จาก Phase 1 |
| D5 | Combat pose preset (Phase 5) — ดึง reference จากที่ไหน? | manga panel screenshot / game screenshot / ภาพถ่ายท่าศิลปะป้องกันตัว → preprocessor extract skeleton |

---

## 6. ของที่ต้อง download/install ตอน Phase 3 (รวบรวม)

```bash
# Custom node
cd ~/dru/comfyui/custom_nodes
git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git

# Python deps
source ~/dru/comfyui/venv/bin/activate
pip install insightface  # อาจติด build error บน Mac — มีทางแก้ใช้ wheel

# Models — ลงที่ ~/dru/comfyui/models/ipadapter/
# จาก https://huggingface.co/h94/IP-Adapter-FaceID/tree/main
- ip-adapter-faceid_sd15.bin            (~600 MB)
- ip-adapter-faceid_sd15_lora.safetensors (~70 MB)
- ip-adapter-faceid-plusv2_sd15.bin     (~600 MB) — v2 ดีกว่าเล็กน้อย

# InsightFace model (auto-download ครั้งแรกใช้ — ราว 280 MB)
# จะลงที่ ~/.insightface/models/buffalo_l/
```

รวมที่ต้องลง: ~**1.5 GB** (เพิ่มจาก ControlNet 689 MB ที่มีแล้ว)

---

## 7. งบประมาณเวลา (estimated)

| Phase | งาน | เวลา (1 dev) |
|---|---|---|
| 1 | Character.visual schema + LLM endpoint + UI scene-to-prompt | ~6-8 ชั่วโมง |
| 2 | Reference Sheet generator + storage + pick UI | ~3-4 ชั่วโมง |
| 3 | IP-Adapter integration + test workflow | ~4-6 ชั่วโมง (รวม download + debug Mac) |
| 4 | Pose+IPA combo tuning + metadata sidecar | ~3-4 ชั่วโมง |
| 5 | Multi-character + combat preset | ~6-8 ชั่วโมง |
| 6 | (future) Character LoRA pipeline | ~12-20 ชั่วโมง รวม cloud setup |

**Phase 1-4 ครบสำหรับ use case หลัก (single + couple R18):** ~16-22 ชั่วโมง

---

## 8. Resources / Sources

- [IP-Adapter FaceID vs InstantID vs PuLID comparison (Apatero, 2025)](https://apatero.com/blog/instantid-vs-pulid-vs-faceid-ultimate-face-swap-comparison-2025) — ตัวเลข VRAM + similarity
- [ComfyUI LoRA Training Character Consistency Guide 2026 (Apatero)](https://www.apatero.com/blog/comfyui-lora-training-character-consistency-guide-2026) — dataset + training requirements
- [SillyTavern Image Generation Documentation](https://docs.sillytavern.app/extensions/stable-diffusion/) — character card + sprite pattern
- [AI Manga Character Consistency (Jenova, 2026)](https://www.jenova.ai/en/resources/ai-manga-character) — reference sheet pattern
- [Lights, Camera, Consistency: Multistage Pipeline for Character-Stable AI Video (arXiv 2512.16954)](https://arxiv.org/html/2512.16954v1) — LLM screenwriter pattern
- [TheaterGen: Character Management with LLM (arXiv 2404.18919)](https://arxiv.org/html/2404.18919v1) — multi-turn character ID
- [ComfyUI_IPAdapter_plus (cubiq)](https://github.com/cubiq/ComfyUI_IPAdapter_plus) — Mac-compatible IP-Adapter implementation
- [IP-Adapter FaceID setup guide](https://ipadapterfaceid.com/) — installation tutorial
- [SD1.5 IP-Adapter FaceID workflow JSON (aimpowerment)](https://github.com/aimpowerment/comfyui-workflows/blob/main/ip-adapter-faceid-SD1.5.json) — reference ComfyUI workflow

---

## 9. รอ Approve

**คำถาม final ก่อนเริ่ม implement:**
1. Phase 1+2 ทำรวมกันใน sprint เดียวเลย หรือทำ Phase 1 อย่างเดียวก่อนเทส?
2. ถ้ามีรูป "โฟล์เทียร์" / "กร" จริงในใจ อยากให้ผมเริ่ม gen Reference Sheet ทันทีตอน Phase 2 หรือสร้าง character object เปล่าก่อน?
3. มี character อื่นนอกจากโฟล์เทียร์ + กร ที่อยากเริ่มทำพร้อมกันไหม?
