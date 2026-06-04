# Novel Studio — Next.js frontend

migrate จาก design template (`_design_src/`) → Next.js (App Router) + Bun + TypeScript + Tailwind

## รัน
```bash
bun install
bun run dev        # → http://localhost:3001
```
Backend เดิม (Bun/Elysia `../novel/server.ts`) ต้องรันที่ `:3000` คู่กัน —
Next จะ proxy `/api/*` และ `/uploads/*` ไปให้อัตโนมัติ (ดู `next.config.mjs`, ตั้ง `BACKEND_URL` เปลี่ยนได้)

## โครงสร้าง (ทุกอย่างเป็น component แก้ที่เดียว)
```
src/
├─ app/                     # routing (App Router) — 1 หน้า = 1 โฟลเดอร์
│  ├─ layout.tsx            # root: ฟอนต์ + I18nProvider + AppShell + Toaster
│  ├─ page.tsx              # redirect → /chapters
│  ├─ read/page.tsx         # โหมดอ่าน (immersive เต็มจอ, mobile-first)
│  └─ <screen>/page.tsx     # plot, characters, locations, relations, chapters,
│                           #   timeline, imagegen, ailog, settings
├─ components/
│  ├─ ui/                   # UI kit (Btn, Card, Tag, Modal, Drawer, …) ไฟล์ละชิ้น
│  ├─ layout/               # Header, Sidebar, NavItem, StorySelector, SaveIndicator, LangToggle
│  └─ screens/<screen>/     # หน้าจอ + sub-component ของหน้านั้น
└─ lib/
   ├─ theme.ts              # PALETTE + pal()/darken()/cx()  ← แก้สีที่นี่
   ├─ nav.ts                # โครงเมนู
   ├─ types.ts              # โมเดลข้อมูล UI
   ├─ mock-data.ts          # ข้อมูลตัวอย่าง (จะแทนด้วย /api/state)
   └─ i18n/                 # dict.ts (TH/EN) + provider/hook (useT)
```

## design tokens
แก้สี/ฟอนต์/เงา/animation ที่ `tailwind.config.ts` + `src/lib/theme.ts` + `src/app/globals.css`

## ฟีเจอร์เด่น
- **โหมดอ่าน `/read`** — immersive เต็มจอ (overlay), เลือกเรื่อง+บทในสารบัญ, 3 ธีม (กระดาษ/ซีเปีย/กลางคืน), ปรับขนาดอักษร, จำบทล่าสุด (localStorage). อ่านบนมือถือได้ดี
- **AI "ขยายงานเขียน" (หน้า chapters)** — ปุ่ม ✨ ขยาย → แผง (Drawer): พิมพ์/เลือกข้อความ + **แนบรูปฉาก/ท่าทาง** (อ่านรูปด้วย WD14 โลคัลผ่าน `/api/ref/tag` → booru tags) + เลือกโหมด **ฉาก / แอ็กชัน / ขยายสำนวน** → `/api/expand` คืนร้อยแก้ว → แทรกต่อท้ายบท/คัดลอก. แก้รูปด้วย `ChapterEditor` (imperative `insertHtmlAtEnd`/`getSelectedText`)
- **Sidebar เปิดปิดได้** — เมนูหลัก (ปุ่ม ☰ ในหัว; desktop ย่อความกว้าง, มือถือเป็น overlay) + แถบรายชื่อบทในหน้า chapters (ปุ่ม toggle) — จำสถานะใน localStorage

## API ที่ frontend เรียก (เพิ่ม)
`/api/expand` (ขยายงานเขียน), `/api/ref/tag` (รูป→WD14 tags), `/api/generate` (raw) — ดู `src/lib/api.ts`

## สถานะ
- [x] UI ครบ 9 หน้า + shell + i18n (TH/EN)
- [x] ต่อ backend จริง: `/api/state` (+ autosave/optimistic-lock `__rev`)
- [x] โหมดอ่าน `/read` + AI ขยายงานเขียน (แนบรูป WD14) + sidebar เปิดปิด
- [ ] เติมฟีเจอร์ลึกของ image-gen: reference sheet, pose extract/upload, continue-story dialog
- [ ] ต่อ continue/review/summary ในแถบ AI กับ `/api/generate` จริง (ตอนนี้ยัง stub)
