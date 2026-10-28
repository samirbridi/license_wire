# Revisão do acompanhamento Coffee OS / ORA 5 — 2026-10-28

## Estado Atual e Próximos Passos

**Existe material público de APKs para GWM/Haval. Não foi encontrado um instalador, dump ou procedimento reproduzível comprovadamente compatível com o ORA 5 brasileiro 2026/2027, Coffee OS 3.3.00213.** Foram identificadas referências concretas para análise e uma pista comunitária de outra implementação Coffee OS 3. Isso corrige a interpretação excessivamente ampla de que não haveria material algum, sem transformar arquivos de outros veículos em compatibilidade confirmada.

A revisão foi exclusivamente de fontes públicas e do histórico do acompanhamento. O carro pode permanecer desligado. Nenhuma nova consulta ao IP do veículo, credencial My GWM, instalação, ativação de manutenção ou gravação de configuração/firmware foi realizada.

Prioridades: verificar a pista Dargo com identificação de build/hardware, examinar candidatos por análise estática e procurar artefato legítimo correspondente ao build brasileiro. Uma aplicação de música já compilada é um candidato futuro de aplicativo, não um meio de abrir uma interface ADB que ainda não foi identificada.

## Contexto do acompanhamento existente

Foi lida a conversa **Recomendações GWM ORA 5**, cujos registros chamam o acompanhamento de **ORA 5 & Coffee OS Watch**. O histórico já distinguia ferramentas antigas, telemetria via nuvem e as OTAs chinesas de abril/julho de um método aplicável ao Brasil. Não foi auditada a configuração ativa do agendador web; nenhuma automação foi criada ou modificada e nenhuma mensagem foi enviada à outra conversa.

As descobertas abaixo são novas referências nesta revisão; as datas de publicação permanecem explícitas. Não são apresentadas como lançamentos de hoje. Manual inalterado e mudança editorial em site não devem gerar alerta recorrente de novidade técnica.

## APKs e ferramentas: fato verificável, relato e limite

### 1. Impulsefy: APK público e código-fonte

