# เจ้าของบท/ตัวละคร = แอป Novel (ส่งคอนเทนต์มาให้เกม)

> NOTE สั้น — เนื้อหาเต็มอยู่ฝั่งแอป novel: `d:\test\my_novel\story\findharemfantasy\00-novel-bridge-plan.md`

## ใครทำอะไร
- **แอป Novel (`d:\test\my_novel`)** = เจ้าของ **ตัวละคร + เนื้อเรื่อง + บท + ค่าบอนด์ + คอนเทนต์ R18 ตามเทียร์** — ออกแบบ/เขียน/บาลานซ์ที่นั่น
- **เกมนี้ (Godot)** = runtime ที่ "กิน" คอนเทนต์ที่ส่งออกมา ไปเล่น (ไม่ออกแบบบทเอง)

## ทำไมใช้แอป novel
เกมใช้ Bond 0–100 + เทียร์ (Wary→Lover) + `can_command()` (สั่งเกินระดับ=ปฏิเสธ+ลด) + mature_mode
= กลไกเดียวกับระบบ rel/relLevel/power/guard/R18-gating ที่แอป novel มีพร้อมอยู่แล้ว → ใช้เป็นห้องเขียนบท + ซิมบาลานซ์ได้เลย

## สิ่งที่เกมจะได้รับ (handoff)
| ได้รับ | เอาไปเป็น |
|---|---|
| character card | `CharacterData` (.tres) — `id/display_name/start_bond/portrait_dir` |
| scene beats + choices | `dialogues/*.dialogue` (Dialogue Manager) พร้อม `do GameState.add_bond(...)` |
| เทียร์ + เกณฑ์จบ | ใส่ `GameState.command_req` / ending threshold |
| ภาพ sprite 6 สีหน้า + bg | จากระบบ ref/image-gen ของ novel |

## ของฝั่งเกมที่ใช้ต่อ (ไม่เปลี่ยน)
- `GameState` API (ข้อ 5 ไฟล์ 06) ยังเป็น single source of truth ของ "ค่าตอน runtime"
- novel แค่ "ป้อนคอนเทนต์ตั้งต้น" เข้ามา — โครงเอนจิน/สเปกไฟล์ 06 คงเดิม

## คำถามค้าง (เคาะร่วมกับฝั่ง novel)
ดูหัวข้อ 7 ในไฟล์ฝั่ง novel — POV นิยาย, map rel↔bond, ระดับ R18, รูปแบบ export (.dialogue ตรง ๆ หรือ JSON กลาง), ขอบเขตเฟสแรก (ลิเอน่าคนเดียว vs วางโครงฮาเร็ม)
