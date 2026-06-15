"""
gen_liena_illustrious.py
------------------------
เจน Liena 2 รูปด้วย wai_illustrious_v17 (SDXL อนิเมะ หน้าคมกว่า prefectSemiReal SD1.5)
  - bust  : ครึ่งตัว/หน้าโฟกัส -> เอาไปทำ 3D หัวให้หน้ามีรายละเอียด
  - front : เต็มตัว A-pose -> เทียบ body กับของเดิม
ตัดพื้น BiRefNet ในกราฟเดียว วางบนพื้นเทา เซฟไป comfyui/input/
Illustrious params: cfg 5, 28 steps, dpmpp_2m karras
"""
import json, time, urllib.request
from pathlib import Path
from PIL import Image

SRV = "http://127.0.0.1:8188"
COMFY = Path(__file__).resolve().parent.parent / "comfyui" / "ComfyUI"
CKPT = "wai_illustrious_v17.safetensors"
BIREFNET = "birefnet.safetensors"
SEED = 880088
PANEL_BG = (210, 210, 210)

NEG = ("lowres, worst quality, low quality, bad anatomy, bad hands, missing fingers, "
       "extra digit, fewer digits, jpeg artifacts, signature, watermark, username, blurry, "
       "text, multiple views, multiple girls")
LIENA = ("masterpiece, best quality, amazing quality, very aesthetic, absurdres, "
         "1girl, solo, elf, pointy ears, very long silver white hair, green eyes, "
         "beautiful detailed face, detailed eyes, elegant, fair skin, "
         "elven dress, leaf ornament, fantasy")

SHOTS = {
    "bust":  {"tag": "upper body, portrait, face focus, looking at viewer, simple grey background",
              "w": 1024, "h": 1024, "scale": 0.92, "foot": 0.97},
    "front": {"tag": "(full body:1.3), full body shot, standing, A-pose, looking at viewer, simple grey background",
              "w": 896, "h": 1216, "scale": 0.86, "foot": 0.92},
}


def post(p, payload):
    req = urllib.request.Request(SRV + p, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))

def get(p): return json.load(urllib.request.urlopen(SRV + p, timeout=60))


def graph(shot):
    s = SHOTS[shot]
    return {
        "ck": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "pos": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["ck", 1], "text": f"{LIENA}, {s['tag']}"}},
        "neg": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["ck", 1], "text": NEG}},
        "lat": {"class_type": "EmptyLatentImage", "inputs": {"width": s["w"], "height": s["h"], "batch_size": 1}},
        "ks": {"class_type": "KSampler", "inputs": {"model": ["ck", 0], "positive": ["pos", 0],
               "negative": ["neg", 0], "latent_image": ["lat", 0], "seed": SEED, "steps": 28,
               "cfg": 5.0, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
        "vd": {"class_type": "VAEDecode", "inputs": {"samples": ["ks", 0], "vae": ["ck", 2]}},
        "bgm": {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": BIREFNET}},
        "rb": {"class_type": "RemoveBackground", "inputs": {"image": ["vd", 0], "bg_removal_model": ["bgm", 0]}},
        "iv": {"class_type": "InvertMask", "inputs": {"mask": ["rb", 0]}},
        "jn": {"class_type": "JoinImageWithAlpha", "inputs": {"image": ["vd", 0], "alpha": ["iv", 0]}},
        "sv": {"class_type": "SaveImage", "inputs": {"images": ["jn", 0], "filename_prefix": f"liena_ill/{shot}"}},
    }


def run(shot):
    pid = post("/prompt", {"prompt": graph(shot)})["prompt_id"]
    print(f"[>] {shot}: queued {pid}", flush=True)
    t0 = time.time()
    while True:
        time.sleep(4)
        h = get(f"/history/{pid}")
        if pid in h:
            outs = h[pid].get("outputs", {})
            if "sv" in outs and outs["sv"].get("images"):
                im = outs["sv"]["images"][0]
                fp = COMFY / "output" / im.get("subfolder", "") / im["filename"]
                print(f"[ok] {shot}: {fp.name} ({time.time()-t0:.0f}s)", flush=True)
                return fp
            if h[pid].get("status", {}).get("status_str") == "error":
                print(f"[x] {shot} ERROR:\n{json.dumps(h[pid].get('status'), indent=2)[:2000]}", flush=True)
                return None
        if time.time() - t0 > 300:
            print(f"[x] {shot} timeout", flush=True); return None
        print(f"  ... {shot} {time.time()-t0:.0f}s", flush=True)


def on_grey(cut_path, shot):
    s = SHOTS[shot]
    sub = Image.open(cut_path).convert("RGBA")
    bbox = sub.getbbox() or (0, 0, sub.width, sub.height)
    sub = sub.crop(bbox)
    W = H = 1024
    th = int(H * s["scale"]); scale = th / sub.height
    nw = max(1, int(sub.width * scale))
    sub = sub.resize((nw, th), Image.LANCZOS)
    canvas = Image.new("RGB", (W, H), PANEL_BG)
    x = (W - nw) // 2; y = int(H * s["foot"]) - th
    canvas.paste(sub, (x, max(0, y)), sub)
    out = COMFY / "input" / f"liena_ill_{shot}.png"
    canvas.save(out)
    return out


def main():
    for shot in SHOTS:
        p = run(shot)
        if not p:
            print("[x] หยุด"); return
        out = on_grey(p, shot)
        print(f"[input] {out}", flush=True)
    print("\n[next] python novel/gen_3d_from_image.py comfyui/ComfyUI/input/liena_ill_bust.png liena_head 384", flush=True)
    print("[next] python novel/gen_3d_from_image.py comfyui/ComfyUI/input/liena_ill_front.png liena_ill_body 256", flush=True)


if __name__ == "__main__":
    main()
