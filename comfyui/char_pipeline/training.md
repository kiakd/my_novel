# Training Settings (ComfyUI Realtime-LoRA node)

Enter these settings in the ComfyUI trainer node UI before queuing the train workflow:

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
