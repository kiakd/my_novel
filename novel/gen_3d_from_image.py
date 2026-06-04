"""
gen_3d_from_image.py <path-to-image> [name] [octree]
----------------------------------------------------
image -> 3D (.glb) ตรง ๆ ด้วย Hunyuan3D-2 native ผ่าน ComfyUI API
- คัดลอกรูปเข้า ComfyUI/input/ ให้อัตโนมัติ
- ออกที่ ComfyUI/output/mesh/<name>_xxxxx_.glb
ต้องมี ComfyUI server ที่ 127.0.0.1:8188 (แนะนำ --lowvram)
"""
import json, time, sys, shutil, urllib.request
from pathlib import Path

SRV = "http://127.0.0.1:8188"
H3D = "hunyuan3d-dit-v2_fp16.safetensors"
COMFY = Path(__file__).resolve().parent.parent / "comfyui" / "ComfyUI"


def post(p, payload):
    req = urllib.request.Request(SRV + p, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def get(p):
    return json.load(urllib.request.urlopen(SRV + p, timeout=60))


def main():
    src = Path(sys.argv[1]).resolve()
    name = sys.argv[2] if len(sys.argv) > 2 else src.stem
    octree = int(sys.argv[3]) if len(sys.argv) > 3 else 256

    dst = COMFY / "input" / src.name
    if src.resolve() != dst.resolve():
        shutil.copy(src, dst)
    img = src.name

    g = {
        "h":   {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": H3D}},
        "msa": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["h", 0], "shift": 1.0}},
        "ld":  {"class_type": "LoadImage", "inputs": {"image": img}},
        "cve": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["h", 1], "image": ["ld", 0], "crop": "none"}},
        "cnd": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["cve", 0]}},
        "el":  {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 3072, "batch_size": 1}},
        "ks":  {"class_type": "KSampler", "inputs": {
            "model": ["msa", 0], "positive": ["cnd", 0], "negative": ["cnd", 1], "latent_image": ["el", 0],
            "seed": 42, "steps": 20, "cfg": 5.5, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
        "vdh": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["ks", 0], "vae": ["h", 2],
            "num_chunks": 8000, "octree_resolution": octree}},
        "v2m": {"class_type": "VoxelToMesh", "inputs": {"voxel": ["vdh", 0], "algorithm": "surface net", "threshold": 0.6}},
        "glb": {"class_type": "SaveGLB", "inputs": {"mesh": ["v2m", 0], "filename_prefix": f"mesh/{name}"}},
    }

    pid = post("/prompt", {"prompt": g})["prompt_id"]
    print(f"[>] {name}: queued {pid} (octree={octree})", flush=True)
    t0 = time.time()
    while True:
        time.sleep(5)
        h = get(f"/history/{pid}")
        if pid in h:
            outs = h[pid].get("outputs", {})
            st = h[pid].get("status", {}).get("status_str")
            if "glb" in outs:
                f = outs["glb"]["3d"][0]
                print(f"[ok] {name}: output/{f['subfolder']}/{f['filename']}  ({time.time()-t0:.0f}s)", flush=True)
                return
            if st == "error":
                print(f"[x] {name} ERROR:\n{json.dumps(h[pid].get('status'), indent=2)[:2500]}", flush=True)
                return
        if time.time() - t0 > 900:
            print("[x] timeout", flush=True); return
        print(f"  ... {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
