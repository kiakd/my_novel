# my_novel

โปรเจกต์นิยาย + ไปป์ไลน์เจนภาพด้วย ComfyUI (ย้ายมาลองรันฝั่ง Windows)

## โครงสร้าง
```
my_novel/
├── novel/      โค้ดนิยาย + สคริปต์เจนภาพ (Bun/TypeScript + Python)
└── comfyui/    วิธีตั้งต้น ComfyUI (custom_nodes / models / run flags) — ไม่ได้เก็บตัว engine
```

> **ไม่ได้ขึ้น git:** รูปทั้งหมด, node_modules, venv, models (.safetensors), `.env` (secret)

## เริ่มใช้ฝั่ง novel/
```bash
cd novel
cp .env.example .env       # แล้วกรอก key/URI ของตัวเอง
bun install                # (หรือ npm install)
bun run server.ts
```

## เริ่มใช้ ComfyUI
ดู `comfyui/README.md` — สรุป: clone ComfyUI, ติดตั้ง custom_nodes (`comfyui/custom_nodes.txt`), โหลด models (`comfyui/models.md`), แล้วรัน

## เจนภาพ
ดู `novel/gen_cosplay.py` (เดี่ยว) และ `novel/gen_compare.py` (เทียบหลายโมเดล) — ยิง API ที่ `127.0.0.1:8188`
