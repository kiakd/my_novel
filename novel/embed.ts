// embedding client แบบ pluggable (OpenAI-compatible /embeddings) — env-driven, degrade ได้
export function embedConfigured(): boolean {
  return !!process.env.EMBED_URL && !!process.env.EMBED_API_KEY;
}

const DIM = () => Number(process.env.EMBED_DIM ?? 512);

// แยก "ตั้งค่าแล้วแต่ยิงพลาด" (key ผิด/429/บัญชีโดนแบน R18/เน็ตล่ม) ออกจาก "ไม่ได้ตั้งค่า"
// ทั้งคู่ degrade เป็น FTS-only เหมือนกัน แต่ caller/สถานะควรรู้ความต่างเพื่อเตือน user
let _lastError: string | null = null;
let _lastErrorAt = 0;
/** ข้อความ error ครั้งล่าสุดของ embedding (null = ยังไม่เคยพลาด/ยิงสำเร็จล่าสุด) */
export function lastEmbedError(): { error: string; at: number } | null {
  return _lastError ? { error: _lastError, at: _lastErrorAt } : null;
}
function noteError(msg: string) {
  _lastError = msg;
  _lastErrorAt = Date.now();
  // log ดิบ — ให้เห็นใน console/JSONL ของ server (ใช้ console เพื่อเลี่ยง circular import กับ logger)
  console.warn(`[embed] degrade → FTS-only: ${msg}`);
}

/** คืน Float32Array[] หรือ null ถ้าไม่ได้ตั้งค่า/เรียกพลาด (caller degrade เป็น FTS-only) */
export async function embedTexts(texts: string[]): Promise<Float32Array[] | null> {
  if (!embedConfigured() || texts.length === 0) return null;
  try {
    const res = await fetch(process.env.EMBED_URL!, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.EMBED_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.EMBED_MODEL ?? 'text-embedding-3-small',
        input: texts,
        dimensions: DIM(),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      noteError(`HTTP ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 200)}` : ''}`);
      return null;
    }
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    if (!json.data?.length) { noteError('response มี data ว่าง'); return null; }
    _lastError = null; // ยิงสำเร็จ → เคลียร์สถานะ error
    return json.data.map((d) => Float32Array.from(d.embedding));
  } catch (e: any) { noteError(e?.message ?? String(e)); return null; }
}

/** embed ข้อความเดียว (สำหรับ query) — คืน null ถ้า degrade */
export async function embedOne(text: string): Promise<Float32Array | null> {
  const r = await embedTexts([text]);
  return r ? r[0] : null;
}
