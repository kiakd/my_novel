# แผน "เก็บอะไร + เอาอะไรมา verify" ให้แอปดีขึ้น (Eval & Telemetry)

> สถานะลงมือ (2026-06-17): ✅ **1.2 recall telemetry** (`logActivity('mem.recall')`), ✅ **2.1 eval harness** (`novel/eval/recall-eval.ts` + `needles-demo.json`), ✅ baseline run แรก (`docs/eval-runs/2026-06-17-baseline-demo.md`). ยังเหลือ: 1.3 implicit feedback (regen counter), golden set จากแชท**จริง** (รอข้อมูลผู้ใช้)
> วันที่: 2026-06-17 · เป้า: เปลี่ยนการตัดสินใจปรับแอปจาก "เดา/รู้สึก" → "วัดได้" โดยเฉพาะคุณภาพ RAG recall (RRF vs weighted, importance ฯลฯ)
> หลักคิด: เก็บ **สัญญาณที่ถูกอยู่แล้ว** (มี logger + memory store) + เพิ่ม **golden set เล็ก ๆ** ที่ทำเองได้ฟรี → วัดก่อน/หลังทุกครั้งที่ปรับ

---

## ส่วนที่ 1 — ต้องเก็บอะไร (Telemetry)

### 1.1 มีอยู่แล้ว (ใช้ได้เลย ไม่ต้องทำเพิ่ม)
- **`app_logs` (Mongo) + JSONL รายวัน** ผ่าน `novel/logger.ts` — เก็บ request/response/provider/usage/latency ของทุก endpoint AI (ดูได้หน้า `ailog`)
- **`/api/chat/memory/status`** — mode (hybrid/fts-only), embeddingConfigured, embedError, rows/embeddedRows/scopes

### 1.2 ควรเพิ่ม (ฟรี, เบา) — log "recall ทำงานยังไง" ในแต่ละเทิร์น
ตอนนี้ recall คืน memories เฉย ๆ ไม่ได้บันทึกว่า **ดึงอะไรมา / ผู้ใช้ได้ใช้ไหม**. เพิ่ม log 1 บรรทัด/recall:
| เก็บ | ใช้ทำอะไร |
|---|---|
| `query`, `fusion` (rrf/weighted), `scopeId` | รู้ว่าใช้สูตรไหน + reproduce ได้ |
| `returnedIds[]` + score แต่ละก้อน | ดูว่าดึงก้อนไหน อันดับเท่าไร |
| `embedded` (hybrid/fts-only ตอนนั้น) | แยกผลตอน embedding ล่ม |
| `latencyMs` ของ recall (embedOne + query) | กันช้าบนมือถือ |

> ทำที่ `/api/chat/memory/recall` (เพิ่ม `logActivity('mem.recall', ...)` แบบเบา ๆ — ไม่เก็บ text เต็ม กัน log บวม/ความเป็นส่วนตัว R18)

### 1.3 ควรเพิ่ม — สัญญาณ "ดี/ไม่ดี" โดยปริยาย (implicit feedback)
ไม่ต้องให้ผู้ใช้กดอะไร — อนุมานจากพฤติกรรมที่มีอยู่:
| สัญญาณ | ตีความ |
|---|---|
| **regenerate** คำตอบเดิม | คำตอบนั้นไม่ดี (อาจเพราะ recall พลาด/ลืมบริบท) |
| **แก้/ลบ** ข้อความที่เพิ่งเจน | ผลไม่ผ่าน |
| ผู้ใช้พิมพ์ย้ำข้อมูลที่ตัวละคร "ควรจำได้" | recall miss (needle หลุด) |

> เก็บ counter ง่าย ๆ (regen ต่อ session, ต่อ fusion mode) — ใช้เทียบ A/B

---

## ส่วนที่ 2 — เอาอะไรมา verify (Eval)

### 2.1 Golden needle set (สำคัญสุด, ทำเองฟรี) — แรงบันดาลใจจาก LongMemEval (ICLR 2025)
สร้างชุดทดสอบเล็ก ๆ จาก **แชทจริงของคุณเอง** (มีเป็นร้อยข้อความอยู่แล้ว):
1. เลือกแชทยาว 1-2 เรื่อง (เช่น เพม × ออเรเลีย ที่เคยเทส)
2. เขียน "เข็ม" 10-20 ข้อ = (คำถาม/สถานการณ์ปัจจุบัน → เหตุการณ์เก่าที่ "ควร" ถูก recall) เช่น
   ```
   { query: "ออเรเลียกลัวอะไร", expectTurn: 47, note: "เคยสารภาพกลัวที่แคบตอนเด็ก" }
   { query: "พบางกิน อะไรได้บ้าง", typo: true, expectTurn: 12, note: "พิมพ์ผิด — เทส typo tolerance" }
   ```
3. รัน recall กับชุดนี้ → วัด **hit@k** (เข็มอยู่ใน top-k ไหม) + **MRR** (อันดับเฉลี่ย)

> เก็บเป็นไฟล์ `novel/eval/needles-<story>.json` + สคริปต์ `bun run novel/eval/recall-eval.ts` (โหลด session จาก Mongo/SQLite → backfill → recall ทุกเข็ม → พิมพ์ hit@4 / MRR แยกตาม fusion)

### 2.2 ตัวเลขที่ดูทุกครั้งที่ปรับ
| เมตริก | เป้า | ใช้ตัดสิน |
|---|---|---|
| **hit@4** (เข็มติด top-4) | ↑ สูงสุด | RRF vs weighted ตัวไหนดีกว่า |
| **MRR** | ↑ | คุณภาพอันดับ |
| **typo-hit@4** (เฉพาะเข็มพิมพ์ผิด) | ↑ | วัดจุดแข็ง semantic — สิ่งที่คุณเจอบ่อย |
| **recall latency p95** | < ~300ms | กัน UX มือถือสะดุด |
| **regen rate** ต่อ fusion | ↓ | สัญญาณ implicit ว่าคำตอบดีขึ้น |
| **embeddedRows/rows** | ~1.0 | embedding ครอบคลุม (จาก /memory/status) |

### 2.3 วิธี A/B จริง (ทำได้เลยหลัง Part A)
- `MEM_FUSION=weighted` รัน eval → จด hit@4/MRR
- `MEM_FUSION=rrf` รัน eval ชุดเดิม → เทียบ
- ตัวไหนชนะ → ตั้งเป็น default ใน prod (env)
- เก็บผลไว้ใน `docs/eval-runs/` (วันที่ + commit + ตัวเลข) เพื่อดูเทรนด์ระยะยาว

---

## ส่วนที่ 3 — ลำดับทำ (เมื่อพร้อม)
1. **สร้าง golden needle set** จากแชทจริง 1 เรื่อง (~15 เข็ม) + สคริปต์ eval — ครั้งเดียว ใช้ซ้ำได้ตลอด
2. รัน A/B RRF vs weighted → เลือก default
3. เพิ่ม recall telemetry (1.2) — ดูของจริงบน prod
4. ใช้ eval เดิมตัดสิน Part B (importance) ว่าช่วยจริงไหมก่อนลงแรง

> หัวใจ: **อย่าปรับ RAG แบบเดาอีก** — ทุกการเปลี่ยน (RRF, recency weight, importance, k, chunk size) วัดด้วย needle set เดิม เห็น hit@4 ขึ้น/ลง ชัด ๆ
