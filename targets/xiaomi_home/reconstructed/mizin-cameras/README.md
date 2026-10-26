# Mizin Câmeras — central Windows

Inicialização: `powershell -File targets/xiaomi_home/scripts/start-central.ps1`, a partir da raiz do repositório. O script usa o build gerado, recupera a ponte local quando encerrada e restaura os aliases ausentes a partir de runtime/central/bridge-streams.json. Esses arquivos privados e a autorização Xiaomi devem existir neste computador; não são distribuídos no Git. A qualidade escolhida controla resolução/bitrate da saída; a entrada usa o perfil nativo validado.

Protótipo local com seis câmeras reais, interface responsiva e vídeo H.264 transcodificado sob demanda. Não é um APK nem um instalador Windows nesta fase.

## Executar no ambiente preparado

Pré-requisitos: Node.js 24+, FFmpeg indicado no arquivo privado `runtime/central/tool-paths.json`, ponte go2rtc autorizada em `127.0.0.1:19843` e inventário privado de câmeras. A configuração Xiaomi e seus tokens permanecem fora deste aplicativo e do Git.

Depois de um build concluído, executar a partir da raiz do repositório:

```powershell
.\targets\xiaomi_home\scripts\start-central.ps1 -OpenBrowser
```

`-Restart` reinicia apenas o processo registrado desta central, após conferir executável e horário de início. O navegador recebe um link local de uso único; a sessão persiste por até 30 dias. Não compartilhar o arquivo privado `local-access.json`. Uma sessão expirada exige novo vínculo; não há promessa de login permanente.

O protótipo permite até dois clientes, com duas vistas da mesma câmera por cliente. A Outdoor Pro abre as duas juntas, com seleção de foco/áudio e ampliação opcional de uma. Trocar de câmera ou encerrar sessão encerra os processos correspondentes. As prévias são imagens estáticas com cache de até 60 segundos, separadas por câmera/vista.

Resolução nativa mantém até 3840 pixels de largura sem ampliar fontes menores. A imagem continua sendo convertida para H.264 a 15 fps. O encoder pode ser libx264/CPU ou h264_nvenc; este Windows seleciona NVENC após teste local. Decodificação/redimensionamento não foram movidos para GPU. Desempenho com dois clientes exibindo quatro vídeos não foi medido.

Ouvir/Silenciar controla a escuta do áudio AAC convertido a partir do áudio nativo das câmeras. Cada câmera abre inicialmente mutada. O aplicativo não solicita microfone nesta fase. O teste físico de audição é distinto dos recibos de recepção/decodificação. Fala, PTZ, zoom e reprodução do SD continuam pendentes.

Gravações abre a navegação por mês/dia e a estrutura de timeline/trecho. O adaptador SD ainda retorna disponibilidade desconhecida (`periods: null`), com reprodução/download desabilitados. A interface não contém períodos de gravação fictícios. O modelo de recorte/busca tem testes próprios; acesso e exportação do cartão ainda precisam de validação real.

## Verificar e gerar versão

```powershell
node --test targets/xiaomi_home/reconstructed/mizin-cameras/test/*.test.mjs targets/xiaomi_home/scripts/test-*.mjs
node targets/xiaomi_home/scripts/version-build.mjs --plan
```

Após commit estruturado dos fontes do alvo, `--build --run-id <identificador-unico>` calcula a versão e incrementa o build. O cálculo ignora outros alvos e commits que alteram somente metadados gerados. `VERSION`, changelog, manifesto da interface e recibo apontam para o commit de origem. Repetir o mesmo identificador não cria outro build; um novo identificador representa outra compilação e incrementa o contador. Artefatos ficam em `runtime/builds/`, ignorados pelo Git. Falhas reservam o número e são registradas no recibo.

## Acesso remoto

O usuário escolheu link/login sem VPN e já tem Cloudflare R2. O adaptador HTTPS está implementado, com porta loopback distinta, segredo do proxy, origem exata, cookie Secure, vínculo remoto de uso único e revogação dos acessos pelo Windows. Ele só é ativado quando existe a configuração privada `runtime/central/https-gateway.json`; nenhum gateway está configurado neste Windows. O listener local recusa encaminhamento de proxy.

R2 pode guardar gravações e segmentos; login/sinalização e transporte ao vivo exigem componentes adicionais. Não foi criada conta, gateway, Worker ou bucket nesta etapa. A ponte de diagnóstico e o auxiliar QR permanecem internos. Consulte `notes/11_recursos_nativos_e_cloudflare.md` no alvo.
