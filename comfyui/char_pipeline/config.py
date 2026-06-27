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
