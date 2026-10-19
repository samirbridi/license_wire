import json
import os
import sys
sys.stdout.reconfigure(encoding='utf-8')

wire_path = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

with open(wire_path, "r", encoding="utf-8") as f:
    patch_data = json.load(f)

nodes = patch_data["patch"]["nodes"]
conns = patch_data["patch"]["connections"]

print(f"Initial State: {len(nodes)} nodes, {len(conns)} connections")

# --- 1. SUPERPOWER: BPM SYNC ---
# Node 410: "BPM Sync" (Bool parameter)
nodes["410"] = {
    "attributes": {
        "bool-view": {"type": "integer", "value": 0},
        "flow": {"type": "flow", "value": "signal"},
        "instances": {"type": "integer", "value": 1}
    },
    "bounds": {"height": 80, "width": 130, "x": -877, "y": 5650},
    "class": {"id": "77697265-999C-4F8B-8B9D-3646DC68AA69", "version": 2},
    "clock": "video",
    "color": "ffff6a00",
    "constants": {"input": {"type": "bool", "value": False}},
    "hidden": ["bool-view", "flow", "input", "instances"],
    "name": "BPM Sync",
    "thumbnail_visible": True
}

# Node 411: "Transport Info"
nodes["411"] = {
    "attributes": {"flow": {"type": "flow", "value": "signal"}},
    "bounds": {"height": 90, "width": 140, "x": -700, "y": 5650},
    "class": {"id": "77697265-66b1-4c28-a5a9-1f64026d769b", "version": 1},
    "clock": "video",
    "color": "ff00a2ff",
    "constants": {},
    "hidden": [],
    "name": "Transport Info",
    "thumbnail_visible": False
}

# Node 412: "Bpm to Frequency"
nodes["412"] = {
    "attributes": {"flow": {"type": "flow", "value": "signal"}},
    "bounds": {"height": 80, "width": 130, "x": -530, "y": 5650},
    "class": {"id": "77697265-d6a0-423f-99f8-608fa5e03e97", "version": 1},
    "clock": "video",
    "color": "ff00a2ff",
    "constants": {},
    "hidden": [],
    "name": "Bpm to Frequency",
    "thumbnail_visible": False
}

# Node 413: "Switch" (Manual Speed vs BPM Frequency)
nodes["413"] = {
    "attributes": {
        "flow": {"type": "flow", "value": "signal"},
        "inlets-count": {"type": "integer", "value": 2},
        "instances": {"type": "integer", "value": 1}
    },
    "bounds": {"height": 100, "width": 130, "x": -370, "y": 5530},
    "class": {"id": "77697265-6899-4A9C-82AB-949346033440", "version": 4},
    "clock": "video",
    "color": "ff00a2ff",
    "constants": {},
    "hidden": [],
    "name": "BPM Switch",
    "thumbnail_visible": False
}

# Rewire Tracer Speed -> BPM Switch -> Node 362
# Remove existing connection [357].output -> [362].input1
conns = [c for c in conns if not (str(c["from"][0]) == "357" and str(c["to"][0]) == "362")]

# Add new connections for BPM Sync
conns.append({"from": [411, "bpm"], "to": [412, "input0"]})
conns.append({"from": [410, "output"], "to": [413, "selection"]})
conns.append({"from": [357, "output"], "to": [413, "input0"]})
conns.append({"from": [412, "output0"], "to": [413, "input1"]})
conns.append({"from": [413, "output0"], "to": [362, "input1"]})

