import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"
with open(wire_path, "r", encoding="utf-8") as f:
    data = json.load(f)

conns = data["patch"]["connections"]
targets = {'115', '135', '251', '113', '200', '10'}
for c in conns:
    f_id = str(c["from"][0])
    t_id = str(c["to"][0])
    if f_id in targets or t_id in targets:
        print(f"[{f_id}].{c['from'][1]} -> [{t_id}].{c['to'][1]}")
