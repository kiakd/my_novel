# Content-Aware Backfill (syncScope) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยน RAG backfill จาก "INSERT OR IGNORE ครั้งเดียว" → **reconcile ทั้ง scope ตามเนื้อหาจริง** (content-aware sync) เพื่อ heal การ edit/ลบ/regen/สลับลำดับ และ re-embed แถวที่ยังไม่มีเวกเตอร์ — โดยไม่ embed ซ้ำของที่ไม่เปลี่ยน (ประหยัด)

**Architecture:** เพิ่ม `syncScope(db, scopeId, rows)` ใน `chat-memory.ts` ที่ diff แถวปัจจุบันใน DB กับ rows ที่ client ส่งมา (เทียบ `text` = content hash โดยพฤตินัย) แล้ว insert/update/delete ให้ตรง คืนรายการแถวที่ต้อง embed (ใหม่ + เปลี่ยน + ยังไม่มีเวกเตอร์). เปลี่ยน endpoint `/api/chat/memory/backfill` ให้เรียก `syncScope` แล้ว embed เฉพาะแถวที่คืนมา. ฝั่ง client ให้ backfill (sync) รันซ้ำเมื่อ transcript ถูกแก้แบบ non-append (ลบ/แก้) แทนที่จะรันครั้งเดียว/mount.

**Tech Stack:** Bun + `bun:sqlite` (FTS5 trigram), Elysia, Next.js client. แก้ที่ `novel/chat-memory.ts`, `novel/chat-memory.test.ts`, `novel/server.ts`, `novel-next/src/components/screens/chat/ChatScreen.tsx`, `novel-next/src/components/screens/chapters/ChaptersScreen.tsx`.

**ทำไมไม่ต้อง migrate schema:** ใช้การเทียบ `text` ที่เก็บอยู่กับ `text` ที่ส่งเข้ามาเป็น "content hash" โดยตรง — ไม่ต้องเพิ่มคอลัมน์ `contentHash` (ถ้าภายหลังพบว่าเทียบสตริงยาวช้า ค่อยเพิ่มคอลัมน์ hash เป็น optimization)

---

## File Structure

- `novel/chat-memory.ts` — เพิ่ม `syncScope()` + interface `SyncStats`/ผลลัพธ์. ใช้ `ingestMemory`/`deleteMemory` เดิมเป็นส่วนประกอบไม่ได้ตรง ๆ (ต้อง update-in-place) จึงเขียน prepared statements ใน `syncScope` เอง
- `novel/chat-memory.test.ts` — เทสครอบ added/updated/deleted/unchanged + re-embed (embedding NULL)
- `novel/server.ts` — `/api/chat/memory/backfill` เรียก `syncScope` แล้ว embed เฉพาะ `toEmbed`; เพิ่ม guard dim-mismatch ใน `cosine`/`vectorSearch` (Task 5)
- `novel-next/.../chat/ChatScreen.tsx` — re-sync หลัง `deleteMessage` (และจุดแก้ข้อความถ้ามี)
- `novel-next/.../chapters/ChaptersScreen.tsx` — re-sync หลังแก้บท (heal positional shift ของบทกลาง)

---

## Task 1: `syncScope` — diff + reconcile (core)

**Files:**
- Modify: `novel/chat-memory.ts` (เพิ่มหลัง `deleteScope`)
- Test: `novel/chat-memory.test.ts`

- [ ] **Step 1: เขียนเทสที่ fail ก่อน** — ครอบ 4 เคส + re-embed

