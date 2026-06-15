# Hybrid RAG Long-Term Memory — Design Spec

วันที่: 2026-06-16
สถานะ: รอรีวิว (brainstorm เสร็จ)
ขอบเขตเฟสนี้: **แชท RP** (นิยาย = เฟส 2 ใช้ module เดิม)

---

## 1. ปัญหา & เป้าหมาย

ระบบแชท RP ปัจจุบันจัดการ context ด้วย **rolling summary** ([ChatScreen `buildMemory()`](../../../novel-next/src/components/screens/chat/ChatScreen.tsx)): เก็บ raw turn ล่าสุดไว้ ที่เก่ากว่าพับเข้า `summary` แบบ prose

จุดอ่อน: การพับเป็น **lossy** — รายละเอียดเฉพาะของเหตุการณ์เก่า (เช่นสิ่งที่ตัวละครพูดเทิร์น 12) หายไปจาก context ที่ส่งให้ LLM โมเดลเลย "จำรายละเอียดเก่า" ไม่ได้

**เป้าหมาย:** เพิ่มชั้น RAG ที่ "กู้" turn เก่าที่เกี่ยวข้องกับสถานการณ์ปัจจุบันกลับมา inject — โดย**ไม่แตะ**กลไก summary/live-state เดิม (เสริม ไม่ทับ)

### Non-goals (YAGNI)
- ❌ ความจำข้าม session (per-session เท่านั้น)
- ❌ vector DB แยก (pgvector/Pinecone) — เกินจำเป็นสำหรับ single-user
- ❌ rewrite summary/live-state logic เดิมไป server
- ❌ นิยาย (เลื่อนเป็นเฟส 2 — ออกแบบ store ให้รองรับไว้แล้ว)

---

## 2. การตัดสินใจที่ล็อกแล้ว

| หัวข้อ | เลือก | เหตุผล |
|---|---|---|
| ขอบเขต | per-session (`scopeId = sessionId`) | ง่าย, ฟีลชัด |
| วิธีค้น | **Hybrid**: FTS5 (หลัก) + semantic vector (เสริม) | FTS ฟรี+private R18; vector ช่วยตอนคำต่างแต่ความหมายใกล้ |
| Embedding | Cloud, **pluggable** + graceful degradation | ถูก, ไม่กิน RAM VPS; สลับเจ้าได้กัน ToS R18 |
| ที่เก็บ | `bun:sqlite` (FTS5) บน SSD | disk-based → RAM ไม่บวม; FTS5 trigram รองรับไทย |
| Embedding dim | ย่อ 512 | เล็ก/เร็ว/ถูก พอสำหรับ recall |

---

## 3. สถาปัตยกรรม

```
ChatScreen (client)
  │
  ├─(เปิด session) ─────► POST /api/chat/memory/backfill   ← index messages เดิมทั้งหมด (ครั้งเดียว/session)
  │
  ├─(ส่งข้อความใหม่) ──► POST /api/chat/memory/ingest      ← index turn ใหม่
  │
  └─(ก่อน sendChat) ───► POST /api/chat/memory/recall      ← คืน top-K memory ที่เกี่ยวข้อง
                                │
                                ▼
                       chat-memory.ts (server)
                         ├─ bun:sqlite (ไฟล์เดียวบน SSD)
                         │    ├─ mem      (id, scopeId, kind, charId, secret, speaker, turnIdx, ts, text, embedding BLOB?)
                         │    └─ mem_fts  (FTS5, tokenizer=trigram) ↔ mem.text
                         └─ embed.ts (pluggable provider, env-driven)

recall → assembleChatPrompt(... recalled[]) → section ใหม่ใน system prompt
```

### โมดูลใหม่
- `novel/chat-memory.ts` — เปิด/migrate sqlite, ingest, backfill, recall (FTS + cosine + rerank)
- `novel/embed.ts` — embedding client แบบ pluggable (env `EMBED_PROVIDER`, `EMBED_MODEL`, `EMBED_DIM`, key) — คืน `null` ถ้าไม่ตั้งค่า → ระบบ degrade ไป FTS อย่างเดียว

