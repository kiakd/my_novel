"""หาขีดจำกัด: xatlas UV unwrap ใช้เวลาเท่าไรตาม face count (ตัวที่ทำ texture local ช้า)"""
import time, trimesh, xatlas

src = r'D:\test\my_novel\comfyui\ComfyUI\output\mesh\hy3d_mini_shape.glb'
m = trimesh.load(src, force='mesh')
print(f'AI mesh ดิบ: {len(m.vertices)} verts / {len(m.faces)} faces', flush=True)


def t_uv(mesh, label):
    t = time.time()
    try:
        xatlas.parametrize(mesh.vertices, mesh.faces)
        print(f'  [{label}] {len(mesh.faces):>7} faces -> xatlas {time.time()-t:6.1f}s', flush=True)
    except Exception as e:
        print(f'  [{label}] ERROR {e}', flush=True)


# decimate ลงหลายระดับ แล้วจับเวลา (เบา->หนัก)
for tgt in [2000, 5000, 10000, 20000]:
    d = m.simplify_quadric_decimation(face_count=tgt)
    t_uv(d, f'decim{tgt}')

# raw สุดท้าย (อาจช้ามาก = ตัวการที่เจอ)
print('--- raw (อาจช้ามาก) ---', flush=True)
t_uv(m, 'raw')
print('[DONE]', flush=True)
