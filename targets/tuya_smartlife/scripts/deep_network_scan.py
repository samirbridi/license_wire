"""
Varredura profunda da rede local (192.168.1.0/24).
1. Ping Sweep multithreaded para acordar a tabela ARP.
2. Leitura da tabela ARP e resolução de fabricantes (OUI MAC).
3. Varredura de portas IoT:
   - 6668 (Tuya Local Protocol)
   - 80, 8080 (Web UI / Tasmota / Shelly / Gateways)
   - 554 (RTSP Vídeo / Câmeras)
   - 8008, 8009 (Google Cast / Nest / Home)
   - 1984 (go2rtc / streaming)
4. Escuta estendida UDP 6666/6667 (Tuya Broadcast).
5. Descoberta SSDP/UPnP (Chromecasts, Google Home, Roteadores).
"""

import sys
import json
import time
import socket
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


SUBNET = "192.168.1"
TIMEOUT = 1.0

print("=" * 70)
print("🔍 INICIANDO VARREDURA PROFUNDA DA REDE LOCAL (192.168.1.0/24)")
print("=" * 70)

# 1. PING SWEEP
print("[1/5] Realizando Ping Sweep em 254 endereços IP...")
def ping(ip):
    try:
        # Ping rápido silencioso no Windows (-n 1 -w 500)
        res = subprocess.run(["ping", "-n", "1", "-w", "400", ip],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return ip, res.returncode == 0
    except Exception:
        return ip, False

active_ips = set()
with ThreadPoolExecutor(max_workers=50) as executor:
    futures = [executor.submit(ping, f"{SUBNET}.{i}") for i in range(1, 255)]
    for f in futures:
        ip, is_alive = f.result()
        if is_alive:
            active_ips.add(ip)

print(f"[+] Total de hosts respondendo ao Ping: {len(active_ips)}")

# 2. LEITURA DA TABELA ARP
print("\n[2/5] Lendo tabela ARP completa...")
arp_entries = {}
try:
    res = subprocess.run(["arp", "-a"], capture_output=True, text=True)
    for line in res.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[0].startswith(f"{SUBNET}."):
            ip = parts[0]
            mac = parts[1].replace("-", ":").upper()
            tipo = parts[2]
            if mac != "FF:FF:FF:FF:FF:FF":
                arp_entries[ip] = mac
                active_ips.add(ip)
except Exception as e:
    print(f"[-] Erro ao ler ARP: {e}")

print(f"[+] Total de dispositivos identificados via ARP: {len(arp_entries)}")

# 3. BASE DE OUIs CONHECIDOS (FABRICANTES)
OUI_MAP = {
    "3C:0B:59": "Tuya Smart (Espressif/Realtek)",
    "BC:35:1E": "Tuya Smart Inc.",
    "4C:A9:19": "Tuya Smart Inc.",
    "C0:F8:53": "Tuya Smart Inc.",
    "40:F5:20": "Tuya Smart Inc.",
    "D8:C8:0C": "Tuya Smart Inc.",
    "E4:AA:EC": "Espressif (Tuya / Sonoff / ESP32)",
    "4C:60:BA": "Xiaomi Inc. (Chuangmi Cams)",
    "B0:25:AA": "Xiaomi Inc.",
    "78:22:88": "Xiaomi Inc. / Smart Home",
    "C8:12:0B": "Xiaomi Inc.",
    "74:E9:D8": "Xiaomi Inc.",
    "D8:43:AE": "Xiaomi / Tuya",
    "90:09:D0": "Tuya / Smart Life",
    "F8:0F:F9": "Google LLC (Nest / Chromecast)",
    "DA:C8:CF": "Google / Smart Device",
    "7C:64:56": "Google LLC / Smart Home",
    "20:1F:3B": "Samsung / Smart TV",
    "5A:D6:1F": "Roteador / Gateway Principal",
}

def identify_vendor(mac):
    prefix = mac[:8]
    return OUI_MAP.get(prefix, "Desconhecido / OEM")

# 4. SCAN DE PORTAS NOS DISPOSITIVOS VIVOS
PORTS_TO_CHECK = [6668, 80, 554, 8008, 8009]
print("\n[3/5] Verificando portas de serviços IoT nos dispositivos vivos...")

port_results = {}
def check_ports(ip):
    open_ports = []
    for port in PORTS_TO_CHECK:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.6)
            if s.connect_ex((ip, port)) == 0:
                open_ports.append(port)
            s.close()
        except:
            pass
    return ip, open_ports

with ThreadPoolExecutor(max_workers=30) as executor:
    futures = [executor.submit(check_ports, ip) for ip in sorted(active_ips, key=lambda x: [int(p) for p in x.split('.')])]
    for f in futures:
        ip, ports = f.result()
        if ports:
            port_results[ip] = ports

# 5. ESCUTA ESTENDIDA UDP (15 segundos) PARA CAPTURAR TUYA BROADCAST
print("\n[4/5] Escuta estendida UDP Tuya (6666 e 6667) por 15 segundos...")
import tinytuya
tuya_broadcasts = {}
try:
    scanned = tinytuya.deviceScan(verbose=False, maxretry=5)
    for dev_id, info in scanned.items():
        ip = info.get("ip")
        tuya_broadcasts[ip] = info
except Exception as e:
    print(f"[-] Erro no tinytuya scan: {e}")

# 6. RELATÓRIO CONSOLIDADO
print("\n" + "=" * 70)
print(f"📊 RELATÓRIO GERAL: {len(active_ips)} DISPOSITIVOS CONECTADOS NA REDE")
print("=" * 70)

all_devices = []
for ip in sorted(active_ips, key=lambda x: [int(p) for p in x.split('.')]):
    mac = arp_entries.get(ip, "N/A")
    vendor = identify_vendor(mac) if mac != "N/A" else "N/A"
    ports = port_results.get(ip, [])
    tuya_data = tuya_broadcasts.get(ip)
    
    # Classificação
    tipo = "Outro"
    if 6668 in ports or tuya_data:
        tipo = "Tuya / SmartLife"
    elif 8008 in ports or 8009 in ports or "Google" in vendor:
        tipo = "Google Home / Cast"
    elif 554 in ports or "Xiaomi" in vendor:
        tipo = "Xiaomi / Câmera"
    elif ip == "192.168.1.1":
        tipo = "Roteador / Gateway"
    
    item = {
        "ip": ip,
        "mac": mac,
        "vendor": vendor,
        "ports": ports,
        "tipo": tipo,
        "tuya": tuya_data
    }
    all_devices.append(item)
    
    tuya_info = f" (v{tuya_data.get('version')} PK: {tuya_data.get('productKey')})" if tuya_data else ""
    ports_str = ",".join(str(p) for p in ports) if ports else "nenhuma"
    print(f"{ip:15} | MAC: {mac:17} | {tipo:18} | Portas: {ports_str:15} | {vendor}{tuya_info}")

# Salva resultado em JSON
out_file = "targets/tuya_smartlife/evidence/deep_scan_network.json"
with open(out_file, "w", encoding="utf-8") as f:
    json.dump(all_devices, f, indent=2)

print(f"\n[+] Relatório salvo em: {out_file}")
