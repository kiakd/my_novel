# ComfyUI setup (สำหรับย้ายไปรันบน Windows)

โฟลเดอร์นี้เก็บ **เฉพาะวิธีตั้งต้น** ไม่ได้เก็บตัว ComfyUI / venv / models (โหลดใหม่บนเครื่องปลายทาง)

## 1. ติดตั้ง ComfyUI

```bash
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
python -m venv venv
venv\Scripts\activate            # Windows
pip install -r requirements.txt
# GPU NVIDIA: ติดตั้ง torch ตามคำสั่งจาก https://pytorch.org (เลือก CUDA ของคุณ)
```

## 2. Custom nodes (ดู custom_nodes.txt)

```bash
cd custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager.git
git clone https://github.com/pythongosssss/ComfyUI-WD14-Tagger.git
git clone https://github.com/Fannovel16/comfyui_controlnet_aux.git
# แล้ว pip install -r requirements.txt ของแต่ละ node (หรือใช้ ComfyUI-Manager ติดตั้งให้)
```

## 3. Models (ดู models.md)

โหลด checkpoint/LoRA จาก Civitai เอาไปวางที่:
- checkpoint -> `ComfyUI/models/checkpoints/`
- LoRA       -> `ComfyUI/models/loras/`

## 4. คำสั่งรัน

**Mac 8GB (เดิม):**
```bash
python main.py --listen 127.0.0.1 --port 8188 --force-fp16 --preview-method none --disable-smart-memory
```

**Windows + NVIDIA (แนะนำ — ตัด flag ประหยัด RAM ออก):**
```bash
python main.py --listen 127.0.0.1 --port 8188
# VRAM น้อย (<8GB) ค่อยเติม:  --lowvram
```

> บน Windows + NVIDIA ไม่ต้องใช้ `--force-fp16` / `--disable-smart-memory` (พวกนี้ใส่ไว้กล่อมเครื่อง Mac 8GB unified ให้ไม่ค้าง) — ตัดออกแล้วเร็วกว่ามาก

## 5. เจนภาพ

สคริปต์ยิง API อยู่ใน `../novel/`:
- `gen_cosplay.py` — เจนเดี่ยว (แก้ POS/NEG/seed แล้วรัน `python gen_cosplay.py <seed>`)
- `gen_compare.py` — เจน prompt+seed เดียวกันหลายโมเดลเทียบกัน

ทั้งคู่ยิงไปที่ `http://127.0.0.1:8188` — เปลี่ยน `SERVER` ในไฟล์ถ้า host/port ต่าง
