#!/usr/bin/env python3
# Cantarella ท่า gangbang + doggystyle (ใช้ pose LoRA ที่โหลดไว้ stack กับ character LoRA)
import json, urllib.request, time

SERVER = "127.0.0.1:8188"

QUALITY = "masterpiece, best quality, amazing quality, absurdres, nsfw, rating:explicit, "
NEG = ("bad quality, worst quality, worst detail, sketch, censored, "
       "lowres, bad anatomy, bad hands, missing fingers, extra digits, fewer digits, "
       "extra limbs, fused fingers, jpeg artifacts, signature, watermark, username, blurry, "
       "child, loli, flat chest, young")

# (prefix, seed, [lora stack: (file, sm, sc)], positive)
SCENES = [
    ("cantarella_gangbang", 612377401,
     [("stabilizer.safetensors", 0.7, 0.7),
      ("oral_gangbang.safetensors", 0.9, 0.9),
      ("cantarella_main.safetensors", 0.75, 0.75)],
     QUALITY + "WW Cantarella, mature female, adult, beautiful detailed face, long hair, "
     "large breasts, nude, 1girl, multiple boys, gangbang, surrounded by penises, "
     "multiple penises, fellatio, oral, cum, blush, looking at viewer, "
     "kneeling, detailed indoor background, soft lighting"),

    ("cantarella_doggy", 884120655,
     [("stabilizer.safetensors", 0.7, 0.7),
      ("squatting_doggystyle.safetensors", 0.85, 0.85),
      ("cantarella_main.safetensors", 0.8, 0.8)],
     QUALITY + "WW Cantarella, mature female, adult, beautiful detailed face, long hair, "
     "large breasts, nude, 1girl, 1boy, hetero, doggystyle, sex from behind, all fours, "
     "ssfb, ass, arched back, looking back, blush, sweat, vaginal, "
     "detailed bedroom background, soft warm lighting"),
]

def build(stack, pos, seed):
    wf = {"4": {"class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}}}
    m, c = ["4", 0], ["4", 1]
    nid = 20
    for fn, sm, sc in stack:
        wf[str(nid)] = {"class_type": "LoraLoader",
                        "inputs": {"lora_name": fn, "strength_model": sm, "strength_clip": sc,
                                   "model": m, "clip": c}}
        m, c = [str(nid), 0], [str(nid), 1]
        nid += 1
    wf["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": c}}
    wf["7"] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": c}}
    wf["5"] = {"class_type": "EmptyLatentImage",
               "inputs": {"width": 832, "height": 1216, "batch_size": 1}}
    wf["3"] = {"class_type": "KSampler",
               "inputs": {"seed": seed, "steps": 28, "cfg": 5.0,
                          "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
                          "model": m, "positive": ["6", 0], "negative": ["7", 0],
                          "latent_image": ["5", 0]}}
    wf["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}}
    return wf

def run(prefix, seed, stack, pos):
    wf = build(stack, pos, seed)
    wf["9"] = {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}}
    data = json.dumps({"prompt": wf}).encode()
    req = urllib.request.Request(f"http://{SERVER}/prompt", data=data,
                                headers={"Content-Type": "application/json"})
    pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    print(f"[{prefix}] queued seed={seed} pid={pid}", flush=True)
    t0 = time.time()
    while True:
        time.sleep(3)
        try:
            h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
        except Exception:
            continue
        if pid in h:
            imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
            if imgs:
                print(f"[{prefix}] DONE {int(time.time()-t0)}s -> output/{imgs[0]['filename']}", flush=True)
                return
            if h[pid].get("status", {}).get("status_str") == "error":
                print(f"[{prefix}] ERROR", json.dumps(h[pid]["status"])[:1500]); return
        if time.time() - t0 > 600:
            print(f"[{prefix}] timeout"); return

for s in SCENES:
    run(*s)
