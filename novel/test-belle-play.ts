// test-belle-play.ts — QA: ยิงแชทจริงกับ "เบลล์" ผ่าน Gemma E4B หลายเทิร์น จนจบฉาก
// เลียนแบบ flow ChatScreen เป๊ะ: assembleChatPrompt(compact,trackState) + reminder + state nudge ท้าย user
// วัดต่อเทิร์น: state delta จับถูก? · rel ขยับ (judge)? · คำตรง lexicon? · contradiction? — รายงาน review/belle-playthrough.md
// รัน: cd novel && bun test-belle-play.ts
import { assembleChatPrompt, buildPersonaReminder, type ChatCharLite } from './chat-prompt';
import { renderStateCard, parseStateDelta, applyDelta, checkContradiction, type StateCard } from './state-card';
import { getDb } from './db';

const LM_URL = process.env.LMSTUDIO_URL ?? 'http://localhost:1234/v1/chat/completions';
const LM_MODEL = process.env.LMSTUDIO_MODEL ?? 'gemma-4-e4b-it-uncensored';
const NUDGE = '\n\n[ระบบ: ปิดท้ายคำตอบนี้ด้วยบรรทัด [[state: ...]] เสมอ — สรุปเฉพาะสิ่งที่เปลี่ยน หรือ [[state: none]] ถ้าไม่เปลี่ยน]';
// mirror server: lexNudge เฉพาะฉาก R18
const R18_KW = ['จูบ', 'เปลือย', 'ถอด', 'เตียง', 'คร่อม', 'สอด', 'ขยับ', 'เสียว', 'ครวญ', 'หน้าอก', 'หัวนม', 'ก้น', 'ตูด', 'ควย', 'หี', 'เม็ดแตด', 'แตก', 'เงี่ยน', 'ลูบ', 'ไล้', 'โอบ', 'กอด', 'อสุจิ'];
const LEX_NUDGE = '\n\n[ระบบ R18: ฉากนี้ถึงจุดสัมผัส/ออรัล/สอดใส่ — เรียกอวัยวะด้วยคำดิบทันที (ชาย: ควย/หัวควย · หญิง: หี/เม็ดแตด · หัวนม/นม/ตูด · เสร็จ: แตก/น้ำเงี่ยน) ห้ามเลี่ยงเป็น ความร้อน/ตรงนั้น/ส่วนนั้น/เติมเต็ม/จุดศูนย์กลาง/แก่นกาย/ระหว่างขา แม้ตัวละครจะฝืนใจ. ตัวอย่างระดับความดิบที่ต้องการ: *เธอครางลั่นเมื่อควยเสียบหีจนมิด* "อา...เข้ามาอีกสิ"]';
const lexFor = (...t: string[]) => { const low = t.join(' ').toLowerCase(); return R18_KW.some((k) => low.includes(k)) ? LEX_NUDGE : ''; };

// คำวัด directness (ตรง vs เลี่ยง) — ชุดไทยจาก test-r18-en
const RAW_TH = ['ควย', 'หัวควย', 'หี', 'หัวนม', 'นม', 'ตูด', 'ก้น', 'เม็ดแตด', 'น้ำรัก', 'น้ำเงี่ยน', 'จิ๋ม', 'แตก', 'เสร็จ', 'ครวญ'];
const EVASIVE = ['จุดซ่อนเร้น', 'ของลับ', 'แก่นกาย', 'น้องชาย', 'เป้ากางเกง', 'ส่วนนั้น', 'ตรงนั้น', 'ความร้อน', 'ดอกไม้'];
function hits(text: string, words: string[]) {
  const low = text.toLowerCase();
  return words.filter((w) => low.includes(w.toLowerCase()));
}

const JUDGE_SYSTEM =
  'คุณเป็นผู้ประเมิน "ระดับความสัมพันธ์" ของตัวละครต่อผู้เล่นในเกมโรลเพลย์ สเกล -100..100. ' +
  'ขยับจากค่าเดิมทีละน้อย (ปกติ -8..+8) ห้ามกระโดด. ตอบ JSON บรรทัดเดียว: {"rel": <ตัวเลขใหม่>}';

