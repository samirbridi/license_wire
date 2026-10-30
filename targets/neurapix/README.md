# Neurapix - referencia de fluxos e inspecao estatica

> **Versão da Análise**: `v0.2.0 (build 0002)`
> Data: 2026-10-30, America/Sao_Paulo.

Pacote fornecido pelo usuario para orientar uma implementacao independente em targets/mizin_lightroom. Os originais do fornecedor ficam isolados e privados neste alvo. Nenhum codigo, recurso visual ou peso foi reutilizado no nosso produto.

## Estado Atual e Próximos Passos

Motor recebido e preservado: 14.699 arquivos, 7.381.315.093 bytes, com hashes de origem/copia iguais. REA inspecionou os dois executaveis PyInstaller e o modulo nativo de edicao. Ghidra reconheceu 1.268 funcoes x64 e decompilou 14 funcoes selecionadas. Quatro grafos ONNX foram lidos sem carregar tensores. Os pacotes maiores de edicao permanecem opacos; nao foi recuperado/validado um treinador pessoal offline nem a arquitetura neural completa. Detalhes e limites em `notes/06_motor_recebido_e_arquitetura.md` e `evidence/runtime-analysis-20261030.json`.

O estudo anterior da integracao Lua continua valido: 73 modulos, 1.916 prototipos e 7.137 chamadas estaticas resolvidas, incluindo biblioteca. O componente que faltava na etapa da nota 05 foi agora fornecido; nao e necessario solicitar novamente acesso ao perfil remoto. O produto proprio ganhou um extrator de base fixa a partir de 3.513 edicoes aprovadas, sem incorporar artefatos do fornecedor. Proximo: ampliar representacao/coleta de estilo e aplicar com recuperacao pelo SDK; nenhuma paridade fotografica foi demonstrada.

- Primeiro pacote: preservados 964 arquivos, 78.614.713 bytes, com SHA-256 de origem/copia iguais e fontes estaveis. Manifesto em binaries/SHA256SUMS.txt; originais em private/originals/. O runtime posterior possui seu manifesto separado em private/runtime/.
- Os 73 arquivos .lua sao chunks compilados Lua 5.1. Um parser limitado leu seus metadados sem carregar bytecode em VM nem executar plugin, instalador ou ferramentas do fornecedor. Todos foram parseados integralmente, sem bytes restantes.
- Info.lua declara menus de selecao, criacao/ajuste de estilo, edicao, recebimento de ajustes, automacoes e envio de correcoes. A constante de build observada e 2026-10-22I +flows. Nao se infere versao numerica completa somente pela lista de constantes.
- Metadados declaram URLs dos dominios neurapix.com, dashboard.neurapix.com e api.neurapix.com. Nenhuma chamada foi feita. O pacote possui modulos nomeados BinaryDownloader e InstantProcessing; isso nao equivale ao fornecimento do estilo pessoal ou de um motor de IA reutilizavel.
- No primeiro .lrplugin nao havia extensoes comuns de pesos. O runtime recebido posteriormente contem os grafos ONNX e conteineres descritos na nota 06; nao confundir os dois escopos.
- O log foi inicialmente apenas preservado; uma consulta posterior limitada extraiu o caminho de npx.exe, sem publicar argumentos, tokens ou payloads. O runtime recebido inclui caches que foram preservados/hashados, mas suas imagens/dados pessoais nao foram usados na analise ou no produto proprio.
- Tres testes do parser passaram: leitura de fixture propria, truncamento/ABI e tamanho declarado abusivo. Evidencias em evidence/static-package-metadata-20261029.json e evidence/qa-chunk-reader.txt.
- Na primeira etapa, REA foi tentado offline e nao estava no cache (ENOTCACHED). Em 30/10 foi adquirido oficialmente e executado por CLI, com inventario bruto retido. Sem download nem execucao do fornecedor, a evidencia desta etapa vem do leitor estatico e dos prints fornecidos, preservados no alvo do produto proprio.
- Nenhum recurso proprio de GPU, selecao ou corte esta pronto somente por aparecer neste inventario. A implementacao e a verificacao no Lightroom permanecem etapas distintas.

## Comando de inspecao

Na raiz deste alvo:

    python .\scripts\inspect_lua51_package.py --package 'caminho\neurapix.lrplugin' --output 'novo-relatorio.json'
    python -m unittest discover -s .\scripts -p 'test_*.py' -v

O relatorio registra hashes, contagens estruturais, hosts sem query e constantes de metadados do plugin. Nao publica constantes internas dos modulos de processamento. O mapa de recursos esta em notes/01_overview.md.
