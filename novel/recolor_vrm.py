"""
recolor_vrm.py <in.vrm> <out.vrm>
---------------------------------
ย้อมสี base VRoid -> โทน Liena โดยแก้ที่ "เท็กซ์เจอร์" ในไฟล์ glTF ตรง ๆ (ไม่ต้องเปิด Blender)
- ผม (HairBack) น้ำตาล -> เงิน-ขาว
- ม่านตา (EyeIris) น้ำตาล -> เขียวมรกต
แล้ว repack GLB ใหม่ (rebuild buffer + แก้ bufferView offset) ออกเป็น .vrm ที่ยังใช้กับ Godot/VRoid ได้
"""
import json, struct, io, sys
from pathlib import Path
import numpy as np
from PIL import Image

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else r"D:/download/3d/femalebase.vrm")
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else r"D:/download/3d/Liena_base.vrm")

# material index -> recolor mode (ดูจาก inspect: 11=HairBack, 1=EyeIris)
RECOLOR = {11: "silver", 1: "green"}


def parse_glb(data):
    length = struct.unpack("<I", data[8:12])[0]
    off, js, bin_ = 12, None, None
    while off < length:
        clen, ctype = struct.unpack("<I4s", data[off:off + 8]); off += 8
        chunk = data[off:off + clen]; off += clen
        if ctype == b"JSON": js = json.loads(chunk.decode("utf-8"))
        elif ctype == b"BIN\x00": bin_ = bytearray(chunk)
    return js, bin_


def to_silver(im):
    a = im.split()[-1]
    arr = np.asarray(im.convert("RGB"), dtype=np.float32)
    lum = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)   # ความสว่างเดิม (เก็บเงา)
    out = 120.0 + lum * 0.62                                        # ยกให้สว่าง = เงิน
    r = np.clip(out * 0.97, 0, 255); g = np.clip(out * 0.99, 0, 255); b = np.clip(out * 1.06, 0, 255)
    rgb = np.stack([r, g, b], -1).astype(np.uint8)
    res = Image.fromarray(rgb, "RGB").convert("RGBA"); res.putalpha(a); return res


def to_green(im):
    a = im.split()[-1]
    hsv = np.asarray(im.convert("HSV"), dtype=np.uint8).copy()
    mask = np.asarray(a) > 8                                        # เฉพาะส่วนทึบ
    hsv[..., 0] = np.where(mask, 90, hsv[..., 0])                   # H -> เขียว (0-255)
    s = hsv[..., 1].astype(np.float32)
    hsv[..., 1] = np.where(mask, np.clip(s * 1.4 + 40, 0, 255), s).astype(np.uint8)  # อิ่มขึ้น
    res = Image.fromarray(hsv, "HSV").convert("RGB").convert("RGBA"); res.putalpha(a); return res


def main():
    data = open(SRC, "rb").read()
    g, bin_ = parse_glb(data)
    bv = g["bufferViews"]

    # หา image index ของ baseColorTexture ของแต่ละ material ที่จะย้อม
    new_imgs = {}
    for mi, mode in RECOLOR.items():
        t = g["materials"][mi]["pbrMetallicRoughness"]["baseColorTexture"]
        img_i = g["textures"][t["index"]]["source"]
        v = bv[g["images"][img_i]["bufferView"]]
        o = v.get("byteOffset", 0); l = v["byteLength"]
        im = Image.open(io.BytesIO(bytes(bin_[o:o + l]))).convert("RGBA")
        im2 = to_silver(im) if mode == "silver" else to_green(im)
        buf = io.BytesIO(); im2.save(buf, format="png")
        new_imgs[img_i] = buf.getvalue()
        print(f"[recolor] material {mi} -> img {img_i} ({mode}) {im.size}", flush=True)

    # rebuild buffer: เรียง bufferView ใหม่แบบต่อเนื่อง อัปเดต offset/length
    img_bv = {g["images"][i]["bufferView"]: i for i in new_imgs}
    new_buf = bytearray()
    for j, v in enumerate(bv):
        if j in img_bv:
            blob = new_imgs[img_bv[j]]
        else:
            o = v.get("byteOffset", 0); l = v["byteLength"]; blob = bytes(bin_[o:o + l])
        while len(new_buf) % 4: new_buf.append(0)
        v["byteOffset"] = len(new_buf); v["byteLength"] = len(blob)
        new_buf.extend(blob)
    while len(new_buf) % 4: new_buf.append(0)
    g["buffers"][0]["byteLength"] = len(new_buf)

    # เขียน GLB ใหม่
    js = json.dumps(g, separators=(",", ":")).encode("utf-8")
    while len(js) % 4: js += b" "
    body = struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(new_buf), b"BIN\x00") + bytes(new_buf)
    out = struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body
    OUT.write_bytes(out)
    print(f"[ok] {OUT}  ({len(out)/1e6:.1f} MB)", flush=True)

    # contact sheet ของเท็กซ์เจอร์ใหม่ ไว้ดูสี
    sheet = Image.new("RGB", (256 * len(new_imgs), 256), (235, 235, 235))
    for k, (ii, blob) in enumerate(new_imgs.items()):
        thumb = Image.open(io.BytesIO(blob)).convert("RGBA").resize((256, 256))
        sheet.paste(thumb, (k * 256, 0), thumb)
    sp = Path("comfyui/ComfyUI/output/vrm_tex/_recolored.png"); sheet.save(sp)
    print(f"[sheet] {sp}", flush=True)


if __name__ == "__main__":
    main()
