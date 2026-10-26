# Visão dupla, gravações e rondas

## Requisitos do proprietário

Em 2026-10-26 foram incorporadas as seguintes diretrizes:

- Outdoor Pro mostra as duas vistas juntas por padrão. Selecionar uma vista define foco de controles/áudio; ampliar uma vista é opcional.
- Joystick e zoom devem atuar na vista fisicamente correta. Ler as posições/rondas existentes antes de oferecer uma automação própria.
- Gravações SD devem ser pesquisáveis por mês e dia, com timeline, busca temporal, seleção de início/fim e download do trecho.
- Continuar a investigação sem USB.

## Alterações deste ciclo

O painel tem duas prévias por Outdoor Pro e um player com dois vídeos independentes. A seleção de foco não recarrega os fluxos. Ampliar para uma vista encerra o fluxo oculto e permite voltar às duas. Apenas uma vista fica com áudio audível por vez. O backend permite duas vistas da mesma câmera por sessão e até dois clientes; trocar de câmera ou encerrar sessão encerra os processos correspondentes.

Os testes unitários usam processos sintéticos explicitamente identificados como fixtures; não são apresentados como dados reais. O teste de mídia real é separado em `scripts/probe-central-dual.mjs`, que lê os dois canais reais e decodifica H.264/AAC para descarte. Resultados finais constam nos recibos de build.

O diagnóstico de abertura concorrente encontrou timeout UDP no go2rtc para uma vista enquanto a outra conectava. Iniciar a segunda após a primeira produzir dados permitiu ambas decodificarem 120 quadros a 2880×1620, com 3946 ms de sobreposição. Esse primeiro resultado usou inicialização ordenada no cliente de diagnóstico. A correção do servidor ordena apenas a inicialização por câmera física, compartilhada entre prévias e vídeo, e libera a próxima conexão no primeiro dado do vídeo; os fluxos continuam simultâneos depois. A suíte verifica essa concorrência e o limite de clientes. A prova final usa duas requisições concorrentes sem escalonamento no cliente.

No build 0008, a prova real concorrente passou nas duas vistas: H.264 2880×1620, AAC 48000 Hz, 120 quadros por vista e 5376 ms de sobreposição. Mi 2K e AW300 passaram em H.264 2304×1296 e AAC. O primeiro teste após reinício falhou porque os aliases não persistiam na ponte, e não por perda da autorização: o cadastro preservado foi restaurado e os testes passaram. O inicializador agora sobe a ponte local quando necessário e restaura apenas aliases ausentes; preserva os existentes e não encerra processos que ocupem portas.

A prévia AW300 no perfil padrão voltou a apresentar timeout UDP, enquanto o perfil nativo já validado funcionou. Prévias e reprodução passam a reutilizar o perfil nativo conhecido; tamanho e bitrate do vídeo entregue continuam obedecendo à qualidade escolhida. Isso também evita alternar o perfil de entrada ao abrir uma prévia. O rótulo de prévia leve deixa de usar SD, para não confundir resolução reduzida com cartão de gravação.

O primeiro teste completo do inicializador encontrou um arquivo legado com JSON na primeira linha e aliases YAML acrescentados depois. A validação JSON do build 0009 recusou esse arquivo. O arquivo inteiro foi copiado para uma preservação privada e uma configuração YAML nova foi criada com os mesmos dados de autorização e as fontes conhecidas. O inicializador passa a fornecer uma última configuração de rede separada, em runtime, forçando API/WebRTC em loopback e RTSP desabilitado sem interpretar ou reescrever credenciais. O suporte a múltiplos arquivos foi conferido no help do go2rtc v1.9.15. O teste de reinício e as portas efetivas são registrados em recibo próprio.

A consulta de gravações tem mês, dia, navegação anterior/próximo, eixo diário e campos de trecho. Enquanto o adaptador SD não existir, `periods` e `availableDays` retornam null, os controles de reprodução/exportação ficam desabilitados e o painel informa que o acesso está em preparação. Não há gravações fictícias nem inferência de cartão vazio.

