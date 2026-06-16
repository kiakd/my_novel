# Phase 3 — RRF rerank + Importance-aware recall (แผนไว้ทำภายหลัง)

> สถานะ: **planned (ยังไม่ทำ)** · ที่มา: survey prior-art ([docs/2026-06-16-rag-prior-art-survey.md](../../2026-06-16-rag-prior-art-survey.md)) — ยืมจาก VectFox/CharMemory + RRF (Alex Garcia/Simon Willison)
> REQUIRED SUB-SKILL ตอนลงมือ: superpowers:subagent-driven-development

**Goal:** ยกคุณภาพ recall 2 ชั้น — (A) เปลี่ยน rerank เป็น RRF ที่ robust กว่า, (B) ติด "importance/persistence" ให้ความจำ แล้วบูสต์ตอน recall โดย piggyback บน `extractState` ที่มีอยู่ (ไม่เพิ่ม LLM call)

---

## Part A — RRF rerank option ใน `recall()` (เล็ก, คุ้ม, ทำก่อนได้)

**ปัญหาปัจจุบัน:** `recall()` ใน `novel/chat-memory.ts` ใช้ weighted-normalize (bm25 magnitude → [0,1] + cosine). เปราะเมื่อ `ftsHits` มีตัวเดียว (worst===best → norm=1 หมด) และ scale ของ 2 สัญญาณไม่เทียบกันตรง ๆ

**แนวแก้ (RRF):** ให้คะแนนจาก **อันดับ** ไม่ใช่ค่าดิบ — `score = wFts/(k+rankFts) + wVec/(k+rankVec)` (k≈60). ทนทานกว่า ไม่ต้อง normalize

### Task A1: เพิ่มโหมด RRF ใน recall (TDD)
**Files:** `novel/chat-memory.ts`, `novel/chat-memory.test.ts`

- [ ] **Step 1: เทส** — กรณีที่ RRF ให้ผลต่าง/ดีกว่า normalize: ก้อนที่ติดทั้ง FTS+vector (อันดับสูงทั้งคู่) ต้องมาก่อนก้อนที่ติดทางเดียวแม้คะแนนดิบสูง

```ts
test('recall (rrf): ก้อนที่ติดทั้ง FTS+vector ชนะก้อนที่เด่นทางเดียว', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'เรย์นกลัวความมืดมาตั้งแต่เด็ก', embedding: new Float32Array([1, 0, 0]) },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'ความมืดปกคลุมเมือง', embedding: new Float32Array([0, 1, 0]) },
  ]);
  const hits = recall(db, { scopeId: 's1', query: 'ความมืด', queryVec: new Float32Array([1, 0, 0]), activeChar: 'a', narratorMode: false, excludeFromIdx: 999, k: 2, wFts: 0.5, wVec: 0.5, fusion: 'rrf' });
  expect(hits[0].turnIdx).toBe(0); // ติดทั้งสองสัญญาณ → อันดับนำ
});
```

- [ ] **Step 2: เพิ่มพาราม`fusion?: 'weighted' | 'rrf'`** ใน `RecallQuery` (default `'weighted'` เพื่อไม่กระทบของเดิม) + branch ใน `recall()`:

```ts
const RRF_K = 60;
if (q.fusion === 'rrf') {
  ftsHits.forEach((h, rank) => {
    const ex = score.get(h.id); const s = q.wFts / (RRF_K + rank);
    if (ex) ex.s += s; else score.set(h.id, { hit: h, s });
  });
  vecHits.forEach((h, rank) => {
    const ex = score.get(h.id); const s = q.wVec / (RRF_K + rank);
    if (ex) { ex.s += s; ex.hit = { ...ex.hit, cos: h.cos }; } else score.set(h.id, { hit: h, s });
  });
} else { /* ...โค้ด weighted เดิม... */ }
// recency boost ใช้ร่วมได้ทั้งสองโหมด (ตามเดิม)
```

- [ ] **Step 3-4:** รันให้ผ่าน + ทุกเทสเดิมยังเขียว
- [ ] **Step 5:** server `/api/chat/memory/recall` ส่ง `fusion: 'rrf'` (หรือทำเป็น env/flag เพื่อ A/B) — commit

