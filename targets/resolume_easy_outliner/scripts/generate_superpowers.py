import json
import os
import sys
import copy
sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

with open(wire_path, "r", encoding="utf-8") as f:
    patch_data = json.load(f)

nodes = patch_data["patch"]["nodes"]
conns = patch_data["patch"]["connections"]

print(f"Original: {len(nodes)} nodes, {len(conns)} connections")

# Helper function to clone a node template
def clone_node(template_id, new_id, name, x=0, y=0, color=None):
    base = copy.deepcopy(nodes[str(template_id)])
    base["name"] = name
    base["bounds"]["x"] = x
    base["bounds"]["y"] = y
    if color:
        base["color"] = color
    nodes[str(new_id)] = base
    return base

# --- 1. SUPERPOWER: BPM SYNC ---
# We clone Bool In from 308 ("Tracer Random")
bpm_sync = clone_node(308, 500, "BPM Sync", x=-880, y=5600, color="ffff6a00")
bpm_sync["constants"] = {"input": {"type": "bool", "value": False}}

# Transport Info: class 77697265-66b1-4c28-a5a9-1f64026d769b
nodes["501"] = {
    "attributes": {"flow": {"type": "flow", "value": "signal"}},
    "bounds": {"height": 90, "width": 140, "x": -720, "y": 5600},
    "class": {"id": "77697265-66b1-4c28-a5a9-1f64026d769b", "version": 1},
    "clock": "video",
    "color": "ff00a2ff",
    "constants": {},
    "hidden": [],
    "name": "Transport Info",
    "thumbnail_visible": False
}

# Bpm to Frequency: class 77697265-d6a0-423f-99f8-608fa5e03e97
nodes["502"] = {
    "attributes": {"flow": {"type": "flow", "value": "signal"}},
    "bounds": {"height": 80, "width": 130, "x": -550, "y": 5600},
    "class": {"id": "77697265-d6a0-423f-99f8-608fa5e03e97", "version": 1},
    "clock": "video",
    "color": "ff00a2ff",
    "constants": {},
    "hidden": [],
    "name": "Bpm to Frequency",
    "thumbnail_visible": False
}

# BPM Multiplier: clone Float In from 127
bpm_mult = clone_node(127, 503, "BPM Multiplier", x=-720, y=5720, color="ffff6a00")
bpm_mult["constants"] = {"input": {"type": "float", "value": 1.0}}
bpm_mult["attributes"]["min"] = {"type": "float", "value": 0.125}
bpm_mult["attributes"]["max"] = {"type": "float", "value": 8.0}

# Multiply (Bpm freq * BPM Multiplier): clone Multiply from 362
clone_node(362, 504, "BPM Speed Multiply", x=-380, y=5650)

# BPM Switch (2-way): clone Switch from 115
bpm_switch = clone_node(115, 505, "BPM Switch", x=-200, y=5530)
bpm_switch["attributes"]["inlets-count"] = {"type": "integer", "value": 2}

# Rewire Tracer Speed -> BPM Switch -> 362
# Remove old connection [357].output -> [362].input1
conns = [c for c in conns if not (str(c["from"][0]) == "357" and str(c["to"][0]) == "362")]

conns.append({"from": [501, "bpm"], "to": [502, "input0"]})
conns.append({"from": [502, "output0"], "to": [504, "input0"]})
conns.append({"from": [503, "output"], "to": [504, "input1"]})
conns.append({"from": [500, "output"], "to": [505, "selection"]})
conns.append({"from": [357, "output"], "to": [505, "input0"]})
conns.append({"from": [504, "output0"], "to": [505, "input1"]})
conns.append({"from": [505, "output"], "to": [362, "input1"]})

# --- 2. SUPERPOWER: DIRECTION CONTROL (Clockwise / Counter-Clockwise / Ping-Pong) ---
# Tracer Direction: clone Int In from 348
dir_in = clone_node(348, 510, "Tracer Direction", x=-880, y=5850, color="ffff6a00")
dir_in["constants"] = {"input": {"type": "integer", "value": 0}}
dir_in["attributes"]["min"] = {"type": "integer", "value": 0}
dir_in["attributes"]["max"] = {"type": "integer", "value": 2}
dir_in["attributes"]["options-count"] = {"type": "integer", "value": 3}
dir_in["attributes"]["widget"] = {"type": "integer", "value": 1} # Dropdown

# 1 - x (Inverted Saw for counter-clockwise): clone from 135
clone_node(135, 511, "Invert Saw", x=-100, y=5420)

# Triangle Oscillator: clone from 251
tri = clone_node(251, 512, "Triangle Oscillator", x=-100, y=5320)
# Make unipolar
tri["attributes"]["unipolar"] = {"type": "bool", "value": True}

# Direction Switch (3-way): clone Switch from 115
dir_switch = clone_node(115, 513, "Direction Switch", x=80, y=5380)
dir_switch["attributes"]["inlets-count"] = {"type": "integer", "value": 3}

# Connect Direction system
conns.append({"from": [362, "output0"], "to": [512, "frequency"]})
conns.append({"from": [259, "output"], "to": [511, "input0"]})
conns.append({"from": [510, "output"], "to": [513, "selection"]})
conns.append({"from": [259, "output"], "to": [513, "input0"]})
conns.append({"from": [511, "output0"], "to": [513, "input1"]})
conns.append({"from": [512, "output"], "to": [513, "input2"]})

