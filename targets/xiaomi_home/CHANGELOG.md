# CHANGELOG — xiaomi_home

## v0.12.2 (build 0024) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: limita o login da Outdoor e da prioridade ao replay SD sem derrubar a sessao ao vivo (commit `b64acf1a989781efdead77f53ab214188ae9f155`)

### ⚡ Improvements

- Nenhum.

## v0.12.1 (build 0023) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: identifica a lente da Outdoor Pro pelo byte 15 dos flags observado no NAS (commit `80632bf661824e3c2b0373be2bca18f7541e6988`)

### ⚡ Improvements

- Nenhum.

## v0.12.0 (build 0022) - 2026-10-29

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: abre as duas lentes da Outdoor Pro numa sessao compartilhada da ponte (commit `cf91bdccbb573b5c6cc4861a7d922000b6c01d25`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.11.4 (build 0021) - 2026-10-28

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: rejeita metadados de resolucao incompletos sem interromper a ponte (commit `e2180602af3cadbb33d570dd75ac7ae1d2365772`)

### ⚡ Improvements

- Nenhum.

## v0.11.3 (build 0020) - 2026-10-28

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: aguarda a resolucao solicitada antes de abrir gravacoes Xiaomi (commit `f2690dcca518b79fab0174f7b4a62a6ad21cfc7c`)

### ⚡ Improvements

- improve: registra publicacao e QA SD do build 0019 (commit `ad500737dfaeae4e805cdbf650e36678a3db3d2e`)

## v0.11.2 (build 0019) - 2026-10-28

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: valida confirmacao SD HLC7 pelo identificador observado (commit `7b76a97b1c84cf8785a9422495ba7a2d4aa52502`)

### ⚡ Improvements

- Nenhum.

## v0.11.1 (build 0018) - 2026-10-28

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: isola replay SD e prepara instalacao privada no NAS (commit `680857a5b1abb9f96749e75d887ddd8f2eabb0b6`)

### ⚡ Improvements

- Nenhum.

## v0.11.0 (build 0017) - 2026-10-27

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: integra replay SD e gateway privado com preparacao Linux (commit `70754f196d940839017b07ee186a837af8ee9984`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- improve: registra consultas reais de seis cartoes e posicoes da Outdoor (commit `f30211ec8b9c4a6bad2a01eae0099dac9e1a03ad`)

## v0.10.0 (build 0016) - 2026-10-27

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: adiciona consultas isoladas de SD e posicoes Xiaomi (commit `dcc463800c5d5f65708975a57596de18f2a74e57`)
- feat: corrige transporte CS2, talkback bidirecional, playback SD 0x10D e controles Xiaomi local e online (commit `211b5e6b426e1edc6683a560539d42eeebf832d2`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.9.0 (build 0015) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: recompila ponte nativa `go2rtc.exe` (`reconstructed/go2rtc-miss-patch/`) com suporte completo a Talkback CS2 canal 3 (`0x106`/`0x108`), Playback MicroSD (`0x10D`), catálogo RDT canal 1 (`cmd=6`), PTZ (`0x112`/`0x118`) e endpoints HTTP `/api/xiaomi/storage`, `/api/xiaomi/control` e `/api/xiaomi/talkback`

### 🐛 Fixes

- fix: corrige bug crítico em `pkg/xiaomi/miss/cs2/conn.go` (`WritePacket` linha 268 que sobrescrevia o payload de áudio criptografado com `hdr`), amplia buffer TCP de leitura de `1200` para `65536` bytes (`cs2+tcp` em 3K) e substitui erro fatal `"pop buffer is full"` por descarte não-bloqueante do pacote mais antigo
- fix: corrige `siid=4` para telemetria MIoT do MicroSD em `xiaomi.camera.cw701` e `isa.camera.hlc7` (`siid=3` em `mxiang.camera.mod11`) e normaliza `usedBytes` em KB

### ⚡ Improvements

- improve: adiciona `drainCommands()` em background no cliente MISS e fechamento automático de sessões P2P temporárias ao alternar entre Live e Playback

## v0.8.1 (build 0014) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: interpreta ordem dos bytes observada na resposta CS2 (commit `f32ac75f6ad99db6c8d2c9f845111a7221ac300a`)

### ⚡ Improvements

- Nenhum.

## v0.8.0 (build 0013) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: facilita acesso local e prepara diagnostico dos comandos Xiaomi (commit `dc8e9260df8a38795c01aacd0b67ea8979f8118e`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.7.0 (build 0012) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: adiciona icones animados e melhora a previa movel das cameras (commit `10e4bfc690399ac3610fc2772ce4378d8209bef2`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.6.0 (build 0011) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: mapeia plugins Xiaomi sem USB e adiciona diagnostico de leitura (commit `6b6fa8d3013f3e0590d87d1a9a551b4c564fb34b`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.5.3 (build 0010) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: inicia ponte YAML com rede restrita ao computador local (commit `8b4c5eb8133b8fd1d843bd50bb42d29060a1c6f1`)

### ⚡ Improvements

- Nenhum.

## v0.5.2 (build 0009) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: recupera ponte e perfis de video apos reiniciar a central (commit `ea8306a72be5fed496904069a074584cfd840bca`)

### ⚡ Improvements

- Nenhum.

## v0.5.1 (build 0008) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: ordena inicializacao das vistas sem interromper video simultaneo (commit `ec978e94fcbdaab0c3bf22e8c042c09eb1c80e2c`)

### ⚡ Improvements

- Nenhum.

## v0.5.0 (build 0007) - 2026-10-26

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: exibe duas visoes simultaneas e prepara calendario timeline e trechos do SD (commit `8c5ac989ef77efcd3743115b024eadfbb2ecd950`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.4.1 (build 0006) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: distingue FourCC da resolucao real nos recibos de audio e video (commit `bfd3407679119065d9caa7fe50d88361a9706561`)

### ⚡ Improvements

- Nenhum.

## v0.4.0 (build 0005) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: adiciona escuta AAC das seis cameras e validacao integrada de audio e video (commit `27936458d63205cd87525f6d10d4a703e6fa4b52`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.3.0 (build 0004) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: adiciona duas visoes Outdoor qualidade nativa NVENC e vinculo HTTPS protegido (commit `7f42ad9f77db2cc14c3bb01d3ad259b9c06ca348`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.2.1 (build 0003) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: interpreta data JSON do processo sem depender da cultura do Windows (commit `fd4e9491e70d43724e0d68c2b767e444ad18f984`)

### ⚡ Improvements

- Nenhum.

## v0.2.0 (build 0002) - 2026-10-25

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: cria central Windows para seis cameras Xiaomi com sessao QR e video H264 (commit `2defcbe409c38e3ee174c0106246454c92e3f392`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## Histórico da preparação — 2026-10-25

### ✨ Features
- Pesquisa documental das alternativas de acesso a câmeras Xiaomi e integração com Google Home/SmartLife; referências em evidence/fontes_publicas.json.
- Escopo confirmado pelo usuário: região China, clientes Android e Windows, acesso local e remoto.
- Identificação comercial dos três modelos nas imagens enviadas pelo usuário; inventário em notes/05_modelos_identificados.md.
- Registro dos três firmwares exibidos pelo app e preparação de ambiente local com go2rtc oficial, sem câmeras conectadas.
- Auxiliar de autorização Xiaomi por QR confirmado no app, com página restrita a loopback e sessão privada separada da tentativa por senha. Geração real do QR validada; aprovação e vídeo pendentes.
- Autorização QR concluída, inventário real das seis câmeras e vídeo decodificado de todas; três famílias confirmadas, com SD nas duas AW300 e observação de 30 segundos em uma Mi 2K.

### ⚡ Improvements
- Estrutura isolada gerada por tools/new-target.ps1.
- Critérios para identificar modelos e validar uma câmera antes de implementar os clientes.
- Preservação dos prints originais por cópias verificadas com SHA-256 e pesquisa de limitações específicas de AW300, HLC7 e CW701. Nenhuma câmera foi acessada.
- Conferência do digest GitHub do go2rtc, HTTP 200 e escuta somente em loopback; runtime/configurações locais excluídos do Git. Não houve nova compilação do projeto.
- Diagnóstico documental do erro de autenticação 70016, com confirmação de login por e-mail/senha no Android e leitura do código público da versão instalada; sem coletar credenciais ou repetir tentativas.
- Cinco testes do auxiliar QR aprovados, cobrindo isolamento de origem e não exposição de dados privados. Não houve compilação, versão publicada ou commit.
- Correção da variante AW300 para mod11, da contagem de fontes e da separação entre resolução anunciada/decodificada. Regra UDP limitada aplicada via UAC, preservando firewall ativo e interfaces em localhost.

Estas anotações registram etapas anteriores ao primeiro commit e build do alvo. Versões posteriores são geradas pelo script próprio, com commits de origem. O helper antigo da raiz continua inadequado para releases por alvo, pois lê os dez commits globais mais recentes.
