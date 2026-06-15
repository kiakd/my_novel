# สเปกระบบเกม Phase 1 (สำหรับโปรแกรมเมอร์ — ทำตามได้เลย)

> เอกสารนี้คือ "พิมพ์เขียวทางเทคนิค" ของ Phase 1
> เป้าหมาย MVP: **เข้าเกม → ตั้งชื่อ → เล่นบทเปิด (เลือกได้/Bond เปลี่ยน) → เซฟ/โหลด → จบ 2 แบบ**
> เอนจิน: Godot 4.3+ · ภาษา: GDScript · บท: addon Dialogue Manager
> ดูเนื้อบทประกอบที่ [04-ฉากเปิดเกม.md](04-ฉากเปิดเกม.md) และกติกาค่าตัวเลขที่ [05-ระบบเกม-phase1.md](05-ระบบเกม-phase1.md)

---

## A. ภาพรวมสถาปัตยกรรม

### Autoload (Singleton) — ตั้งใน Project Settings > Autoload
| ชื่อ | ไฟล์ | หน้าที่ |
|------|------|---------|
| `GameState` | `scripts/globals/game_state.gd` | เก็บข้อมูลเกมทั้งหมด (ชื่อผู้เล่น, Bond, ตั้งค่า) + กฎคำสั่ง |
| `SceneManager` | `scripts/globals/scene_manager.gd` | สลับฉาก (เมนู↔บท↔จบ) + transition |
| `SaveSystem` | `scripts/globals/save_system.gd` | เซฟ/โหลดลงไฟล์ |
| `AudioManager` | `scripts/globals/audio_manager.gd` | (ออปชัน) เล่นเพลง/เสียง |

> หลักการ: **ข้อมูลเกมอยู่ใน GameState เท่านั้น** ฉากต่าง ๆ แค่ "อ่าน/เขียน" ผ่าน GameState → ทำให้ต่อยอด 3D/VR/simulation ทีหลังได้โดยไม่รื้อ

### ผังการไหลของฉาก (Scene Flow)
```
Boot (autoload init)
  └─> MainMenu
        ├─ New Game ─> NameEntry ─> DialogueScene("liena_opening")
        ├─ Continue ─> (SaveSystem.load) ─> DialogueScene(ที่บันทึกไว้)
        └─ Quit ─> ออกเกม

DialogueScene  ──(บทจบ)──>  ตรวจ GameState.get_ending()
                                   └─> EndingScene(warm/cold) ──> กลับ MainMenu
```

---

## B. รายการระบบทั้งหมดใน Phase 1
| # | ระบบ | ไฟล์หลัก | สถานะ |
|---|------|----------|-------|
| 1 | GameState (ข้อมูล+กฎ) | `globals/game_state.gd` | ✅ ต้องมี |
| 2 | Scene Manager (สลับฉาก) | `globals/scene_manager.gd` | ✅ ต้องมี |
| 3 | Main Menu | `scenes/main_menu.tscn` | ✅ ต้องมี |
| 4 | Name Entry (ตั้งชื่อ) | `scenes/name_entry.tscn` | ✅ ต้องมี |
| 5 | Dialogue System (บท+ตัวเลือก) | `scenes/dialogue_scene.tscn` + Dialogue Manager | ✅ ต้องมี |
| 6 | Bond System (ค่าพันธะ) | อยู่ใน GameState | ✅ ต้องมี |
| 7 | Character Display (สลับสีหน้า) | `scenes/ui/character_view.gd` | ✅ ต้องมี |
| 8 | Background View (เปลี่ยนพื้นหลัง) | `scenes/ui/background_view.gd` | ✅ ต้องมี |
| 9 | Save / Load System | `globals/save_system.gd` | ✅ ต้องมี |
| 10 | Ending System (2 ตอนจบ) | `scenes/ending_scene.tscn` | ✅ ต้องมี |
| 11 | Command/Permission System | อยู่ใน GameState (`can_command`) | ⬜ ใส่เวอร์ชันย่อ |
| 12 | Settings (mature toggle, เสียง) | `scenes/settings.tscn` | ⬜ ถ้าทัน |
| 13 | Audio Manager | `globals/audio_manager.gd` | ⬜ ถ้าทัน |

---

## C. รายละเอียดแต่ละระบบ

### 1) GameState — แหล่งความจริงเดียว (Single Source of Truth)
**หน้าที่:** เก็บสถานะเกมทั้งหมด + กฎ Bond/คำสั่ง · ไม่ยุ่งกับการแสดงผล

