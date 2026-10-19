import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge
from collections import Counter

def analyze_patch():
    nodes_data = wire_bridge.get("/patch/nodes?limit=500")
    nodes = nodes_data.get("items", [])
    print(f"Total Nodes in Live Patch: {len(nodes)}")
    
    # Count node types
    classes = Counter()
    for n in nodes:
        c_name = n.get("class", {}).get("name") or n.get("name") or "Unknown"
        classes[c_name] += 1
        
    print("\nMost used node types:")
    for c_name, count in classes.most_common(15):
        print(f"  * {c_name:25s}: {count}")
        
    conns_data = wire_bridge.get("/patch/connections?limit=1000")
    conns = conns_data.get("items", []) if isinstance(conns_data, dict) else conns_data
    print(f"\nTotal Connections: {len(conns)}")

if __name__ == "__main__":
    analyze_patch()
