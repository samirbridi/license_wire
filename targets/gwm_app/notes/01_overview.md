# 01 - Visão Geral e Superfície de Integração (My GWM Brasil — GWM Ora 5)

## 1. Identificação do Alvo
- **Aplicativo Oficial (Brasil)**: **My GWM** (`com.gwm.brazil`)
- **Desenvolvedor**: Great Wall Motor Brazil Ltda.
- **Veículo Alvo**: **GWM Ora 5 / Ora 03** (Plataforma GWM T5 / T-Box Conectado)
- **Objetivo**: Obter telemetria completa em tempo real (SoC da bateria, autonomia, status de recarga, pressão/temperatura dos pneus, estado de portas/vidros/teto solar/trava, temperatura interna, bateria 12V e GPS) e comandos remotos (ar-condicionado, travas, vidros, programação de carga) para integração direta na plataforma **Mizin Home**.

## 2. Descobertas via REA (`rea@6.7.0`) e Provas de Conectividade
1. **Reconstrução Estática de Grafo de Aplicação (`rea analyze-javascript-application`)**:
   - O motor REA processou e selou o grafo semântico dos conectores de referência da nuvem GWM Brasil (`havaleiros_carConnector.js`, `havaleiros_index.js`, `havaleiros_map.js`, `havaleiros_schema.js`), gerando o pacote de evidência verificada em [`evidence/rea_js_analysis.json`](../evidence/rea_js_analysis.json).
   - Cruzamos também a implementação oficial multi-região do ecossistema GWM Ora (`LibGwmApi` / `VehicleSnapshotMapper.cs`), identificando mais de **65 códigos numéricos de telemetria** reportados pelo T-Box do veículo.
2. **Validação Ativa dos Gateways GWM Brasil (`evidence/br_gateway_probe.json`)**:
   - **Gateway de Autenticação (`br-front-service.gwmcloud.com`)**: Testado e ativo (`HTTP 200`, retorno esperado `code: "308001"` para credenciais de teste).
   - **Gateway de Telemetria e Comandos (`br-app-gateway.gwmcloud.com`)**: Exige **Mutual TLS (mTLS)** com certificado cliente GWM (`gwm_general.cer` + `gwm_general.key`) e CA própria (`gwm_root.cer`). O handshake mTLS foi validado com sucesso (`HTTP 200`, `code: "000000"`, `description: "SUCCESS"`).