**ข้อมูลที่เก็บ**
- `player_name : String` (ดีฟอลต์ "เคน")
- `bond : Dictionary` เช่น `{ "liena": 20 }` — ค่า 0–100 ต่อคน
- `current_dialogue : String` — ชื่อไฟล์/title บทที่กำลังเล่น (ไว้เซฟ)
- `command_req : Dictionary` — ระดับขั้นต่ำของแต่ละคำสั่ง
- `mature_mode : bool` — เปิด/ปิดคำสั่งขั้นผู้ใหญ่

**API (ฟังก์ชันที่ต้องมี)**
```gdscript
func set_player_name(n: String) -> void
func add_bond(who: String, amount: int) -> void      # clamp 0–100, ยิง signal
func get_bond(who: String) -> int
func can_command(who: String, cmd: String) -> bool   # เช็กระดับ + mature gate
func get_ending() -> String                          # "ending_warm" / "ending_cold"
func reset_new_game() -> void                         # ตั้งค่าเริ่มต้นเกมใหม่
```

**Signal**
```gdscript
signal bond_changed(who: String, new_value: int)     # ให้ UI อัปเดต meter/ตรา
signal player_named(name: String)
```

**โค้ดอ้างอิง** ดูเต็มที่ [05-ระบบเกม-phase1.md ข้อ 5](05-ระบบเกม-phase1.md) (มี clampi + can_command พร้อมแล้ว)

---

### 2) SceneManager — สลับฉาก
**หน้าที่:** เปลี่ยนฉากที่เดียว ป้องกันโค้ดเปลี่ยนฉากกระจัดกระจาย

**API**
```gdscript
func goto(scene_path: String) -> void                # เปลี่ยนฉากพร้อม fade (ออปชัน)
func goto_dialogue(title: String) -> void            # เปิด DialogueScene + บอกบทที่จะเล่น
func goto_ending(kind: String) -> void               # เปิด EndingScene แบบ warm/cold
func goto_main_menu() -> void
```
- ใช้ `get_tree().change_scene_to_file(path)` ภายใน
- transition fade ทำเป็น CanvasLayer + ColorRect + Tween (ออปชัน ไม่บังคับ MVP)

---

### 3) Main Menu
**ปุ่ม:** New Game / Continue / (Settings) / Quit
- New Game → `SceneManager.goto("res://scenes/name_entry.tscn")`
- Continue → ปุ่มนี้ **disable ถ้าไม่มีไฟล์เซฟ** (`SaveSystem.has_save()`); ถ้ามี → `SaveSystem.load()` แล้วไปบทที่บันทึก
- Quit → `get_tree().quit()`

**เกณฑ์เสร็จ:** เปิดเกมเห็นเมนู กดปุ่มแล้วไปฉากถูกต้อง

---

### 4) Name Entry — ตั้งชื่อผู้เล่น
- `LineEdit` รับชื่อ + ปุ่มยืนยัน · ถ้าเว้นว่าง ใช้ดีฟอลต์ "เคน"
- กดยืนยัน → `GameState.set_player_name(text)` → `SceneManager.goto_dialogue("liena_opening")`

**เกณฑ์เสร็จ:** ชื่อที่พิมพ์ไปโผล่ในบท (ผ่าน `{player_name}`)

---

### 5) Dialogue System — บท + ตัวเลือก (แกนหลักของเกม)
**ใช้ addon Dialogue Manager** (ลงจาก Asset Library)

**โครงฉาก `dialogue_scene.tscn`**
```
DialogueScene (Node2D/Control)
├── BackgroundView      (ระบบ 8)
├── CharacterView       (ระบบ 7)
├── DialogueBalloon     (จาก Dialogue Manager — กล่องข้อความ+ตัวเลือก)
```

**การทำงาน**
1. ฉากเริ่ม → อ่าน `GameState.current_dialogue` (เช่น "liena_opening")
2. เรียก `DialogueManager.show_dialogue_balloon(load("res://dialogues/liena_opening.dialogue"), title)`
3. ในไฟล์ `.dialogue` สั่งงานระบบอื่นผ่าน mutation:
   - ปรับ Bond: `do GameState.add_bond("liena", 10)`
   - เปลี่ยนสีหน้า: `do CharacterView.set_emotion("liena", "angry")`
   - เปลี่ยนฉาก: `do BackgroundView.set_bg("bg_camp")`
   - แทนชื่อ: ใช้ `{{GameState.player_name}}` (syntax ของ Dialogue Manager)
4. บทจบ (signal `dialogue_ended`) → `var e = GameState.get_ending(); SceneManager.goto_ending(e)`

