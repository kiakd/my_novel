# Phase 1 Handoff — จากฝั่ง Novel → เกม

> ฝั่ง Novel (`d:\test\my_novel`) ผลิต asset Phase 1 ให้ → ฝั่งเกมเอาไปต่อ Godot ได้เลย
> วันที่ส่ง: 2026-06-14 · ขอบเขต: บทเปิด (ตก→ตีตรา→คุย→แคมป์) · ตัวละคร: ลิเอน่า + เคน
> ✅ ทำตาม schema/โครงสร้างที่ฝั่งเกมวางไว้ (`dialogues/SCHEMA.md` + README ในแต่ละ asset folder)

## 📦 ของที่ส่งมา
| ไฟล์ | คือ | สถานะ |
|------|-----|-------|
| `dialogues/liena_opening.json` | บทเปิดเต็ม (ตาม SCHEMA.md — node/choices/bond/emotion/bg) | ✅ พร้อมใช้ |
| `docs/phase-1-handoff/character-data.md` | สเปกตัวละคร ลิเอน่า+เคน | ✅ |
| `assets/backgrounds/bg_field.png` | ทุ่ง/ป่าโบราณกลางวัน 16:9 (ไม่มีคน) | ✅ |
| `assets/backgrounds/bg_camp.png` | แคมป์กลางป่ากลางคืน 16:9 (ไม่มีคน) | ✅ |
| `assets/characters/liena/liena_{6 อารมณ์}.png` | sprite 6 สีหน้า (คงหน้า/ชุด) **พื้นหลังโปร่ง (RGBA)** | ✅ พร้อมใช้ |

## 🔧 วิธีต่อ (integration)
1. บทเป็น **JSON ตาม `dialogues/SCHEMA.md`** — เกมโหลด `liena_opening.json` ผ่าน `GameState.current_dialogue` (ไม่ต้องใช้ Dialogue Manager ก็ได้ถ้าเกมมี loader JSON เองตาม schema)
2. node ใช้ฟิลด์: `speaker` (narration/player/liena) · `text` (`{player_name}` แทนชื่อ) · `emotion` · `bg` · `bond:{liena:N}` · `next`/`choices`
3. ค่าเริ่ม `bond["liena"]=20` · จบ `>=40 → warm / else cold` (เกมเช็คหลังบทจบ `END` ตาม `game_state.gd`)
4. ทดสอบ 2 เส้น: เลือกดีตลอด = warm · เลือกแย่ = cold

## 🎨 หมายเหตุ sprite
- ✅ **พื้นหลังโปร่ง (RGBA) แล้ว** — ตัดพื้นด้วย BiRefNet ใน ComfyUI (pipeline: `LoadBackgroundRemovalModel`→`RemoveBackground`→**`InvertMask`**→`JoinImageWithAlpha`) · โมเดล `birefnet.safetensors` ติดตั้งใน ComfyUI `models/background_removal/` แล้ว → เจน sprite ตัวอื่นในอนาคตตัดพื้นได้เลย
- ✅ คงหน้า/ชุด/หูเป๊ะทั้ง 6 ใบ (seed-lock 424242)
- 🟡 **สีหน้าเปลี่ยนค่อนข้างน้อย** (angry/surprised ไม่จัดมาก) — เพราะ LoRA `TA_trained` 2 ตัวของ flow ครอบใบหน้าแรง · ถ้าต้องการอารมณ์ชัดขึ้น: ลด strength LoRA (~0.4–0.5) หรือ inpaint หน้า · บอกฝั่ง Novel เจนใหม่ได้

## ลิงก์ออกแบบเต็ม (ฝั่ง Novel)
`d:\test\my_novel\story\findharemfantasy\` — 00 bridge · 01 bible · 02 world · 03 assets · 04 story-tracks · 05 weapons
