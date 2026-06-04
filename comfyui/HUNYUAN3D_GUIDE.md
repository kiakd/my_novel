# Hunyuan3D-2 — Image → 3D บน ComfyUI (เครื่องนี้, RTX 4050 6GB)

สาย image→3D ที่ **ใช้ ComfyUI เดิม** ที่ติดตั้งไว้ (`comfyui/ComfyUI/`) ไม่ต้องลง custom node เพิ่ม
และไม่ต้อง compile อะไรเลย — ComfyUI 0.22.0 รองรับ Hunyuan3D-2 แบบ **native** อยู่แล้ว

## ทำไมไม่ใช้ Hunyuan3D-2GP (ตามที่คุยกันไว้)
2GP เป็นแอป Gradio แยกต่างหาก + ต้อง build `custom_rasterizer` (เสี่ยงพังบน Python 3.14)
จุดเด่นจริงของมันคือ "texture บน VRAM น้อย" แต่ก็ช้ามากบน 6GB
สำหรับเป้าหมายตอนนี้ (ได้ไฟล์ 3D ไปให้พี่เขาตัดสินใจ) เส้น **native ComfyUI เร็ว/ชัวร์กว่า**:
ได้ mesh `.glb` ออกมาเอาเข้า Blender แต่ง/สเกลต่อได้ทันที
(native ยังไม่ทำ texture → ได้ mesh เปล่า ซึ่งโอเคสำหรับรอบประเมินทรง/โทโพโลยี)
ถ้าพี่เขาเอาด้วยแล้วอยากได้ texture/PBR ค่อยลง 2GP หรือไปเจน texture บน cloud/HF Space ทีหลัง

## โมเดล (ไฟล์เดียว ~4.9 GB)
`models/checkpoints/hunyuan3d-dit-v2_fp16.safetensors`
(repackaged ของ Comfy-Org รวม **MODEL + CLIP_VISION + VAE** ในไฟล์เดียว → โหลดด้วยโหนด `ImageOnlyCheckpointLoader` ได้ครบ 3 เอาต์พุต)

โหลดด้วย:
```
cd comfyui/ComfyUI
./venv/Scripts/python.exe ../../novel/setup_hunyuan3d.py
```

## รัน
```
cd comfyui/ComfyUI
./venv/Scripts/python.exe main.py --listen 127.0.0.1 --port 8188 --lowvram
```
1. เปิด http://127.0.0.1:8188 → เมนู Workflows → **image_to_3d_hunyuan3d**
   (ไฟล์อยู่ที่ `user/default/workflows/image_to_3d_hunyuan3d.json`)
2. โหนด **Load Image** → เลือกรูป (วางรูปไว้ที่ `ComfyUI/input/`)
3. กด **Queue** → ได้ `.glb` ที่ `ComfyUI/output/mesh/`

> 💡 รูป input ที่ได้ผลดี: object เดี่ยว ๆ พื้นหลังโล่ง/ตัดพื้นหลังออก (มี ComfyUI-WD14 + rembg ลงไว้แล้วถ้าจะตัดพื้นหลังก่อน)

## โครงสร้าง workflow (10 โหนด)
```
ImageOnlyCheckpointLoader ─┬─MODEL→ ModelSamplingAuraFlow ─┐
                           ├─CLIP_VISION→ CLIPVisionEncode ─→ Hunyuan3Dv2Conditioning ─(pos/neg)─┐
                           └─VAE──────────────────────────────────────────────┐                 │
LoadImage ─IMAGE→ CLIPVisionEncode                                            │                 │
EmptyLatentHunyuan3Dv2 ─LATENT──────────────────────────────────→ KSampler ←─MODEL,pos,neg,latent
                                                          KSampler ─LATENT→ VAEDecodeHunyuan3D ←VAE
                                              VAEDecodeHunyuan3D ─VOXEL→ VoxelToMesh ─MESH→ SaveGLB
```

## พารามิเตอร์ที่ปรับบ่อย
| โหนด | ค่า | ผล |
|------|-----|-----|
| KSampler | steps 20, cfg 5.5 (ช่วงดี 4–8), euler/normal | คุณภาพ/ความเร็ว |
| EmptyLatentHunyuan3Dv2 | resolution 3072 | จำนวน token latent ของรูปทรง |
| VAEDecodeHunyuan3D | octree_resolution 256 | 256=สมดุล, 384/512=ละเอียดขึ้น แต่กิน VRAM/RAM/เวลามากขึ้น |
| VAEDecodeHunyuan3D | num_chunks 8000 | ยิ่งต่ำยิ่งประหยัด VRAM (ช้าลง) — ลดลงถ้า OOM |
| VoxelToMesh | "surface net", threshold 0.6 | surface net = ผิวเนียนกว่า basic |

## ถ้า OOM (6GB)
- รันด้วย `--lowvram` (หรือ `--novram` ถ้ายังไม่พอ — ช้าลงแต่รอด เพราะมี RAM 31GB)
- ลด `octree_resolution` → 192/160
- ลด `num_chunks` ใน VAEDecodeHunyuan3D → 4000/2000

## เอาเข้า Blender
`.glb` ลากเข้า Blender ได้ตรง ๆ (หรือ File → Import → glTF 2.0)
- mesh เป็นสามเหลี่ยมหนาแน่น (ไม่ใช่ quad) → ถ้าจะ rig/animate ควร **retopology** (Quad Remesher / Remesh modifier) ก่อน
- สเกล/ย้าย/แยกชิ้นได้อิสระ, export ต่อไป Unity/Unreal ได้
