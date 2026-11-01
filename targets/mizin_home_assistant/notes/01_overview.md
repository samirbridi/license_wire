# 01 — Visão geral e decisão do proprietário (2026-11-01)

Este alvo não é engenharia reversa de um binário de terceiro: é o planejamento e os artefatos prontos
para migrar o Mizin Home (hoje em `targets/tuya_smartlife/reconstructed/mizin-portal`, rodando no NAS)
para o Home Assistant como plataforma, numa máquina Linux dedicada que o proprietário vai montar —
i5 de 6ª geração, 16GB RAM, AMD Radeon RX 580.

## Pedido do proprietário (verbatim, resumido)

> "Deixar tudo pronto e alinhado... pois tenho ideia de migrar todo esse nosso sistema para o Home
> Assistant, conseguimos? Porque ele já possui um app pronto e um sistema pronto, e a gente só pegaria
> partes que fizemos para inserir dentro, o que já testamos e temos funcionando."

Pontos explícitos do pedido:
- Reaproveitar o que já funciona (Tuya local, câmeras Xiaomi via go2rtc, LPR/Visão no Frigate), não
  reconstruir do zero dentro do HA.
- Câmeras com os mesmos recursos de hoje (ao vivo + gravação) acessíveis pelo HA também.
- A máquina nova tem mais capacidade de processamento que o NAS para "muitas coisas", mas a gravação
  de câmeras é a parte que ainda precisa de decisão (HDDs da própria máquina, um SSD pequeno, ou manter
  a gravação no NAS e só tirar o Docker de lá para o desktop).
- Testar a IA (Frigate) nessa máquina também, "para não ter que linkar com a GTX" no futuro, com
  possível troca de GPU depois para aproveitar CUDA de verdade.
- Trabalho "deixado pronto e alinhado" aqui, para execução remota quando a máquina estiver pronta.
- Pedido separado, ainda pendente: bot do Telegram (ver `targets/tuya_smartlife`, já construído e
  commitado — `telegram-link.mjs` + rotas em `server.mjs`, não depende desta migração).

## O que este alvo contém

- `artifacts/` — arquivos prontos para colar na máquina nova: compose do Home Assistant + Mosquitto +
  ponte MQTT, config de exemplo, script de bootstrap, variante do config do Frigate com MQTT ligado.
- `notes/02_decisao_hardware.md` — por que a detecção de objetos continua na GTX 1660 Ti por enquanto,
  com números reais medidos nesta sessão, não estimativa.
- `notes/03_cameras_no_ha.md` — como as câmeras aparecem no HA (via Frigate + go2rtc), o que falta para
  ficar "ao vivo" de verdade, e a decisão de onde gravar.
- `notes/04_passo_a_passo_remoto.md` — checklist para a sessão de execução remota, na ordem certa.

## O que NÃO está pronto ainda (seja claro sobre isso ao revisar)

- Frigate ainda só lê gravações de amostra em loop, não o vídeo ao vivo da ponte do NAS — depende de
  uma porta da ponte (go2rtc) ser liberada só para a máquina que vai rodar a detecção (este PC, hoje).
- A ponte MQTT (`mqtt-bridge-runner.mjs`) está pronta e testada contra um broker real, mas nunca rodou
  contra o Mosquitto real desta máquina nova (que ainda não existe) nem contra o Frigate real.
- A decisão final de onde gravar as câmeras (NAS vs. HDDs/SSD da máquina nova) depende de testes de
  capacidade que só fazem sentido com o hardware físico na mão — ver `03_cameras_no_ha.md`.
