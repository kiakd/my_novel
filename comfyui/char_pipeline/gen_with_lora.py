# comfyui/char_pipeline/gen_with_lora.py
import json, urllib.request, time, random, sys, subprocess, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import config as c
LORA_W = float(sys.argv[1]) if len(sys.argv) > 1 else 0.8
POSES = ["standing, full body, looking at viewer, indoor room",
         "sitting on sofa, full body, looking at viewer",
         "lying on bed, on side, from above",
         "completely nude, large breasts, nipples, standing, full body, bedroom"]
def post(p,d):
    r=urllib.request.Request(c.SERVER+p,data=json.dumps(d).encode(),headers={"Content-Type":"application/json"}); return json.load(urllib.request.urlopen(r))
def get(p): return json.load(urllib.request.urlopen(c.SERVER+p))
def graph(pose, seed, tag):
    sl, slw = c.STYLE_LORA
    return {
     "4":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":c.CKPT}},
     "19":{"class_type":"VAELoader","inputs":{"vae_name":c.VAE}},
     "30":{"class_type":"LoraLoader","inputs":{"lora_name":sl,"strength_model":slw,"strength_clip":slw,"model":["4",0],"clip":["4",1]}},
     "31":{"class_type":"LoraLoader","inputs":{"lora_name":"char1.safetensors","strength_model":LORA_W,"strength_clip":LORA_W,"model":["30",0],"clip":["30",1]}},
     "12":{"class_type":"CLIPSetLastLayer","inputs":{"clip":["31",1],"stop_at_clip_layer":c.CLIP_SKIP}},
     "6":{"class_type":"CLIPTextEncode","inputs":{"text":c.STYLE+", char1, "+c.IDENT+", "+pose,"clip":["12",0]}},
     "7":{"class_type":"CLIPTextEncode","inputs":{"text":c.NEG,"clip":["12",0]}},
     "5":{"class_type":"EmptyLatentImage","inputs":{"width":832,"height":1216,"batch_size":1}},
     "3":{"class_type":"KSampler","inputs":{"seed":seed,"steps":c.STEPS,"cfg":c.CFG,"sampler_name":c.SAMPLER,"scheduler":c.SCHED,"denoise":1,"model":["31",0],"positive":["6",0],"negative":["7",0],"latent_image":["5",0]}},
     "8":{"class_type":"VAEDecode","inputs":{"samples":["3",0],"vae":["19",0]}},
     "9":{"class_type":"SaveImage","inputs":{"filename_prefix":"lora_"+tag,"images":["8",0]}}}
pids=[]
for i,pose in enumerate(POSES):
    s=random.randint(1,2**31); r=post("/prompt",{"prompt":graph(pose,s,f"p{i}")}); pids.append((r["prompt_id"],f"p{i}"))
settled={}
for k in range(600):
    time.sleep(3)
    for pid,tag in pids:
        if pid in settled: continue
        h=get(f"/history/{pid}")
        if pid in h and h[pid].get("status",{}).get("completed"):
            for n in h[pid]["outputs"].values():
                for im in n.get("images",[]): settled[pid]=im["filename"]
    if len(settled)==len(pids): break
imgs=[c.COMFY+r"\output\\"+f for f in settled.values()]
print("generated:", list(settled.values()))
subprocess.run([c.EMBED_PY,"verify_face.py",c.ANCHOR_SRC,*imgs], cwd=os.path.dirname(__file__) or ".")
