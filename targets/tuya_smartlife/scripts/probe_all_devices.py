"""
Sondagem aprofundada de todos os 41 dispositivos identificados na rede 192.168.1.x:
1. Varredura ampla de portas IoT (80, 443, 554, 1883, 6668, 8080, 8443, 8008, 8009, 6667, 7000).
2. Captura de títulos HTTP / banners para identificar exatamente quem é quem.
3. Consulta de nomes mDNS / NetBIOS.
4. Identificação de todos os dispositivos Tuya e candidatos Espressif.
"""

import sys
import json
import socket
import urllib.request
from concurrent.futures import ThreadPoolExecutor

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

with open("targets/tuya_smartlife/evidence/deep_scan_network.json", "r", encoding="utf-8") as f:
    network_devices = json.load(f)

print("=" * 70)
print(f"🔬 SONDAGEM DETALHADA DE {len(network_devices)} DISPOSITIVOS DA REDE")
print("=" * 70)

PORTS = [80, 443, 554, 1883, 6668, 8080, 8008, 8009]

def probe_http(ip, port):
    url = f"http://{ip}:{port}/"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            content = resp.read(2048).decode('utf-8', errors='ignore')
            title = ""
            if "<title>" in content.lower():
                start = content.lower().find("<title>") + 7
                end = content.lower().find("</title>", start)
                if end != -1:
                    title = content[start:end].strip()
            server = resp.headers.get("Server", "")
            return f"HTTP {port} [{server}] Title: {title}" if title or server else f"HTTP {port} OK"
    except Exception as e:
        return ""

def probe_device(d):
    ip = d["ip"]
    mac = d.get("mac", "")
    vendor = d.get("vendor", "")
    
    open_ports = []
    for p in PORTS:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.5)
            if s.connect_ex((ip, p)) == 0:
                open_ports.append(p)
            s.close()
        except:
            pass
            
    # Tenta banner HTTP se porta 80 ou 8080 aberta
    http_info = ""
    for hp in [80, 8080]:
        if hp in open_ports:
            info = probe_http(ip, hp)
            if info:
                http_info = info
                break
                
    # Tenta nome NetBIOS / Hostname
    hostname = ""
    try:
        hostname = socket.gethostbyaddr(ip)[0]
    except:
        pass
        
    return {
        "ip": ip,
        "mac": mac,
        "vendor": vendor,
        "open_ports": open_ports,
        "http_info": http_info,
        "hostname": hostname,
        "tuya": d.get("tuya")
    }

results = []
with ThreadPoolExecutor(max_workers=20) as executor:
    futures = [executor.submit(probe_device, d) for d in network_devices]
    for f in futures:
        results.append(f.result())

# Ordena por IP
results.sort(key=lambda x: [int(p) for p in x["ip"].split(".")])

tuya_count = 0
print(f"\n{'IP':15} | {'MAC':17} | {'PORTAS':18} | {'IDENTIFICAÇÃO / DETALHES'}")
print("-" * 80)
for r in results:
    ip = r["ip"]
    mac = r["mac"]
    ports = ",".join(str(p) for p in r["open_ports"]) if r["open_ports"] else "nenhuma"
    
    # Classificação
    tuya_data = r.get("tuya")
    is_tuya = (6668 in r["open_ports"]) or (tuya_data is not None) or ("Tuya" in r["vendor"])
    
    desc = []
    if tuya_data:
        tuya_count += 1
        pk = tuya_data.get("productKey", "")
        v = tuya_data.get("version", "")
        gwId = tuya_data.get("gwId", "")
        desc.append(f"TUYA v{v} (ID: {gwId[:10]}... PK: {pk})")
    elif 6668 in r["open_ports"]:
        tuya_count += 1
        desc.append(f"TUYA LOCAL (Porta 6668 Aberta)")
    elif "Espressif" in r["vendor"]:
        desc.append("ESPRESSIF (Possível Tuya/Sonoff)")
    elif "Xiaomi" in r["vendor"]:
        desc.append(f"XIAOMI ({r['vendor']})")
    else:
        desc.append(r["vendor"])
        
    if r["hostname"]:
        desc.append(f"Host: {r['hostname']}")
    if r["http_info"]:
        desc.append(f"[{r['http_info']}]")
        
    badge = " [TUYA]" if is_tuya else ""
    print(f"{ip:15} | {mac:17} | {ports:18} | {' | '.join(desc)}{badge}")

print("-" * 80)
print(f"[+] Total de dispositivos Tuya/SmartLife confirmados na rede: {tuya_count}")

with open("targets/tuya_smartlife/evidence/probe_summary.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)