# Rewire: remove old [259].output -> [261].input1
conns = [c for c in conns if not (str(c["from"][0]) == "259" and str(c["to"][0]) == "261")]
# Connect Direction Switch -> [261].input1
conns.append({"from": [513, "output"], "to": [261, "input1"]})

# --- 3. SUPERPOWER: DUAL HEAD FLOW & COLLISION ---
# Node 520: Bool In "Dual Head"
clone_node(308, 520, "Dual Head", x=-880, y=5980, color="ffff6a00")

# Node 521: Int In "Dual Head Mode" (0 = Twin 180°, 1 = Collision Mirror)
dh_mode = clone_node(348, 521, "Dual Head Mode", x=-880, y=6100, color="ffff6a00")
dh_mode["constants"] = {"input": {"type": "integer", "value": 0}}
dh_mode["attributes"]["min"] = {"type": "integer", "value": 0}
dh_mode["attributes"]["max"] = {"type": "integer", "value": 1}
dh_mode["attributes"]["options-count"] = {"type": "integer", "value": 2}
dh_mode["attributes"]["widget"] = {"type": "integer", "value": 1}

# Head 2 Phase generator:
# Path A (Twin 180°): [261].output0 + 0.5 -> Fract
clone_node(261, 522, "Add Half Phase", x=300, y=5550)
nodes["522"]["constants"] = {"input1": {"type": "float", "value": 0.5}}
clone_node(262, 523, "Fract Half Phase", x=440, y=5550)

# Path B (Collision Mirror): 1 - [261].output0 -> Fract
clone_node(135, 524, "Invert Phase (Collision)", x=300, y=5670)
clone_node(262, 525, "Fract Invert Phase", x=440, y=5670)

# Mode Switch (Twin vs Collision)
h2_switch = clone_node(115, 526, "Head 2 Mode Switch", x=580, y=5600)
h2_switch["attributes"]["inlets-count"] = {"type": "integer", "value": 2}

# Duplicate envelope chain for Head 2:
# 530: Subtract (cloned from 351)
clone_node(351, 530, "Subtract Head 2", x=720, y=5600)
# 531: Divide (cloned from 352)
clone_node(352, 531, "Divide Head 2", x=860, y=5600)
# 532: Clamp (cloned from 353)
clone_node(353, 532, "Clamp Head 2 A", x=1000, y=5600)
# 533: Divide (cloned from 366)
clone_node(366, 533, "Divide Head 2 B", x=1140, y=5600)
# 534: Clamp (cloned from 367)
clone_node(367, 534, "Clamp Head 2 B", x=1280, y=5600)

# Head 2 Connections:
conns.append({"from": [261, "output0"], "to": [522, "input0"]})
conns.append({"from": [522, "output0"], "to": [523, "input0"]})
conns.append({"from": [261, "output0"], "to": [524, "input0"]})
conns.append({"from": [524, "output0"], "to": [525, "input0"]})

conns.append({"from": [521, "output"], "to": [526, "selection"]})
conns.append({"from": [523, "output0"], "to": [526, "input0"]})
conns.append({"from": [525, "output0"], "to": [526, "input1"]})

# Envelope inputs for Head 2 (shared width & fade):
conns.append({"from": [526, "output"], "to": [530, "input0"]})
conns.append({"from": [350, "output0"], "to": [530, "input1"]})
conns.append({"from": [530, "output0"], "to": [531, "input0"]})
conns.append({"from": [361, "output0"], "to": [531, "input1"]})
conns.append({"from": [531, "output0"], "to": [532, "value"]})
conns.append({"from": [532, "output0"], "to": [533, "input0"]})
conns.append({"from": [365, "output0"], "to": [533, "input1"]})
conns.append({"from": [533, "output0"], "to": [534, "value"]})

# Head 1 + Head 2 Combiner:
# 540: Add Head 1 + Head 2 (Flash collision)
clone_node(261, 540, "Sum Heads", x=1420, y=5480)
# 541: Clamp (0 to 1)
clone_node(367, 541, "Clamp Combined", x=1560, y=5480)
# 542: Switch (Dual Head On/Off)
dh_switch = clone_node(115, 542, "Dual Head Switch", x=1700, y=5400)
dh_switch["attributes"]["inlets-count"] = {"type": "integer", "value": 2}

conns.append({"from": [367, "output0"], "to": [540, "input0"]})
conns.append({"from": [534, "output0"], "to": [540, "input1"]})
conns.append({"from": [540, "output0"], "to": [541, "value"]})

conns.append({"from": [520, "output"], "to": [542, "selection"]})
conns.append({"from": [367, "output0"], "to": [542, "input0"]}) # Case 0: Head 1 only
conns.append({"from": [541, "output0"], "to": [542, "input1"]}) # Case 1: Head 1 + Head 2

# Rewire downstream: remove old [367].output0 -> [278].input0
conns = [c for c in conns if not (str(c["from"][0]) == "367" and str(c["to"][0]) == "278")]
# Connect Dual Head Switch -> [278].input0
conns.append({"from": [542, "output"], "to": [278, "input0"]})

patch_data["patch"]["nodes"] = nodes
patch_data["patch"]["connections"] = conns

print(f"Final: {len(nodes)} nodes, {len(conns)} connections")

with open(wire_path, "w", encoding="utf-8") as f:
    json.dump(patch_data, f, indent=2, ensure_ascii=False)

print("Saved updated patch to disk successfully!")
