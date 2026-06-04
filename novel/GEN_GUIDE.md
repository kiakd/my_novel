# คู่มือ Generation (ComfyUI) — สำหรับต่อ UI/UX

โปรเจกต์เจนภาพ/วิดีโอ Cantarella บน **WAI-illustrious (SDXL/Illustrious)** + WAN video
เครื่อง: RTX 4050 6GB · RAM 31GB · Python 3.14 · torch 2.11+cu128

---

## 1. สตาร์ท server

```bash
cd comfyui/ComfyUI
./venv/Scripts/python.exe main.py --listen 127.0.0.1 --port 8188
```
> ใช้ได้ทั้งเจนภาพ + วิดีโอ (ไม่ต้องใส่ `--lowvram` — auto-manage พอสำหรับ 6GB)
> เช็คพร้อม: `GET http://127.0.0.1:8188/system_stats` ตอบ 200

---

## 2. ComfyUI API contract (หัวใจของการต่อ UI)

ทุก gen script ทำ 3 step นี้ — UI ก็ทำตามนี้:

**(1) ส่ง workflow ไป queue**
```
POST http://127.0.0.1:8188/prompt
body: {"prompt": <workflow_graph>}
→ {"prompt_id": "abc..."}
```
**(2) poll จนเสร็จ**
```
GET http://127.0.0.1:8188/history/{prompt_id}
→ history[pid]["outputs"]["9"]["images"] = [{"filename","subfolder","type"}]
   history[pid]["status"]["status_str"] == "error" ถ้าพัง
```
**(3) ดึงรูป/คลิป**
```
GET http://127.0.0.1:8188/view?filename=<f>&subfolder=<s>&type=output
```

**โครง workflow_graph** = dict ของ node, แต่ละ node = `{"class_type": ..., "inputs": {...}}`
input ที่ต่อจาก node อื่นเขียนเป็น `["<node_id>", <output_index>]`
(ดูตัวอย่างเต็มในไฟล์ `gen_*.py` — copy โครงไปสร้างเป็น template ใน UI ได้เลย)

---

## 3. พารามิเตอร์มาตรฐาน (ภาพ Illustrious)

| | |
|---|---|
| Resolution | `832×1216` (ตั้ง) / `1216×832` (นอน) |
| Steps / CFG | 28-30 / **5.0** (Illustrious ชอบ CFG ต่ำ) |
| Sampler / Scheduler | `dpmpp_2m` / `karras` |
| Positive | `masterpiece, best quality, amazing quality, absurdres` + **trigger ของ LoRA ทุกตัว** + ซีน |
| Negative | `bad quality, worst quality, ... ` + **`child, loli, flat chest, young`** (กันตัวเด็กเสมอ) |

---

## 4. LoRA inventory (ทั้งหมดอยู่ `models/loras/`)

**ตัวละคร / สไตล์เส้น**
| ไฟล์ | trigger | หมายเหตุ |
|---|---|---|
| `cantarella_main` | `WW Cantarella` | character (Illustrious) |
| `reiq_reill` | `reill` | สไตล์ reiQ |
| `usnr_style` | `usnr` | 薄塗り soft shading |
| `trex_style` | `TRexStyle` | hentai anime style |
| `moriimee_gothic` | — | gothic style |
| `fcomic_hardcore_il_v2` | `fcomichardcore, (comic:1.25)` | **สร้างหน้าคอมมิคหลายช่องในรูปเดียว** |

**Utility (ใส่เสริมคุณภาพ)**
| ไฟล์ | trigger | strength |
|---|---|---|
| `stabilizer` | — | 0.6-0.8 กันกายวิภาคพัง |
| `smooth_detailer` | — | 0.5 |
| `add_micro_details` | `addmicrodetails` | 0.6 |

**ท่า / Concept (NSFW)**
| ไฟล์ | trigger |
|---|---|
| `oral_gangbang` | `gangbang, surrounded by penises` |
| `spitroast` | `spitroast, threesome` |
| `elevated_missionary` | `Elevated_missionaryV2` |
| `mating_press` | `missionary, deep penetration` |
| `squatting_doggystyle` | `doggystyle, all fours, ssfb` |
| `breeding_mount` | `all fours, boy on top, bottom up` |
| `multi_view` | `multiview, multiple views` |
| `pov_lookingdown_il3` | `MLD`=missionary · `MPLD`=mating press · `DSLD`=doggy (POV) |
| `forced_kiss_il` | `forced kiss` |

**กฎ stack:** ต่อ node `LoraLoader` เป็นลูกโซ่ (model→model, clip→clip)
character ~0.8 · pose ~0.85 · utility 0.5-0.7 · style 0.5-0.6 · อย่ารวมแรงเกินไม่งั้นภาพแตก
**ทุก LoRA ต้อง base = Illustrious** (เช็คก่อนโหลดเสมอ — SD1.5/Pony ใช้ข้ามไม่ได้)

---

## 5. สคริปต์เจน (เรียก `python <script>.py [args]`)

**ภาพเดี่ยว**
| script | ทำอะไร |
|---|---|
| `gen_illustrious_test.py` | ทดสอบ base + LoRA |
| `gen_cantarella_nsfw.py` | solo nsfw |
| `gen_cantarella_addons.py` | โชว์ utility/style add-on |
| `gen_cantarella_pov.py MLD\|MPLD\|DSLD` | POV (เลือกท่า) |
| `gen_cantarella_comic.py [seed]` | **หน้าคอมมิคหลายช่อง** (fcomic LoRA) |
| `gen_cantarella_forcedkiss.py` | forced kiss |

**Sequence / หน้า**
| script | ทำอะไร |
|---|---|
| `gen_cantarella_scenes.py` | gangbang + doggy (2 รูป) |
| `gen_cantarella_manga.py` | sequence 5 ช่อง (portrait→nude→doggy→mating→gangbang) |
| `gen_cantarella_steps.py` | 4 step (ลวนลาม→ถอด→พาดหน้า→อม) |
| `compose_manga_page.py` | **เอารูปมาเรียงเป็นหน้ามังงะอัตโนมัติ** (PIL, ปรับ cols/rows ได้) |

**วิดีโอ (WAN)**
| script | ทำอะไร |
|---|---|
| `gen_wan_t2v_test.py [seed]` | text→video (480×832, 33f@16fps, ~100s) |
| `gen_wan_vace_i2v.py [seed]` | **เอารูปมาขยับ** (VACE reference→video; วาง ref ที่ `ComfyUI/input/`) |

> วิดีโอใช้ CausVid LoRA → 6 steps / cfg 1.0 (เร็ว) · text encoder ต้องเป็น native `umt5_xxl_fp8_e4m3fn_scaled`

---

## 6. Output
ทุกอย่างเซฟที่ `comfyui/ComfyUI/output/` (`.png` ภาพ, `.webp` วิดีโอ)
ดึงผ่าน API `/view` หรืออ่านไฟล์ตรงๆ

---

## 7. หา/เพิ่ม LoRA ใหม่
```bash
python _civitai_search.py     # ค้นตามคำ (กรอง Illustrious)
python _civitai_popular.py    # ตัวยอดนิยม
```
โหลด: `curl -L -H "Authorization: Bearer $CIVITAI_API_KEY" \
  "https://civitai.com/api/download/models/<verId>" -o models/loras/<name>.safetensors`
**เช็ค `base=Illustrious` ของ version นั้นก่อนโหลดเสมอ** (บางตัว creator ล็อก ต้อง login เว็บ)
```
```
