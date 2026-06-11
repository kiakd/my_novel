// mcp-lmstudio.ts — MCP server สำหรับ "ตรวจสอบ" LM Studio + log การเรียก AI ของแอป novel
// อ่านอย่างเดียว (ไม่โหลด/unload โมเดล) — ใช้คู่กับ Claude Code ผ่าน .mcp.json ที่ root repo
// รัน: ถูก spawn อัตโนมัติโดย Claude Code (stdio) · ทดสอบมือ: bun mcp-lmstudio.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const LM_URL = process.env.LMSTUDIO_URL?.replace(/\/v1.*$/, '') ?? 'http://localhost:1234';
const API_URL = process.env.NOVEL_API_URL ?? 'http://localhost:3000';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });

// ประกาศ shape เป็น Record กว้าง ๆ — กัน TS2589 (type instantiation ลึกเกิน) จาก generic ของ server.tool + zod
const benchShape: Record<string, z.ZodTypeAny> = {
  max_tokens: z.number().optional().describe('จำนวน token ที่ให้เจน (default 64)'),
};
const callsShape: Record<string, z.ZodTypeAny> = {
  limit: z.number().optional().describe('จำนวนรายการ (default 15)'),
  provider: z.string().optional().describe("กรอง provider เช่น 'lmstudio' / 'deepseek'"),
  only_errors: z.boolean().optional().describe('เอาเฉพาะที่ error'),
};

const server = new McpServer({ name: 'lmstudio-inspect', version: '1.0.0' });

// ---- สถานะโมเดลทั้งหมดใน LM Studio (โหลดอยู่ไหม, context, quant) ----
server.tool(
  'lm_status',
  'ดูสถานะ LM Studio: โมเดลไหนโหลดอยู่ (state/context/quant) — ใช้เช็คว่าโมเดลพร้อมหรือโดน unload',
  {},
  async () => {
    try {
      const r = await fetch(`${LM_URL}/api/v0/models`, { signal: AbortSignal.timeout(5000) });
      const j: any = await r.json();
      const rows = (j.data ?? []).map((m: any) =>
        `${m.state === 'loaded' ? '🟢' : '⚪'} ${m.id} [${m.type}] state=${m.state}` +
        (m.state === 'loaded' ? ` ctx=${m.loaded_context_length ?? m.max_context_length}` : '') +
        (m.quantization ? ` quant=${m.quantization}` : ''));
      return text(rows.join('\n') || 'ไม่มีโมเดล');
    } catch (e: any) {
      return text(`❌ ต่อ LM Studio ไม่ได้ (${LM_URL}): ${e.message} — เปิดแอป LM Studio + Start Server หรือยัง?`);
    }
  },
);

// หมายเหตุ: สอง tool ล่างลงทะเบียนผ่าน cast — zod v3 + SDK ทำ TS2589 (instantiation ลึกเกิน) ทั้งที่ runtime ถูกต้อง
// (ตรวจ handshake + tools/call แล้ว) ถ้า SDK รุ่นใหม่แก้แล้วค่อยถอด cast ออก
const tool = server.tool.bind(server) as (name: string, desc: string, shape: Record<string, z.ZodTypeAny>, handler: (args: any) => Promise<{ content: { type: 'text'; text: string }[] }>) => void;

// ---- วัดความเร็วเจนจริง (tok/s) ----
tool(
  'lm_bench',
  'ยิงเจนสั้น ๆ วัดความเร็วจริงของโมเดลที่โหลดอยู่ (first-token latency + tok/s)',
  benchShape,
  async ({ max_tokens }: { max_tokens?: number }) => {
    const n = max_tokens ?? 64;
    const t0 = Date.now();
    try {
      const r = await fetch(`${LM_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'นับ 1 ถึง 50 เป็นภาษาไทย' }], max_tokens: n, temperature: 0.1 }),
        signal: AbortSignal.timeout(120_000),
      });
      const j: any = await r.json();
      const ms = Date.now() - t0;
      const u = j.usage ?? {};
      const tps = u.completion_tokens ? (u.completion_tokens / (ms / 1000)).toFixed(1) : '?';
      return text(`โมเดล: ${j.model}\nเวลา: ${(ms / 1000).toFixed(1)}s · prompt=${u.prompt_tokens} out=${u.completion_tokens} → ${tps} tok/s`);
    } catch (e: any) {
      return text(`❌ bench ล้มเหลว: ${e.message}`);
    }
  },
);

// ---- log การเรียก AI ล่าสุดจากแอป novel (ผ่าน /api/logs ของ server.ts) ----
tool(
  'lm_recent_calls',
  'ดู log การเรียก AI ล่าสุดของแอป novel (เวลา/provider/error) — ใช้หาสาเหตุ error หรือดูว่าช้าตรงไหน',
  callsShape,
  async ({ limit, provider, only_errors }: { limit?: number; provider?: string; only_errors?: boolean }) => {
    try {
      const r = await fetch(`${API_URL}/api/logs?limit=${Math.min((limit ?? 15) * 4, 200)}`, { signal: AbortSignal.timeout(8000) });
      let rows: any[] = await r.json();
      if (!Array.isArray(rows)) return text(`❌ /api/logs ตอบผิดรูป: ${JSON.stringify(rows).slice(0, 200)}`);
      if (provider) rows = rows.filter((d) => d.provider === provider);
      if (only_errors) rows = rows.filter((d) => !d.ok);
      rows = rows.slice(0, limit ?? 15);
      if (!rows.length) return text('ไม่มีรายการที่ตรงเงื่อนไข');
      const out = rows.map((d) => {
        const t = new Date(d.ts).toLocaleString('th-TH', { hour12: false });
        return `${d.ok ? '✅' : '❌'} ${t} [${d.endpoint}/${d.provider}] ${(d.ms / 1000).toFixed(0)}s${d.error ? ` → ${String(d.error).slice(0, 140)}` : ''}`;
      });
      return text(out.join('\n'));
    } catch (e: any) {
      return text(`❌ ต่อ novel server ไม่ได้ (${API_URL}): ${e.message} — server.ts รันอยู่หรือเปล่า?`);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
