# Anti-Drift Roadmap — กันตัวละครหลุด/เพี้ยนในแชท RP ยาว

> ที่มา: deep research 2026-06-10 (19 แหล่ง, verify แบบ adversarial 3 เสียง/claim — เหลือ 20 claims ที่ยืนยันได้)
> หลักฐานพื้นฐาน: persona drift วัดได้ตั้งแต่ ~8 เทิร์นแม้โมเดล 70B (COLM 2024, arXiv:2402.10962)
> และ character card ใน system prompt อย่างเดียว "ไม่พอ" — ต้องมีชั้นป้องกันเสริม

## สถานะ Phase

| Phase | เรื่อง | สถานะ |
|---|---|---|
| 1 | Persona reminder ท้าย context + ปิดรูรั่ว summarizer | ✅ เสร็จ 2026-06-10 |
| 2 | Lorebook แบบ keyword-triggered | ✅ เสร็จ 2026-06-10 |
| 3 | Structured memory แยกหมวด (state tracking) | ✅ เสร็จ 2026-06-10 |
| 4 | Vector RAG เหนือ chat log | ⬜ ยังไม่ทำ |
| 5 | Voice reinforcement ละเอียดขึ้น | ⬜ ยังไม่ทำ (มีเวอร์ชันย่อใน Phase 1 แล้ว) |

---

## ✅ Phase 1 — เสร็จแล้ว (2026-06-10)

สิ่งที่ทำไปแล้ว เผื่อย้อนดู:

1. **Persona reminder ใกล้ท้าย context** — `buildPersonaReminder()` ใน `novel/chat-prompt.ts`
   ถูก prepend เข้า user message ทุกเทิร์นฝั่ง server (`/api/chat` ใน `server.ts`) ไม่ถูกเก็บลง history ฝั่ง client
   เนื้อหา: ชื่อ/สรรพนาม/โทนเสียง + ตัวอย่างเสียง 1 ประโยค + ระดับความสัมพันธ์ + กฎคงร่างปลอมล่าสุด
   มีเวอร์ชันแยกสำหรับโหมด narrator (เน้นห้ามเดา/สลับเพศ-รูปลักษณ์ร่างปลอม)
2. **ปิดรูรั่ว summarizer** — `SUMMARY_SYSTEM` ใน `novel-next/src/lib/chat-api.ts`:
   ห้ามเดาข้อเท็จจริงที่ไม่อยู่ในต้นฉบับ (โดยเฉพาะเพศ/รูปลักษณ์/ชื่อของร่างปลอม — ห้ามอนุมานเพศจากชื่อ)
   และบังคับปิดท้ายย่อหน้า **"สถานะปัจจุบัน:"** (ที่อยู่ / การปลอมตัว / ใครรู้ตัวจริง / ชุด-ของ)
3. บั๊กที่เคยเกิดจริง (case study): summarizer เดาว่า "ออเรล" (ชื่อร่างปลอมของออเรเลีย) เป็น **ชายหนุ่ม**
   ทั้งที่ในแชทไม่เคยระบุเพศ → narrator รับไปใช้ต่อ → ขัดกับฉากหมั้น = **rolling summary poisoning**
   (ซ่อมข้อมูลแล้ว + ข้อ 2 ป้องกันไม่ให้เกิดซ้ำ — Phase 3 คือทางแก้ขาด)
4. ของเดิมที่มีอยู่ก่อนแล้วและดีอยู่: rolling summary + cap ตามความยาวต่อ provider, ความจำฉากลับแยก,
   rel judge แยกประเมิน, ผู้เล่นแก้ summary เองได้ (หน้า ⚙️), hierarchical rebuild script

---

## ✅ Phase 2 — Lorebook แบบ keyword-triggered (เสร็จ 2026-06-10)

