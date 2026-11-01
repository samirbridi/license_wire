"""Empacota só a ponte MQTT (mqtt-bridge-runner.mjs + mqtt-discovery.mjs + dependências) para a
máquina Linux nova do Home Assistant -- não o portal inteiro, que continua rodando no NAS sem mudança
nenhuma. Saída: targets/mizin_home_assistant/artifacts/mqtt-bridge-app/, pronta para o volume
./mqtt-bridge-app do docker-compose.homeassistant.yml."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

target = Path(__file__).resolve().parents[1]  # targets/tuya_smartlife
portal = target / "reconstructed/mizin-portal"
ha_target = target.parents[0] / "mizin_home_assistant"
dest = ha_target / "artifacts/mqtt-bridge-app"

if dest.exists():
    shutil.rmtree(dest)
workspace_dest = dest / "workspace/targets/tuya_smartlife/reconstructed/mizin-portal"
workspace_dest.mkdir(parents=True)

# Só os dois arquivos que mqtt-bridge-runner.mjs de fato importa -- não o portal inteiro.
for name in ["mqtt-bridge-runner.mjs", "mqtt-discovery.mjs"]:
    shutil.copyfile(portal / name, workspace_dest / name)

# package.json mínimo, só com a dependência real (mqtt), versão travada igual ao portal principal.
portal_pkg = json.loads((portal / "package.json").read_text(encoding="utf-8"))
mqtt_version = portal_pkg["dependencies"]["mqtt"]
(dest / "package.json").write_text(
    json.dumps({"name": "mizin-mqtt-bridge", "private": True, "type": "module", "dependencies": {"mqtt": mqtt_version}}, indent=2) + "\n",
    encoding="utf-8",
)

# Instala de verdade (não só copia node_modules do portal: garante um lockfile próprio e limpo).
# shell=True no Windows: resolve npm.cmd no PATH, que subprocess.run não encontra diretamente.
subprocess.run(["npm", "install", "--omit=dev"], cwd=dest, check=True, shell=(sys.platform == "win32"))

readme = dest / "LEIA-ME.txt"
readme.write_text(
    "Pacote mínimo da ponte MQTT (mqtt-bridge-runner.mjs), sem o portal inteiro.\n"
    "Usado pelo serviço mqtt-bridge do docker-compose.homeassistant.yml, montado como volume\n"
    "./mqtt-bridge-app:/app:ro.\n\n"
    "Para atualizar depois de uma mudança em mqtt-bridge-runner.mjs ou mqtt-discovery.mjs:\n"
    "  python targets/tuya_smartlife/scripts/prepare-mqtt-bridge-package.py\n"
    "  docker compose -f docker-compose.homeassistant.yml restart mqtt-bridge\n",
    encoding="utf-8",
)

print(json.dumps({"status": "ok", "dest": str(dest), "mqtt_version": mqtt_version}))
