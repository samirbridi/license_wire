# Neurapix - referencia de fluxos e inspecao estatica

> **Versão da Análise**: `v0.1.0 (build 0001)`
> Data: 2026-10-30, America/Sao_Paulo.

Pacote fornecido pelo usuario para orientar uma implementacao independente em targets/mizin_lightroom. Os originais do fornecedor ficam isolados e privados neste alvo. Nenhum codigo, recurso visual ou peso foi reutilizado no nosso produto.

## Estado Atual e Próximos Passos

Analise aprofundada executada com REA por CLI e leitor estatico de Lua: 73 modulos, 1.916 prototipos e 7.137 chamadas resolvidas com offsets. O motor externo npx.exe foi identificado no log, mas nao veio no pacote e seu caminho remoto esta protegido. A analise nativa do motor depende desse arquivo; nao foi recuperado o modelo pessoal nem a arquitetura neural. Detalhes em `notes/05_analise_profunda_e_limites.md`.

- Preservados 964 arquivos, 78.614.713 bytes, com SHA-256 de origem/copia iguais e fontes estaveis. Manifesto em binaries/SHA256SUMS.txt; originais em private/originals/.
- Os 73 arquivos .lua sao chunks compilados Lua 5.1. Um parser limitado leu seus metadados sem carregar bytecode em VM nem executar plugin, instalador ou ferramentas do fornecedor. Todos foram parseados integralmente, sem bytes restantes.
- Info.lua declara menus de selecao, criacao/ajuste de estilo, edicao, recebimento de ajustes, automacoes e envio de correcoes. A constante de build observada e 2026-10-22I +flows. Nao se infere versao numerica completa somente pela lista de constantes.
- Metadados declaram URLs dos dominios neurapix.com, dashboard.neurapix.com e api.neurapix.com. Nenhuma chamada foi feita. O pacote possui modulos nomeados BinaryDownloader e InstantProcessing; isso nao equivale ao fornecimento do estilo pessoal ou de um motor de IA reutilizavel.
- Nenhum arquivo com extensao comum de pesos .onnx, .pt, .pth, .safetensors ou .tflite foi encontrado. Isso nao demonstra ausencia de outros formatos/dados mantidos fora do pacote.
- O conteudo semantico de debug.log nao foi interpretado; seus bytes foram somente copiados e hashados. Configuracoes de conta e caches externos nao foram consultados.
- Tres testes do parser passaram: leitura de fixture propria, truncamento/ABI e tamanho declarado abusivo. Evidencias em evidence/static-package-metadata-20261029.json e evidence/qa-chunk-reader.txt.
- Na primeira etapa, REA foi tentado offline e nao estava no cache (ENOTCACHED). Em 30/10 foi adquirido oficialmente e executado por CLI, com inventario bruto retido. Sem download nem execucao do fornecedor, a evidencia desta etapa vem do leitor estatico e dos prints fornecidos, preservados no alvo do produto proprio.
- Proximo: especificar recursos proprios a partir do mapa funcional e valida-los no SDK Adobe/Lightroom. Nenhum recurso de GPU, selecao ou automacao esta pronto somente por aparecer neste inventario.

## Comando de inspecao

Na raiz deste alvo:

    python .\scripts\inspect_lua51_package.py --package 'caminho\neurapix.lrplugin' --output 'novo-relatorio.json'
    python -m unittest discover -s .\scripts -p 'test_*.py' -v

O relatorio registra hashes, contagens estruturais, hosts sem query e constantes de metadados do plugin. Nao publica constantes internas dos modulos de processamento. O mapa de recursos esta em notes/01_overview.md.
