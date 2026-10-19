import sys
import json
import os
import shutil

sys.stdout.reconfigure(encoding='utf-8')

src_file = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

with open(src_file, "r", encoding="utf-8") as f:
    d = json.load(f)

nodes = d["patch"]["nodes"]
conns = d["patch"]["connections"]

# 1. Add Not node (Node 426) for bypass optimization
node_426 = {
    "attributes": {
        "instances": {"type": "integer", "value": 1}
    },
    "bounds": {
        "height": 80.0,
        "width": 100.0,
        "x": 800.0,
        "y": -350.0
    },
    "class": {
        "id": "77697265-AEE3-4B9D-BBD5-6AD4BBD5DB30",
        "version": 1
    },
    "clock": "video",
    "color": "ff5885a2",
    "constants": {
        "input": {"type": "bool", "value": False}
    },
    "name": "Merge Bypass Invert",
    "thumbnail_visible": False
}
nodes["426"] = node_426

# Ensure Node 422 has bypass exposed (not hidden)
if "422" in nodes:
    if "bypass" in nodes["422"].get("hidden", []):
        nodes["422"]["hidden"].remove("bypass")
    nodes["422"]["constants"]["bypass"]["value"] = True

# Add connections for bypass:
# 421:output -> 426:input
# 426:output -> 422:bypass
conns = [c for c in conns if not (c["to"][0] == 422 and c["to"][1] == "bypass")]
conns.append({"from": [421, "output"], "to": [426, "input"]})
conns.append({"from": [426, "output"], "to": [422, "bypass"]})
d["patch"]["connections"] = conns

# 2. Update Node 79 (version string)
if "79" in nodes:
    attrs = nodes["79"]["attributes"]
    attrs["option0-label"]["value"] = "by Mizin  |  v3.0.0"
    print("Updated Node 79 label to: by Mizin  |  v3.0.0")

# 3. Update patch meta
meta = d["patch"]["meta"]
meta["displayName"] = "SliceOutliner Pro v3"
meta["description"] = "Source de moldura Pro: borda com degradê de até 4 cores, cantos arredondados individuais, modo quadro inteiro ou por slice, modo pórtico (merge slices), BPM sync com multiplicador, controle de direção, dual head flow & collision, efeitos animados (chase, hue, segmentos, RGB shift, glow). Saída com fundo transparente."

print("Updated patch meta: displayName =", meta["displayName"])

# Save to v3 directory
v3_dir = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v3"
os.makedirs(v3_dir, exist_ok=True)
v3_wire_path = os.path.join(v3_dir, "SliceOutliner Pro v3.wire")

# Copy thumbnail dir if exists
v2_thumb = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\Thumbnail"
v3_thumb = os.path.join(v3_dir, "Thumbnail")
if os.path.exists(v2_thumb) and not os.path.exists(v3_thumb):
    shutil.copytree(v2_thumb, v3_thumb)

with open(v3_wire_path, "w", encoding="utf-8") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)

print(f"Successfully generated: {v3_wire_path}")

# Also update D:\WIRE PROJECTS\SliceOutliner Pro by Mizin
d_wire_dir = r"D:\WIRE PROJECTS\SliceOutliner Pro by Mizin"
d_wire_path = os.path.join(d_wire_dir, "SliceOutliner Pro v3.wire")
with open(d_wire_path, "w", encoding="utf-8") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
print(f"Successfully saved to: {d_wire_path}")

# Also save to reconstructed in target
reconstructed_dir = r"D:\REA - ENGENHARIA REVERSA\targets\resolume_easy_outliner\reconstructed"
os.makedirs(reconstructed_dir, exist_ok=True)
reconstructed_path = os.path.join(reconstructed_dir, "SliceOutliner Pro v3.wire")
with open(reconstructed_path, "w", encoding="utf-8") as f:
    json.dump(d, f, indent=2, ensure_ascii=False)
print(f"Successfully saved to: {reconstructed_path}")
