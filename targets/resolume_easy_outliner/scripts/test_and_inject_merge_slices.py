import sys
import json
import urllib.request
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

wire_file = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

def patch_node(nid, payload):
    url = f"http://127.0.0.1:8081/api/v2/patch/nodes/{nid}"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="PATCH")
    with urllib.request.urlopen(req) as resp:
        return resp.status

def inject_merge_slices():
    print("==================================================")
    print("   INJETANDO SUPERPODER: MERGE SLICES (PÓRTICO)   ")
    print("==================================================")
    
    # 1. Cria nó Bool In: "Merge Slices"
    n_ms = wire_bridge.post("/patch/nodes", {"class_id": "77697265-999c-4f8b-8b9d-3646dc68aa69"})
    id_ms = n_ms["id"]
    patch_node(id_ms, {"name": "Merge Slices"})
    print(f"1. Criado nó [{id_ms}] Merge Slices (Bool In)")
    
    # 2. Cria nó Edge Detection
    n_ed = wire_bridge.post("/patch/nodes", {"class_id": "77697265-9df3-4b94-a36d-42f1c6fbe997"})
    id_ed = n_ed["id"]
    patch_node(id_ed, {"name": "Merge Edge Detection"})
    print(f"2. Criado nó [{id_ed}] Merge Edge Detection")
    
    # 3. Cria nó Multiply (para escalar o sample offset da borda mesclada)
    n_mult = wire_bridge.post("/patch/nodes", {"class_id": "77697265-a0d8-429a-a558-69bc58d0d425"})
    id_mult = n_mult["id"]
    patch_node(id_mult, {"name": "Merge Thickness Scale"})
    print(f"3. Criado nó [{id_mult}] Merge Thickness Scale")
    
    # 4. Cria nó Float2 (para sample-offset x, y)
    n_f2 = wire_bridge.post("/patch/nodes", {"class_id": "77697265-e7ef-4944-8fc2-d808ee0433cb"})
    id_f2 = n_f2["id"]
    patch_node(id_f2, {"name": "Merge Sample Offset (Float2)"})
    print(f"4. Criado nó [{id_f2}] Merge Sample Offset")
    
    # 5. Cria nó Switch (Merge Slices Switch)
    n_sw = wire_bridge.post("/patch/nodes", {"class_id": "77697265-6899-4a9c-82ab-949346033440"})
    id_sw = n_sw["id"]
    patch_node(id_sw, {"name": "Merge Slices Switch"})
    print(f"5. Criado nó [{id_sw}] Merge Slices Switch")
    
    # 6. Conecta Edge Detection:
    # [248] Slice Render.output0 -> Edge Detection.input
    wire_bridge.connect(248, "output0", id_ed, "input")
    print("Conectado [248] Slice Render -> Edge Detection.input")
    
    # Conecta Border Width scaling:
    # [26] Border Width.output -> Multiply.input0
    wire_bridge.connect(26, "output", id_mult, "input0")
    # Configura o multiplicador de escala padrão para 15.0
    patch_node(id_mult, {"inlets": [{"id": "input1", "value": 15.0}]})
    
    # Multiply.output0 -> Float2.input0 (X) e Float2.input1 (Y)
    wire_bridge.connect(id_mult, "output0", id_f2, "input0")
    wire_bridge.connect(id_mult, "output0", id_f2, "input1")
    # Float2.output -> Edge Detection.sample-offset
    wire_bridge.connect(id_f2, "output", id_ed, "sample-offset")
    print("Conectado controle de espessura dinâmico ao Edge Detection")
    
    # 7. Conecta Switch:
    # Selection <- Merge Slices (id_ms)
    wire_bridge.connect(id_ms, "output", id_sw, "selection")
    # Case True (input0): Edge Detection (Merged Pórtico)
    wire_bridge.connect(id_ed, "output", id_sw, "input0")
    # Case False (input1): [5] Máscara por Slice.output0 (Normal)
    wire_bridge.connect(5, "output0", id_sw, "input1")
    print("Conectado Merge Slices Switch (input0 = Merged, input1 = Per Slice)")
    
    # 8. Rewire: acha a conexão antiga [5].output0 -> [157].input1 e substitui
    conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
    old_c = None
    for c in conns:
        if c["source"]["node"] == 5 and c["target"]["node"] == 157 and c["target"]["inlet"] == "input1":
            old_c = c
            break
            
    if old_c:
        print(f"Deletando conexao antiga {old_c['id']}: [5] -> [157].input1")
        wire_bridge.delete(f"/patch/connections/{old_c['id']}")
        
    wire_bridge.connect(id_sw, "output", 157, "input1")
    print(f"Conectado [{id_sw}] Merge Slices Switch -> [157].input1 com sucesso!")
    
    # Salva o patch via Wire
    wire_bridge.post("/patch/save", {"overwrite": True})
    print("\nPatch salvo em disco com o novo motor de mescla!")
    
    return id_ms

def update_dashboard_and_buttons(id_ms):
    print("\n--- Atualizando Dashboard e garantindo visualização em Botões ---")
    with open(wire_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    nodes = data["patch"]["nodes"]
    
    # Garante que Border Area (102) tem widget = 0 (Buttons)
    if "102" in nodes:
        nodes["102"]["attributes"]["widget"] = {"type": "integer", "value": 0}
        # Garante que não está escondido ou que está bem configurado
        print("Node 102 configurado explicitamente para 'widget = 0' (Buttons [Full Frame | Slices])")
        
    # Reorganiza o inputOrder para colocar Merge Slices logo após Border Area no grupo INPUT
    ordered_node_ids = [
        # INPUT
        103, # HEADER: INPUT
        92,  # Slices
        102, # Border Area [Full Frame | Slices]
        id_ms, # Merge Slices (NOVO! Modo Pórtico liga/desliga)
        # BORDER
        76, 26, 212,
        # CORNERS
        77, 7, 8, 60, 64, 68, 72,
        # COLORS
        78, 50, 36, 166, 28, 29, 30, 31,
        # EFFECTS
        158, 127, 111, 168, 141, 171, 174,
        # SEGMENT
        245, 349, 219, 220, 221,
        # TRACER
        274, # HEADER: TRACER
        348, 356, 360, 357, 379, 382, 389, 390, 395, 396, 397, 359, 358, 308,
        # RGB SHIFT
        246, 117, 179,
        # GLOW
        244, 123, 186, 211, 190, 191,
        # FOOTER
        79
    ]
    
    new_roots = [{"node": nid} for nid in ordered_node_ids]
    data["patch"]["inputOrder"] = {"groups": {}, "roots": new_roots}
    
    with open(wire_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print("inputOrder atualizado com sucesso. Recarregando patch ao vivo no Wire...")
    wire_bridge.post("/patch/open", {"path": wire_file})
    print("Patch recarregado ao vivo!")

if __name__ == "__main__":
    ms_id = inject_merge_slices()
    update_dashboard_and_buttons(ms_id)
    print("\n✅ MERGE SLICES (MODO PÓRTICO) INJETADO E ATIVADO COM SUCESSO!")
