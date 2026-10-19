import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

# Test creating Edge Detection node and connecting [248] Slice Render to it
n_ed = wire_bridge.post("/patch/nodes", {"class_id": "77697265-9df3-4b94-a36d-42f1c6fbe997"})
ed_id = n_ed["id"]
print(f"Created Edge Detection node {ed_id}")

try:
    c = wire_bridge.connect(248, "output0", ed_id, "input")
    print("Connected [248] Slice Render -> Edge Detection.input successfully!", c.get("kind"))
    
    # Check outlets of Edge Detection
    updated = wire_bridge.get(f"/patch/nodes/{ed_id}")
    print("Edge Detection outlet:", [(o["id"], o["bundle"]) for o in updated["outlets"]])
except Exception as e:
    print("Error:", e)

# Clean up
wire_bridge.delete(f"/patch/nodes/{ed_id}")
print("Cleaned up Edge Detection node")
