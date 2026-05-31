# v7 — MeinaHentai v5 + ControlNet OpenPose (m-legs-spread preset)

**Result file:** `uploads/test/r18-meinahentai-v7-controlnet/1779903125684_comfyui.png`
**Generated:** 2026-05-28
**Pose preset:** `uploads/poses/m-legs-spread.png` (extracted skeleton จาก v6)
**Verdict:** ✅ **ControlNet ทำให้ asymmetric hand pose ออกมาได้จริง** — มือซ้ายชู V-sign ราว ๆ ใบหน้า, มือขวาลงล่างที่เป้า (ตามที่อยากได้ ที่ v6 ทำไม่ได้)
**M-legs spread:** ✓ ตรงเป๊ะ (skeleton บังคับโครงท่าทาง)
**ที่ยังไม่เพอร์เฟ็กต์:** ยังมี latex bodysuit คลุมส่วนบน + เป้าโดน fabric บัง (prompt + negative ปรับเพิ่มได้)

## Params
- **Model:** `meinahentai_v5Final.safetensors`
- **Resolution:** 512 × 768
- **Steps:** 24
- **CFG:** 7
- **Sampler / Scheduler:** `euler_ancestral` / `normal`
- **ControlNet model:** `control_v11p_sd15_openpose_fp16.safetensors` (689 MB, SD1.5)
- **Pose preset:** `poses/m-legs-spread.png` (768×512 skeleton PNG, 13 KB)
- **Pose strength:** 1.0
- **API total:** **327s** (รอบแรกหลัง restart — Meina reload + ControlNet load + sampling)
- **คาดการณ์รอบถัดไป:** ~110–130s (model cache ถ้าไม่ใช้ `--disable-smart-memory`) หรือ ~150–180s (ปัจจุบัน reload ทุกครั้ง)

## Body JSON
```json
{
  "provider": "comfyui",
  "model": "meinahentai_v5Final.safetensors",
  "book": "test",
  "ch": "r18-meinahentai-v7-controlnet",
  "prompt": "nsfw, rating:explicit, masterpiece, best quality, ... m legs, spread legs wide, (spreading own pussy with right hand:1.4), (peace sign with left hand:1.4), v sign, ...",
  "negative_prompt": "(worst quality, low quality:1.4), ...",
  "width": 512,
  "height": 768,
  "steps": 24,
  "cfg_scale": 7,
  "pose_image": "poses/m-legs-spread.png",
  "pose_strength": 1.0
}
```

## Pipeline ที่ใช้
1. `image-gen.ts` รับ `pose_image` + `pose_strength` (เพิ่มเข้า workflow)
2. Workflow เพิ่ม 3 node: `LoadImage` (skeleton) → `ControlNetLoader` → `ControlNetApply` ที่คั่นระหว่าง `CLIPTextEncode` (positive) กับ `KSampler`
3. ComfyUI `input/poses/` symlink → `~/dru/novel/uploads/poses/` ⇒ skeleton ใหม่เซฟผ่าน Novel server มองเห็นทันที

## เทียบกับ v6 (ไม่มี ControlNet)
| ด้าน | v6 | v7 (+ ControlNet) |
|---|---|---|
| M-legs spread | ✓ | ✓ (เป๊ะกว่า เพราะ skeleton บังคับ) |
| Asymmetric hand (ซ้ายชู / ขวาแหวก) | ✗ ทั้งสองมือชู | ✓ ซ้ายชู V / ขวาลงล่าง |
| Bunny ears + collar | ✓ | ✓ |
| Topless | บางส่วน | บาง (latex บังหน้าอก) |
| Pussy exposed | บางส่วน | บางส่วน (fabric บัง) |
| Cyberpunk room | ✓ | ✓ ชัดเจน neon ดี |
| เวลา | 91s | 327s (รอบแรก — รวม load ControlNet) |

## ทดลองต่อ — Tuning ที่น่าลอง
1. **เพิ่ม weight เปลือยหน้าอก:** `(topless:1.5), (bare breasts visible:1.4), (no clothing on torso:1.3)` + negative `(latex top:1.4), (bodysuit:1.4)`
2. **ลด pose_strength ลง 0.7–0.8** — ให้ skeleton เป็น guideline ไม่บังคับ 100% เผื่อ model วาด anatomy ลื่นกว่า
3. **เปลี่ยน controlnet_model เป็น `control_v11p_sd15_openpose_fp16` ตัวเดิม** หรือทดสอบ ControlNet anime-specific (`control_v1u_sd15_animal_openpose`)
4. ลองเพิ่ม Latent Upscale + Hires fix หลัง KSampler — แก้รายละเอียดมือ/นิ้วที่ยังไม่ชัด

## วิธีสร้าง pose preset ใหม่
**ผ่าน UI (จากแกลเลอรี่):**
1. เปิด tab 🖼️ เจนรูป
2. ในแกลเลอรี่บทใดๆ คลิกปุ่ม **"จับ pose จากรูปนี้"** ใต้ thumbnail
3. ตั้งชื่อ (a-z 0-9 _ -)
4. รอ ~40s → preset ใหม่ปรากฏใน Pose template card

**ผ่าน API ตรง:**
```bash
curl -X POST http://localhost:3000/api/poses/extract \
  -H 'Content-Type: application/json' \
  -d '{"source_url":"/uploads/test/r18-dreamshaper-v4/1779900368185_comfyui.png","name":"kneeling-back-on-heels"}'
```
