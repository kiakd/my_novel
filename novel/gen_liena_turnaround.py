"""
gen_liena_turnaround.py [name]
------------------------------
เจน Liena เต็มตัว T-pose 3 มุม (front / side / back) ผ่าน ComfyUI :8188
- base ตรงกับ sprite เดิม: prefectSemiReal_v10 + 2x TA_trained LoRA (เจ้าตัวกำหนดหน้า Liena)
- ตัดพื้นหลังด้วย BiRefNet ในกราฟเดียว (LoadBackgroundRemovalModel->RemoveBackground->InvertMask->JoinImageWithAlpha)
- ประกอบเป็น turnaround sheet 4 พาเนล [front | side | side(mirror)=right | back] วางบนพื้นเทาอ่อน
  -> เซฟไป comfyui/input/<name>_turnaround.png ให้ gen_3d_multiview.py กินต่อ
seed ล็อกทุกมุม (เปลี่ยนแค่ tag มุมมอง) เพื่อให้หน้า/ชุดใกล้กันที่สุดเท่าที่ SD1.5 ทำได้
"""
import json, time, sys, urllib.request
from pathlib import Path
from PIL import Image

SRV = "http://127.0.0.1:8188"
COMFY = Path(__file__).resolve().parent.parent / "comfyui" / "ComfyUI"
CKPT = "prefectSemiReal_v10.safetensors"
LORA1 = "eacb6c42-dcec-4c53-98cf-d608bc980c64.TA_trained.safetensors"
LORA2 = "37310f25-5ca2-44a1-b462-431094c8dba5.TA_trained.safetensors"
BIREFNET = "birefnet.safetensors"
SEED = 770077
W = H = 1024
PANEL_BG = (205, 205, 205)

# Liena (จาก bible): ไฮเอลฟ์ ผมเงิน-ทองยาว หูแหลม ตามรกต ชุดนักเดินทางเอลฟ์ เขียว/น้ำตาล/ขาว ลายใบไม้
BASE_POS = (
    "masterpiece, best quality, highly detailed, "
    "(full body:1.45), full body shot, head to toe visible, entire body, standing straight, "
    "(T-pose:1.3), arms outstretched horizontally to the sides, legs together, "
    "1girl, solo, high elf woman, very long silver blonde hair, long pointed elf ears, "
    "emerald green eyes, slender tall figure, "
    "elven traveler outfit, green brown white clothes with leaf motif, light cloak, "
    "fantasy, neutral expression, symmetrical, plain light grey background, even lighting"
)
BASE_NEG = (
    "(cropped:1.4), close-up, upper body, portrait, bust, out of frame, head out of frame, "
    "feet out of frame, cut off, multiple views, multiple people, 2girls, "
    "lowres, worst quality, low quality, bad anatomy, bad hands, deformed hands, extra limbs, "
    "missing limbs, fused fingers, extra fingers, text, watermark, logo, signature, blurry"
)
VIEWS = {
    "front": "(front view:1.3), facing viewer, looking at viewer, frontal",
    "side":  "(side view:1.4), profile view, from the side, facing left",
    "back":  "(from behind:1.5), back view, backside, seen from behind, facing away from viewer",
}


def post(p, payload):
    req = urllib.request.Request(SRV + p, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=60))

def get(p):
    return json.load(urllib.request.urlopen(SRV + p, timeout=60))


