"""Headless smoke test: ส่ง workflow image->3D เข้า ComfyUI API แล้วรอไฟล์ .glb (ลบทิ้งได้)"""
import json, time, urllib.request, urllib.error

SRV = "http://127.0.0.1:8188"
CKPT = "hunyuan3d-dit-v2_fp16.safetensors"
IMG = "h3d_test.png"

prompt = {
    "1": {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": CKPT}},
    "2": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 1.0}},
    "3": {"class_type": "LoadImage", "inputs": {"image": IMG}},
    "4": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["1", 1], "image": ["3", 0], "crop": "none"}},
    "5": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["4", 0]}},
    "6": {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 3072, "batch_size": 1}},
    "7": {"class_type": "KSampler", "inputs": {
        "model": ["2", 0], "positive": ["5", 0], "negative": ["5", 1], "latent_image": ["6", 0],
        "seed": 42, "steps": 15, "cfg": 5.5, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
    "8": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["7", 0], "vae": ["1", 2],
        "num_chunks": 8000, "octree_resolution": 256}},
    "9": {"class_type": "VoxelToMesh", "inputs": {"voxel": ["8", 0], "algorithm": "surface net", "threshold": 0.6}},
    "10": {"class_type": "SaveGLB", "inputs": {"mesh": ["9", 0], "filename_prefix": "mesh/Hunyuan3D_test"}},
}


def post(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(SRV + path, data=data, headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def get(path):
    return json.load(urllib.request.urlopen(SRV + path, timeout=30))


def main():
    r = post("/prompt", {"prompt": prompt})
    pid = r["prompt_id"]
    print(f"[>] queued prompt_id={pid}")
    t0 = time.time()
    while True:
        time.sleep(3)
        hist = get(f"/history/{pid}")
        if pid in hist:
            h = hist[pid]
            status = h.get("status", {})
            if status.get("status_str") == "error" or status.get("completed") is False and "error" in json.dumps(status):
                print("[x] ERROR:"); print(json.dumps(h, indent=2)[:3000]); return
            outs = h.get("outputs", {})
            if "10" in outs:
                print(f"[ok] เสร็จใน {time.time()-t0:.0f}s")
                print(json.dumps(outs["10"], indent=2))
                return
            if status.get("status_str") == "success":
                print(f"[ok] success ใน {time.time()-t0:.0f}s"); print(json.dumps(outs, indent=2)); return
        if time.time() - t0 > 540:
            print("[x] timeout 9 นาที"); return
        print(f"  ... รอ {time.time()-t0:.0f}s")


if __name__ == "__main__":
    main()