> วิธี A/B: เปิด `fusion:'rrf'` ฝั่ง server แล้วลองแชทจริง เทียบกับ `'weighted'` ดูว่าความจำที่ recall ตรงขึ้นไหม (subjective + LongMemEval-style ถ้าทำเทสชุด)

---

## Part B — Importance/persistence-aware recall (piggyback `extractState`)

**ไอเดีย (จาก VectFox):** raw turn มี filler เยอะ — ความจำที่ "สำคัญจริง" ควรถูกบูสต์ `extractState` (ฝั่ง client, ทุก fold) สกัด facts อยู่แล้ว → ให้มันติด **importance (1-5)** + **persistent flag** แล้วเก็บ fact สำคัญเป็น memory row พิเศษ + บูสต์ตอน recall

### Task B1: เพิ่มคอลัมน์ importance ใน schema (migration)
**Files:** `novel/chat-memory.ts`

- [ ] เพิ่ม `importance INTEGER DEFAULT 0` + `persistent INTEGER DEFAULT 0` ใน `CREATE TABLE mem` และ **migration สำหรับ DB เดิม** (sqlite: `PRAGMA table_info(mem)` เช็คก่อน `ALTER TABLE mem ADD COLUMN`)
- [ ] `MemRow` เพิ่ม `importance?: number; persistent?: boolean` · `ingestMemory`/`syncScope` เขียนค่า (default 0)
- [ ] เทส: ingest ค่า importance แล้วอ่านกลับได้; DB เก่า (ไม่มีคอลัมน์) migrate ไม่ crash

### Task B2: recall บูสต์ตาม importance/persistent
**Files:** `novel/chat-memory.ts`, test

- [ ] เพิ่มเทอมในสกอร์: `+ wImp * (importance/5) + wPersist * persistent` (default weight เล็ก ~0.15/0.1) — เทสว่า fact importance สูงขึ้นนำเมื่อ relevance ใกล้กัน

### Task B3: ให้ `extractState` คืน importance ของ facts
**Files:** `novel/server.ts` (หรือ prompt ของ extractState ใน chat-api flow), `novel-next/.../ChatScreen.tsx`

- [ ] แก้ system prompt ของ extractState ให้แต่ละ fact ติด `importance` 1-5 + `persistent` (true=fact ถาวร เช่น ปม/ความลับ/คำสัญญา)
- [ ] ใน `buildMemory`/ingest path ของ ChatScreen: ingest fact สำคัญ (importance≥4) เป็น memory row เพิ่ม (speaker เช่น `'fact'`) เพื่อให้ recall ดึงได้ตรง — หรือ map importance ลง row ของ turn ที่ fact นั้นอ้างถึง
- [ ] กันซ้ำกับ state-card เดิม (fact ที่เป็น live-state แล้วไม่ต้อง ingest ซ้ำ)

### Task B4: (ออปชัน) Injection Viewer
**Files:** ChatScreen debug UI + ใช้ `/api/chat/memory/status` ที่มีแล้ว

- [ ] โชว์ว่า recalled ก้อนไหนถูกฉีดเข้า prompt เทิร์นล่าสุด (debug/trust) — ตาม CharMemory

---

## ลำดับแนะนำ
1. **Part A (RRF)** ก่อน — เล็ก เห็นผลเร็ว ไม่แตะ schema
2. **Part B** ตามเมื่ออยากดันคุณภาพอีกชั้น — แตะ schema + extraction prompt (ระวัง regression ของ state-card)

## เสี่ยง/ระวัง
- B แตะ schema → ต้องมี migration กัน DB prod เก่าพัง (เช็ค `table_info` ก่อน ALTER)
- อย่าให้ importance fact ซ้ำซ้อนกับ live-state (เปลือง token + ขัดกันเอง) — dedup
- RRF default ปิดไว้ (`'weighted'`) จน A/B ยืนยันว่าดีกว่า ค่อยสลับ default
