# Design Prompt — คลังนิยาย (Next.js UI)

> เอาไปวางใน v0 / Lovable / Figma AI / Claude / ChatGPT เพื่อสร้าง UI design
> มี 2 เวอร์ชัน: (A) ภาษาไทยสั้น ใช้กับเครื่องมือทั่วไป, (B) ภาษาอังกฤษละเอียด ใช้กับ v0/Lovable

---

## (A) เวอร์ชันภาษาไทย — โยนให้ AI ออกแบบ

```
ออกแบบ web app ชื่อ "คลังนิยาย" — เครื่องมือเขียนนิยาย/แต่งเรื่องช่วยด้วย AI (ภาษาไทยเป็นหลัก)
สำหรับนักเขียนคนเดียวใช้บนเดสก์ท็อป

Layout: 3 ส่วน
- Header บนสุด: ชื่อแอป + dropdown เลือกเรื่อง + ปุ่ม [เรื่องใหม่][เปลี่ยนชื่อ][ลบ] + ตัวบอกสถานะเซฟ
  (กำลังบันทึก…/บันทึกแล้ว) + ปุ่มฝั่งขวา [Sync DB][Export][Export .md][Import]
- Sidebar ซ้าย: เมนูแท็บ 2 กลุ่ม
  "เนื้อหา": 📝 โครงเรื่อง, 👤 ตัวละคร, 🗺️ สถานที่, 🔗 ความสัมพันธ์, 📖 บทนิยาย, ⏱ ไทม์ไลน์, 🖼️ เจนรูป
  "ระบบ": 📋 AI Log, ⚙️ ตั้งค่า
- Content ขวา: เนื้อหาของแท็บที่เลือก

ธีม: dark mode เป็นหลัก, โทนหรูสุขุม (ม่วง/น้ำเงินเข้ม accent), อ่านสบายตาเวลาเขียนยาวๆ,
ฟอนต์อ่านง่ายรองรับภาษาไทย, มี density พอดี (ข้อมูลเยอะแต่ไม่อึดอัด)

รายละเอียดแต่ละแท็บ:
1. โครงเรื่อง — ฟอร์ม: แนวเรื่อง, แก่นเรื่อง, premise, โครงเรื่องละเอียด, กฎของโลก,
   style guide, vocabulary palette, do/don't list (เป็น textarea ใหญ่หลายช่อง)
2. ตัวละคร — grid การ์ดตัวละคร (รูป+ชื่อ+บทบาท), กดเปิด modal แก้: ลักษณะกาย/ประวัติ/สกิล/
   วิธีคิด/นิสัย/การพูด(สรรพนาม+โทน)+ตัวอย่างบทพูด, และแท็บ "visual" สำหรับเจนรูป
   (promptAnchor/negativeAnchor, outfit, สไตล์ anime/photoreal) + ตัวเลือกสีประจำตัว
3. สถานที่ — การ์ด/ลิสต์ + modal (ชื่อ, โซน, บรรยากาศ, คำอธิบาย, รายละเอียด)
4. ความสัมพันธ์ — กราฟโหนดตัวละครเชื่อมเส้นความสัมพันธ์ (ลากได้) + modal แก้ความสัมพันธ์
5. บทนิยาย — ซ้าย: ลิสต์บท (เรียง/เพิ่ม/ลบ); ขวา: rich text editor เต็มจอ +
   แถบเครื่องมือ AI [เจนต่อ][รีวิว][สรุปอัตโนมัติ] + นับจำนวนคำ
6. ไทม์ไลน์ — ลำดับเหตุการณ์เรียงตามเวลา ผูกกับบท
7. เจนรูป — panel เลือก provider, ช่อง prompt/negative, ปุ่มแปลงฉาก→prompt อัตโนมัติ,
   เลือกท่าโพส (pose preset thumbnails), แกลเลอรีรูปที่เจนต่อบท, reference sheet ตัวละคร 6 มุม
8. AI Log — ตารางประวัติเรียก AI (เวลา/endpoint/provider/model/สถานะ/เวลาที่ใช้) กดดูรายละเอียดเต็ม
9. ตั้งค่า — provider keys, model default, ฯลฯ

ขอ: component ที่สวยสะอาด, มี empty state, loading state, modal/dialog, toast แจ้งเตือน,
และ responsive พอใช้บนจอเล็กได้ (แต่เน้น desktop). ใช้ Tailwind + shadcn/ui
```