```ts
test('syncScope: added/updated/deleted/unchanged ถูกต้อง', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'user', turnIdx: 0, ts: 1, text: 'ข้อความเดิม ก' },
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'ข้อความเดิม ข' },
    { id: 's1:2', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 2, ts: 3, text: 'ข้อความเดิม ค' },
  ]);
  // current transcript: s1:0 เหมือนเดิม, s1:1 ถูกแก้, s1:2 ถูกลบ (หายไป), s1:3 เพิ่มใหม่
  const rows = [
    { id: 's1:0', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'user', turnIdx: 0, ts: 1, text: 'ข้อความเดิม ก' },
    { id: 's1:1', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'ข้อความที่ถูกแก้ ข2' },
    { id: 's1:3', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 3, ts: 4, text: 'ข้อความใหม่ ง' },
  ];
  const { toEmbed, stats } = syncScope(db, 's1', rows);
  expect(stats).toEqual({ added: 1, updated: 1, deleted: 1, unchanged: 1 });
  expect(toEmbed.map((r) => r.id).sort()).toEqual(['s1:1', 's1:3']); // เปลี่ยน+ใหม่ ต้อง embed
  // s1:2 ถูกลบจริงทั้ง mem + fts
  expect(ftsSearch(db, { scopeId: 's1', query: 'ข้อความเดิม ค', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(0);
  // s1:1 ค้นด้วยเนื้อใหม่เจอ, เนื้อเก่าไม่เจอ
  expect(ftsSearch(db, { scopeId: 's1', query: 'ถูกแก้', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(1);
  expect(ftsSearch(db, { scopeId: 's1', query: 'เดิม ข', activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 }).length).toBe(0);
});

test('syncScope: แถว unchanged ที่ embedding ยังเป็น NULL → ถูกใส่ใน toEmbed (re-embed เมื่อเปิด EMBED ทีหลัง)', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [   // ingest แบบไม่มี embedding (FTS-only)
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ' },
  ]);
  const rows = [{ id: 's1:0', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ' }];
  const { toEmbed, stats } = syncScope(db, 's1', rows);
  expect(stats.unchanged).toBe(1);
  expect(toEmbed.map((r) => r.id)).toEqual(['s1:0']); // unchanged แต่ยังไม่มีเวกเตอร์ → re-embed
});

test('syncScope: แถว unchanged ที่มี embedding แล้ว → ไม่ต้อง embed ซ้ำ', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ', embedding: new Float32Array([1, 0, 0]) },
  ]);
  const rows = [{ id: 's1:0', scopeId: 's1', kind: 'chat' as const, charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'มังกรไฟ' }];
  const { toEmbed, stats } = syncScope(db, 's1', rows);
  expect(stats.unchanged).toBe(1);
  expect(toEmbed.length).toBe(0); // มีเวกเตอร์แล้ว + เนื้อไม่เปลี่ยน → ข้าม
});
```

- [ ] **Step 2: รันให้ fail** — `cd novel && bun test -t syncScope` → FAIL "syncScope is not a function"

- [ ] **Step 3: เขียน `syncScope`** (minimal ให้ผ่าน)

