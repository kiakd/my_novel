#!/usr/bin/env python3
# throwaway: หา clothes-lift / shirt-lift concept LoRA บน civitai (SDXL + Illustrious)
import json, urllib.request, urllib.parse, os, time

KEY = ""
with open(os.path.join(os.path.dirname(__file__), ".env"), encoding="utf-8") as f:
    for line in f:
        if line.startswith("CIVITAI_API_KEY="):
            KEY = line.split("=", 1)[1].strip()

def search(query, bases):
    params = urllib.parse.urlencode({
        "limit": 6, "types": "LORA", "sort": "Most Downloaded",
        "nsfw": "true", "query": query}, doseq=True)
    for b in bases:
        params += "&baseModels=" + urllib.parse.quote(b)
    req = urllib.request.Request(
        "https://civitai.com/api/v1/models?" + params,
        headers={"Authorization": f"Bearer {KEY}", "User-Agent": "curl/8"})
    for attempt in range(3):
        try:
            raw = urllib.request.urlopen(req, timeout=30).read()
            return json.loads(raw).get("items", [])
        except Exception as e:
            if attempt == 2:
                print(f"  [error: {e}]"); return []
            time.sleep(2)

BASES = ["SDXL 1.0", "Illustrious", "Pony"]
TERMS = ["clothes lift", "shirt lift", "tube top pull", "lifting shirt",
         "undressing", "clothes pull"]

for term in TERMS:
    items = search(term, BASES)
    print(f"\n=== '{term}' ({len(items)} hits) ===")
    for m in items:
        v = (m.get("modelVersions") or [{}])[0]
        base = v.get("baseModel", "?")
        trig = ", ".join(v.get("trainedWords", [])[:5]) or "(none)"
        dl = m.get("stats", {}).get("downloadCount", "?")
        print(f"  • {m['name'][:50]} [base={base} dl={dl}]")
        print(f"      modelId={m['id']} verId={v.get('id')}  trigger: {trig}")
