#!/usr/bin/env python3
import json, urllib.request, time, sys
SERVER = "127.0.0.1:8188"
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 419087233
POS = ("masterpiece, best quality, amazing quality, absurdres, usnr, "
       "nsfw, forced kiss, WW Cantarella, mature female, adult, beautiful detailed face, "
       "long silver blue hair, large breasts, 1girl, 1boy, hetero, "
       "deep kiss, tongue, saliva, blush, surprised, grabbed, "
       "indoor, soft warm lighting, depth of field")
NEG = ("bad quality, worst quality, worst detail, sketch, censored, lowres, bad anatomy, "
       "bad hands, missing fingers, extra digits, fewer digits, extra limbs, fused fingers, "
       "jpeg artifacts, signature, watermark, username, blurry, child, loli, flat chest, young")
STACK = [("stabilizer.safetensors", 0.7, 0.7), ("usnr_style.safetensors", 0.5, 0.5),
         ("forced_kiss_il.safetensors", 0.85, 0.85), ("cantarella_main.safetensors", 0.8, 0.8)]
wf = {"4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}}}
m, c, nid = ["4", 0], ["4", 1], 20
for fn, sm, sc in STACK:
    wf[str(nid)] = {"class_type": "LoraLoader", "inputs": {"lora_name": fn, "strength_model": sm, "strength_clip": sc, "model": m, "clip": c}}
    m, c = [str(nid), 0], [str(nid), 1]; nid += 1
wf["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": c}}
wf["7"] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": c}}
wf["5"] = {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": 1}}
wf["3"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 28, "cfg": 5.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0, "model": m, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}}
wf["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}}
wf["9"] = {"class_type": "SaveImage", "inputs": {"filename_prefix": "cantarella_forcedkiss", "images": ["8", 0]}}
req = urllib.request.Request(f"http://{SERVER}/prompt", data=json.dumps({"prompt": wf}).encode(), headers={"Content-Type": "application/json"})
pid = json.load(urllib.request.urlopen(req))["prompt_id"]
print(f"queued seed={SEED}", flush=True)
t0 = time.time()
while time.time() - t0 < 600:
    time.sleep(3)
    try: h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
    except Exception: continue
    if pid in h:
        imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
        if imgs: print(f"DONE {int(time.time()-t0)}s -> output/{imgs[0]['filename']}", flush=True); break
        if h[pid].get("status", {}).get("status_str") == "error": print("ERROR", json.dumps(h[pid]["status"])[:1500]); break
