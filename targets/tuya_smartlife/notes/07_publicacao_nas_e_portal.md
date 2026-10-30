# 07 — Publicação no NAS e no portal (procedimento automático)

*Claude Code, 2026-10-29. Builds 0046 e 0047 publicadas assim.*

## Fluxo

1. Commit com `tipo: descrição` e `node scripts/version-build.mjs --build --run-id <id>` → `runtime/builds/build-XXXX`.
2. `python scripts/prepare-nas-package.py --code-only` → `evidence/private/nas-portal-build-XXXX/`.
3. Pacote de atualização: `python -I scripts/make-nas-code-zip.py evidence/private XXXX` → `nas-portal-build-XXXX-code.zip` (~320 KB, sem o binário go2rtc de 30 MB, que é copiado da build anterior no NAS) e `compose-volume4-XXXX.yaml`. Quando a ponte muda (nova build em `targets/xiaomi_home`), use `--with-bridge`: o binário vai no zip, e o script imprime o SHA-256 dele para `bridgeSha256`.
4. No Chrome (Claude in Chrome) com o DSM `https://192.168.1.186:5001` autenticado: criar `<input type=file id="mizinUpload">`, anexar o zip com `file_upload`, colar `scripts/nas-dsm-deploy.js` e chamar `mizinDeploy({build, previous, zipSha256, composeSha256, previousComposeSha256[, bridgeSha256]})`.
   - `composeSha256`: SHA-256 do compose com finais LF; `previousComposeSha256`: SHA-256 do compose anterior com LF e `trim()`.
   - O script confere o SHA-256 do zip, extrai, copia a ponte verificada da build anterior, confere o compose e **só substitui o projeto se a configuração ativa for exatamente a anterior**. Depois dispara "Construir" (`build_stream`); o progresso fica em `window.__build`.
5. Pages: copiar `runtime/builds/build-XXXX/public` para `runtime/pages-build-XXXX/public`, acrescentar `_worker.js` = `reconstructed/mizin-portal/cloudflare/pages.mjs` (sem ele o site sobe sem o gateway da API; conferir `✨ Uploading Worker bundle` na saída) e rodar `node runtime/cloudflare-cli/node_modules/wrangler/bin/wrangler.js pages deploy public --project-name homecams --branch main --commit-dirty=true`.
6. Validar: `/api/health` (versão, `sameNetwork`), `/api/camera/archive` (status do gravador) e telas no navegador.

Projeto do Container Manager: `mizin-home` (id `9d574df2-822f-44f9-9918-d31c75409ab7`), pasta `/volume4/HDD 1TB - V2/Mizin-Home/nas-portal-build-0040`. As builds ficam em `Mizin-Home/nas-portal-build-XXXX`. Os erros "Pulling … Error" no início da construção são esperados: as imagens são locais.

## Verificado na build 0046

- Versão `v0.35.0 (build 0046)` ativa e sessão preservada.
- `sameNetwork: true` para acesso de casa: o selo "EM CASA" aparece.
- 820 gravações migradas para `<camera>/<AAAA-MM-DD>/HH-MM-SS.mkv`.
- Volume 4: 949 GB no total, 916 GB livres, 31 GB de gravações.
- Taxa real medida antes da migração: ~67 GB/dia em 7 visões. Garagem 17 GB/dia; Outdoor visão 2 12,4 GB; Mi 2K Externa 8,8 GB; AW300 Portão 8,2 GB; Outdoor visão 1 8,0 GB; Mi 2K Sala 6,9 GB; Mi 2K Estúdio 5,9 GB.
- HEVC original reproduz no Chrome do proprietário (AW300 2304×1296, início em ~8–11 s). O tempo-limite antes do modo convertido passou para 25 s na 0047.

## Outdoor Pro: limitação de uma visão por vez

Os logs da ponte mostraram 111 timeouts `probe: miss` na Outdoor (192.168.1.85) em 70 minutos. As demais câmeras ficaram estáveis. Na 0043, a visão 2 gravou 85 arquivos e a visão 1 só 20; na 0046, com conexão ordenada, a visão 1 grava e a visão 2 não conecta. Com uma sessão P2P por visão, a câmera entrega uma visão por vez. O app oficial abre as duas na mesma sessão (o replay usa canais `[0,10]` e `avchannelmerge`, conforme `targets/xiaomi_home/notes/13_plugins_sem_usb.md`).

Na 0047, o gravador prioriza a visão que está funcionando: a outra só tenta de novo após 10 min. O painel avisa quando a visão 2 não abre. 

