# comfyui/char_pipeline/curate_caption.py
import sys, os, glob, re
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import config as c
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
