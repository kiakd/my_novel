#!/usr/bin/env python3
# เจนตาม workflow textToImage2.json: prefectSemiReal_v10 + TA_trained x2
# (768x1152, 25 steps, cfg 5, dpmpp_2m_sde karras, LoRA 1.0/1.0)
# prompt ใหม่ตาม ref ของพี่ (punk biker girl, rainy cyberpunk night)
import json, urllib.request, time, sys

SERVER = "127.0.0.1:8188"

# POS = (
#     "(artist:mazjojo:0.75), (artist:pigeon666:0.72), (artist:zawar379:0.78), "
#     "(artist:remsrar:0.65), (artist:chimmyming:0.7), (artist:yoneyamamai:0.7), "

#     "character reference sheet, full body, standing pose, front view, "
#     "1girl, punk biker girl, sharp jawline, high cheekbones, captivating fox green eyes, "
#     "heavy black smokey makeup, slight running mascara, "
#     "messy wavy dark blue hair with silver highlights, "
#     "old scar on jaw, septum piercing, multiple industrial ear piercings, "

#     "completely nude, naked, bare body, full frontal nudity, "
#     "side tattoos on arm, "

#     "confident neutral stance, intense gaze, seductive expression, "

#     "plain neutral studio background, soft even lighting, clear full body visibility, "
#     "hyper detailed skin texture, visible pores, realistic skin, subtle body shadows, "
#     "film grain, shallow depth of field, moody noir color palette, "

#     "masterpiece, best quality, ultra detailed, 8k, intricate details"
# )

POS = (
    "(artist:mazjojo:0.75), (artist:pigeon666:0.72), (artist:zawar379:0.78), "
    "(artist:remsrar:0.65), (artist:chimmyming:0.7), (artist:yoneyamamai:0.7), "

    "1girl, (1man:1.3), (hetero:1.2), punk biker girl, sharp jawline, high cheekbones, captivating fox green eyes, "
    "heavy black smokey makeup, slight running mascara, messy wavy dark blue hair with silver highlights, "
    "old scar on jaw, septum piercing, multiple industrial ear piercings, side tattoos on arm, "

    "completely nude, naked, full frontal nudity, detailed pussy, detailed nipples, detailed penis, "
    "handsome man, muscular build, short dark hair, "

    "cowgirl position, girl on top, straddling man, riding cock, "
    "man lying on back, girl facing him, hands on his chest, "
    "(detailed penetration:1.3), vaginal sex, deep insertion, juices dripping, sweat on body, "

    "from side view, dynamic angle, "

    "passionate expression, moaning, flushed face, eye contact, intense pleasure, "

    "bedroom setting, rumpled white bedsheets, soft warm bedroom lighting, "
    "cinematic atmosphere, shallow depth of field, film grain, moody romantic lighting, "

    "hyper detailed skin texture, visible pores, realistic skin and anatomy, "
    "masterpiece, best quality, ultra detailed, 8k, intricate details"
)

NEG = (
    "lowres, worst quality, low quality, bad anatomy, bad hands, deformed hands, "
    "multiple views, comic, cartoon, anime, 3d render, "
    "jpeg artifacts, watermark, text, signature, logo, "
    "western face, large eyes, blurry, out of focus, "
    "clothes, clothing, jeans, jacket, underwear, bra, "
    "extra limbs, missing limbs, fused fingers, ugly fingers, bad penetration, "
    "disconnected anatomy, floating body, deformed penis"
)
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 443316998302899
BATCH = int(sys.argv[2]) if len(sys.argv) > 2 else 4

LORA_A = "eacb6c42-dcec-4c53-98cf-d608bc980c64.TA_trained.safetensors"
LORA_B = "37310f25-5ca2-44a1-b462-431094c8dba5.TA_trained.safetensors"

wf = {
    "4":  {"class_type": "CheckpointLoaderSimple",
           "inputs": {"ckpt_name": "prefectSemiReal_v10.safetensors"}},
    "10": {"class_type": "LoraLoader",
           "inputs": {"lora_name": LORA_A, "strength_model": 1.0, "strength_clip": 1.0,
                      "model": ["4", 0], "clip": ["4", 1]}},
    "11": {"class_type": "LoraLoader",
           "inputs": {"lora_name": LORA_B, "strength_model": 1.0, "strength_clip": 1.0,
                      "model": ["10", 0], "clip": ["10", 1]}},
    "6":  {"class_type": "CLIPTextEncode",
           "inputs": {"text": POS, "clip": ["11", 1]}},
    "7":  {"class_type": "CLIPTextEncode",
           "inputs": {"text": NEG, "clip": ["11", 1]}},
    "5":  {"class_type": "EmptyLatentImage",
           "inputs": {"width": 768, "height": 1152, "batch_size": BATCH}},
    "3":  {"class_type": "KSampler",
           "inputs": {"seed": SEED, "steps": 25, "cfg": 5.0,
                      "sampler_name": "dpmpp_2m_sde", "scheduler": "karras",
                      "denoise": 1.0, "model": ["11", 0],
                      "positive": ["6", 0], "negative": ["7", 0],
                      "latent_image": ["5", 0]}},
    "8":  {"class_type": "VAEDecode",
           "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
    "9":  {"class_type": "SaveImage",
           "inputs": {"filename_prefix": "punk_biker", "images": ["8", 0]}},
}

data = json.dumps({"prompt": wf}).encode()
req = urllib.request.Request(f"http://{SERVER}/prompt", data=data,
                            headers={"Content-Type": "application/json"})
try:
    resp = json.load(urllib.request.urlopen(req))
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", "replace")
    print(f"HTTP {e.code} จาก ComfyUI — รายละเอียดที่ server บอก:\n", flush=True)
    try:
        print(json.dumps(json.loads(body), ensure_ascii=False, indent=2))
    except Exception:
        print(body)
    sys.exit(1)
pid = resp["prompt_id"]
print(f"queued prompt_id={pid} seed={SEED} batch={BATCH}", flush=True)

t0 = time.time()
while True:
    time.sleep(3)
    try:
        h = json.load(urllib.request.urlopen(f"http://{SERVER}/history/{pid}"))
    except Exception as e:
        print("poll err", e); continue
    if pid in h:
        st = h[pid].get("status", {})
        outs = h[pid].get("outputs", {})
        imgs = outs.get("9", {}).get("images", [])
        if imgs:
            for im in imgs:
                print(f"DONE {int(time.time()-t0)}s -> output/{im['filename']}", flush=True)
            break
        if st.get("status_str") == "error":
            print("ERROR", json.dumps(st)[:2000]); break
    if time.time() - t0 > 900:
        print("timeout"); break
