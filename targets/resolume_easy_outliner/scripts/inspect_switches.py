import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
nodes = wire_bridge.get("/patch/nodes?limit=1000").get("items", [])
node_names = {n["id"]: n.get("name", str(n["id"])) for n in nodes}
sw_ids = [n["id"] for n in nodes if "switch" in n.get("name","").lower() and n["id"] >= 370]

print("Switch nodes:")
for sid in sw_ids:
    print(f"  [{sid}] {node_names.get(sid)}")

print("\nConnections feeding these switches:")
for c in conns:
    if c["target"]["node"] in sw_ids:
        s_id = c["source"]["node"]
        t_id = c["target"]["node"]
        s_name = node_names.get(s_id, str(s_id))
        t_name = node_names.get(t_id, str(t_id))
        inlet = c["target"]["inlet"]
        print(f"  [{s_id}] {s_name} ---> [{t_id}] {t_name}.{inlet}")
