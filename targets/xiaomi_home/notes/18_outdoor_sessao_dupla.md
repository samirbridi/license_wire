# 18 — Outdoor Pro: as duas lentes numa sessão só

*Claude Code, 2026-10-29.*

## Problema

Com uma sessão P2P por visão, a CW701 entrega uma lente por vez. Os logs da ponte no NAS mostraram 111 timeouts `probe: miss` em 70 minutos, só nessa câmera. Na build 0043 do portal, a visão 2 gravou 85 arquivos e a visão 1 só 20. Na 0046/0047, a visão 1 grava e a visão 2 não conecta.

## Como o app oficial faz (plugin CW701 v58)

- `module-11108.js` (`_startPlayMaxMain/_startPlayMaxSub`) e `module-10490.js` (`sendResolutionCmd`) mandam **um** `MISS_CMD_VIDEO_START`/`STREAM_CTRL_REQ` com `videoquality` e `videoquality2` juntos.
- As duas `CameraRenderView` recebem `did` = `<did>` e `<did>_10`: o nativo separa os quadros pelo canal 0 e 10, o mesmo par `[0,10]` do replay (nota 13).
- `VIDEO_QUALITY_OFF = -1` (`module-10022.js`) desliga uma das lentes. A fonte `channel=2` da ponte já usava `videoquality:-1` para pedir só a lente 2.

## Implementação (`reconstructed/go2rtc-miss-patch/pkg/xiaomi/miss/dual.go`)

- Para `xiaomi.camera.cw701` ao vivo (sem `playback`), `Dial` entra num *hub* por `did`. O primeiro a chegar abre a sessão com `channel=dual` (`{"videoquality":q,"videoquality2":q,...}`). Os seguintes reaproveitam a mesma sessão.
- Cada stream do go2rtc vira uma visão do hub. `channel` vazio ou `0` corresponde à lente 0; qualquer outro valor (`channel=2` dos aliases) corresponde à lente 10. O áudio, de um microfone só, vai para as duas visões.
- **Campo da lente, visto no NAS em 2026-10-29 (bridge v0.12.0):** com o pedido duplo, a câmera manda as duas lentes intercaladas, cerca de 20 quadros/s cada. Nos `flags` (bytes 12–15 do cabeçalho), a lente principal vem como `00a01e00` e a segunda como `00a05e01`. O **byte 15** vale 0 ou 1 e identifica a lente. O bit 0 do byte 12 marca o quadro-chave (`01a0…`). O byte 14 também difere (0x1e/0x5e). Os bytes 24–31 eram iguais nas duas lentes.
- A v0.12.0 procurava só o valor 10, não achou o campo e voltou sozinha às sessões separadas. Os dados acima vieram do log de diagnóstico dela. A detecção agora aceita {0,10} e {0,1}, começa pelo byte 15 (segunda lente = 1) e nunca usa o byte 12 como 0/1. O teste `TestDetectDualFieldMatchesObservedCW701` reproduz esse padrão. O log mostra `[miss dual] session … lens tag at header offset 15 width 1 second=1`.
- Se em 10 s nenhuma posição servir, o log mostra os cabeçalhos observados e o hub encerra. Por 10 minutos, as visões voltam a abrir sessões separadas, como antes. `MIZIN_MISS_DUAL=0` no serviço `bridge` desliga o modo.
- Quem entra depois recebe o trecho desde o último VPS/SPS da sua lente. A sessão fecha quando a última visão sai. PTZ, fala e SD continuam usando o mesmo cliente (`GetActiveClient`).
- Testes: `dual_test.go`, com fixtures sintéticas identificadas como tal. Não são capturas reais.

## Por que não testei no Windows

A ponte de teste local abriu a sessão, mas recebeu `read udp … i/o timeout`. Este Windows não tem regra de firewall para o executável novo (a regra `Codex-Xiaomi-Local-Diagnostic-UDP` não existe), e firewall não é alterado sem o proprietário. A validação real é feita no NAS, com o log acima.

## Queda às 14:18 UTC e correções (bridge v0.12.2)

O que se viu no NAS:

- 14:18:17 — a consulta do catálogo SD estourou o tempo (18 s) no portal.
- 14:18:41 — a sessão compartilhada foi fechada do nosso lado (`use of closed network connection`): abrir o replay SD fechava todos os clientes da câmera (`CloseClientsForDID(did, false)`).
- 14:19:41 — uma nova sessão compartilhada parou junto com as duas visões, e depois disso nenhuma tentativa voltou. O log da ponte ficou quase mudo e o gravador repetiu a cada 120 s.

