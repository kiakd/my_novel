#!/usr/bin/env python3
import json, urllib.request, urllib.parse, time, sys

SERVER = "127.0.0.1:8188"

POS = ("nsfw, rating:explicit, masterpiece, best quality, absurdres, ultra detailed, "
       "meinahentai style, 1girl, cool beautiful tomboy, short messy wet black hair, "
       "crimson glowing cyber eyes, seductive half-lidded eyes looking at viewer, "
       "lying sideways on luxurious sofa, body arched, head resting on pillow, "
       "one hand gripping the sofa edge, other hand near chest, hips pushed up and back, "
       "ass prominently displayed, seductive pose, "
       "wearing tiny yellow and black strappy micro bikini harness, "
       "extremely revealing leather-like straps, sheer wet fabric, "
       "pink erect nipples visible, massive enormous breasts squished against sofa, "
       "underboob and sideboob exposed, "
       "black leather collar with big golden bell, "
       "wet glistening skin with water droplets, fresh from shower, athletic toned body, "
       "soft lighting, inside high-end modern bedroom with neon accents, "
       "detailed textures, shiny wet body, explicit, nsfw, r18")

NEG = ("lowres, worst quality, low quality, bad anatomy, bad hands, missing fingers, "
       "extra digits, fewer digits, extra limbs, deformed, mutated, ugly, disfigured, "
       "blurry, jpeg artifacts, watermark, signature, text, username, "
       "monochrome, grayscale, "
       "child, loli, flat chest, young, multiple girls")

SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 729144501

wf = {
    "4": {"class_type": "CheckpointLoaderSimple",
          "inputs": {"ckpt_name": "meinahentai_v5Final.safetensors"}},
    "6": {"class_type": "CLIPTextEncode",
          "inputs": {"text": POS, "clip": ["4", 1]}},
    "7": {"class_type": "CLIPTextEncode",
          "inputs": {"text": NEG, "clip": ["4", 1]}},
    "5": {"class_type": "EmptyLatentImage",
          "inputs": {"width": 768, "height": 512, "batch_size": 1}},
    "3": {"class_type": "KSampler",
          "inputs": {"seed": SEED, "steps": 28, "cfg": 7.0,
                     "sampler_name": "dpmpp_2m", "scheduler": "karras",
                     "denoise": 1.0, "model": ["4", 0],
                     "positive": ["6", 0], "negative": ["7", 0],
                     "latent_image": ["5", 0]}},
    "8": {"class_type": "VAEDecode",
          "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9": {"class_type": "SaveImage",
          "inputs": {"filename_prefix": "cosplay_tomboy", "images": ["8", 0]}},
}

# queue
data = json.dumps({"prompt": wf}).encode()
req = urllib.request.Request(f"http://{SERVER}/prompt", data=data,
                            headers={"Content-Type": "application/json"})
resp = json.load(urllib.request.urlopen(req))
pid = resp["prompt_id"]
print(f"queued prompt_id={pid} seed={SEED}", flush=True)

# poll history
t0 = time.time()
while True:
    time.sleep(3)
    try:
        h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
    except Exception as e:
        print("poll err", e); continue
    if pid in h:
        outs = h[pid].get("outputs", {})
        imgs = outs.get("9", {}).get("images", [])
        if imgs:
            fn = imgs[0]["filename"]
            print(f"DONE {int(time.time()-t0)}s -> output/{fn}", flush=True)
            break
        st = h[pid].get("status", {})
        if st.get("status_str") == "error":
            print("ERROR", json.dumps(st)[:1500]); break
    if time.time() - t0 > 600:
        print("timeout"); break
