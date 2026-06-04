#!/usr/bin/env python3
# WAN VACE 1.3B reference-to-video: เอารูป Cantarella gangbang มาขยับเป็นคลิป
# reference_image = ใช้ "หน้าตา/องค์ประกอบ" ของรูปเป็น reference (ไม่ใช่ first-frame เป๊ะ)
import json, urllib.request, time, sys

SERVER = "127.0.0.1:8188"
REF = "cantarella_gangbang_ref.png"   # อยู่ใน ComfyUI/input/

POS = ("1girl, multiple boys, gangbang, surrounded by penises, fellatio, oral, "
       "long silver blue hair, large breasts, nude, blush, "
       "subtle motion, gentle head movement, anime style, masterpiece, best quality")
NEG = "bad quality, worst quality, blurry, distorted, deformed, watermark, text, static, still image"

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 55012398
W, H, LEN, FPS, STRENGTH = 480, 832, 33, 16, 1.0

wf = {
    "1": {"class_type": "UNETLoader",
          "inputs": {"unet_name": "wan2.1_vace_1.3B_fp16.safetensors", "weight_dtype": "default"}},
    "2": {"class_type": "CLIPLoader",
          "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan"}},
    "10":{"class_type": "VAELoader", "inputs": {"vae_name": "Wan2_1_VAE_bf16.safetensors"}},
    "11":{"class_type": "LoraLoaderModelOnly",
          "inputs": {"model": ["1", 0],
                     "lora_name": "Wan21_CausVid_T2V_1_3B_lora_rank32.safetensors",
                     "strength_model": 0.8}},
    "12":{"class_type": "LoadImage", "inputs": {"image": REF}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": ["2", 0]}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["2", 0]}},
    "13":{"class_type": "WanVaceToVideo",
          "inputs": {"positive": ["6", 0], "negative": ["7", 0], "vae": ["10", 0],
                     "width": W, "height": H, "length": LEN, "batch_size": 1,
                     "strength": STRENGTH, "reference_image": ["12", 0]}},
    "3": {"class_type": "KSampler",
          "inputs": {"seed": SEED, "steps": 6, "cfg": 1.0, "sampler_name": "euler",
                     "scheduler": "simple", "denoise": 1.0, "model": ["11", 0],
                     "positive": ["13", 0], "negative": ["13", 1], "latent_image": ["13", 2]}},
    "14":{"class_type": "TrimVideoLatent",
          "inputs": {"samples": ["3", 0], "trim_amount": ["13", 3]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["10", 0]}},
    "9": {"class_type": "SaveAnimatedWEBP",
          "inputs": {"images": ["8", 0], "filename_prefix": "cantarella_vace_i2v",
                     "fps": float(FPS), "lossless": False, "quality": 90, "method": "default"}},
}

req = urllib.request.Request(f"http://{SERVER}/prompt",
    data=json.dumps({"prompt": wf}).encode(), headers={"Content-Type": "application/json"})
pid = json.load(urllib.request.urlopen(req))["prompt_id"]
print(f"queued pid={pid} seed={SEED} ({W}x{H}, {LEN}f)", flush=True)

t0 = time.time()
while time.time() - t0 < 900:
    time.sleep(4)
    try: h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
    except Exception: continue
    if pid in h:
        imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
        if imgs: print(f"DONE {int(time.time()-t0)}s -> output/{imgs[0]['filename']}", flush=True); break
        if h[pid].get("status", {}).get("status_str") == "error":
            print("ERROR", json.dumps(h[pid]["status"])[:2500]); break
else:
    print("timeout")
