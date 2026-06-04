#!/usr/bin/env python3
# WAN VACE 1.3B video-to-video เต็มความยาว (12s) — วิธี A: ลด strength + แบ่งเจนเป็น chunk
#   ต้นแบบ 368 เฟรม @30fps -> แบ่งเป็น chunk ละ 33 เฟรม (พอดี 6GB) -> ต่อด้วย ffmpeg เป็น mp4 เดียว
#   strength 0.6 = ก๊อปเฉพาะ "ทิศทางการเคลื่อนไหว" จากต้นแบบ ปล่อยหน้าตา/ชุดให้ ref+prompt คุม
import json, urllib.request, time, sys, os, glob, shutil, subprocess

SERVER = "127.0.0.1:8188"
COMFY  = r"D:\test\my_novel\comfyui\ComfyUI"
CTRL_VIDEO = "source_motion.mp4"
REF        = "character_ref.png"

# prompt ให้ตรงกับ ref (สาวผมชมพู ชุดขาวประดับ แนว Honkai cosplay)
POS = ("1girl, solo, long pink hair, twin tails, white ornate dress, white gloves, "
       "fair skin, large breasts, beautiful detailed eyes, gentle smile, cosplay, "
       "dancing, dynamic motion, anime style, masterpiece, best quality, detailed")
NEG = "bad quality, worst quality, blurry, distorted, deformed, watermark, text, extra limbs, missing fingers"

SEED      = int(sys.argv[1]) if len(sys.argv) > 1 else 55012398
W, H      = 480, 832
TOTAL     = 368        # เฟรมต้นแบบทั้งหมด
FPS       = 30         # = fps ต้นแบบ (control map 1:1)
CHUNK     = 33         # เฟรม/chunk (4n+1, ขนาดที่รันผ่านบน 6GB)
STRENGTH  = 0.6        # << วิธี A
PREFIX    = "vace_full"

def chunk_wf(start, length):
    return {
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
        # โหลดวิดีโอ -> เฟรมทั้งหมด -> ตัดช่วง [start : start+length] -> resize
        "20":{"class_type": "LoadVideo", "inputs": {"file": CTRL_VIDEO}},
        "22":{"class_type": "GetVideoComponents", "inputs": {"video": ["20", 0]}},
        "23":{"class_type": "GetImageRangeFromBatch",
              "inputs": {"images": ["22", 0], "start_index": start, "num_frames": length}},
        "21":{"class_type": "ImageScale",
              "inputs": {"image": ["23", 0], "width": W, "height": H,
                         "upscale_method": "lanczos", "crop": "center"}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": ["2", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["2", 0]}},
        "13":{"class_type": "WanVaceToVideo",
              "inputs": {"positive": ["6", 0], "negative": ["7", 0], "vae": ["10", 0],
                         "width": W, "height": H, "length": length, "batch_size": 1,
                         "strength": STRENGTH,
                         "control_video": ["21", 0], "reference_image": ["12", 0]}},
        "3": {"class_type": "KSampler",
              "inputs": {"seed": SEED, "steps": 6, "cfg": 1.0, "sampler_name": "euler",
                         "scheduler": "simple", "denoise": 1.0, "model": ["11", 0],
                         "positive": ["13", 0], "negative": ["13", 1], "latent_image": ["13", 2]}},
        "14":{"class_type": "TrimVideoLatent", "inputs": {"samples": ["3", 0], "trim_amount": ["13", 3]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["14", 0], "vae": ["10", 0]}},
        # save เป็น PNG sequence: vace_full/cNN__0000X_.png  (sort ได้ตามลำดับ chunk+เฟรม)
        "9": {"class_type": "SaveImage",
              "inputs": {"images": ["8", 0], "filename_prefix": f"{PREFIX}/c{idx:02d}_"}},
    }

def queue_and_wait(wf, tag):
    req = urllib.request.Request(f"http://{SERVER}/prompt",
        data=json.dumps({"prompt": wf}).encode(), headers={"Content-Type": "application/json"})
    pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(3)
        try: h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
        except Exception: continue
        if pid in h:
            outs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
            if outs:
                print(f"  {tag}: DONE {int(time.time()-t0)}s ({len(outs)} frames)", flush=True)
                return True
            st = h[pid].get("status", {})
            if st.get("status_str") == "error":
                print(f"  {tag}: ERROR", json.dumps(st)[:1500], flush=True); return False
    print(f"  {tag}: timeout", flush=True); return False

# --- เจนทีละ chunk ---
starts = list(range(0, TOTAL, CHUNK))
print(f"generating {len(starts)} chunks (CHUNK={CHUNK}, strength={STRENGTH}, seed={SEED})", flush=True)
for idx, start in enumerate(starts):
    length = min(CHUNK, TOTAL - start)
    if length < 5:   # WAN ต้องการอย่างน้อย ~5 เฟรม (4n+1)
        print(f"  chunk{idx}: skip (เหลือ {length} เฟรม)", flush=True); continue
    print(f"chunk {idx+1}/{len(starts)}: frames [{start}:{start+length}]", flush=True)
    if not queue_and_wait(chunk_wf(start, length), f"chunk{idx:02d}"):
        print("หยุดเพราะ chunk ล้มเหลว"); sys.exit(1)

# --- รวม PNG ทุก chunk เป็น mp4 เดียวด้วย ffmpeg ---
out_dir = os.path.join(COMFY, "output", PREFIX)
pngs = sorted(glob.glob(os.path.join(out_dir, "c*_*.png")))
print(f"\nรวม {len(pngs)} เฟรม -> mp4", flush=True)
seq_dir = os.path.join(out_dir, "_seq")
shutil.rmtree(seq_dir, ignore_errors=True); os.makedirs(seq_dir)
for i, p in enumerate(pngs):
    shutil.copy(p, os.path.join(seq_dir, f"f{i:05d}.png"))
final = os.path.join(COMFY, "output", "vace_v2v_full.mp4")
subprocess.run(["ffmpeg", "-y", "-framerate", str(FPS),
                "-i", os.path.join(seq_dir, "f%05d.png"),
                "-c:v", "libx264", "-pix_fmt", "yuv420p", final], check=True)
print(f"\nDONE -> {final}  ({len(pngs)} frames @ {FPS}fps = {len(pngs)/FPS:.1f}s)", flush=True)
