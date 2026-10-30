# Analise de fronteiras com REA e bytecode Lua

Em 30/10/2026, o usuario pediu estudo mais profundo do pacote para orientar seu produto local. A analise aprofunda a implementacao de integracao; nao afirma recuperar o motor ou a rede neural.

## Evidencias e ferramentas

REA 6.8.0 veio da distribuicao oficial rea-agents, em cache privado, sem alterar a configuracao do Codex. Nao havia ferramentas MCP REA/Ghidra expostas nesta sessao. A CLI executou `inspect-desktop-application` com limites de 1.500 entradas e 1 MiB de leitura. Resultado: 1.093 entradas examinadas, 40 arquivos probeados, 13.308 bytes lidos, sem seguir links e sem candidato nativo principal identificado. O runtime Node instalado e 24.18.0, inferior ao range declarado pelo REA 6.8.0; os comandos limitados executaram, mas isso nao valida outras operacoes nessa combinacao.

`inspect-artifact` no Lua retornou unsupported_target. Nao se usou um descompilador nativo inadequado para tratar bytecode Lua como instrucoes x86. O parser proprio foi ampliado com offsets de constantes/instrucoes e propagacao conservadora de simbolos/closures segundo os formatos oficiais Lua 5.1. Foram inventariadas 1.916 funcoes/prototipos em 73 modulos e 7.137 chamadas estaticas resolvidas, incluindo chamadas de biblioteca. Isso nao equivale a 7.137 fluxos completos validados: desvios invalidam registradores e alvos dinamicos nao resolvidos ficam omitidos.

Relatorios: evidence/rea-analysis-summary-20261030.json, evidence/lua-boundaries-20261030.json. Saidas brutas REA ficam privadas em private/rea/. O codigo do fornecedor nao foi executado. Quatro testes do leitor estatico passaram, incluindo fixture sintetica com closure/import e endereco de chamada.

## Arquitetura observada

| Fronteira | Evidencia verificada | Consequencia para o produto proprio |
| --- | --- | --- |
| Motor externo | BinaryDownloader constante npx.exe, offset 1366; LibraryInferImages constante npx.exe, offset 20979 | A pasta .lrplugin nao e o motor completo. Nossa implementacao precisa de um motor proprio |
| Comunicacao local | LibraryInferImages constantes --read_port e --write_port, offsets 22315/22339; callbacks onConnecting/onConnected/onError/onClosed | Separar UI, fila, ciclo de vida e inferencia; a arquitetura da rede nao se deduz desse protocolo |
| Componentes baixados | BinaryDownloader chama LrHttp.get nos offsets 6462/7517 e ensureBinary no 21374 | Dependencias/modelos sao tratados como componentes externos, com versoes e troca de arquivos |
| GPU | gpucheck.exe, offset 4137; check_gpu --target_path, offset 4699; compatible_gpus/cuda/gpu_names | Detectar suporte real e oferecer fallback; uma opcao de GPU nao cria suporte no nosso modelo |
| Base de modelos | LibraryInferImages.getBaseNetsBundlePath, funcao 0/17, constante basenets | Existem artefatos de modelo fora dos arquivos Lua; seus pesos/arquitetura nao foram fornecidos |
| Treino observado | SendTraining chama createUserProject, offset 4247, e uploadUserProjectImage, offset 4687 | O fluxo observado envia dados ao servico. Isso nao fornece o algoritmo de treinamento da rede |
| Correcoes | LibrarySendForRetraining chama updateUserProjectFeedback, offset 12219 | Feedback deve ter identidade/versao e ser distinto de aprovacao de ajustes |
| Ajustes/perfil | ImportProject referencia CameraProfile e ToneCurvePV2012/RGB, offsets 17885/18298/18323/18352/18382 | Apenas dez controles numericos nao cobrem o estilo completo; perfil, curvas e cor exigem etapa propria |
| Aplicacao | Utils encaminha applyDevelopPreset ao write gate do catalogo, offset 7197 e callback 0/6/0 | Calcular, revisar e aplicar sao fases distintas, com snapshots/recuperacao ainda necessarios no nosso produto |
| Automacao | AutoeditEngine expoe gate, engineGeneration, start/stop e resume callbacks | Filas precisam de estados, cancelamento, protecao contra sobreposicao e identificacao de geracao |

Os offsets sao de bytes no arquivo SHA-256 identificado pelo respectivo modulo no relatorio. Constantes e chamadas estaticas indicam fronteiras observadas, sem prova de execucao de todos os ramos. Nao foram apontados bugs do fornecedor somente por esses padroes.

## Componente ausente confirmado

Uma busca limitada no log fornecido identificou o executavel em:

`C:\Users\Cris Bridi\AppData\Roaming\Adobe\Lightroom\Preferences\npx\npx\npx.exe`

O texto do log nao foi publicado; a consulta extraiu somente o caminho do executavel, sem argumentos, tokens ou payloads. A tentativa de leitura desse arquivo pelo compartilhamento Users retornou acesso negado. Nao houve tentativa de contornar permissoes. A pasta fornecida nao contem npx.exe.

Para analisar a implementacao do motor, e necessario receber esse executavel, preferencialmente com sua pasta de dependencias npx/npx. Copiar essa subpasta de runtime para uma nova pasta MOTOR NEURAPIX ao lado do material fornecido e suficiente para a proxima etapa; nao e necessario compartilhar o perfil inteiro ou enviar credenciais. Nao e pedido acesso a servicos do fornecedor nem contorno de licenca.

## Aplicacao no produto proprio

O aprendizado de acervo acrescentado em mizin_lightroom usa SDK, fila local, historico de referencias, separacao de eventos e opiniao estruturada. O motor de regressao e nosso, com treino local de candidatos e preservacao do modelo anterior. Nao foram copiados funcoes, recursos visuais ou pesos do fornecedor. Proximas prioridades sao ampliar a representacao do estilo (perfil/curvas/cor), comparar em fotos novas e implementar aplicacao reversivel. O estudo elimina suposicoes sobre integracao, mas nao demonstra qualidade fotografica nem substitui a verificacao da implementacao diferente no Lightroom.

Fontes primarias do formato/ferramenta: [REA](https://github.com/morluto/rea), [instrucoes Lua 5.1](https://www.lua.org/source/5.1/lopcodes.h.html), [formato de chunks Lua 5.1](https://www.lua.org/source/5.1/lundump.c.html).
