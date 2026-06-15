# Find Harem Fantasy × แอป Novel — แผน "เป็นเจ้าของเนื้อเรื่อง → ส่งต่อเกม → เขียนนิยายอิงเกม"

> สถานะ: NOTE ตั้งต้น (อ่าน design จาก `D:\test\game\findharemfantasy\docs\phase-1-design` ครบ 7 ไฟล์แล้ว)
> วันที่: 2026-06-14 · เจ้าของฝั่งนี้: แอป novel (`d:\test\my_novel`) · ปลายทาง: เกม Godot (`D:\test\game\findharemfantasy`)

## 📂 ดัชนีเอกสารออกแบบ (story/findharemfantasy/)
| ไฟล์ | เนื้อหา |
|------|---------|
| **00** (นี้) | แผน pipeline novel↔game + handoff contract |
| [01-bible.md](01-bible.md) | ตัวละคร (เคน/ลิเอน่า) + กฎตราทาสสมบูรณ์ |
| [02-worldbuilding.md](02-worldbuilding.md) | ฉากหลัง · ระบบพลัง 3 สาย + ตราพระเจ้า · การเมือง/ฝ่าย · เมือง |
| [03-shared-assets.md](03-shared-assets.md) | ทะเบียน asset ร่วม (ตัวละคร/สถานที่/อีเวนต์/ภาพ) |
| [04-story-tracks.md](04-story-tracks.md) | **เนื้อเรื่อง 2 เส้นแยก** (เกม rom-com / นิยาย OP-การเมือง) |
| [05-legendary-weapons.md](05-legendary-weapons.md) | สิบสองเทวาวุธ + สาวเด่นประจำฝ่าย (ฮาเร็ม) + ที่ซ่อน |
| `findharemfantasy-meta.json` (ใน novel/) | character data แบบ structured (asset) |

## 1. แนวคิดหลัก
- **แอป novel = single source of truth ของ "ตัวละคร + เนื้อเรื่อง + บอนด์ + คอนเทนต์"** — ออกแบบ/เขียน/บาลานซ์ที่นี่ที่เดียว
- **เกม Godot = runtime** ที่ "กิน" คอนเทนต์ที่ส่งออกจาก novel (CharacterData, .dialogue, bond config, endings) ไปเล่น
- **นิยายอิงเกม** = เขียน prose เรื่องเดียวกันด้วย pipeline ของ novel (assembleSystemPrompt + state-delta + pov) → เดินหน้าก่อนเกม ใช้ตรวจ/ป้อนบทกลับ

เหตุผลที่ลงตัว: เกมนี้ใช้กลไก **Bond 0–100 + เทียร์ + can_command() + mature_mode** ซึ่งเป็นกลไกเดียวกับ rel/relLevel/power/guard/R18-gating ของแอป novel แค่คนละสเกล → แอป novel มีของพร้อมเป็นทั้ง "ห้องเขียนบท" และ "ซิมบาลานซ์ค่าบอนด์" อยู่แล้ว

## 2. การ map กลไก (novel ↔ game)
| แอป novel | เกม findharemfantasy | หมายเหตุ |
|---|---|---|
| `rel` −100..100 | `bond` 0..100 | เกมบวกล้วน · เสนอ map: rel 0..100 → bond ตรง ๆ, rel<0 (ศัตรู/ไม่ชอบ) → bond 0 + โทนเย็นชา |
| `relLevel()` ศัตรู/แปลกหน้า/เริ่มคุ้น/สนิท/ชอบ/คนรัก | เทียร์ Wary/Acquaint/Trust/Close/Lover | เกือบ 1:1 — เป็นแกนเดียวกัน |
| `guard` (ความหวงตัว) | `start_bond` ต่ำ + ขึ้นเทียร์ยาก | ลิเอน่า guard สูง (tsundere เอนเย็น) |
| `power` / `powerStanding` (อำนาจบังคับ) | ตราทาส + `can_command()` | กฎ "สั่งเกินระดับ = ปฏิเสธ + bond ลด + ตราหรี่" = กฎเดียวกับ novel เป๊ะ |
| judge rel (event-driven + ผูกนิสัย) | `add_bond(amount)` คงที่ต่อ choice | novel ใช้ judge "ออกแบบ/ตรวจ" ว่าค่าต่อ choice สมเหตุไหม → ป้อนเลขให้เกม |
| `stateCard` / `[[state:]]` live-state | `GameState` (bond/outfit/location/flag) | บัตรสถานะ = GameState เดียวกัน · time/location/outfit auto-track |
| R18 lexicon + DEVOTED(90) gating | `mature_mode` + `command_req` 80+ | เทียร์ 40=ออรัล · 60=sex · 100=ทุกอย่าง ↔ relLevel + R18 |
| `command_req` dictionary | (เกมมีอยู่แล้ว) | novel เป็นคนออกแบบเทียร์คำสั่ง + เงื่อนไขใจ |

