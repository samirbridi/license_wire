import sys
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
nodes_of_interest = {357, 362, 259, 261, 367, 278}
for c in conns:
    s_node = c["source"]["node"]
    t_node = c["target"]["node"]
    if s_node in nodes_of_interest or t_node in nodes_of_interest:
        print(f"Conn ID {c['id']}: [{s_node}].{c['source']['outlet']} -> [{t_node}].{c['target']['inlet']}")