**สิ่งที่ทำจริง (ตรงตามแผนด้านล่าง):** `LoreEntry` ใน chat-types.ts (มี priority แต่ UI ยังไม่เปิดให้ตั้ง — default 0) ·
`chat-lore.ts` (`activateLore`: scan 6 ข้อความล่าสุด+ข้อความที่ส่ง, งบ 800 ตัวอักษร, always มาก่อน → priority) ·
ส่งผ่าน `sendChat({lore})` → server → `loreSection()` แทรกใกล้ท้าย system prompt (ทั้งโหมด char และ narrator) ·
UI แก้ใน ChatCharModal (section "📚 Lorebook") · ทดสอบ e2e แล้ว: keyword "ลูน่า" → section "ข้อเท็จจริงที่เกี่ยวกับฉากตอนนี้" โผล่ใน system prompt จริง
**หมายเหตุ:** lore อยู่ใน snapshot ของ session — แชทเก่าที่เปิดก่อนเพิ่ม lore จะไม่เห็น lore ใหม่ (ต้องเริ่มแชทใหม่ หรือไปแก้ template แล้วสร้าง session ใหม่)

<details><summary>แผนเดิม (เก็บไว้อ้างอิง)</summary>

**ปัญหาที่แก้:** ข้อเท็จจริงโลก/ตัวละครรอง (ลูน่า, ไกอัส, เมืองท่าไม้สน, ตราทาส...) ตอนนี้ต้องพึ่ง summary
อย่างเดียว ซึ่งจะเลือนเมื่อถูกย่อซ้ำ — lorebook คือ "พจนานุกรมไดนามิก" จ่าย token เฉพาะ lore ที่เกี่ยวกับฉากปัจจุบัน
(แบบ World Info ของ SillyTavern / `character_book` ใน Card Spec V2)

**Data model** — เพิ่มใน `novel-next/src/lib/chat-types.ts`:

```ts
export interface LoreEntry {
  id: string;
  keys: string[];        // keyword ที่ trigger เช่น ['ลูน่า', 'ร้านขนมปัง']
  text: string;          // ข้อเท็จจริงที่จะแทรก (สั้น กระชับ 1-3 ประโยค)
  always?: boolean;      // ใส่เสมอไม่ต้องรอ keyword (= constant ของ ST)
  priority?: number;     // เลขน้อยโดนตัดก่อนเมื่อเกินงบ (default 0)
}
// เพิ่มใน ChatChar:  lore?: LoreEntry[];
```

**Logic ฝั่ง client** — ไฟล์ใหม่ `novel-next/src/lib/chat-lore.ts`:

```ts
// สแกน keyword จาก "raw history + ข้อความที่กำลังพิม" (scan_depth = N ข้อความล่าสุด เช่น 6)
// คืน entries ที่ match (case-insensitive, includes) + always ทั้งหมด
// เรียงตาม priority แล้วตัดเมื่อความยาวรวมเกินงบ (เช่น 800 ตัวอักษร)
export function activateLore(lore: LoreEntry[], recentTexts: string[], budget = 800): LoreEntry[]
```

**จุดต่อเข้าระบบ:**
- `ChatScreen.tsx` → ใน `callModel`/`runNarrate`: เรียก `activateLore(sessChar.lore, [...raw ท้าย 6, userInput])`
  แล้วส่งผ่าน `sendChat({ ..., lore: activated.map(e => e.text) })`
- `chat-api.ts` → เพิ่ม field `lore?: string[]` ใน body
- `server.ts /api/chat` → รับ `b.lore` ส่งให้ assembler
- `chat-prompt.ts` → แทรกเป็น section `=== ข้อเท็จจริงที่เกี่ยวกับฉากนี้ ===` **ท้าย system prompt**
  (ST: "entries with larger order → closer to end → more impact")
- `ChatCharModal.tsx` → UI แก้ lore (list ของ keys + text, ปุ่มเพิ่ม/ลบ — ตามกฎ component granularity)