> ข้อสำคัญ: ฟีเจอร์ที่เพิ่งทำใน session ล่าสุด (judge rel ผูกนิสัย, state-delta auto-track, pov 1st/3rd, R18 เทียร์) = สิ่งที่เกมนี้ต้องใช้พอดี

## 3. สิ่งที่ฝั่ง novel "เป็นเจ้าของ" (รับผิดชอบออกแบบ)
1. **ตัวละคร** — ลิเอน่า (ไฮเอลฟ์ tsundere), เคน (ผู้เล่น), + heroine คนถัด ๆ ไป (ฮาเร็ม) · ใช้ฟอร์แมต character card เดียวกับ `star-academy-meta.json`
2. **โลก/lore** — เอลดรา, ตราทาส/ยุคพันธนาการ, กฎพลังตรา
3. **บท + ตัวเลือก** — scene beats + choices + ผลต่อ bond (ออกแบบ + บาลานซ์ด้วย judge)
4. **เทียร์คำสั่ง** — `command_req` + เงื่อนไข "ใจเธอ" ต่อคำสั่ง (รวมคอนเทนต์ R18 ตามเทียร์)
5. **ตอนจบ** — เกณฑ์ + เนื้อหา warm/cold (ขยายเป็นหลาย ending ได้)
6. **คอนเทนต์ R18 ตามเทียร์** — gated ด้วย mature_mode (รองรับเวอร์ชัน all-age ด้วยการปิด)

## 4. สัญญาส่งต่อ (Handoff Contract: novel → game)
แอป novel export → ไฟล์ที่เกม Godot กินได้:
| ออกจาก novel | เข้าเกมเป็น | รูปแบบ |
|---|---|---|
| character card | `CharacterData` resource (`id/display_name/start_bond/portrait_dir`) | JSON → .tres / สร้าง .tres ตรง ๆ |
| scene beats + choices | `dialogues/*.dialogue` (Dialogue Manager) | gen ฟอร์แมต `~ title / Liena: ... / - choice / do GameState.add_bond(...)` |
| เทียร์ + เกณฑ์ | `bond-config` (command_req, ending threshold) | JSON → ใส่ GameState |
| ตอนจบ | `ending_scene` text | ข้อความตามผล |
| สเปกภาพตัวละคร | sprite 6 สีหน้า + bg | brief จากระบบ ref/image-gen ของ novel |

**ตัวเชื่อมที่ต้องสร้าง (exporter):** novel beats → `.dialogue` (Dialogue Manager syntax) — เรามี prose pipeline + โครง choice/bond อยู่แล้ว เหลือ format adapter
> Dialogue Manager ใช้ `{{player_name}}` แทนชื่อ + `do GameState.add_bond("liena", N)` เป็น mutation (ดูตัวอย่างไฟล์ 06 หมวด C-5)

## 5. นิยายอิงเกม (Tie-in Novel)
เขียน prose เรื่อง "Find Harem Fantasy" ในแอป novel ด้วย pipeline ใหม่:
- **bible:** สร้างแบบ `star-academy` (ตัวละคร ลิเอน่า/เคน + โลกเอลดรา + ตราทาส + styleGuide/vocabPalette/dontList)
- **POV:** บุคคลที่ 3 limited ติดตามเคน (ตัวเอกชายตัวตนชัด) — `pov:'3rd'` + `narrator:'เคน'`
- **ตราทาสสมบูรณ์:** เคน config `power` + `powerStanding=true` · `rel −100..100` เป็นมาตรวัดใจ (ไม่ gate คำสั่ง)
- **stateCard = live-state:** rel + location (ทุ่ง/แคมป์/ป่า) + outfit + สถานะตรา (สว่าง/หรี่ตาม rel)
- **mode:** novel/r18 ต่อฉาก · ฉาก R18 ปลดตามเทียร์บอนด์ให้ตรงกับเกม (ออรัล@40 / sex@60 / 100)
- **ประโยชน์ลูป:** นิยายเดินหน้าก่อนเกม → ตรวจเสียงตัวละคร/บีต/ค่าบอนด์ → ป้อนบทกลับเป็น `.dialogue` ของเกม

