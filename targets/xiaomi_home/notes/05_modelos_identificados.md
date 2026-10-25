# Câmeras identificadas nas imagens — 2026-10-25

Origem: três prints enviados diretamente pelo usuário. São páginas comerciais do catálogo Xiaomi Home; confirmam os nomes apresentados, mas não mostram hardware ID ou firmware das unidades.

| Imagem | Texto observado | Identificação em português | Candidato técnico, a confirmar na unidade |
| --- | --- | --- | --- |
| Screenshot_20261025_132942_Xiaomi Home.png | 小米智能室外摄像机 4 Pro 三摄变焦版 | Xiaomi Smart Outdoor Camera 4 Pro, edição de três câmeras com zoom | `xiaomi.camera.cw701` [S10] |
| Screenshot_20261025_133003_Xiaomi Home.png | Xiaomi室外摄像机 AW300 | Xiaomi Outdoor Camera AW300 | `mxiang.camera.mod13` [S2] |
| Screenshot_20261025_133015_Xiaomi Home.png | 小米智能摄像机 标准版2K | Xiaomi Smart Camera Standard 2K / Mi Camera 2K Magnetic Mount | `isa.camera.hlc7`, modelo MJSXJ03HL [S2, S9] |

Os identificadores técnicos são cruzamentos documentais, não leituras do cadastro ou etiqueta do equipamento do usuário. Cópias das imagens e hashes: `evidence/user_images/2026-10-25/manifest.json`.

**Atualização após autorização da conta:** o cadastro real confirmou duas AW300 `mxiang.camera.mod11` (corrigindo a hipótese mod13 acima), três Mi 2K `isa.camera.hlc7` e uma Outdoor Pro `xiaomi.camera.cw701`. As seis unidades tiveram vídeo decodificado. O vínculo individual dos prints de firmware ainda não foi extraído do dispositivo. Ver `notes/09_video_local_validado.md` e `evidence/camera-inventory-sanitized.json`.

## Compatibilidade observada nas fontes

- **AW300:** presente na lista mantida pelo go2rtc. Existe relato de timeout em outra instalação, com sugestões de rede/qualidade nos comentários; não aplicar essas sugestões como receita comprovada. [S2, S12]
- **Standard 2K / HLC7:** presente na lista, que registra uma particularidade de inicialização em SD e metadados H.265. Há relatos de falha em determinados ambientes. [S2]
- **Outdoor 4 Pro / CW701:** não encontrada pelo identificador ou nome na lista consultada. Uma issue no projeto Xiaomi Miloco associa esse nome ao código CW701. O fechamento da issue não comprova compatibilidade: a resposta do colaborador tratou do ambiente macOS/Docker. [S10]
- **Adaptação experimental:** o PR go2rtc #2264 propõe handshake CS2 com nuvem e cita CW701 e HLC7; o autor declara teste real apenas em uma C302n, em conta/região US e VPS com IP público. PR consultado ainda aberto. Isso não demonstra suporte à CW701 na região China nem ao cenário residencial. [S11]

## Próxima prova

Os novos prints mostram firmwares e estado atualizado no app:

| Print | Firmware observado | Modelo associado provisoriamente pela ordem dos envios |
| --- | --- | --- |
| Screenshot_20261025_134229_Xiaomi Home.png | `5.3.1_0251` | Outdoor 4 Pro Triple Zoom |
| Screenshot_20261025_134255_Xiaomi Home.png | `5.1.6_0031` | AW300 |
| Screenshot_20261025_134330_Xiaomi Home.png | `4.6.0_0288` | Standard 2K |

As telas não mostram nomes dos dispositivos; a relação modelo/firmware ainda é uma inferência de ordem. O estado atualizado vale para a oferta do app àquelas unidades, não uma verificação independente de versão global. Transcrição: `evidence/firmwares_observados.json`.

O usuário confirmou que o computador Windows e ao menos uma câmera estão na mesma LAN. A ferramenta local foi preparada; ver `notes/06_teste_local_windows.md`. Próximo passo: autenticação pelo proprietário e identificação de uma câmera nessa rede. Priorizar AW300 ou Standard 2K para a primeira conexão real. Na Outdoor 4 Pro, verificar separadamente cada imagem/canal, movimentos e zoom; receber um stream não comprova acesso completo ao conjunto.

## Limites

Nenhuma alteração de firmware foi executada. A fonte S9 é usada somente para o vínculo entre nome e código. A ferramenta go2rtc foi preparada em pasta isolada e iniciada em localhost; não foi instalado Miloco, alterada rede/firewall ou conectado equipamento. Autenticação e vídeo continuam pendentes.
