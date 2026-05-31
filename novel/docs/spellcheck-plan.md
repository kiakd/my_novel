# แผนปรับปรุง Spell-Check ภาษาไทยแบบเต็มระบบ

> เวอร์ชัน: 2026-05-27
> ผู้เขียน: planning session — ไม่ต้องรีบ มี trade-off ให้เลือก
> เป้าหมาย: เปลี่ยน "ตรวจคำผิด" จากแค่ flag คำที่ไม่อยู่ในพจนานุกรม → ระบบ suggest "did you mean" + segmentation ที่ดีขึ้น + UX ใกล้ Grammarly

---

## 1. สถานะปัจจุบัน

### ที่มีอยู่
- **Dictionary**: seed inline ~800 คำ + โหลด `words_th.txt` จาก PyThaiNLP (~62K คำ) เก็บใน MongoDB + localStorage
- **Whitelist** ราย-story: ชื่อตัวละครเข้าให้อัตโนมัติ
- **Segmenter (custom)**: พอร์ต `tcc.py` + `newmm` onecut จาก PyThaiNLP — longest match within TCC cluster boundaries
- **Detector**: scan สแกน → flag คำที่ไม่อยู่ใน dict ∪ whitelist + มีพยัญชนะ ก-ฮ อย่างน้อย 1 ตัว
- **ค่ะ/คะ checker** — แยกเป็นโมดูล logic ละเอียดถูกต้องดี (sentence-aware, รู้จำคำคำถาม)
- **Cleanup passes** — regex 6 ข้อแก้ตกหล่นปลอดภัย (multi-space, ..., นะค่ะ→นะคะ)

### ข้อจำกัด (Pain Points)
| # | ปัญหา | ผลกระทบ |
|---|---|---|
| P1 | **ไม่มี suggestion เลย** — แค่ flag ว่าผิด ไม่บอกว่าน่าจะหมายถึงอะไร | ผู้ใช้ต้องเดา/แก้เอง ใช้งานจริงไม่เวิร์ก |
| P2 | Dictionary `words_th.txt` ไม่มี frequency | ถ้าจะ rank suggestion ทำไม่ได้ |
| P3 | newmm port เป็นแบบ longest-match อย่างเดียว — ambiguous boundary แก้ไม่ได้ | คำควบ/คำพ้อง segment ผิด → flag ผิด |
| P4 | ตรวจแบบ lexical ล้วน — "คำถูกผิดบริบท" จับไม่ได้ (เช่น "พุงพรุน" vs "พุ่งพรวด" ถูกทั้งคู่ในพจนานุกรม) | False negative |
| P5 | Re-segment ทั้งบทเมื่อกดทุกครั้ง — บทยาว >5,000 ตัวอักษรอาจช้า | UX กระตุก, ไม่ realtime |
| P6 | UI panel "คำที่น่าสงสัย" — ผู้ใช้ต้องดู list ข้างๆ แล้วหาเองในบท | แก้ทีละคำเหนื่อย |
| P7 | คำสมัยใหม่/สแลง/RP-jargon ไม่อยู่ใน `words_th.txt` | flag เยอะเกินจริง → ผู้ใช้ดับ feature ทิ้ง |

---

## 2. Research Summary

ค้นจาก PyThaiNLP docs, npm, GitHub stars, Bun + smoke test จริง — ผลรวม

### 2.1 Word Segmentation