**ตัวอย่างไฟล์ `.dialogue` (ตัดมาจากไฟล์ 04)**
```
~ start
Liena: เจ้า...! มนุษย์! ลงไปจากตัวข้านะ!
{{player_name}}: โอ๊ย... เดี๋ยวนะ ฉันไปทับอะไร—
- ขอโทษจริง ๆ ฉันจะหาทางลบมันให้!
    do GameState.add_bond("liena", 10)
    => after_choice
- เธอนั่นแหละมายืนตรงนี้เอง!
    do GameState.add_bond("liena", -10)
    => after_choice

~ after_choice
Liena: ...
=> END
```
**เกณฑ์เสร็จ:** เล่นบทเปิดได้ครบ เลือกได้ Bond เปลี่ยนจริง (debug print ยืนยัน) ชื่อผู้เล่นแสดงถูก

---

### 6) Bond System
อยู่ใน GameState (ข้อ 1) — กฎ:
- ทุกการเปลี่ยนผ่าน `add_bond()` เท่านั้น (clamp 0–100, ยิง `bond_changed`)
- UI ที่ subscribe `bond_changed` จะอัปเดตเอง (เช่น แถบ Bond / ความสว่างตรา)
- ค่าเริ่มต้น/เกณฑ์ตอนจบ: ดู [05 ข้อ 1](05-ระบบเกม-phase1.md)

---

### 7) Character Display — สลับสีหน้า
**หน้าที่:** แสดงภาพครึ่งตัวตัวละคร + เปลี่ยนสีหน้าตามคำสั่งในบท

**API (`character_view.gd`)**
```gdscript
func show_character(id: String) -> void          # โผล่ตัวละคร
func set_emotion(id: String, emotion: String) -> void   # neutral/angry/surprised/blush/sad/smile
func hide_character(id: String) -> void
```
- โหลดภาพจาก `assets/characters/{id}/{id}_{emotion}.png`
- 6 สีหน้าตามสเปก [03-heroine-เอลฟ์.md](03-heroine-เอลฟ์.md)

**เกณฑ์เสร็จ:** สั่ง `set_emotion("liena","angry")` ในบทแล้วภาพเปลี่ยนจริง

---

### 8) Background View — เปลี่ยนพื้นหลัง
**API (`background_view.gd`)**
```gdscript
func set_bg(id: String) -> void   # bg_field / bg_camp
```
- โหลดจาก `assets/backgrounds/{id}.png` · ใส่ fade เปลี่ยนภาพได้ (ออปชัน)

---

### 9) Save / Load System
**รูปแบบไฟล์:** ใช้ `ConfigFile` (ง่ายสุดสำหรับมือใหม่) เก็บที่ `user://save_01.cfg`

**ข้อมูลที่เซฟ**
```ini
[meta]
version = 1

[player]
name = "เคน"

[bonds]
liena = 35

[progress]
current_dialogue = "liena_opening"
title = "after_choice"          ; จุดในบทที่เล่นถึง (ถ้าทำ checkpoint)

[settings]
mature_mode = false
```

**API (`save_system.gd`)**
```gdscript
func has_save() -> bool
func save(slot: int = 1) -> void     # อ่านค่าจาก GameState เขียนลงไฟล์
func load(slot: int = 1) -> void     # อ่านไฟล์ เขียนกลับเข้า GameState
func delete(slot: int = 1) -> void
```
- **MVP แบบง่าย:** เซฟตอน "จบบท/เปลี่ยนฉาก" 1 จุดก็พอ (ยังไม่ต้องเซฟกลางบรรทัด)
- ปุ่ม Save/Load จะอยู่ในเมนู (Continue โหลด slot 1)

**เกณฑ์เสร็จ:** เล่นไปจน Bond เปลี่ยน → Save → ปิดเกม → เปิดใหม่ → Continue → Bond/ชื่อกลับมาเท่าเดิม

---

### 10) Ending System — 2 ตอนจบ
- `ending_scene.tscn` รับพารามิเตอร์ `kind` ("warm"/"cold")
- แสดงข้อความ/ภาพต่างกันตามตอนจบ (เนื้อหาในไฟล์ 04 ฉาก 7)
- จบแล้วมีปุ่มกลับ Main Menu
- เลือกตอนจบจาก `GameState.get_ending()` (เกณฑ์ Bond ≥ 40 = warm)

---

### 11) Command / Permission System (เวอร์ชันย่อใน Phase 1)
**หน้าที่:** ตรวจว่า "คำสั่ง" ที่ผู้เล่นเลือก ทำได้ไหม ณ ระดับ Bond ปัจจุบัน
- ใช้ `GameState.can_command(who, cmd)` (มีโค้ดแล้วใน [05 ข้อ 5](05-ระบบเกม-phase1.md))
- ในบท: ตัวเลือกคำสั่งเรียกเช็กก่อน เช่น
  ```
  - [สั่ง] "มานี่"
      if GameState.can_command("liena", "come_here")
          do GameState.add_bond("liena", 3)
          => cmd_obey
      else
          do GameState.add_bond("liena", -5)
          => cmd_refuse
  ```
