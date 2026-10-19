import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"
with open(wire_path, "r", encoding="utf-8") as f:
    data = json.load(f)

nodes = data["patch"]["nodes"]

# Look for specific node classes in existing patch to replicate their JSON structure exactly
classes_to_find = ["Switch", "Multiply", "Add", "Bool", "Float", "Integer", "Triangle Oscillator", "Saw Oscillator", "1 - x", "Max", "Transport"]
found = {}

for nid, n in nodes.items():
    name = n.get("name", "")
    cid = n.get("class", {}).get("id", "")
    for c in classes_to_find:
        if c.lower() in name.lower() and c not in found:
            found[c] = (nid, n)

for c, (nid, n) in found.items():
    print(f"=== Class: {c} (Node ID {nid}) ===")
    print("  name:", n.get("name"))
    print("  class:", n.get("class"))
    print("  params:", list(n.get("params", {}).keys()))
    print("  sample json keys:", list(n.keys()))
