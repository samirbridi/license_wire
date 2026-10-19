import sys
import json
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

def probe(class_id):
    try:
        node = wire_bridge.post("/patch/nodes", {"class_id": class_id})
        nid = node.get("id")
        print(f"Created node {nid}: {node.get('name')}")
        print("  Inlets:", json.dumps(node.get("inlets", []), indent=2))
        print("  Outlets:", json.dumps(node.get("outlets", []), indent=2))
        print("  Full keys:", list(node.keys()))
        wire_bridge.delete(f"/patch/nodes/{nid}")
        print(f"Cleaned up node {nid}")
        return node
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    cid = sys.argv[1] if len(sys.argv) > 1 else "77697265-6a6-4071-8774-4eb17208ef11"
    probe(cid)
