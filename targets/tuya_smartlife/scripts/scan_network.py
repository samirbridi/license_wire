"""
Scanner de dispositivos Tuya na rede local (UDP 6666, 6667 e tinytuya.deviceScan).
"""
import sys
import json
import time
import socket
import tinytuya

print("=" * 60)
print("[*] Iniciando varredura Tuya / Smart Life na rede local...")
print("=" * 60)

devices = {}

# 1. Varredura via tinytuya deviceScan
try:
    print("[*] Executando tinytuya.deviceScan (escutando broadcasts UDP 6666/6667)...")
    scanned = tinytuya.deviceScan(verbose=False, maxretry=2)
    print(f"[+] tinytuya encontrou {len(scanned)} dispositivos respondendo.")
    for dev_id, info in scanned.items():
        devices[dev_id] = {
            "id": dev_id,
            "ip": info.get("ip"),
            "version": info.get("version"),
            "productKey": info.get("productKey"),
            "source": "tinytuya_scan",
            "raw": info
        }
except Exception as e:
    print(f"[-] Erro no deviceScan: {e}")

# 2. Varredura direta UDP socket caso o firewall tenha filtrado
if not devices:
    print("[*] Testando socket UDP direto na porta 6666 e 6667...")
    for port in (6666, 6667):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.settimeout(3.0)
            s.bind(('', port))
            print(f"[*] Escutando UDP {port} por 4 segundos...")
            start_t = time.time()
            while time.time() - start_t < 4.0:
                try:
                    data, addr = s.recvfrom(4096)
                    print(f"[+] Pacote recebido de {addr}: {len(data)} bytes")
                except socket.timeout:
                    break
            s.close()
        except Exception as e:
            print(f"[-] Socket UDP {port} falhou: {e}")

print(f"\n[+] Total de dispositivos Tuya identificados: {len(devices)}")
for dev_id, dev in devices.items():
    print(f" - ID: {dev_id} | IP: {dev['ip']} | Versão: {dev['version']} | ProductKey: {dev.get('productKey')}")

# Salva resultado em JSON
out_path = "targets/tuya_smartlife/evidence/scan_results.json"
try:
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(devices, f, indent=2)
    print(f"[+] Salvo em {out_path}")
except Exception as e:
    print(f"[-] Falha ao salvar: {e}")