**ระวัง:** งบ lore ต้องอยู่ใน budget รวมของ lmstudio (ctx 8K) — แนะนำ lore ≤ 800 ตัวอักษร แล้วลด `rawBudget`
ใน ChatScreen ลงนิดถ้าจำเป็น

**Definition of done:** พิมพ์ถึง "ลูน่า" ในแชท → prompt มีข้อมูลร้านขนมปังของลูน่าแทรก; ไม่พิมพ์ถึง → ไม่มี

</details>

---

## ✅ Phase 3 — Structured memory แยกหมวด + state tracking (เสร็จ 2026-06-10)

**สิ่งที่ทำจริง:** `ChatStateCard` (location/disguise/whoKnowsTruth/outfit/inventory/goals) + `ChatMemFact` ใน chat-types.ts ·
`extractState()` ใน chat-api.ts (สกัด JSON จากช่วงที่ถูกพับ — กฎ "เริ่มจากบัตรเดิม อัปเดตเฉพาะที่เปลี่ยนจริง ห้ามเดา ห้ามอนุมานเพศจากชื่อ") ·
เรียกแบบ async หลังพับ summary สำเร็จใน `buildMemory` (ไม่หน่วงการตอบ; merge เฉพาะ field ที่มีค่า) ·
`stateSection()` ฉีดทุกเทิร์นใกล้ท้าย system prompt ทั้งสองโหมด (`=== สถานะปัจจุบัน ... ห้ามขัด/ห้ามย้อนกลับ ===`) ·
`memFacts` สะสมใน session รอ Phase 4 retrieval · UI: หน้า ⚙️ มี "📌 บัตรสถานะปัจจุบัน" แก้มือได้ 6 ช่อง · ทดสอบ e2e แล้ว state section เข้า prompt จริง
**ยังไม่ทำ:** rebuild-chat-summary.ts ยังไม่สร้าง stateCard ใหม่จากต้นฉบับ (สร้างเองในหน้า ⚙️ ได้) · งบ token ตาม paper ยังไม่ enforce แบบแยกส่วน

<details><summary>แผนเดิม (เก็บไว้อ้างอิง)</summary>

**ปัญหาที่แก้:** summary เป็น prose ก้อนเดียว → สูญ granularity, ค้นคืนรายข้อไม่ได้, และเป็นต้นเหตุ
บั๊กร่างปลอมเพี้ยน (ข้อเท็จจริง identity ควรเป็น field ไม่ใช่ถ้อยคำในเรียงความ)
(pattern จาก CharMemory extension + paper arXiv:2511.10652 ที่ออกแบบ token budget 2,000 สำหรับโมเดล ctx เล็ก)

**Data model** — เพิ่มใน `ChatSession`:

```ts
export interface ChatStateCard {            // "บัตรสถานะ" — ข้อเท็จจริงปัจจุบันแบบ field ตายตัว
  location?: string;                        // อยู่ที่ไหน
  disguise?: string;                        // ร่างปลอมตอนนี้: "ออเรล หญิงสาวมนุษย์ผมน้ำตาล" | "ร่างจริง"
  whoKnowsTruth?: string;                   // ใครรู้ตัวจริงบ้าง
  outfit?: string;                          // ชุดตอนนี้
  inventory?: string;                       // ของสำคัญ
  goals?: string;                           // กำลังทำ/ตามล่าอะไร
}
// เพิ่มใน ChatSession:  stateCard?: ChatStateCard;
//                       memFacts?: { kind: 'relationship'|'event'|'fact'|'emotion'; text: string; ts: number }[];
```

**Logic:**
1. ทุกครั้งที่พับ summary (ใน `buildMemory`) เรียก LLM อีก 1 ครั้งด้วย prompt สกัด **JSON** ของ
   stateCard + facts ใหม่จากช่วงที่พับ (temperature 0.2, สั่ง "อัปเดตจากค่าเดิม ห้ามเดา")