```ts
export interface SyncStats { added: number; updated: number; deleted: number; unchanged: number }

/** reconcile ทั้ง scope ให้ตรงกับ rows ปัจจุบัน (heal edit/ลบ/regen/สลับลำดับ).
 *  เทียบ text ที่เก็บไว้กับ text ใหม่ = content hash โดยพฤตินัย — ไม่ต้อง migrate schema.
 *  คืน toEmbed = แถวที่ต้อง embed (ใหม่ + เนื้อเปลี่ยน + unchanged แต่ embedding ยัง NULL) เพื่อให้ caller ยิง embed ทีเดียว */
export function syncScope(db: Database, scopeId: string, rows: MemRow[]): { toEmbed: MemRow[]; stats: SyncStats } {
  const existing = new Map<string, { text: string; hasEmb: boolean }>();
  for (const r of db.query('SELECT id, text, (embedding IS NOT NULL) AS hasEmb FROM mem WHERE scopeId = ?').all(scopeId) as any[]) {
    existing.set(r.id, { text: r.text, hasEmb: !!r.hasEmb });
  }
  const incoming = new Set(rows.map((r) => r.id));
  const insMem = db.prepare(
    `INSERT INTO mem (id, scopeId, kind, charId, secret, speaker, turnIdx, ts, text, embedding)
     VALUES (?,?,?,?,?,?,?,?,?,NULL)`);
  const updMem = db.prepare('UPDATE mem SET kind=?, charId=?, secret=?, speaker=?, turnIdx=?, ts=?, text=?, embedding=NULL WHERE id=?');
  const insFts = db.prepare('INSERT INTO mem_fts (id, text) VALUES (?, ?)');
  const delFts = db.prepare('DELETE FROM mem_fts WHERE id = ?');
  const delMem = db.prepare('DELETE FROM mem WHERE id = ?');
  const toEmbed: MemRow[] = [];
  const stats: SyncStats = { added: 0, updated: 0, deleted: 0, unchanged: 0 };
  const tx = db.transaction(() => {
    for (const r of rows) {
      const ex = existing.get(r.id);
      if (!ex) {
        insMem.run(r.id, r.scopeId, r.kind, r.charId ?? null, r.secret ? 1 : 0, r.speaker, r.turnIdx, r.ts, r.text);
        insFts.run(r.id, r.text);
        toEmbed.push(r); stats.added++;
      } else if (ex.text !== r.text) {
        updMem.run(r.kind, r.charId ?? null, r.secret ? 1 : 0, r.speaker, r.turnIdx, r.ts, r.text, r.id);
        delFts.run(r.id); insFts.run(r.id, r.text);
        toEmbed.push(r); stats.updated++;
      } else {
        stats.unchanged++;
        if (!ex.hasEmb) toEmbed.push(r); // re-embed แถวที่ยังไม่มีเวกเตอร์ (เปิด EMBED ทีหลัง)
      }
    }
    for (const id of existing.keys()) {
      if (!incoming.has(id)) { delMem.run(id); delFts.run(id); stats.deleted++; }
    }
  });
  tx();
  return { toEmbed, stats };
}
```

- [ ] **Step 4: รันให้ผ่าน** — `bun test -t syncScope` → 3 PASS

- [ ] **Step 5: commit** — `git add novel/chat-memory.ts novel/chat-memory.test.ts && git commit -m "feat(rag): syncScope — content-aware reconcile (heal edit/ลบ + re-embed)"`

---

## Task 2: เปลี่ยน `/api/chat/memory/backfill` ให้ใช้ `syncScope`

**Files:**
- Modify: `novel/server.ts` (handler `/api/chat/memory/backfill`, ~บรรทัด 807-824)

- [ ] **Step 1: แก้ handler** — sync ก่อน แล้ว embed เฉพาะ `toEmbed`

```ts
.post('/api/chat/memory/backfill', async ({ body }) => {
  const b = body as { scopeId: string; kind?: 'chat' | 'novel'; rows: Omit<MemRow, 'embedding' | 'kind'>[] };
  if (!b?.scopeId || !Array.isArray(b.rows)) return { ok: false, error: 'missing scopeId/rows' };
  try {
    const db = getMemDb();
    const rows: MemRow[] = b.rows.map((r) => ({ ...r, kind: b.kind ?? 'chat', embedding: null }));
    const { toEmbed, stats } = syncScope(db, b.scopeId, rows);   // reconcile (heal edit/ลบ/regen)
    const vecs = toEmbed.length ? await embedTexts(toEmbed.map((r) => r.text)) : null;   // embed เฉพาะที่เปลี่ยน/ยังไม่มีเวกเตอร์
    if (vecs) {
      const upd = db.prepare('UPDATE mem SET embedding = ? WHERE id = ?');
      const tx = db.transaction(() => toEmbed.forEach((r, i) => {
        const v = vecs[i]; upd.run(Buffer.from(v.buffer, v.byteOffset, v.byteLength), r.id);
      }));
      tx();
    }
    return { ok: true, ...stats, embedded: !!vecs, embedConfigured: embedConfigured(), embedError: vecs ? null : (toEmbed.length ? (lastEmbedError()?.error ?? null) : null) };
  } catch (e: any) { return { ok: false, error: e.message }; }
})
```

- [ ] **Step 2: import `syncScope`** — เพิ่มใน import จาก `./chat-memory`

