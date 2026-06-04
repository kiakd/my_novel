#!/usr/bin/env python3
# DMD2 speed test — seed/prompt เดียวกับ cantarella_pov_MPLD (28 steps) แต่ DMD2 + 8 steps cfg 1.0
import json, urllib.request, time, sys
SERVER = "127.0.0.1:8188"
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 99001   # ตรงกับรูป 28-step เดิม

POS = ("masterpiece, best quality, amazing quality, absurdres, usnr, "
       "nsfw, rating:explicit, WW Cantarella, mature female, adult, "
       "beautiful detailed face, long silver blue hair, large breasts, nude, "
       "1girl, 1boy, pov, lying down on ground, MPLD, legs up, mating press, pinning, pov arms, "
       "looking at viewer, dutch angle, blush, sweat, bedroom, soft warm lighting")
NEG = ("bad quality, worst quality, worst detail, sketch, censored, lowres, bad anatomy, "
       "bad hands, missing fingers, extra digits, fewer digits, extra limbs, fused fingers, "
       "jpeg artifacts, signature, watermark, username, blurry, child, loli, flat chest, young")

STACK = [("stabilizer.safetensors", 0.7, 0.7), ("usnr_style.safetensors", 0.5, 0.5),
         ("pov_lookingdown_il3.safetensors", 0.85, 0.85), ("cantarella_main.safetensors", 0.8, 0.8)]

wf = {"4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}}}
m, c, nid = ["4", 0], ["4", 1], 20
for fn, sm, sc in STACK:
    wf[str(nid)] = {"class_type": "LoraLoader", "inputs": {"lora_name": fn, "strength_model": sm, "strength_clip": sc, "model": m, "clip": c}}
    m, c = [str(nid), 0], [str(nid), 1]; nid += 1
# DMD2 (model-only) ต่อท้ายสุด
wf["30"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": m, "lora_name": "dmd2_sdxl_4step.safetensors", "strength_model": 1.0}}
m = ["30", 0]
wf["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": c}}
wf["7"] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": c}}
wf["5"] = {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": 1}}
wf["3"] = {"class_type": "KSampler",
           "inputs": {"seed": SEED, "steps": 8, "cfg": 1.0, "sampler_name": "lcm",
                      "scheduler": "sgm_uniform", "denoise": 1.0, "model": m,
                      "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}}
wf["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}}
wf["9"] = {"class_type": "SaveImage", "inputs": {"filename_prefix": "cantarella_dmd2_MPLD", "images": ["8", 0]}}

req = urllib.request.Request(f"http://{SERVER}/prompt", data=json.dumps({"prompt": wf}).encode(), headers={"Content-Type": "application/json"})
pid = json.load(urllib.request.urlopen(req))["prompt_id"]
print(f"queued DMD2 8steps cfg1 seed={SEED}", flush=True)
t0 = time.time()
while time.time() - t0 < 300:
    time.sleep(2)
    try: h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
    except Exception: continue
    if pid in h:
        imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
        if imgs: print(f"DONE {int(time.time()-t0)}s -> output/{imgs[0]['filename']}", flush=True); break
        if h[pid].get("status", {}).get("status_str") == "error": print("ERROR", json.dumps(h[pid]["status"])[:1500]); break
