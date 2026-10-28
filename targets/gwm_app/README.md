# 🎯 ALVO: gwm_app (My GWM Brasil — GWM Ora 5)

> **Descrição**: Análise de Engenharia Reversa do ecossistema My GWM Brasil (`com.gwm.brazil` v1.4.2) e API Cloud de Telemetria/Comandos para o **GWM Ora 5** com foco na integração à plataforma **Mizin Home**.  
> **Versão da Análise**: `v0.8.0 (build 0010)`
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
*Estado original por Antigravity; diagnóstico LAN atualizado por Codex em 2026-10-27/28.*

### Menu de engenharia: retorno do proprietário e pesquisa de comentários — 2026-10-28

O proprietário tentou a dica do vídeo do Dargo e confirmou que **nenhum painel nem pedido de senha apareceu** no ORA 5 **3.3.00213**. A leitura dos comentários e de um projeto público de HUT trouxe uma pista de habilitação diagnóstica, ainda sem compatibilidade comprovada com esta central. Pesquisa e limitações em [`notes/09_engineering_menu_followup_20261028.md`](notes/09_engineering_menu_followup_20261028.md); recibo estruturado em [`evidence/coffee-os-engineering-menu-20261028.json`](evidence/coffee-os-engineering-menu-20261028.json). Sem contato com o carro ou execução de ferramentas CAN/OBD.

### Pesquisa pública e manual brasileiro — 2026-10-28

Revisado o histórico de **Recomendações GWM ORA 5** e as fontes públicas: há um APK público de música **Impulsefy v0.1.3**, APKs de sistema de um **H6 2021 Android 9** e uma **declaração comunitária de ADB no Dargo 2026 Coffee OS 3**. Nenhum deles comprova instalação/acesso no ORA 5 brasileiro **3.3.00213**. Sem contato com o veículo nesta pesquisa. Fontes, artefatos, classificação e próximos passos em [`notes/08_watch_review_20261028.md`](notes/08_watch_review_20261028.md).

O manual oficial foi baixado: **342 páginas, edição 25/05/2026, 5.321.333 bytes**, SHA-256 `e2a5641a247ee4e77f1ab0080692559917377193ccc39c2c5dce34c702b4bbcf`, igual à baseline histórica. **Nenhuma alteração real do manual detectada.** Suas páginas impressas **154 e 224** confirmam que Diagnóstico e reparo é manutenção de alta tensão que impede condução/recarga. O agendamento web não foi modificado nem duplicado.

### Versão confirmada nas fotos da central

Inspeção visual das fotos do proprietário em **Sistema → Sobre** confirma **Coffee OS 3.3.00213**. A transcrição está registrada em [`notes/07_coffee_os_photos.md`](notes/07_coffee_os_photos.md); o arquivamento das fotos e seus hashes não foi concluído porque os arquivos não foram encontrados nas tentativas posteriores de cópia. A tela também mostra **Diagnóstico e reparo → Ligar**; o ícone ⓘ não abriu descrição segundo o proprietário. Não houve ativação. A revisão posterior do manual do próprio ORA 5 confirmou o modo de manutenção veicular, sem relação comprovada com depuração da multimídia. O significado de 851 na verificação de atualização e a versão mais recente disponível permanecem não confirmados.

### Diagnóstico LAN com a central ligada

O proprietário confirmou **ORA 5 2026/2027, Coffee OS 3**, estacionado em P e ligado. O IP `192.168.1.119` passou a responder; MAC observado `30:4A:C4:79:46:D5`. A porta **7000** respondeu como **AirTunes/450.14.1**, com RTSP OPTIONS 200. Das 18 portas selecionadas, nenhuma outra ofereceu conexão na coleta registrada. A consulta de metadados `/info` retornou 455 no estado atual. Não foi obtido acesso ao sistema, firmware completo ou telemetria, e nenhuma função foi alterada. `450.14.1` não é a versão do Coffee OS.

Consultar [`notes/06_local_wifi_powered_on.md`](notes/06_local_wifi_powered_on.md) e [`evidence/lan-probe-2026-10-28T02-56-20.657Z.json`](evidence/lan-probe-2026-10-28T02-56-20.657Z.json). A versão completa já foi identificada nas fotos acima. Próximos passos: identificar uma interface documentada ou um artefato legítimo para REA/Ghidra, orientado ao build 3.3.00213. Script reproduzível: `node targets/gwm_app/scripts/probe-local-network.mjs`.

### ✅ Concluído nesta etapa:
- [x] Inicialização isolada do alvo `targets/gwm_app` segundo a diretriz `AGENTS.md`.
- [x] Execução do **REA (`rea@6.7.0` — `analyze-javascript-application`)** para reconstruir e selar o grafo semântico dos conectores GWM Brasil (`evidence/rea_js_analysis.json`).
- [x] Extração e verificação de integridade (`SHA256SUMS.txt`) dos certificados mTLS da GWM (`binaries/certs/`).
- [x] Teste ativo de conectividade e handshake mTLS nos dois gateways brasileiros da GWM (`evidence/br_gateway_probe.json`), confirmando `HTTP 200` e aceitação dos certificados em produção.
- [x] Documentação técnica completa em `notes/01_overview.md`, `notes/02_architecture.md`, `notes/03_protocols_apis.md` e `notes/04_crypto_security.md` (mais de 40 sensores mapeados: SoC, autonomia EV, TPMS em PSI/°C, portas, vidros, teto solar, A/C, bateria 12V, GPS e recarga).
- [x] Reconstrução do SDK/CLI zero-dependências em [`reconstructed/gwm-ora-client.mjs`](reconstructed/gwm-ora-client.mjs).

### 🚀 Próximos Passos:
0. **Histórico: central desligada em 2026-10-27 (Codex)**: o IP informado `192.168.1.119` não respondeu a ping nem às tentativas TCP 80/443; sem entrada ARP. Essa observação foi superada pela coleta com a central ligada descrita acima. Evidência anterior preservada em [`notes/05_local_wifi.md`](notes/05_local_wifi.md) e [`evidence/lan-192.168.1.119-20261027.json`](evidence/lan-192.168.1.119-20261027.json).
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