def graph(view, tag):
    return {
        "ck": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "l1": {"class_type": "LoraLoader", "inputs": {"model": ["ck", 0], "clip": ["ck", 1],
               "lora_name": LORA1, "strength_model": 0.6, "strength_clip": 0.6}},
        "l2": {"class_type": "LoraLoader", "inputs": {"model": ["l1", 0], "clip": ["l1", 1],
               "lora_name": LORA2, "strength_model": 0.65, "strength_clip": 0.65}},
        "pos": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["l2", 1], "text": f"{BASE_POS}, {tag}"}},
        "neg": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["l2", 1], "text": BASE_NEG}},
        "lat": {"class_type": "EmptyLatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
        "ks": {"class_type": "KSampler", "inputs": {"model": ["l2", 0], "positive": ["pos", 0],
               "negative": ["neg", 0], "latent_image": ["lat", 0], "seed": SEED, "steps": 30,
               "cfg": 4.5, "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0}},
        "vd": {"class_type": "VAEDecode", "inputs": {"samples": ["ks", 0], "vae": ["ck", 2]}},
        "bgm": {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": BIREFNET}},
        "rb": {"class_type": "RemoveBackground", "inputs": {"image": ["vd", 0], "bg_removal_model": ["bgm", 0]}},
        "iv": {"class_type": "InvertMask", "inputs": {"mask": ["rb", 0]}},
        "jn": {"class_type": "JoinImageWithAlpha", "inputs": {"image": ["vd", 0], "alpha": ["iv", 0]}},
        "sv": {"class_type": "SaveImage", "inputs": {"images": ["jn", 0], "filename_prefix": f"liena_turn/{view}"}},
    }


def run_view(view, tag):
    pid = post("/prompt", {"prompt": graph(view, tag)})["prompt_id"]
    print(f"[>] {view}: queued {pid}", flush=True)
    t0 = time.time()
    while True:
        time.sleep(4)
        h = get(f"/history/{pid}")
        if pid in h:
            outs = h[pid].get("outputs", {})
            st = h[pid].get("status", {}).get("status_str")
            if "sv" in outs and outs["sv"].get("images"):
                im = outs["sv"]["images"][0]
                fp = COMFY / "output" / im.get("subfolder", "") / im["filename"]
                print(f"[ok] {view}: {fp.name} ({time.time()-t0:.0f}s)", flush=True)
                return fp
            if st == "error":
                print(f"[x] {view} ERROR:\n{json.dumps(h[pid].get('status'), indent=2)[:2000]}", flush=True)
                return None
        if time.time() - t0 > 420:
            print(f"[x] {view} timeout", flush=True); return None
        print(f"  ... {view} {time.time()-t0:.0f}s", flush=True)


def on_grey(cut_path, mirror=False):
    """วาง subject (RGBA cutout) บนพื้นเทา 1024x1024 มีขอบล่างกันโดน crop 0.91 ของ multiview"""
    sub = Image.open(cut_path).convert("RGBA")
    canvas = Image.new("RGB", (W, H), PANEL_BG)
    # สเกลให้สูง ~0.84 ของพาเนล วางให้เท้าอยู่ ~0.90 (เหลือขอบล่าง)
    bbox = sub.getbbox() or (0, 0, sub.width, sub.height)
    sub = sub.crop(bbox)
    target_h = int(H * 0.84)
    scale = target_h / sub.height
    nw, nh = max(1, int(sub.width * scale)), target_h
    sub = sub.resize((nw, nh), Image.LANCZOS)
    if mirror:
        sub = sub.transpose(Image.FLIP_LEFT_RIGHT)
    x = (W - nw) // 2
    y = int(H * 0.90) - nh  # เท้าที่ ~90%
    canvas.paste(sub, (x, max(0, y)), sub)
    return canvas


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "liena"
    paths = {}
    for v, tag in VIEWS.items():
        p = run_view(v, tag)
        if not p:
            print("[x] หยุด: เจนมุมไม่สำเร็จ", flush=True); return
        paths[v] = p

    # ประกอบ sheet: front | side | side(mirror=right) | back
    panels = [
        on_grey(paths["front"]),
        on_grey(paths["side"]),
        on_grey(paths["side"], mirror=True),
        on_grey(paths["back"]),
    ]
    sheet = Image.new("RGB", (W * 4, H), PANEL_BG)
    for i, p in enumerate(panels):
        sheet.paste(p, (i * W, 0))
    out = COMFY / "input" / f"{name}_turnaround.png"
    sheet.save(out)
    print(f"\n[SHEET] {out}  ({sheet.size[0]}x{sheet.size[1]})", flush=True)
    print(f"[next] python novel/gen_3d_multiview.py {out} {name}", flush=True)


if __name__ == "__main__":
    main()
