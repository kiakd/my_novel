// embedding client แบบ pluggable (OpenAI-compatible /embeddings) — env-driven, degrade ได้
export function embedConfigured(): boolean {
  return !!process.env.EMBED_URL && !!process.env.EMBED_API_KEY;
}

const DIM = () => Number(process.env.EMBED_DIM ?? 512);

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
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    if (!json.data?.length) return null;
    return json.data.map((d) => Float32Array.from(d.embedding));
  } catch { return null; }
}

/** embed ข้อความเดียว (สำหรับ query) — คืน null ถ้า degrade */
export async function embedOne(text: string): Promise<Float32Array | null> {
  const r = await embedTexts([text]);
  return r ? r[0] : null;
}
