#!/usr/bin/env python3
# WAN 2.1 T2V-1.3B test clip (native ComfyUI nodes) + CausVid speed LoRA
# พิสูจน์ว่า WAN รันบน RTX 4050 6GB ได้ — ออกเป็น .webp animation
import json, urllib.request, time, sys

SERVER = "127.0.0.1:8188"

POS = ("1girl, solo, long silver blue hair, purple eyes, elegant white dress, "
       "dancing, twirling, dynamic motion, flowing hair and dress, "
       "anime style, masterpiece, best quality, detailed, "
       "ornate indoor hall, soft warm lighting")
NEG = ("bad quality, worst quality, blurry, distorted, deformed, watermark, "
       "text, static, still image")

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 70112389
W, H, LEN, FPS = 480, 832, 33, 16   # ~2s @16fps, 480p portrait (native 1.3B res)

wf = {
    "1": {"class_type": "UNETLoader",
          "inputs": {"unet_name": "Wan2_1-T2V-1_3B_bf16.safetensors", "weight_dtype": "default"}},
    "2": {"class_type": "CLIPLoader",
          "inputs": {"clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan"}},
    "10":{"class_type": "VAELoader",
          "inputs": {"vae_name": "Wan2_1_VAE_bf16.safetensors"}},
    "11":{"class_type": "LoraLoaderModelOnly",
          "inputs": {"model": ["1", 0],
                     "lora_name": "Wan21_CausVid_T2V_1_3B_lora_rank32.safetensors",
                     "strength_model": 0.9}},
    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": ["2", 0]}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["2", 0]}},
    "5": {"class_type": "EmptyHunyuanLatentVideo",
          "inputs": {"width": W, "height": H, "length": LEN, "batch_size": 1}},
    "3": {"class_type": "KSampler",
          "inputs": {"seed": SEED, "steps": 6, "cfg": 1.0,
                     "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
                     "model": ["11", 0], "positive": ["6", 0], "negative": ["7", 0],
                     "latent_image": ["5", 0]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["10", 0]}},
    "9": {"class_type": "SaveAnimatedWEBP",
          "inputs": {"images": ["8", 0], "filename_prefix": "wan_t2v_test",
                     "fps": float(FPS), "lossless": False, "quality": 90, "method": "default"}},
}

data = json.dumps({"prompt": wf}).encode()
req = urllib.request.Request(f"http://{SERVER}/prompt", data=data,
                            headers={"Content-Type": "application/json"})
resp = json.load(urllib.request.urlopen(req))
pid = resp["prompt_id"]
print(f"queued prompt_id={pid} seed={SEED} ({W}x{H}, {LEN}f @ {FPS}fps)", flush=True)

t0 = time.time()
while True:
    time.sleep(4)
    try:
        h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
    except Exception:
        continue
    if pid in h:
        st = h[pid].get("status", {})
        imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
        if imgs:
            print(f"DONE {int(time.time()-t0)}s -> output/{imgs[0]['filename']}", flush=True)
            break
        if st.get("status_str") == "error":
            print("ERROR", json.dumps(st)[:2500]); break
    if time.time() - t0 > 900:
        print("timeout (>15min)"); break