- [ ] **Step 3: ยืนยัน typecheck + รัน server smoke** — `bunx tsc --noEmit` (exit 0); ถ้ามี MongoDB local: `bun server.ts` แล้ว `curl -s -X POST localhost:3000/api/chat/memory/backfill -H 'content-type: application/json' -d '{"scopeId":"t1","rows":[{"id":"t1:0","scopeId":"t1","charId":"a","secret":false,"speaker":"char","turnIdx":0,"ts":1,"text":"ทดสอบ"}]}'` → `{ok:true,added:1,...}`; ยิงซ้ำด้วย text เดิม → `unchanged:1,added:0`

- [ ] **Step 4: commit** — `git commit -am "feat(rag): backfill ใช้ syncScope + embed เฉพาะแถวที่เปลี่ยน"`

> หมายเหตุ: response เปลี่ยนจาก `{count}` → `{added,updated,deleted,unchanged}` — client ที่อ่าน `embedConfigured/embedError` (warnEmbed) ยังทำงานได้เพราะฟิลด์เดิมคงอยู่; ไม่มี client อ่าน `count`

---

## Task 3: chat client — re-sync หลังลบ/แก้ข้อความ

**Files:**
- Modify: `novel-next/src/components/screens/chat/ChatScreen.tsx` (`deleteMessage` ~บรรทัด 443; backfill effect ~บรรทัด 119)

ปัญหา: backfill effect ถูก gate ด้วย `backfilledRef` = รันครั้งเดียว/sessionId/mount → ลบ/แก้ข้อความ ไม่ trigger sync ใหม่ ความจำจึงค้าง (จนกว่าจะ remount)

- [ ] **Step 1: หลัง `deleteMessage` mutate เสร็จ ให้ปลด ref เพื่อให้ effect sync ใหม่**

```ts
// ท้าย deleteMessage หลัง updateSession(...) — ปลด gate ให้ backfill effect re-sync (syncScope จะลบแถวที่หายไป)
backfilledRef.current.delete(sessionId);
```

- [ ] **Step 2: (ถ้ามีฟีเจอร์แก้ข้อความ) ทำเหมือนกันหลัง mutate** — grep หา handler แก้ข้อความใน ChatScreen; ถ้าไม่มี ข้ามได้

- [ ] **Step 3: ยืนยัน** — `cd novel-next && bunx tsc --noEmit` (exit 0). ตรวจ manual: ลบข้อความ → effect ยิง backfill อีกครั้ง → `deleted` เพิ่มใน response

- [ ] **Step 4: commit**

> ทางเลือก: ถ้ากลัว effect ยิงถี่ไป ให้ตรวจ `prevLen > curLen` (ลบ) หรือ track signature `messages.length` ก่อนปลด ref — แต่เริ่มจากปลด ref ตรง ๆ พอ (sync ถูก ไม่ embed ซ้ำ)

---

## Task 4: novel client — re-sync หลังแก้บท (heal positional shift ของบทกลาง)

**Files:**
- Modify: `novel-next/src/components/screens/chapters/ChaptersScreen.tsx` (`backfilledRef` ~บรรทัด 70; หลัง generate/แก้บท)

ปัญหาที่รู้ตัว: novel ingest หลัง generate ใช้ positional id — แก้/เขียนต่อ "บทกลาง" ทำให้ย่อหน้าบทถัด ๆ ไป id เลื่อน แต่ ingest เดี่ยวไม่ heal. `syncScope` (backfill ส่งทุกย่อหน้าทั้งเรื่อง) heal ได้ ถ้า re-run

- [ ] **Step 1: หลัง generate/insert (และหลัง saveNow) ปลด ref ให้ backfill effect re-sync ทั้งเรื่อง**

```ts
// ท้าย runContinue หลัง memIngestNovel(...) — ปลด gate ให้ effect backfill (syncScope) reconcile ทั้งเรื่อง
//   (ingest เดี่ยวเป็น fast path; sync ตามมา heal positional shift ของบทถัด ๆ ไป)
if (sid) backfilledRef.current.delete(sid);
```

- [ ] **Step 2: ยืนยัน** — `bunx tsc --noEmit` (exit 0); manual: เขียนต่อบทกลาง → effect re-backfill → ย่อหน้าบทถัดไป id ตรง

