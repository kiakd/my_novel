'use client';
import { useRef, useState } from 'react';
import { Modal, Input, Textarea, Btn, IconBtn, toast } from '@/components/ui';
import { keysToText, textToKeys } from '@/lib/chat-lore';
import type { LoreEntry } from '@/lib/chat-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizeEntries = (raw: any): LoreEntry[] => {
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw?.world) ? raw.world : raw?.entries);
  if (!Array.isArray(arr)) throw new Error('รูปแบบไฟล์โลกไม่ถูกต้อง');
  return arr
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((e: any, i: number) => ({
      id: 'w' + Date.now() + i,
      keys: Array.isArray(e.keys) ? e.keys : (typeof e.keys === 'string' ? textToKeys(e.keys) : []),
      text: String(e.text ?? e.content ?? '').trim(),
      always: !!e.always,
    }))
    .filter((e: LoreEntry) => e.text);
};

interface Props {
  world: LoreEntry[];
  onClose: () => void;
  onSave: (entries: LoreEntry[]) => void;
}

/** ตัวแก้ "โลกกลาง (Shared World)" — lorebook ที่ฉีดเข้าทุกแชท · always=ทุกเทิร์น · keyword=ตามคีย์ */
export function ChatWorldModal({ world, onClose, onSave }: Props) {
  const [d, setD] = useState<LoreEntry[]>(world);
  const add = () => setD((x) => [...x, { id: 'w' + Date.now(), keys: [], text: '', always: false }]);
  const set = (id: string, p: Partial<LoreEntry>) => setD((x) => x.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const del = (id: string) => setD((x) => x.filter((e) => e.id !== id));
  const save = () => { onSave(d.filter((e) => e.text.trim())); onClose(); toast('บันทึกโลกแล้ว', '🌍'); };

  // ---- import / export โลก (.json) ----
  const fileRef = useRef<HTMLInputElement>(null);
  const onImport = async (file?: File | null) => {
    if (!file) return;
    try {
      const entries = normalizeEntries(JSON.parse(await file.text()));
      if (!entries.length) throw new Error('ไม่พบลอร์ในไฟล์');
      setD(entries);
      toast(`นำเข้าโลกแล้ว ${entries.length} ลอร์ (กดบันทึกเพื่อยืนยัน)`, '🌍');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'นำเข้าไม่สำเร็จ', '⚠️');
    }
  };
  const onExport = () => {
    const out = d.map((e) => ({ keys: e.keys, text: e.text, always: !!e.always }));
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'world.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast('ส่งออกโลกแล้ว', '⬇️');
  };

  return (
    <Modal open onClose={onClose} size="lg" mobileFull>
      <div className="sticky top-0 z-10 bg-cream/95 backdrop-blur px-6 pt-6 pb-3 border-b border-line flex items-center justify-between gap-3">
        <div className="font-display text-2xl font-semibold text-ink">🌍 โลกของเรื่องนี้</div>
        <IconBtn onClick={onClose} title="ปิด">✕</IconBtn>
      </div>

      <div className="p-6 pt-5 flex flex-col gap-3">
        <p className="text-[12.5px] text-muted leading-relaxed">
          ลอร์ในนี้จะถูกฉีดเข้า <b>ทุกแชท</b> อัตโนมัติ (ใช้ตั้งจักรวาล/เผ่า/ฝ่าย/ศัตรูร่วม โดยไม่ต้องก๊อปใส่ทุกตัวละคร) —
          ติ๊ก <b>“ใส่เสมอ”</b> สำหรับฉากตั้งโลก/กฎหลักที่อยากให้รู้ทุกเทิร์น · ไม่ติ๊ก = ฉีดเฉพาะตอน <b>keyword</b> โผล่ (ประหยัด token เหมาะกับรายละเอียดเผ่า/ฝ่าย/สถานที่/NPC)
        </p>

        {d.length === 0 && <div className="text-[13px] text-muted text-center py-3">ยังไม่มีลอร์โลก — กด “＋ เพิ่ม”</div>}

        <div className="flex flex-col gap-2">
          {d.map((e) => (
            <div key={e.id} className="flex flex-col gap-1.5 rounded-xl border border-line p-2.5 bg-white/60">
              <div className="flex items-center gap-2">
                <Input value={keysToText(e.keys)} onChange={(ev) => set(e.id, { keys: textToKeys(ev.target.value) })}
                  placeholder="keyword คั่นด้วย , เช่น โฮล์, เผ่าวัว, สหพันธ์ดาวา" className="flex-1 !text-[12.5px] !py-1.5" />
                <label className="flex items-center gap-1 text-[11px] font-bold text-muted shrink-0 cursor-pointer select-none" title="ฉีดเข้าทุกเทิร์นโดยไม่ต้องรอ keyword">
                  <input type="checkbox" checked={!!e.always} onChange={(ev) => set(e.id, { always: ev.target.checked })} className="accent-bubble" /> ใส่เสมอ
                </label>
                <IconBtn onClick={() => del(e.id)} title="ลบ">🗑</IconBtn>
              </div>
              <Textarea rows={2} value={e.text} onChange={(ev) => set(e.id, { text: ev.target.value })}
                placeholder='ข้อเท็จจริงของโลก เช่น "โฮล์: แมลงยักษ์ที่กลืนกินได้แม้แต่ดาวและแสง ศัตรูร่วมของทุกเผ่า"' />
            </div>
          ))}
        </div>

        <Btn variant="ghost" onClick={add} className="self-start">＋ เพิ่มลอร์โลก</Btn>
      </div>

      <div className="sticky bottom-0 bg-cream/95 backdrop-blur px-6 py-4 border-t border-line flex flex-wrap justify-between items-center gap-2">
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { void onImport(e.target.files?.[0]); e.target.value = ''; }} />
          <Btn variant="ghost" onClick={() => fileRef.current?.click()}>⬆️ นำเข้าโลก</Btn>
          <Btn variant="ghost" onClick={onExport} disabled={!d.length}>⬇️ ส่งออกโลก</Btn>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose}>ยกเลิก</Btn>
          <Btn variant="primary" color="bubble" onClick={save}>บันทึกโลก</Btn>
        </div>
      </div>
    </Modal>
  );
}
