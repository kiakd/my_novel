# Image Generation

รูปที่เจนจะเซฟที่ `uploads/{book}/{ch}/{timestamp}_{provider}.png`

---

## Routes

### POST `/api/image/generate`

**Body:**
```json
{
  "provider": "novelai",
  "prompt": "1girl, long black hair, bedroom, soft light, ...",
  "negative_prompt": "lowres, bad anatomy",
  "book": "my-novel",
  "ch": "ch01",
  "width": 832,
  "height": 1216,
  "steps": 28,
  "cfg_scale": 7,
  "model": "nai-diffusion-3"
}
```

`provider` ค่า default คือ `novelai` — ใส่ `tensorart` หรือ `civitai` เพื่อเปลี่ยน

**Response (success):**
```json
{
  "ok": true,
  "provider": "novelai",
  "filename": "1748000000000_novelai.png",
  "path": "./uploads/my-novel/ch01/1748000000000_novelai.png",
  "url": "/uploads/my-novel/ch01/1748000000000_novelai.png"
}
```

### GET `/api/image/list/:book/:ch`

List รูปทั้งหมดในบท

```
GET /api/image/list/my-novel/ch01
```

```json
{
  "ok": true,
  "images": [
    "/uploads/my-novel/ch01/1748000000000_novelai.png"
  ]
}
```

### GET `/uploads/:book/:ch/:filename`

Serve ไฟล์รูปโดยตรง — ใช้ `url` จาก response ได้เลย

---

## Setup แต่ละ Provider

### 1. NovelAI

