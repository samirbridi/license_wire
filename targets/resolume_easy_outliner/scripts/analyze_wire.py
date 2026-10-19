import json
import os

patch_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\EasyOutliner\EasyOutliner.wire"

with open(patch_path, "r", encoding="utf-8") as f:
    d = json.load(f)

nodes = d["patch"]["nodes"]
conns = d["patch"]["connections"]

print(f"Total Nodes: {len(nodes)}")
print(f"Total Connections: {len(conns)}")
print("=" * 60)

for nid, n in sorted(nodes.items(), key=lambda x: int(x[0])):
    name = n.get("name", "")
    comments = n.get("comment", "")
    params = n.get("params", {})
    param_list = []
    for pid, p in params.items():
        if isinstance(p, dict) and "name" in p:
            val = p.get("value")
            param_list.append(f"{p['name']}={val}")
    print(f"Node [{nid:2s}] {name:20s} | {', '.join(param_list)}")

print("=" * 60)
print("CONNECTIONS FLOW:")
for c in conns:
    f_id, f_port = str(c["from"][0]), c["from"][1]
    t_id, t_port = str(c["to"][0]), c["to"][1]
    f_name = nodes.get(f_id, {}).get("name", f_id)
    t_name = nodes.get(t_id, {}).get("name", t_id)
    print(f"[{f_id}] {f_name}.{f_port}  --->  [{t_id}] {t_name}.{t_port}")
