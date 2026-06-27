# Character LoRA Pipeline

This pipeline mints a consistent R18 character by locking her face from an anchor image, generating a verifier-filtered multi-angle dataset via ComfyUI FaceID, training an Illustrious-XL character LoRA on a 6 GB GPU, and generating the character in any pose or scene with the trained LoRA. Scripts drive the ComfyUI HTTP API (`127.0.0.1:8188`); insightface scoring uses the embedded ComfyUI Python (`python_embeded\python.exe`).

## Run order

1. **gen_dataset.py** — generate multi-angle dataset via FaceID-seeded ComfyUI graph (`python comfyui/char_pipeline/gen_dataset.py 1` for a 12-image smoke test, `8` for the full 96-image batch).
2. **score_filter.py** — score every `ds_*.png` vs the anchor with insightface cosine similarity, write `scores.tsv`, copy keepers (default threshold 0.62) to `D:\lora_train\char1\keep\`. Aim for ≥ 40 keepers; if below, lower threshold to 0.58 or raise `FACEID_WEIGHT` in `config.py` and regenerate.
3. **curate_caption.py** — center-pad/resize keepers to 1024×1024, write into `D:\lora_train\char1\img\10_char1\`, generate `.txt` captions (trigger word first, identity traits intentionally omitted so the LoRA learns them).
4. **Train** — follow `training.md`: open the ComfyUI Realtime-LoRA trainer node, point it at `D:\lora_train\char1\img`, queue. Save states every 250 steps for pause/resume. Target ~1500 steps. Copy final `char1.safetensors` to `models\loras\`.
5. **gen_with_lora.py** — generate 4 poses (incl. nude) with the trained LoRA, auto-score vs anchor. All outputs should score ≥ 0.60; if face drifts raise `LORA_W` (0.9–1.0), if style breaks lower to 0.7.

## Mint character N

1. Get an approved anchor image (a single clean face shot at the desired look).
2. Edit `config.py`: set `CHAR = "charN"` and `ANCHOR_SRC` to the new anchor path.
3. Re-run the setup step to copy the anchor into ComfyUI input and create the new train dir.
4. Re-run Tasks 3 → 4 → 5 → train per `training.md` → Task 8.

Verifier threshold that worked for `char1`: **0.62**. FaceID weight: **0.88**. Training dim/alpha: **32/16** (first-pass calibration — adjust if the LoRA is too rigid or too loose). Optimizer: Prodigy LR 1.0, cosine scheduler, ~1500 steps.
