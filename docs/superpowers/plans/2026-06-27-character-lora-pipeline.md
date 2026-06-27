# Character LoRA Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, version-controlled local pipeline that mints ONE consistent R18 character (`char1`) — lock its face from an anchor image, generate a verifier-filtered multi-angle dataset, train an Illustrious character LoRA on a 6GB GPU (pause/resume), and generate the character in any pose/scene/nude.

**Architecture:** Python scripts in `comfyui/char_pipeline/` drive the running ComfyUI HTTP API (`127.0.0.1:8188`) for generation, and the embedded ComfyUI Python (`D:\ComfyUI_windows_portable\python_embeded\python.exe`) for insightface scoring + Pillow. Training uses the `comfyUI-Realtime-Lora` custom node (Kohya backend) on `Illustrious-XL-v2.0`. Spec: `docs/superpowers/specs/2026-06-27-character-lora-pipeline-design.md`.

**Tech Stack:** ComfyUI (Bun-independent, embedded py3.13), IPAdapter FaceID, insightface buffalo_l, Pillow, Kohya sd-scripts (via comfyUI-Realtime-Lora), Illustrious SDXL.

> **Note on "tests":** this is an ML/image pipeline, not unit-testable code. Each task's verification is a concrete observable check (file counts, verifier cosine scores, visual spot-check) instead of pytest. Treat the "Verify" step as the test.

**Paths used throughout:**
- ComfyUI app: `D:\ComfyUI_windows_portable\ComfyUI`
- Embedded py: `D:\ComfyUI_windows_portable\python_embeded\python.exe`
- Train workspace: `D:\lora_train\char1\`
- Scripts (repo): `comfyui/char_pipeline/`

---

### Task 1: Pipeline config + folder scaffold

**Files:**
- Create: `comfyui/char_pipeline/config.py`
- Create: `comfyui/char_pipeline/README.md` (runbook stub)

- [ ] **Step 1: Write `config.py`** (single source of truth for paths/recipe)

```python
# comfyui/char_pipeline/config.py
SERVER = "http://127.0.0.1:8188"
COMFY = r"D:\ComfyUI_windows_portable\ComfyUI"
EMBED_PY = r"D:\ComfyUI_windows_portable\python_embeded\python.exe"
INSIGHTFACE_ROOT = COMFY + r"\models\insightface"

CHAR = "char1"
ANCHOR_SRC = COMFY + r"\output\dl_I_i2i_strong_00001_.png"   # the approved look
ANCHOR_INPUT = "face_doll.png"                                # filename inside ComfyUI/input
TRAIN_DIR = r"D:\lora_train\char1"

# --- style recipe (Illustrious doll look) ---
CKPT = "Nuke_JMBase1.safetensors"
VAE = "sdxlVAE_sdxlVAE.safetensors"
STYLE_LORA = ("semireal_tensor.safetensors", 0.9)
CLIP_SKIP = -2
SAMPLER, SCHED, STEPS, CFG = "dpmpp_2s_ancestral", "karras", 28, 6
STYLE = ("masterpiece, best quality, highres, absurdres, Douyin makeup, Douyin face, Clean makeup, glossy eyes, "
         "semi-realistic, realistic, photorealistic, detailed realistic skin, real person, looks like a doll, "
         "hyperdetailed skin, realistic body, realistic proportions, 3d, (photorealistic:1.1)")
IDENT = ("1girl, solo, adult, mature female, long black hair, bangs, white camellia hair flower, white flower, "
         "pearl drop earrings, grey eyes, mole under eye, glossy lips, elegant")
NEG = ("(lowres:1.2), (worst quality:1.4), (low quality:1.4), (bad anatomy:1.4), bad hands, multiple views, comic, "
       "jpeg artifacts, signature, watermark, text, censored, anime, cartoon, 2d, cel shading, flat color, toon, "
       "child, loli, young")
