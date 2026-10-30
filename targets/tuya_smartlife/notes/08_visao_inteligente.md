# 08 — Visão inteligente (detecções nas câmeras)

*Claude Code, 2026-10-30. Em desenvolvimento local; nada disto está no NAS nem no homecams.*

## Decisões do proprietário

- A IA roda no **PC com GTX 1660 Ti** (i7-9750H, driver 591.74). A RAM do NAS (DS423+, J4125, 2 GB e 71% em uso) fica para depois.
- Desenvolvimento e testes são locais, sem mexer no que funciona: gravação, ao vivo, fala e SD continuam como estão no NAS. Tudo vai ao ar de uma vez quando estiver pronto, junto com o layout de celular e tablet. No celular, a câmera abre como página, com voltar, e não como popup.

## Pedidos

1. Visita esperando no portão.
2. Correios ou carteiro.
3. Entregador a pé ou de moto (motoboy).
4. Pessoa mal-intencionada vigiando a casa. Intenção não é detectável; o sistema detecta sinais: parada prolongada, voltas repetidas, aproximação do portão à noite.
5. A mesma pessoa passando mais de uma vez, por semelhança de aparência (roupa, corpo, cores). Não há reconhecimento facial.
6. Veículo no portão.
7. Possível insegurança no portão de entrada.
8. Leitura de placa para abrir o portão do veículo cadastrado. Começa só com aviso "Abrir/Ignorar", porque placa se clona.
9. Tudo isso também com o portão aberto. O estado vem do Tuya "Portão - Interruptor" (EKAZA EKAC-T3099WB, categoria `ckmkzq`, online).

## Ambiente local verificado

- Docker Desktop 29.9.2 com WSL2. A GPU aparece dentro do container (`docker run --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi`: GTX 1660 Ti, 6144 MiB).
- Python 3.12 sem bibliotecas de IA.
- O compartilhamento SMB do NAS não está montado neste PC; montar exige credencial do proprietário.

## Arquitetura proposta

- Motor: Frigate (imagem `stable-tensorrt`, detector ONNX na GPU), em `reconstructed/mizin-vision/`. Ele já traz rastreamento de objetos, zonas, tempo parado (`loitering_time`), leitura de placas e uma tela de revisão. Interface só em 127.0.0.1.
- Entrada:
  - Fase de testes: gravações do NAS (segmentos de 15 min), copiadas para `runtime/vision/samples/` e lidas em laço. Não abre sessão nas câmeras; a Outdoor só aceita uma.
  - Ao vivo (depois): sempre a partir da ponte do NAS, nunca direto da câmera.
- Saída: eventos (tipo, câmera, zona, horário, foto) consumidos pelo portal, que decide alertas e ações (abrir portão, notificar).

## Fases

1. Pessoa, carro e moto nas câmeras da frente.
2. Zonas (calçada, portão, garagem) e estado do portão.
3. Comportamentos: visita esperando, parada prolongada, mesma pessoa voltando.
4. Classificação: carteiro e entregador.
5. Placas, com abertura só por aviso no início.
6. Celular e tablet no portal, testados numa URL de prévia do Pages, fora da `main`.

## Bancada local (2026-10-30)

- `reconstructed/mizin-vision/docker-compose.local.yml`: Frigate 0.18.2 (`stable-tensorrt`, digest `sha256:1cafb6eb…`) com a interface só em `127.0.0.1:5005`. Gravações em `runtime/vision/samples`, banco e capturas em `runtime/vision/media`, tudo fora do git.
- Detector: o modelo **OpenVINO SSDLite MobileNet v2 que já vem na imagem**, rodando na CPU (i7-9750H), a 10 ms por imagem. A exportação de um YOLO em ONNX para a GTX (pip de torch e ultralytics e download dos pesos) foi bloqueada pela política de segurança da ferramenta e só segue com autorização explícita do proprietário. Esse modelo não tem a classe "truck".
- O Frigate 0.18 começa com a detecção **desligada** por câmera. Sem `detect.enabled: true`, a primeira passada de 15 min não analisou nada (`detection_enabled: False`, 0 eventos). Corrigido no `config.yml`.
- Entrada: gravação lida em laço (`-re -stream_loop -1`), sem conexão com as câmeras. A AW300 Portão olha de dentro do portão para a rua; com a cena parada, o Frigate não roda o detector (só detecta quando há movimento).
- Download das amostras pelo portal (permitido pelo proprietário), uma por vez para não pesar no NAS. Só a primeira (`aw300_portao_2026-10-29_16-45-00.mkv`, 224 MB) chegou ao disco: o Chrome bloqueou os downloads automáticos seguintes. Para as outras 6, é preciso liberar "downloads automáticos" para homecams.pages.dev no Chrome.