### แก้ไฟล์เดิม
- `novel/server.ts` — เพิ่ม 3 endpoint + เรียก recall ก่อนประกอบ prompt ใน `/api/chat` (หรือ client เรียก recall เองแล้วส่ง `recalled` มา — ดู §7)
- `novel/chat-prompt.ts` — `assembleChatPrompt` รับพารามใหม่ `recalled?: string[]` → render section
- `novel-next/.../ChatScreen.tsx` — เรียก backfill ตอนเปิด session, ingest ตอนส่ง, recall ก่อน sendChat
- `novel-next/src/lib/chat-api.ts` — ฟังก์ชัน client สำหรับ 3 endpoint

---

## 4. โครงข้อมูล (sqlite)

```sql
CREATE TABLE mem (
  id        TEXT PRIMARY KEY,        -- `${scopeId}:${turnIdx}`
  scopeId   TEXT NOT NULL,           -- sessionId (เฟส 2: storyId)
  kind      TEXT NOT NULL,           -- 'chat' | 'novel'
  charId    TEXT,                    -- ตัวละครที่ active ตอนนั้น (กรอง visibility)
  secret    INTEGER NOT NULL DEFAULT 0, -- 1 = ฉากลับที่ตัวละครหลักไม่รับรู้
  speaker   TEXT,                    -- 'user' | 'char' | ชื่อ NPC
  turnIdx   INTEGER NOT NULL,        -- ลำดับใน timeline (กันซ้ำ + ตัด turn ที่อยู่ใน raw context)
  ts        INTEGER NOT NULL,
  text      TEXT NOT NULL,
  embedding BLOB                     -- Float32 512 มิติ; NULL ถ้า degrade เป็น FTS-only
);
CREATE INDEX idx_mem_scope ON mem(scopeId, turnIdx);
-- หมายเหตุ (ตามที่ implement จริง): ใช้ FTS5 แบบ standalone (ไม่ใช่ contentless) เพื่อเลี่ยง trigger sync
CREATE VIRTUAL TABLE mem_fts USING fts5(id UNINDEXED, text, tokenize='trigram');
```

### Visibility (แก้ปัญหา "สลับตัวละคร")
recall กรองด้วย `scopeId` + เงื่อนไขการมองเห็น:
- **char mode**: `secret = 0` AND (`charId IS NULL` OR `charId = <activeChar>`) — ตัวละครไม่ "จำ" ฉากที่มีแค่ตัวละครอื่น/ฉากลับเห็น
- **narrator mode**: ไม่กรอง (ผู้เล่าเรื่องรอบรู้ — เห็นฉากลับด้วย) — สอดคล้องกับ `buildSecretMemory` เดิม

---

## 5. Recall (hybrid + rerank)

```
recall(scopeId, query, activeChar, mode, excludeTurnIdx[], k=4):
  ftsHits   = FTS5 MATCH(query) WHERE scope+visibility, ตัด excludeTurnIdx   → top-N
  vecHits   = (ถ้า embed พร้อม) cosine(embed(query), mem.embedding) ภายใน scope+visibility → top-N
              └ โหลดเฉพาะ embedding ของ scope นี้ (per-session) คิดแล้วปล่อย — RAM ~1MB
  merged    = dedup(ftsHits ∪ vecHits) by id
  ranked    = rerank: คะแนน = w_fts·ftsRank + w_vec·cosine (normalize)  [w เริ่ม 0.5/0.5]
  return top-K (จำกัด budget ~600 token รวม; ตัด text ยาวเกิน)
```

**Graceful degradation:** embed ล่ม/ปิด → ข้าม vecHits ใช้ FTS อย่างเดียว ไม่ throw (หลัก Defensive ข้อ 6)

**กันซ้ำ:** `excludeTurnIdx` = turn ที่ client มีใน raw context อยู่แล้ว (จะได้ไม่ inject ซ้ำกับที่ส่งเป็น history)

---

## 6. Inject เข้า prompt

`assembleChatPrompt(..., recalled?: string[])` เพิ่ม section วาง**ใกล้ lore** (ท้าย prompt = อิทธิพลสูง แต่ไม่ทับ "สถานะปัจจุบัน"):

```
=== ความทรงจำที่เกี่ยวข้องกับตอนนี้ (กู้จากเหตุการณ์เก่า — ถือว่าเกิดขึ้นจริง) ===
- [เทิร์น 12] *เรย์นสารภาพว่ากลัวความมืดตั้งแต่เด็ก*
- [เทิร์น 8] "ข้าไม่เคยไว้ใจใครง่ายๆ"
```

