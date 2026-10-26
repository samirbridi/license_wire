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

## Validação visual

O navegador recusou a tentativa anterior de conferir a interface por falha da revisão automática, que informou limite de uso. Não foi usado outro navegador/renderizador para contornar a restrição. Conferência visual ficará explicitamente pendente até acesso normal voltar ou revisão manual do proprietário.