**Resolvido nas builds 0048/0049 (ponte v0.12.0/v0.12.1).** A ponte abre uma única sessão com `videoquality` + `videoquality2` e separa as lentes pelo byte 15 dos `flags` do quadro. Detalhes em `targets/xiaomi_home/notes/18_outdoor_sessao_dupla.md`. A 0048 coletou os cabeçalhos reais e caiu sozinha para o modo antigo. A 0049 detectou o campo (`lens tag at header offset 15 width 1 second=1`, 14:11 UTC).

Verificado em 2026-10-29: as sete visões ficaram em `recording`, e os segmentos `11-11-43_visao1.mkv` (197 s) e `11-11-51_visao2.mkv` (188 s), HEVC 2880×1620 + Opus e com SHA-256 diferentes, foram gravados ao mesmo tempo. Ainda falta o proprietário confirmar visualmente que a visão 1 continua sendo a lente principal.

Na publicação da 0048, o Pages subiu uma vez sem `_worker.js` (caminho errado) e foi republicado com o gateway em seguida. O passo 5 agora indica o caminho completo.

## Build 0050 (2026-10-29)

- Gravações SD da Outdoor separadas por lente: o seletor Dupla/Vista 1/Vista 2 vale também na aba de gravações. Em Dupla, a régua tem uma faixa por lente, e clicar numa faixa reproduz aquela lente (`channel=0/1` no catálogo, no replay e no clipe).
- Os botões Foto, Criar Cena e × ficaram com a mesma altura e alinhados ao centro do cabeçalho.
- O gravador perdeu a espera de 10 min quando a outra visão grava: com a sessão compartilhada, ela só derrubava a visão que voltava.
- Ponte v0.12.2: prazos no login e na sessão compartilhada, e o replay SD com prioridade (`targets/xiaomi_home/notes/18_outdoor_sessao_dupla.md`).
- Cloudflare Observability (e-mail de 2026-10-29, cobrança por volume a partir de 1/12/2026): `homecams-portal-gateway` e `homecams-gateway` estão com observability desligada, então nada muda para a Mizin Home. Estão com logs ligados: acervo-mizin, experiencia-aline, foto-na-hora-production, fotonahora, meus-gastos, signalway e talkback-signal. Em conta sem Workers Paid, a ingestão só pausa ao atingir 0,5 GB/dia, sem cobrança. O plano da conta não pôde ser lido pela API (o token do wrangler não tem acesso a cobrança).

## Build 0051 (2026-10-29)

- Teste real no NAS, às 14:43–14:50 UTC. O replay SD da Outdoor (visão 2) ficou aberto por 68 s e recebeu 8 MB sem queda. Durante esse tempo, o gravador recebeu `SD playback in progress` na hora, sem tocar na câmera. Depois que o replay fechou, a visão 2 voltou em 22 s. A visão 1 só voltou às 14:50:20, por causa da espera entre tentativas (até 2 min).
- O gravador agora espera no máximo 1 min entre tentativas, e o status guarda `cause` e `failedAt` de cada falha.
- 0051 verificada às 14:56 UTC: as sete visões estavam gravando. A visão 1 da Outdoor teve uma interrupção na partida (`cause`: "Fluxo interrompido; os segmentos concluídos foram preservados.") e voltou em menos de 1 min. Na tela: os botões Foto, Criar Cena e × estão alinhados, e a régua SD em Dupla Visão mostra as faixas Vista 1 e Vista 2 (catálogo de 705 e 704 arquivos em 29/10).

## Builds 0052 e 0053 (2026-10-29)

- 0052: o replay SD das duas lentes da Outdoor tem os players lado a lado em Dupla Visão. O pedido segue o `startPlayBack1` do app oficial (`channel:[0,10]`), e o portal cria um alias por lente com `dual=1`. A Vista 2 só é pedida depois que a Vista 1 começa a tocar.
- Teste na 0052 (18:32–18:35 UTC): o replay duplo perdeu a corrida para o gravador (504), e o replay de uma lente funcionou. A 0053 traz a ponte v0.13.1 (bloqueio antecipado e nova tentativa, mais a sessão aberta por 6 s; ver nota 18 do xiaomi_home).
- Na 0052, as sete visões falharam juntas às 17:16 UTC com "Tempo esgotado ao gravar", na virada de um segmento de 15 min, e voltaram sozinhas. Como não é exclusivo da Outdoor, fica em observação.

## Builds 0054 e 0055 (2026-10-29)

