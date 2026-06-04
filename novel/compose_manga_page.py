#!/usr/bin/env python3
# จัดเรียงรูปที่เจนแล้ว -> หน้ามังงะอัตโนมัติ (ไม่ต้องตัดเอง)
# 2x2 grid + กรอบดำ + ช่องว่าง (gutter) อ่านซ้าย->ขวา บน->ล่าง
import sys
from PIL import Image, ImageOps

OUT_DIR = "../comfyui/ComfyUI/output"
PANELS = [
    f"{OUT_DIR}/cantarella_step_1_grope_00001_.png",
    f"{OUT_DIR}/cantarella_step_2_undress_00001_.png",
    f"{OUT_DIR}/cantarella_step_3_facup_00001_.png",
    f"{OUT_DIR}/cantarella_step_4_oral_00001_.png",
]
COLS, ROWS = 2, 2
PANEL_W, PANEL_H = 680, 992      # 2:3 portrait cell
BORDER, GUTTER, MARGIN = 5, 22, 38
BG, FRAME = (255, 255, 255), (20, 20, 20)

page_w = MARGIN * 2 + PANEL_W * COLS + GUTTER * (COLS - 1)
page_h = MARGIN * 2 + PANEL_H * ROWS + GUTTER * (ROWS - 1)
page = Image.new("RGB", (page_w, page_h), BG)

for i, path in enumerate(PANELS):
    r, c = divmod(i, COLS)
    x = MARGIN + c * (PANEL_W + GUTTER)
    y = MARGIN + r * (PANEL_H + GUTTER)
    im = Image.open(path).convert("RGB")
    im = ImageOps.fit(im, (PANEL_W, PANEL_H), Image.LANCZOS)   # crop-fit ให้เต็มช่อง
    im = ImageOps.expand(im, border=BORDER, fill=FRAME)        # กรอบดำ
    page.paste(im, (x - BORDER, y - BORDER))

out = f"{OUT_DIR}/cantarella_manga_page.png"
page.save(out)
print(f"saved {out}  ({page_w}x{page_h})")
