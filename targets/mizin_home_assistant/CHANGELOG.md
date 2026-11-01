# 📜 CHANGELOG - mizin_home_assistant

Todas as descobertas, módulos dissecados e correções desta análise são registrados aqui.
Formato de versão obrigatório: `vX.Y.Z (build XXXX)`.

---

## v0.3.0 (build 3) - 2026-11-01

### ✨ Features
- feat: vídeo ao vivo do Frigate ligado às 4 câmeras reais via RTSP da ponte go2rtc do NAS
  (config-live.yml + docker-compose.local-live.yml), com credencial RTSP dedicada e
  preset-rtsp-restream (feito especificamente para fonte go2rtc, não o preset genérico de câmera IP)
- feat: bridge-rtsp-enable.md + bridge-firewall-dsm.md documentam as duas mudanças no bridge.yaml/
  firewall do DSM que só o proprietário pode aplicar -- mudança mínima e cirúrgica (3 linhas), com
  verificação de que a Outdoor Pro (uma sessão só) não é afetada: go2rtc multiplexa um único produtor
  entre múltiplos consumidores, confirmado antes de propor a mudança
- feat: docker-compose.frigate-opt-in.yml -- Frigate opcional para a máquina nova, desligado por padrão

### 🐛 Fixes
- fix: frigate-config-homeassistant.yml tinha ficado desatualizado desde a rodada anterior (ainda
  apontava para arquivos de amostra, com comentário dizendo que isso ainda era pendência) -- alinhado
  com config-live.yml agora que o caminho real foi resolvido

### 🧪 Validação real, não assumida
- Testado de ponta a ponta: container subiu `healthy` com as 4 câmeras tentando RTSP contra a porta
  8554 do NAS (ainda fechada no momento do teste) -- reconexão isolada por câmera, sem crash,
  comportamento correto confirmado por log e `/api/stats`. Container restaurado ao estado original
  (amostras em loop) depois do teste.
- `docker compose config` validado para os dois composes novos, isolado e combinado com o principal.
- YAML de frigate-config-homeassistant.yml revalidado após a atualização das câmeras.

## v0.2.0 (build 2) - 2026-11-01

### ✨ Features
- feat: pacote de deploy completo para a máquina Linux nova (Home Assistant + Mosquitto + ponte MQTT),
  compose/bootstrap/.env.example testados end-to-end (bootstrap.sh gerando senha real do Mosquitto)
- feat: variante do config do Frigate com MQTT habilitado (frigate-config-homeassistant.yml), validada
  como YAML

### 🐛 Fixes
- fix: config.yml do banco de testes local (tuya_smartlife/reconstructed/mizin-vision) testado com
  mqtt.enabled:true + host sem env var definida -- derrubava o container com KeyError, não "ignorava
  graciosamente" como a documentação sugeria; revertido para enabled:false no banco de testes local,
  documentado no próprio arquivo

### ⚡ Improvements
- improve: decisão de hardware documentada com dados reais (GTX 1660 Ti: 19% uso, 16,84ms/inferência,
  20,2 FPS combinado, 4 câmeras) contra a falta de suporte oficial ROCm na RX 580 (gfx803/Polaris,
  descontinuado desde ROCm ~5.x)
- improve: números reais de armazenamento de câmera (884GB total, 232GB em uso, ~19GB/dia nas 3 câmeras
  de segurança) para embasar a decisão de gravação ainda em aberto do proprietário
- improve: checklist de execução remota, na ordem de dependência correta

## v0.1.0 (build 1) - 2026-11-01

### ✨ Features
- feat: inicializa ambiente isolado para o alvo mizin_home_assistant

### ⚡ Improvements
- improve: cria estrutura padronizada de diretórios (binaries, evidence, ghidra, notes, scripts, reconstructed)

