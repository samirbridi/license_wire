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