## Travamento do NAS em 2026-10-30, 17:11 UTC

- O DSM e o túnel pararam de responder por ~3 min. Medido na volta: espera de disco 88%, carga 31 em 1 min, 1,2 GB de swap em uso, de 2 GB de RAM. O túnel do Cloudflare caiu por "no recent network activity" e reconectou sozinho às 17:13:50. Os containers não reiniciaram.
- O gravador também tinha registrado falha em todas as câmeras às 11:30:51 do mesmo dia: provavelmente outro travamento por falta de memória. O pente de RAM extra já afeta o sistema atual, não só a IA.

## Primeiro resultado (AW300 Portão, 29/10, 16:45–17:00)

- Com a detecção ligada, o detector chegou a 30 análises/s, mas o único "movimento" do trecho era o **relógio da câmera** (canto superior esquerdo). No 0.18 a máscara de movimento é um dicionário com nome (`motion.mask.relogio.coordinates`); a string simples é recusada com "Input should be a valid dictionary" e a câmera some.
- Com o relógio mascarado, o que ainda aciona o detector são folhas balançando (planta à direita, vegetação atrás da concertina). O detector analisa e não acusa ninguém. **Nenhum falso positivo** em 15 min de cena parada com vento, mas também nenhum evento real: o trecho não tinha visita.
- Próxima amostra: 30/10 por volta das 14:06 (horário local). A campainha tocou (log do portal "CAMPAINHA ACIONADA 17:06:31 UTC") e o AW300 Portão foi aberto várias vezes logo depois.

## Amostras da campainha (30/10, 14:06 local)

Downloads liberados pelo proprietário. Estão em `runtime/vision/samples/`, junto com as 6 amostras de 29/10 (aw300_portao 21h, mi2k_externa 15h e 20h, Outdoor 14h nas duas lentes e 20h na lente 1).

| Câmera | Arquivo | O que mostra às 14:06 |
|---|---|---|
| Outdoor Pro lente 2 (rua) | `outdoor_pro_poste_channel2_2026-10-30_14-00-00_visao2.mkv` (2880x1620 HEVC, 11 min) | Visita a pé na calçada, em frente ao portão, a ~410–450 s do arquivo. Carro branco e moto passando a ~160 s; SUV escuro a ~350 s. |
| Outdoor Pro lente 1 (calçada junto ao muro) | `..._14-00-00_visao1.mkv` | Sem a pessoa no quadro aos 390–400 s. |
| AW300 Garagem (de dentro, olhando o portão) | `aw300_garagem_2026-10-30_13-55-56.mkv` (2304x1296) | Pessoa atrás do portão das 14:06:43 às 14:07:23, pelo relógio da câmera. |
| Mi 2K Externa | `mi2k_externa_2026-10-30_13-50-43.mkv` | Não cobre a campainha. O formato do arquivo diz 1019 s, mas os pacotes de vídeo acabam em 617 s (~14:01). |
| AW300 Portão | só `14-08-47.mkv` (43 s) | **Gravação perdida** entre 13:59:48 e 14:08:47. Ver "Falha de gravação" abaixo. |

Cuidados de tempo:
- O relógio impresso pela Outdoor está em horário da China (01:06 de 31/10 = 14:06 de 30/10 local). O nome do arquivo está certo.
- O arquivo da Garagem chamado 13-55-56 começa às 14:00:02 pelo relógio da câmera. O nome do segmento não é confiável para achar o instante exato; vale o relógio da imagem.

Recortes usados no Frigate, em `runtime/vision/samples/cuts/` (cópia sem recodificar, só vídeo):
- `outdoor_v2_1403.mkv` e `outdoor_v1_1403.mkv`: 180–600 s, ~14:03–14:10.
- `aw300_garagem_1403.mkv`: 300–540 s, 14:05:32–14:09:32 pelo relógio da câmera.

As câmeras do teste no `config.yml` são `outdoor_rua`, `outdoor_calcada` e `garagem_portao`. Cada uma tem a máscara do relógio e decodifica na GTX (`hwaccel_args: preset-nvidia`, NVDEC ~9%). A `aw300_portao_dia` ficou desligada.

