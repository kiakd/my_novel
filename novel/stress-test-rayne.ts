// stress-test-rayne.ts — รัน RP จริง 50 เทิร์น × 2 โมเดล (DeepSeek + Gemma E4B) กับ "เรย์น"
// จำลอง ChatScreen เป๊ะ: auto-player ขับฉากตามเฟส · summary folding · live-state delta · judge rel · player persona · lexNudge
// เซฟเป็น chat_session จริง (อ่านในแอปได้) + รายงาน review/rayne-stress-<provider>.md
// รัน: cd novel && bun stress-test-rayne.ts
import { assembleChatPrompt, buildPersonaReminder, type ChatCharLite, type PlayerPersonaLite } from './chat-prompt';
import { renderStateCard, parseStateDelta, applyDelta, checkContradiction, type StateCard } from './state-card';
import { getDb } from './db';

const KEY = process.env.DEEPSEEK_API_KEY!;
const DS_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
const LM_URL = process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1/chat/completions';
const LM_MODEL = 'gemma-4-e4b-it-uncensored';
const TURNS = 50;

async function callDS(system: string, msgs: any[], max = 700, temp = 0.9) {
  const body: any = { model: DS_MODEL, messages: [{ role: 'system', content: system }, ...msgs], temperature: temp, max_tokens: max };
  if (DS_MODEL.includes('v4')) body.thinking = { type: 'disabled' };
  const r = await fetch('https://api.deepseek.com/beta/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error('ds ' + r.status + ': ' + JSON.stringify(j).slice(0, 120)); return j.choices?.[0]?.message?.content ?? '';
}
async function callLM(system: string, msgs: any[], max = 900, temp = 0.9) {
  const r = await fetch(LM_URL, { method: 'POST', headers: { Authorization: 'Bearer lm-studio', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: LM_MODEL, messages: [{ role: 'system', content: system }, ...msgs], temperature: temp, max_tokens: max }) });
  const j = await r.json(); if (!r.ok) throw new Error('lm ' + r.status); return j.choices?.[0]?.message?.content ?? '';
}

// ===== เฟสโครงเรื่อง (auto-player ขับตามนี้) =====
const ARC = [
  { until: 8, goal: 'พบเรย์นครั้งแรกที่กรงหลังเวที สำรวจ/ซักถาม/ทดสอบนิสัยนาง ยังไม่ตัดสินใจซื้อ ระวังเรื่องแม่ (มาเรียน) สังเกตปลอกคอรูน อาจลองสั่งปลอกคอเบา ๆ ดูปฏิกิริยา' },
  { until: 16, goal: 'เจรจากับมาดามเวสเปอร์เพื่อซื้อทั้งคู่แม่ลูก จ่ายราคา และเริ่มตัดสินใจว่าจะปฏิบัติกับเรย์น+แม่อย่างไร (ดี/ใช้อำนาจ)' },
  { until: 26, goal: 'พากลับคฤหาสน์ดยุค ให้อิสระเล็ก ๆ (ถอดโซ่ จัดเนื้อย่างให้ ห้องให้แม่) เริ่มสร้างความไว้ใจช้า ๆ คุยเรื่องอดีต/เผ่าของนาง' },
  { until: 36, goal: 'มีปม: เล่าข่าวว่าพบคนเผ่าหมาป่าที่รอดชีวิต (สิ่งที่นางโหยหา) หรือมีขุนนาง/ภัยคุกคามจ้องตัวแม่ ทดสอบอารมณ์หลากหลายและความไว้ใจที่โตขึ้น' },
  { until: 44, goal: 'ความสัมพันธ์ใกล้ชิดขึ้นจนถึงขั้นโรแมนติก/เนื้อตัว (ด้วยความยินยอมเมื่อสนิทพอ) เข้าฉากใกล้ชิด/R18 ทดสอบว่าเรย์นคงคาแรกเตอร์ปากร้าย เขินเป็นหงุดหงิด หางทรยศ' },
  { until: 50, goal: 'ปมคลี่คลาย: ดยุคเสนอปลดปล่อย/ถอดปลอกคอ หรือช่วยตามหาคนเผ่า อ้างอิงเหตุการณ์ต้นเรื่อง (แม่ชื่อมาเรียน หมู่บ้านถูกเขี้ยวเหล็กเผา พ่อตาย) ทดสอบความต่อเนื่อง 50 เทิร์น' },
];
const phaseGoal = (n: number) => (ARC.find((p) => n <= p.until) ?? ARC[ARC.length - 1]).goal;

