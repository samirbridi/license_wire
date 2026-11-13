# v0.24.1 build 0038 — publicacao e atualizacao pela internet funcionando de verdade

Pedido do usuario: "compilar e publicar a ultima versao para que o plugin possa se atualizar". Corrige a afirmacao da nota 36 de que o canal de internet ja funcionava.

## O que aconteceu na publicacao

1. Build 0037 gerado e verificado (nota 37) e publicado. A primeira tentativa so publicou a rede local: `npx --no-install wrangler` tentou a versao mais nova (4.161.0), que nao estava no cache do npx. O cache tem a 4.152.0, ja logada na conta Cloudflare. `Publish-CrispixBuild.ps1` ganhou `-WranglerVersion` (padrao `4.152.0`).
2. Na conferencia pos-publicacao: o `latest.json` do site saia com **BOM UTF-8** (`Set-Content -Encoding UTF8` do PowerShell 5.1). Medido no manifesto ao vivo: o `Json.lua` do plugin falhava ("Numero JSON invalido") e o `ConvertFrom-Json` do atualizador tambem ("JSON primitivo invalido: ï"). Conclusao: desde o build 0036 o canal de internet **nunca** respondeu; o plugin e o atualizador sempre caiam para a rede local, e fora dela diriam "sem conexao". Os testes do 0036 usavam doubles com JSON limpo, por isso nao pegaram.
3. Correcoes: o publicador grava UTF-8 sem BOM (`[IO.File]::WriteAllText` + `UTF8Encoding($false)`); `CheckUpdates.lua` remove BOM (`stripBom`) nos dois canais; `Update-CrispixPlugin.ps1` decodifica os bytes como UTF-8 e remove BOM. Teste de regressao `test_internet_manifest_with_utf8_bom_is_still_read` (bytes reais; confirmado que falha no codigo antigo e passa no novo).
4. Para nao existirem dois pacotes diferentes com o numero 0037, a correcao saiu como **v0.24.1 (build 0038)**. O ZIP 0037 continua no R2/rede (inofensivo); o manifesto aponta para o 0038.

Observacao: o Cloudflare responde 403 ao User-Agent `Python-urllib` (protecao contra robos), mas 200 para PowerShell, curl, navegador e um UA de Lightroom. Nao afeta o plugin; para testes em Python use outro UA ou curl.

## Verificacao

- 191 testes OK (suite completa com lupa/rawpy).
- Pacote `private/deliveries/CRISPIX-0.24.1-build0038-e988b572/`, ZIP 84.043.873 bytes, SHA-256 `8de548266b36abafa5d1aaa108ad40e48e85b665aa684ccbacf8c88acf61460e`, 1.746 arquivos. `verify_editing_release.py` OK (CRC, 1.746 hashes, 33 Lua compilados, 2 RAWs reais, originais intactos). Recibo `evidence/editing-plugin-qa-0038.json`. Recibo do 0037: `evidence/editing-plugin-qa-0037.json`.
- Publicado nos dois canais e conferido de fora: manifesto sem BOM lido com sucesso pelo `Json.lua` real (inalterado desde o 0036, ou seja, os plugins ja instalados enxergam o 0038 pela internet) e pelo parser do atualizador antigo e do novo; download do R2 com hash identico; site HTTP 200; rede local em 0038.

## Pendente

- QA nativo do enquadramento (nota 37) e primeira execucao real de "Verificar atualizações" pela internet dentro do Lightroom (LrHttp ainda nao exercitado ao vivo).
