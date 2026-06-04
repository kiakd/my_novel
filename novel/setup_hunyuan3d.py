"""
setup_hunyuan3d.py
------------------
ดาวน์โหลดโมเดล Hunyuan3D-2 (image -> 3D shape) สำหรับ ComfyUI ที่ติดตั้งไว้แล้วในเครื่อง

ทำไมไฟล์เดียว:
  ComfyUI 0.22.0 รองรับ Hunyuan3D-2 แบบ native อยู่แล้ว (ไม่ต้องลง custom node / ไม่ต้อง compile)
  เช็คพอยต์ repackaged ของ Comfy-Org รวม MODEL + CLIP_VISION + VAE ไว้ในไฟล์เดียว
  โหลดผ่านโหนด ImageOnlyCheckpointLoader -> ได้ครบทั้ง 3 เอาต์พุต

VRAM: รัน shape generation บน RTX 4050 6GB ได้ ด้วย --lowvram (offload ลง RAM, เครื่องมี 31GB)
หมายเหตุ: native ยัง "ไม่" ทำ texture/PBR -> ได้ mesh เปล่า (.glb) เอาเข้า Blender แต่งต่อ/scale ได้เลย

รัน:
  cd comfyui/ComfyUI
  ./venv/Scripts/python.exe ../../novel/setup_hunyuan3d.py
"""

from pathlib import Path
from huggingface_hub import hf_hub_download

# repo + ไฟล์ (ตรงกับที่ template ทางการของ ComfyUI ชี้ไป)
REPO_ID = "Comfy-Org/hunyuan3D_2.0_repackaged"
FILENAME = "split_files/hunyuan3d-dit-v2_fp16.safetensors"  # ~4.9 GB
TARGET_NAME = "hunyuan3d-dit-v2_fp16.safetensors"

# หา ComfyUI root: สคริปต์อยู่ใน novel/ -> ComfyUI อยู่ที่ ../comfyui/ComfyUI
SCRIPT_DIR = Path(__file__).resolve().parent
COMFY_ROOT = SCRIPT_DIR.parent / "comfyui" / "ComfyUI"
CKPT_DIR = COMFY_ROOT / "models" / "checkpoints"


def main() -> None:
    if not COMFY_ROOT.exists():
        raise SystemExit(f"[x] ไม่พบ ComfyUI ที่ {COMFY_ROOT}")
    CKPT_DIR.mkdir(parents=True, exist_ok=True)

    target = CKPT_DIR / TARGET_NAME
    if target.exists() and target.stat().st_size > 4_000_000_000:
        print(f"[=] มีไฟล์อยู่แล้ว ข้าม: {target}  ({target.stat().st_size/1e9:.2f} GB)")
        return

    print(f"[>] ดาวน์โหลด {FILENAME} (~4.9 GB) ... (resume ได้ ถ้าหลุดให้รันซ้ำ)")
    # hf_hub 1.x: download ไฟล์จริงลง local_dir อยู่แล้ว (ไม่มี symlink)
    downloaded = hf_hub_download(
        repo_id=REPO_ID,
        filename=FILENAME,
        local_dir=str(CKPT_DIR),
    )

    # hf เก็บไว้เป็น .../split_files/hunyuan3d-dit-v2_fp16.safetensors -> ย้ายขึ้นมาให้ flat
    downloaded = Path(downloaded)
    if downloaded.resolve() != target.resolve():
        target.unlink(missing_ok=True)
        downloaded.replace(target)
        # เก็บกวาดโฟลเดอร์ split_files ที่ว่าง
        try:
            downloaded.parent.rmdir()
        except OSError:
            pass

    print(f"[ok] เสร็จ: {target}  ({target.stat().st_size/1e9:.2f} GB)")
    print("[i] ต่อไป: เปิด ComfyUI แล้วโหลด workflow 'image_to_3d_hunyuan3d'")


if __name__ == "__main__":
    main()