FACEID_WEIGHT = 0.88
```

- [ ] **Step 2: Create folders + copy anchor into ComfyUI input**

Run:
```bash
python -c "import os,shutil,sys; sys.path.insert(0,'comfyui/char_pipeline'); import config as c; os.makedirs(c.TRAIN_DIR+r'\img', exist_ok=True); shutil.copy(c.ANCHOR_SRC, c.COMFY+r'\input\\'+c.ANCHOR_INPUT); print('anchor copied, train dir ready')"
```
Expected: `anchor copied, train dir ready`; `D:\lora_train\char1\img\` exists; `ComfyUI\input\face_doll.png` exists.

- [ ] **Step 3: Commit**

```bash
git add comfyui/char_pipeline/config.py comfyui/char_pipeline/README.md
git commit -m "feat(char-pipeline): config + scaffold"
```

---

### Task 2: Face verifier (insightface cosine)

**Files:**
- Create: `comfyui/char_pipeline/verify_face.py`

- [ ] **Step 1: Write `verify_face.py`** (CLI: ref + candidates → sorted cosine scores)

```python
# comfyui/char_pipeline/verify_face.py
import sys, cv2, numpy as np
from insightface.app import FaceAnalysis
sys.path.insert(0, ".")
import config as c
app = FaceAnalysis(name="buffalo_l", root=c.INSIGHTFACE_ROOT, providers=["CPUExecutionProvider"])
app.prepare(ctx_id=-1, det_size=(640, 640))
def emb(p):
    img = cv2.imread(p)
    if img is None: return None
    fs = app.get(img)
    return None if not fs else max(fs, key=lambda x: x.det_score).normed_embedding
def main():
    ref, cands = sys.argv[1], sys.argv[2:]
    r = emb(ref)
    if r is None: print("REF NO FACE"); return
    rows = [(float(np.dot(r, e)) if (e := emb(x)) is not None else None, x) for x in cands]
    rows.sort(key=lambda t: (-1 if t[0] is None else t[0]), reverse=True)
    for s, x in rows:
        print(f"{('%.3f'%s) if s is not None else 'NOFACE'}\t{x.split(chr(92))[-1]}")
if __name__ == "__main__": main()
```

- [ ] **Step 2: Verify it runs (smoke test)** — must be run with the EMBEDDED python (has insightface)

Run (from `comfyui/char_pipeline/`):
```bash
D:\ComfyUI_windows_portable\python_embeded\python.exe verify_face.py D:\work_pame\my_novel\comfyui\ref_1.jpg D:\ComfyUI_windows_portable\ComfyUI\output\dl_I_i2i_strong_00001_.png
```
Expected: one line `0.xxx<TAB>dl_I_i2i_strong_00001_.png` (a float score prints → insightface works).

- [ ] **Step 3: Commit**

```bash
git add comfyui/char_pipeline/verify_face.py
git commit -m "feat(char-pipeline): insightface face verifier"
```

---

### Task 3: Dataset generator (FaceID-seeded, multi-angle)

**Files:**
- Create: `comfyui/char_pipeline/gen_dataset.py`

- [ ] **Step 1: Write `gen_dataset.py`** — FaceID(anchor)+recipe over an angle×expression×framing grid, N seeds each, saved as `ds_<tag>` in ComfyUI output. (Builds the API graph; reuses Task 1 config.)

```python
# comfyui/char_pipeline/gen_dataset.py
import json, urllib.request, time, random, sys
sys.path.insert(0, "."); import config as c
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
```

- [ ] **Step 2: Run a SMALL batch first (1 seed/view = 12 imgs) to confirm the graph works**

Run: `python comfyui/char_pipeline/gen_dataset.py 1`
Expected: `queued 12 jobs` … `DONE 12`; 12 files `ds_*.png` appear in `D:\ComfyUI_windows_portable\ComfyUI\output`. If any FaceID node errors, fix before scaling.

- [ ] **Step 3: Run the full batch (8 seeds/view ≈ 96 imgs)** — this is long (~50 min); run in background

Run: `python comfyui/char_pipeline/gen_dataset.py 8`
Expected: `DONE 96`.

- [ ] **Step 4: Commit**

```bash
git add comfyui/char_pipeline/gen_dataset.py
git commit -m "feat(char-pipeline): FaceID-seeded dataset generator"
```

---

### Task 4: Score + hard-filter the candidates

**Files:**
- Create: `comfyui/char_pipeline/score_filter.py`

- [ ] **Step 1: Write `score_filter.py`** — score every `ds_*.png` vs anchor, write `scores.tsv`, and copy keepers (sim ≥ threshold) into a `keep/` staging dir.

```python
# comfyui/char_pipeline/score_filter.py
import sys, os, glob, shutil, subprocess
sys.path.insert(0, "."); import config as c
THRESH = float(sys.argv[1]) if len(sys.argv) > 1 else 0.62
out = c.COMFY + r"\output"
cands = [p for p in glob.glob(out + r"\ds_*.png")]
anchor = c.ANCHOR_SRC
res = subprocess.run([c.EMBED_PY, "verify_face.py", anchor, *cands], capture_output=True, text=True, cwd=os.path.dirname(__file__) or ".")
keepdir = c.TRAIN_DIR + r"\keep"; os.makedirs(keepdir, exist_ok=True)
lines = [l for l in res.stdout.splitlines() if "\t" in l]
open(c.TRAIN_DIR + r"\scores.tsv", "w").write("\n".join(lines))
kept = 0
byname = {os.path.basename(p): p for p in cands}
for l in lines:
    s, name = l.split("\t")
    if s != "NOFACE" and float(s) >= THRESH and name in byname:
        shutil.copy(byname[name], os.path.join(keepdir, f"{s}_{name}")); kept += 1
