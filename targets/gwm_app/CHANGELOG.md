# 📜 CHANGELOG - gwm_app

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




