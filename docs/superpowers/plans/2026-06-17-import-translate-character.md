# นำเข้าตัวละคร AI ภาษาอังกฤษ → แปลเป็นไทย (Import + Translate) — แผน

> สถานะ: planned · ที่มา: ผู้ใช้อยากเอาตัวละครจากที่อื่น (เช่น การ์ด SillyTavern อังกฤษที่แชร์กันเยอะ) มาเล่นเป็นไทย
> ตอบสั้น: **ทำได้** — เรามี import การ์ด V2/V3 อยู่แล้ว ([card-client.ts](../../../novel-next/src/lib/card-client.ts) → [card-v2.ts](../../../novel/card-v2.ts)) เพิ่มแค่ขั้น "แปลฟิลด์เป็นไทย" ด้วย LLM

**Goal:** import การ์ดตัวละครอังกฤษ → แปลทุกฟิลด์ข้อความเป็นไทยธรรมชาติ (คงความหมาย/โทน/บุคลิก, R18-capable) → เล่นต่อได้เลย

**Architecture:** เพิ่ม endpoint แปลฟิลด์ (คล้าย `generate-fields` ที่เพิ่งทำ) + ปุ่มในโมดอลตัวละคร. แปลแยกจาก import เพื่อให้ผู้ใช้กดแปลเมื่อไรก็ได้ (รวมถึงตัวละครที่พิมพ์อังกฤษเอง)

---

## ทำไมต้องแปลฟิลด์ (ไม่ใช่แค่ให้ตอบไทย)
ระบบ prompt เป็นไทยอยู่แล้ว ตัวละครจะ "ตอบ" ไทยได้ — แต่ถ้าฟิลด์ (appearance/personality/scenario/greeting/voiceExamples) ยังเป็นอังกฤษ จะมี **2 ปัญหา**: (1) บริบทอังกฤษปนเข้า prompt ทำโทนเพี้ยน/หลุดคำอังกฤษ, (2) lorebook/ตัวอย่างบทพูดอังกฤษ → เสียงตัวละครไม่เป็นไทย. แปลฟิลด์ให้เป็นไทยทั้งหมด = บุคลิกไทยเนียน

---

## Task 1: Backend — endpoint แปลฟิลด์ตัวละคร
**Files:** `novel/server.ts` (เพิ่มถัดจาก `/api/chat/characters/generate-fields`)

- [ ] `POST /api/chat/characters/translate` body `{ char: Record<string,any>, target?: 'th', keepNames?: boolean, provider? }` → `{ ok, translated: Record<string,string> }`
  - แปลเฉพาะฟิลด์ข้อความที่ไม่ว่าง: `appearance, outfit, description, mindset, behavior, speechTone, voiceExamples, scenario, greeting, likes, dislikes, power` (+ `name` ถ้า `keepNames=false`)
  - system prompt (ไทย): "แปลฟิลด์ตัวละครต่อไปนี้เป็นภาษาไทยที่เป็นธรรมชาติสำหรับโรลเพลย์ผู้ใหญ่ (18+ ได้). คงความหมาย โทน บุคลิก และ**รูปแบบหลายบรรทัด** (\\n ใน likes/dislikes/voiceExamples). ชื่อเฉพาะ/ชื่อตัวละคร: ${keepNames ? 'คงไว้เป็นอังกฤษ/ทับศัพท์ตามเหมาะ' : 'ทับศัพท์เป็นไทย'}. ตอบ JSON คีย์เดิมเป๊ะ ค่าทุกตัวเป็นไทย ห้าม markdown."
  - reuse pattern เดิม: `callAI` + แมตช์ `{...}` + parse + รับเฉพาะคีย์ที่ส่งไป + `logCall`
  - **ความยาว:** การ์ดบางตัว description ยาวมาก → ถ้ารวมทุกฟิลด์ทีเดียวเกิน max_tokens อาจถูกตัด → **แปลทีละ batch** (เช่นกลุ่มละ 4-5 ฟิลด์) หรือ per-field; เริ่มจากทีเดียว max_tokens ~2500 แล้วถ้ายาวค่อย chunk
- [ ] เทส smoke (ถ้ามี Mongo/provider local): ส่ง char อังกฤษ → ได้ไทยกลับ คีย์ครบ

## Task 2: Client wrapper
**Files:** `novel-next/src/lib/chat-api.ts`
- [ ] `translateCharFields(body: { char; keepNames?: boolean; provider? })` → POST endpoint ข้างบน (สไตล์เดียวกับ `generateCharFields`)

## Task 3: UI — ปุ่ม "แปลเป็นไทย" ในโมดอลตัวละคร
**Files:** `novel-next/src/components/screens/chat/ChatCharModal.tsx`
- [ ] หลัง import การ์ด (`onImportFile`): **ตรวจว่าฟิลด์ส่วนใหญ่เป็นอังกฤษไหม** (heuristic: นับสัดส่วนอักษร a-z เทียบอักษรไทยใน description+appearance) → ถ้าใช่ โชว์ toast/แถบ "การ์ดนี้เป็นภาษาอังกฤษ — กดแปลเป็นไทย?" + ปุ่ม
- [ ] ปุ่ม **"🌐 แปลเป็นไทย"** (วางแถวเดียวกับปุ่มนำเข้า/ส่งออกการ์ด ด้านล่างโมดอล) → เรียก `translateCharFields({ char: d, keepNames: <ตัวเลือก>, provider })` → เขียนทับฟิลด์ที่แปลแล้ว (`setD` functional merge) → toast "แปลแล้ว 🌐"
  - busy state + ระหว่างแปลปิดปุ่ม
  - checkbox เล็ก "คงชื่อเดิม (ไม่ทับศัพท์)" → ส่ง `keepNames`
- [ ] reuse `useChatProvider` เหมือน generate-fields

## Task 4 (ออปชัน): ติ๊ก "แปลตอนนำเข้า" 
- [ ] ใน flow import เพิ่ม toggle "แปลเป็นไทยอัตโนมัติหลังนำเข้า" — ถ้าติ๊ก import แล้วเรียก translate ต่อทันที (UX ขั้นเดียวจบ)

---

## หมายเหตุ / ระวัง
- **ToS embedding/LLM**: เนื้อหา 18+ — ใช้ provider เดียวกับที่เล่นแชทอยู่ (DeepSeek/local) ที่ผ่านมาแล้ว
- **lorebook**: การ์ด V2/V3 มี `character_book` (lore) อังกฤษด้วย — เฟสแรกแปลเฉพาะฟิลด์โปรไฟล์ก่อน; lore แปลทีหลัง (วนแปล `lore[].text`) เป็น Task เสริม
- **คงรูปแบบ**: likes/dislikes/voiceExamples เป็นหลายบรรทัด — ย้ำใน prompt ให้คง `\n` ไม่งั้นเสีย structure
- **ของที่มีอยู่ไม่ต้องทำใหม่**: import การ์ด (PNG tEXt / JSON) ทำงานแล้ว — งานนี้ต่อท้าย ไม่แตะ parser
- เกี่ยวข้อง: ฟีเจอร์ generate-fields ([commit ก่อนหน้า]) ใช้ pattern เดียวกัน — แปลคือ generate แบบ "คงความหมาย"
