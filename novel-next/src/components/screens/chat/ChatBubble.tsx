'use client';
import { pal } from '@/lib/theme';
import type { ChatMsg } from '@/lib/chat-types';
import type { ColorKey } from '@/lib/theme';

/** แปลง *...* เป็นตัวเอน (บรรยายท่าทาง) */
function render(text: string) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((p, i) =>
    p.startsWith('*') && p.endsWith('*')
      ? <em key={i} className="opacity-70">{p.slice(1, -1)}</em>
      : <span key={i}>{p}</span>,
  );
}

interface Props {
  msg: ChatMsg;
  charColor: ColorKey;
  drawing?: boolean;
  busy?: boolean;
  onRegen?: () => void;       // วาดรูปฉากใหม่ (บนรูป)
  onRegenText?: () => void;   // ตอบใหม่ (regen ข้อความ) — โชว์เฉพาะคำตอบ AI ล่าสุด
  onDelete?: () => void;
  onDeleteMsg?: () => void;
}

const DelBtn = ({ onClick }: { onClick?: () => void }) => (
  <button onClick={onClick} title="ลบข้อความ"
    className="opacity-30 hover:opacity-100 focus:opacity-100 h-6 w-6 grid place-items-center rounded-lg text-[12px] text-muted hover:bg-coral/10 hover:text-coral transition shrink-0 self-center">🗑</button>
);

const RegenBtn = ({ onClick, busy }: { onClick?: () => void; busy?: boolean }) => (
  <button onClick={onClick} disabled={busy} title="ตอบใหม่ (regen คำตอบนี้)"
    className="opacity-30 hover:opacity-100 focus:opacity-100 h-6 w-6 grid place-items-center rounded-lg text-[12px] text-muted hover:bg-bubble/15 hover:text-bubble disabled:opacity-20 transition shrink-0 self-center">{busy ? '⏳' : '🔄'}</button>
);

export function ChatBubble({ msg, charColor, drawing, busy, onRegen, onRegenText, onDelete, onDeleteMsg }: Props) {
  // รูปประกอบฉาก + ปุ่มวาดใหม่/ลบ
  const imageBlock = msg.image ? (
    <div className="relative mt-2 w-full max-w-[340px] not-italic">
      <img src={msg.image} alt="ฉาก" loading="lazy" className="rounded-xl w-full border-2 border-line" />
      <div className="absolute top-1.5 right-1.5 flex gap-1">
        <button onClick={onRegen} disabled={drawing} title="วาดใหม่"
          className="h-7 w-7 grid place-items-center rounded-lg bg-black/55 text-white text-[13px] hover:bg-black/75 disabled:opacity-50 backdrop-blur transition">{drawing ? '⏳' : '🔄'}</button>
        <button onClick={onDelete} disabled={drawing} title="ลบรูป"
          className="h-7 w-7 grid place-items-center rounded-lg bg-black/55 text-white text-[13px] hover:bg-black/75 disabled:opacity-50 backdrop-blur transition">🗑</button>
      </div>
    </div>
  ) : null;

  // แถวปุ่มจัดการ (regen + ลบ) — อยู่บน-ซ้าย เหนือข้อความ กดง่ายบนมือถือ ไม่ต้องเล็งกลางจอ
  const actions = (
    <div className="flex gap-0.5 ml-1">
      {onRegenText && <RegenBtn onClick={onRegenText} busy={busy} />}
      <DelBtn onClick={onDeleteMsg} />
    </div>
  );

  // บทบรรยายผู้เล่าเรื่อง (ฉาก/บุคคลที่ 3/NPC)
  if (msg.role === 'narrator') {
    return (
      <div className="my-1 group flex flex-col items-start gap-0.5">
        {actions}
        <div className={`w-full rounded-2xl px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap break-words italic border-2 border-dashed ${msg.secret ? 'border-grape/40 bg-grape/[.05]' : 'border-line bg-ink/[.03]'}`}>
          <div className="text-[10px] font-bold not-italic mb-1 text-muted">🎬 ผู้เล่าเรื่อง{msg.secret ? ' · 🔒 ตัวละครไม่รับรู้' : ''}</div>
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
        <span className="text-[12px] font-bold text-muted bg-ink/[.05] rounded-full px-3 py-1">{msg.text}</span>
      </div>
    );
  }
  const isUser = msg.role === 'user';
  const P = pal(isUser ? 'sky' : charColor);
  const bubble = (
    <div className="max-w-[80%] rounded-2xl px-3.5 py-2.5 leading-relaxed whitespace-pre-wrap break-words"
      style={isUser
        ? { background: P.c, color: '#fff', borderBottomRightRadius: 6 }
        : { background: P.soft, color: '#2A2620', borderBottomLeftRadius: 6 }}>
      {msg.power && <span className="font-bold" title="ใช้อำนาจ">⚡ </span>}
      {render(msg.text)}
      {imageBlock}
    </div>
  );
  // ผู้เล่น: บับเบิลชิดขวา ปุ่มลบเล็ก ๆ ด้านซ้าย (เหมือนเดิม)
  if (isUser) {
    return (
      <div className="group flex items-start gap-1 justify-end">
        <DelBtn onClick={onDeleteMsg} />
        {bubble}
      </div>
    );
  }
  // ตัวละคร: ปุ่ม regen + ลบ เป็นแถวบน-ซ้าย เหนือข้อความ
  return (
    <div className="group flex flex-col items-start gap-0.5">
      {actions}
      {bubble}
    </div>
  );
}