# --- 2. SUPERPOWER: DIRECTION CONTROL (Clockwise / Counter-Clockwise / Ping-Pong) ---
# Node 420: "Tracer Direction" (Int parameter: 0 = Clockwise, 1 = Counter-Clockwise, 2 = Ping-Pong)
nodes["420"] = {
    "attributes": {
        "flow": {"type": "flow", "value": "signal"},
        "has-max": {"type": "bool", "value": True},
        "has-min": {"type": "bool", "value": True},
        "instances": {"type": "integer", "value": 1},
        "max": {"type": "integer", "value": 2},
        "min": {"type": "integer", "value": 0},
        "options-count": {"type": "integer", "value": 3},
        "unit": {"type": "integer", "value": 0},
        "widget": {"type": "integer", "value": 1}
    },
    "bounds": {"height": 85, "width": 130, "x": -877, "y": 5770},
    "class": {"id": "77697265-2649-4abb-b38f-4e1005183415", "version": 3},
    "clock": "video",
    "color": "ffff6a00",
    "constants": {"input": {"type": "integer", "value": 0}},
    "hidden": ["flow", "has-max", "has-min", "input", "instances", "max", "min", "options-count", "unit", "widget"],
    "name": "Tracer Direction",
    "thumbnail_visible": True
}

# Node 421: "Triangle Oscillator"
nodes["421"] = {
    "attributes": {
        "flow": {"type": "flow", "value": "signal"},
        "instances": {"type": "integer", "value": 1}
    },
    "bounds": {"height": 80, "width": 130, "x": -150, "y": 5420},
    "class": {"id": "77697265-9890-41DC-A93D-9F3913A78FEB", "version": 1},
    "clock": "video",
    "color": "ff00a2ff",
    "constants": {},
    "hidden": [],
    "name": "Triangle Oscillator",
    "thumbnail_visible": False
}

# Node 422: "1 - x" (Inverted Saw for counter-clockwise)
nodes["422"] = {
    "attributes": {
        "flow": {"type": "flow", "value": "signal"},
        "instances": {"type": "integer", "value": 1}
    },
    "bounds": {"height": 80, "width": 130, "x": -150, "y": 5510},
    "class": {"id": "77697265-326F-4351-83FC-7A7FCFEDAFFC", "version": 1},
    "clock": "video",
    "color": "ff00a2ff",
    "constants": {},
    "hidden": [],
    "name": "Invert Saw",
    "thumbnail_visible": False
}

# Node 423: "Direction Switch" (3 inputs: Saw, Invert Saw, Triangle)
nodes["423"] = {
    "attributes": {
        "flow": {"type": "flow", "value": "signal"},
        "inlets-count": {"type": "integer", "value": 3},
        "instances": {"type": "integer", "value": 1}
    },
    "bounds": {"height": 110, "width": 130, "x": 10, "y": 5460},
    "class": {"id": "77697265-6899-4A9C-82AB-949346033440", "version": 4},
    "clock": "video",
    "color": "ff00a2ff",
    "constants": {},
    "hidden": [],
    "name": "Direction Switch",
    "thumbnail_visible": False
}

# Rewire: [362].output0 also feeds [421] Triangle Oscillator frequency
conns.append({"from": [362, "output0"], "to": [421, "frequency"]})
# [259] Saw Oscillator.output -> [422] Invert Saw.input0
conns.append({"from": [259, "output"], "to": [422, "input0"]})
# Switch inputs
conns.append({"from": [420, "output"], "to": [423, "selection"]})
conns.append({"from": [259, "output"], "to": [423, "input0"]})
conns.append({"from": [422, "output0"], "to": [423, "input1"]})
conns.append({"from": [421, "output"], "to": [423, "input2"]})

# Remove existing connection [259].output -> [261].input1
conns = [c for c in conns if not (str(c["from"][0]) == "259" and str(c["to"][0]) == "261")]
# Connect Direction Switch -> [261].input1
conns.append({"from": [423, "output0"], "to": [261, "input1"]})

patch_data["patch"]["nodes"] = nodes
patch_data["patch"]["connections"] = conns

print(f"Updated State: {len(nodes)} nodes, {len(conns)} connections")

with open(wire_path, "w", encoding="utf-8") as f:
    json.dump(patch_data, f, indent=2, ensure_ascii=False)

print("Saved updated patch to disk successfully!")
