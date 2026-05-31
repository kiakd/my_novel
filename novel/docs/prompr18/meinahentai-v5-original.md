# v5 — MeinaHentai v5 + prompt ต้นฉบับ anime ahegao (เทียบกับ v1)

**Result file:** `uploads/test/r18-meinahentai-v5/1779900655902_comfyui.png`
**Generated:** 2026-05-27
**Verdict:** ✅✅ ตรงตามต้นฉบับทั้งหมด — anime style, ahegao (eyes rolled + tongue out), bunny ears, cyber collar, pink bunny bottom, fishnet, massive nipples, cum overflowing, cyberpunk bedroom, pink-cyan lighting ครบ
**สำคัญ:** anime-trained + NSFW-tuned model **ตอบ booru tag (`rating:explicit`, `ahegao`, `cum on body`) ได้ตรงตัว** ขณะที่ DreamShaper (photoreal) ทำให้หน้าออกปีศาจ — สรุปคือ prompt style ต้อง match กับ training style ของ model

## Params (ตาม recommended ของ Meina)
- **Model:** `meinahentai_v5Final.safetensors` (SD1.5 anime NSFW, ~2 GB) — symlink จาก `~/Downloads/`
- **Resolution:** 512 × 768 (recommended จาก model author)
- **Steps:** 24 (recommended 20-40 with Euler a)
- **CFG Scale:** 7 (recommended)
- **Sampler / Scheduler:** `euler_ancestral` / `normal` (ตรงกับ recommended "Euler a")
- **Clip Skip:** 2 (recommended) — **⚠️ ComfyUI workflow ปัจจุบันยังไม่รองรับ Clip Skip ต้องเพิ่ม `CLIPSetLastLayer` node** ใน `image-gen.ts` ถ้าจะใช้
- **Prompt executed:** 80.54s (per-step ~2.8s steady, ทรง steady-state ดีมาก)
- **API total:** 85s

## Positive Prompt (verbatim จาก image-gen.md line 222)
```
nsfw, rating:explicit, masterpiece, best quality, absurdres, ultra detailed, cyberpunk anime style, 1girl, beautiful cool tomboy, short messy black hair, glowing crimson cyber eyes rolled back completely, intense ahegao, eyes rolled up in ecstasy, mouth stretched wide open, overflowing with thick white semen mixed with glossy saliva, massive cum and drool pouring down chin onto bare breasts, tongue hanging out, heavy blushing, kneeling submissively on luxurious bed, topless, completely bare breasts, fully exposed breasts, detailed realistic pink erect nipples, natural pink nipples, massive huge glistening breasts, breasts covered in cum and saliva, athletic toned body, bright pink bunny suit bottom only, fishnet stockings, bunny ears headband, glowing cyber collar, inside high-end cyberpunk luxury bedroom, large windows with rainy neon city night, dramatic pink cyan lighting, explicit, messy oral creampie, detailed fluids, shiny wet skin
```

## Negative Prompt (recommended ของ Meina + face safety เสริม)
```
(worst quality, low quality:1.4), monochrome, zombie, (interlocked fingers:1.2), bad anatomy, bad hands, bad face, deformed face, extra fingers, fused fingers, missing fingers, text, watermark, signature, censored, mosaic, bar censor, child, loli, shota, underage, demonic, monster, alien, dead eyes
```

> Recommended ดั้งเดิมจาก model author: `(worst quality, low quality:1.4), monochrome, zombie, (interlocked fingers:1.2),` — สั้นมาก ผมเสริมส่วน face safety + anatomy + censorship/age ไว้กันพลาด

## Body JSON
```json
{
  "provider": "comfyui",
  "model": "meinahentai_v5Final.safetensors",
  "book": "test",
  "ch": "r18-meinahentai-v5",
  "prompt": "...(ดูด้านบน)...",
  "negative_prompt": "...(ดูด้านบน)...",
  "width": 512,
  "height": 768,
  "steps": 24,
  "cfg_scale": 7
}
```

## Comparison v1 (DreamShaper) ↔ v5 (Meina) — prompt เดียวกัน
| ด้าน | DreamShaper v1 | MeinaHentai v5 |
|---|---|---|
| Style | photoreal บังคับ | anime ตรงสไตล์ prompt |
| Ahegao + rolled eyes | ออกปีศาจ ตาเรือง | ตอบตรง stylized ahegao |
| Cum/fluid coverage | ออกบางส่วน | ครบเต็มที่ |
| Bunny suit + fishnet | งงๆ ครึ่งๆ | ครบ |
| Cyber collar | ไม่ออก | ออกชัด |
| Time / รูป | 73s | 80.54s |
| ขนาดไฟล์ | 565 KB | 245 KB (PNG อนิเมะ compress ได้ดี) |

## Lessons learned
1. **Booru-tag prompt ต้องคู่กับ booru-trained model** (NAI / Meina / AnythingV5 / AOM3 / Hassaku) ถ้ายัดเข้า photoreal model จะแตก
2. Meina anime ทำให้ "ahegao" "rolled eyes" ไม่ดูหลอน เพราะมันคือสไตล์ที่ model ฝึกมาตอบโดยตรง
3. Negative ของ Meina สั้นพอ — เพิ่ม face safety นิดเดียว (เพราะ tone หน้าคนละแบบกับ photoreal model)
4. Per-step time ใกล้เคียง DreamShaper เพราะ size model เท่ากัน (~2 GB) → **ไม่ต้องเลือกระหว่างสไตล์กับเวลา** สลับ model ได้ตามความเหมาะสมของฉาก
5. Clip Skip 2 ยังไม่ได้ใช้ — ถ้าอยากใช้ต้องแก้ workflow ใน `image-gen.ts` เพิ่ม `CLIPSetLastLayer` node (`stop_at_clip_layer: -2`) คั่นระหว่าง CheckpointLoader กับ CLIPTextEncode

## เมื่อไหร่ใช้ Meina แทน DreamShaper
- ฉาก anime, fantasy, hentai-style
- ฉาก ahegao / explicit-tag ที่ต้องการ obedience ต่อ booru tag
- เมื่ออยากให้ตัวละครคงสไตล์การ์ตูน ไม่ใช่ภาพถ่าย
- (กลับกัน ใช้ DreamShaper เมื่ออยากได้สไตล์ photo / cinematic / realistic skin)
