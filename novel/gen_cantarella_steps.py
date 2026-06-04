#!/usr/bin/env python3
# Cantarella 4-step sequence (composition ต้นฉบับของเราเอง ไม่ลอกหน้ามังงะใคร)
# step: 1 ลวนลาม > 2 ถอดชุดเอง > 3 พาดหน้า > 4 อม
import json, urllib.request, time

SERVER = "127.0.0.1:8188"
Q = "masterpiece, best quality, amazing quality, absurdres, usnr, "
CH = "WW Cantarella, mature female, adult, beautiful detailed face, long silver blue hair, blush, "
NEG = ("bad quality, worst quality, worst detail, sketch, censored, lowres, bad anatomy, "
       "bad hands, missing fingers, extra digits, fewer digits, extra limbs, fused fingers, "
       "jpeg artifacts, signature, watermark, username, blurry, child, loli, flat chest, young")

def stack(extra=None):
    s = [("stabilizer.safetensors", 0.7, 0.7),
         ("usnr_style.safetensors", 0.5, 0.5),
         ("cantarella_main.safetensors", 0.8, 0.8)]
    if extra: s.insert(2, extra)
    return s

STEPS = [
    ("cantarella_step_1_grope", 201, stack(),
     Q + CH + "nsfw, 1girl, 1boy, clothed, elegant dress, grabbed from behind, "
     "breast grab over clothes, groped, hands on breasts, surprised expression, "
     "trembling, indoor, soft lighting"),
    ("cantarella_step_2_undress", 202, stack(),
     Q + CH + "nsfw, 1girl, solo, undressing, removing own dress, pulling down clothes, "
     "partially nude, large breasts exposed, embarrassed, looking away, indoor"),
    ("cantarella_step_3_facup", 203, stack(("oral_gangbang.safetensors", 0.85, 0.85)),
     Q + CH + "nsfw, rating:explicit, 1girl, 1boy, nude, penis on face, penis over face, "
     "large breasts, kneeling, looking up, blush, indoor"),
    ("cantarella_step_4_oral", 204, stack(("oral_gangbang.safetensors", 0.85, 0.85)),
     Q + CH + "nsfw, rating:explicit, 1girl, 1boy, nude, fellatio, oral, penis in mouth, "
     "large breasts, kneeling, looking up at viewer, blush, indoor"),
]

def build(st, pos, seed):
    wf = {"4": {"class_type": "CheckpointLoaderSimple",
                "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}}}
    m, c, nid = ["4", 0], ["4", 1], 20
    for fn, sm, sc in st:
        wf[str(nid)] = {"class_type": "LoraLoader",
                        "inputs": {"lora_name": fn, "strength_model": sm, "strength_clip": sc,
                                   "model": m, "clip": c}}
        m, c = [str(nid), 0], [str(nid), 1]; nid += 1
    wf["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": c}}
    wf["7"] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": c}}
    wf["5"] = {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": 1}}
    wf["3"] = {"class_type": "KSampler",
               "inputs": {"seed": seed, "steps": 28, "cfg": 5.0, "sampler_name": "dpmpp_2m",
                          "scheduler": "karras", "denoise": 1.0, "model": m,
                          "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}}
    wf["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}}
    return wf

def run(prefix, seed, st, pos):
    wf = build(st, pos, seed)
    wf["9"] = {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}}
    req = urllib.request.Request(f"http://{SERVER}/prompt",
        data=json.dumps({"prompt": wf}).encode(), headers={"Content-Type": "application/json"})
    pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    print(f"[{prefix}] queued", flush=True)
    t0 = time.time()
    while time.time() - t0 < 600:
        time.sleep(3)
        try: h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
        except Exception: continue
        if pid in h:
            imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
            if imgs: print(f"[{prefix}] DONE {int(time.time()-t0)}s -> output/{imgs[0]['filename']}", flush=True); return
            if h[pid].get("status", {}).get("status_str") == "error":
                print(f"[{prefix}] ERROR", json.dumps(h[pid]["status"])[:1200]); return

for s in STEPS:
    run(*s)
print("=== steps done ===")