print(f"scored {len(lines)}, kept {kept} (sim>={THRESH}) -> {keepdir}")
```

- [ ] **Step 2: Run it**

Run: `python comfyui/char_pipeline/score_filter.py 0.62`
Expected: `scored 96, kept NN (sim>=0.62) -> D:\lora_train\char1\keep`. **Verify NN ≥ 40.** If NN < 40, lower threshold to 0.58 and/or raise FaceID weight in config and regenerate (Task 3).

- [ ] **Step 3: Human spot-check** — open `keep/`, delete any that are off-style/broken hands/wrong character despite high score (the score only measures face geometry, not quality). Aim to leave ~40–55 good ones.

- [ ] **Step 4: Commit**

```bash
git add comfyui/char_pipeline/score_filter.py
git commit -m "feat(char-pipeline): verifier scoring + hard filter"
```

---

### Task 5: Curate → resize 1024 → caption (with identity-pruning)

**Files:**
- Create: `comfyui/char_pipeline/curate_caption.py`

- [ ] **Step 1: Write `curate_caption.py`** — take `keep/`, center-pad/resize to 1024, write into `img\10_char1\`, and write `.txt` captions: trigger first, identity traits pruned, only variable tags kept (inferred from the `ds_<view>` tag).

```python
# comfyui/char_pipeline/curate_caption.py
import sys, os, glob, re
from PIL import Image
sys.path.insert(0, "."); import config as c
keep = c.TRAIN_DIR + r"\keep"
dest = c.TRAIN_DIR + r"\img\10_" + c.CHAR
os.makedirs(dest, exist_ok=True)
VIEW_CAP = {
 "front_neutral":"front view, neutral expression","front_smile":"front view, smile",
 "tq_left":"three quarter view","tq_right":"three quarter view","profile":"profile view, from side",
 "up":"looking up","down":"looking down","closed":"eyes closed","closeup":"close-up, face focus",
 "upper":"upper body","half":"cowboy shot, standing","full":"full body, standing",
}
def view_of(fn):
    m = re.search(r"ds_([a-z_]+?)_\d+_", fn)
    return m.group(1).rstrip("_") if m else "front_neutral"
