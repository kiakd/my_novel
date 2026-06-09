#!/usr/bin/env python3
# download_loras.py — โหลด LoRA จาก Civitai เข้าโฟลเดอร์ loras ของ ComfyUI
# ใช้เติมท่าที่ยังขาดใน gen_pose18.py (ดู LORA_NOTES ในไฟล์นั้น)
#
# ต้องมี Civitai API token (เพราะ NSFW ต้องล็อกอิน):
#   1) สร้างที่ https://civitai.com/user/account  -> API Keys
#   2) ตั้ง env:  $env:CIVITAI_TOKEN = "xxxx"   (PowerShell)
#
# วิธีใช้:
#   python download_loras.py 2996347              # โหลด versionId เดียว
#   python download_loras.py 2996347 2999729      # หลายตัว
#   python download_loras.py                       # โหลดทั้งหมดใน CANDIDATES ด้านล่าง
import os, sys, urllib.request, urllib.error

LORA_DIR = r"D:\test\my_novel\comfyui\ComfyUI\models\loras"
TOKEN = os.environ.get("CIVITAI_TOKEN", "b66c2a00855e17f303e973be5367794e")

# versionId -> ชื่อไฟล์ปลายทาง (ตรงกับที่ gen_pose18.py อ้างถึง)
# ทุกตัว base = Illustrious (เช็คแล้ว) ให้เข้าชุดกับ wai_illustrious_v17
CANDIDATES = {
    "2946885": "cowgirl_position_il.safetensors",    # ท่า2  Cowgirl Position - Concept
    "2937144": "reverse_cowgirl_il.safetensors",     # ท่า3  reverse cowgirl concept
    "2192837": "spooning_il.safetensors",            # ท่า5  spooning anime
    "2345843": "throne_sex_il.safetensors",          # ท่า6  throne / sitting-on-lap sex
    "2841951": "stand_carry_il.safetensors",         # ท่า8  Stand & Carry Position (Tachumi)
    # ท่า9 ใช้ throne_sex_il (ตัวเดียวกับท่า6) — lapdance LoRA มีบาร์สตูล/ฉากบาร์มาบัง เลยไม่ใช้
    # "2544658": "lapdance_sitting_il.safetensors",
}

def download(version_id, fname=None):
    if not TOKEN:
        print("!! ยังไม่ได้ตั้ง CIVITAI_TOKEN — โหลด NSFW ไม่ได้"); return
    url = f"https://civitai.com/api/download/models/{version_id}?token={TOKEN}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req) as r:
            # ดึงชื่อไฟล์จาก header ถ้าไม่ได้ระบุ
            if not fname:
                cd = r.headers.get("Content-Disposition", "")
                fname = cd.split('filename=')[-1].strip('"') if "filename=" in cd else f"{version_id}.safetensors"
            out = os.path.join(LORA_DIR, fname)
            total = int(r.headers.get("Content-Length", 0))
            done = 0
            with open(out, "wb") as f:
                while True:
                    chunk = r.read(1 << 20)
                    if not chunk: break
                    f.write(chunk); done += len(chunk)
                    if total:
                        print(f"\r  {fname}: {done/1e6:.0f}/{total/1e6:.0f} MB", end="", flush=True)
            print(f"\n[OK] -> {out}")
    except urllib.error.HTTPError as e:
        print(f"[ERR {e.code}] versionId={version_id} — token ถูกต้องไหม / โมเดลล็อก?")
    except Exception as e:
        print(f"[ERR] versionId={version_id}: {e}")

if __name__ == "__main__":
    ids = sys.argv[1:]
    if ids:
        for vid in ids:
            download(vid, CANDIDATES.get(vid))
    else:
        for vid, fn in CANDIDATES.items():
            download(vid, fn)
    print("done.")
