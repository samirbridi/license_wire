# CHANGELOG — xiaomi_home

## v0.6.0 (build 0011) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: mapeia plugins Xiaomi sem USB e adiciona diagnostico de leitura (commit `6b6fa8d3013f3e0590d87d1a9a551b4c564fb34b`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.5.3 (build 0010) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: inicia ponte YAML com rede restrita ao computador local (commit `8b4c5eb8133b8fd1d843bd50bb42d29060a1c6f1`)

### ⚡ Improvements

- Nenhum.

## v0.5.2 (build 0009) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: recupera ponte e perfis de video apos reiniciar a central (commit `ea8306a72be5fed496904069a074584cfd840bca`)

### ⚡ Improvements

- Nenhum.

## v0.5.1 (build 0008) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: ordena inicializacao das vistas sem interromper video simultaneo (commit `ec978e94fcbdaab0c3bf22e8c042c09eb1c80e2c`)

### ⚡ Improvements

- Nenhum.

## v0.5.0 (build 0007) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: exibe duas visoes simultaneas e prepara calendario timeline e trechos do SD (commit `8c5ac989ef77efcd3743115b024eadfbb2ecd950`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.4.1 (build 0006) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: distingue FourCC da resolucao real nos recibos de audio e video (commit `bfd3407679119065d9caa7fe50d88361a9706561`)

### ⚡ Improvements

- Nenhum.

## v0.4.0 (build 0005) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: adiciona escuta AAC das seis cameras e validacao integrada de audio e video (commit `27936458d63205cd87525f6d10d4a703e6fa4b52`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.3.0 (build 0004) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: adiciona duas visoes Outdoor qualidade nativa NVENC e vinculo HTTPS protegido (commit `7f42ad9f77db2cc14c3bb01d3ad259b9c06ca348`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.2.1 (build 0003) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: interpreta data JSON do processo sem depender da cultura do Windows (commit `fd4e9491e70d43724e0d68c2b767e444ad18f984`)

### ⚡ Improvements

- Nenhum.

## v0.2.0 (build 0002) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: cria central Windows para seis cameras Xiaomi com sessao QR e video H264 (commit `2defcbe409c38e3ee174c0106246454c92e3f392`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## Histórico da preparação — 2026-10-25

### ✨ Features
- Pesquisa documental das alternativas de acesso a câmeras Xiaomi e integração com Google Home/SmartLife; referências em evidence/fontes_publicas.json.
- Escopo confirmado pelo usuário: região China, clientes Android e Windows, acesso local e remoto.
- Identificação comercial dos três modelos nas imagens enviadas pelo usuário; inventário em notes/05_modelos_identificados.md.
- Registro dos três firmwares exibidos pelo app e preparação de ambiente local com go2rtc oficial, sem câmeras conectadas.
- Auxiliar de autorização Xiaomi por QR confirmado no app, com página restrita a loopback e sessão privada separada da tentativa por senha. Geração real do QR validada; aprovação e vídeo pendentes.
- Autorização QR concluída, inventário real das seis câmeras e vídeo decodificado de todas; três famílias confirmadas, com SD nas duas AW300 e observação de 30 segundos em uma Mi 2K.

### ⚡ Improvements
- Estrutura isolada gerada por tools/new-target.ps1.
- Critérios para identificar modelos e validar uma câmera antes de implementar os clientes.
- Preservação dos prints originais por cópias verificadas com SHA-256 e pesquisa de limitações específicas de AW300, HLC7 e CW701. Nenhuma câmera foi acessada.
- Conferência do digest GitHub do go2rtc, HTTP 200 e escuta somente em loopback; runtime/configurações locais excluídos do Git. Não houve nova compilação do projeto.
- Diagnóstico documental do erro de autenticação 70016, com confirmação de login por e-mail/senha no Android e leitura do código público da versão instalada; sem coletar credenciais ou repetir tentativas.
- Cinco testes do auxiliar QR aprovados, cobrindo isolamento de origem e não exposição de dados privados. Não houve compilação, versão publicada ou commit.
- Correção da variante AW300 para mod11, da contagem de fontes e da separação entre resolução anunciada/decodificada. Regra UDP limitada aplicada via UAC, preservando firewall ativo e interfaces em localhost.

Estas anotações registram etapas anteriores ao primeiro commit e build do alvo. Versões posteriores são geradas pelo script próprio, com commits de origem. O helper antigo da raiz continua inadequado para releases por alvo, pois lê os dez commits globais mais recentes.
