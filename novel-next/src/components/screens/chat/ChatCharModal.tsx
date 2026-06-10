'use client';
import { useState } from 'react';
import { Modal, Avatar, Btn, IconBtn, Input, Textarea, Field, toast } from '@/components/ui';
import { pal, type ColorKey } from '@/lib/theme';
import type { ChatChar } from '@/lib/chat-types';

const COLORS: ColorKey[] = ['coral', 'sky', 'mint', 'grape', 'sun', 'bubble', 'lilac', 'slate'];

interface Props {
  char: ChatChar;
  onClose: () => void;
  onSave: (c: ChatChar) => void;
  onDelete: (id: string) => void;
}

/** สร้าง/แก้ตัวละครแชท — โปรไฟล์ (เหมือนตัวละครเนื้อเรื่อง) + ตั้งค่า RP */
export function ChatCharModal({ char, onClose, onSave, onDelete }: Props) {
  const [d, setD] = useState<ChatChar>(char);
  const set = (p: Partial<ChatChar>) => setD((x) => ({ ...x, ...p }));
  const P = pal(d.color ?? 'coral');

  return (
    <Modal open onClose={onClose} size="lg">
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur px-6 pt-6 pb-3 border-b border-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 flex-1 min-w-0">
          <Avatar initial={(d.name || '?').slice(0, 1)} color={d.color ?? 'coral'} size={52} ring />
          <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="ชื่อตัวละคร"
            className="font-display text-2xl font-semibold !py-1 !border-transparent !bg-transparent focus:!bg-white" />
        </div>
        <IconBtn onClick={onClose} title="ปิด">✕</IconBtn>
      </div>

      <div className="p-6 pt-5 flex flex-col gap-4">
        {/* สี */}
        <Field label="สีประจำตัว">
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button key={c} onClick={() => set({ color: c })}
                className="h-8 w-8 rounded-full border-2 transition"
                style={{ background: pal(c).c, borderColor: d.color === c ? '#2A2620' : 'transparent' }} />
            ))}
          </div>
        </Field>

        {/* โปรไฟล์ */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="รูปลักษณ์"><Textarea rows={2} value={d.appearance ?? ''} onChange={(e) => set({ appearance: e.target.value })} /></Field>
          <Field label="👗 การแต่งตัว / สไตล์ชุด"><Textarea rows={2} value={d.outfit ?? ''} onChange={(e) => set({ outfit: e.target.value })} placeholder="เช่น ชุดคลุมจอมเวทสีขาวทอง / สาวเท่แจ็กเก็ตหนัง" /></Field>
          <Field label="ภูมิหลัง / bio" className="sm:col-span-2"><Textarea rows={2} value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="วิธีคิด / ค่านิยม"><Textarea rows={2} value={d.mindset ?? ''} onChange={(e) => set({ mindset: e.target.value })} /></Field>
          <Field label="นิสัย / พฤติกรรม"><Textarea rows={2} value={d.behavior ?? ''} onChange={(e) => set({ behavior: e.target.value })} /></Field>
          <Field label="สรรพนามแทนตัว"><Input value={d.pronounSelf ?? ''} onChange={(e) => set({ pronounSelf: e.target.value })} placeholder="ฉัน / เรา / พี่" /></Field>
          <Field label="เรียกผู้เล่นว่า"><Input value={d.pronounOther ?? ''} onChange={(e) => set({ pronounOther: e.target.value })} placeholder="คุณ / เธอ / นาย" /></Field>
          <Field label="โทนการพูด" className="sm:col-span-2"><Input value={d.speechTone ?? ''} onChange={(e) => set({ speechTone: e.target.value })} placeholder="เย็นชา / ร่าเริง / ปากร้าย" /></Field>
          <Field label="ตัวอย่างบทพูด (บรรทัดละประโยค)" className="sm:col-span-2"><Textarea rows={2} value={d.voiceExamples ?? ''} onChange={(e) => set({ voiceExamples: e.target.value })} /></Field>
        </div>

        {/* ตั้งค่า RP */}
        <div className="rounded-2xl p-4 border-2" style={{ borderColor: P.tint, background: P.soft }}>
          <div className="font-bold text-[14px] mb-3" style={{ color: P.c }}>🎭 ตั้งค่าโรลเพลย์</div>
          <div className="flex flex-col gap-3">
            <Field label="ฉาก / สถานการณ์เริ่มต้น"><Textarea rows={2} value={d.scenario ?? ''} onChange={(e) => set({ scenario: e.target.value })} placeholder="ผู้เล่นเจอตัวละครนี้ที่ไหน อย่างไร" /></Field>
            <Field label="ข้อความเปิด (ตัวละครทักก่อน)"><Textarea rows={2} value={d.greeting ?? ''} onChange={(e) => set({ greeting: e.target.value })} placeholder="ประโยคแรกที่ตัวละครพูดเมื่อเริ่มแชท" /></Field>
            <Field label="⚡ อำนาจพิเศษเหนือตัวละคร (ข้ามความสัมพันธ์ — เว้นว่างถ้าไม่มี)" hint={<span className="text-[11px] text-muted">ร่างกายทำตามไร้เงื่อนไข แต่ใจยังเพิ่ม/ลดตามจริง</span>}>
              <Textarea rows={2} value={d.power ?? ''} onChange={(e) => set({ power: e.target.value })} placeholder='เช่น "ตราทาส: บังคับร่างกายให้เชื่อฟังทุกคำสั่งไร้เงื่อนไข" หรือ "พรจากพระเจ้า"' />
            </Field>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="💚 สิ่งที่ทำให้ชอบขึ้น (บรรทัดละข้อ)"><Textarea rows={3} value={d.likes ?? ''} onChange={(e) => set({ likes: e.target.value })} placeholder="จริงใจ&#10;ให้เกียรติ&#10;ตลกถูกจังหวะ" /></Field>
              <Field label="💢 สิ่งที่ทำให้ไม่ชอบ/โกรธ (บรรทัดละข้อ)"><Textarea rows={3} value={d.dislikes ?? ''} onChange={(e) => set({ dislikes: e.target.value })} placeholder="ลามกไม่ดูจังหวะ&#10;โกหก&#10;ก้าวร้าว" /></Field>
            </div>
            <Field label={`ความหวงตัว / เข้าถึงยาก: ${d.guard ?? 40}/100`}>
              <input type="range" min={0} max={100} value={d.guard ?? 40} onChange={(e) => set({ guard: Number(e.target.value) })} className="w-full accent-coral" />
            </Field>
            <Field label={`ความสัมพันธ์เริ่มต้น: ${d.relStart ?? 0} (${(d.relStart ?? 0) < 0 ? 'ติดลบ=ศัตรู' : 'setup ได้'})`}>
              <input type="range" min={-100} max={100} value={d.relStart ?? 0} onChange={(e) => set({ relStart: Number(e.target.value) })} className="w-full accent-grape" />
            </Field>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-cream/95 backdrop-blur px-6 py-4 border-t border-line flex justify-between items-center">
        <button className="text-coral font-bold text-sm hover:underline" onClick={() => { onDelete(d.id); onClose(); }}>🗑 ลบตัวละคร</button>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose}>ยกเลิก</Btn>
          <Btn variant="primary" color={d.color ?? 'coral'} onClick={() => { if (!d.name.trim()) { toast('ใส่ชื่อตัวละครก่อน', '⚠️'); return; } onSave(d); onClose(); toast('บันทึกแล้ว', '💾'); }}>บันทึก</Btn>
        </div>
      </div>
    </Modal>
  );
}
