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
- **O campo do cabeçalho com a lente ainda não foi visto em captura.** O hub detecta o campo sozinho nos primeiros pacotes: uma posição do cabeçalho de 32 bytes que, nos quadros de vídeo, vale exatamente 0 ou 10, com pelo menos 15% de cada. Ficam de fora tamanho, codec, sequência e timestamp. O resultado vai para o log como `[miss dual] session … lens tag at header offset N width W`.
- Se em 10 s nenhuma posição servir, o log mostra os cabeçalhos observados e o hub encerra. Por 10 minutos, as visões voltam a abrir sessões separadas, como antes. `MIZIN_MISS_DUAL=0` no serviço `bridge` desliga o modo.
- Quem entra depois recebe o trecho desde o último VPS/SPS da sua lente. A sessão fecha quando a última visão sai. PTZ, fala e SD continuam usando o mesmo cliente (`GetActiveClient`).
- Testes: `dual_test.go`, com fixtures sintéticas identificadas como tal. Não são capturas reais.

## Por que não testei no Windows

A ponte de teste local abriu a sessão, mas recebeu `read udp … i/o timeout`. Este Windows não tem regra de firewall para o executável novo (a regra `Codex-Xiaomi-Local-Diagnostic-UDP` não existe), e firewall não é alterado sem o proprietário. A validação real é feita no NAS, com o log acima.
