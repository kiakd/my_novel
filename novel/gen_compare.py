#!/usr/bin/env python3
import json, urllib.request, time, sys

SERVER = "127.0.0.1:8188"

POS = ("masterpiece, best quality, ultra detailed, highres, "
       "1girl, solo, mature female, 18 years old, cosplay outfit, "
       "huge breasts, shirt lift, clothes lift, lifting own shirt with both hands, "
       "breasts out, exposed breasts, pink nipples, "
       "looking at viewer, seductive smile, blush, parted lips, "
       "short blonde bob hair, blunt bangs, black choker, "
       "standing, indoor bedroom, soft warm lighting, depth of field")

NEG = ("lowres, worst quality, low quality, bad anatomy, bad hands, missing fingers, "
       "extra digits, fewer digits, extra limbs, deformed, mutated, ugly, disfigured, "
       "blurry, jpeg artifacts, watermark, signature, text, username, monochrome, "
       "child, loli, flat chest, young, multiple girls")

SEED = 555123777

MODELS = [
    ("meinahentai_v5Final.safetensors", "cmp_meina"),
    ("DreamShaper_8_pruned.safetensors", "cmp_dream"),
]

def queue(ckpt, prefix):
    wf = {
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["4", 1]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": 576, "height": 768, "batch_size": 1}},
        "3": {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": 7.0,
              "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
              "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}},
    }
    data = json.dumps({"prompt": wf}).encode()
    req = urllib.request.Request(f"http://{SERVER}/prompt", data=data,
                                headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req))["prompt_id"]

def wait(pid, t0):
    while True:
        time.sleep(3)
        try:
            h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
        except Exception:
            continue
        if pid in h:
            imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
            if imgs:
                return imgs[0]["filename"], int(time.time()-t0)
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                return "ERROR:"+json.dumps(st)[:800], int(time.time()-t0)
        if time.time()-t0 > 600:
            return "timeout", int(time.time()-t0)

for ckpt, prefix in MODELS:
    t0 = time.time()
    pid = queue(ckpt, prefix)
    print(f"[{ckpt}] queued {pid}", flush=True)
    fn, sec = wait(pid, t0)
    print(f"[{ckpt}] DONE {sec}s -> output/{fn}", flush=True)