- [ ] **Step 3: commit**

---

## Task 5: dimension-mismatch guard (Phase 2 §11 ข้อสุดท้าย)

**Files:**
- Modify: `novel/chat-memory.ts` (`vectorSearch` ~บรรทัด 115-123)
- Test: `novel/chat-memory.test.ts`

ปัญหา: ถ้าเปลี่ยน `EMBED_MODEL`/`EMBED_DIM` ภายหลัง เวกเตอร์เก่า/ใหม่คนละมิติ → `cosine` คำนวณบน min-length → คะแนนเพี้ยนเงียบ ๆ

- [ ] **Step 1: เทส** — เวกเตอร์ใน DB มิติต่างจาก query ต้องถูกข้าม (cos=0 / ไม่ถูกจัดอันดับสูง)

```ts
test('vectorSearch: ข้ามแถวที่มิติเวกเตอร์ไม่ตรง query (กัน dim-mismatch เพี้ยนเงียบ)', () => {
  const db = openMemDb(':memory:');
  ingestMemory(db, [
    { id: 's1:0', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 0, ts: 1, text: 'ก', embedding: new Float32Array([1, 0]) },        // มิติ 2 (เก่า)
    { id: 's1:1', scopeId: 's1', kind: 'chat', charId: 'a', secret: false, speaker: 'char', turnIdx: 1, ts: 2, text: 'ข', embedding: new Float32Array([0.9, 0.1, 0]) }, // มิติ 3 (ใหม่)
  ]);
  const hits = vectorSearch(db, { scopeId: 's1', queryVec: new Float32Array([1, 0, 0]), activeChar: 'a', narratorMode: false, excludeFromIdx: 999, limit: 5 });
  expect(hits[0].turnIdx).toBe(1);                 // มิติตรงเท่านั้นได้คะแนน
  expect(hits.find((h) => h.turnIdx === 0)?.cos ?? 0).toBe(0); // มิติไม่ตรง → 0
});
```

- [ ] **Step 2: รันให้ fail**

- [ ] **Step 3: แก้ `vectorSearch`** — เทียบความยาวก่อนคิด cosine

```ts
const hits = rows.map(rowToHit).map((h) => ({
  ...h,
  cos: h.embedding && h.embedding.length === q.queryVec.length ? cosine(q.queryVec, h.embedding) : 0,
}));
```

- [ ] **Step 4: รันให้ผ่าน + commit**

---

## Self-Review (checklist)
- [ ] ทุก task มีโค้ดจริง ไม่มี placeholder
- [ ] `syncScope` ใช้ชื่อฟิลด์/พารามตรงกับ `MemRow` + `ingestMemory` เดิม (kind, charId, secret 0/1, turnIdx, ts, text)
- [ ] backfill response ยังมี `embedConfigured`/`embedError` ให้ `warnEmbed` ฝั่ง client ใช้ได้
- [ ] ingest (เทิร์นใหม่เดี่ยว) ไม่แตะ — ยังเป็น append fast path; sync เป็นตัว heal ตามหลัง
- [ ] dim-guard ไม่กระทบเคสปกติ (มิติเท่ากัน) — cosine เดิมทำงานต่อ

---

## หมายเหตุ Phase 2 ที่จบหลังแผนนี้
หลังทำแผนนี้ ข้อจำกัด Phase 1 ใน design spec §11 จะปิดครบ:
- ✅ narrator recall/ingest (ทำแล้ว)
- ✅ store drift edit/delete → syncScope (Task 1-4)
- ✅ re-embed แถวเดิมเมื่อเปิด EMBED_* ทีหลัง → toEmbed รวมแถว embedding NULL (Task 1-2)
- ✅ dimension mismatch → guard (Task 5)
- ✅ novel RAG (ทำแล้ว)

เหลือเป็น "nice-to-have รอบถัดไป" (นอกสเปกเดิม): ปุ่ม "re-embed session/story" แบบ manual trigger (ตอนนี้ heal อัตโนมัติผ่าน sync ตอนเปิด/แก้แล้ว จึงไม่จำเป็นเร่งด่วน)
