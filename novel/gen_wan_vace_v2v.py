#!/usr/bin/env python3
# WAN VACE 1.3B video-to-video: เอา "การเคลื่อนไหว" จากวิดีโอต้นแบบ มาครอบตัวละครจากรูป ref
# = motion transfer (แบบที่เห็นในคลิป MotionForge / VACE)
#   control_video  -> วิดีโอต้นแบบ (source motion) ใน ComfyUI/input/
#   reference_image-> รูปตัวละคร (หน้าตา/ชุด) ใน ComfyUI/input/
# ใช้ node โหลดวิดีโอแบบ native (LoadVideo + GetVideoComponents) — ไม่ต้องลง VHS
import json, urllib.request, time, sys

SERVER = "127.0.0.1:8188"
CTRL_VIDEO = "source_motion.mp4"          # << วิดีโอต้นแบบ (อยู่ใน ComfyUI/input/)
REF        = "character_ref.png"          # << รูปตัวละคร   (อยู่ใน ComfyUI/input/)

POS = ("1girl, solo, long pink hair, white crop top, dancing, "
       "anime style, masterpiece, best quality, detailed")
NEG = "bad quality, worst quality, blurry, distorted, deformed, watermark, text, static, still image"

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 55012398
# 480p portrait = เบาสุดสำหรับ 1.3B บน 6GB. คลิปใช้ 720x1280 บน runpod (กิน VRAM กว่ามาก)
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

    # --- รูปตัวละคร = reference ---
    "12":{"class_type": "LoadImage", "inputs": {"image": REF}},

    # --- วิดีโอต้นแบบ = control (source motion) — native nodes ---
    "20":{"class_type": "LoadVideo", "inputs": {"file": CTRL_VIDEO}},
    "22":{"class_type": "GetVideoComponents", "inputs": {"video": ["20", 0]}},
    # ปรับเฟรมต้นแบบให้ตรงขนาด W x H (WanVaceToVideo จะหยิบ [:length] เฟรมแรกเอง)
    "21":{"class_type": "ImageScale",
          "inputs": {"image": ["22", 0], "width": W, "height": H,
                     "upscale_method": "lanczos", "crop": "center"}},

    "6": {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": ["2", 0]}},
    "7": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["2", 0]}},

    "13":{"class_type": "WanVaceToVideo",
          "inputs": {"positive": ["6", 0], "negative": ["7", 0], "vae": ["10", 0],
                     "width": W, "height": H, "length": LEN, "batch_size": 1,
                     "strength": STRENGTH,
                     "control_video": ["21", 0],        # <<< ชิ้นที่ขาดไปในไฟล์เดิม
                     "reference_image": ["12", 0]}},
    "3": {"class_type": "KSampler",
          "inputs": {"seed": SEED, "steps": 6, "cfg": 1.0, "sampler_name": "euler",
                     "scheduler": "simple", "denoise": 1.0, "model": ["11", 0],
                     "positive": ["13", 0], "negative": ["13", 1], "latent_image": ["13", 2]}},
    "14":{"class_type": "TrimVideoLatent",
          "inputs": {"samples": ["3", 0], "trim_amount": ["13", 3]}},
    "8": {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["10", 0]}},
    "9": {"class_type": "SaveAnimatedWEBP",
          "inputs": {"images": ["8", 0], "filename_prefix": "vace_v2v",
                     "fps": float(FPS), "lossless": False, "quality": 90, "method": "default"}},
}

req = urllib.request.Request(f"http://{SERVER}/prompt",
    data=json.dumps({"prompt": wf}).encode(), headers={"Content-Type": "application/json"})
pid = json.load(urllib.request.urlopen(req))["prompt_id"]
print(f"queued pid={pid} seed={SEED} ({W}x{H}, {LEN}f) ctrl={CTRL_VIDEO} ref={REF}", flush=True)

t0 = time.time()
while time.time() - t0 < 1200:
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
