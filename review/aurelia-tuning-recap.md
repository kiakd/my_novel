# ทวนการจูนทั้งหมด (session 11 มิ.ย. 2026)

> สรุปทุกอย่างที่ปรับ + ผลทดสอบ ให้เช็คได้ว่าตรงตามที่ขอไหม · ไฟล์โค้ดอ้างอิงใน `novel/`

---

## A) โมเดล / ความเร็ว (LM Studio)

| ทำอะไร | ผล | ที่ |
|---|---|---|
| จูน Gemma 12B: `--parallel 1 -c 4096 --gpu 0.75` | 8.2 → 11.5 tok/s | memory |
| ลอง Q3_K_M | ไม่คุ้ม (12 tok/s, GPU power-cap 67W) ลบทิ้ง | — |
| **ย้ายเป็น E4B** (`gemma-4-e4b-it-uncensored`) | **44 tok/s (เร็ว 4 เท่า), VRAM เหลือ 2.6GB** | `server.ts:131` default |
| power-limit ปลด | ทำไม่ได้ (laptop GPU ล็อก) — 44 tok/s คือเพดาน | — |

> ⚠️ พบใหม่วันนี้: E4B ต้องโหลด **ctx 8192** (ไม่ใช่ 4096) ถึงจะแชทออเรเลียได้ — ดู [aurelia-review-gemma-e4b.md]

---

## B) กฎ content — รวมศูนย์เป็น "กฎกลาง"

**`novel/shared-rules.ts`** (ใหม่) — กฎกลางที่ทุกโหมดใช้ร่วม แก้ที่เดียวมีผลทั้ง novel + chat:

| ค่ากลาง | คุมอะไร | สถานะล่าสุด |
|---|---|---|
| `RULE_ADULT` | **นโยบายอายุ** | ตัวละครเด็ก<18 **มีได้ในเนื้อเรื่อง/ครอบครัว** (แม่เลี้ยงเดี่ยวมีลูกสาว ฯลฯ) แต่ **zero-tolerance ห้ามเด็กในฉากเพศทุกรูปแบบ**; ฉาก R18 ทุกคนต้อง 18+ พาเด็กออกก่อนเสมอ |
| `RULE_NO_META` | ห้าม AI/disclaimer/คำชม/วิเคราะห์/สรุป/เสนอเล่นต่อ | ใช้ทั้ง novel (กฎ 9) + chat (กฎ 8) |
| `RULE_R18_LEXICON` | คำดิบ default: ควย/หัวควย/หี/หัวนม/นม/ตูด/ก้น/น้ำรัก (อังกฤษ ass/nipple/pussy) เว้นแต่ palette/styleGuide/speechTone สั่งวรรณกรรม | ใช้ทั้ง novel (MODE_R18) + chat (กฎ 7) |

ใช้ที่: `prompts.ts` (นิยาย) + `chat-prompt.ts` (แชท) — import ไปประกอบ

---

## C) แชท — พฤติกรรม (chat-prompt.ts)

| # | เปลี่ยนอะไร | เดิม → ใหม่ | ผลทดสอบ |
|---|---|---|---|
| C1 | **เอา hard-gate 18+ ตามความสัมพันธ์ออก** (กฎ 6) | ต้อง rel 75+ ถึงมีฉากผู้ใหญ่ → **ฉากเกิดได้ทุกระดับ ความสัมพันธ์สะท้อนที่การแสดงออก (กายจำยอมแต่ใจไม่ยอม + rel ลด)** | ✅ **S4 (rel20+ตราทาส): DeepSeek คุกเข่าตามตรา แต่ร้องไห้ขุ่นเคือง** — แก้ปัญหา "ตราทาส บังคับให้ทำไม่ได้" ที่เจอในประวัติ |
| C2 | กฎ 2: "ปฏิเสธ" → "ปฏิกิริยาทางใจ/คำพูด" | ฉากใกล้ชิดไม่หยุดฉาก ความไม่เต็มใจอยู่ที่ใจ/คำพูด | (สอดคล้อง C1) |
| C3 | **เลิกถามจบเทิร์นทุกครั้ง** (กฎ 5, บรรทัดเดิม "ทิ้งจังหวะให้ผู้เล่นโต้ตอบ") | ห้ามจบด้วยคำถามเป็นนิสัย; ฉากบรรยาย/อารมณ์ไม่ต้องมีคำถาม | ✅ **S1–S4 ไม่มีอันไหนจบด้วยคำถาม** |
| C4 | กฎ 7/8 ใช้ lexicon + no-meta กลาง | (ดู B) | ⚠️ คำดิบยังไม่ค่อยออก (slow-burn ใช้คำนุ่มต้นฉาก) — ต้องทดสอบ max_tokens สูง/prefill |

---

## D) แชท — เลือก provider ได้

