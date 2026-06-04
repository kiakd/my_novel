#!/usr/bin/env python3
import json, urllib.request, urllib.parse, os, time

KEY = ""
with open(os.path.join(os.path.dirname(__file__), ".env"), encoding="utf-8") as f:
    for line in f:
        if line.startswith("CIVITAI_API_KEY="):
            KEY = line.split("=", 1)[1].strip()

def api(extra):
    base = {"limit": 8, "types": "LORA", "baseModels": "Illustrious", "nsfw": "true"}
    base.update(extra)
    url = "https://civitai.com/api/v1/models?" + urllib.parse.urlencode(base)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {KEY}", "User-Agent": "curl/8"})
    for a in range(3):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=30).read()).get("items", [])
        except Exception as e:
            if a == 2: print("  [err]", e); return []
            time.sleep(2)

def show(title, items):
    print(f"\n=== {title} ({len(items)}) ===")
    for m in items:
        v = (m.get("modelVersions") or [{}])[0]
        tag = "NSFW" if m.get("nsfw") else "SFW "
        trig = ", ".join(v.get("trainedWords", [])[:3]) or "(none)"
        dl = m.get("stats", {}).get("downloadCount", "?")
        print(f"  [{tag}] {m['name'][:44]}")
        print(f"         verId={v.get('id')}  base={v.get('baseModel','?')}  dl={dl}  trig: {trig[:70]}")

# 1) ยอดนิยมรวม (ทุกหมวด) — Most Downloaded all-time
show("TOP Most-Downloaded (all)", api({"sort": "Most Downloaded", "limit": 12}))
# 2) utility: detail / quality
for term in ["detail tweaker", "detail enhancer", "hyper", "DMD2", "turbo accelerator", "style enhancer"]:
    show(f"search: {term}", api({"sort": "Most Downloaded", "query": term, "limit": 5}))