- **Phase 1 ทำแค่ 1 คำสั่ง** (เช่น "come_here" ขั้น 20) เพื่อพิสูจน์กลไก
- **ขั้นสูง (intimate, tier 40+):** ออกแบบโครงรองรับด้วย `mature_mode` gate เท่านั้น —
  ตัว "เนื้อหาฉาก" ของขั้นนั้นเป็น **งาน content แยก หลัง MVP** ไม่อยู่ในขอบเขต Phase 1
  (ตัวละครทั้งหมดเป็นผู้ใหญ่ · ออกแบบให้ทำเวอร์ชัน all-age ได้ด้วยการปิด mature_mode)

---

### 12) Settings (ถ้าทัน)
- toggle `mature_mode` (เขียนกลับ `GameState.mature_mode`)
- สไลเดอร์เสียง master/bgm/sfx (ผูกกับ AudioManager / AudioServer bus)

### 13) Audio Manager (ถ้าทัน)
```gdscript
func play_bgm(id: String) -> void
func play_sfx(id: String) -> void   # เช่น "impact" (ตูม), "seal" (ตราติด)
```

---

## D. นิยามข้อมูล (Resource) — เผื่อหลายตัวละครในอนาคต
แนะนำทำ `CharacterData` เป็น Resource เพื่อไม่ hard-code:
```gdscript
# scripts/characters/character_data.gd
extends Resource
class_name CharacterData
@export var id: String            # "liena"
@export var display_name: String  # "ลิเอน่า"
@export var start_bond: int = 20
@export var portrait_dir: String  # "res://assets/characters/liena/"
```
> Phase 1 มีแค่ลิเอน่า แต่ทำโครงนี้ไว้ พอเพิ่มคนที่ 2 (Phase 2) แค่สร้าง resource ใหม่

---

## E. Definition of Done (Phase 1 ถือว่าเสร็จเมื่อ...)
- [ ] เปิดเกมเห็น Main Menu
- [ ] New Game → ตั้งชื่อ → ชื่อโผล่ในบท
- [ ] เล่นบทเปิดได้ครบ (ตก→ตีตรา→คุย→แคมป์)
- [ ] ตัวเลือกทำงาน + Bond เปลี่ยนถูกต้อง (เช็กด้วยค่าจริง)
- [ ] ภาพตัวละครเปลี่ยนสีหน้า + พื้นหลังเปลี่ยนตามบท
- [ ] มีคำสั่งทดลองอย่างน้อย 1 อัน (can_command ทำงาน: ถึงขั้น=ทำตาม / ไม่ถึง=ปฏิเสธ+Bond ลด)
- [ ] Save แล้ว Continue กลับมาได้ค่าเดิม
- [ ] จบเกมได้ 2 แบบตามเกณฑ์ Bond (ลองทั้ง warm และ cold)
- [ ] เล่นรวดเดียวจบไม่ crash

---

## F. ลำดับลงมือ (Build Order — ทำตามนี้)
1. ตั้งโปรเจกต์ + โฟลเดอร์ ([04-โครงสร้างโปรเจกต์](../04-โครงสร้างโปรเจกต์.md)) + `git init`
2. ทำ `GameState` (ข้อ 1) ให้ครบ + ทดสอบ add_bond/clamp ด้วย print
3. ทำ `SceneManager` (ข้อ 2) สลับฉากเปล่า ๆ ได้
4. ลง Dialogue Manager → แสดงบท 3 บรรทัดบนจอ (ข้อ 5)
5. ต่อตัวเลือก → กดแล้ว Bond เปลี่ยน (ยืนยันด้วย print)
6. ทำ CharacterView + BackgroundView (ข้อ 7–8) ให้บทสั่งเปลี่ยนภาพได้
7. ใส่บทเต็มจากไฟล์ 04 + ใส่คำสั่งทดลอง 1 อัน (ข้อ 11)
8. ทำ Ending 2 แบบ (ข้อ 10)
9. ทำ Main Menu + Name Entry (ข้อ 3–4)
10. ทำ Save/Load (ข้อ 9) + ผูกปุ่ม Continue
11. เทสต์ตาม Definition of Done (หมวด E) ทั้ง 2 เส้นทาง
12. (ถ้าทัน) Settings + Audio

> ทำทีละข้อ ให้ "รันได้" ทุกข้อก่อนไปข้อถัดไป — อย่าทำหลายระบบค้างพร้อมกัน