2. `stateCard` ถูกฉีดเข้า prompt **ทุกเทิร์น** เป็น section สั้น ๆ `=== สถานะปัจจุบัน (ข้อเท็จจริง ห้ามขัด) ===`
   ใกล้ท้าย system prompt — เพศ/ชื่อร่างปลอมจะไม่มีวันเพี้ยนอีกเพราะเป็น field ตรง ๆ ไม่ใช่ประโยคในเรียงความ
3. `memFacts` เก็บสะสมไว้ (ยังไม่ต้องฉีดทั้งหมด — Phase 4 จะดึงด้วย vector search)
4. หน้า ⚙️ ตั้งค่าแชท: เพิ่ม UI แก้ stateCard ได้ (เหมือนที่แก้ summary ได้ตอนนี้)

**งบ token แนะนำ (จาก paper, ปรับให้ Gemma 8K):** static card ~300 / stateCard+lore ~300 /
summary ~600 / raw history ~1,500 token (≈6,000 ตัวอักษร — ตรง rawBudget ปัจจุบัน) / ตอบ ~900

**Definition of done:** เล่นฉากเปลี่ยนชุด/ถอดร่างปลอม → stateCard อัปเดตเอง → ถาม "ตอนนี้ใส่อะไรอยู่"
หลังผ่านไป 50 เทิร์น ตอบถูก

</details>

---

## ⬜ Phase 4 — Vector RAG เหนือ chat log

**ปัญหาที่แก้:** อะไรที่ไม่เข้า summary = หายถาวร — RAG ดึง "ข้อความเก่าที่เกี่ยวกับเทิร์นปัจจุบัน" กลับมาแบบเป๊ะ ๆ
(แบบ Chat Vectorization ของ SillyTavern: top-3 ที่ similarity > 25%, query จาก 2 ข้อความล่าสุด)

**ของที่มีอยู่แล้วในเครื่อง:** LM Studio โหลด `text-embedding-nomic-embed-text-v1.5` อยู่แล้ว →
ยิง `POST http://localhost:1234/v1/embeddings` ได้ฟรี ไม่ต้องลงอะไรเพิ่ม

**Logic:**
1. `server.ts` เพิ่ม endpoint `/api/chat-embed` (proxy ไป LM Studio embeddings) หรือเรียกตรงจาก server
2. ตอนข้อความถูก "พับเข้า summary" (จุดเดียวกับ Phase 3) → embed ข้อความนั้นเก็บลง collection ใหม่
   `chat_vectors` ใน Mongo: `{ sessionId, ts, role, text, vector: number[] }` (nomic = 768 มิติ)
3. ก่อนส่งแชท: embed (ข้อความผู้เล่นล่าสุด + ข้อความตัวละครล่าสุด) → cosine similarity กับ vectors
   ของ session นั้น (Mongo ธรรมดา: ดึงทั้ง session แล้วคำนวณใน JS ก็พอ — session เดียวมีไม่กี่ร้อยแถว)
   → เอา top-3 ที่ similarity > 0.25 และ**ไม่อยู่ใน** raw history ปัจจุบัน
4. แทรกเป็น section `=== ความทรงจำที่เกี่ยวข้องกับตอนนี้ ===` ใน system prompt (ตำแหน่งเดียวกับ lore)

**ระวัง (จากการ verify):**
- ST docs disclaim เองว่า RAG "ไม่การันตีผลดีขึ้น" — ทำเป็น toggle เปิด/ปิดได้ต่อ session
- แทรก context ที่เปลี่ยนทุกเทิร์น = **prompt cache ของ DeepSeek แตก** → ต้นทุน cloud สูงขึ้น
  → แนะนำเปิด default เฉพาะ provider lmstudio (local ฟรี)