files = sorted(glob.glob(keep + r"\*.png"))
for i, src in enumerate(files):
    img = Image.open(src).convert("RGB")
    w, h = img.size; s = 1024 / max(w, h)
    img = img.resize((int(w*s), int(h*s)))
    canvas = Image.new("RGB", (1024, 1024), (255, 255, 255))
    canvas.paste(img, ((1024-img.width)//2, (1024-img.height)//2))
    base = f"{i:03d}_{c.CHAR}"
    canvas.save(os.path.join(dest, base + ".png"))
    v = VIEW_CAP.get(view_of(os.path.basename(src)), "portrait")
    # trigger FIRST, identity traits (hair/eyes/face) intentionally NOT captioned
    open(os.path.join(dest, base + ".txt"), "w").write(f"{c.CHAR}, 1girl, solo, {v}, simple background")
print(f"curated {len(files)} -> {dest}")
```

- [ ] **Step 2: Run it**

Run: `python comfyui/char_pipeline/curate_caption.py`
Expected: `curated NN -> D:\lora_train\char1\img\10_char1`; folder has NN `.png` (1024×1024) + NN `.txt`. Open one `.txt` → looks like `char1, 1girl, solo, three quarter view, simple background` (NO hair/eye tags).

- [ ] **Step 3: Commit**

```bash
git add comfyui/char_pipeline/curate_caption.py
git commit -m "feat(char-pipeline): curate, resize 1024, caption with identity-pruning"
```

---

### Task 6: Install trainer + base model

**Files:**
- Modify: `comfyui/char_pipeline/README.md` (record install commands)

- [ ] **Step 1: Install the `comfyUI-Realtime-Lora` node**

Run:
```bash
git -C "D:\ComfyUI_windows_portable\ComfyUI\custom_nodes" clone --depth 1 https://github.com/shootthesound/comfyUI-Realtime-Lora.git
```
Then install its requirements with the embedded python (the node README lists deps; install what it asks):
```bash
D:\ComfyUI_windows_portable\python_embeded\python.exe -m pip install -r "D:\ComfyUI_windows_portable\ComfyUI\custom_nodes\comfyUI-Realtime-Lora\requirements.txt"
```
Expected: node + deps install without fatal errors.

- [ ] **Step 2: Download Illustrious-XL-v2.0 base** (training base; LoRA then transfers to softSketch/Nuke)

Run (HuggingFace, no auth):
```bash
curl -L --fail -o "D:\ComfyUI_windows_portable\ComfyUI\models\checkpoints\IllustriousXL_v20.safetensors" "https://huggingface.co/OnomaAIResearch/Illustrious-XL-v2.0/resolve/main/Illustrious-XL-v2.0.safetensors"
```
Expected: ~6.5GB file present.

- [ ] **Step 3: Restart ComfyUI and confirm the trainer nodes load**

Restart ComfyUI; then:
```bash
curl -s "http://127.0.0.1:8188/object_info" | findstr /i "RealtimeLora Kohya Train"
```
Expected: at least one trainer node class name printed. Record the exact node names in README.

- [ ] **Step 4: Commit**

```bash
git add comfyui/char_pipeline/README.md
git commit -m "docs(char-pipeline): trainer install + base model"
```

---

### Task 7: Configure + run training (pause/resume)

**Files:**
- Create: `comfyui/char_pipeline/training.md` (exact node settings, the user runs the train node in the ComfyUI UI)

- [ ] **Step 1: Write `training.md`** with the exact trainer-node settings to enter in ComfyUI:

```
Base model: IllustriousXL_v20.safetensors
Dataset dir: D:\lora_train\char1\img      (contains 10_char1\)
Output name: char1
Resolution: 1024 (if OOM -> 768)
Network dim: 32   Network alpha: 16        (UNSETTLED per research; first calibration run)
Optimizer: Prodigy   LR: 1.0   Scheduler: cosine
Total steps target: ~1500   (with ~50 imgs * 10 repeats = 500/epoch -> 3 epochs)
Batch size: 1   Gradient checkpointing: ON   Clip skip: 2
Low-VRAM: enable block-swap / the node's Low preset
save_state / save every: 250 steps   (REQUIRED for pause/resume)
```

- [ ] **Step 2: Start training** via the ComfyUI trainer node (queue the train workflow). Watch the console for step progress + the first saved state.

Verify: a `char1-000250.safetensors` (or state dir) appears in the output after ~250 steps → checkpointing works. **Do not game while this runs** (VRAM conflict).

- [ ] **Step 3: Pause/resume drill** — stop the ComfyUI process, confirm GPU frees (`nvidia-smi`), then relaunch ComfyUI and re-queue the train node with **resume from last state** enabled. Confirm it continues from the saved step, not 0.

- [ ] **Step 4: Let it reach ~1500 steps.** Final `char1.safetensors` → copy to `models/loras/`.
Verify: file exists in `D:\ComfyUI_windows_portable\ComfyUI\models\loras\char1.safetensors`.

- [ ] **Step 5: Commit**

```bash
git add comfyui/char_pipeline/training.md
git commit -m "docs(char-pipeline): training config + pause/resume runbook"
```

---

### Task 8: Generate with the LoRA + verify consistency

**Files:**
- Create: `comfyui/char_pipeline/gen_with_lora.py`

- [ ] **Step 1: Write `gen_with_lora.py`** — softSketch/Nuke + `<lora:char1>` + style recipe, takes a pose string + outputs, auto-scores vs anchor.

```python
# comfyui/char_pipeline/gen_with_lora.py
import json, urllib.request, time, random, sys, subprocess, os
sys.path.insert(0, "."); import config as c
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
```

- [ ] **Step 2: Run it after training**

Run: `python comfyui/char_pipeline/gen_with_lora.py 0.8`
Expected: 4 `lora_p*.png` generated; printed cosine scores vs anchor. **Success = all ≥ ~0.60 AND the same character is visibly recognizable across all 4 poses incl. nude.** If face drifts, raise LoRA weight (0.9–1.0); if style breaks, lower to 0.7.

- [ ] **Step 3: Save the winning generation as a ComfyUI Flow JSON** (`char1_generate.json`) so it's reusable in the UI, then commit.

```bash
git add comfyui/char_pipeline/gen_with_lora.py
git commit -m "feat(char-pipeline): generate with char1 LoRA + auto-verify"
```

---

### Task 9: Runbook for minting character N

**Files:**
- Modify: `comfyui/char_pipeline/README.md`

- [ ] **Step 1: Write the README runbook** — the repeatable recipe so a new character only needs: (a) a new anchor image, (b) set `CHAR`/`ANCHOR_SRC` in `config.py`, (c) re-run Tasks 3→4→5→7→8. Document the verifier threshold, FaceID weight, and the dim/alpha/LR settings that actually worked for `char1`.

- [ ] **Step 2: Commit**

```bash
git add comfyui/char_pipeline/README.md
git commit -m "docs(char-pipeline): mint-character-N runbook"
```

---

## Self-Review

- **Spec coverage:** Stage 0 → Task 1/2; Stage 1 → Task 3/4/5; Stage 2 → Task 6/7; Stage 3 → Task 8; generalization → Task 9. All four stages + deliverables covered.
- **Placeholders:** none — every script is complete and runnable.
- **Type/name consistency:** `config.py` names (`CHAR`, `ANCHOR_SRC`, `STYLE_LORA`, `FACEID_WEIGHT`, `INSIGHTFACE_ROOT`, `EMBED_PY`) are used identically across Tasks 2–8. Trigger word `char1` consistent in caption (Task 5) and generation (Task 8).
- **Known soft spots (flagged, not placeholders):** trainer node exact class-names are discovered in Task 6 Step 3 (varies by node version); dim/alpha 32/16 is a first-pass calibration value per research (refuted-as-universal), expect a Task 7 re-run if the first LoRA is too rigid/loose.
