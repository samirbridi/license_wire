# Recursos nativos e acesso Cloudflare

## Requisitos confirmados pelo proprietário

O acesso externo será por link/login no Android, sem VPN. Tailscale foi recusado. O proprietário já utiliza Cloudflare R2. Todas as câmeras têm cartão SD, microfone e alto-falante. A Outdoor Pro tem duas vistas disponíveis no app e controles físicos de pan, tilt e zoom. Preservar a resolução efetiva do fluxo, incluindo 2K/3K e 4K se houver uma fonte real nessa resolução.

## Canais e qualidade comprovados

O código/documentação oficial go2rtc v1.9.15 distingue o canal secundário por `channel=2`. Modelos novos podem usar qualidade numérica 3 para a maior resolução, enquanto `hd` por padrão vira qualidade 2. A diferença explica os perfis reduzidos iniciais de AW300 e Outdoor Pro.

- Duas AW300: qualidade 3 entregou 2304×1296, 121 quadros em 6 segundos por unidade.
- Outdoor Pro, vistas 1 e 2: qualidade 3 entregou 2880×1620, 121 quadros em aproximadamente 6 segundos por vista.
- Mi 2K antes limitada a SD: qualidade 3 continuou entregando 640×360, mas os testes seguintes de qualidade 4 e 5 entregaram 2304×1296. O inventário utiliza o perfil 4 nessa unidade. As demais Mi 2K já tinham 2304×1296 comprovados no perfil anterior.
- Nenhum fluxo real em 3840×2160 foi comprovado.
- O seletor Resolução nativa preserva dimensões até 3840 pixels de largura, sem ampliar uma fonte menor. Continua convertendo H.265 para H.264; não significa cópia de codec/bitrate originais.
- O encoder NVENC passou no teste sintético 2880×1620 a 15 fps. A decodificação de entrada e o redimensionamento continuam em CPU. A reprodução real no navegador tem recibo próprio.

Referências: [módulo Xiaomi](https://github.com/AlexxIT/go2rtc/blob/v1.9.15/internal/xiaomi/README.md), `evidence/native-views-quality-qa-2026-10-25.json`, `evidence/gpu-encoder-qa-2026-10-25.json`.

## Áudio, voz, PTZ e SD

A prévia inicial de MP4 filtrava áudio AAC, descartando os codecs efetivos das câmeras. A consulta explícita `video=h265&audio=all` resolveu a entrada: três Mi 2K entregam áudio G711 convertido internamente para FLAC/8000 mono; AW300 e Outdoor Pro entregam OPUS/48000 estéreo. Os seis áudios foram decodificados por três segundos para descarte. O aplicativo agora converte para AAC/48000 junto do vídeo e oferece Ouvir/Silenciar, começando mutado em cada câmera. Não houve gravação nem reprodução física de conversas durante os testes.

O retorno de voz continua separado: manter áudio nativo no alias e negociar WebRTC autenticado, com permissão de microfone solicitada apenas por ação do usuário. O transporte WebRTC exige caminho ICE na etapa remota. Para uma futura saída WebRTC H.264, o código permite ingest transitório H.264/MPEG-TS por `POST /api/stream?dst=ALIAS`; a entrada do conversor deve fixar `video=h265` para evitar consumir seu próprio H.264.

O SDK oficial MiEcosystem, em `miot-sdk/service/miotcamera.js`, identifica playback 0x10D/0x10E, velocidade 0x10F e motor 0x112/0x113. Ele fornece wrappers `sendP2PCommandToDevice` e `sendRDTJSONCommandToDevice`, sem definir os payloads específicos de direção, parada, zoom, canal e busca temporal destes modelos. O próximo artefato para reconstrução é o plugin efetivamente baixado por modelo (RN/MPKG/plugin nativo), com versão/hash; o APK base sozinho pode ser insuficiente. [SDK oficial](https://github.com/MiEcosystem/miot-plugin-sdk/blob/master/miot-sdk/service/miotcamera.js).

As especificações oficiais MIOT foram obtidas de `https://miot-spec.org/miot-spec-v2/instances?status=all` e `instance?type=<URN>` e estão em `evidence/miot-spec/`. Elas são metadados públicos, não testes de comandos no dispositivo.

- CW701: esquema confirma propriedades e ações relacionadas a PTZ, zoom e áudio. As ações chamadas PTZ Calibrate são calibração; não substituem comandos direcionais. A propriedade Zoom Ratio tem enumeração 0/1 e não deve ser interpretada como fator óptico sem analisar o plugin nativo.
- Os serviços de cartão anunciam Format e Pop Up. Essas ações não reproduzem gravações e não foram executadas. O módulo MISS contém identificadores de playback, mas ainda precisamos reconstruir listagem, seleção temporal e reprodução do SD.
- Nenhuma câmera foi movimentada, calibrada ou reiniciada. Nenhum cartão foi formatado ou ejetado. Nenhum áudio foi enviado aos alto-falantes.

## Uso do R2

R2 é armazenamento de objetos. Pode receber arquivos de gravação e segmentos HLS, junto com um serviço que gere playlists e proteja as requisições. Ele não fornece sozinho sessão de usuário, conexão persistente com o Windows ou comandos de câmera.

Arquitetura candidata na conta Cloudflare do proprietário:

1. Windows mantém a conexão Xiaomi e executa a conversão de mídia sob demanda.
2. Workers trata link HTTPS, login, autorização e sinalização/comandos por conexão de saída do Windows.
3. Vídeo ao vivo usa WebRTC, com relay apropriado quando a rede exigir, ou HLS no R2 se for aceita maior latência.
4. R2 guarda cópias autorizadas de gravações/segmentos em bucket privado, acessadas por serviço autenticado. Não ativar cópia contínua nem tornar um bucket existente público por inferência.

HLS no R2 envolve armazenamento e operações cobradas, mesmo sem taxa de egress do R2. O túnel público genérico da Cloudflare tem restrições para vídeo; não presumir que seja CDN gratuita ilimitada. Escolha de transporte, limites de uso e qualquer custo devem ser definidos antes de publicar recursos ou enviar gravações.

Fontes oficiais: [R2](https://developers.cloudflare.com/r2/), [API R2 em Workers](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/), [limites de vídeo em Tunnel](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/#large-file-and-streaming-traffic-through-tunnel), [preço Realtime](https://developers.cloudflare.com/realtime/sfu/platform/pricing/).

O adaptador HTTPS do aplicativo foi implementado e testado com proxy simulado: origem exata, porta loopback separada, segredo no gateway, sessão Secure distinta da local, vínculo remoto de um uso e revogação pelo Windows. Continua desligado no ambiente real; nenhuma configuração de gateway, conta Cloudflare ou bucket foi modificada.
