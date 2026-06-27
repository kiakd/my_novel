# comfyui/char_pipeline/verify_face.py
import sys, os, cv2, numpy as np
from insightface.app import FaceAnalysis
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
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
