# managestep.md — วิธีทำมังงะ R18 แบบฉาก (เวอร์ชันง่าย)

> ใช้ไฟล์นี้เป็นคู่มือทุกครั้ง · work เก็บไว้ · ไม่ work แก้ที่ไฟล์นี้
> ตัวละครทุกตัว **ผู้ใหญ่ 18+ เสมอ** (negative กัน child/loli อยู่ในสคริปต์)
> มังงะ side นอกแคนนอน — ไม่ปนกับ storyline.md (เนื้อเรื่องหลักโทนสดใส กรห้าม dominant)

---

## วิธีคิดหลัก (ง่ายไว้ก่อน)
**เจน txt2img ตรงๆ ทีละช่อง** เหมือนที่ `poses-18plus/` ทำไว้แล้ว work — ไม่ต้อง chain/inpaint
1. character base + scene prompt + **seed family** (ซีนเดียวกันใช้ seed ใกล้กัน)
2. สถานะถอดผ้าบอกในคำเลย: `clothed` → `topless` → `bottomless` → `completely nude`
3. ดูผล ผ่านไปช่องถัดไป · เพี้ยนค่อยใช้ fallback (ล่างสุด)
4. ครบ 20 ช่อง → แปะ text bubble เป็น step สุดท้าย

> **ไม่ทำ:** เจนทั้งหน้ารวดเดียว (SD1.5 จัด layout ไม่ได้) · chain/inpaint เป็นค่าเริ่มต้น (เปราะ เกินจำเป็น)

---

## Settings (Mac M2 8GB)
- checkpoint `meinahentai_v5Final` · **512×768** (เดี่ยว) / **768×512** (คู่นอนแนวนอน) · steps 24 · cfg 7 · `dpmpp_2m`/`karras` · batch 1
- รูปแรก ~168s (โหลด model) ถัดไป ~90s · **เจนทีละรูป** ไม่งั้นเครื่องค้าง
- ❌ ห้าม SDXL (ช้า 40 นาที/รูป)

## สคริปต์
```bash
# start ComfyUI ก่อน แล้ว:
bun manga-gen.ts txt2img <out.png> <seed> "<scene prompt>" [--w 512 --h 768] [--neg "..."] [--pose poses/x.png]
```
- ออกที่ `uploads/manga/` · ต่อ character base + negative ให้อัตโนมัติ (เดาซีนเดี่ยว/คู่จากคำใน prompt)
- มี boy/blowjob/penis ในคำ → ใช้ couple base ให้เอง

---

## Beat sheet 20 ช่อง — "โฟล์เทียร์ × กร: สะกดจิต → ลวนลาม → ถอด → blowjob"
> ใส่เฉพาะ scene prompt ต่อท้าย (base ต่อให้แล้ว) · ชุดเริ่มต้น = เสื้อครอปขาวแขนกุด+กระโปรงดำ+สายรัด+ถุงน่องดำ+ถุงมือแดง+บูท

### องก์ 1 — เจอกัน + สะกดจิต (ใส่ชุดครบ) · seed 700001–700004
| # | seed | scene prompt |
|---|---|---|
| 01 | 700001 | `standing, full body, white sleeveless crop top, midriff, black mini skirt, garter, black thighhighs, red glove, indoor room, confident` ✅ทำแล้ว |
| 02 | 700002 | `upper body, facing viewer, surprised, glowing magic swirl in eyes, hypnosis effect, clothed` |
| 03 | 700003 | `half-lidded vacant red eyes, dazed empty expression, hypnotized, blush, arms limp, clothed` |
| 04 | 700004 | `close-up face, entranced, heart-shaped pupils, parted lips, dazed smile` |

