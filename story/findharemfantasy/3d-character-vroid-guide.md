# คู่มือปั้นตัวละคร 3D สายเกม — VRoid Studio (local, ฟรี)

> สรุปจาก session 2026-06-14 · ทางเลือกแทน AI-image-to-3D (Hunyuan) ที่ได้ก้อน topology เละ
> **VRoid = แอป desktop ในเครื่อง 100% ฟรี ออฟไลน์ ไม่ใช่ AI** — ปั้นด้วย slider, ได้ตัว rigged เข้า Godot ได้เลย

## ทำไมใช้ VRoid (ไม่ใช่ AI 3D)
- AI image→3D (Hunyuan/TRELLIS/StdGEN): topology เละ (surface-net), ไม่มี rig, สาย texture ต้อง 20GB+/คอมไพล์ → **ไม่เหมาะทำตัวละครเล่นจริง**
- VRoid: base mesh คนสะอาด + rig humanoid + ปรับหน้า/ผม/ชุด ด้วย slider → **เข้าเกมได้จริง** = pipeline มาตรฐานเกมอนิเมะ
- เครื่อง 6GB/Py3.14 รันได้สบาย (ไม่ใช่งาน GPU หนัก)

## สเต็ป (ทำเองในเครื่อง)
1. **โหลด:** https://vroid.com/en/studio (Windows/Mac ฟรี) → ติดตั้ง
2. **เลือก base:** สร้างใหม่ → เลือกร่าง **Feminine** (สำหรับ Liena)
3. **ปั้นหน้าตามรูป Liena** (เปิดรูป `comfyui/ComfyUI/input/liena_ill_bust.png` ไว้ข้าง ๆ แล้วเลื่อนปรับ):
   - Face: รูปหน้า/คาง/แก้ม/ตา (โต-เรียวตามอนิเมะ)
   - Eyes: สี **เขียวมรกต**, ทรงตา
   - Ears: VRoid มี slider **หูแหลม (elf)** อยู่แล้ว → ดันให้แหลม
4. **ผม:** สี **เงิน-ขาว** ยาว · ใช้ระบบวาดผมของ VRoid (guide hair) หรือ preset แล้วปรับ
5. **ชุด:** เลือกชุดใกล้เคียง (ชุดราตรี/คลุมเอลฟ์ เขียว-ขาว) แต่งสี/ลายใบไม้ · ชุดซับซ้อนค่อยทำใน Blender ทีหลัง
6. **มงกุฎใบไม้/เครื่องประดับ:** ทำทีหลังใน Blender (accessory แยก) ถ้าจำเป็น
7. **Export:** เมนู Export → **VRM** (สำหรับ Godot) · หรือ **glb/FBX** ถ้าจะแต่งต่อใน Blender

## เข้า Godot
- ลง addon **godot-vrm** (V-Sekai) จาก Asset Library (Godot 4.1+) — https://github.com/V-Sekai/godot-vrm
- ลากไฟล์ `.vrm` เข้า project → ได้ตัว rigged + MToon shader (โทนอนิเมะ) พร้อมใช้
- อนิเมชัน: rig เป็น humanoid → ใช้ Mixamo/DeepMotion หรือ retarget ได้

## บทบาทของ ComfyUI ที่มีอยู่ (ยังใช้ต่อ)
- **2D:** เจน sprite/ภาพคอนเซปต์ Liena ด้วย `wai_illustrious` (สวยกว่า SD1.5) → ใช้เป็น **reference ตอนปรับ VRoid**
- **AI-3D (Hunyuan):** เก็บไว้ทำ **props/ฉาก/วัตถุ** (topology ไม่สำคัญ) ไม่ใช่ตัวละครหลัก
- สคริปต์ที่ทำไว้: `gen_liena_illustrious.py` (ภาพ ref), `gen_3d_from_image.py` / `gen_3d_multiview.py` (props), `decimate_glb.py` (low-poly props)

## อ้างอิง
- VRoid Studio: https://vroid.com/en/studio
- godot-vrm: https://github.com/V-Sekai/godot-vrm
- (สาย sculpt base ใน Blender ถ้าอยากลอง: MakeHuman, Blender Studio Human Base Meshes, thebasemesh.com)
