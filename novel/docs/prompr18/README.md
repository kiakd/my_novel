# R18+ Prompt Library

คลังข้อมูล prompt ที่เทสกับ ComfyUI ผ่าน `POST /api/image/generate` provider `comfyui`
ทุก case รันบน Mac MPS 8GB unified (Apple Silicon) — config ดู `~/dru/comfyui/start.sh`

## Format มาตรฐานแต่ละไฟล์
- **Model** — ชื่อ `.safetensors`
- **Resolution / Steps / CFG / Sampler**
- **Positive Prompt** — ส่งใน field `prompt`
- **Negative Prompt** — ส่งใน field `negative_prompt`
- **Result** — note + path รูปที่เซฟ
- **Body ตัวอย่าง (cURL-able JSON)** — copy ไปยิง endpoint ได้เลย

## Cases (เรียงตาม iteration)

| # | File | Model | สรุปผล |
|---|---|---|---|
| 1 | [dreamshaper-v1-original.md](dreamshaper-v1-original.md) | DreamShaper SD1.5 | prompt ต้นฉบับ anime-tag — หน้าออกปีศาจ (eyes glow, ahegao) |
| 2 | [dreamshaper-v2-photoreal-rewrite.md](dreamshaper-v2-photoreal-rewrite.md) | DreamShaper SD1.5 | rewrite ให้ตรง photoreal — หน้าสวยแล้ว แต่ยังใส่บราชมพู (SFW bias) |
| 3 | [dreamshaper-v3-topless.md](dreamshaper-v3-topless.md) | DreamShaper SD1.5 | weighted nude + negative กันเสื้อผ้า — topless สำเร็จ ยังมีเศษผ้าตรงเป้า |
| 4 | [dreamshaper-v4-fullnude.md](dreamshaper-v4-fullnude.md) | DreamShaper SD1.5 | ดัน lower-body + negative กันมือบัง — fully nude สำเร็จ |
| 5 | [meinahentai-v5-original.md](meinahentai-v5-original.md) | MeinaHentai v5 | prompt anime-tag ต้นฉบับบน model anime-NSFW — เทียบสไตล์ |
| 6 | [meinahentai-v6-m-legs-peace-sign.md](meinahentai-v6-m-legs-peace-sign.md) | MeinaHentai v5 | M-legs + spread pose ✓ แต่สองมือชู peace sign แทน asymmetric ✗ |
| 7 | [meinahentai-v7-controlnet-openpose.md](meinahentai-v7-controlnet-openpose.md) | MeinaHentai v5 + **ControlNet OpenPose** | M-legs เป๊ะ + **asymmetric hands สำเร็จ** (ซ้ายชู V / ขวาลงล่าง) — ยืนยัน ControlNet skeleton ทำได้จริง |
| 8 | [meinahentai-v8-natural-nipples.md](meinahentai-v8-natural-nipples.md) | MeinaHentai v5 | แก้หัวนม neon/sticker → ธรรมชาติ (ตัด `pink nipples` + `shiny wet skin` + เพิ่ม negative กัน painted/sticker) |

## Endpoint usage
```bash
curl -X POST http://localhost:3000/api/image/generate \
  -H 'Content-Type: application/json' \
  --data-binary @body.json
```
รูปออกที่ `uploads/{book}/{ch}/{timestamp}_comfyui.png` และเสิร์ฟผ่าน `GET /uploads/...`

## Lessons learned (DreamShaper SD1.5 photoreal)
- **มี SFW bias แรง** — keyword `topless` มัก override ด้วยเสื้อผ้าที่ระบุใน prompt (เช่น "bunny suit bottom")
- ต้อง **ตัดเสื้อผ้าออกจาก positive** + ใส่ **negative กันเสื้อผ้าทุกชนิด** (bra, panties, lingerie, bikini, swimsuit, bunny suit, ...)
- ใช้ **weighted prompt** `(completely nude:1.5)` ดันความสำคัญ
- ระวัง keyword anime-tag ที่ทำให้หน้าเพี้ยน: `glowing eyes`, `eyes rolled back`, `ahegao`, `tongue out` — ใส่ใน **negative** หมด
- ใส่ negative ป้องกันหน้าผิดรูป: `demonic, demon, monster, alien, zombie, scary eyes, dead eyes, deformed face, asymmetrical face, plastic skin, doll face`

## Lessons learned (MeinaHentai v5 anime-NSFW)
- ตอบ booru tag ได้ตรง (ahegao, cum tag ทำงาน) ไม่ต้อง rewrite เป็น natural language
- Recommended จาก model author: Sampler `Euler a` 20-40 step / CFG 7 / 512×768 / Clip Skip 2
- Negative สั้นกว่า: `(worst quality, low quality:1.4), monochrome, zombie, (interlocked fingers:1.2)`
- **Caveat:** ComfyUI workflow ปัจจุบันใน `image-gen.ts` ยังไม่รองรับ Clip Skip — ดูใน v5 ว่ายังออกผลดีไหมก่อน
