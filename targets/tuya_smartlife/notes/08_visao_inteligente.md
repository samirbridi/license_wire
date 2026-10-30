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
