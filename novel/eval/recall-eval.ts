// recall-eval.ts — วัดคุณภาพ RAG recall ด้วย "golden needle set" (hit@k / MRR)
// รัน:  bun run eval/recall-eval.ts [path/to/needles.json] [k]
//   - ไม่ใส่ไฟล์ → ใช้ eval/needles-demo.json (ชุดสาธิต)
//   - k default = 4 (วัด hit@4)
// เทียบ 4 สูตร: weighted/rrf × importance off/on — และทำทั้ง FTS-only + hybrid (ถ้าตั้ง EMBED_* ไว้)
// เป้า: ตัดสิน "RRF ดีกว่า weighted ไหม / importance ช่วยจริงไหม" ด้วยตัวเลข ไม่ใช่ความรู้สึก
//
// ⚠️ ชุด demo เป็น synthetic — ค่าที่ได้ใช้ดู "กลไกทำงานถูก" เท่านั้น. ผลที่เชื่อถือได้ต้องใช้แชทจริงของคุณ
import { readFileSync } from 'fs';
import { openMemDb, ingestMemory, recall, type MemRow, type RecallQuery } from '../chat-memory';
import { embedTexts, embedOne, embedConfigured } from '../embed';

interface Needle { query: string; expectTurn: number; note?: string; typo?: boolean }
interface NeedleSet {
  scope: string; activeChar: string;
  transcript: { turnIdx: number; speaker: string; text: string; importance?: number; persistent?: boolean }[];
  needles: Needle[];
}

const file = process.argv[2] ?? `${import.meta.dir}/needles-demo.json`;
const K = Number(process.argv[3] ?? 4);
const set = JSON.parse(readFileSync(file, 'utf8')) as NeedleSet;

console.log(`\n📐 recall-eval — ${file}`);
console.log(`   scope=${set.scope} · turns=${set.transcript.length} · needles=${set.needles.length} · k=${K}`);

// ---- เตรียม rows (พร้อม importance/persistent) ----
const toRows = (embeddings?: (Float32Array | null)[]): MemRow[] =>
  set.transcript.map((t, i) => ({
    id: `${set.scope}:${t.turnIdx}`, scopeId: set.scope, kind: 'chat',
    charId: t.speaker === 'narrator' ? null : set.activeChar, secret: false,
    speaker: t.speaker, turnIdx: t.turnIdx, ts: t.turnIdx, text: t.text,
    importance: t.importance ?? 0, persistent: !!t.persistent,
    embedding: embeddings ? embeddings[i] : null,
  }));

// ---- เมตริก ----
interface Metrics { hitAtK: number; mrr: number; typoHitAtK: number; typoN: number; n: number }
function evalConfig(db: ReturnType<typeof openMemDb>, queryVecs: Map<string, Float32Array | null>, opts: Pick<RecallQuery, 'fusion' | 'wImp' | 'wPersist'>): Metrics {
  let hits = 0, mrrSum = 0, typoHits = 0, typoN = 0;
  for (const nd of set.needles) {
    const qv = queryVecs.get(nd.query) ?? null;
    const res = recall(db, {
      scopeId: set.scope, query: nd.query, queryVec: qv, activeChar: set.activeChar,
      narratorMode: false, excludeFromIdx: 9999, k: K,
      wFts: qv ? 0.35 : 1, wVec: qv ? 0.65 : 0, wRecency: 0.12,
      wImp: opts.wImp, wPersist: opts.wPersist, fusion: opts.fusion,
    });
    const rank = res.findIndex((h) => h.turnIdx === nd.expectTurn); // -1 = ไม่ติด top-K
    const found = rank >= 0;
    if (found) { hits++; mrrSum += 1 / (rank + 1); }
    if (nd.typo) { typoN++; if (found) typoHits++; }
  }
  const n = set.needles.length;
  return { hitAtK: hits / n, mrr: mrrSum / n, typoHitAtK: typoN ? typoHits / typoN : NaN, typoN, n };
}

const pct = (x: number) => (Number.isNaN(x) ? '  - ' : `${(x * 100).toFixed(0)}%`.padStart(4));
const num = (x: number) => x.toFixed(3);

function runSuite(label: string, db: ReturnType<typeof openMemDb>, queryVecs: Map<string, Float32Array | null>) {
  console.log(`\n── ${label} ───────────────────────────────`);
  console.log(`  สูตร                 hit@${K}  MRR    typo-hit@${K}`);
  const configs: { name: string; o: Pick<RecallQuery, 'fusion' | 'wImp' | 'wPersist'> }[] = [
    { name: 'weighted          ', o: { fusion: 'weighted', wImp: 0, wPersist: 0 } },
    { name: 'weighted + import ', o: { fusion: 'weighted', wImp: 0.15, wPersist: 0.1 } },
    { name: 'rrf               ', o: { fusion: 'rrf', wImp: 0, wPersist: 0 } },
    { name: 'rrf + importance  ', o: { fusion: 'rrf', wImp: 0.15, wPersist: 0.1 } },
  ];
  for (const c of configs) {
    const m = evalConfig(db, queryVecs, c.o);
    console.log(`  ${c.name}  ${pct(m.hitAtK)}  ${num(m.mrr)}  ${pct(m.typoHitAtK)}`);
  }
}

// ===== FTS-only =====
{
  const db = openMemDb(':memory:');
  ingestMemory(db, toRows());
  const emptyVecs = new Map<string, Float32Array | null>(set.needles.map((n) => [n.query, null]));
  runSuite('FTS-only (ไม่มี embedding)', db, emptyVecs);
}

// ===== Hybrid (ถ้าตั้ง EMBED_* ไว้) =====
if (embedConfigured()) {
  console.log('\n🔌 embedding ตั้งค่าไว้ → กำลัง embed transcript + queries…');
  const docVecs = await embedTexts(set.transcript.map((t) => t.text));
  const queryVecs = new Map<string, Float32Array | null>();
  for (const nd of set.needles) queryVecs.set(nd.query, await embedOne(nd.query));
  if (!docVecs || docVecs.some((v) => v == null)) {
    console.log('   ⚠️ embed ล้มเหลว (ดู EMBED_* / โควต้า provider) — ข้าม hybrid');
  } else {
    const db = openMemDb(':memory:');
    ingestMemory(db, toRows(docVecs));
    runSuite('Hybrid (FTS + vector)', db, queryVecs);
  }
} else {
  console.log('\nℹ️ ยังไม่ได้ตั้ง EMBED_* → ข้าม hybrid (รันเฉพาะ FTS-only). ตั้ง EMBED_API_BASE/EMBED_API_KEY/EMBED_MODEL เพื่อวัด semantic/typo');
}

console.log('\n💡 อ่านผล: hit@k สูง=ดึงเข็มเจอใน top-k · MRR สูง=อันดับดี · typo-hit เด่นเฉพาะ hybrid (จุดแข็ง embedding)\n');
