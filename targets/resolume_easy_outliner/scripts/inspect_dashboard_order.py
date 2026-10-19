import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

inputs = wire_bridge.get("/patch/inputs")
items = inputs if isinstance(inputs, list) else inputs.get("items", [])
print(f"Total Inputs: {len(items)}\n")
for idx, inp in enumerate(items):
    nid = inp.get("id")
    name = inp.get("name", "")
    dtype = inp.get("data_type")
    choices = inp.get("choices")
    label = ""
    if choices and len(choices) == 1:
        label = f" [HEADER: {choices[0].get('label')}]"
    print(f"{idx+1:02d}. [ID {nid}] {name} ({dtype}){label}")