- 0054: ponte v0.13.2 (`MSG_CLOSE` ao encerrar sessões e o replay SD libera a câmera na hora).
- 0055: ponte v0.13.3 (quem entra na sessão compartilhada recebe áudio; corrige a Vista 2 que caía com `-map 0:a:0`).
- Verificado às 19:03–19:08 UTC: as duas visões gravando, o replay SD duplo funcionando (as duas lentes juntas) e o ao vivo de volta 1,5–2,5 min depois de fechar o replay. A tela do replay duplo não foi conferida visualmente: o teste foi feito pela API do portal.

## Builds 0056 e 0057 (2026-10-29)

- Ponte v0.14.0/v0.14.1: o replay SD da Outdoor usa a mesma conexão do ao vivo, trocando de modo sem novo handshake. Quem entra depois na sessão compartilhada recebe o áudio.
- Verificado às 19:29–19:32 UTC: partida limpa, o replay SD duplo funcionando e as duas visões gravando de novo 7 s depois de fechar o replay (antes eram 1,5–2,5 min). Detalhes na nota 18 do xiaomi_home.

## Build 0058 — ao vivo rápido (2026-10-29)

- O painel abre o ao vivo em qualidade original pelo WebSocket da ponte (MSE do go2rtc, `connectWsStream`), sem ffmpeg no portal. O fluxo HTTP `/api/camera-stream` continua como reserva: falha, 12 s sem imagem ou navegador sem HEVC/MediaSource (por exemplo, iPhone, que não tem `MediaSource`).
- Ponte v0.15.0: cache do trecho desde o último quadro-chave para quem entra num fluxo já aberto.
- Medido pelo homecams, com as sete câmeras gravando (20:09–20:12 UTC):

| Câmera | Antes: HTTP, imagem | Antes: WebSocket, imagem | 0058: player do painel, tocando |
|---|---|---|---|
| AW300 Garagem | 12,1 s | 3,3 s | 0,46 s |
| AW300 Portão | 3,5 s | 0,5 s | 0,53 s |
| Mi 2K Sala | 10,8 s | 6,3 s | 0,58 s |
| Mi 2K Externa | 9,7 s | 4,2 s | 0,51 s |
| Mi 2K Estúdio | 13,8 s | 8,5 s | 1,14 s |
| Outdoor Vista 1 | 10,4 s | 4,4 s | 0,65 s |
| Outdoor Vista 2 | 8,1 s | 2,5 s | 0,43 s |

"Imagem" nas colunas "Antes" é o tempo até 300 KB; a última coluna é o evento `playing` no player do painel, com a resolução nativa decodificada (2304×1296 e 2880×1624).

## Builds 0059 e 0060 — microfone e câmeras de uma lente (2026-10-29)

- O proxy `/api/ws` usa o mesmo fluxo que o gravador mantém aberto (`recorderStreamAlias`: `aw300_garagem` → `aw300_garagem_quality3`, Mi 2K → `_quality4`). Antes, as câmeras de uma lente abriam uma sessão nova e fria a cada visualização. Medido às 23:48 UTC pelo player do painel, com os nomes base: 0,6–2,3 s.
- Fala contínua (`camera-talk-stream.mjs`, `/api/camera/talk-ws`): uma WebSocket por fala, PCM 16 kHz a cada 64 ms, um ffmpeg por fala (Opus de 20 ms, uma página Ogg por pacote) e uma requisição em fluxo para `api/xiaomi/talkstream` da ponte, que entrega 40 ms a cada 40 ms. Como no app oficial, a câmera confirma o canal antes do áudio e o som da câmera fica mudo durante a fala. O envio antigo, um POST por bloco, continua como reserva. Teste: `test/talk.test.mjs`, com ffmpeg real: ~100 pacotes em 2 s, o primeiro em menos de 1 s.
- Verificado (0060, 23:55 UTC): canal de fala da Outdoor confirmado pela câmera em 1,4 s (resposta binária 0), com 2 s de silêncio enviados. Som real confirmado pelo proprietário depois da 0060 na **Mi 2K Sala** (caminho A-law): a voz chegou limpa, segundo quem estava no cômodo. Outdoor e AW300 (caminho Opus) ainda não foram testadas com voz real.

## Pendências




- Integração dos veículos no NAS: os clientes GWM/BYD não estão na imagem, e os cartões informam "Sem dados".
- Estratégia de nuvem: decisão do proprietário; por enquanto as gravações ficam só no NAS.
