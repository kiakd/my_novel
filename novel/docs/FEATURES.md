# คลังนิยาย — Feature Reference & Roadmap

> อัปเดต: 2026-05-29
>
> ✅ **ทำแล้ว (เดิมเป็น roadmap):** Style Guide (#15), Character Voice Library (#13), Location cards (#1/#8), Vocabulary Palette (#16)
> → ทั้งหมดเข้า prompt ที่ `buildAISystemPrompt()` ใน `novel.html`
>
> 🆕 **Ground-truth export:** `bun export-story-md.ts` → gen `storyline.md` / `character.md` / `event.md` จาก Mongo (ที่ skill `novel-writer-r18` อ่าน) — แก้ในแอปแล้ว re-run
> 🆕 **Cheat-sheet:** `docs/character-locking-cheatsheet.md` — เทคนิคกัน AI หลุดคาร์

---

## ระบบที่มีอยู่แล้ว (Current Features)

### หัว Header
| ปุ่ม | หน้าที่ |
|------|---------|
| Story Selector | สลับเรื่อง / หลายเรื่องพร้อมกัน |
| + เรื่องใหม่ | สร้าง story object เปล่า |
| ✏️ | เปลี่ยนชื่อเรื่อง |
| 🗑 | ลบเรื่อง (ถามยืนยัน) |
| 🔄 Sync DB | เปรียบ timestamp local ↔ MongoDB แล้ว push/pull ทิศที่ใหม่กว่า |
| 💾 Export | dump state JSON ทั้งก้อนลงไฟล์ |
| 📂 Import | โหลด JSON กลับ (merge ไม่ทับ ID เดิม) |

---

### Tab 1 — โครงเรื่อง (Plot)
| ช่อง | ข้อมูล | เข้า AI Prompt |
|------|--------|---------------|
| Genre | แนวเรื่อง | ✓ (world block) |
| Theme | แก่นเรื่อง | ✓ |
| Premise / Logline | ประโยคสรุปเรื่อง | ✓ |
| โครงเรื่องโดยละเอียด | ภาพรวม arc ทั้งหมด | ✓ |
| ⚙️ World Rules & Lore | ระบบ Rank, พลัง, เทคโนโลยี, สถาบัน | ✓ (section แยก) |
| 🎯 Do / Don't | กฎ AI ต้องทำ / ห้ามทำ | ✓ (section สุดท้าย) |

---

### Tab 2 — ตัวละคร (Characters)
**ช่องในแต่ละ character object:**

| ช่อง | XML tag | AI ใช้ |
|------|---------|--------|
| ชื่อ | `name=` attr | ✓ |
| บทบาท (role) | badge display | — |
| คำอธิบายสั้น | description | — |
| ลักษณะกาย | `<apr>` | ✓ |
| สกิล / พลัง | `<skill>` | ✓ |
| วิธีคิด (Mindset) | `<mnd>` | ✓ |
| นิสัย (Behavior) | `<behav>` | ✓ |
| สรรพนามตัวเอง | `pronoun_self` → `<ooc>` | ✓ |
| เรียกอีกฝ่าย | `pronoun_other` | ✓ |
| โทนเสียง (Speech Tone) | `<ooc>` | ✓ |
| สีประจำตัว | color dot display | — |

**ฟีเจอร์สร้าง:**
- ปุ่ม ✨ เจนข้อมูลทีละช่อง (Gen Field) — call `/api/generate` ให้ AI เติมช่องเดียว
- ปุ่ม ✨ เจนทุกช่องที่ว่าง — รันทีละช่องเรียงลำดับ

---

### Tab 3 — ความสัมพันธ์ (Relations)
- เพิ่ม/แก้ไข/ลบ relation ระหว่างตัวละคร 2 ตัว
- ช่อง: ความสัมพันธ์, ความรู้สึก, Flags (key=value)
- แสดง graph ด้วย cytoscape.js (node = char, edge = relation)
- เข้า AI prompt ผ่าน `<relate>` block

---

### Tab 4 — บทนิยาย (Chapters)
**List View:**
- Card แต่ละบท: ชื่อบท, สรุป, word count
- ปุ่มต่อเรื่อง (▶) ในทุก card — เปิด modal เลือกทิศทาง AI

**Editor View (TipTap rich text):**
- Toolbar: Bold, Italic, Heading, List, Quote, Undo/Redo
- ปุ่ม 👤 สแกนตัวละคร — AI วิเคราะห์บทหาตัวละครใหม่
- ปุ่ม ▶ ต่อเรื่อง — flush editor แล้วเปิด modal เหมือน list view
- Panel ด้านข้าง: Spell check, ตรวจ ค่ะ/คะ, Character whitelist

**Modal "ต่อเรื่อง" (3 ตัวเลือก):**
| Option | พฤติกรรม AI |
|--------|-------------|
| 🔥 R18+ | เขียนฉากต่อแบบ explicit |
| 📖 ดำเนินเรื่อง | ต่อเนื้อเรื่องตามปกติ (novel mode) |
| ➡️ ปิดเหตุการณ์ | ตัวละครจบเหตุการณ์และ transition ไปฉากถัดไป |

---

### Tab 5 — ไทม์ไลน์ (Timeline)
- เพิ่มเหตุการณ์แบบ manual พร้อมวันที่, สถานที่, ตัวละครที่เกี่ยวข้อง
- Auto-create timeline event เมื่อ scan พบตัวละครใหม่แล้วเพิ่ม character
- แสดงแบบ vertical timeline เรียงตามเวลา

---

### Tab 6 — ตั้งค่า (Settings)
- AI Provider: OpenRouter / DeepSeek
- Model override
- Temperature, Max tokens

---

### ระบบ AI Prompt Assembly (`buildAISystemPrompt`)
```
BASE_RULES (กฎเหล็ก 6 ข้อ)
  + Mode block (novel / dialogue / r18)
  + <world> (genre, era, location, rules, tone)
  + [World Rules & Lore] ← จาก plot-world-rules
  + [Do/Don't] ← จาก plot-dont-list
  + <char> protagonist (apr, prf, mnd, behav, ooc)
  + <sup_char> supporting x N
  + <relate> relations
  + event order history
  + current event (user input)
```

---

### API Endpoints
| Method | Path | หน้าที่ |
|--------|------|---------|
| GET | `/` | serve novel.html |
| GET | `/api/health` | ping MongoDB |
| GET | `/api/state` | ดึง app state ทั้งก้อน |
| PUT | `/api/state` | บันทึก app state |
| GET | `/api/dict` | ดึง user dictionary |
| PUT | `/api/dict` | บันทึก dictionary |
| GET | `/api/providers` | รายชื่อ provider ที่ใช้งานได้ |
| POST | `/api/generate` | AI raw (system+user) |
| POST | `/api/generate-roleplay` | AI roleplay ด้วย NovelContext |
| POST | `/api/expand` | **ขยายงานเขียน** — draft + โหมด (scene/action/polish) + tag จากรูป (optional) → ร้อยแก้วไทย |
| POST | `/api/ref/tag` | รูป → booru tags (WD14 โลคัล) แยกหมวด — ใช้ป้อนให้ /api/expand |

---

## สิ่งที่ควรเพิ่ม — Deep Resource Analysis

### 🗺️ หมวด World Building (โลกและสถานที่)

#### 1. World Map Tab (แผนที่โลก)
- **แผนที่เมือง** — SVG/Canvas แบบวาดได้หรืออัปโหลด image
- **Zones**: ย่านที่อยู่อาศัย, ย่านธุรกิจ, พื้นที่อันตราย, สถาบัน
- **แต่ละ location card**: ชื่อ, คำอธิบาย, บรรยากาศ, ตัวละครที่อาศัย, บทที่ปรากฏ
- เข้า AI prompt เป็น `<location>` block ใน world setting
- **Priority: สูง** — ช่วยให้ AI บรรยายฉากได้สม่ำเสมอ ไม่สร้างสถานที่ผิดพลาด

#### 2. Institution / Organization Detail
- **โครงสร้างสถาบัน**: ชื่อ, ประเภท, จุดประสงค์, ลำดับชั้น, กฎภายใน
- สำหรับมหาวิทยาลัย: คณะ, อาคาร, สนามทดสอบ, หอพัก, แคนทีน
- Link กับตัวละครที่เป็นสมาชิก
- เข้า AI prompt เป็นส่วนใน World Rules

---

### ⚡ หมวด Power System (ระบบพลัง)

#### 3. Power / Ability Designer
- **Power Card** แต่ละพลัง: ชื่อ, ประเภท, Rank, กลไก, ข้อจำกัด, ต้นทุน (MP/ความเหนื่อยล้า)
- **Interaction Matrix**: พลัง A vs พลัง B → ผลลัพธ์คืออะไร
- **ตรวจ Lore Consistency**: AI ช่วยวิเคราะห์ว่าพลังที่ออกแบบขัดแย้งกันไหม
- ฟิลด์สำคัญ: `trigger`, `cooldown`, `cost`, `weakness`, `visual_effect`
- เข้า AI prompt ผ่านช่อง `skill` ของตัวละคร + World Rules

---

### 📝 หมวด AI Roles (บทบาท AI ใหม่)

#### 4. 🖊️ Writing Assistant — ผู้ช่วยเขียน
> มีอยู่แล้วบางส่วน (ต่อเรื่อง) แต่ขยายได้อีก

| Mode ใหม่ที่แนะนำ | หน้าที่ |
|------------------|---------|
| ✍️ เขียนใหม่ทั้งบท | รับ outline → เขียน full chapter |
| 🔄 Rewrite ย่อหน้า | ปรับโทน/ความยาว/สไตล์ของย่อหน้าที่เลือก |
| 💬 เพิ่มบทพูด | รับ scene → generate dialogue สำหรับตัวละครที่เลือก |
| 🌅 เขียน scene | รับ [สถานที่ + อารมณ์] → บรรยายฉาก |
| ✂️ ย่อ/ขยาย | ย่อ/ขยายข้อความที่เลือก |

#### 5. 📋 Editor / บรรณาธิการ
> AI วิเคราะห์บทและให้ feedback แบบบรรณาธิการจริง

**ตรวจหัวข้อเหล่านี้:**
- **Pacing**: บทนี้เร็วหรือช้าเกินไปในส่วนไหน
- **Show vs Tell**: จุดไหนบอกเล่าแทนที่จะให้ผู้อ่านรู้สึกเอง
- **Tension curve**: อารมณ์ไหลเรื่อย หรือแบนราบ
- **Dialogue naturalism**: บทพูดเป็นธรรมชาติไหม ตรงกับบุคลิกไหม
- **Sensory detail**: มีครบ 5 ประสาทสัมผัสไหม
- Output เป็น punch list มี line reference

#### 6. 🔍 Plot Hole Checker — ตรวจช่องโหว่
> AI อ่านทุกบทแล้ว cross-reference กับ world rules + characters

**ตรวจ:**
- ตัวละครพูด/ทำอะไรขัดกับ behavior ที่กำหนด
- Rank / พลังที่ใช้ขัดกับ lore
- Timeline ขัดแย้งกัน (ตัวละคร A อยู่สองที่พร้อมกัน)
- ข้อเท็จจริงในบทต่างๆ ไม่ตรงกัน
- ตัวละครรู้ข้อมูลที่ตัวเองไม่ควรรู้

#### 7. 🎨 Style Consistency Checker — ตรวจโทน
**ตรวจ:**
- โทนเรื่องหลุดจาก "light novel สดใส" ไปเป็นจริงจังหรือเปล่า
- คำศัพท์และสไตล์สม่ำเสมอในทุกบท
- Character voice drift (กรพูดเย็นชาแทนที่จะแซว)

#### 8. 📚 Resource Assistant — ผู้ช่วย Resource
**สำหรับโลกนิยายที่มีระบบซับซ้อน:**
- ถาม AI ว่า "พลัง X ทำแบบนี้ได้ไหม ตาม lore ที่มี?"
- "อธิบายกลไก Arty Creation ในแบบที่ตัวละครอายุ 18 เข้าใจ"
- "Rank B+ มีข้อจำกัดอะไรบ้าง?"
- AI ตอบโดยอ้างอิง World Rules ในระบบเท่านั้น (ไม่คิดเอง)

---

### 🧩 หมวด Story Structure

#### 9. Story Arc / Chapter Outline
- โครงสร้าง 3 act / 5 จุดพลิก
- **Chapter Cards ใน Outline**: บทที่ X → ฉากหลัก → จุดสำคัญ → emotion target
- AI ช่วยวิเคราะห์ว่า arc ไหนขาด / เกิน
- Link กับ chapters จริงที่เขียนแล้ว

#### 10. Scene Board (Kanban-style)
- Column: Planned / Draft / Written / Revised
- แต่ละ scene card: location, chars involved, mood, purpose (advance plot / develop char / world building)
- ลาก drop ระหว่าง column

#### 11. Chapter Continuity Panel
- แสดง "ท้ายบทที่แล้วจบตรงไหน" ก่อนเปิดบทใหม่
- Summary อัตโนมัติจาก AI เมื่อ save บท
- "Character State" ท้ายบท: ตัวละครอยู่ที่ไหน รู้สะสมอะไร มีอารมณ์อะไร

---

### 🔬 หมวด Character Depth

#### 12. Character Arc Tracker
- จุดเริ่มต้น → จุดสิ้นสุด (character wants vs needs)
- Milestone: ตัวละครเปลี่ยนแปลงในบทไหน เพราะอะไร
- AI ตรวจว่า arc พัฒนาสม่ำเสมอหรือหยุดนิ่ง

#### 13. Character Voice Library
- ตัวอย่าง dialogue 5-10 ประโยคสำหรับแต่ละตัวละคร (few-shot)
- AI ใช้ตัวอย่างเหล่านี้เป็น reference เวลาเจน
- ป้องกัน "character drift" ได้ดีที่สุด

#### 14. Relationship Dynamic Log
- บันทึกว่า ณ แต่ละบท ความสัมพันธ์อยู่ที่ระดับไหน
- แกน X = บท, แกน Y = ระดับความสนิท/ความขัดแย้ง
- เชื่อม Flags จาก relation ที่มีอยู่แล้ว

---

### ✍️ หมวด Signature Style (ลายเซ็นต์)

#### 15. Style Guide (คู่มือสไตล์)
> ช่อง text ที่คุณเขียนเองว่านิยายของคุณ "รู้สึก" แบบไหน

**ตัวอย่างสิ่งที่ควรเขียน:**
```
- ประโยคสั้น ตัดจังหวะเยอะ ไม่ใช้ clause ซ้อนเกิน 2 ชั้น
- inner thought ออกมาบ่อย ขัดแย้งกับปากเสมอ
- เปิดบทด้วย sensory detail ก่อนเสมอ (กลิ่น > เสียง > ภาพ)
- บทพูดไม่ formal แม้แต่กับผู้ใหญ่
- อารมณ์ขันอยู่ในสถานการณ์ ไม่ใช่ในคำบรรยาย
- R18: ไม่ใช้คำเปรียบเปรยดอกไม้ ใช้คำตรงๆ แต่มีอารมณ์
```

- AI อ่าน Style Guide นี้ก่อนเจนทุกครั้ง
- มีปุ่ม "วิเคราะห์ style ของฉันจากบทที่เขียนแล้ว" — AI สกัด pattern ออกมาให้

#### 16. Vocabulary Palette
- คำเฉพาะในโลกนิยายนี้ที่ AI ต้องใช้
- คำที่ห้ามใช้ (เช่น ห้ามใช้ "คลิตอริส" ให้ใช้ "จุดสุข")
- คำแสลงประจำตัวละครแต่ละคน
- รวม user dictionary ที่มีอยู่แล้ว

---

## Priority Roadmap

### Phase 1 — Foundation
1. ✅ **Character Voice Library** — ทำแล้ว (`char-voice-examples` → few-shot ใน prompt)
2. ✅ **Style Guide** — ทำแล้ว (`plot-style-guide`)
3. ⬜ **Chapter Summary auto-gen** — กด save บท → AI สรุปสั้นอัตโนมัติ (ยังไม่ทำ)
4. ✅ **World Locations** — ทำแล้ว (`s.locations` → block ใน prompt)
5. ✅ **Vocabulary Palette** — ทำแล้ว (`plot-vocab-palette`)

### Phase 2 — AI Roles
5. **Editor mode** — ปุ่ม "ให้ AI ตรวจบทนี้" → punch list ใน panel ข้าง
6. **Plot Hole Checker** — cross-reference ทุกบท (อาจใช้ context หลายบทพร้อมกัน)
7. **Rewrite paragraph** — เลือก text → right-click menu → rewrite

### Phase 3 — World Building
8. **Location cards** (สถานที่) — form + ลงใน world prompt
9. **Power system** — ability designer + lore checker
10. **Scene Board** — Kanban chapter planning

### Phase 4 — Analytics
11. **Character Arc graph**
12. **Relationship dynamic timeline**
13. **Pacing chart** (word count per chapter vs emotion intensity)

---

## Quick Wins ที่ทำได้เลยวันนี้

### เพิ่ม Character Voice Library (ไม่ต้องสร้าง tab ใหม่)
เพิ่มช่องใน character modal:
```
ตัวอย่างบทพูด (3-5 ประโยค — AI ใช้เป็น reference)
[textarea: char-voice-examples]
```
เข้า prompt ด้วย `<voice_sample>` ใน `<char>` block

### เพิ่ม Style Guide ใน Plot tab
เพิ่มอีก 1 textarea ใต้ Do/Don't:
```
✍️ Style Guide — ลายเซ็นต์การเขียนของฉัน
```
เข้า prompt เป็น section แรกก่อน World Rules

### Auto-summary เมื่อ save chapter
เมื่อกด save บท → ถ้า `summary` ว่าง → AI gen สรุป 2-3 ประโยคอัตโนมัติ (background)

---

## โครงสร้าง State ที่แนะนำให้เพิ่ม

```javascript
story = {
  // มีอยู่แล้ว
  plot, genre, theme, premise, worldRules, dontList,
  characters[], relations[], chapters[], timeline[],

  // เพิ่มใหม่ Phase 1
  styleGuide: '',          // ลายเซ็นต์สไตล์การเขียน
  vocabPalette: '',        // คำเฉพาะ / คำห้ามใช้

  // เพิ่มใหม่ Phase 2-3
  locations: [],           // [{id, name, zone, desc, mood, chars[], chapters[]}]
  powers: [],              // [{id, name, rank, type, mechanism, cost, weakness}]
  sceneBoard: [],          // [{id, title, status, chars[], mood, purpose}]

  // ใน character object
  character.voiceExamples: '',   // few-shot dialogue samples
  character.arcNotes: '',        // character arc from → to
}
```

---

*doc นี้ update ได้เรื่อยๆ เมื่อเพิ่มฟีเจอร์ใหม่*