**Definition of done:** ถามถึงเหตุการณ์เฉพาะจาก 100+ เทิร์นก่อนที่ไม่อยู่ใน summary (เช่น "ก้อนหินที่เจ้าเคยวาง
บนมือข้าตอนสอนเวท") → ตัวละครจำรายละเอียดถูก

---

## ⬜ Phase 5 — Voice reinforcement (เล็ก ทำตอนไหนก็ได้)

ตอนนี้ reminder (Phase 1) ใส่ตัวอย่างเสียงแค่ 1 ประโยคแรก — ปรับปรุงได้:
- หมุนเวียนตัวอย่างเสียง (สุ่ม/วนจาก `voiceExamples` ทั้งหมด) ให้ไม่จำเจ
- ถ้าแชทยาวมาก (เช่น >100 เทิร์น) เพิ่มตัวอย่างเป็น 2 ประโยคใน reminder
- บทเรียนจาก ST: example dialogues ที่อยู่แต่หัว prompt จะ "จาง" — ของเราอยู่ใน system prompt ถาวร
  อยู่แล้ว (ดีกว่า ST default) แต่ความสดของสำนวนมาจากการ reinforce ใกล้ท้าย

---

## ฝั่ง "บทนิยาย" (parity กับแชท — เพิ่ม 2026-06-10)

ฝั่งนิยายมีเกราะเทียบเท่าแชทอยู่แล้วเชิงโครงสร้าง (continuityBrief จาก arc beats = state card ·
eventOrder จาก chapter.summary = rolling summary · CTX_CAP ต่อ provider) — สิ่งที่เพิ่มให้ "อัตโนมัติเท่ากัน":

- **Auto-fold ข้ามบท** (ChaptersScreen `runContinue`): ก่อนเจน ถ้าบทก่อนหน้ามีเนื้อแต่ยังไม่มี summary
  → ระบบสรุปเก็บให้เองทีละบท (กลไกเดียวกับ buildMemory ของแชท — หน่วยพับคือ "บท" แยกของใครของมัน ไม่ใช่ก้อนรวม)
- **ปุ่ม 📝 สรุป ใน AIBar ทำงานจริงแล้ว** (เดิมเป็น stub กดแล้ว toast หลอก) — สรุปบทปัจจุบันทับของเดิมได้
- **ช่องแก้ summary ใต้ editor** ทุกบท (เทียบเท่าหน้า ⚙️ ความจำของแชท) — ดู/แก้มือได้ตลอด
- prompt สรุปใช้กฎเดียวกับแชท: ห้ามเดา (โดยเฉพาะเพศ/รูปลักษณ์ร่างปลอม) + ปิดท้าย "สถานะปลายบท:"
- ที่ยังเป็นมือ: **arc beats** ต้องเพิ่มเองเมื่อสถานะตัวละครเปลี่ยนข้ามบท (timeline UI) — แลกกับความแม่นยำที่สูงกว่า

## แหล่งอ้างอิงหลัก (verified)

- arXiv:2402.10962 (COLM 2024) — Measuring and Controlling Instruction (In)Stability: drift ใน ~8 เทิร์น,
  System Prompt Repetition ได้ผลในแชทยาว
- arXiv:2412.00804 — persona ผ่าน prompt อย่างเดียวไม่การันตี identity consistency
- SillyTavern docs: authors-note / worldinfo / characterdesign / chat-vectorization / data-bank
- Character Card Spec V2 (`character_book`, `post_history_instructions`)
- CharMemory extension (bal-spec/sillytavern-character-memory) + arXiv:2511.10652 (token budget สำหรับ ctx เล็ก)

**ที่ตรวจแล้ว "อย่าเชื่อ":** greeting คือตัวคุมสไตล์ที่แรงที่สุด (refuted 1-2) ·
first-person memory กำจัด drift 100% (refuted 0-3) · โมเดลใหญ่ drift กว่าโมเดลเล็ก (refuted 1-2) ·
สถาปัตยกรรม Character.AI/Kindroid ที่เล่ากันตามบล็อก = ไม่มีหลักฐาน primary