### Resultado (uma volta de 7 min, 12 eventos)

A visita é um homem com mochila e algo na mão, provavelmente entregador. Foi detectada nas três câmeras:

| Câmera | Detecção | Relógio da imagem |
|---|---|---|
| `outdoor_calcada` | pessoa 98%, por 69 s, chegando junto ao muro | 01:06:27 China = 14:06:27 |
| `outdoor_rua` | pessoa 99%, parada em frente ao portão, apontando | 14:07:15 |
| `garagem_portao` | pessoa 93%, vista pela grade do portão | 14:07:23 |

Veículos:
- `outdoor_rua`: 3 carros reais passando (até 98%).
- `garagem_portao`: um carro branco pela grade às 14:08:37 (90%). Isso já é "veículo no portão".

Falsos positivos:
- `garagem_portao`: 4 eventos "car" (73–75%) do **carro da casa estacionado** na garagem, a caixa grande no centro, sempre que algo se mexe perto dele.
- Correção na fase 2: uma zona `portao` (faixa da grade) e alertas só em zona, ou o carro da casa como objeto fixo ignorado.

Desempenho com 3 câmeras: inferência 36 ms na CPU (era 10 ms com 1 câmera), GPU 24%, decodificação 14%, temperatura 81 °C. Com mais câmeras, o detector precisa ir para a GTX (ONNX), o que depende da autorização para instalar pacotes.

Próximo passo: zonas (calçada, frente do portão, rua, garagem) e tempo parado para "visita aguardando". Classificar entregador ou carteiro precisa de um segundo modelo (fase 4).

## Falha de gravação do AW300 Portão (descoberta em 2026-10-30)

Somente leitura, pelo índice do portal (`/api/camera/archive`). Por hora, no formato segmentos / MB / minutos declarados:

| Câmera | 29/10 | 30/10 |
|---|---|---|
| AW300 Portão | 4–12 seg, **555–1078 MB**, ~60 min | 1–17 seg, **157–409 MB** na maioria das horas (exceções 02h, 04h, 18h, 19h). Durações declaradas absurdas (145, 163, 244 min numa hora). |
| AW300 Garagem | 4–5 seg, 330–900 MB | bytes normais, mas durações de 71–81 min por hora |
| Mi 2K Externa | normal | 05–07h com 68–71 MB e 25–28 min; o segmento 13-50-43 declara 1019 s e tem vídeo só até 617 s |
| Outdoor Pro | normal | **perfeito**: 4 seg de 15 min, 300–420 MB por hora |

Leitura:
- Duração maior que o tempo real e poucos bytes indicam fluxo que para e volta com salto de carimbo de tempo. O ffmpeg do gravador continua o mesmo arquivo em vez de falhar.
- No Portão, o buraco de 13:59:48 a 14:08:47 caiu justamente na campainha.
- A piora começa na noite de 29/10 (23h: 10 segmentos, 350 min declarados), logo depois das publicações 0060–0062 (ponte com cache de GOP, ao vivo compartilhando o alias do gravador, fala). A Outdoor usa outro caminho (sessão dupla) e está limpa.
- Também pesam os travamentos de memória do NAS (17:11 UTC e 11:30 UTC).
- Status do gravador: falha 1, "Tempo esgotado ao gravar.", 23:16:05Z.
- Para fechar a causa faltam os logs da ponte e do gravador no NAS (só leitura) e a comparação com o horário das publicações. Qualquer correção mexe em produção e precisa do OK do proprietário.

### Investigação (2026-10-30, 23:30–00:30 UTC, só leitura pelo DSM)

**1. A câmera do Portão cai muito.**
- O log da ponte (410 linhas desde a partida da 0062, 01:44 UTC) tem 209 erros de um único IP, `192.168.1.165` (modelo `mxiang.camera.mod11` = AW300). O AW300 da Garagem (`.196`) tem 15.
- Os erros são `read media: cs2: i/o timeout` (TCP e UDP), `connection reset by peer` e `probe: miss` na reconexão. São 10–24 por hora, o dia inteiro.
- A Outdoor (`.85`) tem 6. As Mi 2K são `.22`, `.126` e `.225` (`isa.camera.hlc7`).

