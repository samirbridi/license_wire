import sys
import json
import urllib.request
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

def patch_req(ep, data):
    url = f"http://127.0.0.1:8081/api/v2{ep}"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return resp.status

def inject_bpm_sync():
    print("--- 1. Injecting BPM Sync live ---")
    
    # 1. Create Bool In: "BPM Sync"
    n_bool = wire_bridge.post("/patch/nodes", {"class_id": "77697265-999C-4F8B-8B9D-3646DC68AA69"})
    id_bool = n_bool["id"]
    patch_req(f"/patch/nodes/{id_bool}", {"name": "BPM Sync"})
    print(f"Created node [{id_bool}] BPM Sync")
    
    # 2. Create Transport Info
    n_trans = wire_bridge.post("/patch/nodes", {"class_id": "77697265-66b1-4c28-a5a9-1f64026d769b"})
    id_trans = n_trans["id"]
    print(f"Created node [{id_trans}] Transport Info")
    
    # 3. Create Bpm to Frequency
    n_bpm2f = wire_bridge.post("/patch/nodes", {"class_id": "77697265-d6a0-423f-99f8-608fa5e03e97"})
    id_bpm2f = n_bpm2f["id"]
    print(f"Created node [{id_bpm2f}] Bpm to Frequency")
    
    # 4. Create Float In: "BPM Multiplier"
    n_mult_in = wire_bridge.post("/patch/nodes", {"class_id": "77697265-d235-4a6a-b661-02abe55c72ff"})
    id_mult_in = n_mult_in["id"]
    patch_req(f"/patch/nodes/{id_mult_in}", {"name": "BPM Multiplier"})
    print(f"Created node [{id_mult_in}] BPM Multiplier")
    
    # 5. Create Multiply
    n_mult = wire_bridge.post("/patch/nodes", {"class_id": "77697265-A0D8-429A-A558-69BC58D0D425"})
    id_mult = n_mult["id"]
    print(f"Created node [{id_mult}] Multiply")
    
    # 6. Create Switch
    n_switch = wire_bridge.post("/patch/nodes", {"class_id": "77697265-6899-4A9C-82AB-949346033440"})
    id_switch = n_switch["id"]
    patch_req(f"/patch/nodes/{id_switch}", {"name": "BPM Switch"})
    print(f"Created node [{id_switch}] BPM Switch")
    
    # Find live connection between [357] and [362]
    conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
    old_conn = None
    for c in conns:
        if c["source"]["node"] == 357 and c["target"]["node"] == 362:
            old_conn = c
            break
            
    if old_conn:
        print(f"Deleting old connection {old_conn['id']}: [357].output -> [362].input1")
        wire_bridge.delete(f"/patch/connections/{old_conn['id']}")
    else:
        print("Warning: Connection [357] -> [362] not found!")
        
    # Wire up the new connections
    # 1. Transport Info.bpm -> Bpm to Frequency.input0
    c1 = wire_bridge.connect(id_trans, "bpm", id_bpm2f, "input0")
    print("Connected Transport Info -> Bpm to Frequency")
    
    # 2. Bpm to Frequency.output0 -> Multiply.input0
    c2 = wire_bridge.connect(id_bpm2f, "output0", id_mult, "input0")
    print("Connected Bpm to Frequency -> Multiply.input0")
    
    # 3. BPM Multiplier.output -> Multiply.input1
    c3 = wire_bridge.connect(id_mult_in, "output", id_mult, "input1")
    print("Connected BPM Multiplier -> Multiply.input1")
    
    # 4. BPM Sync.output -> Switch.selection
    c4 = wire_bridge.connect(id_bool, "output", id_switch, "selection")
    print("Connected BPM Sync -> Switch.selection")
    
    # 5. [357] Tracer Speed.output -> Switch.input0 (Case 0: Manual)
    c5 = wire_bridge.connect(357, "output", id_switch, "input0")
    print("Connected Tracer Speed -> Switch.input0")
    
    # 6. Multiply.output0 -> Switch.input1 (Case 1: BPM Sync)
    c6 = wire_bridge.connect(id_mult, "output0", id_switch, "input1")
    print("Connected Multiply -> Switch.input1")
    
    # 7. Switch.output -> [362] Multiply.input1
    c7 = wire_bridge.connect(id_switch, "output", 362, "input1")
    print("Connected Switch -> [362] Multiply.input1")
    
    print("\nBPM Sync injection completed successfully!")
    
    # Save patch natively via Wire
    wire_bridge.post("/patch/save", {"overwrite": True})
    print("Saved patch natively to disk!")

if __name__ == "__main__":
    inject_bpm_sync()
