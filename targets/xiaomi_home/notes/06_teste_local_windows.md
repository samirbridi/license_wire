# Teste local Windows — 2026-10-25

## Preparação concluída

- Ferramenta de terceiros: go2rtc oficial v1.9.15, commit 7c05066, Windows AMD64.
- ZIP obtido em `https://github.com/AlexxIT/go2rtc/releases/download/v1.9.15/go2rtc_win64.zip`.
- SHA-256 do ZIP coincide com o digest publicado pela API de releases do GitHub: `5b448fc90f15c925406d8da0984301985e385050222c1c2bbdf0a76fe4b1e9cb`.
- Metadados públicos: `evidence/tools/go2rtc-v1.9.15-release.json`.
- Runtime em `runtime/go2rtc-v1.9.15/`; configuração e logs em `runtime/local-test/`, ignorados pelo Git.
- Configuração pública sem credenciais: `scripts/go2rtc-local.yaml.example`.
- Processo iniciado com `Start-Process -WindowStyle Hidden`, sem instalação de serviço ou inicialização automática do Windows.
- API/WebUI: `http://127.0.0.1:19841/`; página Add: `http://127.0.0.1:19841/add.html`.
- Verificação: HTTP 200; zero streams antes do login; versão retornada pelo executável coincide com a release.
- `netstat -ano` confirmou somente TCP 127.0.0.1:19841, TCP/UDP 127.0.0.1:19842 para esse processo. Servidor RTSP desativado.

Isso comprova o funcionamento da ferramenta no Windows e o escopo de escuta inicial. Não comprova autenticação Xiaomi nem reprodução de câmeras.

## Etapa do proprietário

1. Abrir a página Add neste computador e clicar em Xiaomi.
2. Autenticar a própria conta na interface local, inclusive código/captcha se solicitado. Não enviar senha, token ou código pelo chat.
3. Selecionar a região China/cn quando a interface listar as câmeras; confirmar nome e identificador de uma câmera da mesma LAN.
4. Priorizar AW300 ou Standard 2K. A conexão e o vídeo ainda serão testados depois do login.

A configuração local poderá guardar credenciais de sessão. Não copiar seu conteúdo para notas, commits, chat ou relatório. A regra `.gitignore` protege a configuração de inclusão acidental no Git; não é criptografia do arquivo.

## Reprodução técnica

Executável validado com `go2rtc.exe -v` e `go2rtc.exe -h`. Inicialização equivalente, a partir da raiz do alvo:

```powershell
$testConfig = Join-Path (Get-Location) 'runtime/local-test/go2rtc.yaml'
$testExe = Join-Path (Get-Location) 'runtime/go2rtc-v1.9.15/go2rtc.exe'
Start-Process -FilePath $testExe -ArgumentList @('-config', ('"{0}"' -f $testConfig)) -WorkingDirectory (Split-Path -Parent $testConfig) -WindowStyle Hidden
```

Não iniciar outra instância se as portas já estiverem ocupadas. O PID e o horário da instância desta sessão estão em `runtime/local-test/process.json`. Para encerrar, conferir o executável desse PID antes de parar somente a instância do alvo.

## Limites e próximos resultados

Não foi alterado firewall, roteador, firmware ou vínculo da câmera. Não foi executada varredura da rede. A inspeção de interfaces foi realizada por .NET após as consultas CIM retornarem acesso negado. O usuário confirmou Windows na mesma LAN de ao menos uma câmera; ainda falta confirmar qual unidade.

As buscas públicas pelos três firmwares exatos não trouxeram prova de compatibilidade. Ausência de resultado não demonstra incompatibilidade. Testar vídeo real, tempo da primeira imagem, continuidade e reconexão antes de iniciar os clientes finais.
