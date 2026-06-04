"""
render_mesh.py <glb> [out.png] [--head]
---------------------------------------
Render .glb เป็นภาพมีแสงเงาแบบ headless (ไม่ต้องมี OpenGL/display)
วิธี: point-splat + z-buffer + Lambertian shading ด้วย numpy ล้วน
ออก 3 มุม (front / side / head-zoom) ใน 1 ภาพ
"""
import sys
import numpy as np
import trimesh
from PIL import Image

RES = 700          # ความละเอียดต่อมุม
SPLAT = 2          # รัศมี splat (px) เติมรู


def shade(verts, norms, axis_x, axis_y, axis_depth, flip_depth=False, res=RES):
    x = verts[:, axis_x].copy()
    y = verts[:, axis_y].copy()
    d = verts[:, axis_depth].copy()
    nd = norms[:, axis_depth].copy()
    if flip_depth:
        d = -d; nd = -nd
    # normalize -> pixel
    def norm(a):
        lo, hi = a.min(), a.max()
        return (a - lo) / (hi - lo + 1e-9)
    # keep aspect: scale by max range
    rng = max(x.max() - x.min(), y.max() - y.min()) + 1e-9
    px = ((x - x.min()) / rng * (res - 1)).astype(np.int32)
    py = ((y.max() - y) / rng * (res - 1)).astype(np.int32)  # flip y for image
    px = np.clip(px, 0, res - 1); py = np.clip(py, 0, res - 1)

    # light: from camera (depth) + a touch from top
    inten = np.clip(0.75 * np.clip(nd, 0, 1) + 0.25 * np.clip(norms[:, axis_y] * (-1 if False else 1), 0, 1), 0, 1)
    inten = 0.25 + 0.75 * inten  # ambient

    zbuf = np.full((res, res), -1e9, dtype=np.float32)
    img = np.zeros((res, res), dtype=np.float32)
    # ใกล้สุดชนะ: เรียงตามความลึกจากไกล->ใกล้ แล้วเขียนทับ
    order = np.argsort(d)
    for dx in range(-SPLAT, SPLAT + 1):
        for dy in range(-SPLAT, SPLAT + 1):
            xx = np.clip(px[order] + dx, 0, res - 1)
            yy = np.clip(py[order] + dy, 0, res - 1)
            dd = d[order]; ii = inten[order]
            mask = dd > zbuf[yy, xx]
            zbuf[yy, xx] = np.where(mask, dd, zbuf[yy, xx])
            img[yy, xx] = np.where(mask, ii, img[yy, xx])
    out = (img * 255).astype(np.uint8)
    bg = (zbuf <= -1e8)
    out[bg] = 245
    return out


def main():
    path = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else path.rsplit(".", 1)[0] + "_render.png"
    m = trimesh.load(path, force="mesh")
    v = np.asarray(m.vertices, dtype=np.float32)
    n = np.asarray(m.vertex_normals, dtype=np.float32)
    print(f"loaded {len(v)} verts / {len(m.faces)} faces")

    # front: looking -Z (x=0,y=1,depth=2) ; side: looking -X (z,y) ; head zoom: front top 35%
    panels = []
    panels.append(("front", shade(v, n, 0, 1, 2)))
    panels.append(("side", shade(v, n, 2, 1, 0)))
    # head zoom: ตัดเอา 35% บน (แกน y)
    ymin, ymax = v[:, 1].min(), v[:, 1].max()
    cut = ymax - 0.35 * (ymax - ymin)
    hm = v[:, 1] >= cut
    panels.append(("head", shade(v[hm], n[hm], 0, 1, 2)))

    gap = 10
    H = RES; W = RES * 3 + gap * 2
    canvas = np.full((H + 24, W), 255, dtype=np.uint8)
    for i, (t, p) in enumerate(panels):
        canvas[24:24 + RES, i * (RES + gap):i * (RES + gap) + RES] = p
    Image.fromarray(canvas).save(out)
    print("saved", out)


if __name__ == "__main__":
    main()
