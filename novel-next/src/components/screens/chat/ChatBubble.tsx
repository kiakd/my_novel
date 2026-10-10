'use client';
import { pal } from '@/lib/theme';
import type { ChatMsg } from '@/lib/chat-types';
import type { ColorKey } from '@/lib/theme';

// แยกโทนข้อความให้อ่านเหมือนนิยายภาพ:
//   *...*      → บทบรรยาย/ท่าทาง  → ตัวเอียง จาง (narration)
//   "..." "…"  → บทพูด            → สว่าง เด่น (dialogue)
//   อื่น ๆ                        → ปกติ (สว่างกลาง)
const SEG = /(\*[^*]+\*|[“][^”]*[”]|"[^"]*")/g;
function render(text: string) {
  return text.split(SEG).map((p, i) => {
    if (!p) return null;
    if (p.startsWith('*') && p.endsWith('*')) return <em key={i} className="italic text-white/60">{p.slice(1, -1)}</em>;
    if (/^[“"][\s\S]*[”"]$/.test(p)) return <span key={i} className="text-white font-semibold">{p}</span>;
    return <span key={i} className="text-white/85">{p}</span>;
  });
}

const TEXT_SHADOW = '0 1px 4px rgba(0,0,0,.72), 0 0 18px rgba(0,0,0,.38)';

interface Props {
  msg: ChatMsg;
  charColor: ColorKey;
  avatarUrl?: string;   // รูปตัวละคร — โชว์วงกลมเล็กหน้าข้อความ (ว่าง = อักษรย่อบนพื้นไล่สี)
  charName?: string;
  showAvatar?: boolean; // โชว์ avatar เฉพาะข้อความแรกของกลุ่ม (ต่อเนื่องกันไม่ต้องซ้ำ)
  busy?: boolean;
  onRegenText?: () => void;   // ตอบใหม่ (regen ข้อความ) — โชว์เฉพาะคำตอบ AI ล่าสุด
  onDeleteMsg?: () => void;
}

const DelBtn = ({ onClick }: { onClick?: () => void }) => (
  <button onClick={onClick} title="ลบข้อความ"
    className="opacity-40 hover:opacity-100 focus:opacity-100 h-6 w-6 grid place-items-center rounded-lg text-[12px] text-white/70 hover:bg-coral/20 hover:text-coral transition shrink-0 self-center">🗑</button>
);

const RegenBtn = ({ onClick, busy }: { onClick?: () => void; busy?: boolean }) => (
  <button onClick={onClick} disabled={busy} title="ตอบใหม่ (regen คำตอบนี้)"
    className="opacity-40 hover:opacity-100 focus:opacity-100 h-6 w-6 grid place-items-center rounded-lg text-[12px] text-white/70 hover:bg-white/15 hover:text-white disabled:opacity-20 transition shrink-0 self-center">{busy ? '⏳' : '🔄'}</button>
);

/** avatar วงกลมเล็กหน้าข้อความตัวละคร */
function MsgAvatar({ url, name, color, hidden }: { url?: string; name?: string; color: ColorKey; hidden?: boolean }) {
  if (hidden) return <div className="w-8 shrink-0" aria-hidden />;
  const ring = { boxShadow: '0 0 0 1.5px rgba(255,255,255,.7), 0 3px 8px rgba(0,0,0,.45)' };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name ?? ''} className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" style={ring} />;
  }
  const P = pal(color);
  return (
    <div className="w-8 h-8 rounded-full shrink-0 mt-0.5 grid place-items-center text-white text-[13px] font-bold"
      style={{ background: `linear-gradient(140deg, ${P.tint}, ${P.c})`, ...ring }}>{(name ?? '?').slice(0, 1)}</div>
  );
}

export function ChatBubble({ msg, charColor, avatarUrl, charName, showAvatar = true, busy, onRegenText, onDeleteMsg }: Props) {
  // รูปประกอบฉาก (แสดงรูปที่มีอยู่แล้ว — ไม่มีปุ่มวาด/สร้างใหม่)
  const imageBlock = msg.image ? (
    <div className="relative mt-2 w-full max-w-[340px] not-italic">
      <img src={msg.image} alt="ฉาก" loading="lazy" className="rounded-xl w-full border border-white/20 shadow-lg" />
    </div>
  ) : null;

  // แถวปุ่มจัดการ (regen + ลบ) — อยู่บน-ซ้าย เหนือข้อความ กดง่ายบนมือถือ ไม่ต้องเล็งกลางจอ
  const actions = (
    <div className="flex gap-0.5 -ml-0.5">
      {onRegenText && <RegenBtn onClick={onRegenText} busy={busy} />}
      <DelBtn onClick={onDeleteMsg} />
    </div>
  );

  // บทบรรยายผู้เล่าเรื่อง (ฉาก/บุคคลที่ 3/NPC) — ลอยบนพื้นหลัง ตัวเอียงจาง
  if (msg.role === 'narrator') {
    return (
      <div className="my-1 group flex flex-col items-start gap-0.5">
        {actions}
        <div className={`w-full leading-relaxed whitespace-pre-wrap break-words italic ${msg.secret ? 'border-l-2 border-grape/50 pl-3' : ''}`}
          style={{ textShadow: TEXT_SHADOW }}>
          <div className="text-[10px] font-bold not-italic mb-1 text-white/50">🎬 ผู้เล่าเรื่อง{msg.secret ? ' · 🔒 ตัวละครไม่รับรู้' : ''}</div>
          {render(msg.text)}
          {imageBlock}
        </div>
      </div>
    );
  }
  // ข้อความจากการใช้ไอเท็ม → pill กลางจอ
  if (msg.item) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-[12px] font-bold text-white/70 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1">{msg.text}</span>
      </div>
    );
  }
  const isUser = msg.role === 'user';
  // ผู้เล่น: บับเบิลทึบชิดขวา (เหมือนเดิม ไม่แตะ) + ปุ่มลบเล็กด้านซ้าย
  if (isUser) {
    const P = pal('sky');
    return (
      <div className="group flex items-start gap-1 justify-end">
        <DelBtn onClick={onDeleteMsg} />
        <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap break-words shadow-lg"
          style={{ background: P.c, color: '#fff', borderBottomRightRadius: 6 }}>
          {msg.power && <span className="font-bold" title="ใช้อำนาจ">⚡ </span>}
          {msg.text}
          {imageBlock}
        </div>
      </div>
    );
  }
  // ตัวละคร (AI): ไม่มีกล่อง — ข้อความลอยบนพื้นหลัง, avatar เล็กด้านซ้าย
  return (
    <div className="group flex items-start gap-2.5">
      <MsgAvatar url={avatarUrl} name={charName} color={charColor} hidden={!showAvatar} />
      <div className="min-w-0 flex-1 flex flex-col items-start gap-0.5">
        {actions}
        <div className="leading-relaxed whitespace-pre-wrap break-words" style={{ textShadow: TEXT_SHADOW }}>
          {msg.power && <span className="font-bold text-white" title="ใช้อำนาจ">⚡ </span>}
          {render(msg.text)}
          {imageBlock}
        </div>
      </div>
    </div>
  );
}
