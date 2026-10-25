# Mizin Câmeras — central Windows

Protótipo local com seis câmeras reais, interface responsiva e vídeo H.264 transcodificado sob demanda. Não é um APK nem um instalador Windows nesta fase.

## Executar no ambiente preparado

Pré-requisitos: Node.js 24+, FFmpeg indicado no arquivo privado `runtime/central/tool-paths.json`, ponte go2rtc autorizada em `127.0.0.1:19843` e inventário privado de câmeras. A configuração Xiaomi e seus tokens permanecem fora deste aplicativo e do Git.

Depois de um build concluído, executar a partir da raiz do repositório:

```powershell
.\targets\xiaomi_home\scripts\start-central.ps1 -OpenBrowser
```

`-Restart` reinicia apenas o processo registrado desta central, após conferir executável e horário de início. O navegador recebe um link local de uso único; a sessão persiste por até 30 dias. Não compartilhar o arquivo privado `local-access.json`. Uma sessão expirada exige novo vínculo; não há promessa de login permanente.

O protótipo limita vídeo a dois clientes simultâneos, um vídeo por cliente. As prévias são imagens estáticas e têm cache de até 60 segundos. A Outdoor Pro oferece seleção entre Visão 1 e Visão 2; Resolução nativa mantém até 3840 pixels de largura sem ampliar fontes menores. A imagem continua sendo convertida para H.264 a 15 fps. O encoder pode ser libx264/CPU ou h264_nvenc; a configuração privada deste Windows seleciona NVENC após teste local. Decodificação/redimensionamento não foram movidos para GPU. Desempenho com dois clientes não foi medido. Áudio, PTZ, zoom e reprodução do SD continuam pendentes.

## Verificar e gerar versão

```powershell
node --test targets/xiaomi_home/reconstructed/mizin-cameras/test/server.test.mjs targets/xiaomi_home/reconstructed/mizin-cameras/test/remote.test.mjs targets/xiaomi_home/scripts/test-version-build.mjs targets/xiaomi_home/scripts/test-version-build-integration.mjs
node targets/xiaomi_home/scripts/version-build.mjs --plan
```

Após commit estruturado dos fontes do alvo, `--build --run-id <identificador-unico>` calcula a versão e incrementa o build. O cálculo ignora outros alvos e commits que alteram somente metadados gerados. `VERSION`, changelog, manifesto da interface e recibo apontam para o commit de origem. Repetir o mesmo identificador não cria outro build; um novo identificador representa outra compilação e incrementa o contador. Artefatos ficam em `runtime/builds/`, ignorados pelo Git. Falhas reservam o número e são registradas no recibo.

## Acesso remoto

O usuário escolheu link/login sem VPN e já tem Cloudflare R2. O adaptador HTTPS está implementado, com porta loopback distinta, segredo do proxy, origem exata, cookie Secure, vínculo remoto de uso único e revogação dos acessos pelo Windows. Ele só é ativado quando existe a configuração privada `runtime/central/https-gateway.json`; nenhum gateway está configurado neste Windows. O listener local recusa encaminhamento de proxy.

R2 pode guardar gravações e segmentos; login/sinalização e transporte ao vivo exigem componentes adicionais. Não foi criada conta, gateway, Worker ou bucket nesta etapa. A ponte de diagnóstico e o auxiliar QR permanecem internos. Consulte `notes/11_recursos_nativos_e_cloudflare.md` no alvo.