---

## (B) เวอร์ชันภาษาอังกฤษละเอียด — สำหรับ v0 / Lovable

```
Build a desktop-first web app called "คลังนิยาย" (Novel Studio) — an AI-assisted
fiction-writing workspace for a single author. Primary language is Thai; UI labels in Thai.
Stack: Next.js 15 App Router, Tailwind CSS, shadcn/ui, TanStack Query. Dark theme by default.

DESIGN LANGUAGE
- Mood: focused, premium, calm — long writing sessions shouldn't tire the eyes.
- Dark UI, deep navy/charcoal surfaces, a single violet→indigo accent for primary actions.
- Comfortable typography that renders Thai cleanly; generous line-height in editors.
- Information-dense but breathable; clear section titles + helper descriptions.

APP SHELL (persistent)
- Top header: app title "📖 คลังนิยาย", a story <Select> dropdown, buttons
  [+ New story][✏️ Rename][🗑 Delete], a live save indicator ("saving…" / "saved ✓"),
  and right-aligned actions [🔄 Sync DB][💾 Export][📝 Export .md][📂 Import].
- Left sidebar with two labeled groups:
  CONTENT: 📝 Plot, 👤 Characters, 🗺️ Locations, 🔗 Relations, 📖 Chapters, ⏱ Timeline, 🖼️ Image Gen
  SYSTEM: 📋 AI Log, ⚙️ Settings
- Main content area renders the active route.

SCREENS
1) Plot — a form of large textareas: Genre, Theme, Premise, Detailed plot, World rules,
   Style guide, Vocabulary palette, Do/Don't list. Auto-saving.
2) Characters — responsive grid of character cards (avatar, name, role badge). Clicking opens
   a tabbed modal: "Profile" (appearance, bio, skill, mindset, behavior, speech: self/other
   pronouns + tone + sample lines) and "Visual" (promptAnchor, negativeAnchor, default outfit,
   anime/photoreal toggle, model preference) + a per-character accent color picker.
3) Locations — cards/list + edit modal (name, zone, mood, description, details).
4) Relations — an interactive node graph: character nodes connected by labeled relationship
   edges, draggable, with a side modal to edit a relation (from→to, type, feeling).
5) Chapters — two-pane: left = ordered chapter list (reorder up/down, add, delete);
   right = a full-height rich-text editor (Tiptap) with a floating AI toolbar
   [Continue ▶][Review][Auto-summary] and a live word/character counter.
6) Timeline — vertical chronological event list, each linked to a chapter.
7) Image Gen — a generation panel: provider selector (NovelAI/TensorArt/Civitai/ComfyUI),
   positive/negative prompt fields, a "Scene → prompt" button, a pose-preset picker
   (thumbnail grid), per-chapter image gallery, and a character "reference sheet" view
   (6 angle thumbnails). Show generation progress states.
8) AI Log — a table (timestamp, endpoint, provider, model, status, latency ms); row click
   opens a drawer with the full system/user prompt and response.
9) Settings — provider API keys, default model, ComfyUI URL, etc.

REQUIREMENTS
- Provide polished empty states, loading skeletons, error states, dialogs, and toast feedback.
- Use shadcn/ui primitives (Button, Card, Dialog, Tabs, Select, Textarea, Table, Sheet, Toast).
- Desktop-first but gracefully usable on smaller screens.
- Output clean, composable React Server/Client Components with Tailwind classes.
```

---

## ทิป
- ถ้าใช้ **v0.dev**: วางเวอร์ชัน (B) แล้วค่อยขอทีละหน้า ("now build the Chapters screen…") จะได้ผลคมกว่าขอทีเดียวทั้งแอป
- ถ้าใช้ **Figma**: เอาเวอร์ชัน (A)/(B) ไปใส่ใน FigJam/AI plugin เพื่อร่าง wireframe ก่อน
- อยากได้ภาพจริงของเดิมไปแนบ: เปิด `novel.html` รันแล้ว screenshot แต่ละแท็บแนบไปกับ prompt — ช่วยให้ AI คุม layout ใกล้ของเดิม
