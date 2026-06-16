# รายงานตรวจเชิงลึก: จุดที่ปรับปรุงได้โดยไม่เสียเงินเพิ่ม + โค้ดที่ขัดหลักการ

> วันที่: 2026-06-16 · ขอบเขต: **แชท/RAG**, **นิยาย**, และ **โค้ดออดิตข้ามระบบ**
> วิธีตรวจ: อ่านโค้ดอย่างเดียว (read-only) ด้วย 3 agent คู่ขนาน ไม่มีการแก้โค้ด
> หมายเหตุ: เลขบรรทัด (`file:line`) เป็น ณ ตอนตรวจ ควรเช็คอีกครั้งก่อนแก้จริง
> "FREE" = ทำได้โดยไม่ต้องจ่ายเพิ่ม (ไม่เพิ่ม service เสียเงิน — embedding ที่มีอยู่แล้วไม่นับ)

---

## TL;DR — ทำก่อน 5 อย่าง (ฟรีทั้งหมด, อิมแพคสูง)

| # | เรื่อง | ระบบ | ทำไมสำคัญ |
|---|--------|------|-----------|
| 1 | **narrator turns ไม่เคยถูก ingest/recall เข้า RAG** | แชท | RAG มองไม่เห็นฉากเล่าเรื่อง/NPC ครึ่งนึงของเนื้อหา (critical) |
| 2 | **regen/แก้/ลบข้อความ ทำ index ใน RAG เพี้ยน** (เก็บข้อความเก่าค้าง) | แชท | ลบฉากแย่ ๆ แล้วมันยังหลอนกลับมา + index เพี้ยนหลัง reload |
| 3 | **embedding ปิด/พังเงียบ ๆ ไม่มีสัญญาณเตือน** | แชท | บน VPS อาจรันแบบ keyword-only โดยไม่รู้ตัว |
| 4 | **wire RAG เฟส 2 ให้นิยาย** (kind='novel', scope=storyId) — สร้างไว้ ~90% แล้ว | นิยาย | ความต่อเนื่องข้ามบทยาว ๆ, FTS-only = $0 |
| 5 | **provider default = openrouter แต่ไม่มี key + frontend เลือกไม่ได้** | ข้ามระบบ | บาง endpoint โยน error บน VPS (critical) |

---

# ส่วนที่ 1 — แชท + RAG Long-Term Memory

## 1A. คุณภาพการ recall (ฟรีทั้งหมด)

### ★ น้ำหนัก wFts/wVec ฮาร์ดโค้ด 50/50 ฝั่ง server + ไม่สอดคล้องกับ client
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `novel/server.ts:851` ตั้ง `wFts:0.5, wVec:0.5, k: b.k ?? 6` แต่ client ส่ง `k:4` (`ChatScreen.tsx:346`) → default ไม่ตรงกัน และ client ส่งน้ำหนักไม่ได้เลย
- ปัญหา: FTS trigram บนภาษาไทยให้ผลขยะ (match substring มั่ว) ส่วน vector แม่นกว่ามากเชิงความหมาย — 50/50 จึงถ่วงสัญญาณที่ดีกว่าให้ต่ำลง และในโหมด FTS-only คะแนนสูงสุดทำได้แค่ 0.5 (เพราะ term vec หายไป ไม่ได้ renormalize)
- **แก้:** เมื่อมี `queryVec` ใช้ ~`wFts 0.35 / wVec 0.65`; เมื่อ `queryVec` เป็น null ตั้ง `wFts:1.0` ให้คะแนนกินเต็มช่วง [0,1]; ทำ `k` default ให้ตรงกันสองฝั่ง

### ★ ไม่มี recency weighting ใน rerank
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `novel/chat-memory.ts:131-157` `recall()` ให้คะแนนจาก FTS rank + cosine ล้วน — `ts`/`turnIdx` มีติดมาในทุก hit แต่ไม่เคยถูกใช้
- ปัญหา: ในแชทยาว ๆ keyword เดียวกัน (ชื่อตัวละคร, "ปราสาท") ซ้ำหลายสิบเทิร์น → relevance ล้วนอาจดึงของเก่ามากกว่าของล่าสุด ขัดกับ state-card ปัจจุบัน
- **แก้:** เพิ่ม recency boost เบา ๆ `s += ~0.1 * (turnIdx / maxTurnIdx)` หรือ half-life decay บน `ts` — ฟรี, ช่วยตัดสินเสมอไปทางความจำที่สดกว่า

