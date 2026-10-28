# 📜 CHANGELOG - gwm_app

## v0.7.0 (build 0009) - 2026-10-28

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: cataloga APKs GWM e valida manual oficial do ORA 5 (commit `293a66deb0974f21b51b4584bd44569fd8d2c020`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.6.1 (build 0008) - 2026-10-28

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- improve: documenta Coffee OS 3.3.00213 e limites do menu de diagnostico (commit `57db2f72db724829134d5601b1a70d994a4e8cb4`)

## v0.6.0 (build 0007) - 2026-10-28

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: adiciona coleta LAN limitada e identifica servico AirTunes da central GWM (commit `334a336b6d2641acf94a0fd7a9a96ea21cf085ab`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.5.0 (build 0006) - 2026-10-27

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: integra ficha tecnica gwm ora 5 alerta de campainha e processo invisivel (commit `a97b6e9ea09c0149218315bc5e23e11391c283ca`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- improve: registra diagnostico LAN do GWM e automatiza versoes por commits (commit `e38f2f086fe07864c30547ddcd4fc74f9f5d49f1`)

## v0.4.0 (build 5) - 2026-10-27

### ✨ Features
- feat: adiciona exportação de telemetria estruturada (`getLatestOraTelemetry`, `getDefaultOraTelemetry`) em `gwm-ora-client.mjs` para integração direta na aba "Elétricos" do Mizin Portal
- feat: mapeia endpoints de autenticação v2.0 (`br-h5-gateway.gwmcloud.com`) com suporte a solicitação de código de verificação (`getVerifyCode`)

## v0.3.1 (build 4) - 2026-10-27

### ðŸ› Fixes
- fix: Melhora tratamento para contas criadas via Google Sign-In e suporte a GWM_ACCESS_TOKEN

## v0.3.0 (build 3) - 2026-10-26

### âœ¨ Features
- feat: Adiciona credenciais_gwm.env auto-carregado, Sincronizar-Ora5.cmd e geracao de ora5_telemetry_latest.json

## v0.2.0 (build 2) - 2026-10-26

### âœ¨ Features
- feat: Mapeia API GWM Brasil via REA, valida handshake mTLS e reconstroi SDK GWM Ora 5

Todas as descobertas, módulos dissecados e correções desta análise são registrados aqui.
Formato de versão obrigatório: `vX.Y.Z (build XXXX)`.

---

## v0.1.0 (build 1) - 2026-10-26

### ✨ Features
- feat: inicializa ambiente isolado para o alvo gwm_app

### ⚡ Improvements
- improve: cria estrutura padronizada de diretórios (binaries, evidence, ghidra, notes, scripts, reconstructed)




