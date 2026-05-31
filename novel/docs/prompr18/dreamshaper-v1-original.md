# v1 — DreamShaper SD1.5 + prompt ต้นฉบับ anime ahegao

**Result file:** `uploads/test/r18-dreamshaper/1779899444461_comfyui.png`
**Generated:** 2026-05-27
**Verdict:** ❌ หน้าออกปีศาจ — model photoreal ไม่ตอบ booru tag (glowing eyes, ahegao, eyes rolled back) ทำให้ตาแดงเรืองและสัดส่วนเพี้ยน อย่างไรก็ตาม pipeline + model uncensored ทำงานปกติ

## Params
- **Model:** `DreamShaper_8_pruned.safetensors` (SD1.5 photoreal, ~2 GB)
- **Resolution:** 512 × 768
- **Steps:** 20
- **CFG Scale:** 7
- **Sampler / Scheduler:** `euler_ancestral` / `normal` (จาก image-gen.ts hardcode)
- **Prompt executed:** 73.19s / API total 76s

## Positive Prompt
```
nsfw, rating:explicit, masterpiece, best quality, absurdres, ultra detailed, cyberpunk anime style, 1girl, beautiful cool tomboy, short messy black hair, glowing crimson cyber eyes rolled back completely, intense ahegao, eyes rolled up in ecstasy, mouth stretched wide open, overflowing with thick white semen mixed with glossy saliva, massive cum and drool pouring down chin onto bare breasts, tongue hanging out, heavy blushing, kneeling submissively on luxurious bed, topless, completely bare breasts, fully exposed breasts, detailed realistic pink erect nipples, natural pink nipples, massive huge glistening breasts, breasts covered in cum and saliva, athletic toned body, bright pink bunny suit bottom only, fishnet stockings, bunny ears headband, glowing cyber collar, inside high-end cyberpunk luxury bedroom, large windows with rainy neon city night, dramatic pink cyan lighting, explicit, messy oral creampie, detailed fluids, shiny wet skin
```

## Negative Prompt
```
lowres, bad anatomy, bad hands, missing fingers, extra fingers, fused fingers, deformed, mutated, text, watermark, signature, worst quality, low quality, jpeg artifacts, blurry, monochrome, censored, mosaic, bar censor, child, loli, shota, underage
```

## Body JSON
```json
{
  "provider": "comfyui",
  "model": "DreamShaper_8_pruned.safetensors",
  "book": "test",
  "ch": "r18-dreamshaper",
  "prompt": "...(ดู Positive Prompt ด้านบน)...",
  "negative_prompt": "...(ดู Negative Prompt ด้านบน)...",
  "width": 512,
  "height": 768,
  "steps": 20,
  "cfg_scale": 7
}
```
