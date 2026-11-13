# Selecao completa e disputa de recursos — build 0018

Pedido: processar 150, 280 ou mais fotos com um unico comando, reduzindo peso durante o processamento.

Revisados README, notas de edicao, fluxo Lua de analise/aplicacao/restauracao, bootstrap Python, motor RAW, empacotamento e contratos SDK.

Alteracoes: removidos tetos numericos de analise/coleta manual e edicao/restauracao; selecao visual continua com teto especifico de 2000. Motor continua sequencial (um RAW em memoria por vez), agora com duas threads OpenMP, uma BLAS/MKL e prioridade BELOW_NORMAL definida antes de importar dependencias no bootstrap Windows. Nao muda prioridade do Lightroom. Timeout proporcional (120 segundos/foto, no minimo 1800), captura cede a cada dez fotos. Evitada troca redundante de modulo. Manifesto de edicao aceita 8 MiB, mesmo limite de leitura; limites de bytes nao foram removidos.

Mantidos hashes antes/depois, bloqueio de escrita do RAW, snapshots e journals. Nao foi substituida a entrada LibRaw por preview embutido: isso mudaria o dominio do modelo. A selecao de cada copia na Revelacao permanece necessaria ao contrato atual de snapshot; nao se afirma que esse custo foi eliminado. Nao ha fila retomavel nova para edicao: cancelamento conserva copias e restauracao existente. O acervo ja possui fila retomavel propria.

Alteracoes preexistentes em local_engine.py e test_local_engine.py (rejeicao de chaves duplicadas) preservadas. Outros alvos intocados. Sem commits ou acesso ao catalogo/instalacao de producao. VERSION incrementada explicitamente para v0.12.0 (build 0018), pois o gerador historico exige commits/arvore limpa; nao fingir derivacao por commits.

Validacao: suite em evidence/qa-performance-final.txt; recibo do pacote em evidence/performance-package-0018.json. Testes de selecao Lua cobrem 280 fotos; QA do pacote real usa dois RAWs e doubles SDK, nao Lightroom nativo. Nao representa benchmark real com 280 RAWs nem melhoria fotografica. Seguir o recibo de QA correspondente para resultados efetivos.
