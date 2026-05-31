# v4 — DreamShaper SD1.5 + fully nude (target achieved)

**Result file:** `uploads/test/r18-dreamshaper-v4/1779900368185_comfyui.png`
**Generated:** 2026-05-27
**Verdict:** ✅✅ "ถอดชุดหมด" สำเร็จ — bare body ทั้งบน-ล่าง, หน้าสวย ไม่ปีศาจ ใส่แค่ bunny ears + choker, นั่งคุกเข่าบนเตียง, window cyberpunk city
**Caveat:** ⚠️ ส่วนของจุกบนหน้าอกประหลาด เป็นกระดิ้ง หรืออะไรก็ไม่รู้ สีเทา ผิดธรรมชาตินมของผู้หญิง
**Note:** อาจมือ/นิ้วเล็กน้อยไม่เพอร์เฟ็กต์ (จุดอ่อน SD1.5)

## Params
- **Model:** `DreamShaper_8_pruned.safetensors`
- **Resolution:** 512 × 768
- **Steps:** 26
- **CFG Scale:** 7.5
- **Sampler / Scheduler:** `euler_ancestral` / `normal`
- **API total:** 96s

## การเปลี่ยนแปลงจาก v3
- เพิ่ม weighted nude เต็มร่าง: `(completely nude:1.5), (full body nude:1.3)`
- เพิ่ม lower-body explicit tag: `(exposed pussy:1.2), shaved pussy, flat stomach`
- เปลี่ยน pose ให้เปิดเป้า: `sitting back on heels on luxurious silk bed sheets, (legs apart:1.2), arms relaxed at sides`
- เน้น full body: `full body shot`
- เสริม negative กัน cover crotch: `(covered crotch:1.4), (hand covering crotch:1.3), (cloth covering:1.4), (thong:1.4), (g-string:1.4), towel, fabric covering, green cloth, anything green`
- ดัน weight การห้ามผ้าให้สูงขึ้น: `(underwear:1.5), (panties:1.5)`

## Positive Prompt
```
(nsfw:1.3), (completely nude:1.5), (fully naked:1.4), (full body nude:1.3), (no clothes:1.3), RAW photo, photorealistic, masterpiece, best quality, ultra detailed, sharp focus, full body shot, cinematic lighting, detailed skin texture, dewy skin, 1girl, beautiful young woman, age 22, attractive symmetrical face, soft delicate features, glossy lips, gentle almond eyes, natural makeup, looking at viewer, soft seductive smile, slight blush, short messy black hair with subtle pink highlights, (bare breasts:1.3), natural medium breasts, perky pink nipples, (exposed pussy:1.2), shaved pussy, flat stomach, fit toned body, slim waist, sitting back on heels on luxurious silk bed sheets, (legs apart:1.2), arms relaxed at sides, bunny ears headband only, thin black choker necklace, cyberpunk luxury bedroom interior, large floor to ceiling windows showing rainy neon city skyline at night, dramatic pink and cyan rim lighting, soft volumetric light, bokeh background, sensual mood
```

## Negative Prompt
```
(clothed:1.5), (covered crotch:1.4), (hand covering crotch:1.3), (cloth covering:1.4), (bra:1.4), (panties:1.5), (thong:1.4), (g-string:1.4), (lingerie:1.4), (underwear:1.5), (bikini:1.4), (swimsuit:1.4), bunny suit, bunny costume, fishnet, stockings, leggings, pants, shorts, skirt, shirt, top, dress, jacket, towel, fabric covering, green cloth, anything green, lowres, bad anatomy, bad hands, bad face, deformed face, ugly, scary, horror, demonic, demon, monster, alien, zombie, glowing red eyes, glowing eyes, scary eyes, dead eyes, blank white eyes, rolled back eyes, ahegao, tongue out, drooling, asymmetrical face, distorted face, mutated, extra limbs, extra fingers, fused fingers, missing fingers, long neck, text, watermark, signature, worst quality, low quality, jpeg artifacts, blurry, monochrome, censored, mosaic, bar censor, child, loli, shota, underage, smeared makeup, oversaturated, plastic skin, doll face
```

## Recipe สำหรับเอาไป reuse
1. Photoreal model ใดๆ → ใช้ DreamShaper เทมเพลตนี้ได้ตรงๆ
2. ถ้าอยากให้ใส่บางอย่าง (เช่น ถุงน่อง) → ลบจาก negative + เพิ่มใน positive แต่ระวัง: model มักเหมาเสื้อผ้าเต็มชุด ถ้าใส่ "stockings" อาจได้ "stockings + skirt" ติดมาด้วย ต้องเข้มงวด negative ของส่วนอื่น
3. ปรับ pose: `sitting back on heels + legs apart` คือ pose ที่ทำให้ DreamShaper เปิด anatomy ได้ดี โดยไม่ดูบังคับ
