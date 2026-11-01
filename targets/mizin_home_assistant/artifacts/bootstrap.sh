#!/usr/bin/env bash
# Prepara este diretório para o primeiro "docker compose up" na máquina Linux nova: gera o arquivo de
# senha do Mosquitto a partir de MIZIN_MQTT_USERNAME/MIZIN_MQTT_PASSWORD em .env, sem deixar a senha em
# texto puro em lugar nenhum além do próprio .env (gitignored). Idempotente: rodar de novo depois de
# trocar a senha no .env regenera o arquivo corretamente.
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Copie .env.example para .env e preencha antes de rodar este script." >&2
  exit 1
fi
set -a; source .env; set +a

: "${MIZIN_MQTT_USERNAME:?defina MIZIN_MQTT_USERNAME em .env}"
: "${MIZIN_MQTT_PASSWORD:?defina MIZIN_MQTT_PASSWORD em .env}"

mkdir -p mosquitto ha-config
docker run --rm -v "$(pwd)/mosquitto:/mosquitto/config" eclipse-mosquitto:2 \
  mosquitto_passwd -b -c /mosquitto/config/passwd "$MIZIN_MQTT_USERNAME" "$MIZIN_MQTT_PASSWORD"

echo "OK: mosquitto/passwd gerado para o usuário '$MIZIN_MQTT_USERNAME'."
echo "Próximo passo: docker compose -f docker-compose.homeassistant.yml up -d"
