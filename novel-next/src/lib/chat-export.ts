// ============ Export แชทเป็นไฟล์ .md — ไว้กดส่งให้คนตรวจ/ดีบักง่าย ๆ ============
import type { ChatSession, ChatChar } from './chat-types';

function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const safe = (s: string) => (s || 'chat').replace(/[\\/:*?"<>|]/g, '_').trim() || 'chat';

/** รวมแชทหนึ่ง session เป็น Markdown (โปรไฟล์ย่อ + สรุป + บัตรสถานะ + ทรานสคริปต์) แล้วดาวน์โหลด */
export function exportSessionLog(session: ChatSession, char: ChatChar, world?: { text: string }[]): void {
  const L: string[] = [];
  L.push(`# แชท: ${char.name}`);
  if (session.playerPersona?.name) {
    const p = session.playerPersona;
    L.push(`**ผู้เล่นสวมบทเป็น:** ${p.name}${p.role ? ` — ${p.role}` : ''}${p.appearance ? ` (${p.appearance})` : ''}`);
  }
  L.push(`**ความสัมพันธ์ล่าสุด:** ${session.rel ?? 0}/100`);
  L.push('');

  // โปรไฟล์ตัวละครย่อ (ไว้ดูว่า output อิงจากการ์ดอะไร)
  L.push('## การ์ดตัวละคร (ย่อ)');
  const prof: [string, string | undefined][] = [
    ['รูปลักษณ์', char.appearance], ['การแต่งตัว', char.outfit], ['ภูมิหลัง', char.description],
    ['วิธีคิด', char.mindset], ['นิสัย', char.behavior], ['โทนพูด', char.speechTone], ['ฉากตั้งต้น', char.scenario],
  ];
  for (const [k, v] of prof) if (v?.trim()) L.push(`- **${k}:** ${v.trim()}`);
  L.push('');

  if (world?.length) {
    L.push('## โลก (ลอร์กลางที่ active)');
    for (const w of world) L.push(`- ${w.text}`);
    L.push('');
  }

  if (session.summary?.trim()) { L.push('## สรุปความจำ (rolling summary)', session.summary.trim(), ''); }

  const card = session.stateCard;
  if (card && Object.values(card).some((v) => v && String(v).trim())) {
    L.push('## บัตรสถานะล่าสุด');
    for (const [k, v] of Object.entries(card)) if (v && String(v).trim()) L.push(`- **${k}:** ${String(v).trim()}`);
    L.push('');
  }

  L.push('## บทสนทนา', '');
  const speaker = (role: string) =>
    role === 'user' ? (session.playerPersona?.name || 'ผู้เล่น')
      : role === 'narrator' ? 'ผู้เล่าเรื่อง' : char.name;
  for (const m of session.messages) {
    const tags = [m.item ? '[ไอเทม]' : '', m.secret ? '[ฉากลับ]' : '', m.power ? '[ใช้อำนาจ]' : ''].filter(Boolean).join(' ');
    const at = m.at && (m.at.time || m.at.place)
      ? `_(${[m.at.time, m.at.place].filter(Boolean).join(' · ')})_\n` : '';
    L.push(`${at}**${speaker(m.role)}:** ${tags ? tags + ' ' : ''}${m.text}`, '');
  }

  downloadText(L.join('\n'), `${safe(char.name)}-${safe(session.title || session.id)}.md`);
}
