'use client';
import { useRef, useState } from 'react';
import { Modal, Avatar, Btn, IconBtn, Input, Textarea, Field, toast } from '@/components/ui';
import { pal, type ColorKey } from '@/lib/theme';
import { keysToText, textToKeys } from '@/lib/chat-lore';
import { exportCardPng, exportCardJson, importCardFile } from '@/lib/card-client';
import { generateCharFields, translateCharFields } from '@/lib/chat-api';
import { useChatProvider } from '@/lib/uiPrefs';
import type { ChatChar, LoreEntry } from '@/lib/chat-types';

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

  // ---- AI ช่วยเจนฟิลด์ตัวละคร (สถานะ local ไม่เก็บลง ChatChar) ----
  const { provider } = useChatProvider();
  const [brief, setBrief] = useState('');           // ไอเดียคร่าว ๆ ที่ผู้ใช้พิมพ์
  const [genBusy, setGenBusy] = useState(false);     // กำลังเจนแบบ bulk
  const [fieldBusy, setFieldBusy] = useState<string | null>(null); // key ที่กำลังเจนรายช่อง
  const [transBusy, setTransBusy] = useState(false);  // กำลังแปลเป็นไทย
  const [keepNames, setKeepNames] = useState(true);   // คงชื่อเดิม (ไม่ถอดเสียงชื่อเป็นไทย)

  // มีข้อมูลตัวละครพอจะเจนไหม (ใช้เช็คตอน bulk — เผื่อทั้ง brief และตัวละครว่างเปล่า)
  const charHasContent = Object.values(char as unknown as Record<string, unknown>)
    .some((v) => typeof v === 'string' && v.trim());

  // เจนทุกช่องที่ว่าง — เติมเฉพาะช่องที่ยังว่าง (ไม่ทับของที่ผู้ใช้พิมพ์เอง)
  const genBulk = async () => {
    if (genBusy) return;
    setGenBusy(true);
    try {
      const res = await generateCharFields({ char: d as unknown as Record<string, unknown>, brief, provider });
      if (!res.ok || !res.generated) { toast(res.error || 'เจนไม่สำเร็จ', '⚠️'); return; }
      const g = res.generated;
      setD((x) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(g)) {
          if (!String((x as unknown as Record<string, unknown>)[k] ?? '').trim()) patch[k] = v;
        }
        return { ...x, ...(patch as Partial<ChatChar>) };
      });
      toast('เจนแล้ว', '✨');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'เจนไม่สำเร็จ', '⚠️');
    } finally {
      setGenBusy(false);
    }
  };

  // เจนช่องเดียว (กดปุ่ม ✨ ข้างฟิลด์) — เขียนทับช่องนั้นได้เลย (เป็นการ regenerate โดยตั้งใจ)
  const genField = async (key: string) => {
    if (genBusy || fieldBusy) return;
    setFieldBusy(key);
    try {
      const res = await generateCharFields({ char: d as unknown as Record<string, unknown>, brief, fields: [key], provider });
      if (!res.ok || !res.generated) { toast(res.error || 'เจนไม่สำเร็จ', '⚠️'); return; }
      const v = res.generated[key];
      if (v != null) setD((x) => ({ ...x, [key]: v } as ChatChar));
    } catch (err) {
      toast(err instanceof Error ? err.message : 'เจนไม่สำเร็จ', '⚠️');
    } finally {
      setFieldBusy(null);
    }
  };

  // แปลฟิลด์ตัวละครเป็นไทย — เขียนทับเนื้อหาเดิม (เป็นการแปลโดยตั้งใจ ไม่ใช่เติมช่องว่าง)
  const TRANSLATABLE = ['name', 'appearance', 'outfit', 'description', 'mindset', 'behavior', 'speechTone', 'voiceExamples', 'scenario', 'greeting', 'likes', 'dislikes', 'power'];
  const translateToThai = async () => {
    if (transBusy) return;
    const rec = d as unknown as Record<string, unknown>;
    const hasText = TRANSLATABLE.some((k) => String(rec[k] ?? '').trim());
    if (!hasText) { toast('ยังไม่มีเนื้อหาให้แปล', '⚠️'); return; }
    setTransBusy(true);
    try {
      const res = await translateCharFields({ char: rec, keepNames, provider });
      if (!res.ok || !res.translated) { toast(res.error || 'แปลไม่สำเร็จ', '⚠️'); return; }
      const t = res.translated;
      setD((x) => ({ ...x, ...(t as Partial<ChatChar>) }));
      toast('แปลเป็นไทยแล้ว', '🌐');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'แปลไม่สำเร็จ', '⚠️');
    } finally {
      setTransBusy(false);
    }
  };

  // ปุ่ม ✨ เล็ก ๆ สำหรับวางใน slot `hint` ของ Field (เจนช่องนั้นช่องเดียว)
  const GenBtn = ({ k }: { k: string }) => (
    <IconBtn type="button" color={d.color ?? 'coral'} active={fieldBusy === k}
      disabled={genBusy || fieldBusy != null}
      onClick={(e) => { e.preventDefault(); genField(k); }}
      title="ให้ AI เจนช่องนี้ใหม่"
      className="!h-7 !w-7 !rounded-xl text-[13px] disabled:opacity-40">
      {fieldBusy === k ? '⏳' : '✨'}
    </IconBtn>
  );

  // ---- การ์ดตัวละคร V2/V3 (import/export) ----
  const fileRef = useRef<HTMLInputElement>(null);
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // เคลียร์ให้เลือกไฟล์เดิมซ้ำได้
    if (!file) return;
    try {
      const patch = await importCardFile(file);
      setD((x) => ({ ...x, ...patch, id: x.id, color: x.color, relStart: x.relStart })); // เขียนทับฟิลด์โปรไฟล์จากการ์ด, เก็บ id/color/relStart เดิม
      toast('นำเข้าการ์ดแล้ว', '📥');
      // เดาว่าการ์ดเป็นภาษาอังกฤษไหม (คำนวณจาก patch โดยตรง เพราะ state อัปเดตแบบ async) — ถ้าใช่ ชวนให้กดปุ่มแปล
      const pr = patch as Record<string, unknown>;
      const sample = `${pr.description ?? ''} ${pr.appearance ?? ''} ${pr.scenario ?? ''}`;
      const latin = (sample.match(/[A-Za-z]/g) ?? []).length;
      const thai = (sample.match(/[฀-๿]/g) ?? []).length;
      if (latin > thai && latin > 20) toast('การ์ดนี้เป็นภาษาอังกฤษ — กดปุ่ม 🌐 แปลเป็นไทย ได้เลย', '🌐');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'นำเข้าการ์ดไม่สำเร็จ', '⚠️');
    }
  };
  const onExportPng = async () => { try { await exportCardPng(d); } catch (err) { toast(err instanceof Error ? err.message : 'ส่งออกไม่สำเร็จ', '⚠️'); } };
  const onExportJson = async () => { try { await exportCardJson(d); } catch (err) { toast(err instanceof Error ? err.message : 'ส่งออกไม่สำเร็จ', '⚠️'); } };

  // ---- lorebook ----
  const addLore = () => set({ lore: [...(d.lore ?? []), { id: 'lr' + Date.now(), keys: [], text: '' }] });
  const setLore = (id: string, p: Partial<LoreEntry>) => set({ lore: (d.lore ?? []).map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const delLore = (id: string) => set({ lore: (d.lore ?? []).filter((e) => e.id !== id) });

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

        {/* ✨ AI ช่วยสร้างตัวละคร — เล่าคร่าว ๆ แล้วให้ AI เติมช่องที่เหลือ */}
        <div className="rounded-2xl p-4 border-2" style={{ borderColor: P.tint, background: P.soft }}>
          <Field label="✨ เล่าคร่าว ๆ ว่าอยากได้ตัวละครแบบไหน (ให้ AI เจนส่วนที่เหลือ)"
            hint={<span className="text-[11px] text-muted">ช่องที่กรอกไว้แล้วถือเป็นของตายตัว</span>}>
            <Textarea rows={2} value={brief} onChange={(e) => setBrief(e.target.value)}
              placeholder="เช่น สาวไอดอลไซเบอร์พังก์ ปากร้ายแต่ใจดี โดนวางยาแล้วหนีมา…" />
          </Field>
          <Btn variant="primary" color={d.color ?? 'coral'} className="mt-3 w-full"
            disabled={genBusy || (!brief.trim() && !charHasContent)} onClick={genBulk}>
            {genBusy ? 'กำลังเจน…' : '✨ เจนช่องที่ว่าง'}
          </Btn>
        </div>

        {/* โปรไฟล์ */}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="รูปลักษณ์" hint={<GenBtn k="appearance" />}><Textarea rows={2} value={d.appearance ?? ''} onChange={(e) => set({ appearance: e.target.value })} /></Field>
          <Field label="👗 การแต่งตัว / สไตล์ชุด" hint={<GenBtn k="outfit" />}><Textarea rows={2} value={d.outfit ?? ''} onChange={(e) => set({ outfit: e.target.value })} placeholder="เช่น ชุดคลุมจอมเวทสีขาวทอง / สาวเท่แจ็กเก็ตหนัง" /></Field>
          <Field label="ภูมิหลัง / bio" className="sm:col-span-2" hint={<GenBtn k="description" />}><Textarea rows={2} value={d.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="วิธีคิด / ค่านิยม" hint={<GenBtn k="mindset" />}><Textarea rows={2} value={d.mindset ?? ''} onChange={(e) => set({ mindset: e.target.value })} /></Field>
          <Field label="นิสัย / พฤติกรรม" hint={<GenBtn k="behavior" />}><Textarea rows={2} value={d.behavior ?? ''} onChange={(e) => set({ behavior: e.target.value })} /></Field>
          <Field label="สรรพนามแทนตัว"><Input value={d.pronounSelf ?? ''} onChange={(e) => set({ pronounSelf: e.target.value })} placeholder="ฉัน / เรา / พี่" /></Field>
          <Field label="เรียกผู้เล่นว่า"><Input value={d.pronounOther ?? ''} onChange={(e) => set({ pronounOther: e.target.value })} placeholder="คุณ / เธอ / นาย" /></Field>
          <Field label="โทนการพูด" className="sm:col-span-2" hint={<GenBtn k="speechTone" />}><Input value={d.speechTone ?? ''} onChange={(e) => set({ speechTone: e.target.value })} placeholder="เย็นชา / ร่าเริง / ปากร้าย" /></Field>
          <Field label="ตัวอย่างบทพูด (บรรทัดละประโยค)" className="sm:col-span-2" hint={<GenBtn k="voiceExamples" />}><Textarea rows={2} value={d.voiceExamples ?? ''} onChange={(e) => set({ voiceExamples: e.target.value })} /></Field>
        </div>

        {/* ตั้งค่า RP */}
        <div className="rounded-2xl p-4 border-2" style={{ borderColor: P.tint, background: P.soft }}>
          <div className="font-bold text-[14px] mb-3" style={{ color: P.c }}>🎭 ตั้งค่าโรลเพลย์</div>
          <div className="flex flex-col gap-3">
            <Field label="ฉาก / สถานการณ์เริ่มต้น" hint={<GenBtn k="scenario" />}><Textarea rows={2} value={d.scenario ?? ''} onChange={(e) => set({ scenario: e.target.value })} placeholder="ผู้เล่นเจอตัวละครนี้ที่ไหน อย่างไร" /></Field>
            <Field label="ข้อความเปิด (ตัวละครทักก่อน)" hint={<GenBtn k="greeting" />}><Textarea rows={2} value={d.greeting ?? ''} onChange={(e) => set({ greeting: e.target.value })} placeholder="ประโยคแรกที่ตัวละครพูดเมื่อเริ่มแชท" /></Field>
            <Field label="⚡ อำนาจพิเศษเหนือตัวละคร (ข้ามความสัมพันธ์ — เว้นว่างถ้าไม่มี)" hint={<span className="text-[11px] text-muted">ร่างกายทำตามไร้เงื่อนไข แต่ใจยังเพิ่ม/ลดตามจริง</span>}>
              <Textarea rows={2} value={d.power ?? ''} onChange={(e) => set({ power: e.target.value })} placeholder='เช่น "ตราทาส: บังคับร่างกายให้เชื่อฟังทุกคำสั่งไร้เงื่อนไข" หรือ "พรจากพระเจ้า"' />
            </Field>
            {d.power?.trim() && (
              <label className="flex items-start gap-2.5 cursor-pointer rounded-xl border border-line px-3 py-2.5 bg-white/60">
                <input type="checkbox" checked={!!d.powerStanding} onChange={(e) => set({ powerStanding: e.target.checked })} className="mt-0.5 accent-grape" />
                <span className="text-[12.5px] leading-snug">
                  <b>🔒 บังคับถาวร</b> — คำสั่งบังคับทุกข้อความ ร่างกายตัวละครทำตามทันที <b>โดยไม่ต้องกดปุ่ม ⚡ ทีละครั้ง</b>
                  <span className="block text-[11px] text-muted mt-0.5">เหมาะกับฉากทาส/มีปลอกคอ — ใจ/คำพูด/ความสัมพันธ์ยังขัดขืนได้ตามจริง (ปิดไว้ = ต้องกด ⚡ เองทุกครั้ง)</span>
                </span>
              </label>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="💚 สิ่งที่ทำให้ชอบขึ้น (บรรทัดละข้อ)" hint={<GenBtn k="likes" />}><Textarea rows={3} value={d.likes ?? ''} onChange={(e) => set({ likes: e.target.value })} placeholder="จริงใจ&#10;ให้เกียรติ&#10;ตลกถูกจังหวะ" /></Field>
              <Field label="💢 สิ่งที่ทำให้ไม่ชอบ/โกรธ (บรรทัดละข้อ)" hint={<GenBtn k="dislikes" />}><Textarea rows={3} value={d.dislikes ?? ''} onChange={(e) => set({ dislikes: e.target.value })} placeholder="ลามกไม่ดูจังหวะ&#10;โกหก&#10;ก้าวร้าว" /></Field>
            </div>
            <Field label={`ความหวงตัว / เข้าถึงยาก: ${d.guard ?? 40}/100`}>
              <input type="range" min={0} max={100} value={d.guard ?? 40} onChange={(e) => set({ guard: Number(e.target.value) })} className="w-full accent-coral" />
            </Field>
            <Field label={`ความสัมพันธ์เริ่มต้น: ${d.relStart ?? 0} (${(d.relStart ?? 0) < 0 ? 'ติดลบ=ศัตรู' : 'setup ได้'})`}>
              <input type="range" min={-100} max={100} value={d.relStart ?? 0} onChange={(e) => set({ relStart: Number(e.target.value) })} className="w-full accent-grape" />
            </Field>
          </div>
        </div>

        {/* Lorebook — ความรู้เฉพาะฉาก แทรกเมื่อ keyword โผล่ (กันเรื่องเพี้ยนโดยไม่เปลือง context) */}
        <div className="rounded-2xl p-4 border-2 border-line">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="font-bold text-[14px] text-ink">📚 Lorebook — ความรู้เฉพาะฉาก</div>
            <Btn variant="ghost" onClick={addLore}>＋ เพิ่ม</Btn>
          </div>
          <p className="text-[11.5px] text-muted mb-2.5">
            ข้อเท็จจริงที่จะถูกป้อนให้ AI <b>เฉพาะตอนที่ keyword โผล่ในแชทช่วงล่าสุด</b> — เหมาะกับตัวละครรอง สถานที่ ของสำคัญ เหตุการณ์เบื้องหลัง (กันเรื่องเพี้ยนแบบไม่เปลือง context)
          </p>
          {(d.lore ?? []).length === 0 && <div className="text-[12px] text-muted text-center py-2">ยังไม่มี — กด "＋ เพิ่ม"</div>}
          <div className="flex flex-col gap-2">
            {(d.lore ?? []).map((e) => (
              <div key={e.id} className="flex flex-col gap-1.5 rounded-xl border border-line p-2.5 bg-white/60">
                <div className="flex items-center gap-2">
                  <Input value={keysToText(e.keys)} onChange={(ev) => setLore(e.id, { keys: textToKeys(ev.target.value) })}
                    placeholder="keyword คั่นด้วย , เช่น ลูน่า, ร้านขนมปัง" className="flex-1 !text-[12.5px] !py-1.5" />
                  <label className="flex items-center gap-1 text-[11px] font-bold text-muted shrink-0 cursor-pointer select-none" title="แทรกทุกเทิร์นโดยไม่ต้องรอ keyword">
                    <input type="checkbox" checked={!!e.always} onChange={(ev) => setLore(e.id, { always: ev.target.checked })} className="accent-grape" /> ใส่เสมอ
                  </label>
                  <IconBtn onClick={() => delLore(e.id)} title="ลบรายการนี้">🗑</IconBtn>
                </div>
                <Textarea rows={2} value={e.text} onChange={(ev) => setLore(e.id, { text: ev.target.value })}
                  placeholder='ข้อเท็จจริง 1-3 ประโยค เช่น "ลูน่า: เพื่อนสนิทของออเรเลีย เปิดร้านขนมปังป้ายไม้สามก้อนติดจัตุรัสกลางเมือง รู้ว่าออเรเลียหมั้นกับผู้เล่น"' />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-cream/95 backdrop-blur px-6 py-4 border-t border-line flex flex-wrap justify-between items-center gap-2">
        <button className="text-coral font-bold text-sm hover:underline" onClick={() => { onDelete(d.id); onClose(); }}>🗑 ลบตัวละคร</button>
        <div className="flex gap-2 flex-wrap items-center">
          <input ref={fileRef} type="file" accept=".png,.json,image/png,application/json" className="hidden" onChange={onImportFile} />
          <Btn variant="ghost" onClick={() => fileRef.current?.click()}>⬆️ นำเข้าการ์ด</Btn>
          <Btn variant="ghost" onClick={onExportPng}>⬇️ การ์ด PNG</Btn>
          <Btn variant="ghost" onClick={onExportJson}>⬇️ JSON</Btn>
          <Btn variant="ghost" disabled={transBusy || genBusy} onClick={translateToThai}>{transBusy ? 'กำลังแปล…' : '🌐 แปลเป็นไทย'}</Btn>
          <label className="flex items-center gap-1 text-[11px] font-bold text-muted shrink-0 cursor-pointer select-none" title="ไม่ถอดเสียงชื่อตัวละครเป็นไทย (คงชื่อเดิม)">
            <input type="checkbox" checked={keepNames} onChange={(e) => setKeepNames(e.target.checked)} className="accent-grape" /> คงชื่อเดิม
          </label>
          <Btn variant="ghost" onClick={onClose}>ยกเลิก</Btn>
          <Btn variant="primary" color={d.color ?? 'coral'} onClick={() => { if (!d.name.trim()) { toast('ใส่ชื่อตัวละครก่อน', '⚠️'); return; } onSave(d); onClose(); toast('บันทึกแล้ว', '💾'); }}>บันทึก</Btn>
        </div>
      </div>
    </Modal>
  );
}
