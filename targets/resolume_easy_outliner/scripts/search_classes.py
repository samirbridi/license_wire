import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

keywords = sys.argv[1:] if len(sys.argv) > 1 else ["max", "mix", "blend", "clamp", "greater"]
for c in wire_bridge.query_classes(""):
    name = c.get("name", "")
    if any(k.lower() in name.lower() for k in keywords):
        print(f"[{name}] {c.get('id')} ({c.get('category')})")
