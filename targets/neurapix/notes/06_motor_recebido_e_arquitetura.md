# Motor recebido: estrutura verificada e uso no produto proprio

Em 30/10/2026 o usuario forneceu Downloads/PLUGIN LIGHTROOM/npx. A pasta foi preservada em private/runtime/, com 14.699 arquivos e 7.381.315.093 bytes. Cada origem/copia teve SHA-256 igual e tamanho/data estaveis durante a copia. A lista final de fontes foi conferida. O ledger esta em binaries/SHA256SUMS.txt; o ponteiro privado e private/runtime/latest.json.

## O que foi efetivamente analisado

REA 6.8.0 executou inspecao e extracao estatica dos executaveis PyInstaller. O motor de edicao npx.exe tem SHA-256 `5ed2d67020b0b23044e17751218f0059e155768b8ad000c2dd83a538240f3be0`; seu inventario tem 6.402 nos/6.414 ocorrencias. O seletor Neurapix Culling.exe tem SHA-256 `b1acb94f2362eadacd5939cb5002154e7042f16287f7abc6f65955fa70c0c0af` e 942 nos/964 ocorrencias. Esses numeros descrevem os conteineres expostos pelo leitor, nao funcoes completas do produto. As extracoes ficaram privadas; nao houve import/execucao de modulos do fornecedor.

A varredura geral de diretorio do REA e **parcial**: parou no limite de representacao de 32 MiB, apos 5.674 entradas e 108 arquivos probeados. Ela nao substitui o ledger completo de aquisicao. As inspecoes individuais dos dois executaveis e do modulo nativo foram feitas separadamente. Node 24.18.0 permanece abaixo do range declarado pelo REA; os comandos executaram, mas nao se declara a instalacao inteira homologada.

O entry point de edicao extraido usa Python 3.14 e referencia sys, npx, run_infer_local e argv. O REA atual rejeitou a inspecao pyc dessa versao. Um leitor de dados limitado ao formato oficial CPython leu os 317 bytes, inclusive o novo registro slice do marshal v5, sem criar CodeType, usar marshal.loads, importar ou executar bytecode. Quatro testes proprios passaram. Essa leitura estabelece declaracoes de nomes/constantes, nao uma decompilacao de todas as instrucoes.

O nucleo esta em npx/_internal/npx.cp314-win_amd64.pyd: 2.398.648 bytes, SHA-256 `e8a550ad797ea94c9a1338be557d3f5bf314f191cee02705aa6981fdfbfc27b9`. Importa a API Python 3.14 e exporta a inicializacao do modulo. O Ghidra 12.0.4 local reconheceu 1.268 funcoes x64; foram decompiladas 14 funcoes selecionadas, com referencias e pseudocodigo **somente privados**. Isso nao e recuperacao integral do codigo nem da rede neural.

A primeira importacao salvou o projeto, mas seu post-script falhou ao acessar preferencias/OSGi fora do workspace e o launcher atingiu 420 s. Dois processamentos posteriores, com settings/cache/temp isolados no alvo, terminaram com codigo zero. Uma primeira tentativa de predict excedeu 25 s; o processamento direcionado de 60 s concluiu. Nao se apresenta essa primeira tentativa como sucesso.

## Fronteiras nativas verificadas

Enderecos abaixo pertencem ao SHA-256 do modulo nativo acima e ao banco Ghidra retido, nao a outros builds.

| Declaracao/referencia | Funcao identificada por xref | O que sustenta |
| --- | --- | --- |
| infer_path_sliders_ | 38569e40c | Existe fronteira de inferencia de sliders por entrada; nao define sua precisao |
| model_emb | 3856bf3b3 | O nucleo recebe/usa objeto de representacao do modelo |
| predict | 38579ebf7 | Rotina de predicao localizada e decompilada |
| _run_infer_local | 38579e989 | Rotina interna da execucao local |
| run_infer_local | 3857a73e2 | Fronteira chamada pelo entry point |
| _initialize_model | 3857ab947 | Inicializacao com model_path e providers |
| face_model_path, kp_model_path, seg_model_path, smart_crop | 385770ef2 | Caminhos separados para rosto, pose e segmentacao e opcao de corte |
| batch_sz | 3857a8ce6 / 3857a9faf / 385770ef2 | Configuracao de lote em componentes distintos |

Uma declaracao de tipo Cython menciona img_ts, model_base e model_head. Isso **sugere** separacao entre representacao base e cabeca de predicao; nao revela numero de camadas, tensores, treinamento ou funcao de perda. A referencia a npx_obf.c e a indirecao de objetos Python tornam incorreto tratar nomes recuperados como codigo fonte completo. Nao foi localizado/validado aqui um treinador pessoal offline do fornecedor.

## Modelos e processamento auxiliar

Foram inspecionados quatro grafos ONNX, por leitura de protobuf que pula tensores/atributos e nao carrega pesos nem executa inferencia:

