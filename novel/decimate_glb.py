"""
decimate_glb.py <in.glb> [target_faces] [out.glb]
--------------------------------------------------
ลด mesh ให้เป็น low-poly. 2 ชั้น:
  1) quadric (fast_simplification ผ่าน trimesh) — คุณภาพดี รักษารูปทรง
  2) ถ้า quadric "ตัน" (mesh จาก surface-net/Hunyuan มี non-manifold edge เยอะ ลดไม่ลง)
     จะ fallback เป็น vertex-clustering (snap grid) ซึ่งทะลุเพดานได้เสมอ (ได้ลุคโลว์โพลีเหลี่ยม)
- target_faces ดีฟอลต์ 10000
- out ดีฟอลต์ = <in>_lp<N>.glb
หมายเหตุ: ได้ triangle ล้วน — ถ้าจะ rig ต้อง retopo เป็น quad ต่อใน Blender (QuadriFlow/Instant Meshes)
"""
import sys
from pathlib import Path
import numpy as np
import trimesh


def quadric(m, target):
    try:
        return m.simplify_quadric_decimation(face_count=target)
    except TypeError:
        return m.simplify_quadric_decimation(target)


def vertex_cluster(m, target):
    """snap verts ลง grid แล้ว merge — หา cell size ให้ faces ใกล้ target"""
    V, F = np.asarray(m.vertices), np.asarray(m.faces)
    diag = float(np.linalg.norm(V.max(0) - V.min(0)))

    def build(frac):
        cell = diag * frac
        q = np.floor((V - V.min(0)) / cell).astype(np.int64)
        key, inv = np.unique(q, axis=0, return_inverse=True)
        nv = np.zeros((len(key), 3)); cnt = np.zeros(len(key))
        np.add.at(nv, inv, V); np.add.at(cnt, inv, 1); nv /= cnt[:, None]
        nf = inv[F]
        good = (nf[:, 0] != nf[:, 1]) & (nf[:, 1] != nf[:, 2]) & (nf[:, 0] != nf[:, 2])
        nf = np.unique(np.sort(nf[good], 1), axis=0)
        return nv, nf

    # ไล่หา frac ที่ faces ใกล้ target (มาก->น้อย = ละเอียด->หยาบ)
    best = None
    for frac in np.linspace(0.008, 0.04, 22):
        nv, nf = build(frac)
        best = (nv, nf)
        if len(nf) <= target:
            break
    return trimesh.Trimesh(vertices=best[0], faces=best[1], process=True)


def main():
    src = Path(sys.argv[1])
    target = int(sys.argv[2]) if len(sys.argv) > 2 else 10000
    out = Path(sys.argv[3]) if len(sys.argv) > 3 else src.with_name(f"{src.stem}_lp{target}.glb")

    m = trimesh.load(str(src), force="mesh")
    f0 = len(m.faces)
    print(f"[i] in : {len(m.vertices):,} verts / {f0:,} faces  ({src.name})", flush=True)
    if f0 <= target:
        m.export(str(out)); print(f"[ok] already <= target -> {out}"); return

    mq = quadric(m, target)
    fq = len(mq.faces)
    if fq <= target * 1.5:
        mq.export(str(out))
        print(f"[ok] quadric: {len(mq.vertices):,}V {fq:,}F ({fq/f0*100:.1f}%) -> {out}", flush=True)
    else:
        print(f"[!] quadric ตันที่ {fq:,}F (>{int(target*1.5):,}) — fallback vertex-clustering", flush=True)
        mc = vertex_cluster(m, target)
        mc.export(str(out))
        print(f"[ok] cluster: {len(mc.vertices):,}V {len(mc.faces):,}F -> {out}", flush=True)


if __name__ == "__main__":
    main()
