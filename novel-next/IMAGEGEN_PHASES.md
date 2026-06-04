# ImageGen Integration Phases (ต่อ gen pipeline เข้า UX/UI)

เชื่อม pipeline ที่พิสูจน์แล้วใน `novel/GEN_GUIDE.md` (Python scripts + ComfyUI :8188)
เข้ากับแอป Next (`novel-next` :3001) ผ่าน backend เดิม (`novel/server.ts` :3000)

## แผนผัง
```
ImageGenScreen.tsx ─► src/lib/api.ts ─► /api/image/* (server.ts) ─► image-gen.ts ─► ComfyUI :8188
```

## สถานะตั้งต้น (2026-05-31)
- FRONT `components/screens/imagegen/ImageGenScreen.tsx` — **mock** (setTimeout, POSES/PROVIDERS จาก mock-data)
- API `src/lib/api.ts` — ยังไม่มีเมธอด image
- BACK `novel/server.ts:567` `POST /api/image/generate`, `:584` `GET /api/image/list/:book/:ch` — มีจริง
- BACK `novel/image-gen.ts:244` `generateComfyUI()` — workflow พื้นฐาน (checkpoint+prompt+ControlNet) **ยังไม่มี LoRA stack/comic/video**

---

## Phase 1 — Backend: ขยาย workflow ให้รองรับ LoRA stack
**ไฟล์:** `novel/image-gen.ts`
- เพิ่มใน `ImageGenParams`: `loras?: {name:string; model:number; clip:number}[]`, `sampler?`, `scheduler?`, `clip_skip?`
- ใน `generateComfyUI()` ต่อ node `LoraLoader` เป็นลูกโซ่ก่อน CLIPTextEncode (ดูรูปแบบใน `novel/gen_cantarella_*.py`)
- ตั้ง default Illustrious: 832×1216, steps 28, cfg 5, `dpmpp_2m`/`karras`, checkpoint `wai_illustrious_v17.safetensors`
- เพิ่ม endpoint `GET /api/loras` (อ่าน `comfyui/ComfyUI/models/loras/`) + `GET /api/checkpoints`
**เสร็จเมื่อ:** ยิง `/api/image/generate` พร้อม `loras[]` แล้วได้ภาพ stack LoRA จริง

## Phase 2 — Frontend: เลิก mock ต่อ API จริง
**ไฟล์:** `src/lib/api.ts`, `components/screens/imagegen/ImageGenScreen.tsx`, `GenTile.tsx`
- `api.ts`: เพิ่ม `generateImage(params)`, `listImages(book,ch)`, `listLoras()`, `listCheckpoints()`
- `ImageGenScreen`: แทน `generate()` setTimeout ด้วยเรียก API จริง + poll/แสดงผลใน GenTile
- แทน `POSES`/`PROVIDERS` mock ด้วยข้อมูลจริง: **pose preset → trigger** (เช่น "Doggy"→`squatting_doggystyle`+tags) map ไว้ใน `src/lib/gen-presets.ts` ใหม่
- เพิ่ม **LoRA picker** (multi-select + slider น้ำหนัก) ในแผงตั้งค่า
**เสร็จเมื่อ:** กดปุ่มในหน้าเว็บ → เจนจริง → รูปขึ้นแกลเลอรี

## Phase 3 — Comic / Story mode
- BACK: endpoint `POST /api/image/comic` รับ story[] → เจนทีละช่อง + compose (port `gen_cantarella_story.py`+`compose_manga_page.py` มาเป็น TS หรือ spawn python)
- FRONT: หน้า/แท็บ comic — ป้อน story หลายช่อง, เลือกเลย์เอาต์, ใส่บทพูด bubble
- ใส่ข้อความจริงลง bubble (PIL overlay หรือ canvas ฝั่ง front)

## Phase 4 — Video (WAN) — งานยาว ต้องมี job queue
- BACK: `POST /api/video/generate` (T2V) + `/api/video/i2v` (VACE) — **คืน job_id ทันที** (เจนนาน 100-165s) + `GET /api/video/status/:id`
- FRONT: UI แบบ async — progress + แสดง .webp เมื่อเสร็จ
- ต้องรัน ComfyUI โหมด video (ไม่มี `--lowvram`, ดู `GEN_GUIDE.md`)

## Phase 5 — ฟีเจอร์ลึก (ดีไซน์ stub อยู่แล้ว)
- DMD2 fast toggle (8 steps cfg 1.0 lcm) — ปุ่ม draft/final
- reference sheet 6 มุม, pose extract/upload (ControlNet+DWPose ที่ลงไว้), WD14 tagger
- characters collection (เก็บ trigger/LoRA ต่อตัวละคร ใช้ซ้ำ)

---

## หมายเหตุการต่อ
- Backend คงเป็น `novel/server.ts` (ไม่พอร์ตมา Next) — Next rewrite `/api/*` ไป :3000 อยู่แล้ว (`next.config.mjs`)
- Pipeline จริง + พารามิเตอร์ทั้งหมดดู `novel/GEN_GUIDE.md` (single source of truth ของ workflow)
- ComfyUI API contract (POST /prompt, poll /history, GET /view) อยู่ใน GEN_GUIDE ข้อ 2
- เริ่มที่ **Phase 1+2** ก่อน (ภาพเดี่ยว + LoRA stack) ให้ครบวงจรเว็บ→เจนจริง แล้วค่อย comic/video
