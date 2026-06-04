#!/usr/bin/env python3
# Cantarella ท่า: นอนคว่ำ สะโพกยก มองย้อนกลับ มุมมองจากบน (ตามโครงรูปอ้างอิง ไม่ลอกรูปต้นฉบับ)
import json, urllib.request, time, sys
SERVER = "127.0.0.1:8188"
SEED = int(sys.argv[1]) if len(sys.argv) > 1 else 5520117

POS = ("masterpiece, best quality, amazing quality, absurdres, usnr, "
       "WW Cantarella, mature female, adult, beautiful detailed face, "
       "long silver blue hair, "  # คง Cantarella ตามที่สั่ง
       "1girl, solo, lying on stomach, prone, on couch with cushions and pillows, "
       "hips raised, ass up, ass focus, top-down view, from above, "
       "looking back at viewer, seductive smile, half-lidded eyes, blush, "
       "arm forward resting on pillow, large breasts, "
       "micro bikini, yellow and black strappy harness bikini, thigh strap, garter straps, "
       "black collar, outdoor patio, soft natural daylight, depth of field")
NEG = ("bad quality, worst quality, worst detail, sketch, censored, lowres, bad anatomy, "
       "bad hands, missing fingers, extra digits, fewer digits, extra limbs, fused fingers, "
       "jpeg artifacts, signature, watermark, username, blurry, child, loli, flat chest, young, multiple girls")

STACK = [("stabilizer.safetensors", 0.7, 0.7), ("usnr_style.safetensors", 0.5, 0.5),
         ("prone_bone.safetensors", 0.7, 0.7), ("cantarella_main.safetensors", 0.8, 0.8)]

wf = {"4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "wai_illustrious_v17.safetensors"}}}
m, c, nid = ["4", 0], ["4", 1], 20
for fn, sm, sc in STACK:
    wf[str(nid)] = {"class_type": "LoraLoader", "inputs": {"lora_name": fn, "strength_model": sm, "strength_clip": sc, "model": m, "clip": c}}
    m, c = [str(nid), 0], [str(nid), 1]; nid += 1
wf["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": POS, "clip": c}}
wf["7"] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": c}}
wf["5"] = {"class_type": "EmptyLatentImage", "inputs": {"width": 1216, "height": 832, "batch_size": 1}}  # นอน (landscape) ตามอ้างอิง
wf["3"] = {"class_type": "KSampler", "inputs": {"seed": SEED, "steps": 30, "cfg": 5.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0, "model": m, "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0]}}
wf["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}}
wf["9"] = {"class_type": "SaveImage", "inputs": {"filename_prefix": "cantarella_proneass", "images": ["8", 0]}}

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
