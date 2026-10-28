# 🎯 ALVO: gwm_app (My GWM Brasil — GWM Ora 5)

> **Descrição**: Análise de Engenharia Reversa do ecossistema My GWM Brasil (`com.gwm.brazil` v1.4.2) e API Cloud de Telemetria/Comandos para o **GWM Ora 5** com foco na integração à plataforma **Mizin Home**.  
> **Versão da Análise**: `v0.3.0 (build 3)`  
> **Criado em**: 2026-10-26

---

## 📊 1. Informações do Alvo
- **App Oficial**: My GWM (`com.gwm.brazil` — Great Wall Motor Brazil Ltda.)
- **Gateways Regionais (Brasil)**:
  - **Autenticação**: `https://br-front-service.gwmcloud.com/br-official-commerce/br-official-gateway/pc-api/api/v1.0/userAuth/loginAccount`
  - **Telemetria & Controle (mTLS)**: `https://br-app-gateway.gwmcloud.com/app-api/api/v1.0`
- **Segurança de Transporte**: Mutual TLS (mTLS) com certificado cliente X.509 (`gwm_general.cer` + `gwm_general.key`) e CA raiz (`gwm_root.cer`) + JWT (`accessToken`).

---

## 🎯 2. Estado Atual e Próximos Passos (Multi-IDE Sync)
*Atualizado por: Antigravity*

### ✅ Concluído nesta etapa:
- [x] Inicialização isolada do alvo `targets/gwm_app` segundo a diretriz `AGENTS.md`.
- [x] Execução do **REA (`rea@6.7.0` — `analyze-javascript-application`)** para reconstruir e selar o grafo semântico dos conectores GWM Brasil (`evidence/rea_js_analysis.json`).
- [x] Extração e verificação de integridade (`SHA256SUMS.txt`) dos certificados mTLS da GWM (`binaries/certs/`).
- [x] Teste ativo de conectividade e handshake mTLS nos dois gateways brasileiros da GWM (`evidence/br_gateway_probe.json`), confirmando `HTTP 200` e aceitação dos certificados em produção.
- [x] Documentação técnica completa em `notes/01_overview.md`, `notes/02_architecture.md`, `notes/03_protocols_apis.md` e `notes/04_crypto_security.md` (mais de 40 sensores mapeados: SoC, autonomia EV, TPMS em PSI/°C, portas, vidros, teto solar, A/C, bateria 12V, GPS e recarga).
- [x] Reconstrução do SDK/CLI zero-dependências em [`reconstructed/gwm-ora-client.mjs`](reconstructed/gwm-ora-client.mjs).

### 🚀 Próximos Passos:
0. **Diagnóstico LAN em 2026-10-27 (Codex)**: o IP informado `192.168.1.119` não respondeu a ping nem às tentativas TCP 80/443; sem entrada ARP. A identidade do veículo e qualquer serviço local permanecem não confirmados. Consultar [`notes/05_local_wifi.md`](notes/05_local_wifi.md) e [`evidence/lan-192.168.1.119-20261027.json`](evidence/lan-192.168.1.119-20261027.json). Confirmar o IP atual, central ligada e configuração da LAN antes de prosseguir. Nenhuma função do carro foi alterada.
1. **Validar com a conta real do proprietário**: Testar `reconstructed/gwm-ora-client.mjs` com o e-mail e senha do app **My GWM** para capturar o primeiro snapshot real do **GWM Ora 5** e mapear eventuais códigos exclusivos do modelo.
2. **Integrar ao Portal Unificado Mizin Home**: Adicionar o card/painel dedicado do **GWM Ora 5** (Bateria, Autonomia, Pneus, Portas/Vidros, Clima, Localização e Comandos Remotos) na plataforma Mizin Home.
3. **Etapa Futura (Multimídia)**: Investigar a unidade principal (Head Unit / Android Automotive da multimídia do GWM Ora 5) para leitura local/CAN e execução embarcada.

---

## 📂 3. Estrutura de Arquivos Relevantes
- [`binaries/SHA256SUMS.txt`](binaries/SHA256SUMS.txt): Hashes SHA-256 dos certificados mTLS (`gwm_general.cer`, `gwm_general.key`, `gwm_root.cer`).
- [`evidence/rea_js_analysis.json`](evidence/rea_js_analysis.json): Evidência canônica gerada pelo REA (`rea@6.7.0`).
- [`evidence/br_gateway_probe.json`](evidence/br_gateway_probe.json): Recibo do teste ao vivo contra `br-front-service.gwmcloud.com` e `br-app-gateway.gwmcloud.com`.
- [`notes/03_protocols_apis.md`](notes/03_protocols_apis.md): Especificação completa dos endpoints REST, headers e códigos de sensores.
- [`reconstructed/gwm-ora-client.mjs`](reconstructed/gwm-ora-client.mjs): Cliente Node.js pronto para uso via CLI (`node reconstructed/gwm-ora-client.mjs sync`) ou importação no servidor Mizin Home.
- [`Sincronizar-Ora5.cmd`](Sincronizar-Ora5.cmd): Atalho de 1 clique para autenticar, colher todos os dados do veículo e gravar `runtime/ora5_telemetry_latest.json`.
- `runtime/credenciais_gwm.env`: Arquivo local privado (protegido pelo `.gitignore`) onde ficam `GWM_EMAIL`, `GWM_PASSWORD` e `GWM_PIN`.

## Versionamento automático do alvo

Após commitar as alterações com `tipo: descrição`, execute `node targets/gwm_app/scripts/version-from-commits.mjs` para conferir a próxima versão e `node targets/gwm_app/scripts/version-from-commits.mjs --write` para gerar VERSION, changelog, versão no README e recibo em `evidence/`. O cálculo considera somente commits deste alvo desde o último commit que alterou VERSION; usa prioridade break/feat/correção, build incremental e data de São Paulo. Em seguida, registre os arquivos gerados em um commit estruturado. Não há parâmetro para definir a versão manualmente.