- `novel-next` หน้า ⚙️ ตั้งค่าแชท → การ์ด "🤖 โมเดล AI ของแชท" → สลับ **DeepSeek (cloud) / Gemma E4B (local)**
- เก็บค่าใน localStorage (`useChatProvider`) · ส่ง provider ต่อทั้งสาย (ตอบ/ย่อ/judge)

---

## E) นิยาย / โครงสร้าง

| ทำอะไร | ที่ |
|---|---|
| แก้บั๊ก prefill ไม่ถูก prepend (ประโยคเปิดหาย) | `server.ts` callAI |
| AI log viewer: แสดง prompt เต็ม + ปุ่ม copy | `novel-next/.../AiLogTable.tsx` |
| cleanup `novel/` → API-only (ลบ 17 ไฟล์) | — |
| **ฉีดเรื่อง star-academy เข้า DB** (7 ตอน + ep008-09 รอ) | `insert-star-academy.ts` |

---

## F) ออเรเลีย — แก้ continuity เฉพาะหน้า

- **re-anchor กฎปลอมตัว** ใน stateCard.disguise (เข้าเมือง→ต้องปลอมเป็นหญิงผมน้ำตาล ซ่อนหู+ตรา) + อัปเดต goals
- ✅ ทดสอบ S2: ทั้ง DeepSeek + E4B ให้นางปลอมตัวเองก่อนเข้าเมืองแล้ว

---

## ✅ ทำเพิ่มรอบ 2 (11 มิ.ย. — หลังรีวิว)
1. **ลด token bloat** ✅ — budget แยก provider (`ChatScreen.tsx`: local 8/16/6,000 · cloud 14/24/12,000 จากเดิม 16/30/20,000) + **เพดาน summary ~1,200 ตัว** + กฎห้าม summary มโน (`chat-api.ts` SUMMARY_SYSTEM)
2. **field เวลา** ✅ — เพิ่ม `time` ใน `ChatStateCard` (12 เดือน/24 ชม.) + extractor เลื่อนเวลาตามบท + ช่องแก้ในหน้าตั้งค่า (`chat-types.ts`/`chat-api.ts` STATE_SYSTEM/`ChatScreen.tsx` STATE_FIELDS) → แก้ location ค้าง "ใต้แสงจันทร์"
3. **ดัน lexicon** ✅ — `shared-rules.ts` แรงขึ้น (ถึงฉากสัมผัส/ออรัล/สอดใส่ ใช้คำตรงทันที) + เตือนซ้ำท้าย persona reminder → ทดสอบ DeepSeek ใช้คำดิบแล้ว (ควย/หัวควย/หี); E4B ยัง slow-burn ต้อง tokens เยอะ/prefill

## ✅ ทำเพิ่มรอบ 3 (11 มิ.ย. — anti-drift + E4B)
1. **anti-drift state machine** ✅
   - **(A) กฎปลอมตัว state machine** (`chat-prompt.ts`): ก่อน action เข้าเมือง/ชุมชน/ที่สาธารณะ → เช็ค field "ตัวตน/ร่างตอนนี้" ถ้าร่างจริงต้องปลอมก่อนในบทเดียวกัน
   - **(B) decouple stateCard จาก fold** (`ChatScreen.tsx` + `chat-types.ts` `stateCardAt`): refresh stateCard จาก "ช่วงล่าสุด" ทุก ~6 เทิร์น (เดิมสกัดจากส่วนที่เพิ่งพับ=ของเก่า → ค้าง) → time/location/ปลอมตัว สดเสมอ
   - **(C) canonical entity** (`chat-api.ts` STATE_SYSTEM): ชื่อเฉพาะ (NPC/สัตว์เลี้ยง/สถานที่/ของ) + ที่มา ห้ามเปลี่ยน/แต่งใหม่ — กัน retcon (ม้า "ไอวี่")
2. **E4B ctx 8192 default** ✅ — สคริปต์ `novel/load-local-model.cmd` (โหลด E4B @8192 ก่อนใช้แชท local; แอปคุม JIT ctx ไม่ได้ ต้อง pre-load) · โหลดไว้แล้ว

## ⬜ ยังไม่ได้ทำ (รอจูนต่อ)
- **ปฏิทิน/ชื่อเวลาแบบโลกแฟนตาซี** (ตั้งเดือน/ยาม/ฤดูเอง) — ตอนนี้ใช้ 12 เดือน/24 ชม. มาตรฐานไปก่อน (TODO note ใน `chat-types.ts`)
- **นิยาม "ขอบเขตอำนาจตราทาส" ในการ์ดตัวละคร** ให้ชัด (consent model ช่วยแล้ว แต่ควรเขียนกฎตรา=override จริง)
- **E4B lexicon** — ดันให้ถึงฉากจริงเร็วขึ้น (prefill/tokens)

> ไฟล์รีวิวเต็ม: [aurelia-review-deepseek.md] · [aurelia-review-gemma-e4b.md] · ผลทดลองดิบ: [_aurelia-exp-results.md]
