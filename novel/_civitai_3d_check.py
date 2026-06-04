"""throwaway: เช็ค Civitai ว่ามี LoRA/resource ช่วยงาน 3D pipeline ไหม"""
import os, json, urllib.request, urllib.parse, re

key = ""
for line in open(os.path.join(os.path.dirname(__file__), ".env"), encoding="utf-8"):
    if line.upper().startswith("CIVITAI_API_KEY"):
        key = line.split("=", 1)[1].strip().strip('"')

WANT = ("Illustrious", "Pony", "SDXL", "NoobAI", "Anima", "SD 1.5")
QUERIES = ["turnaround", "three view", "multiple views", "charturner",
           "character sheet", "model sheet", "orthographic", "T-pose reference"]


import time
def search(q, types="LORA", limit=15):
    url = f"https://civitai.com/api/v1/models?query={urllib.parse.quote(q)}&types={types}&limit={limit}&sort=Most%20Downloaded"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {key}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) civitai-check/1.0",
        "Content-Type": "application/json",
    })
    time.sleep(1.5)
    return json.load(urllib.request.urlopen(req, timeout=30)).get("items", [])


seen = set()
for q in QUERIES:
    print(f"\n===== {q} =====")
    try:
        items = search(q)
    except Exception as e:
        print("  err", e); continue
    hits = 0
    for m in items:
        mv = (m.get("modelVersions") or [{}])[0] or {}
        base = str(mv.get("baseModel", ""))
        name = m.get("name", "")[:60]
        # keep ones relevant to turnaround/views/3d & on a base we use
        if any(w in base for w in WANT) and m["id"] not in seen:
            dl = m.get("stats", {}).get("downloadCount", 0)
            print(f"  - {name!r}  [{base}]  dl={dl}  id={m['id']}")
            seen.add(m["id"]); hits += 1
        if hits >= 6:
            break

# also: any ComfyUI workflows tagged 3d?
print("\n===== workflows / 3d (type=Workflows) =====")
try:
    for m in search("3d", types="Workflows", limit=10):
        print(f"  - {m.get('name','')[:60]!r}  dl={m.get('stats',{}).get('downloadCount',0)}  id={m['id']}")
except Exception as e:
    print("  err", e)
