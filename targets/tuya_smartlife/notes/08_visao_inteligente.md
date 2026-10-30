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

