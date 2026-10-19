import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

wire_file = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
nodes = wire_bridge.get("/patch/nodes?limit=1000").get("items", [])
node_names = {n["id"]: n.get("name", str(n["id"])) for n in nodes}

# Let's trace from UV Map and Borda Colorida
targets = [37, 243, 273, 345, 354, 4, 5, 206]
print("=== Targets ===")
for tid in targets:
    print(f"[{tid}] {node_names.get(tid)}")
    # in connections
    for c in conns:
        if c["target"]["node"] == tid:
            print(f"   <- [{c['source']['node']}] {node_names.get(c['source']['node'])}.{c['source']['outlet']}")
    # out connections
    for c in conns:
        if c["source"]["node"] == tid:
            print(f"   -> [{c['target']['node']}] {node_names.get(c['target']['node'])}.{c['target']['inlet']}")
