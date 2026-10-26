# Xiaomi Home — acesso às câmeras

Pesquisa documental iniciada em 2026-10-25 (America/Sao_Paulo).

## Objetivo confirmado

Criar acesso dedicado em Android e Windows, na rede local e pela internet. As câmeras do usuário estão cadastradas na região China. As imagens recebidas identificam comercialmente Outdoor Camera 4 Pro 三摄变焦版, AW300 e Smart Camera Standard 2K. Firmwares observados: 5.3.1_0251, 5.1.6_0031 e 4.6.0_0288; vínculo por ordem dos prints ainda provisório.

## Estado Atual e Próximos Passos

Estado: PROTOTIPO_LOCAL_WINDOWS_VALIDADO, com vistas, qualidade nativa e escuta de áudio. Autorização QR confirmada pelo proprietário; seis câmeras com quadros e áudio decodificados, e prévias reais no painel. As três famílias reproduziram vídeo H.264 no navegador. Outdoor Pro tem dois canais comprovados a 2880×1620; AW300/Mi 2K chegaram a 2304×1296. Ver [teste nativo](notes/09_video_local_validado.md), [central Windows](notes/10_central_windows.md), [recursos e Cloudflare](notes/11_recursos_nativos_e_cloudflare.md) e os recibos em evidence. Android físico, acesso remoto, audição física, fala, SD, PTZ e estabilidade prolongada permanecem pendentes.

O painel inclui exibição simultânea das duas vistas, seleção apenas de foco/áudio, ampliação opcional e navegação de gravações por mês/dia. A consulta real do SD e os downloads continuam indisponíveis até o protocolo nativo ser integrado; veja [estado da visão dupla, gravações e rondas](notes/12_visao_dupla_gravacoes_rondas.md). A validação de serviço e a visual são registradas separadamente.

A abertura concorrente e a reprodução simultânea das duas vistas passaram no teste real e no navegador. O inicializador recupera a ponte e o cadastro de fontes após reinício a partir dos arquivos privados existentes. Não há execução automática no boot do Windows configurada.

A investigação sem USB obteve metadados e pacotes oficiais dos três modelos ao identificar o serviço de autenticação China. O módulo da Outdoor expõe os formatos de catálogo SD, replay, download, posições e rondas; ver [plugins e protocolo](notes/13_plugins_sem_usb.md). Esses formatos ainda exigem adaptação e teste de transporte antes de liberar os controles físicos e o cartão na interface.

Os ícones usam SVG próprio e Morphicons local com movimento reduzido; o layout estreito prioriza cartões legíveis e controles de toque. O proprietário manteve a validação somente no navegador. As referências Artemis, Home Assistant oficial e Map Extractor foram avaliadas em [interface e Android](notes/14_referencias_interface_android.md). A primeira consulta do diagnóstico independente falhou na conexão P2P antes de enviar o comando; isso não valida leitura de SD ou posições.

- Pesquisa inicial: [notas de viabilidade](notes/00_viabilidade.md).
- Referências e limites de cada evidência: [fontes públicas](evidence/fontes_publicas.json).
- Identificação e suporte: [inventário das três câmeras](notes/05_modelos_identificados.md), com referências e limites por modelo.
- Imagens preservadas em `evidence/user_images/2026-10-25/`, com hashes e verificação das cópias em `manifest.json`.
- Ambiente de teste e procedimento: [sessão local Windows](notes/06_teste_local_windows.md).
- Conta autorizada: duas AW300 `mxiang.camera.mod11`, três Mi 2K `isa.camera.hlc7` e uma Outdoor Pro `xiaomi.camera.cw701`.
- AW300 e Mi 2K: 2304×1296 nas cinco unidades; Outdoor Pro: duas vistas a 2880×1620. A unidade do Estúdio usa o perfil de qualidade 4, após testes dos perfis 0/3/4/5. Não há 4K comprovado.
- Usuário confirmou que pode manter o Windows ligado no local. Cliente web responsivo e central em [mizin-cameras](reconstructed/mizin-cameras/README.md).
- Decisão posterior: usuário recusou VPN no Android, quer link/login e já utiliza Cloudflare R2. O desenho remoto combina serviço de login/sinalização e transporte de vídeo; R2 entra como armazenamento. Nenhum bucket ou conta foi modificado.
- Confirmar escuta/fala, controle direcional/zoom e reprodução temporal das gravações SD. Duas vistas da Outdoor Pro já foram identificadas.
- Validar separadamente vídeo, áudio, movimento da câmera, gravações do cartão, recuperação de conexão e sessão.
- Testar acesso externo por Android e Windows e, em outra etapa, o destino Google Home desejado.

## Arquitetura adotada para o protótipo

Câmera → go2rtc local → central Windows com H.264 → navegador autenticado. A etapa externa conectará o Android e outros Windows por um canal privado.

Acesso externo exige instalação e configuração próprias. O protótipo não pressupõe acesso aberto direto às câmeras nem elimina a dependência da nuvem Xiaomi para obter chaves de vídeo.

Google Home é uma integração posterior; SmartLife/Tuya exige investigação própria e não é consequência automática de obter o vídeo.

## Integridade e limites

Foram recebidos prints de produtos, firmware, erro de login e lista de câmeras. Somente imagens de produto sem credenciais foram copiadas para evidência pública. A autenticação foi confirmada pelo proprietário no app; tokens e identificação privada ficam em runtime/evidence privados ignorados pelo Git. Houve cadastro de fontes somente na ponte local e liberação UDP estritamente delimitada, aplicada com UAC Windows. Não houve alteração de firmware, senha, região, cadastro Xiaomi ou roteador. Vídeos de QA foram decodificados sem gravação; capturas de tela do novo painel ficam somente na evidência privada. O go2rtc é ferramenta externa de diagnóstico. O APK oficial foi preservado e inspecionado estaticamente; a tentativa REA/JADX do APK completo atingiu o prazo de 120 s, sem resultado de decompilação confirmado. Arquivos de outros alvos permanecem preservados.

## Versionamento

O script `scripts/version-build.mjs` calcula versão e build pelos commits deste alvo desde o cursor de release. Não usa os dez commits globais do helper antigo. `VERSION`, `CHANGELOG.md`, `release-state.json`, manifesto da interface e recibo de build são gerados juntos. Artefatos são preservados em diretórios novos a cada build. Consulte o README do cliente para comandos e pré-requisitos; não atribuir versões manualmente.

O build exige fontes limpas nos dois componentes reconstruídos e nos scripts efetivos de compilação/inicialização. Scripts de investigação paralelos fora desses inputs não são empacotados nem alterados pelo build; seus commits futuros continuam entrando no histórico do alvo. Isso preserva trabalho em andamento de outras IDEs sem incluir fontes não rastreadas no artefato.

## Comandos e coleta

O comando de inicialização e os critérios de validação estão em [registro da sessão](evidence/sessao_2026-10-25.md). O APK oficial de desenvolvimento foi preservado em binaries com SHA256; proveniência em [coleta do APK](evidence/official-apk-provenance.json). A investigação estática não instala ou executa o aplicativo.
