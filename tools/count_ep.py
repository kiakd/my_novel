# -*- coding: utf-8 -*-
# นับคำ/ตัวอักษรตามวิธีของแพรวา (ตรงท้ายไฟล์ ep):
# - เนื้อเรื่อง = ทุกบรรทัดหลังบรรทัดหัวเรื่อง (#...) จนถึงก่อนบรรทัดที่ขึ้นต้น "**ลิสต์ชื่อใหม่"
# - คำ: PyThaiNLP newmm เฉพาะโทเคนที่มีตัวอักษรไทย/ละติน/ตัวเลข
# - ตัวอักษร: ลบ whitespace ทุกชนิด (\s) แล้วนับที่เหลือ
import sys, re, io
from pythainlp import word_tokenize

def count(path):
    with io.open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    # ตัดหัวเรื่อง (บรรทัดแรกที่ขึ้นต้นด้วย #)
    start = 1 if lines and lines[0].startswith("#") else 0
    body = []
    for ln in lines[start:]:
        if ln.startswith("**ลิสต์ชื่อใหม่"):
            break
        body.append(ln)
    text = "\n".join(body)
    chars = len(re.sub(r"\s+", "", text))
    toks = word_tokenize(text, engine="newmm")
    words = sum(1 for t in toks if re.search(r"[A-Za-z0-9ก-๛]", t))
    return words, chars

if __name__ == "__main__":
    for p in sys.argv[1:]:
        w, c = count(p)
        print(f"{p}\twords={w}\tchars={c}")
