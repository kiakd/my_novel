'use client';
// แบนเนอร์ "ใหม่ในบทนี้" — รวมทุกอย่างที่ตัวละครเพิ่งได้ในบท ch เป็นชิป; ว่าง = แจ้งว่าคงสถานะเดิม
import { pal } from '@/lib/theme';

const ADD = pal('mint');

interface WhatsNewBannerProps {
  title: string;       // หัวข้อเมื่อมีของใหม่
  emptyText: string;   // ข้อความเมื่อไม่มีการเปลี่ยน
  chips: string[];
}

export function WhatsNewBanner({ title, emptyText, chips }: WhatsNewBannerProps) {
  if (!chips.length) {
    return (
      <div className="rounded-2xl border border-line bg-white px-4 py-3">
        <div className="font-display text-[17px] font-semibold text-muted">{emptyText}</div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl px-4 py-3" style={{ border: `2px solid ${ADD.tint}`, background: ADD.soft }}>
      <div className="font-display text-[18px] font-semibold mb-2" style={{ color: ADD.c }}>+++ {title}</div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c, i) => (
          <span key={i} className="text-[12px] font-extrabold rounded-full px-3 py-1 bg-white" style={{ border: `1.5px solid ${ADD.tint}`, color: ADD.c }}>{c}</span>
        ))}
      </div>
    </div>
  );
}