**สมัคร / ราคา:**
- สมัครที่ [novelai.net](https://novelai.net)
- แผน Tablet $10/mo (1000 Anlas/mo) หรือ Scroll $15/mo (10,000 Anlas) หรือ Opus $25/mo (unlimited)
- ฉากปกติ ~0 Anlas (ใช้ free generation) / ฉากคุณภาพสูง ~5–15 Anlas ต่อรูป

**ขอ API Key:**
1. Login → คลิกรูป avatar (มุมบนขวา) → **Account**
2. เลื่อนลงหา **"Get Persistent API Token"**
3. คลิก → Copy token

**Set .env:**
```
NOVELAI_API_KEY=pst-xxxxxxxxxxxxx
```

**Models ที่ใช้ได้:**
| model | ลักษณะ |
|-------|--------|
| `nai-diffusion-3` | อนิเมะ คุณภาพสูง (default) |
| `nai-diffusion-xl-4-5` | Anime XL รุ่นใหม่ |
| `nai-diffusion-furry-3` | Furry style |

**Size แนะนำ (NovelAI ต้องเป็น multiple of 64):**
- Portrait: `832×1216`
- Landscape: `1216×832`
- Square: `1024×1024`

---

### 2. Tensor.art

**สมัคร / ราคา:**
- สมัครที่ [tensor.art](https://tensor.art)
- มีระบบ credit — ซื้อ credit หรือได้ฟรีบางส่วน
- ราคา ~$0.002–0.005 ต่อรูป (ขึ้นกับ model และ step)

**ขอ API Key:**
1. Login → [tensor.art/tools/api](https://tensor.art/tools/api)
2. คลิก **"Create API Key"**
3. Copy key

**Set .env:**
```
TENSORART_API_KEY=xxxxxxxxxxxxxxxx
```

**หา Model ID:**
1. ไปที่ [tensor.art/models](https://tensor.art/models)
2. เลือก model ที่ต้องการ
3. เปิด URL จะได้ ID เช่น `tensor.art/models/757279507095956705` → ID คือ `757279507095956705`
4. ใส่ใน body: `"model": "757279507095956705"`

**Models แนะนำ (NSFW-friendly):**
- ค้นหา "Realistic Vision", "DreamShaper", "Anything V5" บนหน้า models
- กรอง Uncensored ในหน้า filter

---

### 3. Civitai

**สมัคร / ราคา:**
- สมัครที่ [civitai.com](https://civitai.com)
- ใช้ **Buzz** เป็น credit ใน platform
- Buzz ฟรีบางส่วน / ซื้อเพิ่มได้ (~$1 ≈ 1000 Buzz, รูปนึง ~5–20 Buzz)

**ขอ API Key:**
1. Login → คลิก avatar → **Account Settings**
2. เมนู **API Keys** → **Add API key**
3. Copy key

**Set .env:**
```
CIVITAI_API_KEY=xxxxxxxxxxxxxxxx
```

**หา Model URN:**
1. ไปที่ model บน civitai.com
2. คลิก **"Use"** หรือดูใน Model card → หา **AIR** format
3. ตัวอย่าง: `urn:air:sd1:checkpoint:civitai:4201@130072`
   - `4201` = model ID (จาก URL)
   - `130072` = version ID

**Models แนะนำ:**
| model | URN |
|-------|-----|
| Realistic Vision V5.1 | `urn:air:sd1:checkpoint:civitai:4201@130072` |
| DreamShaper v8 | `urn:air:sd1:checkpoint:civitai:4384@128713` |
| Anything V5 | `urn:air:sd1:checkpoint:civitai:9409@64108` |

> **หมายเหตุ:** Civitai ต้องมี Buzz พอในบัญชีก่อนสั่งเจน

---

  Terminal 1 — เปิด ComfyUI:
  cd ~/dru/comfyui && ./start.sh
  รอจนเห็น To see the GUI go to: http://127.0.0.1:8188

  Terminal 2 — เปิด Novel server:
  cd ~/dru/novel && bun dev

  เปิด browser: http://localhost:3000 → แท็บ 🖼️  เจนรูป → provider 🖥 ComfyUI เลือกไว้แล้ว → กด เจนรูป

   ComfyUI   │ ~/dru/comfyui/                                             │
  ├───────────┼────────────────────────────────────────────────────────────┤
  │ Model     │ Illustrious-XL-v0.1.safetensors (6.5 GB) — uncensored 100% │
  ├───────────┼────────────────────────────────────────────────────────────┤
  │ Backend   │ PyTorch 2.12 + MPS (Apple M2)                              │
  ├───────────┼────────────────────────────────────────────────────────────┤
  │ ความเร็ว   │ ~2–5 นาที/รูป (832×1216)                                     │
  ├───────────┼───────────────────────────

---

## ตัวอย่าง cURL

```bash
# NovelAI
curl -X POST http://localhost:3000/api/image/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "novelai",
    "prompt": "1girl, long black hair, indoors, soft lighting, sitting on bed, anime style",
    "book": "my-novel",
    "ch": "ch01"
  }'

# Tensor.art
curl -X POST http://localhost:3000/api/image/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "tensorart",
    "prompt": "1girl, realistic, beautiful face, long hair, bedroom",
    "book": "my-novel",
    "ch": "ch01",
    "width": 512,
    "height": 768
  }'

# Civitai
curl -X POST http://localhost:3000/api/image/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "civitai",
    "prompt": "1girl, photorealistic, beautiful, indoors, dim light",
    "book": "my-novel",
    "ch": "ch01"
  }'

# List รูปในบท
curl http://localhost:3000/api/image/list/my-novel/ch01
```

---
test promp r18+
text : 
nsfw, rating:explicit, masterpiece, best quality, absurdres, ultra detailed, cyberpunk anime style, 1girl, beautiful cool tomboy, short messy black hair, glowing crimson cyber eyes rolled back completely, intense ahegao, eyes rolled up in ecstasy, mouth stretched wide open, overflowing with thick white semen mixed with glossy saliva, massive cum and drool pouring down chin onto bare breasts, tongue hanging out, heavy blushing, kneeling submissively on luxurious bed, topless, completely bare breasts, fully exposed breasts, detailed realistic pink erect nipples, natural pink nipples, massive huge glistening breasts, breasts covered in cum and saliva, athletic toned body, bright pink bunny suit bottom only, fishnet stockings, bunny ears headband, glowing cyber collar, inside high-end cyberpunk luxury bedroom, large windows with rainy neon city night, dramatic pink cyan lighting, explicit, messy oral creampie, detailed fluids, shiny wet skin

---
MeinaHentai Objective is to create NSFW illustrations without much need of Loras!

I have a discord where you can share images, discuss prompt and ask for help.
https://discord.gg/meinaverse (✿◡‿◡)
我有个可以让你分享图片和参与讨论与询问问题的discord群。

I also have a ko-fi and Patreon page where you can support me or buy me a coffee <3 , it will be very much appreciated:
https://ko-fi.com/meina and https://www.patreon.com/MeinaMix

MeinaHentai is officially hosted for online generation in:
- SeaArt
- Mage.space ( with animate feature )
----------------------------------------------------------------------------------
-- Recommendations of use:

If you want the art to be more realistic, add: ' realistic ' or ' photo ' in the prompt.
---------------------------------------------
Recommended parameters:
Sampler: Euler a: 20~40 steps.
Sampler: DPM++ SDE Karras: 20~30 steps.
CFG Scale: 7.
Resolutions: 512x768, 512x1024 for Portrait!
Resolutions: 768x512, 1024x512, 1536x512 for Landscape!
Hires.fix: R-ESRGAN 4x+Anime6b, with 10 to 15 steps at 0.2 up to 0.4 denoising.
Clip Skip: 2.
Negatives: ' (worst quality, low quality:1.4), monochrome, zombie, (interlocked fingers:1.2), '