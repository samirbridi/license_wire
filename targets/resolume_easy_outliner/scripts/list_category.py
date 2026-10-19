import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

cat = sys.argv[1] if len(sys.argv) > 1 else "Shape"
for c in wire_bridge.query_classes(""):
    if c.get("category", "").lower() == cat.lower():
        print(f"[{c['name']}] {c['id']}")