const PLAYER: PlayerPersonaLite = { name: 'ดยุคเอเดรียน', role: 'ดยุคหนุ่ม มือขวาของราชา แขก VIP ของหอประมูล ถือเหรียญสัญญาที่สั่งปลอกคอทาสได้', appearance: 'ชายหนุ่มสูงโปร่ง ผมดำสยายประบ่า ดวงตาสีเทาเย็น สวมสูทผ้าไหมสีเข้มปักดิ้นเงิน ท่าทางสุขุมมีอำนาจ' };

const AUTOPLAYER_SYS =
  'คุณสวมบทเป็น "ผู้เล่น" คือ ' + PLAYER.name + ' (' + PLAYER.role + ') ในเกมโรลเพลย์ดาร์กแฟนตาซี. ' +
  'หน้าที่: เขียน "ข้อความเทิร์นต่อไปของดยุค" เพื่อขับเรื่องไปข้างหน้าตามเป้าหมายฉากที่กำหนด — สมจริง มีมิติ ไม่ใจร้ายไร้เหตุผล แต่ก็เป็นดยุคที่มีอำนาจ. ' +
  'เขียนสั้น 1-2 ย่อหน้า: การกระทำ/บรรยายใส่ *...* คำพูดใส่ "...". ' +
  '⚠️ เขียนเฉพาะฝั่งดยุคเท่านั้น ห้ามเล่นบท/พูดแทนเรย์นหรือ NPC อื่น ห้ามใส่แท็กใด ๆ ตอบเป็นข้อความ RP ล้วน ๆ ภาษาไทย';

const R18_KW = ['จูบ', 'เปลือย', 'ถอด', 'เตียง', 'คร่อม', 'สอด', 'เสียว', 'ครวญ', 'หน้าอก', 'หัวนม', 'ก้น', 'ควย', 'หี', 'แตก', 'เงี่ยน', 'ลูบ', 'ไล้', 'กอด', 'หว่างขา', 'จิ๋ม'];
const RAW_TH = ['ควย', 'หัวควย', 'หี', 'หัวนม', 'นม', 'ตูด', 'ก้น', 'เม็ดแตด', 'น้ำเงี่ยน', 'จิ๋ม', 'แตก', 'เสร็จ', 'ครวญ', 'เย็ด'];
const EVASIVE = ['จุดซ่อนเร้น', 'ของลับ', 'แก่นกาย', 'ส่วนนั้น', 'ตรงนั้น', 'ความร้อน', 'จุดศูนย์กลาง', 'เติมเต็ม', 'ระหว่างขา'];
const looksExplicit = (s: string) => { const l = s.toLowerCase(); return R18_KW.some((k) => l.includes(k)); };
const hits = (t: string, ws: string[]) => ws.filter((w) => t.toLowerCase().includes(w.toLowerCase()));
const LEX_NUDGE = '\n\n[ระบบ R18: ฉากนี้ถึงจุดสัมผัส/ออรัล/สอดใส่ — เรียกอวัยวะด้วยคำดิบทันที (ชาย: ควย/หัวควย · หญิง: หี/เม็ดแตด · หัวนม/นม/ตูด · เสร็จ: แตก/น้ำเงี่ยน) ห้ามเลี่ยงเป็น ความร้อน/ตรงนั้น/ส่วนนั้น/เติมเต็ม/แก่นกาย/ระหว่างขา แม้ตัวละครจะฝืนใจ]';
const NUDGE = '\n\n[ระบบ: ปิดท้ายคำตอบนี้ด้วยบรรทัด [[state: ...]] เสมอ — สรุปเฉพาะที่เปลี่ยน หรือ [[state: none]]]';