| Componente observado | Nos | Entrada declarada | Saidas declaradas principais |
| --- | ---: | --- | --- |
| RetinaFace/MobileNetV2 no corte | 350 | lote x 3 x altura x largura | localizacoes, confianca, landmarks |
| RTMO no corte | 729 | lote x 3 x 640 x 640 | deteccoes e pontos corporais |
| YOLACT/ResNet50 no corte | 244 | 1 x 3 x 550 x 550 | localizacoes, classes, mascaras, prototipos |
| YuNet na selecao | 115 | 1 x 3 x 640 x 640 | deteccoes e landmarks em tres escalas |

Os nomes sao os arquivos recebidos, corroborados pelas declaracoes dos grafos. Eles nao tornam seus pesos parte do nosso produto. O seletor tambem inclui um arquivo .onnx.crypt. Os dois pacotes maiores de edicao, de 1.091.717.639 e 1.091.718.279 bytes, e conopt.bin nao sao ZIPs legiveis. Foram mantidos opacos: nao se afirma conhecer a arquitetura ou exportar o estilo pessoal a partir de seus tamanhos/cabecalhos. Nao houve descriptografia, conversao ou incorporacao desses artefatos.

Metadados recebidos do runtime de edicao declaram torch 2.14.0+cpu, cuda=None e onnxruntime 1.30.0. O runtime de selecao inclui bibliotecas CUDA. Isso mostra que os componentes podem ter dependencias diferentes; nao comprova utilizacao real de GPU, compatibilidade do computador ou desempenho do fornecedor. Uma interface com opcao GPU nao significa que todos os caminhos usam CUDA.

Na selecao, quatro modulos Python 3.13 foram inspecionados pelo REA: nitidez, metadados temporais/camera para sequencias, rosto e sockets. Nomes/constantes sustentam deteccao de rosto, atributos/embeddings e mensagens JSON delimitadas por quebra de linha. Nao demonstram sozinhos a qualidade da escolha de fotos ou todos os criterios de ranking.

## Como isso muda nossa implementacao

O mapa util e: integracao Lightroom e fila; entrada consistente de imagem; representacao da cena; predicao de ajustes; base de estilo; processamento opcional de rosto/corte/selecao; aplicacao pelo Lightroom. Esses componentes precisam ser especificados e implementados separadamente. Copiar sete gigabytes de dependencias/pesos para o nosso plugin nao implementa treinamento proprio.

Foi implementado no alvo mizin_lightroom um extrator original de **base fixa descritiva**, a partir do acervo ja aprovado: 3.513 fotos em cor de oito trabalhos. Ele identificou 22 campos presentes e iguais em todas as referencias, incluindo as quatro curvas de tom. Os campos variaveis de cor, textura/nitidez e Look ficam fora dessa base. O artefato permanece inativo e nao altera o piloto nem o catalogo. A nota 17 do produto descreve o resultado e o uso correto.

Proximas implementacoes concretas: ampliar a coleta SDK para reter perfil/Look/curvas/HSL com identidade; representar conteudo/localizacao de pessoas na entrada do nosso modelo; combinar base de estilo com ajustes variaveis aprendidos; aplicar primeiro em copias virtuais com snapshot e restauracao. O estudo reduz suposicoes de arquitetura, mas nao dispensa verificacao no Lightroom e avaliacao fotografica em trabalhos reservados. Nenhum bug do fornecedor foi comprovado nesta etapa.

## Reproducao e evidencias

Scripts do alvo: preserve_runtime.py, run_runtime_rea.py, read_pyc_metadata.py, inspect_runtime_models.py e inspect_onnx_structure.py. Os argumentos exatos, hashes das saidas e codigos de retorno REA estao em evidence/runtime-analysis-20261030.json; comandos Ghidra completos ficam junto ao projeto privado. Para repetir um comando REA com o arquivo preservado:

    python scripts/run_runtime_rea.py <novo-rotulo> inspect-artifact <arquivo-preservado>
    python scripts/run_runtime_rea.py <novo-rotulo> inspect-python-pyc <pyc-3.13-extraido>
    python scripts/read_pyc_metadata.py <entry-point-3.14-extraido> <nova-saida-privada.json>
    python scripts/inspect_onnx_structure.py <runtime-preservado> <nova-saida-privada.json>
    python -m unittest discover -s scripts -p test_*.py -v

O runner recusa sobrescrever as saidas REA do mesmo rotulo. A aquisicao nao deve ser repetida para analisar os mesmos bytes. Os dez testes de parsers passaram; hashes e inspecao estatica nao validam o aplicativo em execucao.

Fontes primarias usadas para formato/ferramentas: [PyInstaller](https://pyinstaller.org/en/stable/advanced-topics.html), [CPython marshal 3.14](https://github.com/python/cpython/blob/v3.14.0/Python/marshal.c), [schema ONNX](https://github.com/onnx/onnx/blob/main/onnx/onnx.proto), [REA](https://github.com/morluto/rea). Ghidra: documentacao local support/analyzeHeadlessREADME.html da instalacao 12.0.4.
