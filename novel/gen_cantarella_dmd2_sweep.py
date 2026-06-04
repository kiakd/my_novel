#!/usr/bin/env python3
# DMD2 step sweep — seed/prompt เดียวกับ baseline (cantarella_pov_MPLD seed 99001)
# เทียบหลายระดับ step/cfg/sampler คุมเวลา <60s
import json, urllib.request, time
SERVER = "127.0.0.1:8188"
SEED = 99001

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

# (prefix, steps, cfg, sampler, scheduler)
CONFIGS = [
    ("cantarella_dmd2_s12_cfg15",  12, 1.5, "lcm",      "sgm_uniform"),
    ("cantarella_dmd2_s16_cfg15",  16, 1.5, "lcm",      "sgm_uniform"),
    ("cantarella_dmd2_s16_eulr20", 16, 2.0, "euler",    "sgm_uniform"),
    ("cantarella_dmd2_s20_cfg20",  20, 2.0, "lcm",      "sgm_uniform"),
]

def build(prefix, steps, cfg, sampler, sched):
    wf = {"4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}}}
    m, c, nid = ["4", 0], ["4", 1], 20
    for fn, sm, sc in STACK:
        wf[str(nid)] = {"class_type": "LoraLoader", "inputs": {"lora_name": fn, "strength_model": sm, "strength_clip": sc, "model": m, "clip": c}}
        m, c = [str(nid), 0], [str(nid), 1]; nid += 1
    wf["30"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": m, "lora_name": "dmd2_sdxl_4step.safetensors", "strength_model": 1.0}}
    m = ["30", 0]
    wf["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": c}}
    wf["7"] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": c}}
    wf["5"] = {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": 1}}
    wf["3"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": steps, "cfg": cfg, "sampler_name": sampler, "scheduler": sched, "denoise": 1.0, "model": m, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}}
    wf["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}}
    wf["9"] = {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}}
    return wf

def run(prefix, *cfg):
    wf = build(prefix, *cfg)
    req = urllib.request.Request(f"http://{SERVER}/prompt", data=json.dumps({"prompt": wf}).encode(), headers={"Content-Type": "application/json"})
    pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < 200:
        time.sleep(2)
        try: h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
        except Exception: continue
        if pid in h:
            imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
            if imgs:
                dt = int(time.time()-t0)
                flag = "  <<< OVER 60s!" if dt > 60 else ""
                print(f"[{prefix}] steps={cfg[0]} cfg={cfg[1]} {cfg[2]} -> {dt}s{flag} -> {imgs[0]['filename']}", flush=True); return
            if h[pid].get("status", {}).get("status_str") == "error":
                print(f"[{prefix}] ERROR", json.dumps(h[pid]["status"])[:800]); return

for cfg in CONFIGS:
    run(*cfg)
print("=== sweep done ===")
