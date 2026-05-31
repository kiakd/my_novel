# v6 — MeinaHentai v5 + M-legs spread + spread pussy + peace sign pose

**Result file:** `uploads/test/r18-meinahentai-v6/1779901094586_comfyui.png`
**Generated:** 2026-05-27
**Verdict:** ⚠️ partial success
**ที่ทำได้:** ✓ นอนหงาย ✓ M-legs spread เปิดเป้า ✓ fishnet stockings ✓ bunny ears ✓ cyber collar ✓ topless + bare breasts + nipples ✓ pussy visible
**ที่ทำไม่ได้:**
- ✗ **ทั้งสองมือทำ peace sign** ไม่ใช่ "ขวาแหวก / ซ้ายชู" — โมเดลตีความ "peace sign" เป็นท่า symmetric สองมือ (booru tag default)
- ✗ ยังมีเศษเสื้อชิ้นเล็ก (ดูเหมือน latex/leather) บังเป้าบางส่วน
- ✗ Cyberpunk window/neon city ไม่ติดเข้าเฟรม (โดน framing ตัด)
- ✗ Ahegao เบาลงจาก v5 (ปากแทบปิด ไม่มี cum)

## Params
- **Model:** `meinahentai_v5Final.safetensors`
- **Resolution:** 512 × 768
- **Steps:** 28
- **CFG Scale:** 7
- **Sampler / Scheduler:** `euler_ancestral` / `normal`
- **API total:** 91s
- **Prompt executed:** ~85s

## Positive Prompt (verbatim ที่ส่ง)
```
nsfw, rating:explicit, masterpiece, best quality, absurdres, ultra detailed, cyberpunk anime style, 1girl, beautiful cool tomboy, short messy black hair, glowing crimson cyber eyes rolled back, intense ahegao, eyes rolled up in ecstasy, mouth stretched wide open, overflowing with thick white semen mixed with glossy saliva, drool pouring down chin onto bare breasts, tongue hanging out, heavy blushing, (lying back on luxurious bed:1.2), (m legs:1.4), (spread legs wide:1.3), (knees up and apart:1.2), (presenting pussy:1.3), (spreading own pussy with right hand:1.4), right hand fingers spreading labia, (peace sign with left hand:1.4), left hand raised, v sign, fingers up, topless, completely bare breasts, fully exposed breasts, detailed pink erect nipples, massive huge glistening breasts, breasts covered in cum, athletic toned body, fully exposed pussy, shaved pussy, dripping wet pussy, pink fishnet stockings, bunny ears headband, glowing cyber collar, inside high-end cyberpunk luxury bedroom, large windows with rainy neon city night, dramatic pink cyan lighting, explicit, detailed fluids, shiny wet skin
```

## Negative Prompt
```
(worst quality, low quality:1.4), monochrome, zombie, (interlocked fingers:1.2), bad anatomy, bad hands, bad face, deformed face, extra fingers, fused fingers, missing fingers, three fingers, four fingers up, (bunny suit bottom:1.3), (panties:1.4), (covered pussy:1.4), (hand covering pussy:1.3), (closed legs:1.4), (legs together:1.3), (kneeling:1.3), text, watermark, signature, censored, mosaic, bar censor, child, loli, shota, underage, demonic, monster, alien, dead eyes, deformed hands, twisted fingers
```

## การเปลี่ยนแปลงจาก v5
- ลบ: `kneeling submissively on luxurious bed`, `messy oral creampie`, `bright pink bunny suit bottom only`
- เพิ่ม pose: `(lying back on luxurious bed:1.2), (m legs:1.4), (spread legs wide:1.3), (knees up and apart:1.2)`
- เพิ่ม hand action: `(spreading own pussy with right hand:1.4), (peace sign with left hand:1.4)`
- เพิ่ม anatomy explicit: `fully exposed pussy, shaved pussy, dripping wet pussy`
- เพิ่ม negative: `(bunny suit bottom:1.3), (panties:1.4), (covered pussy:1.4), (closed legs:1.4), (kneeling:1.3), three fingers, four fingers up, deformed hands, twisted fingers`

## ทำไม "ขวาแหวก / ซ้ายชู" ไม่ออก
SD1.5 + booru-tag model อ่อนเรื่อง **asymmetric hand action** — มันรู้จัก `peace sign` เป็นท่า template (มักสองมือ) และ `spreading pussy` เป็นอีก template หนึ่ง พอเจอใน prompt เดียวกัน model จะ "เฉลี่ย" คือเลือกอันใดอันหนึ่งให้ทั้งสองมือ ไม่ใช่ทำคนละท่า

## วิธีแก้ที่น่าจะได้ผล (สำหรับ v7)
1. **เพิ่ม weight ต่างกันชัดเจน:** `(right hand spreading pussy:1.6), (left hand peace sign:1.6), asymmetric hands`
2. **ระบุตำแหน่งชัดเจน:** `right arm down between legs, left arm raised up`
3. **ใช้ regional prompting** (ต้อง custom node เพิ่ม) — แบ่งภาพเป็น zone ซ้าย/ขวา ใส่ prompt คนละชุด
4. **ContrlNet OpenPose** — วาดท่าด้วย stick figure แล้วให้โมเดลตามท่า (ต้อง custom node + preprocessor)
5. **ลองแยก seed หลายรูป** จนกว่าจะออกถูก (อาจ 3-5 รอบ — model มี variance ใน hand interpretation)
6. **ตัด `peace sign` ออกชั่วคราว** ลอง pose แค่ "spread pussy" ก่อน เพื่อให้ model focus ขาแหวก + มือเดียว
7. ใส่ booru-canonical hand tag: `spread pussy`, `pussy spread`, `:p`, `pulling clothes aside`, `o-ring (gesture)`

## ขั้นถัดไป (ตัวเลือก)
- A. **iterate v7** เน้นแก้มือซ้าย-ขวาด้วย weight + position keyword
- B. **เพิ่ม ControlNet OpenPose** เข้า workflow — แม่นแต่ต้องลง custom node + edit `image-gen.ts`
- C. ยอมรับ v6 (สองมือชู) แล้วทำ pose อื่นต่อไป
