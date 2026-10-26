# Plugins por modelo e protocolo SD sem USB

## Estado e proveniência

O proprietário informou Xiaomi Home **11.8.701.5676-MI_APP_STORE**. A base Android analisada é a distribuição oficial de desenvolvimento **11.7.599**; não são a mesma distribuição. Nenhum APK ou módulo foi instalado ou executado. Os arquivos originais estão em binaries e seus hashes em SHA256SUMS.txt. Código derivado do fabricante permanece somente no runtime privado.

O APK completo tem 110 DEX principais. REA/JADX recebeu subconjuntos de análise sem assinatura, com manifesto original e DEX renomeados, para reduzir o custo de carregamento. O método updatePlugin tem corpo smali disponível após falha da geração Java; getHost/getMainland/getSid, buildHost/buildHostPath e downloadPluginInternal tiveram resultados Java. Isso não equivale à validação de assinatura do APK nem a executar o aplicativo.

## Autenticação e consulta de software

A cadeia confirmada é PluginUpdateManager.downloadPluginInternal → PluginPackageManager.createPluginInfoParams → PluginUpdateApi.updatePlugin → SmartHomeRc4Api. O pedido usa POST /v2/plugin/fetch_plugin, prefixo core., caminho intermediário /app por padrão, e servidor de produção China api.mijia.tech.

SmartHomeServer.getSid escolhe **mijia** para China, **xiaomiio** para internacional e mijia-test para staging. MijiaCookie consulta o token do SID escolhido. A primeira consulta com token xiaomiio teve login válido, mas HTTP401 na API China. Após reconstruir essa seleção no código, a consulta com mijia teve loginCode0, HTTP200 e serverCode0. Não foram solicitados senha, código por mensagem, USB ou troca de região. O token já autorizado foi utilizado apenas nos serviços Xiaomi esperados; cabeçalhos de autorização não foram publicados.

Campos confirmados: latest_req.api_version=10117; app_platform=Android; region=cn; package_type vazio; plugins com model, package_id=0 e type vazio. backup_req usa API_LEVEL111 e SystemApi.getPlatform()=phone. Isso é informação da base inspecionada, não uma suposição de que todos os valores são idênticos no APK instalado do proprietário.

Os metadados forneceram pacotes completos CW701v58, AW300v46 e HLC7v87, além de HLC7v127. A AW300 anunciava versão50 sem URL nesse registro; não foi fingido que o pacote46 é a versão50. Tamanho e MD5 foram conferidos contra a resposta autenticada, e SHA256 calculado localmente. Assinaturas de pacote permanecem não validadas. Ver evidence/plugin-packages.json.

## Bundle da Outdoor

O pacote CW701 contém android/main.bundle, 11361009 bytes, SHA256 2c76fb3193b17845f831cae09afc3a6626134c6894b957ccf6b58e7cd7eaba08. É Metro indexed RAM, magic0xFB0BD1E5, 14912 slots e 936 entradas não vazias. O código não é minificado e o startup referencia10120 e10001. O leitor próprio scripts/unpack-metro-ram.py confere limites e terminadores; extrai apenas para runtime/evidence privados. A estrutura foi comparada ao escritor oficial Metro.

Comando de extração: `python scripts/unpack-metro-ram.py runtime/plugin-analysis/xiaomi.camera.cw701-package1047343-v58/main.bundle runtime/plugin-analysis/xiaomi.camera.cw701-package1047343-v58 --include 10826 10820 10120 10001`, a partir deste alvo.

REA analisou estaticamente cinco fontes selecionadas, sem executar o bootstrap: `analyze-javascript-application runtime/plugin-analysis/xiaomi.camera.cw701-package1047343-v58/modules --artifact-format directory --source-path module-10418.js --source-path module-10436.js --source-path module-10814.js --source-path module-10826.js --source-path module-10832.js --detail summary --max-semantic-nodes 50000 --max-heap-mb 1024 --analysis-timeout-ms 60000 --format json --full-output`. A invocação usou o wrapper local `runtime/apk-research/Invoke-REA-Local.ps1` e salvou o resultado privado em `rea-cw701-js-summary.json`. Houve cinco fontes parseadas e zero falhas de parsing; as 204 fontes não selecionadas e dependências externas deixam o grafo parcial. Isso é evidência estática, não execução na câmera.

## SD: fatos do plugin CW701

