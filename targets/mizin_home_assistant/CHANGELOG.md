# 📜 CHANGELOG - mizin_home_assistant

Todas as descobertas, módulos dissecados e correções desta análise são registrados aqui.
Formato de versão obrigatório: `vX.Y.Z (build XXXX)`.

---

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

