# 📜 CHANGELOG - mizin_home_assistant

Todas as descobertas, módulos dissecados e correções desta análise são registrados aqui.
Formato de versão obrigatório: `vX.Y.Z (build XXXX)`.

---

## v0.5.0 (build 5) - 2026-11-01

### ✨ Features
- feat: acesso SSH ao NAS confirmado funcionando de ponta a ponta -- autenticação por senha (não por
  chave, a UI do DSM não ofereceu onde colá-la), usuário VSCode em administrators, `sudo` sem senha
  ativo via `/etc/sudoers.d/vscode-nopasswd`, leitura confirmada em arquivo real dentro de HDD 1TB - V2
- feat: nas-ssh-run.py (paramiko, não ssh.exe/PowerShell SSH_ASKPASS -- este sofria de problemas de
  escape de aspas aninhadas e falhas de CreateProcessW invocando scripts PowerShell) com rede de
  segurança que nunca deixa a senha aparecer no output do script
- feat: regra de escopo de volume do proprietário documentada com destaque -- só docker e HDD 1TB - V2
  podem ser lidos/escritos, os demais volumes do NAS nunca são tocados mesmo com acesso de administrador

### 🐛 Fixes
- fix: SFTP não disponível neste DSM (scp.exe e paramiko.open_sftp() falham) -- upload de arquivo usa
  cat > arquivo via exec_command com stdin binário bruto
- fix: arquivo remoto escrito via heredoc bash tinha BOM UTF-8, quebrando o shebang (`#!/bin/bash`
  virava `﻿#!/bin/bash`, "No such file or directory") -- corrigido escrevendo o conteúdo como bytes
  puros, confirmado via hexdump que o BOM não está mais presente nem na origem nem no destino
- fix: script remoto dependia de `visudo`, ausente no PATH padrão do DSM -- removida a validação,
  substituída por verificação direta de legibilidade/aplicação da regra

### ⚠️ Incidente registrado
- Uma tentativa inicial de `sudo -S` com PTY (`get_pty=True`) ecoou a senha de volta no output de uma
  ferramenta -- avisado ao proprietário na hora; ele optou explicitamente por manter a mesma senha em
  vez de trocá-la. Corrigido para `get_pty=False` em todo o fluxo de sudo, mais uma redação defensiva
  que nunca deixa a senha aparecer no output do script mesmo que ela reapareça ali por outro motivo.

### 📝 Limitação conhecida, não resolvida
- A conexão SSH trava intermitentemente (~1 em 3 tentativas nesta sessão), antes mesmo do primeiro
  print do script aparecer quando ocorre -- não identificado se é client.connect(), client.close(), ou
  algo na camada de rede/socket. Quando conecta, é rápido e o resultado sempre veio correto. Mitigado
  com timeout externo obrigatório em todo uso do script; não investigado a fundo por falta de tempo
  nesta sessão.

## v0.4.0 (build 4) - 2026-11-01

### ✨ Features
- feat: chave SSH dedicada (ed25519) gerada para acesso ao NAS, gitignored, nunca reaproveita
  credencial existente do proprietário
- feat: nas-ssh-setup.md documenta o procedimento do lado do DSM (habilitar SSH, criar usuário
  dedicado, colar a chave pública, regra de firewall) e a regra combinada com o proprietário: acesso
  técnico não dispensa confirmação antes de mudar configuração de produção, só leitura é livre

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

