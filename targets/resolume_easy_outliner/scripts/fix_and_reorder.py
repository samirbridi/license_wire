import sys
import json
import urllib.request
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

wire_file = r"C:\Users\Avell Mizin\Documents\Resolume Wire\Patches\SliceOutliner Pro v2\SliceOutliner Pro v2.wire"

def fix_switches():
    print("--- 1. Corrigindo polaridade de todos os 5 Switches ---")
    conns = wire_bridge.get("/patch/connections?limit=1000").get("items", [])
    
    # Mapeamento dos switches e quais nós devem ir em input0 (True) e input1 (False)
    # Formato: target_node: { "input0": (src_node, outlet), "input1": (src_node, outlet) }
    switch_fixes = {
        384: { # BPM Switch
            "desc": "BPM Switch",
            "input0": (383, "output0"), # Case True: BPM Multiply
            "input1": (357, "output")    # Case False: Manual Tracer Speed
        },
        393: { # Reverse Switch
            "desc": "Reverse Switch",
            "input0": (391, "output0"), # Case True: Inverted Saw
            "input1": (259, "output")    # Case False: Normal Saw
        },
        394: { # Ping-Pong Switch
            "desc": "Ping-Pong Switch",
            "input0": (392, "output"),  # Case True: Triangle Osc
            "input1": (393, "output")   # Case False: Saw / Rev Saw
        },
        401: { # Head 2 Mode Switch
            "desc": "Head 2 Mode Switch",
            "input0": (400, "output0"), # Case True: Mirror Collision
            "input1": (399, "output0")  # Case False: Twin 180°
        },
        409: { # Dual Head Switch
            "desc": "Dual Head Switch",
            "input0": (408, "output0"), # Case True: Combined Heads
            "input1": (367, "output0")  # Case False: Single Head
        }
    }
    
    # Deleta as conexões atuais dos inlets input0 e input1 desses switches
    for c in conns:
        t_node = c["target"]["node"]
        t_inlet = c["target"]["inlet"]
        if t_node in switch_fixes and t_inlet in ["input0", "input1"]:
            cid = c["id"]
            print(f"Deletando conexao antiga {cid}: [{c['source']['node']}].{c['source']['outlet']} -> [{t_node}].{t_inlet}")
            wire_bridge.delete(f"/patch/connections/{cid}")
            
    # Cria as conexões corrigidas
    for sw_id, spec in switch_fixes.items():
        # input0 (True)
        s0_node, s0_outlet = spec["input0"]
        c0 = wire_bridge.connect(s0_node, s0_outlet, sw_id, "input0")
        print(f"[{spec['desc']}] Conectado Case True (input0): [{s0_node}].{s0_outlet} -> [{sw_id}].input0")
        
        # input1 (False)
        s1_node, s1_outlet = spec["input1"]
        c1 = wire_bridge.connect(s1_node, s1_outlet, sw_id, "input1")
        print(f"[{spec['desc']}] Conectado Case False (input1): [{s1_node}].{s1_outlet} -> [{sw_id}].input1")
        
    print("\nTodos os switches foram corrigidos e invertidos com sucesso!")

def fix_metadata_and_dashboard():
    print("\n--- 2. Organizando Dashboard e removendo build do Autor/Versão ---")
    # Salva o patch via Wire primeiro
    wire_bridge.post("/patch/save", {"overwrite": True})
    
    # Carrega o JSON do arquivo para reordenar inputOrder e atualizar Node 79
    with open(wire_file, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    nodes = data["patch"]["nodes"]
    
    # 1. Atualiza Node 79 (remover ' | build 021')
    if "79" in nodes:
        n79 = nodes["79"]
        clean_label = "by Mizin  |  v2.9.0"
        
        # Atualiza option0-label
        if "option0-label" in n79.get("constants", {}):
            n79["constants"]["option0-label"]["value"] = clean_label
            
        # Atualiza attributes
        if "option0-label" in n79.get("attributes", {}):
            n79["attributes"]["option0-label"]["value"] = clean_label
            
        # Atualiza inlets constants se existirem
        for k in list(n79.get("constants", {}).keys()):
            if "option" in k and isinstance(n79["constants"][k], dict) and "build" in str(n79["constants"][k].get("value")):
                n79["constants"][k]["value"] = clean_label
                
        print(f"Node 79 atualizado para: '{clean_label}'")
        
    # 2. Reordena inputOrder
    # Queremos o dashboard perfeitamente agrupado:
    # INPUT -> BORDER -> CORNERS -> COLORS -> EFFECTS -> SEGMENT -> TRACER (com superpoderes) -> RGB SHIFT -> GLOW -> FOOTER
    
    # Nova ordem exata:
    ordered_node_ids = [
        # INPUT
        103, 92, 102,
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
        # TRACER (Com todos os controles e novos superpoderes organizados!)
        274, # HEADER: TRACER
        348, # Tracer Count
        356, # Tracer Length
        360, # Tracer Fade
        357, # Tracer Speed (Manual)
        379, # BPM Sync (Toggle)
        382, # BPM Multiplier (Slider)
        389, # Tracer Reverse (Toggle)
        390, # Tracer Ping-Pong (Toggle)
        395, # Dual Head (Toggle)
        396, # Dual Head Mirror (Toggle)
        397, # Dual Head Offset (Slider)
        359, # Tracer Slice Spread
        358, # Tracer Base
        308, # Tracer Random
        # RGB SHIFT
        246, 117, 179,
        # GLOW
        244, 123, 186, 211, 190, 191,
        # FOOTER (No final absoluto do painel!)
        79
    ]
    
    new_roots = [{"node": nid} for nid in ordered_node_ids]
    data["patch"]["inputOrder"] = {"groups": {}, "roots": new_roots}
    print(f"inputOrder reorganizado com {len(new_roots)} parâmetros ordenados!")
    
    with open(wire_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        
    print("Salvo em disco. Recarregando patch ao vivo no Wire...")
    wire_bridge.post("/patch/open", {"path": wire_file})
    print("Patch recarregado ao vivo no Wire com sucesso!")

if __name__ == "__main__":
    fix_switches()
    fix_metadata_and_dashboard()
    print("\n✅ TODAS AS CORREÇÕES FORAM APLICADAS COM SUCESSO!")
