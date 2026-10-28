"""
Sincroniza o catálogo em nuvem baixado com os IPs locais descobertos na rede 192.168.1.0/24
e preserva dispositivos adicionados localmente (Hub Zigbee, Sub-dispositivos, controles remotos).
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

WORKSPACE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
RUNTIME_DIR = os.path.join(WORKSPACE, "targets", "tuya_smartlife", "runtime")
EVIDENCE_DIR = os.path.join(WORKSPACE, "targets", "tuya_smartlife", "evidence")
REGISTRY_PATH = os.path.join(RUNTIME_DIR, "devices_registry.json")

# 1. Carrega registry existente para não perder customizações ou sub-dispositivos
existing_devices = {}
if os.path.exists(REGISTRY_PATH):
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            for item in json.load(f):
                if item.get("id"):
                    existing_devices[item["id"]] = item
    except Exception as e:
        print(f"[-] Aviso ao ler registry existente: {e}")

# 2. Carrega catálogo da nuvem se disponível
cloud_devices = {}
cloud_file = os.path.join(RUNTIME_DIR, "tuya_cloud_devices.json")
if os.path.exists(cloud_file):
    try:
        with open(cloud_file, "r", encoding="utf-8") as f:
            cdata = json.load(f)
            for d in cdata.get("devices", []):
                cloud_devices[d["id"]] = d
    except Exception as e:
        print(f"[-] Aviso ao ler dados da nuvem: {e}")

# 3. Carrega scans locais de rede (deep_scan e scan_results)
lan_scans = {}
for scan_filename in ["scan_results.json", "deep_scan_network.json"]:
    sp = os.path.join(EVIDENCE_DIR, scan_filename)
    if os.path.exists(sp):
        try:
            with open(sp, "r", encoding="utf-8") as f:
                sdata = json.load(f)
                if isinstance(sdata, list):
                    for item in sdata:
                        tuya = item.get("tuya")
                        if tuya and tuya.get("id"):
                            lan_scans[tuya["id"]] = {
                                "ip": item.get("ip") or tuya.get("ip"),
                                "version": tuya.get("version", "3.3"),
                                "productKey": tuya.get("productKey", "")
                            }
                elif isinstance(sdata, dict):
                    for k, item in sdata.items():
                        raw = item.get("raw") or item
                        dev_id = raw.get("gwId") or raw.get("id") or item.get("id")
                        if dev_id and not dev_id.startswith("192.168."):
                            lan_scans[dev_id] = {
                                "ip": item.get("ip") or raw.get("ip"),
                                "version": item.get("version") or raw.get("version", "3.3"),
                                "productKey": item.get("productKey") or raw.get("productKey", "")
                            }
        except Exception as e:
            print(f"[-] Erro ao ler {scan_filename}: {e}")

# Fallback manual de IPs conhecidos do roteador
MANUAL_IP_FALLBACK = {
    "eb2d554c1cc3878f810lhh": "192.168.1.46",   # Lampada 1
    "eb82adf958accea153epmc": "192.168.1.139",  # Lampada 2
    "eb8e5475187db23842hfcm": "192.168.1.72",   # Fechadura
    "eb887c762b83806650kele": "192.168.1.119",  # Wattímetro Gerador
    "ebacd6b0d9c50c9db8sfkk": "192.168.1.175",  # Hub Zigbee Gateway
    "ebddcf746536e0f01az4dv": "192.168.1.70",   # Dispositivo Tuya 3.4
    "eb5911cf8227d3e955ihbv": "192.168.1.80",   # Dispositivo Tuya 3.3
}

# 4. Mapeamento de Dispositivos Conhecidos Adicionados Manualmente / Zigbee
KNOWN_STATIC_DEVICES = [
    {
        "id": "ebacd6b0d9c50c9db8sfkk",
        "name": "Hub Zigbee Gateway",
        "local_ip": "192.168.1.175",
        "local_key": "",
        "version": "3.4",
        "category": "wg2",
        "product_name": "Hub Zigbee 3.0 Wireless Gateway",
        "product_id": "keym557nqw3p8p7m",
        "model": "TYGWZ-01",
        "online": True,
        "sub": False,
        "status": {
            "online": True,
            "connected_sub_count": 1
        }
    },
    {
        "id": "eb_zigbee_remote_01",
        "parent_id": "ebacd6b0d9c50c9db8sfkk",
        "name": "Controle Remoto Zigbee",
        "local_ip": "Sub-dispositivo (Hub Zigbee)",
        "local_key": "",
        "version": "3.4",
        "category": "ykq",
        "product_name": "Controle Remoto Sem Fio Zigbee",
        "product_id": "zigbee_remote_key",
        "model": "TS0215A / Zigbee Remote",
        "online": True,
        "sub": True,
        "status": {
            "switch_1": False,
            "battery_percentage": 100,
            "button_state": "idle"
        }
    }
]

# 5. Mesclagem de catálogo
final_devices = {}

# A. Insere cloud devices
for dev_id, d in cloud_devices.items():
    local_ip = lan_scans.get(dev_id, {}).get("ip") or MANUAL_IP_FALLBACK.get(dev_id, d.get("ip", ""))
    version = lan_scans.get(dev_id, {}).get("version") or d.get("version", "3.3")

    dps_status = {}
    for s in d.get("status", []):
        dps_status[s["code"]] = s["value"]

    final_devices[dev_id] = {
        "id": dev_id,
        "name": d.get("name", dev_id),
        "local_ip": local_ip,
        "local_key": d.get("local_key", ""),
        "version": version,
        "category": d.get("category", ""),
        "product_name": d.get("product_name", ""),
        "product_id": d.get("product_id", ""),
        "model": d.get("model", ""),
        "online": d.get("online", False),
        "sub": d.get("sub", False),
        "status": dps_status
    }

# B. Mescla com dispositivos já salvos no registry (preserva local_key, salas, sub-dispositivos)
for dev_id, item in existing_devices.items():
    if dev_id in final_devices:
        # Preserva campos ricos se não vazios
        if item.get("local_key") and not final_devices[dev_id].get("local_key"):
            final_devices[dev_id]["local_key"] = item["local_key"]
        if item.get("room"):
            final_devices[dev_id]["room"] = item["room"]
        if item.get("name") and not final_devices[dev_id].get("name"):
            final_devices[dev_id]["name"] = item["name"]
    else:
        # Dispositivo estava no registry mas não veio do dump estático da nuvem
        final_devices[dev_id] = item

# C. Garante a inclusão dos novos dispositivos descobertos no LAN scan
for dev_id, scan_info in lan_scans.items():
    if dev_id not in final_devices:
        ip = scan_info.get("ip") or MANUAL_IP_FALLBACK.get(dev_id, "")
        final_devices[dev_id] = {
            "id": dev_id,
            "name": f"Dispositivo Tuya ({ip})",
            "local_ip": ip,
            "local_key": "",
            "version": scan_info.get("version", "3.4"),
            "category": "cz" if "cz" in scan_info.get("productKey", "") else "dj",
            "product_name": "Dispositivo Tuya Wi-Fi",
            "product_id": scan_info.get("productKey", ""),
            "model": "",
            "online": True,
            "sub": False,
            "status": {}
        }

# D. Garante a presença e dados corretos do Hub Zigbee e do Controle Remoto Zigbee
for kdev in KNOWN_STATIC_DEVICES:
    k_id = kdev["id"]
    if k_id not in final_devices:
        final_devices[k_id] = kdev
    else:
        # Sobrescreve com nome, categoria e modelo ricos
        final_devices[k_id]["name"] = kdev["name"]
        final_devices[k_id]["category"] = kdev["category"]
        final_devices[k_id]["product_name"] = kdev["product_name"]
        final_devices[k_id]["model"] = kdev["model"]
        final_devices[k_id]["online"] = True
        if kdev.get("local_ip"):
            final_devices[k_id]["local_ip"] = kdev["local_ip"]
        if kdev.get("sub"):
            final_devices[k_id]["sub"] = True
            final_devices[k_id]["parent_id"] = kdev.get("parent_id")

# Grava registry atualizado
out_list = list(final_devices.values())
with open(REGISTRY_PATH, "w", encoding="utf-8") as f:
    json.dump(out_list, f, indent=2, ensure_ascii=False)

print(f"[+] devices_registry.json atualizado com {len(out_list)} dispositivos:")
for dev in out_list:
    status_icon = "🟢" if dev.get("online") else "⚪"
    key_icon = "🔑" if dev.get("local_key") else "📡"
    sub_tag = "[SUB-ZIGBEE]" if dev.get("sub") else f"[{dev.get('local_ip', ''):15}]"
    name_display = dev.get('name', '')[:25]
    print(f"{status_icon} {key_icon} {sub_tag:18} {name_display:25} | ID: {dev.get('id', '')[:14]}... | Cat: {dev.get('category')}")