const JUDGE_SYS = 'คุณเป็นผู้ประเมินระดับความสัมพันธ์ของตัวละครต่อผู้เล่น สเกล -100..100 ขยับจากค่าเดิมทีละน้อย (ปกติ -8..+8) ห้ามกระโดด ตอบ JSON บรรทัดเดียว {"rel": <ตัวเลข>}';

const SUMMARY_SYS = 'สรุปบทสนทนาโรลเพลย์เป็น "ความทรงจำ" ของตัวละครให้ครบแม่น (ชื่อคน/สถานที่/ของ/สิ่งที่ตกลง/สถานะล่าสุด/พัฒนาการสัมพันธ์/ปมค้าง) ภาษาไทยมุมบุคคลที่สาม ตามลำดับเวลา ห้ามเกิน 1200 ตัวอักษร ปิดท้ายด้วย "สถานะปัจจุบัน:"';

interface Turn { n: number; phase: number; player: string; reply: string; relB: number; relA: number; tag: boolean; fields: string[]; warns: string[]; raw: string[]; evasive: string[]; len: number }

async function runSession(label: string, isLM: boolean, char: ChatCharLite, greeting: string, charId: string) {
  const call = (s: string, m: any[], max?: number, t?: number) => isLM ? callLM(s, m, max ?? 900, t) : callDS(s, m, max ?? 700, t);
  const RAW_KEEP = isLM ? 8 : 14, FOLD_TRIGGER = isLM ? 16 : 24, rawBudget = isLM ? 6000 : 12000;
  let rel = -10;
  let live: StateCard = { identity: { realName: 'เรย์น', form: 'สาวหมาป่าหูเทาหางฟู', disguised: false, gender: 'หญิง' }, location: 'หอประมูลตลาดมืด หอคอยนกฮูก (กรงหลังเวที)', outfit: 'เชิ้ตลินินขาว+กั๊กหนังดำ+กางเกงหนังดำ+ปลอกคอรูน', rel };
  // ประวัติเต็ม (สำหรับเซฟ session) + ประวัติ raw สำหรับ context
  const msgs: any[] = [{ role: 'char', text: greeting, ts: Date.now() }];
  const convo: { role: 'user' | 'assistant'; content: string }[] = [{ role: 'assistant', content: greeting }];
  let summary = '', summarized = 0;
  const log: Turn[] = [];

  for (let i = 1; i <= TURNS; i++) {
    const phase = ARC.findIndex((p) => i <= p.until) + 1;
    // ---- auto-player (DeepSeek เสมอ เพื่อความสม่ำเสมอ) ----
    const recent = convo.slice(-6).map((m) => (m.role === 'user' ? 'ดยุค: ' : 'เรย์น: ') + m.content).join('\n');
    let player = '';
    try {
      player = (await callDS(AUTOPLAYER_SYS, [{ role: 'user', content: 'เป้าหมายฉากตอนนี้ (เฟส ' + phase + '): ' + phaseGoal(i) + '\n\nบทสนทนาล่าสุด:\n' + recent + '\n\nเขียนข้อความเทิร์นต่อไปของดยุค (สั้น 1-2 ย่อหน้า):' }], 260, 1.0)).trim();
    } catch (e: any) { player = '*ดยุคเงยมองนาง* "เล่าเรื่องของเจ้าให้ข้าฟังอีกหน่อยสิ"'; }

    // ---- summary folding ----
    const rawConv = convo.slice(summarized);
    const totalLen = rawConv.reduce((n, m) => n + m.content.length, 0);
    if (rawConv.length > FOLD_TRIGGER || totalLen > rawBudget) {
      const keep = Math.max(2, Math.min(RAW_KEEP, rawConv.length));
      const foldN = rawConv.length - keep;
      if (foldN > 0) {
        const transcript = rawConv.slice(0, foldN).map((m) => (m.role === 'user' ? 'ดยุค: ' : 'เรย์น: ') + m.content).join('\n');
        try {
          const sm = (await call(SUMMARY_SYS, [{ role: 'user', content: (summary ? '[สรุปเดิม]\n' + summary + '\n\n' : '') + '[ช่วงใหม่]\n' + transcript + '\n\nรวมเป็นสรุปเดียวต่อเนื่องกระชับ' }], 700, 0.3)).trim();
          if (sm) { summary = sm; summarized += foldN; }
        } catch {}
      }
    }
    const histRaw = convo.slice(summarized);

    // ---- char reply ----
    live.rel = rel;
    const compact = isLM;
    const sys = assembleChatPrompt(char, rel, summary || undefined, compact, undefined, renderStateCard(live), true, PLAYER);
    const reminder = buildPersonaReminder(char, rel, 'char', true, PLAYER);
    const lex = looksExplicit(player + ' ' + (convo.slice(-1)[0]?.content ?? '')) ? LEX_NUDGE : '';
    const userMsg = reminder + '\n\n' + player + lex + NUDGE;
    let replyRaw = '';
    try { replyRaw = await call(sys, [...histRaw, { role: 'user', content: userMsg }], isLM ? 1100 : 800); }
    catch (e: any) { console.log(label + ' เทิร์น ' + i + ' ERR: ' + e.message); break; }
    const { delta, cleaned } = parseStateDelta(replyRaw);
    const reply = cleaned.replace(/\[\[\s*rel[\s\S]*?\]\]/gi, '').trim();

    const fields: string[] = [];
    let warns: string[] = [];
    if (delta) {
      if (delta.set.time) fields.push('time=' + delta.set.time);
      if (delta.set.location) fields.push('loc=' + delta.set.location);
      if (delta.set.outfit) fields.push('outfit=' + delta.set.outfit);
      if (delta.set.identity) fields.push('id=' + JSON.stringify(delta.set.identity));
      [...delta.add.conditions.map((x) => '+cond=' + x), ...delta.remove.conditions.map((x) => '-cond=' + x), ...delta.add.inventory.map((x) => '+inv=' + x), ...delta.remove.inventory.map((x) => '-inv=' + x), ...delta.add.facts.map((x) => '+fact=' + x)].forEach((f) => fields.push(f));
      const next = applyDelta(live, delta); warns = checkContradiction(live, next, delta); live = next;
    }
    // ---- judge rel ----
    const relB = rel;
    try {
      const ju = 'ตัวละคร: เรย์น\nนิสัย: ' + char.mindset + '\nชอบ: ' + char.likes + '\nไม่ชอบ: ' + char.dislikes + '\nrel เดิม: ' + rel + '\nผู้เล่นพูด: ' + player + '\nเรย์นตอบ: ' + reply + '\n\nให้ rel ใหม่ JSON {"rel":NN}';
      const jt = await call(JUDGE_SYS, [{ role: 'user', content: ju }], 30, 0.2);
      const m = jt.match(/-?\d{1,3}/); if (m) rel = Math.max(-100, Math.min(100, Number(m[0])));
    } catch {}
    if (relB >= 90) rel = Math.max(rel, 90);

    const now = Date.now() + i;
    msgs.push({ role: 'user', text: player, ts: now }, { role: 'char', text: reply, ts: now + 1 });
    convo.push({ role: 'user', content: player }, { role: 'assistant', content: reply });
    log.push({ n: i, phase, player, reply, relB, relA: rel, tag: !!delta, fields, warns, raw: hits(reply, RAW_TH), evasive: hits(reply, EVASIVE), len: reply.length });
    process.stdout.write(label + ' [' + i + '/' + TURNS + '] rel ' + relB + '→' + rel + ' tag=' + (delta ? 'Y' : 'N') + ' len=' + reply.length + ' warn=' + warns.length + '\n');
  }

  // ===== เซฟ session จริงเข้า DB =====
  const sessionId = 'sess-stress-' + (isLM ? 'gemma' : 'deepseek') + '-rayne';
  const db = await getDb();
  const session = {
    id: sessionId, charId, char: { ...(char as any), id: charId }, title: '🧪 Stress ' + label + ' · เรย์น 50 เทิร์น',
    messages: msgs, rel, summary, summarizedCount: summarized,
    liveState: { ...live }, playerPersona: { id: 'pp-duke', ...PLAYER },
    createdAt: Date.now(), updatedAt: Date.now(),
  };
  await db.collection('chat_sessions').updateOne({ _id: sessionId as any }, { $set: { session, rev: 0, updatedAt: new Date() } }, { upsert: true });

  // ===== รายงาน =====
  const tagRate = Math.round(log.filter((t) => t.tag).length / log.length * 100);
  const r18 = log.filter((t) => t.raw.length || t.evasive.length);
  const rawTurns = log.filter((t) => t.raw.length).length;
  const evaTurns = log.filter((t) => t.evasive.length).length;
  const contra = log.reduce((n, t) => n + t.warns.length, 0);
  const avgLen = Math.round(log.reduce((n, t) => n + t.len, 0) / log.length);
  const minLen = Math.min(...log.map((t) => t.len)), maxLen = Math.max(...log.map((t) => t.len));
  let md = '# Stress Test — เรย์น × ' + label + ' (' + TURNS + ' เทิร์น)\n\n';
  md += '- state tag: **' + tagRate + '%** · contradiction รวม: **' + contra + '** · ความยาวเฉลี่ย: ' + avgLen + ' (min ' + minLen + ', max ' + maxLen + ')\n';
  md += '- ฉาก R18: ' + r18.length + ' เทิร์น · ใช้คำตรง ' + rawTurns + ' · หลุดคำเลี่ยง ' + evaTurns + '\n';
  md += '- rel: ' + log.map((t) => t.relA).join('→') + '\n';
  md += '- contradiction ที่เจอ: ' + (log.flatMap((t) => t.warns).join(' | ') || 'ไม่มี') + '\n\n';
  md += '## บทสนทนาเต็ม\n\n**[เปิด] เรย์น:** ' + greeting + '\n\n';
  for (const t of log) md += '**[' + t.n + ' · เฟส' + t.phase + '] ดยุค:** ' + t.player + '\n\n**เรย์น (rel ' + t.relA + (t.tag ? '' : ' ⚠️ไม่มีtag') + (t.warns.length ? ' ⚠️' + t.warns.join(';') : '') + '):** ' + t.reply + '\n\n---\n\n';
  await Bun.write('../review/rayne-stress-' + (isLM ? 'gemma' : 'deepseek') + '.md', md);

  return { label, tagRate, contra, avgLen, minLen, maxLen, r18: r18.length, rawTurns, evaTurns, relPath: log.map((t) => t.relA), warnsList: log.flatMap((t) => t.warns), sessionId };
}

