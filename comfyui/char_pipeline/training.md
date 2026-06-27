# Training Settings (ComfyUI Realtime-LoRA node)

## ⚠️ PREREQUISITE — backend setup (one-time, NOT yet done)

The `comfyUI-Realtime-Lora` node is installed and its **`SDXLLoraTrainer`** node loads in ComfyUI. BUT the node is only a front-end — it shells out to **Kohya `sd-scripts`**, which must be installed **separately in its own venv**:

1. **Python 3.10–3.12 required** for sd-scripts. The ComfyUI embedded Python is **3.13** and the host is **3.14** — both are too new (the node README says "Avoid 3.13 for now"). → Install Python **3.11** (or 3.10/3.12) first, e.g. `winget install Python.Python.3.11`.
2. `git clone https://github.com/kohya-ss/sd-scripts` somewhere (e.g. `D:\sd-scripts`).
3. Create its venv with Python 3.11 and install its requirements (torch + sd-scripts deps, ~several GB) per the sd-scripts README.
4. In the `SDXLLoraTrainer` node, point it at the sd-scripts install / venv (the node exposes a backend-path field; see `sdxl_config_template.py`).

Until this backend exists, the `SDXLLoraTrainer` node will error when you queue a train. **This is the next manual step before training can run.** (Alternative: do steps 1–3 once, or switch to a cloud trainer later.)

## Settings

Enter these settings in the ComfyUI `SDXLLoraTrainer` node UI before queuing the train workflow:

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

After ~250 steps a `char1-000250.safetensors` (or state dir) should appear in the output — this confirms checkpointing works. To pause: stop ComfyUI and confirm GPU frees (`nvidia-smi`). To resume: relaunch ComfyUI and re-queue the train node with **resume from last state** enabled; confirm it continues from the saved step, not 0. When training reaches ~1500 steps, copy the final `char1.safetensors` to `D:\ComfyUI_windows_portable\ComfyUI\models\loras\`.
