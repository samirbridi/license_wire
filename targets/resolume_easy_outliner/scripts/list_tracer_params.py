import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"
with open(wire_path, "r", encoding="utf-8") as f:
    data = json.load(f)

for nid, n in data["patch"]["nodes"].items():
    name = n.get("name", "")
    if any(k in name.lower() for k in ["tracer", "chase", "speed", "tail", "fade", "length", "offset", "arc"]):
        print(f"[{nid}] {name} (Class: {n.get('class', {}).get('id')})")
