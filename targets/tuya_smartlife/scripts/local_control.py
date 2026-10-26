"""
Controlador local Tuya CLI / API Bridge.
Lê o devices_registry.json e permite consultar ou alterar estados localmente via tinytuya.
"""

import sys
import json
import tinytuya

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

REGISTRY_PATH = "targets/tuya_smartlife/runtime/devices_registry.json"

def load_registry():
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def get_device_by_id(dev_id):
    devices = load_registry()
    for d in devices:
        if d["id"] == dev_id or d["local_ip"] == dev_id or d["name"].lower() == dev_id.lower():
            return d
    return None

def query_status(dev):
    ip = dev.get("local_ip")
    key = dev.get("local_key")
    dev_id = dev.get("id")
    ver = float(dev.get("version", 3.4) if dev.get("version") else 3.4)

    if not ip or not key or not ip.startswith("192.168."):
        return {"error": "Missing or non-local IP/local_key"}

    d = tinytuya.OutletDevice(
        dev_id, ip, key,
        connection_timeout=2.0,
        connection_retry_limit=1,
        connection_retry_delay=0.1
    )
    d.set_version(ver)
    d.set_socketTimeout(1.5)
    return d.status()

def set_dps(dev, dps_idx, value):
    ip = dev.get("local_ip")
    key = dev.get("local_key")
    dev_id = dev.get("id")
    ver = float(dev.get("version", 3.4) if dev.get("version") else 3.4)

    if not ip or not key:
        return {"error": "Missing IP or local_key"}

    d = tinytuya.OutletDevice(dev_id, ip, key)
    d.set_version(ver)
    d.set_socketTimeout(3.0)
    
    # Converte valor se necessário
    if str(value).lower() == "true":
        val = True
    elif str(value).lower() == "false":
        val = False
    elif str(value).isdigit():
        val = int(value)
    else:
        val = value

    if str(dps_idx).lower() == "all":
        # Master toggle: define ambos os canais 1 e 2 atomicamente
        return d.set_multiple_values({1: val, 2: val})

    return d.set_value(int(dps_idx), val)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso:")
        print("  python local_control.py status <device_id_ou_ip>")
        print("  python local_control.py set <device_id_ou_ip> <dps> <valor>")
        print("  python local_control.py all_status")
        sys.exit(1)

    cmd = sys.argv[1].lower()

    if cmd == "status":
        target = sys.argv[2]
        dev = get_device_by_id(target)
        if not dev:
            print(json.dumps({"error": f"Dispositivo '{target}' não encontrado"}))
            sys.exit(1)
        res = query_status(dev)
        print(json.dumps(res, indent=2))

    elif cmd == "set":
        target = sys.argv[2]
        dps = sys.argv[3]
        val = sys.argv[4]
        dev = get_device_by_id(target)
        if not dev:
            print(json.dumps({"error": f"Dispositivo '{target}' não encontrado"}))
            sys.exit(1)
        res = set_dps(dev, dps, val)
        print(json.dumps(res, indent=2))

    elif cmd == "all_status":
        from concurrent.futures import ThreadPoolExecutor
        devices = load_registry()
        statuses = {}

        def check_device(dev):
            dev_id = dev["id"]
            ip = dev.get("local_ip", "")
            if ip.startswith("192.168.") and dev.get("local_key") and not dev.get("sub"):
                try:
                    res = query_status(dev)
                    return dev_id, res
                except Exception as e:
                    return dev_id, {"error": str(e)}
            return dev_id, None

        with ThreadPoolExecutor(max_workers=12) as executor:
            results = executor.map(check_device, devices)
            for dev_id, res in results:
                if res:
                    statuses[dev_id] = res

        print(json.dumps(statuses, indent=2))