Causa provável: o `login` da sessão MISS não tinha prazo. Com a câmera ocupada pelo replay, a conexão nova ficava esperando para sempre. Com o hub, as duas visões esperavam juntas por `hub.ready`.

Correções:

- O `login` tem prazo de 10 s. Quem entra no hub espera no máximo 30 s.
- O replay SD tem prioridade. Abrir o replay ainda fecha as sessões ao vivo, mas um pedido ao vivo não fecha mais o replay: enquanto houver replay aberto na câmera, ele falha na hora com `SD playback in progress`, sem tocar na câmera. Antes, o gravador e o replay se derrubavam um ao outro. Quando o portal fecha o replay, o gravador volta a conectar na próxima tentativa (até cerca de 2 min). O próprio cartão SD cobre esse intervalo.
- Teste: `session_test.go`.

## Replay SD das duas lentes juntas (bridge v0.12.3)

- O plugin (`module-10436.js`, `startPlayBack1`) manda um `MISS_CMD_PLAYBACK_REQ` com `starttime:[t0,t1]`, `endtime:[e0,e1]`, `offset:[o0,o1]`, `speed:[s,s]`, `avchannelmerge:1` e `channel:[0,10]`. O `sessionid` é o início do arquivo da lente principal.
- A ponte faz o mesmo em `StartPlaybackDual`: resolve no catálogo o arquivo e o offset de cada lente (canal 0 e 10) e separa os quadros pelo hub de `dual.go`, com a chave `<did>|pb|<instante>`.
- O portal cria um alias por lente (`pb_<alias>_<t>_d0/_d1`, com `pbdual=1`) e pede a Vista 2 só depois que a Vista 1 começa a tocar. A segunda lente entra na sessão aberta (`DualSessionOpen`) sem fechar as sessões da câmera.
- Testes: `playback_dual_test.go`, com catálogo sintético.


## Corrida entre o replay SD e o gravador (bridge v0.13.1)

- Teste no NAS às 18:32–18:35 UTC. O replay duplo falhou duas vezes no primeiro contato (`read udp … i/o timeout` no handshake), e o replay de uma lente funcionou (200 em 5,7 s, 3,4 MB em 25 s). O log mostrou a causa: o replay fecha a sessão ao vivo, e durante o handshake dele o gravador tenta voltar e conecta ao mesmo tempo. A câmera atende só um dos dois. Nos testes duplos o ao vivo ganhou as duas vezes.
- Correção: `MarkPlaybackPending` bloqueia os pedidos ao vivo desde o início do replay, antes de fechar as sessões e antes da consulta à nuvem. Se o replay ainda perder a corrida, a ponte fecha a sessão que entrou e tenta mais uma vez após 1,5 s.
- A sessão compartilhada fica aberta por 6 s depois que a última visão sai (`dualLinger`). A verificação de 10 s do gravador, seguida da gravação contínua, reaproveita a conexão em vez de fechar e reabrir. Essa era a causa provável da interrupção da visão 1 na partida.

## Sessões presas na câmera (bridge v0.13.2)

- Teste da 0053 (18:44–18:48 UTC): o replay SD duplo funcionou. A Vista 1 abriu em 9,3 s, a Vista 2 entrou na mesma sessão em 1,4 s, e as duas receberam ~130 KB/s por 45–60 s. Depois disso, a câmera recusou novas conexões por ~1,5 min (`read udp … i/o timeout` no handshake), e o ao vivo só voltou às 18:47:47.
- Causa: `cs2.Conn` fechava apenas o socket, sem mandar `MSG_CLOSE` (0xF0) para a câmera, embora o tipo já estivesse declarado. Cada sessão encerrada pela ponte continuava ocupando uma vaga na câmera até o timeout dela.
- Correção: `cs2.Conn.Close` manda `{0xF1, 0xF0, 0, 0}` (3 vezes em UDP, sem ack; 1 vez em TCP) antes de fechar. Teste: `cs2/close_test.go`.
- A sessão de replay SD não fica mais aberta 6 s depois de encerrada: libera a câmera na hora para o ao vivo. Isso continua valendo só para o ao vivo.

## Áudio de quem entra depois (bridge v0.13.3)

