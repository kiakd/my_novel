"""
hy3d21_api_gen.py <image> [name] [--no-texture] [--port 8081]
-------------------------------------------------------------
ยิง API ของ Hunyuan3D-2.1 WinPortable (api_server.py) แบบ headless — ไม่ต้องเปิด GUI
POST /generate (JSON: base64 image + texture/PBR + remove_background + face_count) -> GLB binary
ออกที่ comfyui/ComfyUI/output/mesh/<name>.glb เพื่อเทียบกับตัวอื่น
"""
import sys, json, base64, time, urllib.request
from pathlib import Path

PORT = 8081
NAME = "hy21"
TEXTURE = True
args = sys.argv[1:]
img_path = args[0]
rest = args[1:]
if rest and not rest[0].startswith("--"):
    NAME = rest[0]; rest = rest[1:]
if "--no-texture" in rest:
    TEXTURE = False
if "--port" in rest:
    PORT = int(rest[rest.index("--port") + 1])

SRV = f"http://localhost:{PORT}"
OUT = Path(r"D:\test\my_novel\comfyui\ComfyUI\output\mesh") / f"{NAME}.glb"


def main():
    raw = Path(img_path).read_bytes()
    b64 = base64.b64encode(raw).decode()  # raw base64 (server 2.0 ไม่ strip data-URI prefix)
    payload = {
        "image": b64,
        "texture": TEXTURE,            # PBR texture (จุดที่ใกล้ Meshy)
        "remove_background": True,     # ตัดพื้นหลังในตัว
        "seed": 42,
        "octree_resolution": 256,
        "num_inference_steps": 5,      # 2.1 turbo
        "guidance_scale": 5.0,
        "num_chunks": 8000,
        "face_count": 12000,           # ลดเส้นเยอะ -> UV unwrap (xatlas) เร็วขึ้นมาก
        "type": "glb",
    }
    print(f"[>] POST {SRV}/generate  texture={TEXTURE}  ({len(raw)/1e3:.0f}KB image)", flush=True)
    req = urllib.request.Request(SRV + "/generate", data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    t0 = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=1200)
        data = resp.read()
    except Exception as e:
        print(f"[x] ERROR: {type(e).__name__}: {e}", flush=True)
        # อ่าน error body ถ้ามี
        body = getattr(e, "read", lambda: b"")()
        if body:
            print(body[:1500].decode("utf-8", "ignore"), flush=True)
        return
    # ถ้าได้ JSON แสดงว่า error, ถ้าได้ binary GLB คือสำเร็จ
    if data[:4] == b"glTF" or data[:1] == b"\x00" or len(data) > 100000:
        OUT.write_bytes(data)
        print(f"[ok] {NAME}: {OUT}  ({len(data)/1e6:.1f}MB, {time.time()-t0:.0f}s)", flush=True)
    else:
        print(f"[?] response ไม่ใช่ GLB ({len(data)}B): {data[:500]!r}", flush=True)


if __name__ == "__main__":
    main()
