"""
Sincroniza o catálogo em nuvem baixado com os IPs locais descobertos na rede 192.168.1.0/24
Gera o devices_registry.json definitivo com:
- ID
- Nome Real
- IP Local
- local_key (para controle sem nuvem)
- Categoria e Funções
- Status
"""

import json
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


with open("targets/tuya_smartlife/runtime/tuya_cloud_devices.json", "r", encoding="utf-8") as f:
    cloud_data = json.load(f)

with open("targets/tuya_smartlife/evidence/deep_scan_network.json", "r", encoding="utf-8") as f:
    scan_data = json.load(f)

# Mapeia ID -> IP local e versão a partir do scan
id_to_ip = {}
id_to_version = {}
for item in scan_data:
    tuya = item.get("tuya")
    if tuya and "id" in tuya:
        id_to_ip[tuya["id"]] = item["ip"]
        if "version" in tuya:
            id_to_version[tuya["id"]] = tuya["version"]


# Mapeamento manual de IPs conhecidos do roteador para dispositivos que estavam em deep sleep
MANUAL_IP_FALLBACK = {
    "eb2d554c1cc3878f810lhh": "192.168.1.46",   # Lampada 1
    "eb82adf958accea153epmc": "192.168.1.139",  # Lampada 2
    "eb8e5475187db23842hfcm": "192.168.1.72",   # Fechadura
    "eb887c762b83806650kele": "192.168.1.119",  # Wattímetro Gerador (provável .119)
}

devices = []
for d in cloud_data.get("devices", []):
    dev_id = d["id"]
    local_ip = id_to_ip.get(dev_id) or MANUAL_IP_FALLBACK.get(dev_id, d.get("ip", ""))
    
    # Extrai DPS
    dps_status = {}
    for s in d.get("status", []):
        dps_status[s["code"]] = s["value"]

    dev_entry = {
        "id": dev_id,
        "name": d.get("name", dev_id),
        "local_ip": local_ip,
        "local_key": d.get("local_key", ""),
        "version": id_to_version.get(dev_id, "3.3"),
        "category": d.get("category", ""),
        "product_name": d.get("product_name", ""),

        "product_id": d.get("product_id", ""),
        "model": d.get("model", ""),
        "online": d.get("online", False),
        "sub": d.get("sub", False),
        "status": dps_status
    }
    devices.append(dev_entry)

out_path = "targets/tuya_smartlife/runtime/devices_registry.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(devices, f, indent=2, ensure_ascii=False)

print(f"[+] devices_registry.json atualizado com {len(devices)} dispositivos:")
for dev in devices:
    status_icon = "🟢" if dev["online"] else "⚪"
    key_icon = "🔑" if dev["local_key"] else "❌"
    print(f"{status_icon} {key_icon} [{dev['local_ip']:15}] {dev['name']:25} | ID: {dev['id'][:12]}... | Cat: {dev['category']}")
