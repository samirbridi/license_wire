import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge
import json

for cid in [
    "77697265-66b1-4c28-a5a9-1f64026d769b", # Transport Info
    "77697265-d6a0-423f-99f8-608fa5e03e97", # Bpm to Frequency
    "77697265-9890-41dc-a93d-9f3913a78feb", # Triangle Oscillator
]:
    n = wire_bridge.post("/patch/nodes", {"class_id": cid})
    nid = n["id"]
    print(f"=== {n.get('name')} ===")
    print("Class ID:", n.get("class_id"))
    wire_bridge.delete(f"/patch/nodes/{nid}")