O modelo de timeline já trata mudança de mês/ano e fevereiro bissexto, busca no próximo período gravado ao atravessar lacunas, recorte nos limites de arquivos e remoção de sobreposições. Os testes desse modelo usam intervalos sintéticos. Isso não representa leitura ou exportação do SD implementada.

## Rondas e posições: sequência de integração

1. Ler posições existentes, limites, posição atual, suporte a velocidade e a parada imediata. Identificar qual vista possui motor/zoom.
2. Preservar as configurações atuais e distinguir ronda nativa da câmera de uma ronda executada pela central.
3. Permitir ordem dos pontos, tempo de permanência, transição dentro do suporte real, dias/horários e intervalos.
4. Dar prioridade ao joystick manual, pausar a ronda e exigir uma retomada explícita ou uma política configurada. Validar parada antes da primeira execução automatizada.
5. Criar novos pontos por captura de posição real quando o protocolo permitir; não atribuir coordenadas fictícias a nomes de presets.

Nenhuma posição/ronda foi criada ou executada. O UI mostra controles físicos em integração, sem botões de movimento operacionais.

## Gravações SD: integração pendente

Será necessário mapear catálogo do cartão, busca/seek, sessão de playback e transferência do trecho por modelo. A timeline trabalhará com instantes normalizados; o fuso das câmeras ainda precisa ser identificado e relacionado ao horário de São Paulo. Arquivos originais e exportação compatível MP4 deverão ser distinguidos quando houver acesso aos dados. Precisão do corte, áudio e comportamento nos limites de GOP devem ser validados com gravações reais.

## Investigação sem USB

Foi localizada uma distribuição oficial de desenvolvimento do Xiaomi Home no QR Android do README MiEcosystem. O APK completo foi baixado e preservado em `runtime/apk-research/`, com 366660582 bytes e SHA256 `2746ba8d14155eb301661b25851c0e37e15b55a2052295d84428573885f063fc`. O hash confirma a cópia coletada; a assinatura APK ainda não foi validada.

O manifesto indica com.xiaomi.smarthome 11.7.599, versão de desenvolvimento distinta da versão 11.8.707 anunciada pela loja. A inspeção dos 110 DEX identificou PluginUpdateManager.downloadPluginInternal → PluginPackageManager.createPluginInfoParams → PluginUpdateApi.updatePlugin → POST /v2/plugin/fetch_plugin → SmartHomeRc4Api.sendRequest. Model/package_id/type, latest_req/backup_req e download_url aparecem no contrato estático; os valores completos e os pacotes dos três modelos ainda precisam ser confirmados. Nenhum APK foi instalado/executado, aparelho acessado ou comando de câmera adivinhado. O provider JADX oficial foi localizado e teve SHA256 conferido com o upstream; seus resultados devem ser registrados separadamente da inspeção DEX própria.

O APK completo excedeu o prazo de 120 s no provider. Um ZIP de análise derivado, sem assinatura, com manifesto original e classes27.dex renomeado para classes.dex permitiu `inspect-android-method ... com.xiaomi.smarthome.server.api.PluginUpdateApi updatePlugin --format json --full-output`. O resultado REA contém corpo smali disponível, com fallback após falha da geração Java; não é uma decompilação Java bem-sucedida. A instrução confirma latest_req.app_platform="Android", latest_req.package_type="", api_version vindo de RN_NATIVE_API_LEVEL e backup_req.api_level/app_platform vindos do chamador. Hashes e limites estão em evidence/builds/20261026-plugin-request-static-qa.json. Naquela coleta estática inicial, nenhum endpoint autenticado de plugin havia sido chamado. A consulta posterior, os pacotes verificados e o protocolo descoberto estão documentados em notes/13_plugins_sem_usb.md.

## Validação visual

O navegador recusou uma tentativa anterior por limite de uso na revisão automática. Após o período informado, o acesso normal voltou em 2026-10-26, sem navegador alternativo. A conferência do build 0008 confirmou as duas vistas juntas em 2880×1620, ambas sem pausa, com o tempo de reprodução avançando. Trocar o foco para a vista 2 preservou as duas reproduções. A interface de gravações mostrou mês/dia, disponibilidade ainda desconhecida e exportação desabilitada. Capturas reais ficam somente em evidence/private; Android físico e revisão visual do proprietário continuam pendentes.
