import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

# Clean up any leftover test nodes 385, 386
for nid in [385, 386]:
    try: wire_bridge.delete(f"/patch/nodes/{nid}")
    except: pass

n1 = wire_bridge.post("/patch/nodes", {"class_id": "77697265-d235-4a6a-b661-02abe55c72ff"})
n2 = wire_bridge.post("/patch/nodes", {"class_id": "77697265-326F-4351-83FC-7A7FCFEDAFFC"})

nid1, nid2 = n1["id"], n2["id"]
print(f"Created nodes {nid1} and {nid2}")

conn_payload = {
    "source": {"node": nid1, "outlet": "output"},
    "target": {"node": nid2, "inlet": "input0"}
}
conn = wire_bridge.post("/patch/connections", conn_payload)
cid = conn["connection"]["id"]
print(f"Created conn id {cid}")

status = wire_bridge.delete(f"/patch/connections/{cid}")
print(f"Deleted conn status: {status}")

wire_bridge.delete(f"/patch/nodes/{nid1}")
wire_bridge.delete(f"/patch/nodes/{nid2}")
print("Cleaned up successfully")