**2. A cada queda, a gravação perde tempo.**
- O ffmpeg do gravador espera até 20 s (`-rw_timeout`) e o executor espera de 15 a 60 s antes de tentar de novo. A reconexão à câmera ainda pode falhar (`probe: miss`).
- O AW300 Portão grava ~3,9 Mbps (o órfão abaixo tem 55 MB em 113 s). Com 157–409 MB por hora, sobram só ~5–15 min de vídeo por hora em boa parte de 30/10.
- Em 29/10 eram ~2,1 Mbps e ~880 MB por hora: a hora quase inteira.

**3. Segmentos gravados ficam fora do arquivo ("órfãos").** Em `Mizin-Cameras/_work` há segmentos que o ffmpeg terminou e listou no CSV, mas que o gravador não publicou:

| Execução | Arquivo | Câmera | Fim (UTC) |
|---|---|---|---|
| `0e923448` | `-000001.partial.mkv`, 55 MB | **AW300 Portão** (o `-000000` virou `13-52-02.mkv`) | 17:07, **a campainha (14:00–14:07 local)** |
| `0525f37f` | `-000001`, 46 MB | AW300 Portão (o `-000000` virou `17-34-24.mkv`) | 21:00 |
| `d5cc244c` | `-000008` 220 MB, `-000009` 5 MB | AW300 Portão (o `-000007` virou `00-07-04.mkv`) | 04:45 |
| `fe30529e` | `-000006` 36 MB, `-000007` 1 MB | Mi 2K Externa | 04:15 |

- `publish()` passa por `inspectFile()`, um ffprobe com limite de **15 s**. O status do Portão mostra a causa "Tempo esgotado ao gravar.", a mensagem do `command()` quando esse limite estoura.
- O órfão da campainha passaria na checagem (tem áudio; duração 775 s ≥ 112 s). O que falhou foi o tempo do ffprobe. O arquivo termina às 17:07 UTC, e o NAS travou por falta de memória às ~17:11 (espera de disco 88%, 1,2 GB de swap).
- Quando a publicação falha, a execução inteira é derrubada (`failure` → `stop()`). O segmento fica em `_work` para sempre e a gravação reinicia: mais um buraco.
- Os 6 arquivos órfãos (~380 MB) continuam intactos no NAS e podem ser recuperados. A cópia local do da campainha está em `runtime/vision/samples/aw300_portao_2026-10-30_orfao_0e923448-000001.mkv`.

**4. O áudio sai do compasso depois das quedas.**
- Em 30/10, os segmentos das câmeras de uma lente começam com o áudio **238–383 s à frente do vídeo**: Garagem 13-55-56, Mi 2K Externa 13-50-43 e o órfão do Portão, que tem 10.406 pacotes Opus em 113 s de vídeo.
- Em 29/10, todos os arquivos estão alinhados, inclusive o do Portão às 21:00, já com a ponte 0034. A Outdoor (sessão dupla) está alinhada nos dois dias.
- Causa provável:
  - Em `Producer.Start` (ponte), o carimbo do áudio é contado por pacote (`audioTS += 40 ms`), enquanto o do vídeo vem do relógio da câmera.
  - Quando o go2rtc reconecta o produtor sem fechar o consumidor do gravador, os dois relógios recomeçam de forma diferente.
  - É isso que gera as durações absurdas no índice (145, 244 e 350 min numa hora) e o ffprobe mais lento (218 ms contra 62 ms no PC; no NAS travado, passa de 15 s).

### Correção proposta (não aplicada; depende do OK do proprietário)

1. **Gravador (portal, build 0063, baixo risco):**
   - Nunca descartar um segmento. Se a checagem falhar ou estourar o tempo, ele é publicado assim mesmo, marcado como `incompleto`, com o motivo.
   - A falha de publicação de um segmento não derruba a gravação em curso.
   - ffprobe com limite de 60 s.
   - A primeira nova tentativa depois de uma queda sai em ~3 s; a espera de 15–60 s só vale depois de falhas seguidas.
   - Na partida, os órfãos de `_work` são recuperados e publicados, o que traz de volta a campainha das 14:00–14:07.
2. **Ponte (depois, com teste):** carimbar o áudio pelo relógio da câmera, como o vídeo, para o áudio não adiantar depois de uma reconexão.
3. **Câmera:** conferir o sinal Wi-Fi do AW300 Portão no app Mi Home. É a câmera que mais cai, de longe; se o sinal estiver fraco, aproximar o roteador ou usar um repetidor.

