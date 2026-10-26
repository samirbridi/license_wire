import socket
import json

with open('targets/tuya_smartlife/evidence/scan_results.json', 'r', encoding='utf-8') as f:
    devs = json.load(f)

print(f"Testando porta TCP 6668 (Tuya Local) em {len(devs)} dispositivos...")
for ip, d in devs.items():
    raw = d.get("raw", {})
    dev_id = raw.get("id", ip)
    ver = d.get("version", "?")
    pkey = d.get("productKey", "")
    
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1.5)
    res = s.connect_ex((ip, 6668))
    status = "OPEN" if res == 0 else f"CLOSED ({res})"
    print(f"[{status:12}] {ip:15} | ID: {dev_id:24} | v{ver:3} | PK: {pkey}")
    s.close()
