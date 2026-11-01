# 02 — Decisão de hardware: onde roda a detecção de objetos (2026-11-01)

## A pergunta

A máquina nova (i5 6ª geração, 16GB RAM, AMD Radeon RX 580) deveria assumir a inferência do Frigate
(detecção de pessoa/carro/moto, leitura de placa), liberando a GTX 1660 Ti deste PC? O proprietário
pediu explicitamente para "testar a IA nessa máquina também... para daqui a pouco não ter que linkar
aqui com a GTX".

## O que a RX 580 de fato suporta hoje

Pesquisado nesta sessão, não assumido:

- **ROCm (o caminho de GPU do Frigate para AMD) não tem suporte oficial na RX 580.** A arquitetura dela
  (Polaris, `gfx803`) teve sua última validação oficial da AMD no ROCm 3.5 (meados de 2020); a série
  5.x foi o último ciclo com suporte real, e a AMD fecha bugs específicos de Polaris como "wont-fix"
  desde então. A imagem `frigate:stable-rocm` é construída para GPUs `gfx900+` (Vega em diante) —
  `gfx803` fica de fora da lista suportada sem overrides. Existem builds não-oficiais da comunidade
  (`ROCm-For-RX580`, `gfx803_rocm62_pt24`) que remendam ROCm 6.x para rodar em Polaris via variáveis
  de ambiente, mas são tratados pela própria comunidade como solução paliativa, não um caminho
  garantido — com relatos de instabilidade residual em cargas de ML mesmo funcionando.
  [Fonte: github.com/ROCm/ROCm, github.com/woodrex83/ROCm-For-RX580]
- **VAAPI (decodificação/transcodificação de vídeo) funciona bem na RX 580.** Suporte completo a H.264
  e H.265 via driver Mesa RADV/radeonsi, confirmado por relatos de usuários rodando Jellyfin/ffmpeg
  nela especificamente. Isso cobre decodificar o vídeo das câmeras (`hwaccel_args: preset-vaapi`), não
  a parte de rede neural da detecção.
- **O caminho realista de CPU é o detector ONNX ou OpenVINO-em-modo-CPU**, não GPU. A documentação do
  Frigate é direta: "não recomendado para uso real" (detector CPU puro) e "usar OpenVINO em modo CPU é
  geralmente mais eficiente que o detector CPU". Nenhum dos dois dá número de FPS/câmeras — só a
  orientação geral de "o maior modelo que seu hardware aguenta sem pular detecções".

## Números reais desta sessão (GTX 1660 Ti, hoje, neste PC)

Medido via `/api/stats` do Frigate rodando agora, 4 câmeras simultâneas (amostras em loop):

| Métrica | Valor |
|---|---|
| Uso da GPU | 19% |
| Memória da GPU | 35% de 6GB |
| Tempo de inferência | 16,84 ms |
| FPS combinado das 4 câmeras | 20,2 |
| FPS de detecção | 16,5 |
| Temperatura | 83°C |

Ou seja: a GTX 1660 Ti está usando menos de um quinto da sua capacidade de processamento para as 3
câmeras do escopo (Portão, Garagem, Outdoor 2 lentes = 4 entradas). Tem folga real.

## Recomendação

**Manter a detecção na GTX 1660 Ti deste PC por enquanto.** A RX 580 não tem um caminho de GPU
confiável para isso hoje — forçar ROCm não-oficial numa peça de segurança (leitura de placa, decisão
de abrir o portão) é trocar uma GPU com folga comprovada por uma com suporte precário, sem necessidade.

**O que a máquina nova pode assumir sem reserva**: o Home Assistant em si, o broker MQTT, a ponte
Node (`mqtt-bridge-runner.mjs`), e — se quiser testar como prova de conceito, não como caminho de
produção — o Frigate com `detectors.cpu` ou OpenVINO-CPU, aceitando frame rate/latência bem mais baixos
que os 16,5 FPS de detecção atuais. Vale como teste, não como substituição real enquanto a GPU não for
trocada.

**Sobre a troca de GPU futura, mencionada pelo proprietário**: qualquer GPU NVIDIA recente (mesmo uma
usada, tipo uma RTX série 20/30 de entrada) reaproveitaria a imagem `frigate:stable-tensorrt` já em uso
sem mudar nada do `config.yml` além do host MQTT — é literalmente plugar e rodar `docker compose up`,
porque o detector `onnx` já faz essa seleção automática de provider (CUDA vs CPU) sozinho, como
documentado em `targets/tuya_smartlife/notes/08_visao_inteligente.md`. Essa é a atualização de hardware
que de fato resolveria o "não precisar linkar com a GTX" — trocar a RX 580 por uma GPU com ROCm
suportado teria o mesmo efeito, mas custa reaprender uma pilha (ROCm) sem o histórico de maturidade do
CUDA/TensorRT que este projeto já validou.

## Arquivo de referência

`artifacts/frigate-config-homeassistant.yml` já tem a nota de "trocar `preset-nvidia` por `preset-vaapi`
se a detecção rodar na RX 580" marcada no lugar certo, para quando/se essa decisão mudar.
