# CLAUDE.md — กฎและคู่มือโปรเจกต์ (อ่านก่อนทำงานทุกครั้ง)

โปรเจกต์: **Find Harem Fantasy** — เกมจีบสาว (dating sim) แฟนตาซีบน Godot 4 รองรับ VR ในอนาคต
เอกสารส่วนใหญ่เป็น **ภาษาไทย** อยู่ใน `docs/`

---

## 🚦 กฎข้อแรกสุด: อ่าน docs ก่อนลงมือเสมอ (ห้ามเขียนขึ้นเอง)
1. **เริ่มงานทุกครั้ง → เปิด [docs/INDEX.md](docs/INDEX.md) ก่อน** เพื่อหาว่าเรื่องที่ทำอยู่ไฟล์ไหน
2. เปิด **เฉพาะไฟล์ที่เกี่ยวข้อง** (อย่าอ่านรวดทั้งโฟลเดอร์)
3. ก่อนเขียนโค้ดระบบใด ๆ → **อ่าน spec ของระบบนั้นใน `docs/` ให้จบส่วนที่เกี่ยวก่อน** (เริ่มที่ [phase-1-design/06](docs/phase-1-design/06-spec-ระบบเกม-สำหรับโปรแกรมเมอร์.md)) — ทำตาม spec อย่าออกแบบเอง ถ้า spec ไม่ครอบคลุมให้ถามก่อน
4. ก่อนใช้ API/คลาสของ **Godot** → เปิด **[docs/godot-reference/INDEX.md](docs/godot-reference/INDEX.md)** แล้วอ่าน doc ทางการของส่วนนั้น (หรือกด F1 ในตัว editor) — **ห้ามเดา API** ห้ามเขียนเมธอดที่ไม่มีจริง
5. งาน cross-platform → อ่าน [docs/07-รองรับหลายแพลตฟอร์ม.md](docs/07-รองรับหลายแพลตฟอร์ม.md) ก่อน (อินพุต/ฟอนต์/เรนเดอร์/เซฟ ต้องทำตามกฎ cross-platform)
6. **เพิ่ม/ลบไฟล์เอกสาร → ต้องอัปเดต `docs/INDEX.md` ทันที** (ห้ามลืม ไม่งั้น index เพี้ยน)

## 🎯 สถานะปัจจุบัน
- เฟส: **Phase 1 (MVP)** — เป้า: เข้าเกม → ตั้งชื่อ → เล่นบทเปิด → เซฟ/โหลด → จบ 2 แบบ
- **โครงโปรเจกต์ Godot รันได้แล้ว** ✅ (ทดสอบ headless ผ่าน ไม่มี error) — เมนู/ตั้งชื่อ/ระบบบท JSON/Bond/เซฟ-โหลด/ตอนจบ 2 แบบ ครบ
- คงเหลือ: ใส่บทเต็ม (คนเขียนกรอก JSON ตาม `dialogues/SCHEMA.md`), ใส่รูปตัวละคร/พื้นหลัง, ขัดเกลา UI, (ออปชัน) สลับไป Dialogue Manager
- โครงไฟล์โค้ด: `scripts/globals/` (autoloads), `scripts/ui/` (ฉาก), `scenes/`, `dialogues/`

## 🧱 สแต็คและเครื่องมือ (ติดตั้งแล้วในเครื่องนี้)
- **Godot 4.6.3** (ตัวธรรมดา, ใช้ **GDScript**)
  exe: `C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\Godot_v4.6.3-stable_win64.exe`
- **Godot MCP server** (`@coding-solo/godot-mcp`) — ต่อกับ Claude แล้ว (server ชื่อ `godot`)
  ใช้สั่ง: เปิด editor, รันโปรเจกต์, ดึง debug output, สร้าง/แก้ scene ผ่าน MCP ได้เลย
- **Dialogue Manager** (addon) — ใช้ทำระบบบทสนทนา (ลงจาก Asset Library ตอนเริ่มโค้ด)
- Node.js v25, npm 11, Git

## 📐 กฎการเขียนโค้ด (Conventions)
- ภาษา: **GDScript** (Godot 4 syntax — typed where practical)
- ตั้งชื่อไฟล์/โฟลเดอร์/asset: `ตัวพิมพ์เล็ก_มีขีดล่าง` (เช่น `game_state.gd`, `liena_neutral.png`)
- โครงโฟลเดอร์: ตาม [docs/04-โครงสร้างโปรเจกต์.md](docs/04-โครงสร้างโปรเจกต์.md) (`assets/ scenes/ scripts/ dialogues/`)
- **สถาปัตยกรรมหลัก:** ข้อมูลเกมทั้งหมดอยู่ใน Autoload `GameState` ที่เดียว — ฉาก/UI แค่อ่าน-เขียนผ่านมัน
  (ทำแบบนี้เพื่อให้ต่อยอด 3D/VR/simulation ภายหลังได้โดยไม่ต้องรื้อ)
- **Cross-platform เป็นค่าตั้งต้น:** เซฟใช้ `user://` เท่านั้น · อินพุตผ่าน InputMap action (รองรับ เมาส์/ทัช/จอย/VR) · UI ใช้ anchor+container ไม่ fix พิกัด · ข้อความไทยต้องมีฟอนต์ฝัง · รายละเอียด [docs/07](docs/07-รองรับหลายแพลตฟอร์ม.md)
- ทุกการเปลี่ยน Bond ผ่าน `GameState.add_bond(who, amount)` เท่านั้น (clamp 0–100 + ยิง signal)

## 🎮 กฎด้านดีไซน์ (อย่าหลุดสโคป)
- **Bond = 0–100 ต่อตัวละคร**, เกณฑ์ตอนจบเริ่มต้น ≥ 40 = warm
- **ระบบคำสั่งเป็นขั้น:** คำสั่งปลดล็อกตามระดับ Bond (ดู [05](docs/phase-1-design/05-ระบบเกม-phase1.md))
- **MVP มาก่อนเสมอ:** ทำสิ่งที่ทำเครื่องหมาย ✅ ใน [06 หมวด B](docs/phase-1-design/06-spec-ระบบเกม-สำหรับโปรแกรมเมอร์.md) ให้ครบก่อน ค่อยแตะ ⬜
- **เนื้อหาผู้ใหญ่ (intimate, tier 40+):** ตัวละครทั้งหมดเป็น**ผู้ใหญ่** · ทำเป็นระบบ gate ด้วย `mature_mode` (เปิด/ปิดใน Settings เพื่อรองรับเวอร์ชัน all-age) · **ตัวเนื้อหาฉากอยู่นอกขอบเขต Phase 1** เป็นงาน content แยกหลัง MVP

## ✅ นิยาม "เสร็จ" ของ Phase 1
ดูเช็กลิสต์ Definition of Done ที่ [06 หมวด E](docs/phase-1-design/06-spec-ระบบเกม-สำหรับโปรแกรมเมอร์.md) — ต้องผ่านครบทุกข้อ เล่นรวดเดียวจบไม่ crash ทั้งเส้น warm และ cold

## 🔧 เวลาเขียนโค้ด/ทดสอบ
- ใช้ Godot MCP (`godot`) รันโปรเจกต์ + ดึง debug output มาตรวจ แทนการเดา
- ทำทีละระบบตาม Build Order ([06 หมวด F](docs/phase-1-design/06-spec-ระบบเกม-สำหรับโปรแกรมเมอร์.md)) — แต่ละข้อต้อง "รันได้" ก่อนไปต่อ
- มี skill ช่วยงานนี้: ใช้ `/godot-gamedev` (ดู `.claude/skills/godot-gamedev/`)
