import sys
import json
import urllib.request
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

# Create a test Float In node
n = wire_bridge.post("/patch/nodes", {"class_id": "77697265-d235-4a6a-b661-02abe55c72ff"})
nid = n["id"]
print(f"Created node {nid}")

# Try PATCH /patch/nodes/{nid} with name and see if inlets can be modified
# Let's inspect what endpoints exist under /patch/nodes/{nid}
for ep, method, payload in [
    (f"/patch/nodes/{nid}", "PATCH", {"name": "Test Float"}),
    (f"/patch/nodes/{nid}/inlets/input", "PUT", {"value": 0.75}),
    (f"/patch/nodes/{nid}/inlets/input", "PATCH", {"value": 0.75}),
    (f"/patch/nodes/{nid}", "PATCH", {"inlets": [{"id": "input", "value": 0.75}]}),
]:
    url = f"http://127.0.0.1:8081/api/v2{ep}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            print(f"{method} {ep} SUCCESS:", resp.status)
    except urllib.error.HTTPError as e:
        print(f"{method} {ep} ERROR {e.code}:", e.read().decode("utf-8")[:100])

# Verify state of node
updated_n = wire_bridge.get(f"/patch/nodes/{nid}")
print("Node name:", updated_n.get("name"))
for i in updated_n.get("inlets", []):
    if i.get("id") == "input":
        print("Input inlet value:", i.get("value"))

wire_bridge.delete(f"/patch/nodes/{nid}")
print("Cleaned up")
