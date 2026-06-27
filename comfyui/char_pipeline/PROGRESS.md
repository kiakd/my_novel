# char1 Pipeline — PROGRESS

Status tracker for the pilot character LoRA (`char1`). Spec: `docs/superpowers/specs/2026-06-27-character-lora-pipeline-design.md` · Plan: `docs/superpowers/plans/2026-06-27-character-lora-pipeline.md`

Legend: ✅ done · ⏳ ready to run (you run it) · ⛔ blocked / needs setup

## Infra (done by Claude)
- ✅ Scripts created + reviewed (spec + code-quality) → `comfyui/char_pipeline/`
- ✅ `config.py` smoke-tested; verifier prints scores; `gen_dataset.py 1` generated 12 imgs
- ✅ Anchor copied → `ComfyUI/input/face_doll.png`; train dir `D:\lora_train\char1\` created
- ✅ Trainer node installed: `SDXLLoraTrainer` loads in ComfyUI (port 8188)
- ✅ Base model downloaded: `IllustriousXL_v20.safetensors` (6.9GB) in checkpoints

## You run these (in order)
1. ⏳ **Generate dataset** — `python comfyui/char_pipeline/gen_dataset.py 8` (≈96 imgs, ~50 min, don't game meanwhile)
2. ⏳ **Score + filter** — `python comfyui/char_pipeline/score_filter.py 0.62` → check it kept ≥40 in `D:\lora_train\char1\keep\`
3. ⏳ **Spot-check + curate** — open `keep\`, delete bad ones (broken hands / off-style), aim ~40–55
4. ⏳ **Caption** — `python comfyui/char_pipeline/curate_caption.py` → fills `D:\lora_train\char1\img\10_char1\` (png+txt)
5. ✅ **Backend setup — DONE** (Python 3.11 + sd-scripts venv at `D:\sd-scripts`, torch 2.6 cu124 sees the GPU). Nothing to do.
6. ⏳ **Train** — in ComfyUI use `SDXLLoraTrainer`, set `sd_scripts_path = D:\sd-scripts`, plus the settings in `training.md`. Pause/resume = stop ComfyUI to game, relaunch + resume-from-state to continue. **~24h on 6GB** (slow — that's expected; cloud later if you want faster).
7. ⏳ **Generate with char1** — after `char1.safetensors` is in `models/loras/`: `python comfyui/char_pipeline/gen_with_lora.py 0.8` → auto-prints face-match scores across poses incl. nude.

## Pause/resume reminder
6GB can't game + train at once. To game: stop ComfyUI (frees GPU). To resume training: relaunch ComfyUI, re-queue the train node with **resume from last saved state** (saves every 250 steps).

## Open calibration knobs (expect a 2nd train pass)
- FaceID weight (`config.py:FACEID_WEIGHT`, now 0.88) — raise if dataset faces drift.
- Filter threshold (default 0.62) — lower to 0.58 if too few keepers.
- LoRA dim/alpha (32/16) and `char1` strength at generation (0.7–1.0) — research says these are unsettled; tune empirically.
