import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

keywords = ["union", "merge", "bool", "join", "combine", "bound", "hull", "contour", "shape", "mesh", "slice"]
found = {}
for c in wire_bridge.query_classes(""):
    name = c.get("name", "")
    for k in keywords:
        if k.lower() in name.lower():
            found[c.get("id")] = (name, c.get("category", ""))

print(f"Total found: {len(found)}")
for cid, (name, cat) in sorted(found.items(), key=lambda x: x[1][0]):
    print(f"  [{name:30s}] {cid} ({cat})")
