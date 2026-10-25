# Mizin Câmeras — central Windows

Protótipo local com seis câmeras reais, interface responsiva e vídeo H.264 transcodificado sob demanda. Não é um APK nem um instalador Windows nesta fase.

## Executar no ambiente preparado

Pré-requisitos: Node.js 24+, FFmpeg indicado no arquivo privado `runtime/central/tool-paths.json`, ponte go2rtc autorizada em `127.0.0.1:19843` e inventário privado de câmeras. A configuração Xiaomi e seus tokens permanecem fora deste aplicativo e do Git.

Depois de um build concluído, executar a partir da raiz do repositório:

```powershell
.\targets\xiaomi_home\scripts\start-central.ps1 -OpenBrowser
```

`-Restart` reinicia apenas o processo registrado desta central, após conferir executável e horário de início. O navegador recebe um link local de uso único; a sessão persiste por até 30 dias. Não compartilhar o arquivo privado `local-access.json`. Uma sessão expirada exige novo vínculo; não há promessa de login permanente.

O protótipo limita vídeo a dois clientes simultâneos, um vídeo por cliente. As prévias são imagens estáticas e têm cache de até 60 segundos. Áudio, PTZ, zoom e gravações ainda não estão disponíveis. H.264 usa CPU; desempenho com dois clientes não foi medido.

## Verificar e gerar versão

```powershell
node --test targets/xiaomi_home/reconstructed/mizin-cameras/test/server.test.mjs targets/xiaomi_home/scripts/test-version-build.mjs targets/xiaomi_home/scripts/test-version-build-integration.mjs
node targets/xiaomi_home/scripts/version-build.mjs --plan
```

Após commit estruturado dos fontes do alvo, `--build --run-id <identificador-unico>` calcula a versão e incrementa o build. O cálculo ignora outros alvos e commits que alteram somente metadados gerados. `VERSION`, changelog, manifesto da interface e recibo apontam para o commit de origem. Repetir o mesmo identificador não cria outro build; um novo identificador representa outra compilação e incrementa o contador. Artefatos ficam em `runtime/builds/`, ignorados pelo Git. Falhas reservam o número e são registradas no recibo.

## Acesso remoto

Ainda desativado no servidor. O caminho proposto é uma rede privada Tailscale com HTTPS e autenticação do aplicativo. Exige instalação, login do proprietário e teste real pelo Android em dados móveis. A ponte de diagnóstico e o auxiliar QR não devem ser publicados. Consulte `notes/10_central_windows.md` no alvo.
