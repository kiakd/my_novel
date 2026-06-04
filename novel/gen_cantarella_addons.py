#!/usr/bin/env python3
# Cantarella โชว์ add-on ยอดนิยมที่เพิ่งโหลด:
#   Stabilizer + Smooth Detailer + Add Micro Details (utility) + USNR style
#   stack กับ Cantarella character LoRA
import json, urllib.request, time, sys

SERVER = "127.0.0.1:8188"

POS = ("masterpiece, best quality, amazing quality, absurdres, "
       "addmicrodetails, usnr, "
       "nsfw, rating:explicit, "
       "1girl, solo, WW Cantarella, "
       "mature female, adult, beautiful detailed face, detailed eyes, "
       "long flowing hair, curvy body, large breasts, nude, "
       "on bed, seductive pose, looking at viewer, blush, parted lips, "
       "highly detailed skin texture, detailed bedroom, soft warm lighting, depth of field")

NEG = ("bad quality, worst quality, worst detail, sketch, censored, "
       "lowres, bad anatomy, bad hands, missing fingers, extra digits, "
       "fewer digits, jpeg artifacts, signature, watermark, username, blurry, "
       "child, loli, flat chest, young, multiple girls")

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 905412236

def lora(node_in, name, sm, sc, model_src, clip_src):
    return {"class_type": "LoraLoader",
            "inputs": {"lora_name": name, "strength_model": sm, "strength_clip": sc,
                       "model": model_src, "clip": clip_src}}

wf = {
    "4":  {"class_type": "CheckpointLoaderSimple",
           "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}},
    # ----- stack add-on ใหม่ -----
    "20": lora("", "stabilizer.safetensors",        0.8, 0.8, ["4", 0],  ["4", 1]),   # กันกายวิภาคพัง
    "21": lora("", "smooth_detailer.safetensors",   0.5, 0.5, ["20", 0], ["20", 1]),  # เนียน/ดีเทล
    "22": lora("", "add_micro_details.safetensors", 0.6, 0.6, ["21", 0], ["21", 1]),  # micro detail
    "23": lora("", "usnr_style.safetensors",        0.6, 0.6, ["22", 0], ["22", 1]),  # สไตล์ usnr
    "24": lora("", "cantarella_main.safetensors",   0.85,0.85,["23", 0], ["23", 1]),  # ตัวละคร
    # -----------------------------
    "6":  {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": ["24", 1]}},
    "7":  {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["24", 1]}},
    "5":  {"class_type": "EmptyLatentImage",
           "inputs": {"width": 832, "height": 1216, "batch_size": 1}},
    "3":  {"class_type": "KSampler",
           "inputs": {"seed": SEED, "steps": 30, "cfg": 5.0,
                      "sampler_name": "dpmpp_2m", "scheduler": "karras",
                      "denoise": 1.0, "model": ["24", 0],
                      "positive": ["6", 0], "negative": ["7", 0],
                      "latent_image": ["5", 0]}},
    "8":  {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9":  {"class_type": "SaveImage",
           "inputs": {"filename_prefix": "cantarella_addons", "images": ["8", 0]}},
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
