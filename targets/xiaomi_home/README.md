# Xiaomi Home — acesso às câmeras

Pesquisa documental iniciada em 2026-10-25 (America/Sao_Paulo).

## Objetivo confirmado

Criar acesso dedicado em Android e Windows, na rede local e pela internet. As câmeras do usuário estão cadastradas na região China. As imagens recebidas identificam comercialmente Outdoor Camera 4 Pro 三摄变焦版, AW300 e Smart Camera Standard 2K. Firmwares observados: 5.3.1_0251, 5.1.6_0031 e 4.6.0_0288; vínculo por ordem dos prints ainda provisório.

## Estado Atual e Próximos Passos

Estado: PROTOTIPO_LOCAL_WINDOWS_VALIDADO. Autorização QR confirmada pelo proprietário; seis câmeras com quadros decodificados e prévias reais no painel. As três famílias reproduziram vídeo H.264 no navegador. Reconexão manual e layout de 390 px conferidos. Ver [teste nativo](notes/09_video_local_validado.md), [central Windows](notes/10_central_windows.md) e [recibo do painel](evidence/central-browser-qa-2026-10-25.json). Android físico, acesso remoto e estabilidade prolongada permanecem pendentes.

- Pesquisa inicial: [notas de viabilidade](notes/00_viabilidade.md).
- Referências e limites de cada evidência: [fontes públicas](evidence/fontes_publicas.json).
- Identificação e suporte: [inventário das três câmeras](notes/05_modelos_identificados.md), com referências e limites por modelo.
- Imagens preservadas em `evidence/user_images/2026-10-25/`, com hashes e verificação das cópias em `manifest.json`.
- Ambiente de teste e procedimento: [sessão local Windows](notes/06_teste_local_windows.md).
- Conta autorizada: duas AW300 `mxiang.camera.mod11`, três Mi 2K `isa.camera.hlc7` e uma Outdoor Pro `xiaomi.camera.cw701`.
- AW300: vídeo comprovado em SD; Mi 2K: até 2304×1296 comprovado; Outdoor Pro: canal inicial 1280×720 comprovado.
- Usuário confirmou que pode manter o Windows ligado no local. Cliente web responsivo e central em [mizin-cameras](reconstructed/mizin-cameras/README.md).
- Próximo passo: usuário escolher Tailscale para o canal privado, efetuar login nos dispositivos e validar a implementação HTTPS/remota por dados móveis. Acesso externo desativado nesta versão.
- Confirmar separadamente as três imagens e os controles da Outdoor Pro.
- Validar separadamente vídeo, áudio, movimento da câmera, gravações do cartão, recuperação de conexão e sessão.
- Testar acesso externo por Android e Windows e, em outra etapa, o destino Google Home desejado.

## Arquitetura adotada para o protótipo

Câmera → go2rtc local → central Windows com H.264 → navegador autenticado. A etapa externa conectará o Android e outros Windows por um canal privado.

Acesso externo exige instalação e configuração próprias. O protótipo não pressupõe acesso aberto direto às câmeras nem elimina a dependência da nuvem Xiaomi para obter chaves de vídeo.

Google Home é uma integração posterior; SmartLife/Tuya exige investigação própria e não é consequência automática de obter o vídeo.

## Integridade e limites

Foram recebidos prints de produtos, firmware, erro de login e lista de câmeras. Somente imagens de produto sem credenciais foram copiadas para evidência pública. A autenticação foi confirmada pelo proprietário no app; tokens e identificação privada ficam em runtime/evidence privados ignorados pelo Git. Houve cadastro de fontes somente na ponte local e liberação UDP estritamente delimitada, aplicada com UAC Windows. Não houve alteração de firmware, senha, região, cadastro Xiaomi ou roteador. Vídeos de QA foram decodificados sem gravação; capturas de tela do novo painel ficam somente na evidência privada. O go2rtc é ferramenta externa de diagnóstico; nenhum APK/firmware Xiaomi foi submetido a REA/Ghidra. Arquivos de outros alvos permanecem preservados.

## Versionamento

O script `scripts/version-build.mjs` calcula versão e build pelos commits deste alvo desde o cursor de release. Não usa os dez commits globais do helper antigo. `VERSION`, `CHANGELOG.md`, `release-state.json`, manifesto da interface e recibo de build são gerados juntos. Artefatos são preservados em diretórios novos a cada build. Consulte o README do cliente para comandos e pré-requisitos; não atribuir versões manualmente.

## Comandos e coleta

O comando de inicialização e os critérios de validação estão em [registro da sessão](evidence/sessao_2026-10-25.md).
