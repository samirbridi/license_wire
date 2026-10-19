import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

with open(wire_path, "r", encoding="utf-8") as f:
    d = json.load(f)

print("Patch meta:", json.dumps(d.get("patch", {}).get("meta", {}), indent=2))

nodes = d.get("patch", {}).get("nodes", {})
for nid, n in nodes.items():
    s = json.dumps(n)
    if "mizin" in s.lower() or "v2" in s.lower() or "sliceoutliner" in s.lower():
        print(f"\n--- Node ID {nid} ---")
        print("Name:", n.get("name"))
        print("Class:", n.get("class"))
        print("Params:", n.get("params"))
        print("Attributes:", n.get("attributes"))
