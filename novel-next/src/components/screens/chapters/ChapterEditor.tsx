'use client';
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { pal, cx } from '@/lib/theme';

interface ChapterEditorProps {
  chapterId: string;   // เปลี่ยนค่า = สลับบท → re-seed innerHTML
  html: string;        // เนื้อหา HTML เริ่มต้น
  placeholder: string;
  onChange: (html: string) => void;
}

/** เมธอดที่เปิดให้ภายนอกสั่ง (เช่น ExpandPanel แทรกข้อความ) */
export interface ChapterEditorHandle {
  /** ข้อความที่ผู้ใช้ select อยู่ภายใน editor (ว่างถ้าไม่ได้เลือก) */
  getSelectedText: () => string;
  /** แทรก HTML ต่อท้ายเนื้อหาบท แล้ว sync state */
  insertHtmlAtEnd: (html: string) => void;
}

// ปุ่ม toolbar (ใช้ execCommand — deprecated แต่ยังทำงานทุกเบราว์เซอร์)
const TOOLS: { cmd: string; arg?: string; label: string; title: string }[] = [
  { cmd: 'bold', label: 'B', title: 'Bold' },
  { cmd: 'italic', label: 'I', title: 'Italic' },
  { cmd: 'formatBlock', arg: 'H2', label: 'H', title: 'Heading' },
  { cmd: 'formatBlock', arg: 'P', label: '¶', title: 'Paragraph' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
];

/** Rich text editor ที่ render + แก้ HTML แล้วเก็บกลับเป็น HTML (parity กับแอปเดิม) */
export const ChapterEditor = forwardRef<ChapterEditorHandle, ChapterEditorProps>(function ChapterEditor(
  { chapterId, html, placeholder, onChange }, ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const P = pal('sky');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // set innerHTML เฉพาะตอนเปลี่ยนบท (ไม่ทำทุก keystroke → cursor ไม่กระโดด)
  useEffect(() => {
    if (el.current && el.current.innerHTML !== html) el.current.innerHTML = html || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  const emit = () => { if (el.current) onChangeRef.current(el.current.innerHTML); };

  const run = (cmd: string, arg?: string) => {
    document.execCommand(cmd, false, arg);
    el.current?.focus();
    emit();
  };

  useImperativeHandle(ref, () => ({
    getSelectedText() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
      const node = sel.anchorNode;
      if (node && el.current && el.current.contains(node)) return sel.toString();
      return '';
    },
    insertHtmlAtEnd(htmlStr: string) {
      const root = el.current;
      if (!root || !htmlStr) return;
      const frag = document.createElement('div');
      frag.innerHTML = htmlStr;
      while (frag.firstChild) root.appendChild(frag.firstChild);
      emit();
      root.scrollIntoView?.({ block: 'end' });
    },
  }), []);

  return (
    <div>
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {TOOLS.map((tk) => (
          <button
            key={tk.label}
            title={tk.title}
            // mousedown + preventDefault: กัน selection หลุดก่อนสั่ง execCommand
            onMouseDown={(e) => { e.preventDefault(); run(tk.cmd, tk.arg); }}
            className="h-8 min-w-8 px-2 grid place-items-center rounded-xl font-bold text-sm transition hover:brightness-95"
            style={{ background: P.soft, color: '#3a6ea5' }}
          >
            {tk.label}
          </button>
        ))}
      </div>
      <div
        ref={el}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        data-placeholder={placeholder}
        className={cx('ns-editor w-full focus:outline-none text-[17px] leading-[1.85] text-ink/90 font-medium')}
        style={{ minHeight: 360 }}
      />
    </div>
  );
});
