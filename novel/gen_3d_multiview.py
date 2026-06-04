"""
gen_3d_multiview.py <turnaround-image> [name]
---------------------------------------------
multi-view image -> 3D ด้วย Hunyuan3D-2mv (native ComfyUI)
- รับภาพ turnaround 4 มุม (เรียงซ้าย->ขวา = front, left, right, back) แล้วตัดเป็น 4 รูป
- ป้อนเข้าโหนด Hunyuan3Dv2ConditioningMultiView -> ทรงครบ/ไม่เพี้ยน (เก็บด้านหลังได้)
ต้องมี checkpoint: models/checkpoints/hunyuan3d-dit-v2-mv_fp16.safetensors
และ ComfyUI server ที่ 127.0.0.1:8188 (--lowvram)
"""
import json, time, sys, urllib.request
from pathlib import Path
from PIL import Image

SRV = "http://127.0.0.1:8188"
MV = "hunyuan3d-dit-v2-mv_fp16.safetensors"
COMFY = Path(__file__).resolve().parent.parent / "comfyui" / "ComfyUI"

# ลำดับพาเนลในภาพ turnaround -> ชื่อมุมของโหนด
PANEL_ORDER = ["front", "left", "right", "back"]


def post(p, payload):
    req = urllib.request.Request(SRV + p, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def get(p):
    return json.load(urllib.request.urlopen(SRV + p, timeout=60))


def split_panels(src, name):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    pw = w // 4
    files = {}
    for i, view in enumerate(PANEL_ORDER):
        c = im.crop((i * pw, 0, (i + 1) * pw, int(h * 0.91)))  # ตัด watermark ล่าง
        fn = f"{name}_{view}.png"
        c.save(COMFY / "input" / fn)
        files[view] = fn
    return files


def cve(src_node):
    return {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["h", 1], "image": [src_node, 0], "crop": "none"}}


def main():
    src = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else "mv"
    f = split_panels(src, name)
    print("[i] panels:", f, flush=True)

    g = {
        "h":   {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": MV}},
        "msa": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["h", 0], "shift": 1.0}},
        "lf":  {"class_type": "LoadImage", "inputs": {"image": f["front"]}},
        "ll":  {"class_type": "LoadImage", "inputs": {"image": f["left"]}},
        "lr":  {"class_type": "LoadImage", "inputs": {"image": f["right"]}},
        "lb":  {"class_type": "LoadImage", "inputs": {"image": f["back"]}},
        "ef":  cve("lf"), "el_": cve("ll"), "er":  cve("lr"), "eb":  cve("lb"),
        "cnd": {"class_type": "Hunyuan3Dv2ConditioningMultiView", "inputs": {
            "front": ["ef", 0], "left": ["el_", 0], "right": ["er", 0], "back": ["eb", 0]}},
        "lat": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 3072, "batch_size": 1}},
        "ks":  {"class_type": "KSampler", "inputs": {
            "model": ["msa", 0], "positive": ["cnd", 0], "negative": ["cnd", 1], "latent_image": ["lat", 0],
            "seed": 42, "steps": 20, "cfg": 7.5, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
        "vdh": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["ks", 0], "vae": ["h", 2],
            "num_chunks": 8000, "octree_resolution": 256}},
        "v2m": {"class_type": "VoxelToMesh", "inputs": {"voxel": ["vdh", 0], "algorithm": "surface net", "threshold": 0.6}},
        "glb": {"class_type": "SaveGLB", "inputs": {"mesh": ["v2m", 0], "filename_prefix": f"mesh/{name}"}},
    }

    pid = post("/prompt", {"prompt": g})["prompt_id"]
    print(f"[>] {name}: queued {pid}", flush=True)
    t0 = time.time()
    while True:
        time.sleep(5)
        h = get(f"/history/{pid}")
        if pid in h:
            outs = h[pid].get("outputs", {})
            st = h[pid].get("status", {}).get("status_str")
            if "glb" in outs:
                ff = outs["glb"]["3d"][0]
                print(f"[ok] {name}: output/{ff['subfolder']}/{ff['filename']}  ({time.time()-t0:.0f}s)", flush=True)
                return
            if st == "error":
                print(f"[x] {name} ERROR:\n{json.dumps(h[pid].get('status'), indent=2)[:2500]}", flush=True)
                return
        if time.time() - t0 > 900:
            print("[x] timeout", flush=True); return
        print(f"  ... {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
