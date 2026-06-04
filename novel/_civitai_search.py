#!/usr/bin/env python3
import json, urllib.request, urllib.parse, os, time

KEY = ""
with open(os.path.join(os.path.dirname(__file__), ".env"), encoding="utf-8") as f:
    for line in f:
        if line.startswith("CIVITAI_API_KEY="):
            KEY = line.split("=", 1)[1].strip()

def search(query, limit=6):
    params = urllib.parse.urlencode({
        "limit": limit, "types": "LORA", "sort": "Most Downloaded",
        "nsfw": "true", "baseModels": "Illustrious", "query": query,
    })
    req = urllib.request.Request(
        "https://civitai.com/api/v1/models?" + params,
        headers={"Authorization": f"Bearer {KEY}", "User-Agent": "curl/8"})
    for attempt in range(3):
        try:
            raw = urllib.request.urlopen(req, timeout=30).read()
            return json.loads(raw).get("items", [])
        except Exception as e:
            if attempt == 2:
                print(f"  [error: {e}]")
                return []
            time.sleep(2)

TERMS = ["gangbang", "spitroast", "double penetration",
         "sex position", "cowgirl position", "doggystyle", "missionary"]

for term in TERMS:
    items = search(term)
    print(f"\n=== '{term}' ({len(items)} hits) ===")
    for m in items:
        v = (m.get("modelVersions") or [{}])[0]
        base = v.get("baseModel", "?")
        trig = ", ".join(v.get("trainedWords", [])[:4]) or "(none listed)"
        dl = m.get("stats", {}).get("downloadCount", "?")
        print(f"  • {m['name'][:46]}")
        print(f"      modelId={m['id']}  verId={v.get('id')}  base={base}  dl={dl}")
        print(f"      trigger: {trig}")