### recall query ใช้แค่ข้อความล่าสุดของ user → เคส "ดำเนินเรื่องต่อ" recall ได้แย่/ว่าง
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `ChatScreen.tsx:346` query ด้วย `userInput` แต่เคส continue ส่ง query เป็นสตริง synthetic `"(ดำเนินเรื่องต่อ) ..."` (`:403`) ที่ไม่มี keyword ฉากเลย → recall ได้ผลมั่ว/ว่าง ทั้งที่เป็นเคสที่ต้องการความต่อเนื่องมากสุด
- **แก้:** สำหรับ continue/regen ให้สร้าง query จาก**ข้อความ char/user จริงล่าสุด** แทนสตริง synthetic

### recalled[] อาจซ้ำกับ summary / raw history (เปลือง token + เสี่ยงขัดกันเอง)
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `ChatScreen.tsx:343` `excludeFromIdx` ตัดเฉพาะเทิร์นที่อยู่ใน raw history แต่ไม่ตัดเทิร์นที่ถูกพับเข้า `summary` แล้ว → recall อาจคืนข้อความที่ summary สรุปไว้แล้ว ฉีดซ้ำใต้หัวข้อ "ความทรงจำที่เกี่ยวข้อง"
- prompt ซ้อน 4 ชั้น (summary `chat-prompt.ts:100`, recalled `:74`, lore `:62`, state `:68`) โดยไม่ dedup กัน
- **แก้:** dedup `recalled` เทียบกับข้อความ raw history ก่อนฉีด (เช็ค near-substring ถูก ๆ)

### trigram ตัด token <3 ตัว + ไม่มี proper-noun boosting จริง
- **ความรุนแรง:** nice-to-have · **ค่าใช้จ่าย:** FREE
- `chat-memory.ts:67-75` `toFtsMatch()` กรอง token `length>=3` แล้ว OR-join → query สั้น (ชื่อเล่น 2 ตัว, "AI") match ไม่ได้เลย คืน `[]`; คอมเมนต์ที่ `:139-140` อ้างว่า boost ชื่อเฉพาะ แต่จริง ๆ ทุก token OR เท่ากันหมด ไม่มี IDF จริง
- **แก้:** dedup token + ตัด token ที่พบบ่อยทิ้ง ให้ trigram ของชื่อเฉพาะเด่นขึ้น

### candidate pool `N=max(k*3,12)` แคบไปนิด
- **ความรุนแรง:** nice-to-have · **ค่าใช้จ่าย:** FREE
- `chat-memory.ts:132` — `k=4 → N=12`; หลัง dedup FTS∩vector เหลือ < 12 unique อาจอด rerank; vector scan ทุกแถวอยู่แล้วไม่มีต้นทุนเพิ่ม
- **แก้:** ดันเป็น `N=max(k*5,20)`

## 1B. ช่องโหว่ความถูกต้อง (จำลองเป็น user)

### ⚠ CRITICAL: narrator turns ไม่เคยถูก ingest เข้า RAG (และไม่เคย recall)
- **ความรุนแรง:** critical · **ค่าใช้จ่าย:** FREE
- `runNarrate` (`ChatScreen.tsx:410-431`) append ข้อความ narrator แต่**ไม่เคยเรียก `memIngest`** — มีแต่ `callModel` (โหมด char) ที่ ingest (`:366`); และ `memRecall` ก็เรียกแค่ใน `callModel`
- ผล: ฉากเล่าเรื่องทั้งหมด (รวมเหตุการณ์โลก/แนะนำ NPC) ไม่เข้า long-term memory **ระหว่าง session ที่มันเกิด** แต่ backfill ตอนเปิด session ใหม่ดันเก็บ (`:113-117`) → ฉากเล่าเรื่องล่องหนจาก RAG ตอนเล่นจริง แล้วโผล่มาหลัง reload (ไม่สม่ำเสมอ)
- **แก้:** ใน `runNarrate` หลัง append ให้ `memIngest` row ของ narrator (`speaker:'narrator'`, turnIdx ถูกต้อง) + เพิ่ม `memRecall` แบบ `mode:'narrator'` (backend รองรับ `narratorMode` อยู่แล้ว)

### ⚠ regen ทับข้อความเก่าไม่ได้ → RAG เก็บข้อความเวอร์ชันเก่าค้าง
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `ingestMemory` ใช้ `INSERT OR IGNORE` (`chat-memory.ts:52`) — ตอน regen char ถูก ingest ที่ `baseN` เดิม (`:363-364`) แต่ IGNORE ทำให้ข้อความใหม่ (ที่ดีกว่า) **ไม่ถูก index** ข้อความเก่าอยู่ใน RAG ตลอด; ยังเสี่ยง id ชนกันตอนส่งรัว ๆ → เทิร์นที่ชนถูกดรอปเงียบ (รวม embedding) ไม่ถูก index ถาวร
- **แก้:** ตอน regen `DELETE FROM mem/mem_fts WHERE id=?` ก่อน re-ingest ให้ข้อความใหม่ชนะ

