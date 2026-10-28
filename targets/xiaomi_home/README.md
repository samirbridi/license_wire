# Xiaomi Home — acesso às câmeras

Pesquisa documental iniciada em 2026-10-25 (America/Sao_Paulo).

## Objetivo confirmado

Criar acesso dedicado em Android e Windows, na rede local e pela internet. As câmeras do usuário estão cadastradas na região China. As imagens recebidas identificam comercialmente Outdoor Camera 4 Pro 三摄变焦版, AW300 e Smart Camera Standard 2K. Firmwares observados: 5.3.1_0251, 5.1.6_0031 e 4.6.0_0288; vínculo por ordem dos prints ainda provisório.

## Estado Atual e Próximos Passos

A central integra catálogo SD, calendário, linha do tempo e exportação real de trechos nas três famílias. Os quatro testes de download autenticado (Outdoor nas duas vistas, AW300 Garagem e Mi 2K Sala) produziram cinco segundos de vídeo H.264 na resolução nativa. Capturas e arquivos ficaram privados. O horário do painel usa São Paulo, inclusive quando a sobreposição da Outdoor usa China. Detalhes, limites e comandos em [SD e migração](notes/17_sd_replay_publicacao_migracao.md).

A publicação em `https://homecams.pages.dev` usa Pages, Worker privado e Cloudflare Tunnel/VPC. O teste público de autenticação, catálogo e MP4 SD passou no build 0019; [recibo sanitizado](evidence/builds/20261028-build0019-public-qa.json). Para vincular o celular, abra **Sua central → Vincular celular por link** no navegador local autenticado. O convite vale por dez minutos e um único uso. O acesso ainda depende da central local ligada.

O proprietário informou NAS Synology DS425+. A migração está sendo preparada; o DSM já está autenticado e o Container Manager 24.0.2-1706 foi instalado. O pacote privado de instalação está pronto, aguardando confirmação para envio das credenciais e ativação. A Oracle tem cota A1 de 2 OCPUs/12 GB em São Paulo, mas retornou falta de capacidade física. Nenhuma capacidade paga foi contratada. Linux em contêiner, NAS físico, reconexão prolongada e funcionamento com Windows desligado precisam de validação própria.

Permanecem em validação: joystick/PTZ, zoom físico, execução/edição de rondas, fala e áudio das gravações SD. A exportação atual cobre até 60 segundos dentro de um arquivo, sem áudio; não monta intervalos de vários arquivos. O diagnóstico isolado anterior confirmou consultas de cartão nas seis unidades e seis posições da Outdoor, sem executar movimento. Mi 2K Estúdio retornou SD-No-Work e requer conferência do cartão no app.

Para abrir a central local, use `Abrir-Central.cmd`. Ele preserva as sessões autorizadas e recupera a ponte e as fontes locais. O código de acesso pertence à central. As qualidades observadas foram 2880×1620 na Outdoor e 2304×1296 nas AW300/Mi 2K; não há 4K comprovado. As evidências anteriores permanecem em notes/09 a notes/16.

## Arquitetura adotada para o protótipo

Câmera → go2rtc local → central Windows com H.264 → navegador autenticado. A etapa externa conectará o Android e outros Windows por um canal privado.

Acesso externo exige instalação e configuração próprias. O protótipo não pressupõe acesso aberto direto às câmeras nem elimina a dependência da nuvem Xiaomi para obter chaves de vídeo.

Google Home é uma integração posterior; SmartLife/Tuya exige investigação própria e não é consequência automática de obter o vídeo.

## Integridade e limites

Foram recebidos prints de produtos, firmware, erro de login e lista de câmeras. Somente imagens de produto sem credenciais foram copiadas para evidência pública. A autenticação foi confirmada pelo proprietário no app; tokens e identificação privada ficam em runtime/evidence privados ignorados pelo Git. Houve cadastro de fontes somente na ponte local e liberação UDP estritamente delimitada, aplicada com UAC Windows. Não houve alteração de firmware, senha, região, cadastro Xiaomi ou roteador. Os vídeos iniciais foram apenas decodificados; nesta etapa, trechos SD de cinco segundos foram preservados exclusivamente na evidência privada. Capturas de tela do painel também permanecem privadas. O go2rtc é ferramenta externa de diagnóstico. O APK oficial foi preservado e inspecionado estaticamente; a tentativa REA/JADX do APK completo atingiu o prazo de 120 s, sem resultado de decompilação confirmado. Arquivos de outros alvos permanecem preservados.

## Versionamento

O script `scripts/version-build.mjs` calcula versão e build pelos commits deste alvo desde o cursor de release. Não usa os dez commits globais do helper antigo. `VERSION`, `CHANGELOG.md`, `release-state.json`, manifesto da interface e recibo de build são gerados juntos. Artefatos são preservados em diretórios novos a cada build. Consulte o README do cliente para comandos e pré-requisitos; não atribuir versões manualmente.

O build exige fontes limpas nos dois componentes reconstruídos e nos scripts efetivos de compilação/inicialização. Scripts de investigação paralelos fora desses inputs não são empacotados nem alterados pelo build; seus commits futuros continuam entrando no histórico do alvo. Isso preserva trabalho em andamento de outras IDEs sem incluir fontes não rastreadas no artefato.

## Comandos e coleta

O comando de inicialização e os critérios de validação estão em [registro da sessão](evidence/sessao_2026-10-25.md). O APK oficial de desenvolvimento foi preservado em binaries com SHA256; proveniência em [coleta do APK](evidence/official-apk-provenance.json). A investigação estática não instala ou executa o aplicativo.
