# Chat continue anti-loop — phased plan

> สถานะ: **Phase 1 shipped** (2026-07-26) · ที่มา: log VPS โรสกดดำเนินเรื่องต่อแล้วบทพูด/💭 วนสูตรเดิม ("หนูต้องทำได้…เพื่อฝัน") ทั้งที่สถานที่ขยับ

## อาการ

- กดดำเนินเรื่องต่อ → ย้ายฉากได้ แต่ **beat อารมณ์ + บทพูด + 💭 วนซ้ำ**
- คำสั่ง continue เดิมอ่อน ("เล่นบทต่อ…ไหลต่อไป") + กดความยาว 3–6 ย่อหน้า → โมเดลยืดด้วยพรรณนาความกลัวซ้ำ
- กฎห้ามตัดสินใจแทนผู้เล่น + อย่าจบด้วยคำถาม → ตอนผู้เล่นไม่อยู่ในฉาก ตัวละครติดโหมดรอ/ปลุกใจตัวเอง

## Phase 1 — Continue nudge + concise (ทำแล้ว)

แนว SillyTavern: **Continue Nudge / Author's Note ใกล้ท้าย** + บังคับ beat ใหม่

| จุด | เปลี่ยนอะไร |
|-----|------------|
| `novel/chat-prompt.ts` | กฎ `(ดำเนินเรื่องต่อ)` / `(ดำเนินฉากบรรยายต่อ)` = หนึ่ง beat ใหม่ · ห้ามทวน · ต้องลงมือ · export `isContinueInput` + `buildContinueTailNudge` |
| `novel/server.ts` | ถ้า continue → `useConcise=true` + แปะ tail nudge หลัง user_input (ไม่ลง history client) |
| `novel-next/.../chat-continue.ts` | user_input แข็ง + anti-echo จากบทพูดล่าสุด `"..."` |
| `ChatScreen.tsx` | ปุ่ม continue / regen ใช้ builder ข้างบน |

**ตรวจ:** กดดำเนินเรื่องต่อ 2 ครั้งติด — บทพูด/💭 ต้องต่างสูตร · ต้องมีการกระทำใหม่ (ไม่ใช่แค่ย้ายที่แล้วย้อนกลัวเดิม)

## Phase 2 — ปุ่ม "เหตุการณ์โลก / time-skip" (ยังไม่ทำ)

แยก agency สองแบบ (แบบ NovelAI dinkus + ST narrator):

- **ตัวละครเล่นต่อ** = ปุ่มเดิม (Phase 1)
- **เหตุการณ์เกิด** = โหมด narrator + nudge แบบ `[เวลาผ่าน X] / NPC เข้าฉาก / โทรเข้า` — ให้โลกเดินโดยไม่บังคับโรสเป็นคนขับทุกครั้ง

UI: ปุ่มรองข้าง continue หรือ long-press — อย่าทำให้มือถือรก

## Phase 3 — Sampler / history hygiene (ยังไม่ทำ)

- `frequency_penalty` / DRY ถ้า provider (Fireworks) รองรับ — กันวน *วลี* ไม่ใช่วน *อารมณ์*
- เมื่อ detect ลูปใน 2 เทิร์นล่าสุด (บทพูดคล้ายกัน) → เตือนใน UI ให้ regen/ลบ หรือ auto-strip ประโยคซ้ำจาก raw context ชั่วคราว

## นอกขอบ

- ไม่เปลี่ยน RAG / state card ในเฟสนี้
- ไม่บังคับ concise ทุกเทิร์นแชทปกติ — เฉพาะ continue
