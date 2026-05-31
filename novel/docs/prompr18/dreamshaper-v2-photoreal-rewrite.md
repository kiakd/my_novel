# v2 — DreamShaper SD1.5 + photoreal-friendly rewrite

**Result file:** `uploads/test/r18-dreamshaper-v2/1779899648776_comfyui.png`
**Generated:** 2026-05-27
**Verdict:** ⚠️ หน้าสวยแล้ว ไม่ปีศาจ แต่ output **ใส่บราชมพูแทนที่จะ topless** — DreamShaper มี SFW bias เมื่อมี "bunny suit bottom" ในชุด keyword ตัว model เหมารวมเป็นชุดเต็ม

## Params
- **Model:** `DreamShaper_8_pruned.safetensors`
- **Resolution:** 512 × 768
- **Steps:** 24
- **CFG Scale:** 6.5
- **Sampler / Scheduler:** `euler_ancestral` / `normal`
- **Prompt executed:** 78.94s / API total 80s
- **Seed sample:** 3368277072

## การเปลี่ยนแปลงจาก v1
- ตัด booru-tag style (`rating:explicit`, `absurdres`, `cyberpunk anime style`) → ใช้ภาษาธรรมชาติ
- ลบ `glowing crimson cyber eyes rolled back / ahegao / eyes rolled up / mouth stretched wide / tongue hanging out / cum-covered breasts` (ตัวการให้หน้าออกปีศาจ)
- เปลี่ยน `glowing cyber collar` → `thin black choker necklace`
- เปลี่ยน `massive huge breasts` → `natural medium sized breasts`
- เพิ่ม face quality: `beautiful young woman, age 22, attractive symmetrical face, soft delicate features, glossy lips, gentle almond eyes`
- เสริม negative กัน demonic/scary/glowing-eyes/dead-eyes/asymmetrical/distorted/plastic-skin

## Positive Prompt
```
RAW photo, photorealistic, masterpiece, best quality, ultra detailed, sharp focus, 85mm portrait, cinematic lighting, detailed skin texture, dewy skin, 1girl, beautiful young woman, age 22, attractive symmetrical face, soft delicate features, glossy lips, gentle almond eyes, natural makeup, short messy black hair with subtle pink highlights, kneeling gracefully on luxurious silk bed sheets, looking at viewer, soft seductive smile, slight blush on cheeks, topless, bare breasts, natural medium sized breasts, perky natural pink nipples, fit toned body, slim waist, wearing only pink bunny suit bottom, pink fishnet stockings, bunny ears headband, thin black choker necklace, cyberpunk luxury bedroom interior, large floor to ceiling windows showing rainy neon city skyline at night, dramatic pink and cyan rim lighting, soft volumetric light, bokeh background, explicit, nsfw, sensual mood, alluring pose
```

## Negative Prompt
```
lowres, bad anatomy, bad hands, bad face, deformed face, ugly, scary, horror, demonic, demon, monster, alien, zombie, glowing red eyes, glowing eyes, scary eyes, dead eyes, blank white eyes, rolled back eyes, ahegao, tongue out, drooling, asymmetrical face, distorted face, mutated, extra limbs, extra fingers, fused fingers, missing fingers, long neck, text, watermark, signature, worst quality, low quality, jpeg artifacts, blurry, monochrome, censored, mosaic, bar censor, child, loli, shota, underage, smeared makeup, oversaturated, plastic skin, doll face
```

## Bug ที่พบ
- มี "bunny suit bottom" + "topless" ใน prompt เดียวกัน → model resolve ออกมาเป็นบราเต็มชุด
- แก้ใน v3 โดยตัดเสื้อผ้าออกหมด + ใส่ weighted `(topless:1.x)` และเสริม negative กันเสื้อผ้า