### ⚠ ลบข้อความแล้วไม่ลบออกจาก RAG → ฉากที่ลบยังหลอนกลับมา + index เพี้ยน
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `deleteMessage` (`ChatScreen.tsx:443-459`) แก้ offset ของ `summarizedCount` แต่ไม่เรียก endpoint ลบ memory ใด ๆ (ยังไม่มี) → เทิร์นที่ลบค้างใน `mem`/`mem_fts` recall กลับมาได้; การลบยังเลื่อน array index → backfill ตอน reload เขียน id ชนกับ row เก่า (IGNORE ดรอป) → index เพี้ยนหลังลบ+reload
- **แก้:** เพิ่ม `DELETE /api/chat/memory/:scopeId` (หรือ per-id) เรียกตอนลบ; ง่ายสุด: ลบ memory ทั้ง scope แล้วให้ backfill สร้างใหม่จาก message list ปัจจุบัน

### backfill (turnIdx) กับ excludeFromIdx ใช้ชุด filter คนละแบบ (secret narrator)
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- backfill นับ `messages.filter(!m.item)` รวม secret narrator (`ChatScreen.tsx:110,113`) แต่ `buildMemory` สร้าง `raw` โดย**ตัด** secret narrator (`:248`) → `excludeFromIdx` ผสม base ที่รวม narrator กับ `raw.length` ที่ไม่รวม → เพี้ยนเล็กน้อยเมื่อมีฉากลับ (re-injection)
- **แก้:** คำนวณ `excludeFromIdx` จาก filter เดียวกับที่สร้าง `raw` (public conv) — ทำ filter ให้เป็น single-source

### backfill ซ้ำหลังแก้/ลบ → IGNORE เก็บข้อความเก่า (RAG เสิร์ฟของเก่าเงียบ ๆ)
- **ความรุนแรง:** nice-to-have · **ค่าใช้จ่าย:** FREE
- id เป็น positional + `INSERT OR IGNORE` → session ที่ถูกแก้/regen ระหว่าง reload id ชี้ข้อความใหม่แต่ IGNORE เก็บข้อความเก่า
- **แก้:** ผูก idempotency กับ content (เก็บ `memIndexedCount`/hash บน session, backfill เฉพาะ delta) หรือทำ backfill เป็น upsert (`INSERT OR REPLACE` + ลบ/ใส่ FTS ใหม่)

### `Math.min(...ranks)` บน array ว่าง (เปราะ ไม่ใช่บั๊กตอนนี้)
- **ความรุนแรง:** nice-to-have · **ค่าใช้จ่าย:** FREE
- `chat-memory.ts:142` เมื่อ `ftsHits` ว่างได้ `Infinity/-Infinity` แต่ forEach ข้าม ไม่มี NaN รั่ว — **แก้:** early-return block normalization เมื่อ `ftsHits.length===0`

## 1C. โค้ดที่ไม่ได้ใช้/ไม่ครบ
- `/api/chat/memory/status` (`server.ts:860-875`) — **ไม่มี client เรียก** ไม่มี UI (ดู 1D.1) → เพิ่ม `memStatus()` + โชว์ในหน้าตั้งค่าแชท
- `prefill`/`temperature` ใน `sendChat` body (`chat-api.ts:52-53`) — backend อ่าน (`server.ts:739-740`) แต่ `ChatScreen` ไม่เคยส่งในเส้นแชท (dead param เฉพาะเส้นนี้)
- `stateDelta` ที่ server คืน (`server.ts:793`) — client ไม่ใช้ (debug only)
- `MemRow.kind:'novel'` / `scope=storyId` — scaffolded ไว้แต่ยังไม่ wire (เฟส 2, คาดไว้แล้ว)

## 1D. degrade เงียบ ไม่บอก user
### ★ embedding ไม่ตั้งค่า → degrade เป็น FTS-only โดยไม่มีสัญญาณเลย
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `embed.ts:2-4` ถ้า `EMBED_*` ไม่ตั้ง → คืน null → recall เป็น FTS-only; flag `embedded` คืนกลับมาใน response แต่ client ทิ้ง (`.catch(()=>{})` ที่ `:118,366`) → บน VPS ที่ไม่ตั้ง `EMBED_*` ผู้ใช้ได้ความจำแบบ keyword ล้วนโดยไม่รู้
- **แก้:** โชว์ `/api/chat/memory/status` ในหน้าตั้งค่า; อย่างน้อย toast ครั้งเดียวต่อ session ถ้า `embedded===false`