### องก์ 2 — ลวนลาม + ถอดทีละชิ้น (ซีนคู่กับกร) · seed 700010–700016
| # | seed | scene prompt |
|---|---|---|
| 05 | 700010 | `1boy 1girl, boy standing behind dazed girl, hands on her shoulders, both clothed, bedroom` |
| 06 | 700011 | `boy lifting up her white crop top, midriff and underboob exposed, girl dazed blush` |
| 07 | 700012 | `topless, crop top pushed above breasts, large bare breasts, nipples, boy hands groping from behind, girl gasp` |
| 08 | 700013 | `topless, boy pinching nipples from behind, girl arching back, blush, sweat, parted lips` |
| 09 | 700014 | `boy pulling down black mini skirt, white panties, hands on waistband, girl dazed` |
| 10 | 700015 | `bottomless, panties removed, nude, only black thighhighs and red glove left, boy hand between thighs` |
| 11 | 700016 | `completely nude except thighhighs, full body, boy groping, blush, entranced, standing` |

### องก์ 3 — blowjob · seed 778341 (seed คู่ที่เคย work) ± ใกล้เคียง
| # | seed | scene prompt |
|---|---|---|
| 12 | 778341 | `girl kneeling in front of standing boy, looking up, dazed hypnotized, nude, from side, bedroom` |
| 13 | 778342 | `boy taking off pants, large erect penis near girl face, she stares blankly, kneeling` |
| 14 | 778343 | `girl holding penis with one hand, parted lips, about to lick, saliva, blush` |
| 15 | 778344 | `tongue out licking tip, eye contact, saliva, kneeling, looking up` |
| 16 | 778341 | `fellatio, penis in mouth, cheeks hollow, looking up at viewer, eye contact, blush, saliva` |
| 17 | 778345 | `deep blowjob, half-closed eyes, hand on base, drool, flushed, sweat` |
| 18 | 778346 | `boy hand on her head, deepthroat, teary eyes, saliva strings, intense` |
| 19 | 778347 | `cum in mouth, cumshot, mouth full of semen, eyes looking up, blush` |
| 20 | 778348 | `aftermath, semen on face and tongue, mouth open, dazed satisfied hypnotized smile, eye contact` |

> เปลี่ยนท่ายาก (คุกเข่า/deepthroat) ถ้าแขนขาพัง → ใส่ `--pose poses/xxx.png` (มี OpenPose ControlNet) หรือเปลี่ยน seed

---

## Step สุดท้าย — แปะ text / speech bubble (ให้เป็นเนื้อเรื่อง)
รูปแบบเป้าหมาย = ภาพ + บอลลูนคำพูด (อ้างอิง `ref/image2,3` และตัวอย่างที่ผู้ใช้ส่ง)
- โมเดลเขียนตัวอักษรไม่ได้ → **แปะทีหลังด้วย PIL** (เหมือนสติกเกอร์ใน character prompt.md)
- ฟอนต์ไทย **Sarabun-ExtraBold** · บอลลูนขาวขอบดำ หางชี้ปาก · เสียง/onomatopoeia (CLAP!! / ビク) วางทับเป็นเลเยอร์
- บทพูดต่อช่องดึงจาก Vocabulary Palette ใน storyline.md (ใช้คำตรง ไม่เลี่ยง)
- 🔜 ยังไม่ได้สร้างสคริปต์ overlay — จะทำ `manga-text.ts` (รับ panel + ลิสต์บอลลูน [ข้อความ, x, y, หางซ้าย/ขวา]) ออกเป็นภาพมี bubble

---

## Fallback — ใช้เฉพาะช่องที่เพี้ยน (ไม่ใช่ค่าเริ่มต้น)
- **หน้า/ชุดเพี้ยนจาก ref มาก** → `img2img` denoise 0.55 จาก `reference/full-body.png` (ล็อกชุด/สี/ผม)
- **มือพัง** → มักเกิดตอนมือจับวัตถุ; เลี่ยงให้มือว่าง หรือ `inpaint` เฉพาะมือ denoise 0.4
- **ท่าคู่อวัยวะรวม/คนเกิน** → เปลี่ยน seed หรือ `--pose` OpenPose
- ⚠️ inpaint mask ของ ComfyUI: **alpha ทึบ = บริเวณที่ถูกวาดใหม่** (เคยเข้าใจกลับด้านทำ anchor พัง) — ถ้าจะ inpaint พื้นหลัง ต้องทำ mask ให้พื้นหลังทึบ ตัวละครโปร่ง
- คำสั่ง: `bun manga-gen.ts img2img|inpaint ...` (ดู head ของ manga-gen.ts)
