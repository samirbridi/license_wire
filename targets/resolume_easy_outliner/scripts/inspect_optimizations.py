import sys
import json

sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

with open(wire_path, "r", encoding="utf-8") as f:
    d = json.load(f)

nodes = d.get("patch", {}).get("nodes", {})
conns = d.get("patch", {}).get("connections", [])

print("--- Connections involving Merge Slices pipeline ---")
for c in conns:
    f_node, f_port = str(c["from"][0]), c["from"][1]
    t_node, t_port = str(c["to"][0]), c["to"][1]
    if any(nid in [f_node, t_node] for nid in ["420", "421", "422", "423", "424", "425", "426"]):
        print(f"Node {f_node}:{f_port} -> Node {t_node}:{t_port}")

print("\n--- Effects and their bypass possibilities ---")
# Check nodes with 'bypass' inlet
print("\n--- Disconnected nodes ---")
from_nodes = set(c["from"][0] for c in conns)
to_nodes = set(c["to"][0] for c in conns)

for nid, n in nodes.items():
    in_nid = int(nid)
    if in_nid not in from_nodes and in_nid not in to_nodes:
        name = n.get("name") or "Unnamed"
        cid = n.get("class", {}).get("id")
        print(f"Node {nid}: name='{name}' class={cid}")

