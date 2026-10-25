# Autorização por QR — 2026-10-25

## Motivo

O usuário relata que o app aceita e-mail/senha, enquanto o site só permitiu acesso pelo Google, com o mesmo ID Xiaomi. Isso confirma uma identidade comum segundo o usuário, mas não prova que o login direto com senha funcione no cliente alternativo. O go2rtc instalado não implementa o botão Entrar com Google.

Uma referência aberta implementa QR login para o serviço Xiaomi Home (`xiaomiio`): PiotrMachowski/Xiaomi-cloud-tokens-extractor, classe QrCodeXiaomiCloudConnector. Código e licença MIT preservados em `evidence/tools/xiaomi-qr-reference/`. SHA-256 do arquivo consultado: `E4EB8220DF0F68C945C21CDE5DBC5A0A276E7A035857B568D9423788EF192A30`.

## Auxiliar local

- Código próprio de diagnóstico: `scripts/xiaomi-qr-login.py`, usando somente a biblioteca padrão Python.
- Página: `http://127.0.0.1:19840/`, acessível somente neste Windows.
- Botão Gerar QR code inicia o fluxo Xiaomi; não há entrada de senha ou código recebido por e-mail.
- QR gerado pelo serviço Xiaomi, mantido apenas em memória. O proprietário deve escanear e aprovar no Xiaomi Home já conectado.
- As URLs remotas são restritas a HTTPS em domínios Xiaomi/mi.com; redirecionamentos também passam por essa verificação.
- A página usa controle de origem/Host e token contra requisições de outros sites, sem CORS e sem cache.
- Dados privados não são retornados pelo endpoint `/status`. Não registrar QR, contexto, cookies, passToken ou identidade de conta em evidência pública.

## Após aprovação do proprietário

O auxiliar usará a credencial dessa nova autorização confirmada pelo próprio usuário; não lê cookies do navegador ou sessão do Android. O `passToken` recebido pelo fluxo será salvo somente no diretório `runtime/qr-login/`, ignorado pelo Git.

Será iniciada uma segunda instância go2rtc com configuração própria: interface `127.0.0.1:19843`, mídia `127.0.0.1:19844`, RTSP desativado. A instância anterior em 19841 é preservada. O auxiliar tentará listar apenas câmeras da região cn, usando o endpoint da integração Xiaomi já presente no go2rtc. Não há varredura de outras redes ou coleta de chaves BLE.

O formato da configuração foi conferido com `internal/xiaomi/xiaomi.go` e `pkg/xiaomi/cloud.go` da tag instalada v1.9.15. O funcionamento após o retorno do QR ainda depende da autorização real e não foi comprovado nesta preparação.

## Validação executada

- Cinco testes de fronteira passaram: destinos HTTPS oficiais; exclusão de dados privados no status; bloqueio de origem externa; página sem cache e nonce consistente; bloqueio de início duplicado.
- HTTP da página local: 200.
- Fluxo real inicial: Xiaomi retornou QR PNG de 15.009 bytes; endpoint local `/qr` respondeu 200. Não foi salvo o conteúdo da imagem.
- Estado nessa verificação: `waiting`, aguardando confirmação no telefone.
- Ainda não comprovados: autorização final, reutilização pelo go2rtc, listagem de câmeras, vídeo, áudio ou renovação da sessão.

Comando de testes, usando o runtime Python do ambiente:

```powershell
& 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'targets/xiaomi_home/scripts/test_xiaomi_qr_login.py' -v
```

Inicialização realizada com Start-Process, janela oculta, apontando para `scripts/xiaomi-qr-login.py`. PID e horário da sessão estão em `runtime/qr-login/helper-process.json`. Nenhuma alteração de senha, firmware, região ou firewall foi feita.

## Estabilidade ainda a medir

Há relatos de expiração de sessão Xiaomi no go2rtc, por exemplo issue #2233. Não tratar o QR como garantia de eliminar as quedas de login. A retenção e renovação da autorização deverão ser medidas antes de escolher esse caminho para o aplicativo final.

## Resultado posterior nesta sessão

O proprietário aprovou o QR e a mesma sessão listou seis câmeras. O vídeo das seis foi depois decodificado localmente, conforme `notes/09_video_local_validado.md`. O estado de espera registrado acima corresponde à preparação anterior. Renovação/expiração da sessão continua pendente de observação prolongada.
