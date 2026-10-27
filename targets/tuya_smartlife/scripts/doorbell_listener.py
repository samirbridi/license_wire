"""
Monitor Contínuo em Tempo Real da Campainha Tuya (ZX-DB11B).
Executa em segundo plano com conexão persistente TCP e escuta de eventos UDP (6666 e 6667).
Notifica instantaneamente o server.mjs via stdout (JSON) quando o botão é pressionado.
"""

import sys
import os
import json
import time
import socket
import threading

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import tinytuya

WORKSPACE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
REGISTRY_PATH = os.path.join(WORKSPACE, "targets", "tuya_smartlife", "runtime", "devices_registry.json")

DOORBELL_IP = "192.168.1.222"
DOORBELL_ID = "eb7f7b175bf04774f0qnwh"
DOORBELL_KEY = "Q.I}v6Qk1A.NTxCj"
DOORBELL_VER = 3.5

last_alert_time = 0
ALERT_DEBOUNCE = 6.0  # Evita disparos duplicados em menos de 6s

def emit_event(source, details=None):
    global last_alert_time
    now = time.time()
    if now - last_alert_time < ALERT_DEBOUNCE:
        return
    last_alert_time = now
    payload = {
        "event": "doorbell_ring",
        "source": source,
        "devId": DOORBELL_ID,
        "ip": DOORBELL_IP,
        "timestamp": int(now * 1000),
        "details": details or {}
    }
    print(json.dumps(payload), flush=True)

def udp_listener_worker(port):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('', port))
        sock.settimeout(2.0)
        while True:
            try:
                data, addr = sock.recvfrom(4096)
                if addr[0] == DOORBELL_IP:
                    emit_event(f"udp_{port}", {"len": len(data)})
            except socket.timeout:
                continue
            except Exception:
                time.sleep(1)
    except Exception:
        pass

def main():
    # Inicia listeners UDP em threads secundárias para captura de transmissões imediatas
    t6666 = threading.Thread(target=udp_listener_worker, args=(6666,), daemon=True)
    t6667 = threading.Thread(target=udp_listener_worker, args=(6667,), daemon=True)
    t6666.start()
    t6667.start()

    last_heartbeat = 0
    while True:
        dev = None
        try:
            dev = tinytuya.OutletDevice(DOORBELL_ID, DOORBELL_IP, DOORBELL_KEY)
            dev.set_version(DOORBELL_VER)
            dev.set_socketPersistent(True)
            dev.set_socketTimeout(2.5)

            # Primeiro status
            st = dev.status()
            last_heartbeat = time.time()

            while True:
                now = time.time()
                # Envia heartbeat a cada 15 segundos para manter a conexão ativa
                if now - last_heartbeat > 15:
                    dev.heartbeat()
                    last_heartbeat = now

                msg = dev.receive()
                if msg and isinstance(msg, dict):
                    dps = msg.get('dps', {})
                    if dps:
                        # Verifica se é sinal de campainha ou alarme
                        is_ring = False
                        if '26' in dps or '25' in dps or 'alarm_msg' in dps:
                            is_ring = True
                        if str(dps.get('32', 'normal')).lower() != 'normal':
                            is_ring = True
                        if str(dps.get('24', 'normal')).lower() != 'normal':
                            is_ring = True

                        if is_ring:
                            emit_event("tcp_dps_change", dps)
                time.sleep(0.05)

        except Exception:
            time.sleep(3.0)
        finally:
            if dev:
                try:
                    dev.close()
                except Exception:
                    pass

if __name__ == '__main__':
    main()
