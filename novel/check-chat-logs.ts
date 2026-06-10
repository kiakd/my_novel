// check-chat-logs.ts — ตรวจสุขภาพ log การแชท (rel/judge/summary/leak/ตัดท้าย)
// ใช้:
//   bun check-chat-logs.ts            → ตรวจครั้งเดียว
//   bun check-chat-logs.ts --watch    → คอยตรวจทุก 60 วิ (รัน background ได้)
//   bun check-chat-logs.ts --watch 30 → ทุก 30 วิ
// env: LOG_API (default http://localhost:3000), N (จำนวน chat ล่าสุดที่ตรวจ default 12)

export {}; // ทำให้เป็น module (กัน tsc เตือน top-level await)
const BASE = process.env.LOG_API ?? 'http://localhost:3000';
const N = Number(process.env.N) || 12;
const args = process.argv.slice(2);
const wi = args.indexOf('--watch');
const watch = wi >= 0;
const interval = watch ? Number(args[wi + 1]) || 60 : 0;

const j = (s: string) => `\x1b[2m${s}\x1b[0m`;
const ok = (s: string) => `\x1b[32m${s}\x1b[0m`;
const bad = (s: string) => `\x1b[31m${s}\x1b[0m`;

async function getLogs(): Promise<any[]> {
  try {
    const r = await fetch(`${BASE}/api/logs?limit=60`);
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}
async function full(id: string): Promise<any | null> {
  try { const f = await (await fetch(`${BASE}/api/logs/${id}`)).json(); return f?.log ?? null; } catch { return null; }
}

const relTags = (s: string) => [...s.matchAll(/\[\[?\s*rel\s*[:=]\s*-?\d{1,3}/gi)].length;
function leaksOf(s: string): string[] {
  const o: string[] = [];
  if (/ผู้เล่นใช้อำนาจ|\bคำสั่ง:\s/.test(s)) o.push('คำสั่งอำนาจ');
  if (/\[กำกับฉาก\]|\[ผู้เล่าเรื่อง/.test(s)) o.push('มาร์กเกอร์');
  if (/=== |guard=|ระดับ = \d/.test(s)) o.push('system');
  if (/as an AI|ในฐานะ ?AI|ภาษาโมเดล|disclaimer/i.test(s)) o.push('AI/disclaimer');
  return o;
}

async function report() {
  const logs = await getLogs();
  if (!logs.length) { console.log(bad(`✗ ต่อ ${BASE}/api/logs ไม่ได้ หรือยังไม่มี log (backend เปิดอยู่ไหม?)`)); return; }
  const chat = logs.filter((l) => l.endpoint === 'chat');
  const gen = logs.filter((l) => l.endpoint === 'generate');
  const img = logs.filter((l) => l.endpoint === 'chat/scene-image');
  const imgErr = img.filter((l) => !l.ok || l.error);
  const recent = chat.slice(0, N);

  let okC = 0, errC = 0, leakC = 0, cutC = 0, tagC = 0;
  const errs: string[] = [], leakList: string[] = [], cutList: string[] = [];
  for (const l of recent) {
    if (!l.ok) { errC++; errs.push((l.error || '').slice(0, 100)); continue; }
    okC++;
    const f = await full(l.id);
    const resp = f?.response || ''; const u = f?.usage || {};
    const ct = u.completion_tokens ?? u.output_tokens; const cap = f?.maxTokens;
    if (relTags(resp)) tagC++;
    const lk = leaksOf(resp); if (lk.length) { leakC++; leakList.push(lk.join(',')); }
    if (typeof ct === 'number' && typeof cap === 'number' && ct >= cap - 2) { cutC++; cutList.push(`${ct}/${cap}`); }
  }

  const judges: string[] = [], summaries: string[] = [];
  for (const l of gen.slice(0, 12)) {
    const f = await full(l.id); const sys = f?.system || ''; const resp = f?.response || '';
    if (sys.includes('ประเมิน')) { const m = resp.match(/-?\d{1,3}/); judges.push(m ? m[0] : '?'); }
    else if (sys.includes('สรุป')) summaries.push(resp.replace(/\s+/g, ' ').slice(0, 60));
  }

  const avgMs = recent.length ? Math.round(recent.reduce((a, l) => a + (l.ms || 0), 0) / recent.length) : 0;
  const providers = [...new Set(recent.map((l) => l.provider))].join(', ');
  const stamp = new Date().toLocaleTimeString('th-TH');

  const probs: string[] = [];
  if (errC) probs.push(`error ${errC} ครั้ง`);
  if (leakC) probs.push(`leak ${leakC} (${[...new Set(leakList)].join('/')})`);
  if (cutC) probs.push(`โดนตัดท้าย ${cutC} (${cutList.join(',')})`);

  console.log('\n' + j(`──── ตรวจ chat log · ${stamp} · ${BASE} ────`));
  console.log(`chat: ${chat.length} (ตรวจ ${recent.length}) · provider: ${providers} · เฉลี่ย ${avgMs}ms`);
  console.log(`ok ${okC}/${recent.length} · แท็ก rel inline ${tagC} (ปกติ 0 — ใช้ judge แทน)`);
  console.log(`judge ล่าสุด: ${judges.slice(0, 8).join(' → ') || '—'}`);
  console.log(`summary: ${summaries.length ? ok(`มี (${summaries[0]}…)`) : j('ยังไม่ถูกสรุป (แชทยังสั้น)')}`);
  console.log(`เจนรูป: ${img.length} ครั้ง${imgErr.length ? bad(` · error ${imgErr.length}: ${(imgErr[0].error || '').slice(0, 80)}`) : img.length ? ok(' · ok') : j(' · ยังไม่เคยวาด')}`);
  if (probs.length) {
    console.log(bad('⚠ พบ: ') + probs.join(' · '));
    errs.slice(0, 4).forEach((e) => console.log(bad('   ✗ ') + e));
  } else {
    console.log(ok('✓ สุขภาพดี — ไม่มี leak / ไม่โดนตัด / ไม่มี error'));
  }
}

if (watch) {
  console.log(j(`เริ่มเฝ้า chat log ทุก ${interval} วิ (Ctrl+C เพื่อหยุด)`));
  for (;;) { await report(); await Bun.sleep(interval * 1000); }
} else {
  await report();
}
