import subprocess
import json
import urllib.request

API_BASE = "http://127.0.0.1:8081/api/v2"

def rest_get(path):
    url = f"{API_BASE}{path}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def rest_post(path, data=None):
    url = f"{API_BASE}{path}"
    body = json.dumps(data).encode("utf-8") if data is not None else b"{}"
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def inspect_mcp():
    server_exe = r"C:\Program Files\Resolume Wire\mcp\resolume_wire_mcp_server.exe"
    proc = subprocess.Popen([server_exe, "-v"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    
    init_req = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "AntigravityWireBridge", "version": "1.0"}
        }
    }
    proc.stdin.write(json.dumps(init_req) + "\n")
    proc.stdin.flush()
    line1 = proc.stdout.readline()
    print("MCP Init Response:", line1.strip())
    
    # Send initialized notification
    proc.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
    proc.stdin.flush()
    
    # Request tools
    proc.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}) + "\n")
    proc.stdin.flush()
    
    line2 = proc.stdout.readline()
    print("MCP Tools Response:", line2.strip()[:200])
    try:
        t_data = json.loads(line2)
        tools = t_data.get("result", {}).get("tools", [])
        print(f"Total Tools: {len(tools)}")
        for t in tools:
            print(f"  * {t['name']}")
    except Exception as e:
        print("Parse error:", e)
        print("Stderr:", proc.stderr.read())
        
    proc.terminate()

if __name__ == "__main__":
    inspect_mcp()
