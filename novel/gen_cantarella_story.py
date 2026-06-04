#!/usr/bin/env python3
# Cantarella story (ขาวดำมังงะ) — เนื้อเรื่องต้นฉบับ 8 ช่อง + จัดหน้าอัตโนมัติ
import json, urllib.request, time, os
from PIL import Image, ImageOps

SERVER = "127.0.0.1:8188"
OUT = "../comfyui/ComfyUI/output"

Q = "masterpiece, best quality, amazing quality, absurdres, monochrome, greyscale, manga, comic, screentone, "
CH = "WW Cantarella, mature female, adult, beautiful detailed face, long hair, large breasts, "
MEN = "2boys, dark-skinned male, dark skin, large penis, interracial, "
NEG = ("colored, color, bad quality, worst quality, worst detail, lowres, bad anatomy, bad hands, "
       "missing fingers, extra digits, fewer digits, extra limbs, fused fingers, jpeg artifacts, "
       "signature, watermark, username, blurry, child, loli, flat chest, young")

def st(extra=None):
    s = [("stabilizer.safetensors", 0.7, 0.7), ("cantarella_main.safetensors", 0.85, 0.85)]
    if extra: s.insert(1, extra)
    return s

# (prefix, seed, stack, positive)
PANELS = [
    ("story_p1", 301, st(),
     Q + CH + "1girl, solo, micro bikini, beach, ocean background, morning sunlight, walking, looking at viewer, full body"),
    ("story_p2", 302, st(),
     Q + CH + MEN + "1girl, beach, two men talking to her, inviting gesture, Cantarella annoyed reluctant frown, micro bikini, declining"),
    ("story_p3", 303, st(),
     Q + CH + MEN + "1girl, beach, breast grab, groping breasts, hand in bikini bottom, molested from front and behind, "
     "Cantarella blush, aroused weak expression, half-lidded eyes, micro bikini"),
    ("story_p4", 304, st(("forced_kiss_il.safetensors", 0.8, 0.8)),
     Q + CH + MEN + "1girl, indoors bedroom, deep forced kiss with one man, the other man cunnilingus licking pussy from below, "
     "nude, blush, standing, sweat"),
    ("story_p5", 305, st(("oral_gangbang.safetensors", 0.85, 0.85)),
     Q + CH + MEN + "1girl, double handjob, two penises, penis on face, facial, cum on face, cum, kneeling, nude, blush, looking up"),
    ("story_p6", 306, st(("spitroast.safetensors", 0.9, 0.9)),
     Q + CH + MEN + "1girl, spitroast, threesome, fellatio irrumatio penis in mouth, vaginal sex from behind, double penetration, "
     "on bed, nude, ahegao, sweat"),
    ("story_p7", 307, st(("oral_gangbang.safetensors", 0.8, 0.8)),
     Q + CH + MEN + "1girl, cum, creampie, cum in mouth, cum overflow, facial, excessive cum, nude, ahegao, exhausted, lying on bed"),
    ("story_p8", 308, st(),
     Q + CH + MEN + "1girl, lying on back, spread legs held open, one man on each side left and right, Cantarella in center, "
     "peace sign, v sign, double v, ahegao, satisfied smile, cum covered, nude, bed"),
]

def build(stack, pos, seed):
    wf = {"4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}}}
    m, c, nid = ["4", 0], ["4", 1], 20
    for fn, sm, sc in stack:
        wf[str(nid)] = {"class_type": "LoraLoader", "inputs": {"lora_name": fn, "strength_model": sm, "strength_clip": sc, "model": m, "clip": c}}
        m, c = [str(nid), 0], [str(nid), 1]; nid += 1
    wf["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": c}}
    wf["7"] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": c}}
    wf["5"] = {"class_type": "EmptyLatentImage", "inputs": {"width": 832, "height": 1216, "batch_size": 1}}
    wf["3"] = {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 28, "cfg": 5.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0, "model": m, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}}
    wf["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}}
    return wf

def run(prefix, seed, stack, pos):
    wf = build(stack, pos, seed)
    wf["9"] = {"class_type": "SaveImage", "inputs": {"filename_prefix": prefix, "images": ["8", 0]}}
    req = urllib.request.Request(f"http://{SERVER}/prompt", data=json.dumps({"prompt": wf}).encode(), headers={"Content-Type": "application/json"})
    pid = json.load(urllib.request.urlopen(req))["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < 400:
        time.sleep(3)
        try: h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
        except Exception: continue
        if pid in h:
            imgs = h[pid].get("outputs", {}).get("9", {}).get("images", [])
            if imgs: print(f"[{prefix}] {int(time.time()-t0)}s -> {imgs[0]['filename']}", flush=True); return imgs[0]['filename']
            if h[pid].get("status", {}).get("status_str") == "error": print(f"[{prefix}] ERROR", json.dumps(h[pid]["status"])[:600]); return None

files = []
for p in PANELS:
    files.append(run(*p))

# ---- compose 2 cols x 4 rows manga page ----
files = [f for f in files if f]
COLS, ROWS = 2, 4
PW, PH, BORDER, GUT, MAR = 560, 818, 5, 18, 30
pw = MAR*2 + PW*COLS + GUT*(COLS-1)
ph = MAR*2 + PH*ROWS + GUT*(ROWS-1)
page = Image.new("RGB", (pw, ph), (255,255,255))
for i, fn in enumerate(files):
    r, c = divmod(i, COLS)
    x = MAR + c*(PW+GUT); y = MAR + r*(PH+GUT)
    im = ImageOps.fit(Image.open(f"{OUT}/{fn}").convert("RGB"), (PW, PH), Image.LANCZOS)
    im = ImageOps.expand(im, border=BORDER, fill=(20,20,20))
    page.paste(im, (x-BORDER, y-BORDER))
page.save(f"{OUT}/cantarella_story_page.png")
print(f"=== PAGE saved -> output/cantarella_story_page.png ({pw}x{ph}) ===")