### ★ embedding ยิงพลาด ถูกกลืนเหมือน "ไม่ได้ตั้งค่า"
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `embed.ts:21,25` คืน null ทั้งตอน `!res.ok` และ catch — แยกไม่ออกจาก unconfigured; key ผิด/429/**บัญชีโดนแบนเรื่อง R18** (ที่ CLAUDE.md เตือน) กลายเป็น FTS-only กลางคัน บางเทิร์นมี embedding บางเทิร์นไม่มี คุณภาพ recall ตกครึ่งโดยไม่มี error ไหนเลย
- **แก้:** แยก "ตั้งค่าแล้วแต่พัง" จาก "ไม่ได้ตั้งค่า" — log HTTP status ฝั่ง server (`logger.ts`) + เตือน client ครั้งเดียว **(อิมแพคสูงสุดของ silent-failure สำหรับโปรเจค R18)**

### extractState/recall ล้มเหลวเงียบ
- `buildMemory` toast ตอน summary fail (`ChatScreen.tsx:262`) แต่ `extractState` (`:274-285`) เป็น fire-and-forget ไม่มี catch → state-card stale เงียบ ๆ (เวลา/สถานที่/disguise drift) ทั้งที่ prompt พึ่งมันหนัก
- `memRecall` ใน try/catch ว่าง (`:345-348`) — ดีเรื่อง resilience แต่รวมกับข้างบนแล้วความจำพังหมดได้โดยไม่มีสัญญาณ

---

# ส่วนที่ 2 — นิยาย (Long-form chapter)

## 2A. ความต่อเนื่อง & ความจำของนิยายยาว

### ★ ความจำข้ามบท lossy: เหลือแค่ summary ข้าง ๆ, รายละเอียดกลางเรื่องหาย
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `novel-next/src/lib/novel-context.ts:43-47` (`eventOrder`) + `ChaptersScreen.tsx:158-168`
- ปัจจุบันความต่อเนื่องพึ่ง 3 อย่าง ทุกอย่าง lossy: (a) `eventOrder` = สรุป ~100-150 ตัวอักษรของ**ทุก**บทก่อนหน้า (เติบโตไม่จำกัด เปลือง token ตามจำนวนบท), (b) `continuity` จาก arc beats, (c) เฉพาะบท active = full text clip (head+tail). **ไม่มี retrieval** → fact ที่ตั้งในบท 3 หาไม่เจอในบท 30 เว้นแต่บังเอิญอยู่ในสรุป 1 บรรทัด
- **แก้:** ใช้ RAG เฟส 2 (ดูข้อถัดไป); ชั่วคราวฟรี: cap `eventOrder` เหลือ N บทล่าสุด + บท `pivotal` ทุกบท (มี `importance` คำนวณไว้แล้วที่ `arc.ts:26-31` แต่ไม่ถูกใช้เลือก context)

### ★ RAG เฟส 2 (kind='novel', scope=storyId) สร้างไว้ ~90% แล้ว แค่ยังไม่ wire
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE (FTS-only ไม่ต้องจ่าย embedding; degrade graceful)
- **พร้อมแล้ว (backend):** `chat-memory.ts:3-14` (`kind:'chat'|'novel'` มีใน schema), `server.ts:807-857` (backfill/ingest/recall รับ `kind` + key ที่ `scopeId`)
- **ที่ขาด (client ล้วน):**
  1. `novel-next/src/lib/api.ts` **ไม่มี** `memBackfill/memIngest/memRecall` — มีแต่ใน `chat-api.ts:61-71` และฮาร์ดโค้ด `kind:'chat'` → เพิ่ม variant นิยายหรือ parameterize `kind`
  2. `ChaptersScreen.runContinue` (`:109-188`) ไม่เคยเรียก recall/ingest
  3. **`NovelContext` ไม่มี field `recalled`** (`prompts.ts:76-91`) — chat prompt มี แต่ novel prompt ไม่มี → ต้องเพิ่ม `recalled?: string[]` + render block ใน `assembleSystemPrompt` (วาง**ใต้** continuity/live-state แต่**เหนือ** `eventCurrent` ตามหลัก "live state เหนือ recalled memory")
- **wiring ขั้นต่ำ:** scopeId = `story.id`; หน่วยความจำ = ย่อหน้า/ชังก์บท (turnIdx = running paragraph index); ingest ตอน save/หลัง generate; backfill ครั้งเดียวต่อ story (เลียนแบบ `backfilledRef`); **recall query** = note ความจำข้ามบทของผู้ใช้ (`active.summary`, textarea "🧠 ความจำข้ามบท" `:233`) + ย่อหน้าสุดท้าย (`lastParagraph` มีแล้ว `:130-138`); `mode:'narrator'`
- **ต้นทุน:** `EMBED_*` ไม่ตั้ง = FTS5-trigram ล้วน = $0 และไทยไม่ต้อง segment คำ; embedding เป็น upgrade ที่ค่อยจ่ายทีหลังได้

### clip บท active แบบ head+tail → กลางบทยาวหายเงียบ
- **ความรุนแรง:** nice-to-have · **ค่าใช้จ่าย:** FREE
- `ChaptersScreen.tsx:122-124` เก็บ 2000 ตัวแรก + ท้าย → บทยาวเกิน cap กลางบทหายไม่มีสรุปแทน → "เขียนต่อ" อาจขัดเหตุการณ์กลางบท
- **แก้:** ใช้ `summary` ของบทเอง (มีจาก fold step `:160-168`) แทนกลางที่ตัด: `head + "[ย่อกลางบท: ...]" + tail`; พอ RAG เฟส 2 มาก็ recall กลางบทแทน

## 2B. Mobile writing UX

### ✅ "เขียนต่อ" continue จริงผ่าน prefill — ถูกต้องแล้ว (มีหมายเหตุ)
- `ChaptersScreen.tsx:128-139,172-177` + `server.ts:201-209,243-248` ส่งย่อหน้าสุดท้ายเป็น `prefill` (DeepSeek `prefix:true`), backend คืน `prefill+completion`, client strip prefill ที่ echo (`:174-176`) — continue จริง ไม่ restart
- **หมายเหตุ:** provider **lmstudio** (`server.ts:209`) ดัน prefill เป็น assistant message ธรรมดา ไม่มี `prefix:true` (OpenAI-compat ไม่มี flag) → บางโมเดลเขียนเปิดใหม่ที่ไม่ `startsWith(prefill)` → ย่อหน้าสุดท้ายซ้ำได้ (อิมแพคต่ำ เส้น Gemma) → ควร dedup บรรทัดท้ายแบบ fuzzy

### ✅ view-jump ตอน insert แก้ถูกแล้ว
- `ChapterEditor.tsx:64-69` scroll ไป**ต้น**ข้อความที่เพิ่ง insert (`block:'start'`) แทน scroll ไปท้าย — ถูกต้องสำหรับมือถือ ตรงกับ CLAUDE.md

### ⚠ autosave หลัง generate อาจล้มเหลว/ชนเงียบ ๆ บนเน็ตมือถือกระตุก → ข้อมูลหาย
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `StoryProvider.tsx:73-98` + `ChaptersScreen.tsx:177` — หลัง generate → debounced save 900ms
  - **409 conflict** (`doSave:82-91`): server copy **ทับ local** + toast "loaded latest" → ถ้า autosave อีกแท็บ/summary-fold bump `rev` คั่นระหว่าง generate กับ debounce → **ย่อหน้าที่เพิ่ง generate ถูกทิ้ง** (ข้อมูล AI ราคาแพงหายเงียบ ๆ บนมือถือ)
  - **network error** (`:95-97`): status เป็น `'error'` แต่**ไม่มี retry/ไม่ re-arm** debounce → ถ้าผู้ใช้หยุดพิมพ์หลัง generate (น่าจะหยุดอ่าน) ข้อความที่ generate อาจไม่ถูกส่งอีกเลย
- **แก้:** (a) หลัง insert จาก generate เรียก `saveNow()` (มีแล้ว `:151`) ทันที ไม่รอ debounce; (b) error → retry แบบมีขอบเขต; (c) 409 → ถ้า local มีเนื้อหา generate ที่ยังไม่ save ให้ merge หรือเก็บ recovery buffer ก่อนทับ

### ⚠ "เขียนต่อ" ยิง summarize N ครั้ง + generate ด้วย busy flag เดียว — ไม่มี progress/cancel ค้างนานบนมือถือ
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `ChaptersScreen.tsx:155-188` `runContinue` พับทุกบทก่อนหน้าที่ยังไม่สรุปแบบ sequential (`:160-168` 1 LLM call/บท) แล้วค่อย generate → story ใหม่ 10 บท = 10+1 round-trip หลัง spinner เดียว ไม่มีตัวนับ/cancel; ออกกลางคัน → สรุปบางส่วน commit แต่ generate ไม่รัน
- **แก้:** โชว์ progress ("สรุปบท 3/10…" toast ที่ `:163` มี title อยู่แล้ว แค่เพิ่มตัวนับ), guard unmount, พับแบบ lazy (เฉพาะบทที่ต้องใช้จริง)

## 2C. prompt-assembly (ฟรี)

### ★ R18 lexicon nudge มีใน CHAT แต่**ไม่มี**ในเส้น generate นิยาย
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- chat (`server.ts:769-771`) มี `lexNudge` ผ่าน `looksExplicit()` ฉีด reminder lexicon ท้ายเทิร์น (สูตร D ที่ทดสอบแล้วทำให้ Gemma เลิกเลี่ยงคำ) แต่ generate-roleplay (`:672-682`) **ไม่มี** มีแต่ `buildNovelReminder` — ทั้งที่ system prompt นิยายยาวกว่ามาก recency-drift จากคำ lexicon ดิบ**มากกว่า**
- **แก้:** reuse `looksExplicit()` + `lexNudge` เดิมใน generate-roleplay เมื่อ `mode==='r18'` (ก๊อปเทคนิคที่ validate แล้ว ฟรี)

### local (Gemma 8K): `eventOrder` ไม่ถูก clip สำหรับเส้น local
- **ความรุนแรง:** important · **ค่าใช้จ่าย:** FREE
- `ChaptersScreen.tsx:121-124` clip บท active เหลือ 4500 สำหรับ local แต่ `eventOrder` (`novel-context.ts:44-47`) สร้างจาก**ทุก**บทก่อนหน้า **ไม่ cap** → prompt เกิน 8K ของ Gemma ตัด `eventCurrent`+reminder ท้ายสุดที่สำคัญสุด
- **แก้:** cap/trim `eventOrder` (จำนวน+ความยาวต่อ item) เมื่อ `provider==='lmstudio'`

### สอง section หัวข้อ "สถานะปัจจุบัน" ซ้ำกัน
- **ความรุนแรง:** nice-to-have · **ค่าใช้จ่าย:** FREE
- `prompts.ts:321` กับ `:327` ทั้งคู่ชื่อ "สถานะปัจจุบัน" (canonical จาก arc vs live state-card) → ซ้ำ เปลือง token เสี่ยงขัดกัน
- **แก้:** เปลี่ยนหัวข้อให้ต่างชัด + ข้าม `continuity` ถ้า live `stateCard` ครอบ field เดียวกันแล้ว

## 2D. โค้ดไม่ได้ใช้/ไม่ครบ (นิยาย)
- **ปุ่ม "🔍 รีวิว" เป็น stub** (`ChaptersScreen.tsx:102-106` + `AIBar.tsx:16-18`) — `setTimeout(1300)` แล้ว toast "done ✅" ไม่ทำอะไรเลย ลวงผู้ใช้ว่ารีวิวแล้ว → implement (เรียก `/api/generate` ด้วย critique prompt — ถูก) หรือซ่อนปุ่ม
- **2 ไฟล์ที่เคย uncommitted ตอนนี้ commit แล้ว** (`a4f6568`) — ตรวจแล้วครบ/สอดคล้องดี ✅ (scroll-to-start + prefill continue) เหลือแค่เคส lmstudio non-prefix (2B)
- `importance` (`arc.ts:26-31`) คำนวณแต่ไม่ใช้เลือก context → ใช้เลือกบท pivotal ให้รอด cap (โยงข้อ 2A แรก)
- `novel/gen-chapter.ts` เป็น mapper คู่ขนานกับ `buildNovelContext` ฝั่ง UI — เส้น UI authoritative; gen-chapter.ts อาจ dead/CLI-only → ยืนยันแล้วลบหรือ document
- `memBackfill/memIngest/memRecall` ฮาร์ดโค้ด `kind:'chat'` (`chat-api.ts:61-71`) — blocker ของ 2A (parameterize)

---

# ส่วนที่ 3 — โค้ดออดิตข้ามระบบ (ขัดหลักการ/ไม่ครบ/ไม่ได้ใช้)

> ข้อเท็จจริงเชิงโครงสร้าง: `novel/novel.html` (legacy) ยัง serve ที่ `/` และ `/novel.html` (`server.ts:387-388`) และเป็นตัวเรียกจริงของหลาย endpoint ที่ Next ไม่แตะ → endpoint พวกนั้น "legacy-only" ไม่ใช่ dead สนิท แต่ Next มี screen ที่**ดูเหมือน wire แล้วแต่ไม่ได้ wire**

## ⚠ CRITICAL

### 1. provider default = `openrouter` แต่ frontend เลือกไม่ได้ + ไม่มี key ใน deployment ใด
- **ความรุนแรง:** critical · **หมวด:** incomplete/missing-as-user
- `DEFAULT_PROVIDER = openrouter` เมื่อ `AI_PROVIDER` ไม่ตั้ง (`server.ts:157`); frontend provider type มีแค่ `'deepseek'|'lmstudio'` (`uiPrefs.ts:30`)
- อันตราย: endpoint ที่เรียก `callAI` **โดยไม่ส่ง provider** — `/api/characters/:name/generate-anchor` (`:1251`), `/api/scene-to-image-prompt` (`:1324`) → resolve เป็น openrouter → โยน "OPENROUTER_API_KEY not set" บน VPS (ที่มีแค่ DeepSeek) ผู้ใช้เห็น error งง ๆ
- **แก้:** ตั้ง `AI_PROVIDER=deepseek` ใน env/compose ของ VPS (หรือให้ default fallback เป็น deepseek) + ส่ง provider ผ่าน 2 endpoint นั้น + รวม provider union frontend↔backend ให้ single source

### 2. `/api/state` & `/api/chat-state` ไม่ atomic ตอน create ครั้งแรก — TOCTOU bypass optimistic lock
- **ความรุนแรง:** critical · **หมวด:** incomplete
- เส้น create: `findOne` → ถ้า `!existing` → `updateOne(...,{upsert:true})` rev:1 (`server.ts:419-424`, `478-482`, per-session `516-518`) ใช้ `$set` ไม่ใช่ `$setOnInsert` → first-write 2 แท็บพร้อมกันเห็น `!existing` ทั้งคู่ ตัวที่สอง**ทับเงียบ ๆ** ทั้งคู่คืน `{ok:true,rev:1}` — ขัดหลัก rev ที่ CLAUDE.md บอกว่า "กันหลายแท็บ/autosave ทับกัน" พังเฉพาะเส้น create (เส้น update guard ด้วย `revFilter` ถูกต้อง)
- **แก้:** guarded upsert ตอน create เช่น `updateOne({_id, rev:{$exists:false}}, {$setOnInsert:{state,rev:1}}, {upsert:true})` แล้ว treat `upsertedCount===0 && matchedCount===0` เป็น 409 หรือพึ่ง unique-index duplicate-key error

## ⚠ IMPORTANT

### 3. 3 หน้า Next เป็น mock stub ไม่ wire backend (ดูเหมือนเสร็จ แต่ไม่)
- **ความรุนแรง:** important · **หมวด:** incomplete/missing-as-user
- `ImageGenScreen.tsx:16-20` — `generate()` เป็น `setTimeout` ปลอม ใช้ mock-data ไม่เรียก `/api/image/generate` หรือ `/api/scene-to-image-prompt` (backend image pipeline เข้าได้แค่จาก legacy `novel.html`)
- `SettingsScreen.tsx` — input key เป็น `defaultValue="sk-••••"`, Save แค่ `toast()` → `/api/providers` (`server.ts:582`) **ไม่มี caller ที่ไหนเลย** key ตั้งได้แค่ผ่าน env
- `/api/dict` GET/PUT (`server.ts:561-575`) — **ไม่มี caller ทั้ง Next และ novel.html** orphan เต็มตัว
- **แก้:** wire หน้าเหล่านี้กับ endpoint ที่มี หรือ mark ชัดว่ายังไม่ทำ (disable Save + banner); ลบ `/api/dict` ถ้า drop feature

### 4. endpoint ที่ไม่มี Next client (legacy-novel.html-only) — เช็คเจตนาก่อนเน่า
- **ความรุนแรง:** important · **หมวด:** dead-code (บางส่วน)
- ใช้โดย novel.html เท่านั้น: `/api/scene-to-image-prompt`, `/api/image/generate`, `/api/image/list/:book/:ch`, `/api/poses` + `/extract` + `/upload`
- **ไม่มี caller ทั้งคู่:** `/api/characters/:name/generate-anchor` (`:1243`), `/generate-reference-sheet` (`:1345`), `/:name/reference` (`:1400`), `/api/chat/memory/status` (`:860`), `/api/providers` (`:582`), `/api/dict` (`:561`)
- **แก้:** ตัดสินรายตัว — เก็บเป็น ops/debug (เช่น `memory/status` มีประโยชน์เป็น prod probe ควรเก็บ) หรือลบ (generate-anchor/reference-sheet ดูถูกทิ้ง); อย่างน้อยใส่คอมเมนต์ "legacy novel.html only"

### 5. `/api/characters` CRUD wire ครึ่งเดียวกับหน้า characters ของ Next (สอง character store ไม่ตรงกัน)
- **ความรุนแรง:** important · **หมวด:** incomplete
- Next `CharModal.tsx` เรียกแค่ endpoint card (`card.png`, `import-card`, `import-card-png`); CRUD ธรรมดา (`server.ts:1088-1130`) เรียกแค่จาก novel.html; หน้า Next เก็บตัวละครใน app `state` (Mongo `workspace`) ซึ่ง**คนละ collection** กับ `CHAR_COLLECTION` → ตัวละครที่สร้างใน Next มองไม่เห็นโดย `scene-to-image-prompt`/`reference-sheet` (อ่าน `CHAR_COLLECTION`) → "generate reference sheet" คืน `no matching characters` เงียบ ๆ
- **แก้:** เลือก store เดียว หรือ document ว่า image-gen ต้อง import แยก

### 6. `import-card` (JSON) ไม่เช็ค Content-Type แต่ `card/import` เช็ค (ไม่สอดคล้อง)
- **ความรุนแรง:** important · **หมวด:** incomplete
- `/api/characters/import-card` (`:1163`) เรียก `fromCard(body)` ตรง ๆ สมมติ Elysia parse JSON; ถ้า post โดยไม่มี header → `fromCard(undefined)` โยน 400 งง ๆ; ส่วน `/api/card/import` (`:1224`) branch ตาม content-type ถูกต้อง
- **แก้:** ทำ `import-card` ให้เหมือน `card/import` หรืออย่างน้อย guard `if(!body) return 400`

## NICE-TO-HAVE
- **error contract ไม่สม่ำเสมอ:** บาง endpoint คืน `{ok:false}` HTTP 200, บางอันตั้ง 4xx, บางอัน throw (`server.ts:720/802/993` vs `409` vs card `400/404`); `scene-to-image-prompt` คืน `{ok:false}` 200 แม้ "no matching characters" → client ต้องเช็ค `r.ok` เอง พลาดง่าย → standardize เป็น HTTP status จริง + `{ok:false,error}`
- `/api/generate` error branch log `provider: DEFAULT_PROVIDER` (`:984`) แม้ request ระบุ lmstudio → ใช้ `providerForLog(b.provider)` ให้ตรง (อันอื่นทำถูกที่ `711/799/920/1048`)
- `excludeFromIdx ?? 0` ฝั่ง server (`:851`) = "ไม่ตัดอะไร" ถ้า client ละ → ควร required หรือ default sentinel ใหญ่ (low priority)

## ✅ ตรวจแล้วว่าถูกต้อง (ไม่ต้องไปไล่ซ้ำ)
- embedding degrade path สม่ำเสมอ: `embed.ts` คืน null, ทั้ง 3 caller gate ถูก รายงาน `embedded:false`; `memory/status` รายงาน mode ตรง
- `recall()` empty-FTS edge: `Math.min(...[])`=Infinity แต่ forEach ไม่รัน ไม่มี NaN รั่ว — ปลอดภัย
- optimistic-lock เส้น **update** (ไม่ใช่ create) guard ด้วย `revFilter` ถูกทั้ง 3 doc type; client reconcile บน conflict ถูก (`StoryProvider.tsx:82-90`, `ChatProvider.tsx:101-105`)
- `callAI` provider fallback cloud/local trio ทำงาน; DeepSeek prefill (`/beta`+`prefix:true`) + v4 thinking-disable handle ถูก (`server.ts:204-231`)

---

# ภาคผนวก — แผนลงมือ (เรียงตามคุ้มค่า, ฟรีทั้งหมด)

**รอบ 1 (ความถูกต้อง RAG — กระทบคุณภาพความจำตรง ๆ):**
1. ingest+recall narrator turns (1B critical)
2. delete endpoint + upsert-on-regen (1B) — กันข้อความเก่าค้าง/index เพี้ยน
3. แยก embedding "พัง" vs "ไม่ตั้งค่า" + log + เตือน (1D) — สำคัญมากสำหรับ R18

**รอบ 2 (คุณภาพ recall — ปรับจูน):**
4. ถ่วงน้ำหนัก vec > FTS + recency tiebreak + ใช้ข้อความฉากจริงเป็น query (ไม่ใช่ "ดำเนินเรื่องต่อ") (1A)
5. dedup recalled vs raw history (1A)

**รอบ 3 (นิยาย):**
6. wire RAG เฟส 2 (เพิ่ม `recalled` ใน NovelContext + render block + mem wrappers + recall query) (2A)
7. port `lexNudge` มาเส้น generate นิยาย (2C)
8. harden autosave หลัง generate (saveNow + retry + ไม่ทับ 409) (2B)
9. cap `eventOrder` + ใช้ `importance` (2A/2C)

**รอบ 4 (สุขอนามัยโค้ด):**
10. ตั้ง `AI_PROVIDER=deepseek` บน VPS + ส่ง provider ที่ 2 endpoint (ข้อ 3.1 critical — ตั้ง env ทำได้ทันที)
11. guarded upsert เส้น create state (ข้อ 3.2 critical)
12. แก้/ซ่อนปุ่มรีวิว stub + mark mock screens (2D, 3.3)
13. ตัดสิน legacy endpoints + เพิ่ม `memStatus()` UI (3.4, 1C)
