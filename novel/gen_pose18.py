#!/usr/bin/env python3
# gen_pose18.py — เจนรูปอ้างอิง 12 ท่า สำหรับ ref_post18.html  (สาย Illustrious ทั้งระบบ)
# โครงโหนด/ค่า sampler อิง workflow "textToImage2.json" แต่สลับเป็น Illustrious:
#   ckpt: wai_illustrious_v17  +  LoRA chain (node13->...)  base stack = stabilizer
#   KSampler: dpmpp_2m_sde / karras, 25 steps, cfg 5, denoise 1   |  EmptyLatent 768x1152
#   node id: 4=ckpt 13.. =lora 6=pos 7=neg 5=latent 3=ksampler 8=vae 9=save
#
# LoRA ท่าที่ขาด -> โหลดด้วย download_loras.py ก่อน (Illustrious base เท่านั้น)
# ถ้าไฟล์ LoRA ของท่าไหนยังไม่มีในเครื่อง สคริปต์จะข้ามให้อัตโนมัติ (เจนแบบ prompt-only)
#
# วิธีรัน:
#   python gen_pose18.py            # ทั้ง 12 ท่า
#   python gen_pose18.py 4          # เฉพาะท่า 4
#   python gen_pose18.py 2 3 8      # หลายท่า
import json, urllib.request, time, sys, os

SERVER   = "127.0.0.1:8188"
CKPT     = "prefectSemiReal_v10.safetensors"
LORA_DIR = r"D:\test\my_novel\comfyui\ComfyUI\models\loras"

# ---- base LoRA stack (ใช้ทุกท่า) — IL-compatible ----
LORA_STACK = [
    ("eacb6c42-dcec-4c53-98cf-d608bc980c64.TA_trained.safetensors", 0.7, 0.7),
    ("37310f25-5ca2-44a1-b462-431094c8dba5.TA_trained.safetensors", 0.8, 0.8),
    ("AddMicroDetails_Illustrious_v6.safetensors", 0.8, 0.8),
    # ("cantarella_main.safetensors", 0.8, 0.8),   # เปิดถ้าจะล็อกหน้าตัวละคร
]

W, H, BATCH = 768, 1152, 1
STEPS, CFG  = 25, 5.0
SAMPLER, SCHEDULER = "dpmpp_2m_sde", "karras"

# ---- quality / character base (สไตล์ Illustrious booru) — แก้ตัวละครจุดเดียว ใช้ทุกท่า ----
QUALITY = "masterpiece, best quality, amazing quality, absurdres, newest, very aesthetic, "
SUBJECT = ("nsfw, rating:explicit, 1girl, 1boy, hetero, couple, "
           "mature female, mature male, adult, beautiful detailed face, long flowing hair, "
           "curvy body, slim waist, nude, blush, sweat, "
           "detailed bedroom background, soft warm lighting, depth of field, cinematic")

NEG = ("worst quality, low quality, normal quality, lowres, jpeg artifacts, "
       "bad anatomy, bad proportions, deformed, mutated, extra limbs, missing limbs, "
       "bad hands, missing fingers, extra digits, fewer digits, fused fingers, long neck, "
       "watermark, signature, username, text, logo, artist name, censored, "
       "child, loli, shota, young, flat chest, multiple views, monochrome")

