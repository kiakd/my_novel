# v3 — DreamShaper SD1.5 + force topless

**Result file:** `uploads/test/r18-dreamshaper-v3/1779900225072_comfyui.png`
**Generated:** 2026-05-27
**Verdict:** ✅ topless สำเร็จ — หน้าสวย, bunny ears, choker, bedroom + city window ครบ
**Caveat:** ⚠️ ยังมีเศษผ้าสีเขียว/มือบังบริเวณเป้า ไม่ "ถอดหมด 100%" (แก้ใน v4)

## Params
- **Model:** `DreamShaper_8_pruned.safetensors`
- **Resolution:** 512 × 768
- **Steps:** 24
- **CFG Scale:** 7
- **Sampler / Scheduler:** `euler_ancestral` / `normal`
- **API total:** 91s

## การเปลี่ยนแปลงจาก v2
- **ตัด `wearing only pink bunny suit bottom`, `pink fishnet stockings` ออกจาก positive** — เก็บแค่ bunny ears + choker
- ใส่ weighted nude tag: `(nsfw:1.3), (completely nude:1.4), (fully naked:1.4), (no clothes:1.3)`
- เน้นหน้าอก: `(bare breasts:1.3), (natural medium breasts:1.2), (perky pink nipples:1.2)`
- เพิ่ม negative กันเสื้อผ้า: `(clothed:1.4), (bra:1.4), (panties:1.4), (lingerie:1.4), (underwear:1.4), (bikini:1.4), (swimsuit:1.4), bunny suit, bunny costume, fishnet, stockings, leggings, pants, shorts, skirt, shirt, top, dress, jacket`

## Positive Prompt
```
(nsfw:1.3), (completely nude:1.4), (fully naked:1.4), (no clothes:1.3), RAW photo, photorealistic, masterpiece, best quality, ultra detailed, sharp focus, 85mm portrait, cinematic lighting, detailed skin texture, dewy skin, 1girl, beautiful young woman, age 22, attractive symmetrical face, soft delicate features, glossy lips, gentle almond eyes, natural makeup, short messy black hair with subtle pink highlights, (bare breasts:1.3), (natural medium breasts:1.2), (perky pink nipples:1.2), fit toned body, slim waist, kneeling on luxurious silk bed sheets, looking at viewer, soft seductive smile, slight blush, bunny ears headband only, thin black choker necklace, cyberpunk luxury bedroom interior, large floor to ceiling windows showing rainy neon city skyline at night, dramatic pink and cyan rim lighting, soft volumetric light, bokeh background, sensual mood, alluring pose
```

## Negative Prompt
```
(clothed:1.4), (bra:1.4), (panties:1.4), (lingerie:1.4), (underwear:1.4), (bikini:1.4), (swimsuit:1.4), bunny suit, bunny costume, fishnet, stockings, leggings, pants, shorts, skirt, shirt, top, dress, jacket, lowres, bad anatomy, bad hands, bad face, deformed face, ugly, scary, horror, demonic, demon, monster, alien, zombie, glowing red eyes, glowing eyes, scary eyes, dead eyes, blank white eyes, rolled back eyes, ahegao, tongue out, drooling, asymmetrical face, distorted face, mutated, extra limbs, extra fingers, fused fingers, missing fingers, long neck, text, watermark, signature, worst quality, low quality, jpeg artifacts, blurry, monochrome, censored, mosaic, bar censor, child, loli, shota, underage, smeared makeup, oversaturated, plastic skin, doll face
```
