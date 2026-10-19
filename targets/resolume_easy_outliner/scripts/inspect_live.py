import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.path.append(r"targets\resolume_easy_outliner\scripts")
import wire_bridge

def inspect_live():
    product = wire_bridge.get("/product")
    print(f"Wire Product: {product['name']} {product['major']}.{product['minor']}.{product['micro']}")
    
    inputs = wire_bridge.get("/patch/inputs")
    items = inputs if isinstance(inputs, list) else inputs.get("items", [])
    print(f"Exposed Parameters in Arena ({len(items)}):")
    for inp in items:
        name = inp.get("name", "Unnamed")
        dtype = inp.get("bundle", {}).get("data_type", "unknown")
        val = inp.get("value", "")
        print(f"  * {name} ({dtype}) = {val}")

if __name__ == "__main__":
    inspect_live()
