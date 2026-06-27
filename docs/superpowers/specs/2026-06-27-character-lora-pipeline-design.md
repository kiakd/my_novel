# Character LoRA Pipeline — Design Spec

**Date:** 2026-06-27
**Owner:** kiakd
**Goal:** A repeatable, locally-runnable pipeline to mint one **consistent, reusable R18 character** (face + body locked) for the semi-realistic "douyin-beauty 2.5D doll" aesthetic, usable in any pose / scene / nude. Pilot one character end-to-end ("go deep on one"), then generalize.

> This spec is backed by a verified deep-research report (104 agents, 25 claims adversarially verified, 14 confirmed / 11 refuted). Confidence levels and refuted claims are called out inline so we don't repeat unverified internet advice.

---

## 1. Decisions locked in (from brainstorming)

| # | Decision | Choice |
|---|---|---|
| 1 | Success criterion | **One character, fully locked** (face+body), reusable across poses/scenes/nude |
| 2 | Source/anchor face | **`dl_I_i2i_strong_00001_.png`** (semi-real/doll black-hair woman) |
| 3 | Training venue | **Local 6GB, with pause/resume** (Kohya save_state + resume so the GPU can be freed for gaming). Cloud (RunPod) **deferred** until budget (start of month). Long training time accepted. |
| 4 | Dataset approach | **A** — FaceID-seeded generation + hard verifier filtering |

---

## 2. The confirmed methodology (what the pros actually do)

**The pipeline is: lock ONE face → generate a multi-angle dataset from it → train a small character LoRA. The trained LoRA is the durable identity lock; FaceID/InstantID/PuLID are only dataset *seeders*.** (confidence: high)

Critical verified caveats:
- **No identity-injection method is a proven consistency winner.** Every published ranking (PuLID vs InstantID vs FaceID, with percentages and "layering recipes") was **REFUTED** in verification. → We use FaceID (already installed) purely to seed the dataset; we do NOT chase InstantID/PuLID hoping for a magic win.
- **LoRA lineage compatibility is real (high confidence):** an Illustrious-trained LoRA transfers across our Illustrious-family checkpoints (softSketch, Nuke_JMBase, KnightShiftMix) but **not** to Pony/vanilla SDXL. → Train on an Illustrious base.
- **Network dim/alpha is genuinely unsettled** — every specific dim/alpha recommendation was refuted. → Use a cautious community default (dim 16–32, alpha = dim or dim/2) and validate empirically; do not treat any single value as authoritative.

---

## 3. Pipeline architecture (4 stages)

Each stage is an isolated unit with a clear input → output and its own verification gate.

### Stage 0 — Anchor & infra (mostly already in place)
- **Anchor image:** `dl_I_i2i_strong_00001_.png` → copied to ComfyUI `input/face_doll.png`.
- **Look recipe (style):** Illustrious base (`Nuke_JMBase1` or `softSketch`) + `semireal_tensor` LoRA (~0.9) + Clip Skip 2 + douyin/realism prompt + `dpmpp_2s_ancestral`/karras. Saved as `ref1_doll_look.json`.
- **Verifier:** `scratchpad/verify_face.py` (insightface buffalo_l cosine). Reminder: **this measures face geometry only, not style/skin** — always eyeball style too.
- **Output:** anchor locked, recipe reproducible.

### Stage 1 — Build the dataset (~40–60 curated images)
- **Generate ~100 candidates:** FaceID(anchor, weight 0.85–0.9) + look recipe, deliberately varied:
  - **Angles:** front, 3/4 L+R, profile, slight up, slight down.
  - **Expressions:** neutral, soft smile, serious, eyes-closed.
  - **Framing:** close-up, upper body, half body, + a few **full body** (so the LoRA learns the body, not just the face).
  - **Outfit:** keep it mostly the signature look but include 2–3 alternates so the LoRA binds *identity*, not one dress.
