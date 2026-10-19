import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

# Test creating Union node and connecting [100] Move.output to it
n_union = wire_bridge.post("/patch/nodes", {"class_id": "77697265-d619-42bf-b61d-4c9a7dcd6c2a"})
uid = n_union["id"]
print(f"Created Union node {uid}")

try:
    # Try connecting [100].output to Union.input0
    c = wire_bridge.connect(100, "output", uid, "input0")
    print("Connected [100].output -> Union.input0 successfully!", c.get("kind"))
    updated = wire_bridge.get(f"/patch/nodes/{uid}")
    print("Union inlets after connect:", [(i["id"], i["bundle"]) for i in updated["inlets"]])
    print("Union outlets after connect:", [(o["id"], o["bundle"]) for o in updated["outlets"]])
except Exception as e:
    print("Connection error:", e)

# Clean up
wire_bridge.delete(f"/patch/nodes/{uid}")
print("Cleaned up Union node")
