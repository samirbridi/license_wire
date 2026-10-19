import urllib.request
import urllib.parse
import json
import sys

API_BASE = "http://127.0.0.1:8081/api/v2"

def get(path):
    url = f"{API_BASE}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def post(path, data=None):
    url = f"{API_BASE}{path}"
    body = json.dumps(data).encode("utf-8") if data is not None else b"{}"
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            return json.loads(content.decode("utf-8")) if content else {}
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8")
        print(f"HTTPError on POST {path} ({e.code}): {err_msg}")
        raise

def delete(path):
    url = f"{API_BASE}{path}"
    req = urllib.request.Request(url, method="DELETE")
    with urllib.request.urlopen(req) as resp:
        return resp.status

def query_classes(search_term=""):
    data = get("/classes?limit=500")
    items = data.get("items", []) if isinstance(data, dict) else data
    if search_term:
        term = search_term.lower()
        return [c for c in items if term in c.get("name", "").lower()]
    return items

def get_current_patch():
    return get("/patch")

def create_node(class_id, x=0, y=0):
    return post("/patch/nodes", {"class": class_id, "position": {"x": x, "y": y}})

def connect(from_node_id, from_outlet, to_node_id, to_inlet):
    payload = {
        "source": {"node": from_node_id, "outlet": from_outlet},
        "target": {"node": to_node_id, "inlet": to_inlet}
    }
    return post("/patch/connections", payload)

if __name__ == "__main__":
    product = get("/product")
    print(f"Connected to Wire {product['major']}.{product['minor']}.{product['micro']} (rev {product['revision']})")
    
    current_patch = get_current_patch()
    print(f"Patch name: {current_patch.get('name') or 'Untitled'}")
    print(f"Nodes in open patch: {len(current_patch.get('nodes', []))}")
    
    print("\nRelevant Node Classes for Outliner:")
    for term in ["slice", "edge", "pie", "saw", "bloom", "shape render", "texture out"]:
        res = query_classes(term)
        for c in res:
            print(f"  [{c['name']}] ID: {c['id']} (Category: {c.get('category', '')})")