- **Score every candidate** with the verifier vs anchor → keep **sim > 0.62**, then a quick human pass for style/quality.
- **Curate ~40–60.** (Research used 100×5; the common sweet spot is 30–50 — we target ~50 to balance quality vs 6GB training time.)
- **Resize to 1024×1024** (bucketed). 
- **Caption (confirmed strategy):** comma-separated **booru tags**, **trigger word `char1` as the FIRST tag**, and **prune identity traits** (black hair, grey eyes, face-defining tags) so they bind to `char1`. Caption only the *variables* (pose, framing, outfit, background, expression). (confidence: high)
- **Output:** `D:\lora_train\char1\img\<repeats>_char1\` with paired `.png` + `.txt`.

### Stage 2 — Train the LoRA (local 6GB)
- **Tool:** `comfyUI-Realtime-Lora` (Kohya sd-scripts backend, block-swap low-VRAM presets) — installs as a ComfyUI custom node. (confidence: high it exists/supports SDXL; **no verified concrete 6GB config**)
- **Base model:** **Illustrious-XL-v2.0** (download ~6.5GB; cosine-annealing, stable, clean lineage so the LoRA transfers to softSketch/Nuke/KnightShiftMix).
- **Settings (starting point — validate empirically):**
  - Steps: **~1500 total** (adjust repeats/epochs to hit it; overtraining degrades anatomy).
  - Dataset: ~50 imgs × repeats to reach ~1500 steps.
  - Resolution: 1024 (drop to **768** if OOM).
  - Optimizer: **Prodigy @ LR 1.0 + cosine** (auto-LR; confirmed) — or manual AdamW UNET ~3e-4 / TE ~3e-5 (10:1).
  - Network dim **16–32**, alpha = dim or dim/2 (UNSETTLED — try dim 32/alpha 16 first).
  - batch 1, gradient checkpointing, block-swap, Clip Skip 2.
- **⚠️ Reality check (verified):** SDXL LoRA training on a 6GB GPU is **extremely slow** — a documented RTX 3060 6GB run took **~47 hours for 3000 steps** (so ~24h for 1500). "Overnight" likely is **not** enough; budget **~1 day** of the machine running, or use the cloud fallback.
- **Pause/resume (chosen):** the 6GB GPU **cannot game + train at once** (VRAM conflict). So Kohya is configured to `save_state` every N steps; training can be **stopped to free the GPU for gaming, then resumed** from the last state. Manual (stop process → game → relaunch with `--resume`), and stop/start extends total wall-clock. Accepted by user (no cloud budget until start of month).
- **Cloud fallback (deferred to next budget cycle):** RunPod 4090 (~$0.5, ~40 min) or Civitai on-site trainer. Dataset + config are venue-portable, so we can switch later with no rework.
- **Output:** `char1.safetensors` → `models/loras/`.

### Stage 3 — Use + verify
- **Generation flow:** Illustrious checkpoint (softSketch/Nuke) + `<lora:char1:0.7–0.9>` + scene/pose/nude prompt; optional FaceID top-up only if needed.
- **Verify every batch:** run the face verifier vs anchor; tune `char1` strength until sim is consistently > ~0.6 across poses *and* style looks right.
- **Output:** saved Flow JSON (`char1_generate.json`); a small gallery proving consistency across standing/sitting/lying/nude.

---

## 4. Deliverables
1. Curated dataset folder (`D:\lora_train\char1\`) + captions.
2. `char1.safetensors` character LoRA.
3. `char1_generate.json` ComfyUI Flow (LoRA + recipe).
4. Verifier gate wired into the generation loop.
5. This spec + a short "how to mint character N" runbook for generalizing later.

## 5. Risks & open questions
- **6GB training time** (~24h+) is the biggest practical risk → mitigate with 768px + block-swap, or RunPod fallback. **Decision point after dataset is ready.**
- **Dataset face consistency** is the make-or-break input → hard verifier filter + curate.
- **dim/alpha & identity-method choice are empirically unsettled** → first LoRA is a calibration run; expect a second pass.
- **Z-Image** route deferred: tool supports training Z-Image LoRAs, but neither its aesthetic superiority for this look nor its R18 capability was verified → stay on Illustrious for R18.

## 6. Out of scope (YAGNI)
- Training all 5 ref characters now (do char1 first, then templatize).
- InstantID/PuLID installs (no verified benefit over FaceID for seeding).
- Z-Image migration.

---

### Sources (verified subset)
- comfyUI-Realtime-Lora — github.com/shootthesound/comfyUI-Realtime-Lora (primary)
- Illustrious-XL-v2.0 — huggingface.co/OnomaAIResearch/Illustrious-XL-v2.0 (primary, cosine-annealing)
- Prodigy optimizer — github.com/konstmish/prodigy (LR=1.0 + cosine, primary)
- IP-Adapter / InstantID / PuLID papers — arXiv 2308.06721 / 2401.07519 / 2404.16022
- Captioning + lineage + ~1500-step + 6GB-time — Civitai / DCAI / kohya_ss community guides (blog/forum tier)