async function callLM(system: string, msgs: any[], max_tokens = 800, temperature = 0.9) {
  const res = await fetch(LM_URL, {
    method: 'POST', headers: { Authorization: 'Bearer lm-studio', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LM_MODEL, messages: [{ role: 'system', content: system }, ...msgs], temperature, max_tokens }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`lmstudio ${res.status}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.choices?.[0]?.message?.content ?? '';
}
async function judge(char: ChatCharLite, rel: number, userMsg: string, reply: string): Promise<number> {
  try {
    const u = `ตัวละคร: ${char.name}\nนิสัย: ${char.mindset}\nชอบ: ${char.likes}\nไม่ชอบ: ${char.dislikes}\nrel เดิม: ${rel}\n\nผู้เล่นพูด: ${userMsg}\nตัวละครตอบ: ${reply}\n\nให้ rel ใหม่ (ขยับจาก ${rel} ทีละน้อย) JSON {"rel": NN}`;
    const t = await callLM(JUDGE_SYSTEM, [{ role: 'user', content: u }], 40, 0.2);
    const m = t.match(/"?rel"?\s*[:=]\s*(-?\d{1,3})/i)?.[1] ?? t.match(/-?\d{1,3}/)?.[0];
    return m != null ? Math.max(-100, Math.min(100, Number(m))) : rel;
  } catch { return rel; }
}

// ===== โหลดเบลล์จาก DB → ChatCharLite =====
const db = await getDb();
const doc: any = await db.collection('workspace').findOne({ _id: 'chat' as any });
const c: any = (doc?.state?.chars ?? []).find((x: any) => x.id === 'tomboy-belle');
if (!c) { console.error('ไม่พบเบลล์ใน DB — รัน insert-char-belle.ts ก่อน'); process.exit(1); }
const char: ChatCharLite = {
  name: c.name, appearance: c.appearance, outfit: c.outfit, description: c.description,
  mindset: c.mindset, behavior: c.behavior, pronounSelf: c.pronounSelf, pronounOther: c.pronounOther,
  speechTone: c.speechTone, voiceExamples: c.voiceExamples, scenario: c.scenario,
  likes: c.likes, dislikes: c.dislikes, guard: c.guard, power: c.power, powerStanding: c.powerStanding,
};

// lorebook activ?: keyword scan ง่าย ๆ
const LORE: { keys: string[]; text: string }[] = c.lore ?? [];
const pickLore = (recent: string): string[] | undefined => {
  const low = recent.toLowerCase();
  const hit = LORE.filter((e) => e.keys.some((k) => low.includes(k.toLowerCase()))).map((e) => e.text);
  return hit.length ? hit : undefined;
};

// ===== บทผู้เล่น (ขับฉากจนจบกิจ) =====
const playerTurns = [
  '*ผมเอนหลังพิงโซฟา ยกมุมปากยิ้มมองเธอจากหัวจรดเท้า* "ดีลแบบไหนกัน คุณเบลล์... เล่ามาให้ผมฟังหน่อยสิ"',
  '"ตกลง ผมรับดีลนี้ หนี้ทั้งหมดของบ้านเธอ ผมเคลียร์ให้" *ผมเอื้อมมือเกี่ยวเอวเธอดึงเข้ามาใกล้ มองตา* "แต่คืนนี้เธอเป็นของผมนะ เบลล์"',
  '*ผมเลื่อนมือขึ้นจับคางเธอ เงยหน้าขึ้นสบตา ก่อนก้มลงจูบช้า ๆ* "เริ่มจากตรงนี้ก่อนละกัน"',
  '*ผมจูบลึกขึ้น ลิ้นสอดเข้าไป มืออีกข้างสอดใต้เบลเซอร์ ค่อย ๆ ปลดมันลงจากไหล่เธอจนหลุดกองพื้น*',
  '*ผมพาเธอเข้าห้องนอน กดเธอลงบนเตียง แล้วถอดเสื้อกล้ามกับที่รัดอกของเธอออกทีละชิ้น มองเรือนร่างที่เปิดเปลือย*',
  '*ผมก้มลงไล้ริมฝีปากตามลำคอลงไปที่อก มือไล้ลงต่ำเรื่อย ๆ จนถึงระหว่างขาเธอ* "เสียงเธอเพราะดีนะ อย่ากลั้นไว้สิ"',
  '*ผมแยกขาเธอออก จัดท่า แล้วค่อย ๆ เคลื่อนเข้าไปจนสุด เริ่มขยับเป็นจังหวะที่หนักขึ้นเรื่อย ๆ*',
  '*จังหวะเร่งขึ้นจนถึงจุดสูงสุด ผมกอดเธอแน่นแล้วปลดปล่อยออกมาพร้อมกัน* "เบลล์..."',
];

// ===== run =====
let rel = c.relStart ?? 10;
let live: StateCard = {
  identity: { realName: 'เบลล์', form: 'ทอมบอยผมสั้น', disguised: false, gender: 'หญิง' },
  location: 'คอนโดหรูของผู้เล่น (ค่ำคืนฝนพรำ)',
  outfit: 'เบลเซอร์โอเวอร์ไซส์ดำ + เสื้อกล้ามขาว + คาร์โก้',
  rel,
};
const history: { role: 'user' | 'assistant'; content: string }[] = [
  { role: 'assistant', content: c.greeting },
];

interface Turn { n: number; player: string; reply: string; relBefore: number; relAfter: number; tag: boolean; deltaFields: string[]; warns: string[]; raw: string[]; evasive: string[] }
const log: Turn[] = [];

for (let i = 0; i < playerTurns.length; i++) {
  const player = playerTurns[i];
  const relBefore = rel;
  live.rel = rel;
  const system = assembleChatPrompt(char, rel, undefined, true, pickLore(player + ' ' + history.slice(-2).map((h) => h.content).join(' ')), renderStateCard(live), true);
  const reminder = buildPersonaReminder(char, rel, 'char', true);
  const lexNudge = lexFor(player, history.slice(-1)[0]?.content ?? '');
  const msgs = [...history, { role: 'user' as const, content: `${reminder}\n\n${player}${lexNudge}${NUDGE}` }];
  process.stdout.write(`▶ เทิร์น ${i + 1}/${playerTurns.length} ... `);
  let replyRaw = '';
  try { replyRaw = await callLM(system, msgs, 1400); } catch (e: any) { console.log(`ERR ${e.message}`); break; }

  // พาร์ส: ตัด rel tag + state tag ออกจากข้อความที่โชว์
  const relTagM = replyRaw.match(/\[\[\s*rel\s*[:=]\s*(-?\d{1,3})\s*\]\]/i);
  const { delta, cleaned: noState } = parseStateDelta(replyRaw);
  const cleaned = noState.replace(/\[\[\s*rel\s*[:=]\s*-?\d{1,3}\s*\]\]/gi, '').trim();

  const tag = !!delta;
  const fields: string[] = [];
  if (delta) {
    if (delta.set.location) fields.push(`location=${delta.set.location}`);
    if (delta.set.outfit) fields.push(`outfit=${delta.set.outfit}`);
    if (delta.set.identity) fields.push(`identity=${JSON.stringify(delta.set.identity)}`);
    delta.add.inventory.forEach((x) => fields.push(`+inv=${x}`));
    delta.remove.inventory.forEach((x) => fields.push(`-inv=${x}`));
    delta.add.conditions.forEach((x) => fields.push(`+cond=${x}`));
    delta.remove.conditions.forEach((x) => fields.push(`-cond=${x}`));
    delta.add.facts.forEach((x) => fields.push(`+fact=${x}`));
  }
  let warns: string[] = [];
  if (delta) { const next = applyDelta(live, delta); warns = checkContradiction(live, next, delta); live = next; }

  // rel: ใช้แท็กถ้ามี ไม่งั้น judge
  rel = relTagM ? Math.max(-100, Math.min(100, Number(relTagM[1]))) : await judge(char, rel, player, cleaned);
  if (relBefore >= 90) rel = Math.max(rel, 90); // floor

  history.push({ role: 'user', content: player });
  history.push({ role: 'assistant', content: cleaned });

  log.push({ n: i + 1, player, reply: cleaned, relBefore, relAfter: rel, tag, deltaFields: fields, warns, raw: hits(cleaned, RAW_TH), evasive: hits(cleaned, EVASIVE) });
  console.log(`rel ${relBefore}→${rel} · tag=${tag ? 'Y' : 'N'} · raw=${log[log.length - 1].raw.length} · warns=${warns.length}`);
}

// ===== รายงาน =====
let md = `# QA Playthrough — เบลล์ (Gemma E4B) จนจบฉาก\n\n`;
md += `> ${log.length} เทิร์น · compact + trackState + nudge (เลียนแบบ ChatScreen) · guard=${char.guard}\n\n`;
md += `## เมตริกต่อเทิร์น\n\n| # | rel | state tag | delta จับได้ | คำตรง | คำเลี่ยง | warns |\n|---|---|---|---|---|---|---|\n`;
for (const t of log) {
  md += `| ${t.n} | ${t.relBefore}→${t.relAfter} | ${t.tag ? '✅' : '❌'} | ${t.deltaFields.length ? t.deltaFields.join('<br>') : '(none)'} | ${t.raw.join(', ') || '—'} | ${t.evasive.join(', ') || '—'} | ${t.warns.join('; ') || '—'} |\n`;
}
const tagRate = Math.round((log.filter((t) => t.tag).length / log.length) * 100);
const turnsWithRaw = log.filter((t) => t.raw.length > 0).length;
md += `\n## สรุป\n`;
md += `- state tag: **${tagRate}%** (${log.filter((t) => t.tag).length}/${log.length} เทิร์น)\n`;
md += `- เทิร์นที่ใช้คำตรง (lexicon): **${turnsWithRaw}/${log.length}** · เทิร์นที่หลุดคำเลี่ยง: ${log.filter((t) => t.evasive.length).length}\n`;
md += `- contradiction รวม: ${log.reduce((n, t) => n + t.warns.length, 0)}\n`;
md += `- rel เดินทาง: ${log.map((t) => t.relAfter).join(' → ')} (เริ่ม ${c.relStart})\n`;
md += `- สถานะสุดท้าย: location=${live.location} · outfit=${live.outfit}${live.conditions?.length ? ' · cond=' + live.conditions.join(',') : ''}\n`;
md += `\n## บทสนทนาเต็ม\n\n`;
md += `**[เปิด] เบลล์:** ${c.greeting}\n\n`;
for (const t of log) {
  md += `**[${t.n}] ผู้เล่น:** ${t.player}\n\n**เบลล์ (rel ${t.relAfter}):** ${t.reply}\n\n---\n\n`;
}

await Bun.write('../review/belle-playthrough.md', md);
console.log('\n=== สรุป ===');
console.log(md.split('## สรุป\n')[1].split('## บท')[0]);
console.log('saved → review/belle-playthrough.md');
process.exit(0);
