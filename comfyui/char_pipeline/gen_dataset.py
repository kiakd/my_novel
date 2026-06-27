# comfyui/char_pipeline/gen_dataset.py
import json, urllib.request, time, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import config as c
VIEWS = [
 ("front_neutral","front view, facing viewer, neutral expression"),
 ("front_smile","front view, facing viewer, soft smile"),
 ("tq_left","three quarter view, looking at viewer"),
 ("tq_right","three quarter view from right, looking at viewer"),
 ("profile","profile view, from side"),
 ("up","looking up, slight smile"),
 ("down","looking down, calm"),
 ("closed","eyes closed, serene"),
 ("closeup","extreme close-up, face focus, front view"),
 ("upper","upper body, front view, looking at viewer"),
 ("half","cowboy shot, standing, looking at viewer"),
 ("full","full body, standing, looking at viewer, plain background"),
]
N_SEEDS = int(sys.argv[1]) if len(sys.argv) > 1 else 8   # 12 views * 8 = 96 candidates
def post(p,d):
    r=urllib.request.Request(c.SERVER+p,data=json.dumps(d).encode(),headers={"Content-Type":"application/json"}); return json.load(urllib.request.urlopen(r))
def get(p): return json.load(urllib.request.urlopen(c.SERVER+p))
def graph(view, seed, tag):
    ln, ls = c.STYLE_LORA
    return {
     "4":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":c.CKPT}},
     "19":{"class_type":"VAELoader","inputs":{"vae_name":c.VAE}},
     "30":{"class_type":"LoraLoader","inputs":{"lora_name":ln,"strength_model":ls,"strength_clip":ls,"model":["4",0],"clip":["4",1]}},
     "12":{"class_type":"CLIPSetLastLayer","inputs":{"clip":["30",1],"stop_at_clip_layer":c.CLIP_SKIP}},
     "20":{"class_type":"LoadImage","inputs":{"image":c.ANCHOR_INPUT}},
     "40":{"class_type":"IPAdapterUnifiedLoaderFaceID","inputs":{"model":["30",0],"preset":"FACEID PLUS V2","lora_strength":0.6,"provider":"CPU"}},
     "41":{"class_type":"IPAdapterFaceID","inputs":{"model":["40",0],"ipadapter":["40",1],"image":["20",0],"weight":c.FACEID_WEIGHT,"weight_faceidv2":1.0,"weight_type":"linear","combine_embeds":"concat","start_at":0.0,"end_at":1.0,"embeds_scaling":"V only"}},
     "6":{"class_type":"CLIPTextEncode","inputs":{"text":c.STYLE+", "+c.IDENT+", "+view,"clip":["12",0]}},
     "7":{"class_type":"CLIPTextEncode","inputs":{"text":c.NEG,"clip":["12",0]}},
     "5":{"class_type":"EmptyLatentImage","inputs":{"width":832,"height":1216,"batch_size":1}},
     "3":{"class_type":"KSampler","inputs":{"seed":seed,"steps":c.STEPS,"cfg":c.CFG,"sampler_name":c.SAMPLER,"scheduler":c.SCHED,"denoise":1,"model":["41",0],"positive":["6",0],"negative":["7",0],"latent_image":["5",0]}},
     "8":{"class_type":"VAEDecode","inputs":{"samples":["3",0],"vae":["19",0]}},
     "9":{"class_type":"SaveImage","inputs":{"filename_prefix":"ds_"+tag,"images":["8",0]}}}
pids=[]
for tag,view in VIEWS:
    for j in range(N_SEEDS):
        s=random.randint(1,2**31); r=post("/prompt",{"prompt":graph(view,s,f"{tag}_{j}")}); pids.append((r["prompt_id"],tag))
print(f"queued {len(pids)} jobs", flush=True)
settled=set()
for k in range(4000):
    time.sleep(3)
    for pid,_ in pids:
        if pid in settled: continue
        h=get(f"/history/{pid}")
        if pid in h and h[pid].get("status",{}).get("completed"): settled.add(pid)
    if len(settled)==len(pids): break
    if k%5==0: print(f"...{len(settled)}/{len(pids)}", flush=True)
print("DONE", len(settled), flush=True)
