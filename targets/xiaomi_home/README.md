# Xiaomi Home — acesso às câmeras

Pesquisa documental iniciada em 2026-10-25 (America/Sao_Paulo).

## Objetivo confirmado

Criar acesso dedicado em Android e Windows, na rede local e pela internet. As câmeras do usuário estão cadastradas na região China. As imagens recebidas identificam comercialmente Outdoor Camera 4 Pro 三摄变焦版, AW300 e Smart Camera Standard 2K. Firmwares observados: 5.3.1_0251, 5.1.6_0031 e 4.6.0_0288; vínculo por ordem dos prints ainda provisório.

## Estado Atual e Próximos Passos

Estado: PROTOTIPO_LOCAL_WINDOWS_VALIDADO, com ampliação de vistas e qualidade nativa. Autorização QR confirmada pelo proprietário; seis câmeras com quadros decodificados e prévias reais no painel. As três famílias reproduziram vídeo H.264 no navegador. Outdoor Pro tem dois canais comprovados a 2880×1620; as duas AW300 chegaram a 2304×1296. Ver [teste nativo](notes/09_video_local_validado.md), [central Windows](notes/10_central_windows.md), [recursos e Cloudflare](notes/11_recursos_nativos_e_cloudflare.md) e os recibos em evidence. Android físico, acesso remoto, áudio, SD, PTZ e estabilidade prolongada permanecem pendentes.

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

Foram recebidos prints de produtos, firmware, erro de login e lista de câmeras. Somente imagens de produto sem credenciais foram copiadas para evidência pública. A autenticação foi confirmada pelo proprietário no app; tokens e identificação privada ficam em runtime/evidence privados ignorados pelo Git. Houve cadastro de fontes somente na ponte local e liberação UDP estritamente delimitada, aplicada com UAC Windows. Não houve alteração de firmware, senha, região, cadastro Xiaomi ou roteador. Vídeos de QA foram decodificados sem gravação; capturas de tela do novo painel ficam somente na evidência privada. O go2rtc é ferramenta externa de diagnóstico; nenhum APK/firmware Xiaomi foi submetido a REA/Ghidra. Arquivos de outros alvos permanecem preservados.

## Versionamento

O script `scripts/version-build.mjs` calcula versão e build pelos commits deste alvo desde o cursor de release. Não usa os dez commits globais do helper antigo. `VERSION`, `CHANGELOG.md`, `release-state.json`, manifesto da interface e recibo de build são gerados juntos. Artefatos são preservados em diretórios novos a cada build. Consulte o README do cliente para comandos e pré-requisitos; não atribuir versões manualmente.

## Comandos e coleta

O comando de inicialização e os critérios de validação estão em [registro da sessão](evidence/sessao_2026-10-25.md).
