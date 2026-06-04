"""
gen_3d_objects.py
-----------------
เจนวัตถุง่าย ๆ เป็น 3D (.glb) ผ่าน ComfyUI API ในกราฟเดียว:
  txt2img (wai_illustrious SDXL) -> IMAGE -> Hunyuan3D-2 (native) -> SaveGLB

ต้องมี ComfyUI server รันอยู่ที่ 127.0.0.1:8188 (แนะนำ --lowvram)
รัน:  <venv>\python.exe novel\gen_3d_objects.py
ผลลัพธ์: ComfyUI/output/mesh/<name>_xxxxx_.glb  (+ ภาพต้นทาง output/obj_src/<name>_xxxxx_.png)
"""
import json, time, urllib.request

SRV = "http://127.0.0.1:8188"
SDXL = "wai_illustrious_v17.safetensors"
H3D = "hunyuan3d-dit-v2_fp16.safetensors"

NEG = "blurry, multiple objects, busy background, shadow, text, watermark, signature, low quality, cropped, out of frame"

# วัตถุง่าย ๆ : object เดี่ยว กลางเฟรม พื้นหลังขาวโล่ง (ดีสุดสำหรับ image->3D)
OBJECTS = [
    ("lamp",  "a single classic table lamp with a round lampshade, isolated object, centered, full object in frame, plain solid white background, soft even studio lighting, product photo, masterpiece, best quality"),
    ("boot",  "a single leather ankle boot, isolated object, centered, full object in frame, plain solid white background, soft even studio lighting, product photo, masterpiece, best quality"),
    ("sign",  "a single retro neon light sign in the shape of a five-pointed star, glowing, isolated object, centered, full object in frame, plain solid white background, product photo, masterpiece, best quality"),
]


def graph(name, prompt, seed):
    return {
        # ---- txt2img (SDXL) ----
        "c":   {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": SDXL}},
        "pos": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["c", 1]}},
        "neg": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["c", 1]}},
        "lat": {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "ks":  {"class_type": "KSampler", "inputs": {
            "model": ["c", 0], "positive": ["pos", 0], "negative": ["neg", 0], "latent_image": ["lat", 0],
            "seed": seed, "steps": 28, "cfg": 5.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
        "vd":  {"class_type": "VAEDecode", "inputs": {"samples": ["ks", 0], "vae": ["c", 2]}},
        "si":  {"class_type": "SaveImage", "inputs": {"images": ["vd", 0], "filename_prefix": f"obj_src/{name}"}},
        # ---- image -> 3D (Hunyuan3D-2 native) ----
        "h":   {"class_type": "ImageOnlyCheckpointLoader", "inputs": {"ckpt_name": H3D}},
        "msa": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["h", 0], "shift": 1.0}},
        "cve": {"class_type": "CLIPVisionEncode", "inputs": {"clip_vision": ["h", 1], "image": ["vd", 0], "crop": "none"}},
        "cnd": {"class_type": "Hunyuan3Dv2Conditioning", "inputs": {"clip_vision_output": ["cve", 0]}},
        "el":  {"class_type": "EmptyLatentHunyuan3Dv2", "inputs": {"resolution": 3072, "batch_size": 1}},
        "ks3": {"class_type": "KSampler", "inputs": {
            "model": ["msa", 0], "positive": ["cnd", 0], "negative": ["cnd", 1], "latent_image": ["el", 0],
            "seed": seed, "steps": 20, "cfg": 5.5, "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0}},
        "vdh": {"class_type": "VAEDecodeHunyuan3D", "inputs": {"samples": ["ks3", 0], "vae": ["h", 2],
            "num_chunks": 8000, "octree_resolution": 256}},
        "v2m": {"class_type": "VoxelToMesh", "inputs": {"voxel": ["vdh", 0], "algorithm": "surface net", "threshold": 0.6}},
        "glb": {"class_type": "SaveGLB", "inputs": {"mesh": ["v2m", 0], "filename_prefix": f"mesh/{name}"}},
    }


def post(path, payload):
    req = urllib.request.Request(SRV + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))


def get(path):
    return json.load(urllib.request.urlopen(SRV + path, timeout=60))


def main():
    queued = []
    for i, (name, prompt) in enumerate(OBJECTS):
        pid = post("/prompt", {"prompt": graph(name, prompt, seed=1000 + i)})["prompt_id"]
        queued.append((name, pid))
        print(f"[>] queued {name}  prompt_id={pid}", flush=True)

    done = {}
    t0 = time.time()
    while len(done) < len(queued):
        time.sleep(5)
        for name, pid in queued:
            if pid in done:
                continue
            h = get(f"/history/{pid}")
            if pid in h:
                outs = h[pid].get("outputs", {})
                st = h[pid].get("status", {}).get("status_str")
                if "glb" in outs:
                    f = outs["glb"]["3d"][0]
                    done[pid] = f["filename"]
                    print(f"[ok] {name}: output/{f['subfolder']}/{f['filename']}  ({time.time()-t0:.0f}s)", flush=True)
                elif st == "error":
                    done[pid] = "ERROR"
                    print(f"[x] {name} ERROR:\n{json.dumps(h[pid].get('status'), indent=2)[:2000]}", flush=True)
        if time.time() - t0 > 1500:
            print("[x] timeout 25 นาที", flush=True)
            break
        print(f"  ... {len(done)}/{len(queued)} เสร็จ  ({time.time()-t0:.0f}s)", flush=True)

    print("\n=== สรุป ===", flush=True)
    for name, pid in queued:
        print(f"  {name}: {done.get(pid, 'ไม่เสร็จ')}", flush=True)


if __name__ == "__main__":
    main()
