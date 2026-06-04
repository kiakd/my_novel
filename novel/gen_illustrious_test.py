#!/usr/bin/env python3
# ทดสอบ pipeline: WAI-illustrious (SDXL) + stack LoRA (reiQ + Cantarella)
# พารามิเตอร์ตาม PONY-ILLUSTRIOUS-PLAN.md ขั้นที่ 5
import json, urllib.request, time, sys

SERVER = "127.0.0.1:8188"

# Illustrious: quality tags + trigger ของ LoRA ทุกตัว
POS = ("masterpiece, best quality, amazing quality, absurdres, "
       "1girl, solo, reill, WW Cantarella, Main Outfit, "
       "beautiful detailed eyes, long flowing hair, elegant standing pose, "
       "looking at viewer, gentle smile, "
       "detailed indoor background, soft warm lighting, depth of field")

NEG = ("bad quality, worst quality, worst detail, sketch, censored, "
       "lowres, bad anatomy, bad hands, missing fingers, extra digits, "
       "fewer digits, jpeg artifacts, signature, watermark, username, blurry")

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 428100731

wf = {
    "4":  {"class_type": "CheckpointLoaderSimple",
           "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}},
    # stack LoRA: checkpoint -> reiQ -> Cantarella
    "10": {"class_type": "LoraLoader",
           "inputs": {"lora_name": "reiq_reill.safetensors",
                      "strength_model": 0.7, "strength_clip": 0.7,
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
           "inputs": {"filename_prefix": "illustrious_test", "images": ["8", 0]}},
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
        outs = h[pid].get("outputs", {})
        imgs = outs.get("9", {}).get("images", [])
        if imgs:
            fn = imgs[0]["filename"]
            print(f"DONE {int(time.time()-t0)}s -> output/{fn}", flush=True)
            break
        if st.get("status_str") == "error":
            print("ERROR", json.dumps(st)[:2000]); break
    if time.time() - t0 > 600:
        print("timeout"); break
