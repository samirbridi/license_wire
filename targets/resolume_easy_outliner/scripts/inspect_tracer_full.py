import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"
with open(wire_path, "r", encoding="utf-8") as f:
    data = json.load(f)

nodes = data["patch"]["nodes"]
conns = data["patch"]["connections"]

curr = {"353"}
visited = set()
for step in range(8):
    next_curr = set()
    print(f"\n--- STEP {step+1} from {curr} ---")
    for c in conns:
        f_id = str(c["from"][0])
        t_id = str(c["to"][0])
        if f_id in curr:
            f_name = nodes.get(f_id, {}).get("name", f_id)
            t_name = nodes.get(t_id, {}).get("name", t_id)
            print(f"[{f_id}] {f_name}.{c['from'][1]} -> [{t_id}] {t_name}.{c['to'][1]}")
            next_curr.add(t_id)
    curr = next_curr
    if not curr:
        break
