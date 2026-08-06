// prose-format.ts — post-process รวมบล็อก *...* ที่โมเดลหั่นทีละบรรทัด (mirror ของ novel/prose-format.ts)

/** รวมบล็อก *...* ที่ติดกันให้เป็นย่อหน้าเดียว — ไม่ยุ่งบทพูด/header/ความคิดในใจ/state */
export function mergeFragmentedProse(text: string): string {
  if (!text || !text.includes('*')) return text;

  const adj = /\*([^*\n][^*]*?)\*\s*(?:\n\s*)+\*([^*\n][^*]*?)\*/g;

  let prev = '';
  let cur = text;
  let guard = 0;
  while (cur !== prev && guard++ < 200) {
    prev = cur;
    cur = cur.replace(adj, (_m, a: string, b: string) => {
      const left = a.replace(/\s+/g, ' ').trim();
      const right = b.replace(/\s+/g, ' ').trim();
      if (!left || !right) return `*${left || right}*`;
      return `*${left} ${right}*`;
    });
  }

  return cur.replace(/\n{3,}/g, '\n\n');
}