- Na 0054, a Vista 2 passou na verificação de 10 s do gravador, mas a gravação contínua caía em poucos segundos. A ponte não registrava erro.
- Causa: quem entra numa sessão já aberta recebe na hora o trecho de vídeo desde o último VPS da sua lente (até ~80 quadros). O `probe` encerra ao passar de 45 quadros de vídeo sem ter visto áudio e abre o fluxo sem a faixa de áudio. O ffmpeg do gravador usa `-map 0:a:0` e sai com erro.
- Correção: o trecho guardado também mantém os 8 pacotes de áudio mais recentes (`dualTailAudio`). O teste do hub confere que quem entra depois recebe áudio.

## Resultado na build 0055 do portal (bridge v0.13.3), 19:02–19:08 UTC

- Partida: as duas visões gravando às 19:03:08, depois de uma falha conjunta às 19:02:47. A Vista 2 entra na sessão aberta sem falhar.
- Replay SD duplo: Vista 1 com status 200 em 13,9 s, Vista 2 em 2,9 s na mesma sessão. 7,0 MB e 5,4 MB em 55 s e 40 s.
- Depois do replay: o ao vivo reconectou 3 s após o fechamento (19:05:58), mas a câmera parou de mandar quadros em ~10 s e recusou handshakes até ~19:07. A Vista 2 voltou às 19:07:37 e a Vista 1 às 19:08:31. Mesmo com `MSG_CLOSE`, a CW701 fica ~1,5–2,5 min sem atender depois de uma sessão de replay. O cartão SD cobre esse intervalo.
- Próximo passo possível: fazer o replay dentro da mesma sessão do ao vivo, como o app oficial (troca de modo sem novo handshake), para eliminar esse intervalo.


## Replay SD na mesma conexão do ao vivo (bridge v0.14.0)

- A sessão compartilhada por câmera (`dual.go`) agora tem modo: `live` ou `pb:<instante>`. Um pedido de replay SD não abre outra conexão: na conexão aberta, a ponte manda `VIDEO_STOP` e depois `PLAYBACK_REQ` com `channel:[0,10]`. As visões ao vivo terminam com `camera switched to SD playback` e o gravador tenta de novo depois. Enquanto alguém assiste o replay, o ao vivo é recusado (`errPlaybackBusy`).
- Ao mudar de modo, quadros em trânsito do modo anterior são descartados: cada lente recomeça no próximo VPS (`gated`).
- Trocar o instante (seek) troca o replay na mesma conexão. Quando ninguém mais assiste, depois de 3 s (`dualReplayGrace`, para cobrir o seek) a ponte manda `STREAM_CTRL op 3` + `VIDEO_STOP` e `VIDEO_START` duplo, voltando ao ao vivo **sem handshake**. A sessão espera o gravador por até 3 min (`dualAfterReplay`).
- Para a CW701, o handler da ponte não fecha mais as sessões da câmera ao abrir um replay. Nos outros modelos não mudou nada.
- Teste: `dual_mode_test.go`, que cobre ao vivo → replay → ao vivo numa conexão sintética: comandos enviados, visões ao vivo encerradas, ao vivo recusado durante o replay, recomeço no quadro-chave, volta ao ao vivo e fechamento por ociosidade.

## Áudio de quem entra depois, segunda parte (bridge v0.14.1)

- Na 0056, a Vista 2 voltou a cair logo no início da gravação contínua. O áudio guardado fica no fim do trecho em buffer, e o `probe` parava em 45 quadros de vídeo antes de chegar nele. Na 0055 funcionou só porque o quadro-chave estava perto.
- Correção: nas visões da sessão compartilhada (ao vivo), o `probe` lê até 240 quadros antes de desistir do áudio. `TestLateJoinerProbeKeepsAudioTrack` (80 quadros e o áudio no fim) passa com a correção e falha com o limite antigo.

## Verificado na build 0057 do portal (bridge v0.14.1), 19:29–19:32 UTC

- Partida limpa: as duas visões gravando às 19:29:46, sem falhas.
- Replay SD duplo: Vista 1 com status 200 em 10,3 s, Vista 2 em 1,8 s, 6,2 MB e 4,9 MB. Log: `19:30:26 SD replay 1793282400 on the same connection`. As visões ao vivo terminaram com `camera switched to SD playback`.
- Fim do replay às 19:31:19. Log: `19:31:23 back to live on the same connection`. **As duas visões gravando de novo às 19:31:26, 7 s depois** (antes eram 1,5–2,5 min), e estáveis em seguida.

