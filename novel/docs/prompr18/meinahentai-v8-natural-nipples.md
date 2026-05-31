# v8 — MeinaHentai v5 + fix หัวนม "ทาสี"

**Result file:** `uploads/test/r18-meinahentai-v8-natural-nipples/1779903745123_comfyui.png`
**Generated:** 2026-05-28
**Verdict:** ✅ หัวนมธรรมชาติ ไม่ neon/sticker อีก areola กลืนกับผิว
**Reference ที่แก้:** ภาพก่อนใน `uploads/my-novel/ch01/1779903277781_comfyui.png` (หัวนม magenta sticker จัด)

## Params
- **Model:** `meinahentai_v5Final.safetensors`
- **Resolution:** 512 × 768 / 24 step / CFG 7
- **Sampler:** `euler_ancestral` / `normal`
- **API total:** **81s** (เทียบ v7 + ControlNet: 327s)
- ไม่ใช้ ControlNet ในรอบนี้ (เทียบกับ reference ของ user)

## 3 จุดที่แก้ใน Positive
| ก่อน (v7-ish) | หลัง (v8) |
|---|---|
| `detailed realistic pink erect nipples` | `natural nipples, soft areola, skin-tone nipples, subtle pink areola` |
| `shiny wet skin` | `natural skin texture, dewy skin` |
| `massive huge glistening breasts covered in cum and saliva` | `large breasts` (เอา glistening/shiny ออก) |
| `bright pink bunny suit bottom only` | `dark bunny suit bottom only` (ลด pink รวมทั้งภาพ) |
| `dramatic pink cyan lighting` | `subtle pink cyan rim lighting, soft warm key light on skin` |

## Negative ที่เพิ่ม (ตรงตัวการ "ทาสี")
```
(painted nipples:1.4), (neon nipples:1.4), (saturated nipples:1.3), (plastic nipples:1.3), (glowing nipples:1.3), pasties, nipple stickers, nipple covers, sticker, magenta nipples, hot pink nipples, plastic skin, oversaturated skin, neon skin
```

## Positive Prompt เต็ม
```
nsfw, rating:explicit, masterpiece, best quality, absurdres, ultra detailed, cyberpunk anime style, 1girl, beautiful cool tomboy, short messy black hair, glowing crimson cyber eyes rolled back completely, intense ahegao expression with eyes rolled up in ecstasy, mouth stretched wide open, overflowing with thick white semen mixed with glossy saliva, drool pouring down chin onto bare breasts, tongue hanging out, heavy blushing, lying on back seductively on luxurious bed, leaning against pillows, one hand groping and squeezing her own massive breast, other hand resting on lower abdomen, topless, completely bare breasts, fully exposed breasts, natural nipples, soft areola, skin-tone nipples, subtle pink areola, large breasts, athletic toned body, dark bunny suit bottom only, fishnet stockings, bunny ears headband, glowing cyber collar, inside high-end cyberpunk luxury bedroom, large floor-to-ceiling windows showing rainy neon city at night, subtle pink cyan rim lighting, soft warm key light on skin, explicit, messy oral creampie, natural skin texture, dewy skin
```

## Negative Prompt เต็ม
```
(painted nipples:1.4), (neon nipples:1.4), (saturated nipples:1.3), (plastic nipples:1.3), (glowing nipples:1.3), pasties, nipple stickers, nipple covers, sticker, magenta nipples, hot pink nipples, plastic skin, oversaturated skin, neon skin, (worst quality, low quality:1.4), monochrome, zombie, (interlocked fingers:1.2), bad anatomy, bad hands, bad face, deformed face, extra fingers, fused fingers, missing fingers, text, watermark, signature, censored, mosaic, bar censor, child, loli, shota, underage, demonic, monster, alien, dead eyes
```

## Lessons learned
1. **"pink nipples" คือ trap หลัก** — anime model มี bias หัวนม pink อยู่แล้ว ใส่ "pink" ใน tag = saturation x2 = neon sticker
2. **"shiny + wet + pink lighting" = พลาสติก** — ตัด 1 ใน 3 ก็ลดลงเยอะ ตัดทั้ง shiny + wet เป็น natural/dewy ดีกว่า
3. **คำว่า "pink" ในที่อื่นๆ ก็ส่งผลกระทบ** — ชุดสี pink, แสง pink, ผม subtle pink, ฯลฯ → model เฉลี่ย "pink global" ลงบนผิวด้วย ถ้าตัด pink จากชุดได้ (เช่น "dark bunny suit") global tint ลดลงทันที
4. **negative `(painted/neon/saturated/plastic/sticker)` มีผลจริง** — Meina ตอบ keyword เหล่านี้ดี ลดความ artificial ได้
5. ผลข้างเคียง: ลด "shiny wet" ทำให้ของเหลว (cum/saliva) ดูเป็นธรรมชาติขึ้น (sheen นุ่ม ไม่เหมือนพลาสติก)

## ที่ยังเหลือ (ไม่ใช่เรื่องสีหัวนม)
- "topless" บางครั้งยังถูก override โดย "bunny suit" — รอบนี้ออกเป็น dark top/corset แทน ตัด `dark bunny suit bottom only` ทิ้งเลยถ้าอยากให้เปลือยท่อนบนแน่ๆ
- Cum/oral creampie ออกบ้างไม่ออกบ้าง — ขึ้นกับ seed
- Asymmetric hand (ขวาบีบ ซ้ายอยู่ท้อง) ออกตามทั้งสองมือ (Meina ตอบดีพอสมควร — ไม่จำเป็นต้อง ControlNet)

## Quick recipe สำหรับฉาก NSFW anime ทั่วไป
- **Always avoid in positive:** `pink/red/colored nipples`, `glowing nipples`, `shiny wet skin`
- **Always include in negative:** `painted nipples, neon nipples, plastic nipples, pasties, nipple stickers, sticker`
- ถ้าอยากเก็บคุณภาพ wet/sheen ใช้ `dewy skin, soft skin highlights` แทน `shiny wet skin`