| ตัวเลือก | ขนาด | คุณภาพ Thai | License | สถานะ | หมายเหตุ |
|---|---|---|---|---|---|
| **`Intl.Segmenter`** (browser native) | 0 KB | ✅ ดีเยี่ยม (verified) | — | ✅ มีในทุก browser ปัจจุบัน | ใช้ ICU CLDR ใต้น้ำ |
| current TCC + newmm (custom) | ~5 KB JS | พอใช้ | MIT-like | ✅ ใช้อยู่ | ambiguous case แย่ |
| [`wishawa/thai-spell-check`](https://github.com/wishawa/thai-spell-check) (libthai WASM) | ~1 MB | ดี | **GPLv3** | ❌ update 2019 | GPL ติด license |
| [`veer66/wordcut`](https://github.com/veer66/wordcut) | 488 KB | ดี | LGPL-3.0 | Node only | ไม่มี browser build |
| [`veer66/chamkho`](https://github.com/veer66/chamkho) (Rust→WASM) | ? | ดี เร็ว | Apache/MIT | ❌ archived 2023 | ย้ายไป Codeberg |
| `echogarden/text-segmentation` (ICU WASM) | **27 MB** | ดี | MIT | ✅ active | ใหญ่เกินไป |

**สรุป**: `Intl.Segmenter` ชนะขาดในด้าน trade-off — fix `P3` ด้วยตัวเลขศูนย์ KB

ผล smoke test ที่รันจริง (Bun 1.3 / V8):
```
"เคนกลับบ้านมาเจอฝ้ายนั่งอ่านหนังสือ"
→ เคน | กลับ | บ้าน | มา | เจอ | ฝ้าย | นั่ง | อ่าน | หนังสือ ✓

"แสงแดดส่องผ่านม่านลูกไม้บางเบา"
→ แสงแดด | ส่อง | ผ่าน | ม่าน | ลูกไม้ | บางเบา ✓
```

### 2.2 Spell Suggestion Algorithm

| ตัวเลือก | speed | accuracy | bundle | Thai-verified |
|---|---|---|---|---|
| **[mnemonist `SymSpell`](https://yomguithereal.github.io/mnemonist/symspell)** | O(1) precompute, lookup ms-level | ดี (Norvig family) | ~14 KB | ✅ **test ผ่าน** ดูภาคผนวก A |
| Peter Norvig แบบ classic (custom) | O(n × alphabet × len) — ช้าสำหรับยูนิโค้ดไทย | ดี | <5 KB | — |
| `symspell-ts` (npm v0.x) | เหมือน SymSpell | ดี | ~25 KB | likely |
| BK-tree / Levenshtein automaton | medium | ดี | medium | — |
| Neural (WanchanBERTa) | ต้องโหลด ~100 MB model | ดีสุด | ใหญ่มาก | — |

**สรุป**: ใช้ **mnemonist SymSpell** — fix `P1`, `P2`

### 2.3 Dictionary + Frequency

| ทรัพยากร | คำ | ขนาด | freq? | License | URL |
|---|---|---|---|---|---|
| `words_th.txt` (ใช้อยู่) | 62K | 1.5 MB | ❌ | CC0 | [PyThaiNLP/dev/corpus](https://github.com/PyThaiNLP/pythainlp/tree/dev/pythainlp/corpus) |
| **`tnc_freq.txt`** | 106K | 1.6 MB | ✅ ความถี่ Thai National Corpus | CC0 | เดียวกัน |
| TLTK dict | 65K | ? | ❌ | — | [github.com/attapol/tltk](https://github.com/attapol/tltk) |
| `tnc_bigram` / `tnc_trigram` | — | 5 MB+ | bigram freq | CC0 | [PyThaiNLP-corpus](https://github.com/PyThaiNLP/pythainlp-corpus) |

**สรุป**: เปลี่ยนเป็น `tnc_freq.txt` — fix `P2` (มี frequency เลย → rank suggestion ได้)

---

## 3. การออกแบบใหม่

### 3.1 Architecture Overview

```
+--------------------------------------------------------------+
| Browser (novel.html)                                         |
|                                                              |
| TipTap Editor ──────────────────────┐                        |
|                                     ▼                        |
| ┌─ Spell Pipeline (debounced 800ms) ──────────────────────┐  |
| │  1. Intl.Segmenter('th', word) → tokens                 │  |
| │  2. Filter Thai tokens                                  │  |
| │  3. for each token:                                     │  |
| │     - in whitelist? → ok                                │  |
| │     - in dict (Set lookup O(1))? → ok                   │  |
| │     - else: SymSpell.search(token, max_dist=2)          │  |
| │       sort by (distance ↑, frequency ↓) → top 5         │  |
| │  4. group consecutive unknown tokens (อาจเป็น mis-seg)  │  |
| │     - try concatenated form in dict first               │  |
| │  5. emit decorations { from, to, suggestions[] }        │  |
| └────────────────────────────────────────────────────────┘  |
|                                     │                        |
|                                     ▼                        |
| ProseMirror Decoration: <span class="spell-bad"...>          |
|   • คลิก → popover {Top 3 suggest} + add-to-whitelist        |
|                                                              |
+--------------------------------------------------------------+
            ▲
            │ (initial load only)
            │
+--------------------------------------------------------------+
| Server (server.ts)                                           |
| GET /api/spell/dict → tnc_freq.txt mirror (compressed)       |
| GET /api/spell/index → precomputed SymSpell binary (optional)|
+--------------------------------------------------------------+
```

### 3.2 ขั้นตอน Pipeline ละเอียด

**Step 1 — Token boundary**
- ใช้ `new Intl.Segmenter('th', { granularity: 'word' })`
- input: paragraph text จาก TipTap
- output: array ของ `{ segment, index, isWordLike }`
- **Drop** non-Thai segments + punctuation + whitespace
- **Drop** segments < 2 อักษร (สั้นเกินไป noise)

**Step 2 — Whitelist + Dictionary lookup**
- `whitelist: Set<string>` = ชื่อตัวละคร ∪ custom whitelist
- `dictMap: Map<string, number>` = word → frequency
- ถ้าใน whitelist หรือ dict → mark `ok`

**Step 3 — Suggestion**
- ถ้าไม่อยู่ → call `symspell.search(token)` → array of `{ term, distance, count }`
- sort:
  ```
  primary: distance ascending (1 ดีกว่า 2)
  secondary: count descending (จาก tnc_freq)
  ```
- เก็บ top-5

**Step 4 — Mis-segmentation rescue**
- ถ้าเจอ unknown 2-3 token ติดกัน → ลองรวม `t[i] + t[i+1]` ดูใน dict
- ถ้าเจอ → coalesce เป็น 1 segment ok (ป้องกัน false positive จาก segment ผิด)

**Step 5 — Decoration in TipTap**
- ใช้ TipTap `Decoration.inline` API พ่นใต้คำผิด — ดูตัวอย่างใน [ProseMirror docs](https://prosemirror.net/docs/ref/#view.Decoration%5Einline)
- CSS: `text-decoration: underline wavy red;` แบบ Word
- คลิก → popover floating แสดง suggestion + ปุ่ม "✓ แก้ตามนี้" + "✗ ข้าม" + "+ เพิ่มในพจนานุกรม"

**Step 6 — Performance: incremental + worker**
- **Web Worker**: ย้าย dict load + SymSpell index build ออกจาก main thread
- **Incremental**: track ProseMirror transactions → ตรวจเฉพาะ paragraph ที่เปลี่ยน (ไม่ใช่ทั้งบท)
- **Debounce**: 800ms หลัง user หยุดพิมพ์
- **Cache**: token-level cache `Map<string, SpellResult>` — คำที่เคยตรวจไม่ตรวจซ้ำ

### 3.3 Thai-Aware Edit Distance (optional refinement)

ผิดบ่อยในภาษาไทยมีแพทเทิร์น:
- **สลับวรรณยุกต์**: `ก่า` ↔ `ก้า` (cost ควรต่ำ ~0.5)
- **ตกวรรณยุกต์**: `กา` ↔ `ก่า` (cost ต่ำ)
- **สลับ ใ/ไ**: คำที่ใช้ "ใ" 20 คำมาตรฐาน (ใจ, ใต้, ใน, ...) — ผิดบ่อย
- **สลับ ร/ล**: คนเหนือ/อีสานพิมพ์สลับ
- **ซ้ำ ๆ**: พิมพ์ "ไม่ไม่ได้"

→ Custom cost matrix ส่งเข้า SymSpell (ถ้า port รองรับ) หรือ post-filter
→ **เริ่มจาก default ก่อน** วัด accuracy แล้วค่อยใส่

---

## 4. แผนทำเป็น Milestone

แต่ละ milestone จบเป็น PR ใช้งานได้ทันที — ไม่ต้องรอ milestone หน้า

### M1 — Drop-in Segmenter Upgrade (1-2 ชม.)
- เปลี่ยน `tccClusters` + `segmentNewmmCollectUnknown` → ใช้ `Intl.Segmenter('th')`
- เก็บ logic แค่: tokens → filter Thai → check dict ∪ whitelist → output unknown list
- ลบโค้ด TCC_PATTERN_FRAGS ~50 บรรทัด
- **เป้า**: ผลลัพธ์ดีขึ้นด้วยโค้ดน้อยลง

### M2 — Dictionary with Frequency (1 ชม.)
- เปลี่ยน `downloadDictionary()` URL → `tnc_freq.txt`
- parse `word\tfreq` → store `{ words: string[], freqs: number[] }`
- migrate schema: dict ใน MongoDB เปลี่ยนเป็น `[ [word, freq], ... ]`
- backward compat: ถ้า doc เก่าเป็น string[] → freq = 1 ทุกตัว

### M3 — SymSpell Suggestions (3-4 ชม.)
- เพิ่ม dependency `mnemonist` (~14 KB)
- สร้าง `lib/spell-engine.ts` — wrap SymSpell + dict loader
- build index ครั้งเดียวตอน load (cache ใน IndexedDB)
- update UI panel: แสดง suggestion top 3 ใต้แต่ละ unknown
- ปุ่มใหม่: "✓ แทนที่ด้วยคำนี้" — ใส่ลง editor ผ่าน `chapterEditor.chain().insertContentAt(from, to, suggestion)`

### M4 — Inline Decorations (Grammarly-style) (4-5 ชม.)
- TipTap extension custom: `SpellDecoration` ใช้ `ProseMirror Decoration.inline`
- onUpdate → debounce 800ms → re-run spell on changed paragraphs
- CSS `text-decoration: wavy red underline`
- click handler → floating popover (Floating UI library หรือ Popper.js)
- **เลือก**: ใช้ `@floating-ui/dom` (~5 KB) หรือ vanilla `getBoundingClientRect`

### M5 — Web Worker + Incremental (2 ชม.)
- ย้าย SymSpell index + segmentation → Worker
- postMessage protocol: `{ paragraphs: string[] }` → `{ issues: [...] }`
- main thread แค่ render decorations
- benchmark: บท 10,000 ตัวอักษร ต้อง < 500ms

### M6 — Quality of Life
- **คำเฉพาะระดับ global** — ไม่ใช่แค่ per-story (เช่น "อ่ะ", "เนอะ" — ใช้ทุกเรื่อง)
- **Import/Export พจนานุกรมส่วนตัว** เป็น `.txt`
- **Ignore range** — กดข้ามใน selection ทั้งย่อหน้า
- **Statistic**: บทนี้มีคำผิด X ตำแหน่ง (badge เลขในหัวบท list)

### M7 — Thai-Aware Cost (optional, R&D)
- Custom cost matrix สำหรับวรรณยุกต์, ใ/ไ, ร/ล
- A/B test กับ baseline SymSpell — เก็บ flagged-and-accepted rate

---

## 5. Trade-offs ที่ต้องตัดสินใจ

| คำถาม | Option A | Option B | คำแนะนำ |
|---|---|---|---|
| segment ใช้ native หรือ custom? | `Intl.Segmenter` 0 KB | custom newmm 5 KB | **A** — เทียบแล้ว A เท่ากันหรือดีกว่า |
| dict file ที่ไหน? | embed ใน JS bundle | fetch จาก server | **server** — ใหญ่ + อัปเดตได้ |
| dict storage client? | localStorage | IndexedDB | **IndexedDB** — `tnc_freq` 1.6 MB ใกล้ขีดจำกัด localStorage 5 MB และ parse JSON ทุกครั้งช้า |
| SymSpell index ที่ไหน? | rebuild ทุก session | cache binary | **rebuild** (build ครั้งแรก ~200ms ยอมรับได้) แล้วเก็บใน Worker memory |
| inline underline vs panel-only? | inline เท่านั้น | panel เท่านั้น | **ทั้งคู่** — inline สำหรับ fix เร็ว, panel สำหรับ bulk review |
| max edit distance? | 1 (strict, fast) | 2 (lenient, slow) | **2** — ภาษาไทย dist 1 ครอบไม่ครบ (สลับวรรณยุกต์ + พิมพ์เพิ่ม 1 ตัว = dist 2) |
| รุ่น dict | `tnc_freq` | `words_th + freq=1` | **tnc_freq** — ranking สำคัญ |

---

## 6. ข้อมูลสำคัญ (อ้างอิง)

### Intl.Segmenter — สั้นๆ
```js
const seg = new Intl.Segmenter('th', { granularity: 'word' });
const tokens = [...seg.segment(text)]
  .filter(s => s.isWordLike)
  .map(s => ({ word: s.segment, start: s.index, end: s.index + s.segment.length }));
```

### mnemonist SymSpell — สั้นๆ
```js
import SymSpell from 'mnemonist/symspell.js';
const idx = new SymSpell({ maxDistance: 2, verbosity: 2 });
// note: api ไม่รับ frequency ปัจจุบัน — ต้อง add หลายครั้งหรือ wrap with external freq map
for (const w of words) idx.add(w);

const matches = idx.search(typo);
// → [{ term, distance, count }, ...]
```

### tnc_freq.txt format
```
ที่	818364
การ	592036
เป็น	540030
...
```
parsable ด้วย:
```js
const lines = text.split(/\r?\n/);
const entries = lines.filter(l => l.includes('\t')).map(l => {
  const [w, f] = l.split('\t');
  return [w.trim(), Number(f) || 0];
});
```

---

## 7. ทางเลือกอื่น (ไม่แนะนำแต่บันทึกไว้)

### A. ส่ง spell-check ไป LLM ตรง (DeepSeek)
- **ดี**: คุณภาพสูง รู้บริบท
- **เสีย**: latency 2-3s, ค่าใช้จ่ายต่อทุก paragraph, ทำ realtime ไม่ได้
- **เหมาะ**: ใช้แค่ "ตรวจขั้นสุดท้าย" (manual trigger) ไม่ใช่ inline
- **แผน**: เพิ่ม endpoint `/api/proofread` แยก — กดปุ่ม "ตรวจด้วย AI" ส่งทั้งบทไป LLM กลับมาเป็น diff

### B. Hunspell .aff/.dic + libhunspell.wasm
- **ดี**: standard, รองรับ morphology
- **เสีย**: Thai .aff file ไม่ค่อย maintain, ขนาดใหญ่ ผลทดสอบไม่ดีกว่า SymSpell + freq dict

### C. Neural model (WanchanBERTa Thai Grammarly)
- **ดี**: คุณภาพสูงสุด, แก้ context-aware ได้
- **เสีย**: ~100 MB+ model, ต้อง GPU/server, latency สูง
- **เหมาะ**: ทำเป็น server endpoint สำหรับโหมด "ตรวจละเอียด" (ใกล้ A)

---

## 8. ภาคผนวก

### A. ผล smoke test SymSpell + Thai (2026-05-27)
```
ฝัาย            -> [{"term":"ฝ้าย","distance":1}]
เคนน            -> [{"term":"เคน","distance":1}]
หนังสีอ         -> [{"term":"หนังสือ","distance":1}]
อ้าน            -> [{"term":"บ้าน","distance":1},{"term":"อ่าน","distance":1}]
ฝ่าย            -> [{"term":"ฝ้าย","distance":1}]
พระอาทิทย์      -> [{"term":"พระอาทิตย์","distance":1}]
คลาง            -> [{"term":"คราง","distance":1}]
โอย             -> [{"term":"โอ๊ย","distance":1}]
เจป             -> [{"term":"เจอ","distance":1},{"term":"เจ็บ","distance":2}]
แสว             -> [{"term":"แสง","distance":1}]
```
→ accuracy ดีมาก distance ตรงตามคาด ranking ถูกต้อง

### B. Reference Implementations
- PyThaiNLP `spell` engines: [docs](https://pythainlp.org/docs/5.0/api/spell.html)
- mnemonist data structures: [yomguithereal.github.io/mnemonist](https://yomguithereal.github.io/mnemonist/)
- ProseMirror Decoration API: [prosemirror.net/docs](https://prosemirror.net/docs/ref/#view.Decoration)
- Intl.Segmenter polyfill (fallback IE/Safari เก่า): `@formatjs/intl-segmenter`

### C. ไฟล์ที่ต้องแก้
- `novel.html` — ลบ `tccClusters`, `segmentNewmmCollectUnknown` (line ~2042-2128)
- `novel.html` — อัปเดต `findUnknownThaiSegments`, `runSpellCheck`, `downloadDictionary`
- `novel.html` — เพิ่ม TipTap decoration extension
- `server.ts` — endpoint mirror `tnc_freq.txt` (CORS handled server-side)
- `db.ts` — schema migration `dict: string[]` → `dict: [string, number][]`
- new: `lib/spell-worker.ts` — Web Worker
- new: `lib/spell-engine.ts` — wrapper class

---

## 9. คำถามที่ผู้ใช้ตอบก่อน implement

1. M1-M3 (core) vs M1-M5 (รวม decoration + worker) — ทำถึงไหนใน batch แรก?
2. inline underline (Grammarly-style) หรือ panel เท่านั้นพอ?
3. dict load — ทำให้ auto-trigger ตอนเปิดบท หรือคงไว้ที่ปุ่ม "โหลดเต็ม" manual?
4. เพิ่ม endpoint `/api/proofread` ที่ใช้ LLM ด้วยไหม? (ตัดสินใจตอนทำ M3 จบ)
