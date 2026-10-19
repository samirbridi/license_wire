import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

with open(wire_path, "r", encoding="utf-8") as f:
    data = json.load(f)

nodes = data["patch"]["nodes"]
conns = data["patch"]["connections"]

print(f"Total Nodes: {len(nodes)}, Total Connections: {len(conns)}")

# Find nodes with 'Tracer' or 'Saw' or 'Oscillator' in name
tracer_nodes = {}
for nid, n in nodes.items():
    name = n.get("name", "")
    c_name = n.get("class", {}).get("name", "")
    if any(k in name.lower() or k in c_name.lower() for k in ["tracer", "saw", "oscillator", "speed", "chase"]):
        tracer_nodes[nid] = n
        print(f"Node [{nid}] \"{name}\" (class: {n.get('class')})")

print("\nConnections involving these nodes:")
for c in conns:
    f_id, f_port = str(c["from"][0]), c["from"][1]
    t_id, t_port = str(c["to"][0]), c["to"][1]
    if f_id in tracer_nodes or t_id in tracer_nodes:
        f_name = nodes.get(f_id, {}).get("name", f_id)
        t_name = nodes.get(t_id, {}).get("name", t_id)
        print(f"  [{f_id}] {f_name}.{f_port}  --->  [{t_id}] {t_name}.{t_port}")
