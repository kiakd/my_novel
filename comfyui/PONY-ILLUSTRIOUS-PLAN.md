# แผนใช้ Pony / Illustrious + Add-on (สำหรับเครื่อง Windows + NVIDIA)

## ข้อสรุปการตัดสินใจ
Add-on ที่อยากได้ (reiQ / Cantarella / gangbang) **เกือบทั้งหมดเป็นสาย Illustrious**
→ **ยึด Illustrious เป็น base หลัก** (Pony เป็นทางเลือกรอง — LoRA คนละชุดกัน ใช้ข้ามไม่ได้)

> กฎเหล็ก: **LoRA ต้อง base ตรงกับ checkpoint** — LoRA Illustrious ใช้กับ checkpoint Illustrious/NoobAI เท่านั้น (ใช้กับ Pony หรือ SD1.5/meinahentai ไม่ได้)

---

## ขั้นที่ 1 — เช็ค VRAM ก่อน (ตัวชี้ขาด)
| VRAM | ทำได้ |
|---|---|
| 8GB | Illustrious ได้ (ใส่ `--medvram`-equiv ของ Comfy คือพอ) ~20–40 วิ/รูป |
| 12GB | สบาย ลื่น ~10–20 วิ/รูป |
| 16GB+ | ลื่นมาก + stack LoRA หลายตัวพร้อมกันได้สบาย |

ComfyUI จัด VRAM อัตโนมัติ ไม่ต้อง flag `--force-fp16/--disable-smart-memory` แบบ Mac

---

## ขั้นที่ 2 — โหลด Checkpoint (เลือก 1)
| โมเดล | verId | ขนาด | แนว |
|---|---|---|---|
| **WAI-illustrious-SDXL v17** ⭐ | `2883731` | 6.6GB | มาตรฐาน NSFW อนิเมะ (dl 1.3M) — เริ่มตัวนี้ |
| Unholy Hassaku Illustrious | `2419455` | 6.6GB | อนิเมะจัด NSFW หนัก |
| Prefect Semi-Real (Illustrious) | `2941724` | 6.6GB | กึ่งสมจริง |

→ วางที่ `ComfyUI/models/checkpoints/`

---

## ขั้นที่ 3 — โหลด LoRA (add-on) วางที่ `ComfyUI/models/loras/`

### 🎨 reiQ — สไตล์ลายเส้น Reinaldo Quintero
| verId | ขนาด | trigger |
|---|---|---|
| `2956448` (v8.0) | 272MB | `reill` |

### 👤 Cantarella (Wuthering Waves) — ที่คุณชอบ
| ตัวเลือก | verId | base | trigger | ชุด |
|---|---|---|---|---|
| Main Outfit ⭐ | `2084058` | Illustrious | `WW Cantarella, Main Outfit` | ชุดหลัก |
| Black Dress | `1889227` | Illustrious | `kantelei` | ชุดดำ |
| 鸣潮 Cantarella | `1613020` | NoobAI | `Cantarella \(wuthering waves\)` | ทั่วไป |

> NoobAI LoRA ใช้กับ WAI-illustrious ได้ (NoobAI = ต่อยอดจาก Illustrious) แต่ตัว Illustrious แท้เข้ากันแน่นอนกว่า — แนะนำเริ่ม `2084058`

### 🔞 Gangbang — concept
| ตัวเลือก | verId | trigger |
|---|---|---|
| Gangbang Concept (v4) ⭐ | `2949831` | `gangbang` (+ดู trigger เต็มในหน้าโมเดล) |
| Oral gangbang | `2828844` | `gangbang, surrounded by penis` |
| Femdom Reverse Gangbang | `2552505` | `Reverse_GangbangV1` |

---

## ขั้นที่ 4 — คำสั่งโหลด (ใส่ key ตัวเอง)
```bash
# ตัวอย่าง: checkpoint
curl -L -H "Authorization: Bearer $CIVITAI_API_KEY" \
  "https://civitai.com/api/download/models/2883731" -o models/checkpoints/wai_illustrious_v17.safetensors
# LoRA
curl -L -H "Authorization: Bearer $CIVITAI_API_KEY" \
  "https://civitai.com/api/download/models/2956448" -o models/loras/reiq_reill.safetensors
curl -L -H "Authorization: Bearer $CIVITAI_API_KEY" \
  "https://civitai.com/api/download/models/2084058" -o models/loras/cantarella_main.safetensors
curl -L -H "Authorization: Bearer $CIVITAI_API_KEY" \
  "https://civitai.com/api/download/models/2949831" -o models/loras/gangbang_v4.safetensors
```

---

## ขั้นที่ 5 — โครง Workflow (stack LoRA หลายตัว)
```
CheckpointLoader(WAI-illustrious)
  └─> LoraLoader(reiq_reill,   model 0.7, clip 0.7)
        └─> LoraLoader(cantarella, model 0.8, clip 0.8)
              └─> LoraLoader(gangbang,  model 0.7, clip 0.7)
                    └─> CLIPTextEncode(+/-) ─> KSampler ─> VAEDecode ─> SaveImage
```
**ค่าเริ่มแนะนำ (Illustrious):**
- Sampler: `Euler a` หรือ `DPM++ 2M SDE`, scheduler `Karras`/`normal`
- Steps: 24–30 · CFG: 4–6 (Illustrious ชอบ CFG ต่ำกว่า SD1.5)
- Resolution: 832×1216 (portrait) / 1216×832 — native SDXL
- Positive ต้องมี quality tags: `masterpiece, best quality, amazing quality` + trigger ของ LoRA ทุกตัว
- Negative: `bad quality, worst quality, worst detail, sketch, censored`

**เคล็ด stack LoRA:** น้ำหนักรวมอย่าแรงเกิน — ถ้าใส่ 3 ตัว ลดแต่ละตัวเหลือ ~0.6–0.8 ไม่งั้นภาพแตก/สีเพี้ยน เริ่มทีละตัวแล้วค่อยเพิ่ม

---

## ขั้นที่ 6 — ถ้าอยากเร็วขึ้น (VRAM น้อย/อยากไว)
โหลด **Hyper-SD / DMD2 LoRA สำหรับ SDXL** มา stack เพิ่ม → ลด steps เหลือ 6–8 (เร็วขึ้น ~3–4 เท่า)
- ค้นใน Civitai: "Hyper SDXL 8steps LoRA" หรือ "DMD2 sdxl"
- เวลาใช้: CFG ลงเหลือ 1–2, steps 6–8

---

## สรุป checklist ย้าย Windows
- [ ] ติดตั้ง ComfyUI + torch(CUDA) + 3 custom_nodes (ดู README.md)
- [ ] โหลด WAI-illustrious `2883731`
- [ ] โหลด LoRA: reiQ `2956448` / Cantarella `2084058` / gangbang `2949831`
- [ ] สร้าง workflow stack LoRA ตามขั้นที่ 5
- [ ] เริ่ม CFG 5 / 28 steps / 832×1216 แล้วค่อยจูน
