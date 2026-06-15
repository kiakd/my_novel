# findharemfantasy — game design (concept + docs)

สำรองเฉพาะ **เอกสาร concept/design (.md) + dialogue schema** จากโปรเจกต์เกม Godot
`D:\test\game\findharemfantasy` ก่อนล้างเครื่อง (2026-06-15)

เกมนี้คือเกมจีบสาวที่ผูกกับแอป novel — ดู [[findharemfantasy-bridge]]

## มีอะไรในนี้
- `GAME-CLAUDE.md` — ภาพรวม/กติกาโปรเจกต์เกม (เดิมคือ CLAUDE.md ของ repo เกม)
- `docs/` — เอกสารออกแบบ: ภาพรวม, เลือก 2D/3D, แผนงานเฟส, โครงสร้าง, สเปก 3D art,
  note simulation, multi-platform + `phase-1-design/` (โลก/เนื้อเรื่อง/ตัวเอก/heroine เอลฟ์/ฉากเปิด/ระบบเกม/spec โปรแกรมเมอร์)
  + `phase-1-handoff/` (character-data)
- `dialogues/` — `SCHEMA.md` + `liena_opening.json`
- `assets/**/README.md` — สเปก asset (ตัว asset จริงไม่ได้เอามา)

## ⚠️ สิ่งที่ไม่ได้สำรอง (อยู่บนเครื่องเดิม จะหายตอนล้าง)
- Godot project จริง: `scenes/`, `scripts/` (.gd), `project.godot`, `.godot/` cache
- `assets/` (รูป/เสียง/โมเดล ~16MB) — เจน/หาใหม่ได้จากสเปกใน docs
- `docs/godot-reference/` (~6MB) — Godot class reference โหลดใหม่ได้

ถ้าจะรื้อโปรเจกต์เกมใหม่ ใช้ docs ในนี้เป็นต้นทางได้ทั้งหมด