O módulo10418, offset3293295 no bundle, contém o gerenciador SD de dois canais. Não confundir com o gerenciador alternativo10451.

- Catálogo: RDT comando6; 32 bytes, oito u32 little-endian `[6,0,0,0,canal,0,0,0]`. Consultas separadas para canais0 e10. Não há mês/dia na requisição.
- Resposta: cabeçalho com comando em0, tamanho em4, status em8 e corpo a partir de12. Há remontagem de fragmentos antes da interpretação.
- Entradas de catálogo: 8 bytes; u32 timestamp em segundos, duração de um byte (zero significa60s), movimento no byte5, proteção/save no6, deleting no7. Entradas em exclusão são descartadas. Timestamp e canal identificam arquivos; índice no array não é ID persistente.
- Dias e meses são derivados dos timestamps na interface. O plugin usa Date/Day.js no fuso local do JavaScript, sem ajuste explícito UTC+8 nesse fluxo. A comparação com timestamps reais do cartão continua necessária.
- Eventos por dia: RDT11, JSON com literal mac F1F2F3F4F5F6, data YYYYMMDD e canal. O JSON é preenchido até múltiplo de4 e precedido por `[11,tamanho]`. Esse MAC é literal do software, não identificação coletada da câmera.
- Download de arquivo: RDT1, 24 bytes `[1,4,timestampSegundos,0,canal,0]`. Thumbnail: RDT5, `[5,0,timestampSegundos,0,canal,0]`. Não foi demonstrado download arbitrário início/fim; será necessário obter arquivos e recortar/remontar localmente para exportar um trecho exato.

Os módulos10436 (offset3476092) e11036 (offset4833383) controlam replay. O pedido usa sessionid, arrays starttime/endtime/offset/speed/channel, autoswitchtolive0 e avchannelmerge1. Replay duplo usa canais `[0,10]`, que não devem ser confundidos com o parâmetro channel2 da fonte ao vivo. Seek encontra o arquivo que cobre o instante e reabre a sessão com seu timestamp e offset. Se um canal não cobre o instante, reproduz o disponível.

O SDK externo define playback0x10D/0x10E e velocidade0x10F. Parar replay também altera a sessão de mídia; não é uma consulta passiva. Formatação, exclusão, proteção e mudanças de configuração não fazem parte da implementação de leitura.

## Posições e rondas

O módulo10832 (offset4411690) define leitura de configuração de posições9200 e estado da ronda9204, além de setters separados. O wrapper10814 usa IOTYPE_USER_DEFINED_START_MISS0x7FFFFFFF e conteúdo hexadecimal. O protocolo10826 usa magicHL, versão5, cabeçalho16 bytes; opcode u16 em4, tamanho em6 e seleção de câmera em8. São fatos estáticos: resposta física e associação efetiva às vistas ainda precisam ser conferidas.

O cliente aberto go2rtc nomeia motor0x112 como requisição e0x113 como resposta. **0x113 não foi considerado uma parada de motor.** A parada correta deve ser demonstrada no caminho específico do modelo antes de liberar joystick ou rondas. Nenhuma posição foi criada, alterada ou executada.

## Transporte e próxima fronteira de validação

Catálogo e arquivos usam RDT; replay usa MISS/P2P. A API HTTP da ponte atual não expõe essas operações. Localizar payloads no plugin não demonstra suporte do transporte nem leitura real do cartão.

Foi preparado um diagnóstico independente com somente a requisição fixa de informações do dispositivo 0x110. O corpo HL9200 é validado estaticamente, mas sua transmissão está bloqueada até demonstrar o encapsulamento no caminho nativo. O prefixo de requisição MISS é big-endian, conforme o cliente aberto; o corpo HL usa u16 little-endian. Não inicia mídia, não escreve no cartão e não implementa comandos de movimento. Seu resultado de compilação e eventual teste físico devem ser registrados em recibos separados; o app mantém SD e controles físicos indisponíveis até essa validação.

## Referências

- [SDK oficial MiEcosystem](https://github.com/MiEcosystem/miot-plugin-sdk).
- [Transporte Xiaomi aberto go2rtc](https://github.com/AlexxIT/go2rtc/tree/v1.9.15/pkg/xiaomi).
- [Formato oficial Metro RAM bundle](https://github.com/facebook/metro/blob/main/packages/metro/src/shared/output/RamBundle/as-indexed-file.js).
