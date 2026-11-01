# 03 — Câmeras no Home Assistant: ao vivo, gravação, e onde armazenar (2026-11-01)

## Pedido do proprietário

> "Câmeras com acesso por ele também, mas claro já com recursos que temos hoje do ao vivo e gravação,
> pois usa o que usamos hoje nele."

Ou seja: o HA deve mostrar ao vivo e permitir navegar gravações, reaproveitando o pipeline já construído
(ponte go2rtc Xiaomi, `camera-archive.mjs`/`camera-archive-runner.mjs`), não reconstruir a captura do
zero dentro do HA.

## Como as câmeras chegam ao HA: dois caminhos, não concorrentes

**1. Via Frigate** (detecção + o que o Frigate já sabe gravar/mostrar). A integração oficial
`blakeblackshear/frigate-hass-integration` (via HACS) dá: entidade `camera` com o stream ao vivo,
`image` do último objeto detectado, `switch` para ligar/desligar detecção/gravação/snapshot por câmera,
`binary_sensor` de movimento. Para visualização de melhor qualidade, a comunidade recomenda o
"Advanced Camera Card" usando o provedor `go2rtc` embutido no próprio Frigate — que já existe desde que
o Frigate rode (`frigate uses go2rtc to provide its restream and MSE/WebRTC capabilities`), sem precisar
de uma segunda instância go2rtc separada.
[Fonte: docs.frigate.video/integrations/home-assistant, github.com/dermotduffy/advanced-camera-card]

**2. Via HA nativo (`go2rtc` + câmera genérica), sem Frigate.** Desde a versão 2024.11, o Home Assistant
já traz o go2rtc embutido automaticamente em instalações Container e OS com `default_config` — nada a
instalar à parte. Isso cobre câmeras que você só quer ver ao vivo, sem detecção de objetos (as 3 Mi2K:
Externa, Sala, Estúdio — fora do escopo da Visão Inteligente, confirmado em
`targets/tuya_smartlife/notes/08_visao_inteligente.md`: "Nenhuma Mi 2K incluída na detecção ativa").
[Fonte: home-assistant.io/integrations/go2rtc]

**Recomendação**: as 3 câmeras do escopo de segurança (AW300 Portão, AW300 Garagem, Outdoor Pro 2
lentes) entram pelo Frigate, já que precisam de detecção. As 3 Mi2K entram pelo caminho nativo do HA
(RTSP genérico apontando para a ponte go2rtc do bridge Xiaomi), sem precisar de uma entrada extra no
Frigate só para visualização.

## O que falta para "ao vivo" valer de verdade

Confirmado nesta sessão: o Frigate hoje só reprocessa gravações de amostra em loop (`-stream_loop -1`),
nunca conectou na ponte ao vivo do NAS. A ponte (`go2rtc`, dentro do container `bridge`) escuta só em
`127.0.0.1` dentro do NAS, por decisão de segurança já registrada em
`targets/xiaomi_home/notes/08_autorizacao_qr.md` e `12_visao_dupla_gravacoes_rondas.md`. O proprietário
já aprovou abrir essa porta só para este PC (GTX); a mesma decisão precisaria ser revisitada para a
máquina nova, se o Frigate acabar rodando lá (ver `02_decisao_hardware.md` — recomendação atual é manter
na GTX).

## Gravação: a decisão em aberto do proprietário

Três opções levantadas pelo proprietário, nenhuma decidida ainda — decisão dele, não técnica:

1. **Manter a gravação no NAS como está hoje** (`recorder`/`camera-archive-runner.mjs`, Docker
   continuando no NAS). Menor mudança, zero risco de regressão no que já funciona.
2. **Gravar nos HDDs da máquina nova.** Precisa saber a capacidade real desses HDDs (não informada) para
   comparar com os números reais abaixo.
3. **Mover só o Docker do NAS para o desktop, mantendo a gravação em disco no NAS via rede** (NFS/SMB).
   A documentação do Frigate recomenda NFS sobre SMB para isso ("usar NFS em vez de SMB reduziu
   consideravelmente os tempos de cópia") e montar via Docker Compose, não `fstab` do host, para evitar
   uma condição de corrida no boot (o processo de gravação subir antes do ponto de rede estar montado).
   [Fonte: github.com/blakeblackshear/frigate/discussions/19221, /discussions/7351]

### Números reais para dimensionar (NAS, agora, 2026-11-01)

Lidos ao vivo do `status.json` do recorder:

| Métrica | Valor |
|---|---|
| Volume total (NAS) | 884,2 GB |
| Já usado por gravações | 232,4 GB |
| Livre | 649,4 GB |

Da investigação anterior desta sessão (ver `targets/tuya_smartlife`, conversa de 1/11): as 3 câmeras do
escopo de segurança somam cerca de **19 GB/dia** combinadas (Portão ~19,3GB, Garagem ~18,8GB, Outdoor 2
lentes ~14,3GB — esses três já são os mais pesados da casa). As 3 Mi2K somam bem menos (~14GB/dia no
total). Variação real depende de bitrate da cena (movimento vs. parado), isso é ordem de grandeza, não
garantia.

Isso dá contexto para a opção 2: um SSD "pequeno" só faz sentido com uma retenção menor (dias, não
meses) ou só para as câmeras de maior prioridade — 232GB já em uso hoje não cabe confortavelmente num
SSD de 256GB, por exemplo. Vale medir a capacidade real dos HDDs/SSD cogitados antes de decidir.

## Pendência explícita

Nenhuma ação de gravação foi tomada aqui — nenhum arquivo de compose assume onde a gravação vai morar,
porque essa decisão depende de informação que só existe depois que a máquina estiver montada (capacidade
real dos HDDs). O compose em `artifacts/docker-compose.homeassistant.yml` não sobe o `recorder`; ele
continua no NAS exatamente como está até essa decisão ser tomada.
