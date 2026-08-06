// Proxy SSE จาก backend โดยตรง (เลี่ยง Next rewrite ที่อาจ buffer stream)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND = process.env.BACKEND_URL ?? 'http://novel:3000';

export async function POST(req: Request) {
  const upstream = await fetch(`${BACKEND}/api/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: await req.text(),
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    return new Response(detail || `upstream ${upstream.status}`, { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