ลำดับความสำคัญใน prompt (สูง→ต่ำ): สถานะปัจจุบัน (live-state) > recalled memory > summary prose > scenario ตั้งต้น

---

## 7. จุดที่ต้องตัดสินตอนเขียนแผน (ไม่บล็อกดีไซน์)
1. recall ทำที่ **server ใน `/api/chat`** (สะอาด, ตรงหลัก "ย้าย context ไป server") หรือ **client เรียกแยกแล้วส่ง `recalled` มา** (กระทบโค้ดเดิมน้อย) → เอนเอียง: server ทำใน `/api/chat` โดยรับ `query`+`activeChar`+`excludeTurnIdx`
2. backfill embedding: ทำ sync ตอนเปิด session (ช้าครั้งแรก) หรือ async ทยอย → เอนเอียง: FTS sync ทันที (ฟรี/เร็ว) + embedding async background

---

## 8. RAM / cost บน VPS 150฿ (3GB RAM / 30GB SSD)

| ตัว | คุม |
|---|---|
| sqlite | disk-based; `PRAGMA cache_size` เล็ก (~8MB); โหลด embedding เฉพาะ per-session |
| embedding | dim 512 → ~2KB/ก้อน; 1 session 500 ก้อน ≈ 1MB disk, ~1MB RAM ชั่วคราว |
| **MongoDB** | จำกัด wiredTiger cache (`--wiredTigerCacheSizeGB 0.5`) — ตัวกิน RAM หลัก ต้อง cap |
| embedding cost | one-time backfill + ต่อ turn; text-embedding-3-small ~$0.02/ล้าน token |

→ สเปค 150฿ เพียงพอเมื่อเก็บลง SSD + cap Mongo cache

---

## 9. Testing
- unit: `chat-memory.ts` — ingest/backfill idempotent (id ซ้ำไม่เพิ่ม), FTS trigram จับคำไทย, visibility filter ถูก, recall ตัด excludeTurnIdx, degrade เมื่อ embed=null
- integration: เปิด session เก่า → backfill → recall ได้ turn เก่าที่ keyword/semantic ตรง
- เทียบกับ harness เดิม (`stress-test-rayne.ts`) — recall ช่วย continuity ที่ summary พับทิ้ง

---

## 10. แผนเฟส
- **เฟส 1 (สเปคนี้):** chat RAG — `kind='chat'`, scope=sessionId
- **เฟส 2:** novel RAG — `kind='novel'`, scope=storyId, ingest=บท/ฉาก, inject ใน `prompts.ts` — reuse `chat-memory.ts`+`embed.ts` ทั้งหมด

## 11. ข้อจำกัดที่รู้ตัว (Phase 1 — จาก final review, รับได้/เลื่อนเป็น Phase 2)
- **โหมดผู้เล่าเรื่อง (narrator) ยังไม่ recall** — `runNarrate` ไม่เรียก `memRecall` (พึ่ง rolling summary + `buildSecretMemory` เดิม) — เป็น scope ตั้งใจของ Phase 1
- **narrator turn สด ยังไม่ ingest ทันที** — `runNarrate` ไม่เรียก `memIngest`; turn พวกนี้จะถูก index แบบ lazy ตอนเปิด session ใหม่แล้ว re-backfill เท่านั้น
- **ไม่มี re-embed ของแถวเดิม** — ถ้าเปิด `EMBED_*` ทีหลังจากที่มีแถว FTS-only อยู่แล้ว แถวเก่าจะไม่มีเวกเตอร์ถาวร (`backfilledRef` รันครั้งเดียว/เปิด session; embedding UPDATE คุมเฉพาะ batch ปัจจุบัน) → Phase 2 ควรมีปุ่ม "re-embed session"
- **store drift ตอน edit/delete** — `INSERT OR IGNORE` + ไม่มี DELETE → ข้อความที่ถูกแก้/ลบทิ้ง mem row เก่าค้าง; re-backfill เก็บ text เก่าเพราะ id (อิง turnIdx) ชนกัน → ความจำที่ recall อาจล้าหลัง transcript (soft-quality ไม่พังแชท). Phase 2: DELETE by scopeId ตอน edit/delete หรือใช้ INSERT OR REPLACE + rebuild FTS
- **dimension mismatch degrade เงียบ** — เวกเตอร์ต่างมิติ (cosine over min-length) ลดคุณภาพ recall แต่ไม่ corrupt/crash
