# Ligar o vídeo ao vivo do Frigate: mudança mínima no `bridge.yaml` do NAS

## O que muda e por quê

Hoje o Frigate (neste PC, GTX) só reprocessa gravações de amostra em loop — nunca se conectou à ponte
go2rtc real do NAS. A ponte (`bridge.yaml`, dentro do container `bridge` no NAS) escuta hoje só em
`127.0.0.1:19843` (API) e tem o RTSP desligado (`rtsp.listen: ''`), por decisão de segurança deliberada
(ver `targets/xiaomi_home/notes/12_visao_dupla_gravacoes_rondas.md`). Isso é sobre uma instância
**diferente** (auxiliar, usada só no fluxo de autorização por QR) — a instância de produção pode abrir o
RTSP sem contradizer aquela decisão, mas ainda precisa de controle de acesso equivalente.

**Risco verificado antes de propor isto**: a Outdoor Pro só aceita uma sessão por vez
(`targets/xiaomi_home/notes/09_video_local_validado.md`). Confirmei que isso não é um problema aqui: o
go2rtc é desenhado exatamente para multiplexar — um único produtor (a conexão real com a câmera) atende
múltiplos consumidores (o portal, e agora o Frigate) ao mesmo tempo, abrindo a conexão com a câmera só
quando o primeiro consumidor chega e fechando quando o último sai. O Frigate puxando do RTSP do `bridge`
nunca disputa a sessão com o portal — os dois compartilham a mesma conexão já existente.
[Fonte: docs.frigate.video/configuration/restream, AlexxIT/Blog#26]

## Mudança proposta (3 linhas, duas delas novas)

No início de `bridge.yaml` (NAS, `/volume4/HDD 1TB - V2/Mizin-Home/data/bridge/bridge.yaml`), trocar:

```yaml
api:
  listen: 127.0.0.1:19843
rtsp:
  listen: ''
```

por:

```yaml
api:
  listen: 127.0.0.1:19843   # continua loopback-only; o Frigate nunca precisa da API HTTP, só do RTSP
rtsp:
  listen: :8554
  username: frigate
  password: "COLE_AQUI_UMA_SENHA_FORTE_GERADA_POR_VOCE"
```

Nada mais no arquivo muda — todas as 93 linhas de `streams:` ficam exatamente como estão.

**Por que só o RTSP, não a API**: o Frigate consome vídeo via `rtsp://`, nunca chama a API HTTP do
go2rtc remoto — não há motivo para abrir a porta 19843 além do loopback. Menor mudança possível.

**Por que usuário/senha, além do firewall**: defesa em profundidade. O firewall do DSM (próximo passo)
já restringe por IP de origem, mas a credencial RTSP é uma segunda camada independente — se a regra de
firewall for removida ou mal configurada no futuro, a porta ainda não fica de livre acesso.

Gerar uma senha forte (não usar a de exemplo abaixo, gerada só para ilustrar o formato):
```
node -e "console.log(require('crypto').randomBytes(16).toString('base64url'))"
```

## Depois de editar o arquivo

O `bridge` container precisa reiniciar para reler o `bridge.yaml` (ele não recarrega hot). No DSM:
Container Manager → Projeto → selecionar o serviço `bridge` → Reiniciar (ou reiniciar o projeto
inteiro — os outros serviços não são afetados por isso, mas reiniciar todos é mais simples via UI).

## Verificação (rodar depois do restart, deste PC)

```bash
# Antes do firewall ser liberado, isto deve FALHAR (prova de que a porta não está aberta por acidente):
curl -s -o /dev/null -w "%{http_code}\n" --max-time 3 rtsp://192.168.1.186:8554/aw300_portao_quality3

# Depois de liberar o firewall (ver bridge-firewall-dsm.md) e com a senha certa, isto deve conectar:
ffprobe -rtsp_transport tcp "rtsp://frigate:SENHA@192.168.1.186:8554/aw300_portao_quality3"
```