[Repositório do autor](https://github.com/paulovitin/impulsefy) e [release v0.1.3](https://github.com/paulovitin/impulsefy/releases/tag/v0.1.3), publicada em **04/10/2026**. O GitHub apresenta `impulsefy.apk`, 4.424.888 bytes, e arquivo SHA-256. Digest informado pelo GitHub: `0ca87d5e7360c9cadb53509762a2e10985f28dcd26179ce97e6a3581539c6278`.

O fonte inspecionado declara `com.impulsefy`, Android mínimo API 23, target 28, compile 36 e release ARM64. A biblioteca opcional `ts.framework` e a classe `ts.car.audio.AudioExtManager` são usadas para volume quando disponíveis. O autor relata testes em um Haval, sem comprovar o mesmo build/hardware do ORA 5 brasileiro.

**Confirmado:** existência do release e dos campos de código/documentação. **Não confirmado:** assinatura confiável para o proprietário, execução no ORA 5 ou compatibilidade do volume proprietário. O APK não foi baixado ou executado; o digest é metadado do GitHub, não hash calculado localmente. A instalação documentada exige ADB previamente disponível. README/tarefas ainda mencionam 0.1.0; a versão do release foi obtida da API e não deduzida dessa documentação.

### 2. APKs de sistema do Haval H6 2021: referências de plataforma antiga

O [repositório do pesquisador](https://github.com/MyburghRoux/haval_h6_Infotainment) contém um [diretório de APKs](https://github.com/MyburghRoux/haval_h6_Infotainment/tree/main/recon/apks), cuja listagem foi consultada pela API GitHub:

| Arquivo | Bytes declarados na listagem |
| --- | ---: |
| GwmEngineerMode.apk | 5.112.234 |
| GwmSetting.apk | 18.865.704 |
| PackageInstaller.apk | 3.925.179 |

O autor identifica **H6 2021 da África do Sul, APTIV, Android 9, Renesas R-Car H3**, plataforma `gwmv3`, e relata ADB, instalação e Aurora Store nessa unidade. Os arquivos existem na listagem; não foram baixados nem inspecionados binariamente nesta revisão. O procedimento e os resultados de execução permanecem evidência comunitária do veículo do autor.

Pacotes citados nessa plataforma: `com.gwmv3.engineermode`, `com.gwm.app.appstore`, `com.gwm.app.themestore`, `com.aptiv.thememanager` e `com.tencent.sotainstaller`. Nenhum desses identificadores foi confirmado na central do proprietário. O part number legado `7901105XKN11A` não foi atribuído ao ORA 5. A coincidência da porta AirPlay/CarPlay 7000 tampouco demonstra equivalência entre centrais.

### 3. Dargo 2026 com Coffee OS 3: pista comunitária específica

O criador **Про технику** publicou em **08/09/2026** um [vídeo denominado Haval Dargo 2026 — menu de engenharia e ativação ADB](https://rutube.ru/shorts/c436b66bd38a1cfcfee99abd2eefb65b/). A [descrição no canal](https://rutube.ru/channel/50494223/shorts/) menciona expressamente Coffee OS 3 e instalação posterior de APKs.

**Verificado:** título, data pública e declaração do criador. **Pendente:** inspeção dos passos visuais, número de build, fabricante/part number, dump e teste independente. A API de metadados retornou 403; o título de um vídeo não valida um método. Os excertos de busca do 4PDA também mencionam Dargo26/Android 11, mas a página completa retornou 403 e não foi usada como confirmação técnica. Não transferir códigos ou procedimentos de Dargo para ORA 5 sem correspondência de plataforma.

### 4. 90APT: suporte declarado continua em gerações anteriores

A [página do projeto](https://gwm.90apt.com/) e o [README](https://github.com/tntsec/90apt) listam H6 de terceira geração 2021–2024, Dargo de primeira geração 2021–2024, H6 Classic 2024–2025 e alguns Tank 300 2021–2024, com centrais ADAYO/APTIV de 12,3 polegadas. Não foi encontrada declaração equivalente para o ORA 5 Coffee OS 3.3.00213.

O [commit 4e2e6f7](https://github.com/tntsec/90apt/commit/4e2e6f7eb4c7318e2c77818cb51281418c8e56b0), de 28/10 às 02:49 UTC (**27/10, 23:49 em São Paulo**), altera somente o nome de um grupo comunitário no HTML. Isso não representa novo suporte técnico. Os scripts, redirecionamento DNS e APKs oferecidos pelo projeto não foram executados.

### 5. Telemetria via nuvem: não é um instalador da central

O [ha-gwm-ev](https://github.com/moryoav/ha-gwm-ev) continua declarando Europa, Austrália/Nova Zelândia, Rússia e China continental na configuração. Brasil não está listado. O projeto já aparecia no acompanhamento. Seus sensores de bancos/volante e o pacote de integração Home Assistant não comprovam presença física dos atuadores, autorização no backend brasileiro ou acesso ao Android da central. Nenhum comando, conta ou sessão foi testado.

## Loja, permissões, câmeras e diferenças regionais

O [serviço conectado oficial brasileiro](https://www.gwmmotors.com.br/pt/servicos/servicos-conectados) e o manual do ORA 5 confirmam a loja oficial. O manual descreve gerenciamento de aplicativos e permissões nas páginas impressas 149 e 155. Isso não estabelece instalação de APK arbitrário por USB, Aurora Store ou permissões privilegiadas.

As [configurações chinesas](https://www.oraev.com/configure/EC15S/) e a [variante esportiva](https://www.oraev.com/configure/EC15/?ad_id=5) apresentam diferenças de equipamento, como tela de 15,6 polegadas, gravador dianteiro, localização por imagem e recursos de proteção/estacionamento sujeitos à versão. O [modelo brasileiro](https://www.gwmmotors.com.br/pt/modelos/ora5/specification) usa tela de 14,6 polegadas. A [GWM Austrália](https://www.gwmanz.com/au/news/gwm-unveils-the-all-new-ora-5-suv-priced-from-just-33-990-driveaway/) também anuncia ORA 5 com 14,6 polegadas e Coffee OS, sem publicar um instalador universal.

Não foi encontrada nesta revisão uma cadeia verificável de part numbers, hardware de câmeras/DVR, T-Box, backend, assinatura e firmware que permita converter recursos chineses para o ORA 5 brasileiro apenas por VIN/região/permissão. Não foi demonstrada câmera remota ao vivo, modo sentinela ou habilitação de aquecimento/ventilação por APK nesse build. O capítulo de aquecimento do volante na página impressa 47 já existia no manual e está sujeito à ressalva de equipamentos/mercados; não comprova o hardware instalado no carro do proprietário.

## Manual oficial: comparação com a baseline

A página [Manuais GWM Brasil](https://www.gwmmotors.com.br/pt/servicos/manuais) foi consultada. O link do ORA 5 verificado na listagem aponta para a mesma URL fornecida pelo proprietário. O PDF foi efetivamente baixado, preservado localmente e lido com pypdf/pdfplumber. Foram renderizadas as páginas PDF 2, 150, 155, 156 e 225; a edição e as páginas de loja, configurações e manutenção foram inspecionadas visualmente.

| Campo | Resultado em 28/10/2026 |
| --- | --- |
| URL | https://www.gwmmotors.com.br/content/dam/gwm/pages/br/pt/models/ora-5/manual-do-proprietario-ora-5.pdf |
| Edição interna | 25/05/2026 |
| Número de páginas | 342 |
| Tamanho | 5.321.333 bytes |
| SHA-256 | e2a5641a247ee4e77f1ab0080692559917377193ccc39c2c5dce34c702b4bbcf |
| PDF CreationDate | D:20260526031112+08'00' |
| PDF ModDate | D:20260611162931-03'00' |
| Creator | AH XSL Formatter V6.4 R1 for Windows (x64), 6.4.2.26942 |
| Producer | Antenna House PDF Output Library 6.4.928 (Windows (x64)) |
| HTTP Last-Modified | Wed, 24 Jun 2026 01:34:29 GMT |
| ETag | "0x8DED190BBF941D6" |

**Resultado: SHA-256 idêntico ao hash histórico do acompanhamento.** Não há alteração do arquivo em relação à baseline registrada. Assim, nenhuma adição, remoção ou alteração textual foi detectada nos assuntos pedidos: condução/amaciamento, bateria/recarga, manutenção/garantia, Coffee OS/OTA, recursos conectados ou equipamentos. Datas de edição, criação do PDF, modificação do PDF e HTTP Last-Modified são campos diferentes; não representam quatro revisões novas.

Limite: não havia uma segunda cópia histórica local para um `diff` direto. A comparação foi feita com o SHA-256 previamente registrado; a igualdade desse hash é a base da conclusão de identidade. O texto atual foi extraído integralmente para referência futura. O download retornou conteúdo servido por CDN (HIT); não foi realizada auditoria independente do armazenamento de origem.

### Confirmação útil do conteúdo, sem mudança do manual

O **próprio manual do ORA 5**, páginas impressas **154 e 224** (páginas PDF **155 e 225**), confirma que **Diagnóstico e reparo é um modo de manutenção que desenergiza a alta tensão e impede condução e recarga**. A cautela anterior baseada no Wey 07 agora tem confirmação específica do ORA 5. Isso não é um novo recurso nem uma mudança do arquivo; é esclarecimento relevante para o próximo passo da investigação.

A página [Atualizações GWM Brasil](https://www.gwmmotors.com.br/pt/experience/atualizacoes) continuava listando ORA 03 e Haval H6; não foi encontrada campanha pública específica do ORA 5. Isso não exclui disponibilização individual por VIN ou pela central, mas não fornece pacote público para análise.

## Cobertura e limites da pesquisa

| Região/fonte | O que foi conferido | Limite |
| --- | --- | --- |
| Brasil | GWM, manual, serviços conectados, atualizações, repositório Impulsefy | Sem método verificado para 3.3.00213 |
| China | Configurações ORA, Autohome, 90APT, GitHub, buscas chinesas | Recursos domésticos não comprovam compatibilidade brasileira |
| Zhihu | Busca e link de tutorial do próprio 90APT | Acesso direto 403; conteúdo integral não validado |
| Bilibili | Buscas em português/inglês/chinês e resultados indexados | Nenhum vídeo técnico qualificável de ORA 5/3.3.00213 validado; resultados genéricos rejeitados |
| V2EX | Buscas sobre Coffee OS e centrais GWM | Discussões genéricas/antigas, sem método reproduzível aplicável |
| México | GWM suporte e produto P300 PHEV; buscas em espanhol | Menção a Coffee OS não demonstra versão/central equivalentes; app móvel não é APK da central |
| Europa | Integração comunitária com região europeia e buscas inglês/alemão | Nenhum artefato correspondendo ao build brasileiro |
| Austrália/NZ | GWM ANZ e integração comunitária, buscas em fóruns | Firmware e disponibilidade regional não foram transferidos para o Brasil |
| Rússia, pista adicional | Autor do vídeo Dargo; busca 4PDA | Sem validação visual completa ou identificação de build/hardware |
| Android | Documentação oficial ADB | Depuração depende de configuração/pareamento em implementação compatível; documentação genérica não abre a central |

Notícias antigas reaparecendo em páginas rastreadas hoje, anúncios de serviço, agregações geradas por IA, resultados numéricos de outros assuntos e procedimentos de outros carros foram rejeitados como evidência de acesso ao ORA 5. A busca não é uma prova de inexistência universal, e fontes bloqueadas não foram tratadas como consultadas integralmente.

## Recibos e reprodução

- `evidence/coffee-os-watch-review-20261028.json`: catálogo estruturado e limites por referência.
- `evidence/manual-baseline-from-monitor-20261028.json`: baseline histórica e proveniência.
- `evidence/ora5-manual-http-20261028.txt`: cabeçalhos do download real.
- `evidence/ora5-manual-inspection-20261028.json`: tamanho, hash, páginas e metadados calculados.
- `evidence/ora5-manual-comparison-20261028.json`: comparação normalizada.
- `evidence/ora5-manual-text-20261028.txt`: extração textual atual.
- `evidence/manual-review-20261028/`: páginas renderizadas.
- `binaries/manuals/ora5-official-20261028.pdf`: cópia pública original, preservada segundo as regras de exclusão de binários do repositório.

Comando do download (a criação inicial também verificou que o destino não existia):

```powershell
curl.exe --fail --location --silent --show-error --connect-timeout 8 --max-time 40 --user-agent 'Mozilla/5.0' --dump-header 'targets\gwm_app\evidence\ora5-manual-http-20261028.txt' --output 'targets\gwm_app\binaries\manuals\ora5-official-20261028.pdf' 'https://www.gwmmotors.com.br/content/dam/gwm/pages/br/pt/models/ora-5/manual-do-proprietario-ora-5.pdf'
```

Inspeção: runtime Python indicado por `load_workspace_dependencies`, usando `pypdf.PdfReader`, `hashlib.sha256`, `len(reader.pages)`, `reader.metadata` e `extract_text()` por página. Renderização: `pdfplumber.open(...).pages[index].to_image(resolution=115).save(...)` para os cinco índices citados. A primeira impressão da inspeção falhou na codificação CP1252 do terminal depois de salvar os resultados; a leitura dos arquivos UTF-8 e a renderização posterior confirmaram o resultado. Nenhum resultado foi substituído por dados simulados.
