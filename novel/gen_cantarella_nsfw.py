#!/usr/bin/env python3
# NSFW Cantarella — WAI-illustrious (SDXL) + LoRA stack (reiQ style + Cantarella char)
# ใช้ trigger เฉพาะตัวละคร (ตัด "Main Outfit" เพื่อไม่บังคับใส่ชุด)
import json, urllib.request, time, sys

SERVER = "127.0.0.1:8188"

POS = ("masterpiece, best quality, amazing quality, absurdres, "
       "nsfw, rating:explicit, "
       "1girl, solo, reill, WW Cantarella, "
       "mature female, adult, beautiful detailed face, long flowing hair, "
       "curvy body, large breasts, nude, bare shoulders, "
       "lying on bed, seductive pose, looking at viewer, blush, parted lips, "
       "detailed bedroom background, soft warm lighting, depth of field")

NEG = ("bad quality, worst quality, worst detail, sketch, censored, "
       "lowres, bad anatomy, bad hands, missing fingers, extra digits, "
       "fewer digits, jpeg artifacts, signature, watermark, username, blurry, "
       "child, loli, flat chest, young, multiple girls")

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 771203984

wf = {
    "4":  {"class_type": "CheckpointLoaderSimple",
           "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}},
    "10": {"class_type": "LoraLoader",
           "inputs": {"lora_name": "reiq_reill.safetensors",
                      "strength_model": 0.6, "strength_clip": 0.6,
                      "model": ["4", 0], "clip": ["4", 1]}},
    "11": {"class_type": "LoraLoader",
           "inputs": {"lora_name": "cantarella_main.safetensors",
                      "strength_model": 0.8, "strength_clip": 0.8,
                      "model": ["10", 0], "clip": ["10", 1]}},
    "6":  {"class_type": "CLIPTextEncode",
           "inputs": {"text": POS, "clip": ["11", 1]}},
    "7":  {"class_type": "CLIPTextEncode",
           "inputs": {"text": NEG, "clip": ["11", 1]}},
    "5":  {"class_type": "EmptyLatentImage",
           "inputs": {"width": 832, "height": 1216, "batch_size": 1}},
    "3":  {"class_type": "KSampler",
           "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0,
                      "sampler_name": "dpmpp_2m", "scheduler": "karras",
                      "denoise": 1.0, "model": ["11", 0],
                      "positive": ["6", 0], "negative": ["7", 0],
                      "latent_image": ["5", 0]}},
    "8":  {"class_type": "VAEDecode",
           "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9":  {"class_type": "SaveImage",
           "inputs": {"filename_prefix": "cantarella_nsfw", "images": ["8", 0]}},
}

data = json.dumps({"prompt": wf}).encode()
req = urllib.request.Request(f"http://{SERVER}/prompt", data=data,
                            headers={"Content-Type": "application/json"})
resp = json.load(urllib.request.urlopen(req))
pid = resp["prompt_id"]
print(f"queued prompt_id={pid} seed={SEED}", flush=True)

t0 = time.time()
while True:
    time.sleep(3)
    try:
        h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
    except Exception as e:
        print("poll err", e); continue
    if pid in h:
        st = h[pid].get("status", {})
        imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
        if imgs:
            print(f"DONE {int(time.time()-t0)}s -> output/{imgs[0]['filename']}", flush=True)
            break
        if st.get("status_str") == "error":
            print("ERROR", json.dumps(st)[:2000]); break
    if time.time() - t0 > 600:
        print("timeout"); break
