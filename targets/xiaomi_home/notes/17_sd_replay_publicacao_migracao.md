# SD, publicação e migração — 2026-10-27

## Evidência real

`scripts/validate-sd-playback.py` consulta somente fontes do inventário privado autorizado, lê o catálogo, cria um alias temporário de replay e o remove ao concluir. Catálogos reais retornaram milhares de arquivos nos três modelos. Os vídeos de cinco segundos das duas vistas CW701, AW300 Garagem e HLC7 Sala foram exportados e decodificados. As imagens e os clipes permanecem privados.

`scripts/validate-central-sd.mjs` repetiu a exportação pela API autenticada da central. Os quatro MP4 H.264 têm duração 5,000 s; CW701 mantém 2880×1620 e AW300/HLC7 mantêm 2304×1296. A conferência do quadro em 4 s confirmou o avanço do relógio original. A resolução foi preservada; o vídeo passou por transcodificação e não equivale a uma cópia binária do arquivo SD.

Na Outdoor, a imagem de 20:01:20 corresponde ao instante 12:01:20 UTC / 09:01:20 São Paulo. AW300/HLC7 usam o horário de São Paulo na sobreposição observada. A interface trabalha com épocas UTC e exibe São Paulo. Seleção de lente usa canais SD 0/10. O MP4 de replay exclui a pista de áudio ainda não validada; incluí-la causava espera e congelamento na remultiplexação.

## Interface e limites

Calendário por mês/dia, dias com arquivos, escala de 24/6/1 horas, seleção de horário, replay e download. A disponibilidade desconhecida continua distinta de um catálogo vazio. A exportação atual cobre até 60 s dentro de um único arquivo, sem áudio. Não há montagem de múltiplos arquivos nem reprodução contínua automática. Todos os endpoints exigem sessão; aliases e endereços físicos ficam no servidor.

As alterações existentes da ponte nos quatro arquivos de transporte foram revisadas e preservadas para integrar o catálogo e o replay já testados. O novo ajuste impede `autoswitchtolive` também no HLC7. O teste do comando verifica as três famílias; a troca do executável exige nova conferência real. PTZ, zoom, rondas, gravações com áudio e fala ainda não estão liberados como recursos validados desta interface.

## Cloudflare

Projeto Pages `homecams`, Worker privado `homecams-gateway`, túnel nomeado `homecams-private` e serviço VPC limitado ao HTTP 127.0.0.1:19846. O gateway usa segredo privado, origem HTTPS fixa e sessões separadas do acesso local. Convites têm uso único e expiram em dez minutos. Sem sessão, inventário, snapshots, vídeos e SD devem retornar 401. O Worker não possui endereço workers.dev; somente o binding do Pages pode chamá-lo. Publicar somente `public/` e `_worker.js`, sem runtime, inventário, cookies ou clipes.

Workers VPC está em beta, gratuito durante o beta, sujeito às cotas normais do Workers: https://developers.cloudflare.com/workers-vpc/configuration/vpc-services/ . Isso não substitui o computador que se comunica com as câmeras. R2 é armazenamento e não executa esta ponte ou FFmpeg.

## Oracle e NAS

Consultas autenticadas na conta Oracle confirmaram região principal São Paulo, nenhuma VM ativa e cotas A1 de 2 OCPUs/12 GB. O relatório oficial de capacidade retornou `OUT_OF_HOST_CAPACITY` para essa configuração. Não houve criação de VM ou contratação paga. Não presumir disponibilidade ou SLA do Always Free.

O usuário informou Synology DS425+ e o endereço local do DSM. O modelo usa Intel Celeron J4125; especificações oficiais: https://www.synology.com/en-br/products/DS425%2B . A porta 5000 redirecionou para 5001, onde o navegador bloqueou o certificado com `NET::ERR_CERT_AUTHORITY_INVALID`. A resolução do aviso e login foram entregues ao proprietário. Não houve desativação da validação TLS ou alteração do NAS.

O pacote Linux usa Node/FFmpeg, binário próprio da ponte e cloudflared em contêineres com reinício automático. Configurações privadas são montadas fora das imagens. Execução no NAS, consumo de CPU/RAM, reconexão e teste com Windows desligado continuam pendentes. A existência de Docker/arquitetura compatível não comprova funcionamento no DS425+. Um VPS remoto exige validar P2P pela internet ou manter um conector na rede das câmeras. O usuário ainda não definiu orçamento mensal.

## Comandos reproduzíveis

```powershell
node.exe --test targets/xiaomi_home/reconstructed/mizin-cameras/test/*.test.mjs targets/xiaomi_home/scripts/test-version-build*.mjs
powershell.exe -File targets/xiaomi_home/scripts/build-camera-bridge.ps1 -RunId <identificador-unico>
powershell.exe -File targets/xiaomi_home/scripts/start-central.ps1 -Restart
powershell.exe -File targets/xiaomi_home/scripts/publish-cloudflare.ps1 -Wrangler <caminho-wrangler-oficial>
```

O build calcula versão/changelog pelos commits, verifica módulos Go, aplica os patches em cópia isolada e gera Windows/Linux amd64. Nunca alterar o cache Go compartilhado para compilar a ponte.
