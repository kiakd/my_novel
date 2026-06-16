# สำรวจ Prior Art บน GitHub — คนอื่นทำ RAG memory แบบเราไหม + อะไรใช้ได้บ้าง

> วันที่: 2026-06-16 · เทียบกับสแตกเรา: `bun:sqlite` FTS5 trigram + per-scope brute-force cosine + weighted-normalize rerank + recency, ingest ราย turn, live state-card + rolling summary

## สรุปสั้น
**เราไม่ได้ล้าหลัง** — สถาปัตยกรรมเราตรงกับ pattern ที่ ecosystem SillyTavern (ผู้ใช้ roleplay/R18 จำนวนมาก) ตกผลึกแล้ว: hybrid FTS+vector, recency-pinned, structured state. มี **2 อัปเกรดที่คุ้ม**: (1) RRF rerank (เล็ก, ทำได้เลย), (2) event-extraction + importance score (ใหญ่กว่า, Phase 3). ของพวก vector DB แยก/บริการ hosted = **ข้าม** (เกินจำเป็น + ขัด R18/RAM ตามสเปกเราตั้งแต่แรก)

---

## ตารางประเมิน (ใช้กับเราได้แค่ไหน)

| โปรเจค/ไอเดีย | คืออะไร | กับเรา |
|---|---|---|
| **RRF — Reciprocal Rank Fusion** ([Alex Garcia](https://alexgarcia.xyz/blog/2024/sqlite-vec-hybrid-search/), [Simon Willison](https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/)) | สูตร rerank รวมอันดับ FTS+vector: `1/(k+rank_fts)·w + 1/(k+rank_vec)·w` (k≈60) | ✅ **ยืมมาเลย** — robust กว่า weighted-normalize ปัจจุบัน (ของเราเปราะเมื่อ ftsHits มีตัวเดียว → norm=1). ทำเป็น option ใน `recall()` แล้ว A/B ได้ ต้นทุนต่ำ |
| **VectFox** ([KritBlade](https://github.com/KritBlade/VectFox)) | สกัด "เหตุการณ์" แบบ structured (importance 1-10, entities, persistence, recency decay) แทนการเก็บทั้ง reply · rerank = `w_cos·RRF + w_imp·importance + w_persist·flag + w_recency·decay` | ✅ **ยืมไอเดีย (Phase 3)** — เราเก็บ raw turn (มี filler เยอะ). เพิ่ม importance + persistence ใน ranking ได้ · piggyback บน `extractState`/summary ที่เรามีอยู่แล้ว |
| **CharMemory** ([bal-spec](https://github.com/bal-spec/sillytavern-character-memory)) | ทุก 20 ข้อความ ให้ LLM สกัดความจำสำคัญ → เก็บเป็น markdown แก้มือได้ → vector retrieve | ✅ **ยืนยันแนว** — เราเก็บ text ดิบ (แก้มือ/heal ได้ผ่าน syncScope) ตรงปรัชญา "plain-text editable". ไอเดีย "Injection Viewer" (โชว์ว่า memory ไหนถูกฉีด) น่าทำเป็น debug UI |
| **sqlite-vec** ([Alex Garcia](https://github.com/asg017/sqlite-vec)) | extension `vec0` ทำ KNN ระดับ DB (ไม่ต้อง brute-force ใน app) | ⚠️ **ยังไม่คุ้มตอนนี้** — เป็น native extension (ต้อง build .dll/.so สำหรับ Windows dev + Linux Docker). scope เราต่อ session เล็ก (~1MB) brute-force พอ. เก็บไว้พิจารณาถ้า **corpus นิยายโตมาก** |
| **sqlite-rag** ([sqliteai](https://github.com/sqliteai/sqlite-rag)) | hybrid RRF + chunking สำเร็จรูปบน sqlite | 📖 **อ้างอิงเฉย ๆ** — แนวเดียวกับ Alex Garcia, ดูเป็นตัวอย่าง implementation |
| **SimpleMem** ([aiming-lab](https://github.com/aiming-lab/SimpleMem)) | memory stack "semantically lossless high-density" ลด token | 📖 งานวิจัย หนัก — ข้ามตอนนี้ |
| **LongMemEval** ([xiaowu0162](https://github.com/xiaowu0162/LongMemEval), ICLR 2025) | benchmark วัดความจำระยะยาวของแชท | 🧪 **ใช้ประเมินได้** — เอาแนวเทสมาวัด recall ของเราเชิงปริมาณ (nice-to-have) |
| Qdrant / ChromaDB / LoreVault (hosted) | vector DB แยก / memory-as-a-service | ❌ **ข้าม** — สเปกเรา §non-goals ตัดทิ้งแล้ว (กิน RAM 3GB VPS, R18 ToS, privacy) |

---

## สิ่งที่ "ยืนยันว่าเราทำถูกแล้ว"
- **Hybrid FTS + vector** = มาตรฐานของวงการ (ทุกตัวทำ)
- **แยก "recent ที่ pin เสมอ" ออกจาก "relevance recall"** — VectFox ทำ (pin N ล่าสุด), เราทำผ่าน rolling-summary raw-keep + recency weight ✓
- **เก็บ text ดิบแก้มือได้** (CharMemory เน้น) — เราทำ + ตอนนี้ heal ได้ด้วย syncScope ✓
- **per-session/per-story scope** — ตรงกับที่ ST แนะนำ ✓

## แผนนำไปใช้ (เรียงตามคุ้ม)
1. **RRF rerank option ใน `recall()`** (เล็ก, ทำได้เลย) — เพิ่มทางเลือก fuse แบบ `1/(k+rank)` คู่กับ recency เดิม เทียบผลกับ weighted-normalize ปัจจุบัน
2. **(Phase 3) importance + persistence จาก extraction** — ให้ LLM ติดคะแนนความสำคัญตอน `extractState` แล้ว ingest fact สำคัญเป็น memory row + บูสต์ตอน recall (ตาม VectFox)
3. **(nice-to-have) Injection Viewer** — debug UI โชว์ว่า recalled ก้อนไหนถูกฉีดเข้า prompt (ตาม CharMemory) — ต่อยอดจาก endpoint `/memory/status` ที่มีแล้ว
4. **(ภายหลัง) sqlite-vec** — เฉพาะเมื่อ corpus โตจน brute-force ช้า
