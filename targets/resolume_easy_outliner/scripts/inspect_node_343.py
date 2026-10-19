import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
nodes = wire_bridge.get("/patch/nodes?limit=1000").get("items", [])
node_names = {n["id"]: n.get("name", str(n["id"])) for n in nodes}

print("=== Inputs to [343] Texture from Channels ===")
for c in conns:
    if c["target"]["node"] == 343:
        s_id = c["source"]["node"]
        print(f"[{s_id}] {node_names.get(s_id)}.{c['source']['outlet']} -> [343].{c['target']['inlet']}")

n343 = wire_bridge.get("/patch/nodes/343")
print("Node 343 info:", n343.get("name"), n343.get("class_id"))
