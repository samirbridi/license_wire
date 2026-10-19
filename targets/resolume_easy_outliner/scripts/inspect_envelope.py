import json
import sys
sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"
with open(wire_path, "r", encoding="utf-8") as f:
    data = json.load(f)

targets = {'351', '352', '353', '366', '367'}
for c in data["patch"]["connections"]:
    if str(c["to"][0]) in targets:
        f_id = str(c["from"][0])
        f_name = data["patch"]["nodes"].get(f_id, {}).get("name", f_id)
        t_id = str(c["to"][0])
        t_name = data["patch"]["nodes"].get(t_id, {}).get("name", t_id)
        print(f"[{f_id}] {f_name}.{c['from'][1]} -> [{t_id}] {t_name}.{c['to'][1]}")
