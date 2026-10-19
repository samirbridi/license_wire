import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

wire_file = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
nodes = wire_bridge.get("/patch/nodes?limit=1000").get("items", [])
node_names = {n["id"]: n.get("name", str(n["id"])) for n in nodes}

for root_id in [92, 102]:
    print(f"\n=== Downstream from [{root_id}] {node_names.get(root_id)} ===")
    curr = {root_id}
    for step in range(4):
        next_curr = set()
        for c in conns:
            s_id = c["source"]["node"]
            t_id = c["target"]["node"]
            if s_id in curr:
                print(f"[{s_id}] {node_names.get(s_id)}.{c['source']['outlet']} -> [{t_id}] {node_names.get(t_id)}.{c['target']['inlet']}")
                next_curr.add(t_id)
        curr = next_curr
        if not curr: break