# ---- 12 ท่า: (prefix, seed, pose_tags, extra_lora) ----
#  extra_lora = list ของ (file, sm, sc) ต่อท้าย LORA_STACK เฉพาะท่านั้น
#  trigger word ของ LoRA ถูกฝังไว้ใน pose_tags แล้ว
POSES = [
    ("pose01", 101010001,
     "missionary position, lying on back, on top, face to face, eye contact, kissing, "
     "intimate, on bed",
     []),                                                          # prompt-only
    ("pose02", 101010002,
     "cowgirl position, girl on top, straddling, sitting upright, facing each other, "
     "hands on chest, looking down, assertive female, on bed",
     [("cowgirl_position_il.safetensors", 0.8, 0.8)]),            # DL ver 2946885
    ("pose03", 101010003,
     "reverse cowgirl, girl on top, facing away, from below, arched back, "
     "looking down, spread legs, on bed",
     [("reverse_cowgirl_il.safetensors", 0.8, 0.8)]),             # DL ver 2937144
    ("pose04", 101010004,
     "doggystyle, sex from behind, all fours, arched back, looking back, "
     "hands on hips, on bed",
     [("squatting_doggystyle.safetensors", 0.8, 0.8)]),           # ✓ local
    ("pose05", 101010005,
     "spooning, on side, sex from behind lying, embrace from behind, "
     "tender, soft morning light, under sheets",
     [("spooning_il.safetensors", 0.8, 0.8)]),                    # DL ver 2192837
    ("pose06", 101010006,
     "sitting on lap, upright straddle, lotus position, face to face, close embrace, "
     "arms around back, eye contact, on bed",
     [("throne_sex_il.safetensors", 0.7, 0.7)]),                  # DL ver 2345843
    ("pose07", 101010007,
     "sex at edge of bed, lying on back, hips at edge, legs raised, partner standing, "
     "looking up",
     [("elevated_missionary.safetensors", 0.6, 0.6)]),            # ✓ local (ใกล้เคียง)
    ("pose08", 101010008,
     "stand and carry position, standing sex, lifted by another, legs around waist, "
     "against wall, deep penetration",
     [("stand_carry_il.safetensors", 0.8, 0.8)]),                 # DL ver 2841951
    ("pose09", 101010009,
     "1boy, 1girl, hetero, sex, girl on top, sitting on lap, throne sex, straddling his lap, "
     "facing each other, vaginal, penis, nude, arms around neck, sweat, "
     "sitting on chair, indoor",
     [("throne_sex_il.safetensors", 0.6, 0.6)]),                 # ใช้ตัวเดียวกับท่า6 (เลี่ยง barstool/bar ที่บังจาก lapdance LoRA)
    ("pose10", 101010010,
     "1boy, 1girl, hetero, sex, mating press, missionary, legs on shoulders, "
     "lying on back, legs raised over shoulders, vaginal, penis, deep penetration, "
     "eye contact, nude, sweat, on bed",
     [("elevated_missionary.safetensors", 0.8, 0.8)]),            # ✓ local
    ("pose11", 101010011,
     "1boy, 1girl, hetero, couple, lying down, (on side:1.3), (both lying on their sides:1.3), "
     "(face to face:1.2), facing each other, eye contact, profile, side view, from side, "
     "head on pillow, legs intertwined, leg lock, vaginal, nude, intimate, "
     "afterglow, soft dawn light, on bed",
     [],                                                           # prompt-only (ไม่มี concept ตรง)
     "from above, overhead shot, top-down view, cowgirl position, girl on top, "
     "sitting, straddling, kneeling, all fours, standing"),        # neg เฉพาะท่า: กันมุมบน/ท่าคร่อม
    ("pose12", 101010012,
     "standing, hug, kiss, face to face, hands on waist, undressing, "
     "romantic, backlit window",
     [("forced_kiss_il.safetensors", 0.6, 0.6)]),                 # ✓ local
]

def _existing(stack):
    """กรอง LoRA ที่ไฟล์มีจริง; เตือนตัวที่ขาดแล้วข้าม (เจนแบบ prompt-only)"""
    out = []
    for fn, sm, sc in stack:
        if os.path.exists(os.path.join(LORA_DIR, fn)):
            out.append((fn, sm, sc))
        else:
            print(f"    [skip] ไม่พบ LoRA: {fn} -> เจนแบบ prompt-only (โหลดด้วย download_loras.py)", flush=True)
    return out

def build(stack, pos, seed, neg_extra=""):
    neg = NEG + (", " + neg_extra if neg_extra else "")
    wf = {"4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}}}
    m, c = ["4", 0], ["4", 1]
    nid = 13
    for fn, sm, sc in stack:
        wf[str(nid)] = {"class_type": "LoraLoader",
                        "inputs": {"lora_name": fn, "strength_model": sm, "strength_clip": sc,
                                   "model": m, "clip": c}}
        m, c = [str(nid), 0], [str(nid), 1]
        nid += 1
    wf["6"] = {"class_type": "CLIPTextEncode", "inputs": {"text": pos, "clip": c}}
    wf["7"] = {"class_type": "CLIPTextEncode", "inputs": {"text": neg, "clip": c}}
    wf["5"] = {"class_type": "EmptyLatentImage",
               "inputs": {"width": W, "height": H, "batch_size": BATCH}}
    wf["3"] = {"class_type": "KSampler",
               "inputs": {"seed": seed, "steps": STEPS, "cfg": CFG,
                          "sampler_name": SAMPLER, "scheduler": SCHEDULER, "denoise": 1.0,
                          "model": m, "positive": ["6", 0], "negative": ["7", 0],
                          "latent_image": ["5", 0]}}
    wf["8"] = {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}}
    return wf

def run(prefix, seed, pose_tags, extra_lora=None, neg_extra=""):
    stack = _existing(LORA_STACK + (extra_lora or []))
    pos = QUALITY + SUBJECT + ", " + pose_tags
    wf = build(stack, pos, seed, neg_extra)
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

if __name__ == "__main__":
    sel = [int(a) for a in sys.argv[1:]]
    todo = [POSES[i-1] for i in sel] if sel else POSES
    print(f"generating {len(todo)} pose(s) -> ComfyUI {SERVER} [ckpt={CKPT}]", flush=True)
    for p in todo:
        run(*p)
    print("ALL DONE", flush=True)