// ===== main =====
const db = await getDb();
const doc: any = await db.collection('workspace').findOne({ _id: 'chat' as any });
const c: any = (doc.state.chars ?? []).find((x: any) => x.id === 'slave-rayne');
const char: ChatCharLite = { name: c.name, appearance: c.appearance, outfit: c.outfit, description: c.description, mindset: c.mindset, behavior: c.behavior, pronounSelf: c.pronounSelf, pronounOther: c.pronounOther, speechTone: c.speechTone, voiceExamples: c.voiceExamples, scenario: c.scenario, likes: c.likes, dislikes: c.dislikes, guard: c.guard, power: c.power, powerStanding: c.powerStanding };

console.log('===== เริ่ม DeepSeek 50 เทิร์น =====');
const ds = await runSession('DeepSeek', false, char, c.greeting, c.id);
console.log('\n===== เริ่ม Gemma E4B 50 เทิร์น =====');
const gm = await runSession('Gemma-E4B', true, char, c.greeting, c.id);

console.log('\n\n========== สรุปเทียบ ==========');
for (const r of [ds, gm]) {
  console.log('\n### ' + r.label);
  console.log('  state tag: ' + r.tagRate + '% · contradiction: ' + r.contra + ' · len avg/min/max: ' + r.avgLen + '/' + r.minLen + '/' + r.maxLen);
  console.log('  R18 เทิร์น: ' + r.r18 + ' · คำตรง: ' + r.rawTurns + ' · คำเลี่ยง: ' + r.evaTurns);
  console.log('  rel สุดท้าย: ' + r.relPath[r.relPath.length - 1] + ' (เริ่ม -10)');
  console.log('  contradiction: ' + (r.warnsList.slice(0, 8).join(' | ') || 'ไม่มี'));
  console.log('  session: ' + r.sessionId);
}
console.log('\nรายงานเต็ม: review/rayne-stress-deepseek.md + review/rayne-stress-gemma.md');
process.exit(0);
