import sys
import json
import urllib.request
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

def patch_node(nid, payload):
    url = f"http://127.0.0.1:8081/api/v2/patch/nodes/{nid}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return resp.status

def find_conn(src_node, target_node):
    conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
    for c in conns:
        if c["source"]["node"] == src_node and c["target"]["node"] == target_node:
            return c
    return None

def inject_all():
    print("==================================================")
    print("   INJECTING RESOLUME WIRE OUTLINER SUPERPOWERS   ")
    print("==================================================")
    
    # -------------------------------------------------------------
    # 1. SUPERPOWER: DIRECTION CONTROL (Reverse & Ping-Pong)
    # -------------------------------------------------------------
    print("\n--- 1. Injecting Direction Control ---")
    
    # Node: Bool In "Tracer Reverse"
    n_rev = wire_bridge.post("/patch/nodes", {"class_id": "77697265-999c-4f8b-8b9d-3646dc68aa69"})
    id_rev = n_rev["id"]
    patch_node(id_rev, {"name": "Tracer Reverse"})
    print(f"Created node [{id_rev}] Tracer Reverse")
    
    # Node: Bool In "Tracer Ping-Pong"
    n_pp = wire_bridge.post("/patch/nodes", {"class_id": "77697265-999c-4f8b-8b9d-3646dc68aa69"})
    id_pp = n_pp["id"]
    patch_node(id_pp, {"name": "Tracer Ping-Pong"})
    print(f"Created node [{id_pp}] Tracer Ping-Pong")
    
    # Node: 1 - x (Invert Saw ramp)
    n_inv = wire_bridge.post("/patch/nodes", {"class_id": "77697265-326f-4351-83fc-7a7fcfedaffc"})
    id_inv = n_inv["id"]
    patch_node(id_inv, {"name": "Invert Saw (Reverse)"})
    print(f"Created node [{id_inv}] Invert Saw")
    
    # Node: Triangle Oscillator (Ping-Pong)
    n_tri = wire_bridge.post("/patch/nodes", {"class_id": "77697265-9890-41dc-a93d-9f3913a78feb"})
    id_tri = n_tri["id"]
    patch_node(id_tri, {"name": "Triangle Osc (Ping-Pong)"})
    print(f"Created node [{id_tri}] Triangle Oscillator")
    
    # Node: Switch A (Forward vs Reverse)
    n_sw_a = wire_bridge.post("/patch/nodes", {"class_id": "77697265-6899-4a9c-82ab-949346033440"})
    id_sw_a = n_sw_a["id"]
    patch_node(id_sw_a, {"name": "Reverse Switch"})
    print(f"Created node [{id_sw_a}] Reverse Switch")
    
    # Node: Switch B (Saw/Rev vs Ping-Pong)
    n_sw_b = wire_bridge.post("/patch/nodes", {"class_id": "77697265-6899-4a9c-82ab-949346033440"})
    id_sw_b = n_sw_b["id"]
    patch_node(id_sw_b, {"name": "Ping-Pong Switch"})
    print(f"Created node [{id_sw_b}] Ping-Pong Switch")
    
    # Rewire: find old connection [259].output -> [261].input1
    c_259_261 = find_conn(259, 261)
    if c_259_261:
        print(f"Deleting old conn {c_259_261['id']}: [259] -> [261]")
        wire_bridge.delete(f"/patch/connections/{c_259_261['id']}")
        
    # Wire Direction nodes:
    # [362].output0 -> Triangle Osc.frequency
    wire_bridge.connect(362, "output0", id_tri, "frequency")
    # [259].output -> 1 - x.input0
    wire_bridge.connect(259, "output", id_inv, "input0")
    
    # Switch A (Forward / Reverse)
    wire_bridge.connect(id_rev, "output", id_sw_a, "selection")
    wire_bridge.connect(259, "output", id_sw_a, "input0")     # Normal Forward
    wire_bridge.connect(id_inv, "output0", id_sw_a, "input1")  # Inverted Reverse
    
    # Switch B (Ramp / Ping-Pong)
    wire_bridge.connect(id_pp, "output", id_sw_b, "selection")
    wire_bridge.connect(id_sw_a, "output", id_sw_b, "input0")  # Saw or Invert Saw
    wire_bridge.connect(id_tri, "output", id_sw_b, "input1")   # Triangle Ping-Pong
    
    # Output to [261].input1
    wire_bridge.connect(id_sw_b, "output", 261, "input1")
    print("Direction Control connected successfully!")

    # -------------------------------------------------------------
    # 2. SUPERPOWER: DUAL HEAD FLOW & COLLISION
    # -------------------------------------------------------------
    print("\n--- 2. Injecting Dual Head Flow & Collision ---")
    
    # Node: Bool In "Dual Head"
    n_dh = wire_bridge.post("/patch/nodes", {"class_id": "77697265-999c-4f8b-8b9d-3646dc68aa69"})
    id_dh = n_dh["id"]
    patch_node(id_dh, {"name": "Dual Head"})
    print(f"Created node [{id_dh}] Dual Head")
    
    # Node: Bool In "Dual Head Mirror" (Collision mode)
    n_dhm = wire_bridge.post("/patch/nodes", {"class_id": "77697265-999c-4f8b-8b9d-3646dc68aa69"})
    id_dhm = n_dhm["id"]
    patch_node(id_dhm, {"name": "Dual Head Mirror"})
    print(f"Created node [{id_dhm}] Dual Head Mirror")
    
    # Node: Float In "Dual Head Offset" (default 0.5 = 180 degrees)
    n_dho = wire_bridge.post("/patch/nodes", {"class_id": "77697265-d235-4a6a-b661-02abe55c72ff"})
    id_dho = n_dho["id"]
    patch_node(id_dho, {"name": "Dual Head Offset"})
    print(f"Created node [{id_dho}] Dual Head Offset")
    
    # Phase A: Add Head 2 Offset ([261].output0 + Dual Head Offset)
    n_h2_add = wire_bridge.post("/patch/nodes", {"class_id": "77697265-a9af-4cb4-b10f-3968b36bb63b"})
    id_h2_add = n_h2_add["id"]
    patch_node(id_h2_add, {"name": "Add Head 2 Offset"})
    
    # Fract Half Phase
    n_h2_fract = wire_bridge.post("/patch/nodes", {"class_id": "77697265-0b02-4616-ba51-0318a0d55a80"})
    id_h2_fract = n_h2_fract["id"]
    patch_node(id_h2_fract, {"name": "Fract Head 2 Twin"})
    
    # Phase B (Collision Mirror): 1 - [261].output0
    n_h2_inv = wire_bridge.post("/patch/nodes", {"class_id": "77697265-326f-4351-83fc-7a7fcfedaffc"})
    id_h2_inv = n_h2_inv["id"]
    patch_node(id_h2_inv, {"name": "Invert Phase (Mirror Collision)"})
    
    # Mode Switch: Twin 180° vs Mirror Collision
    n_sw_h2_mode = wire_bridge.post("/patch/nodes", {"class_id": "77697265-6899-4a9c-82ab-949346033440"})
    id_sw_h2_mode = n_sw_h2_mode["id"]
    patch_node(id_sw_h2_mode, {"name": "Head 2 Mode Switch"})
    
    # Head 2 Envelope Chain (Subtract, Divide, Clamp, Divide, Clamp)
    n_h2_sub = wire_bridge.post("/patch/nodes", {"class_id": "77697265-2449-4cc3-bdce-bef250835a26"})
    id_h2_sub = n_h2_sub["id"]
    patch_node(id_h2_sub, {"name": "Subtract Head 2"})
    
    n_h2_div1 = wire_bridge.post("/patch/nodes", {"class_id": "77697265-0d55-485e-813d-706dd5dfe88d"})
    id_h2_div1 = n_h2_div1["id"]
    patch_node(id_h2_div1, {"name": "Divide Head 2 A"})
    
    n_h2_clp1 = wire_bridge.post("/patch/nodes", {"class_id": "77697265-7557-4053-abec-73e2a9786804"})
    id_h2_clp1 = n_h2_clp1["id"]
    patch_node(id_h2_clp1, {"name": "Clamp Head 2 A"})
    
    n_h2_div2 = wire_bridge.post("/patch/nodes", {"class_id": "77697265-0d55-485e-813d-706dd5dfe88d"})
    id_h2_div2 = n_h2_div2["id"]
    patch_node(id_h2_div2, {"name": "Divide Head 2 B"})
    
    n_h2_clp2 = wire_bridge.post("/patch/nodes", {"class_id": "77697265-7557-4053-abec-73e2a9786804"})
    id_h2_clp2 = n_h2_clp2["id"]
    patch_node(id_h2_clp2, {"name": "Clamp Head 2 B (Output)"})
    
    # Combiner: Add Head 1 + Head 2 (Additive collision flash)
    n_sum = wire_bridge.post("/patch/nodes", {"class_id": "77697265-a9af-4cb4-b10f-3968b36bb63b"})
    id_sum = n_sum["id"]
    patch_node(id_sum, {"name": "Sum Heads (Collision Flash)"})
    
    n_clp_comb = wire_bridge.post("/patch/nodes", {"class_id": "77697265-7557-4053-abec-73e2a9786804"})
    id_clp_comb = n_clp_comb["id"]
    patch_node(id_clp_comb, {"name": "Clamp Combined"})
    
    # Master Dual Head Switch: Single Head vs Dual Head
    n_sw_dh = wire_bridge.post("/patch/nodes", {"class_id": "77697265-6899-4a9c-82ab-949346033440"})
    id_sw_dh = n_sw_dh["id"]
    patch_node(id_sw_dh, {"name": "Dual Head Switch"})
    
    # Wire Phase generators:
    # 1. Twin 180°: [261].output0 + Dual Head Offset -> Fract
    wire_bridge.connect(261, "output0", id_h2_add, "input0")
    wire_bridge.connect(id_dho, "output", id_h2_add, "input1")
    wire_bridge.connect(id_h2_add, "output0", id_h2_fract, "input0")
    
    # 2. Mirror Collision: 1 - [261].output0
    wire_bridge.connect(261, "output0", id_h2_inv, "input0")
    
    # Head 2 Mode Switch:
    wire_bridge.connect(id_dhm, "output", id_sw_h2_mode, "selection")
    wire_bridge.connect(id_h2_fract, "output0", id_sw_h2_mode, "input0") # Twin
    wire_bridge.connect(id_h2_inv, "output0", id_sw_h2_mode, "input1")   # Mirror
    
    # Head 2 Envelope:
    # Subtract (Phase - Offset [350])
    wire_bridge.connect(id_sw_h2_mode, "output", id_h2_sub, "input0")
    wire_bridge.connect(350, "output0", id_h2_sub, "input1")
    # Divide A
    wire_bridge.connect(id_h2_sub, "output0", id_h2_div1, "input0")
    wire_bridge.connect(361, "output0", id_h2_div1, "input1")
    # Clamp A
    wire_bridge.connect(id_h2_div1, "output0", id_h2_clp1, "value")
    # Divide B
    wire_bridge.connect(id_h2_clp1, "output0", id_h2_div2, "input0")
    wire_bridge.connect(365, "output0", id_h2_div2, "input1")
    # Clamp B
    wire_bridge.connect(id_h2_div2, "output0", id_h2_clp2, "value")
    
    # Combine Head 1 [367] and Head 2 [id_h2_clp2]:
    wire_bridge.connect(367, "output0", id_sum, "input0")
    wire_bridge.connect(id_h2_clp2, "output0", id_sum, "input1")
    wire_bridge.connect(id_sum, "output0", id_clp_comb, "value")
    
    # Master Dual Head Switch:
    wire_bridge.connect(id_dh, "output", id_sw_dh, "selection")
    wire_bridge.connect(367, "output0", id_sw_dh, "input0")        # Case 0: Single Head
    wire_bridge.connect(id_clp_comb, "output0", id_sw_dh, "input1") # Case 1: Dual Head
    
    # Rewire [367] -> [278]
    c_367_278 = find_conn(367, 278)
    if c_367_278:
        print(f"Deleting old conn {c_367_278['id']}: [367] -> [278]")
        wire_bridge.delete(f"/patch/connections/{c_367_278['id']}")
        
    wire_bridge.connect(id_sw_dh, "output", 278, "input0")
    print("Dual Head Flow & Collision connected successfully!")
    
    # -------------------------------------------------------------
    # SAVE & PERSIST TO DISK VIA LIVE WIRE
    # -------------------------------------------------------------
    print("\n--- Persisting changes to disk via Wire REST API ---")
    wire_bridge.post("/patch/save", {"overwrite": True})
    print("ALL SUPERPOWERS SUCCESSFULLY INJECTED AND PERSISTED TO DISK!")

if __name__ == "__main__":
    inject_all()