## 6. งานที่ต้องทำต่อ (Next Steps)
1. สร้าง bible `story/findharemfantasy/` ในแอป novel (ตัวละคร ลิเอน่า/เคน + โลก + ตราทาส) — ฟอร์แมต meta.json
2. ยืนยัน map rel↔bond + ตารางเทียร์คำสั่ง (สเกล/ตัวเลข)
3. เขียน exporter: novel beats → `.dialogue` + `characters` + `bond-config`
4. เขียนนิยายตอนเปิด (ฉาก ตก→ตีตรา→แคมป์) ด้วย pipeline ใหม่ → เทียบกับบทไฟล์ 04 → ป้อนกลับ
5. (ภาพ) ใช้ ref/image-gen ของ novel ทำ sprite 6 สีหน้า + bg ตามสเปกไฟล์ 03

## 7. ข้อสรุป (เคาะแล้ว 2026-06-14)
1. **POV:** บุคคลที่ 3 limited ติดตาม **เคน** — และเคนเป็น "ตัวเอกชายที่มีตัวตนชัดเจน" (ไม่ใช่ avatar เปล่าของผู้เล่น) ออกแบบบุคลิก/ภูมิหลัง/เสียงให้ครบ
2. **ตราทาส + rel:** นิยายใช้ **"ตราทาสสมบูรณ์แบบ ได้รับจากพระเจ้า"** (ต่างจากตราปกติของโลกเอลดรา) — กฎ:
   - คำสั่งของเคนต่อ "การกระทำ/ร่างกาย" ของผู้ถูกตี **ต้องเชื่อฟังเสมอ** ไม่ว่า rel จะติดลบแค่ไหน
   - "ใจ/คำพูด/ท่าที/ความคิด" เป็น **อิสระ** — ด่า ประชด เกลียด คิดต้านได้เต็มที่ (กายจำยอมแต่ใจไม่ยอม)
   - ผู้ถูกตี **ทำร้ายเจ้าของตรา (เคน) ไม่ได้** แม้ rel = −100 (ตราปกป้องเจ้าของ)
   - `rel −100..100` = **มาตรวัดความสัมพันธ์/ใจเท่านั้น** ไม่ใช่ gate ของคำสั่ง
   - → map ตรงกับ `power` + `powerStanding=true` ของแอป novel (อำนาจบังคับร่างกายถาวร + rel เลื่อนตามจริง)
   - **divergence จากเกม:** เกม `can_command()` gate ด้วย bond (สั่งเกิน=ปฏิเสธ+ลด) · **นิยายไม่ gate** (ตราสมบูรณ์ สั่งได้หมด) — ดราม่าอยู่ที่เคน "เลือกไม่ใช้บังคับ" ทั้งที่ทำได้
3. **R18:** นิยาย **อิสระเต็มที่** (ไม่ผูกเทียร์เกม) — ใช้ R18 lexicon/เสรีของแอป novel ตามฉาก
4. **Export:** **แยกระบบนิยาย ↔ Godot ออกจากกันชัดเจน** (เยอะกว่าแต่ชัวร์กว่า) — novel เขียน/เก็บคอนเทนต์ในระบบตัวเอง, มี **ขั้น export แยกต่างหากชัด ๆ** ผลิตไฟล์ Godot ห้าม auto-gen `.dialogue` ปนกับ flow เขียนนิยาย (ดู §4 — exporter เป็น step แยก ไม่ inline)
5. **ขอบเขตเฟสแรก:** **ลิเอน่าคนเดียว** (ตรงเกม Phase 1) — ยังไม่วางโครงฮาเร็มหลายคน

> ⚠️ จุดต่างหลัก novel vs game: **novel = ตราสมบูรณ์ (สั่งได้หมด, rel แค่วัดใจ)** · **game = bond gate คำสั่ง** — ตอน export ต้อง "แปลง" ไม่ใช่ก๊อปตรง (เช่น ฉากนิยายที่เคนเลือกไม่สั่ง → กลายเป็น choice ในเกม)
