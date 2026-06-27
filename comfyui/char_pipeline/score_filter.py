# comfyui/char_pipeline/score_filter.py
import sys, os, glob, shutil, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import config as c
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
