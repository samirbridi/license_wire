# Mizin Lightroom - aquisicao local e perfil de referencia

> **Versão da Análise**: `v0.5.0 (build 0010)`
> Atualizado em: 2026-10-29, America/Sao_Paulo.

Projeto independente para Lightroom Classic no Windows, inicialmente para uso pessoal. Treinamento e inferencia devem acontecer nos computadores do usuario. O Lightroom continua responsavel pela revelacao e renderizacao final.

## Estado Atual e Próximos Passos

Esta entrega acrescenta coleta local de referencias aprovadas, agrupadas por trabalho, ao motor de inferencia ja validado. O coletor exporta atributos e dez ajustes atuais para treinamento posterior, com aprovacao explicita da selecao; nao transfere os pixels dos RAWs. O modelo numerico continua experimental e ainda nao foi retreinado. A interface apresenta valores, sem aplicar edicoes. Nao foi copiado codigo ou modelo do Neurapix.

- O IP indicado e confirmado pelo usuario e `192.168.1.58`. O nome reverso historico `DESKTOP-M34T3GL.localdomain` agora resolve para `.39`; esse outro IP nao foi contatado. Os acessos usam somente o IP e os compartilhamentos confirmados pelo usuario.
- TCP 445 e os compartilhamentos especificos de catalogos e RAWs permitem leitura. O compartilhamento de disco `ARQUIVOS` apareceu, mas continuou negado; o restante do disco nao foi varrido.
- O usuario confirmou catalogos em `D:\LR CATALOGOS` e perfil em `C:\Users\Cris Bridi`.
- A leitura funciona por `\\192.168.1.58\LR CATALOGOS` (com espaco). O alias `LRCatalogos` retorna acesso negado; usar o caminho comprovado, sem solicitar nova configuracao para esse alias.
- Depois da confirmacao humana de fechamento do Lightroom, lock/WAL/SHM desapareceram. Foi preservado um snapshot privado de 20 arquivos, 1.851.905.958 bytes, com vinte comparacoes SHA-256 aprovadas e metadados das fontes estaveis. Nenhuma escrita foi feita na origem.
- A copia local passou no SQLite `quick_check`. O hash do catalogo permaneceu igual antes/depois da analise.
- O catalogo possui 37.871 imagens. Foram extraidos parametros atuais e historico associado ao Neurapix para 3.601 arquivos distintos da Canon EOS R6m2, em oito raizes de trabalhos: 3.513 em cor e 88 em preto e branco, sem erros de parser.
- O usuario confirmou que todas as edicoes de outubro estao revisadas e aprovadas. Essa confirmacao esta registrada separadamente; alteracoes no historico nunca sao usadas como prova de revisao humana.
- Os 33.687 DNGs referenciados na pasta de smart previews e as copias virtuais nao foram misturados aos 3.601 exemplos selecionados por historico Neurapix.
- O usuario confirmou o compartilhamento direto `\\192.168.1.58\2026-10-02 - formatura victoria`. Dos 2.755 CR3 existentes, apenas os 546 ligados a referencias aprovadas foram copiados: 17.087.609.188 bytes, com SHA-256 de cada copia e estabilidade das fontes conferidos.
- Camera Canon EOS R6m2 e captura, incluindo subseguundos, corresponderam aos 546 registros do catalogo antes da copia e foram revalidadas na copia local. Todos os 546 decodificaram, com hashes RAW iguais depois da leitura. O lote tem 524 referencias em cor e 22 em P&B.
- Foram geradas entradas tecnicas LibRaw com WB da camera, sem ajustes do Lightroom; nao se afirma equivalencia com a renderizacao Adobe. Fotos e modelos permaneceram privados, sem upload.
- O piloto de regressao foi treinado nas 432 referencias em cor anteriores e avaliado em 92 posteriores, agrupadas por meia hora, dentro do mesmo trabalho. Melhorou exposicao, temperatura, contraste, sombras e pretos contra a mediana de treino; cinco controles ficaram piores. Nao ha validacao entre trabalhos nem aprovacao visual das previsoes.
- O usuario instalou e executou o pacote de comparacao. Os screenshots mostram menu e dialogo funcionando, 92/92 fotos localizadas e cinco fotos com ajustes atuais visiveis. Os 15 valores atuais e as 15 previsoes exibidas correspondem aos registros locais na precisao mostrada. O fluxo nominal de leitura esta validado no Lightroom da maquina de edicao.
- Essa evidencia antiga nao valida escrita/restauracao, inferencia de fotos novas ou qualidade fotografica das previsoes. A versao do aplicativo nao aparecia naqueles primeiros screenshots. Os originais da primeira amostra foram preservados em `private/evidence/`, com hashes; recibo em `evidence/native-read-user-qa-20261029.json`.
- As 546 referencias do primeiro trabalho nao possuem MD5/SHA-256 nem tamanho de arquivo registrados nas tabelas verificadas. O pareamento futuro deve conferir mapeamento de pasta, camera e data/hora de captura, alem do nome. A faixa de captura observada e 2026-10-02, de 18:57:55.400 a 23:55:40.660, conforme o horario gravado no catalogo, sem conversao de fuso presumida.
- O motor portatil processou quatro RAWs reais. Um deles foi copiado do compartilhamento autorizado somente para QA: seu SHA-256 nao pertence aos 546 exemplos de treino/teste. Tres imagens tecnicas corresponderam byte a byte ao dominio do treino; as 30 previsoes comparadas tiveram diferenca zero. Nao houve novo treinamento nem melhora de precisao demonstrada nesta entrega.
- A execucao Windows usou o comando gerado pelo Lua com espacos e `&` no caminho, Python isolado, PATH restrito e variaveis PYTHONHOME/PYTHONPATH invalidas. Diagnostico confirmou Python, NumPy, rawpy/LibRaw, Pillow e ExifTool incluidos. Os 36 testes passaram. Evidencia em `evidence/local-engine-qa-20261029.json` e `evidence/qa-local-engine-suite.txt`.
- O usuario mostrou o diagnostico do build 0008 funcionando no Lightroom 15.6, com todas as dependencias previstas e Python isolado. A analise mostrou cinco fotos calculadas, zero falhas e estado COMPLETED; os cinco nomes e 15 valores de referencia coincidem com um trabalho do snapshot diferente do evento de treino. O fluxo nominal de diagnostico, inferencia e exibicao esta confirmado no host. Recibo em `evidence/native-selection-user-qa-20261029.json`.
- Nessa pequena amostra consecutiva, as diferencas absolutas medias exibidas foram 0,174 EV em exposicao, 871,4 K em temperatura e 6,76 em contraste. As cinco temperaturas previstas foram maiores que as referencias. Sao estatisticas descritivas, sem imagens editadas para aprovacao e sem benchmark independente entre trabalhos. Os caminhos/hashes reais da tarefa nao aparecem nos prints.
- O results.json foi lido e os 50 ajustes atuais corresponderam ao snapshot por caminho completo; os cinco hashes RAW relatados nao pertencem ao treino/teste. Foram 5,31 segundos, zero falhas e zero atributos ausentes. A matiz teve erro absoluto medio de 10,86 pontos, contra 2,8 da mediana de treino nessa pequena coorte; temperatura teve 871,48 K. Isso orienta ampliar os dados, sem calibrar contra essas mesmas cinco fotos. Detalhes em `notes/12_resultados_completos.md`.
- O novo coletor prepara referencias na maquina de edicao, com nome do trabalho, aprovacao humana, hash, data EXIF, 40 atributos e dez parametros finais. Passou em 45 testes e em exportacao real com todos os atributos iguais ao dominio de treino. Modelo ativo e catalogo preservados. A nova janela de aprovacao/coleta exige QA nativo. Detalhes em `notes/13_coleta_de_referencias.md`.
- Proximo: testar a coleta, reunir exemplos variados de varios trabalhos, deduplicar por SHA-256 e separar eventos de avaliacao antes de treinar uma nova revisao. A coletora nao treina nem ativa pesos automaticamente. Previa visual/aplicacao reversivel seguem pendentes.

## Motor local para fotos selecionadas

O pacote inclui runtime Windows x64, dependencias, modelo privado e cinco comandos de Biblioteca > Extras de plug-in: analisar fotos selecionadas, coletar referencias aprovadas, ver ultimos resultados, diagnosticar motor local e comparar a amostra salva do piloto. A analise usa os caminhos da selecao atual, sem depender do catalogo de outubro ou da lista de 92 fotos.

O piloto aceita de 1 a 100 RAWs CR3 em cor da Canon EOS R6m2. Exibe exposicao, temperatura e contraste; o CSV inclui os dez controles experimentais. Registra progresso, cancelamento, erros por foto e SHA-256 das fontes, preservando os originais. Os valores de referencia exibidos foram lidos no inicio da tarefa. As imagens tecnicas geradas sao entradas LibRaw, sem o estilo aplicado, e nao representam uma previa Adobe.

Atualizacao: extrair o ZIP inteiro em uma pasta nova e permanente; guardar a instalacao anterior. No Gerenciador de plug-ins, remover o cadastro antigo e adicionar a nova pasta `.lrplugin`. Executar primeiro o diagnostico e depois analisar 1 a 5 fotos. O mesmo identificador de plugin e mantido. Passos completos e limites em `notes/10_motor_local_e_atualizacao.md`; o LEIA-ME acompanha o ZIP privado. Escrita no catalogo, copias virtuais, treino pelo menu, selecao automatica e fluxos de importacao continuam pendentes.

Para preparar treino, selecionar inicialmente cinco RAWs originais em cor com ajustes finais aprovados e executar **Mizin: coletar referencias aprovadas**. Informar data/nome do trabalho e confirmar a aprovacao; o coletor produz `references.jsonl` sem pixels. Testar depois coletas de 50 a 100 referencias variadas por trabalho, mantendo trabalhos separados. A coleta suporta somente os dez controles basicos, sem reconstruir curvas, HSL, perfis ou mascaras.

Pacote funcional entregue: `\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot\MizinLightroom-0.4.0-build0008-9f44a1dc\MizinLightroom-0.4.0-build0008-motor-local.zip`. ZIP de 43.678.177 bytes, SHA-256 `ae325995e7cfd74e6b1d378ccbce029f395ad9157b80fb0f6719a8f247ef5aa5`, origem e destino iguais. Os 1.623 hashes do manifesto, CRC do ZIP e oito arquivos Lua 5.1 foram verificados; o proprio pacote final calculou novamente um RAW fora das referencias. Recibos de geracao/entrega em `evidence/local-plugin-package-20261029.json` e `evidence/local-plugin-delivery-20261029.json`. O usuario depois confirmou o fluxo nominal no Lightroom 15.6. Cancelamento nativo, reabertura do historico e aplicacao de ajustes continuam com QA proprio pendente.

Pacote com coletor entregue: `\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot\MizinLightroom-0.5.0-build0010-dc7fe970\MizinLightroom-0.5.0-build0010-motor-local.zip`. SHA-256 `19351638061522823692f520cf077489f57b7b4caf3c5b488489ae272fa25f5e`, 43681449 bytes, origem e destino iguais. Analise e coleta do proprio pacote final passaram com RAW real, 1.624 hashes de arquivo e nove fontes Lua verificados. Os pesos continuam iguais ao piloto; a janela de coleta ainda requer QA nativo. Recebimentos de JSONL podem ser colocados em subpastas por trabalho/coleta de `\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot\Referencias-20261029`. Recibos em `evidence/reference-collector-package-20261029.json` e `evidence/reference-collector-delivery-20261029.json`.

## Primeiro plugin de comparacao

Fontes em `reconstructed/lightroom-pilot/`. O gerador `scripts/build_lightroom_pilot.py` le a VERSION calculada por commits e produz ZIP privado com `MizinLightroom.lrplugin` e previsoes salvas. O pacote nao inclui fotos, executaveis, dependencias Python ou pesos do modelo. Contem caminhos privados das 92 referencias, portanto nao deve ser publicado como pacote generico.

Historico do primeiro pacote: o usuario adicionou `MizinLightroom.lrplugin` no Gerenciador, abriu o catalogo de outubro e executou o comparador. O dialogo consultou ajustes atuais e mostrou cinco exemplos. O fluxo de leitura do build 0006 foi confirmado por screenshots. A nova extensao conserva esse comando separado, com as previsoes salvas; ele nao substitui a analise nova.

Entrega confirmada: ZIP em `\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot\MizinLightroom-0.3.0-build0006-d05d06ba\`. Somente uma nova pasta e o arquivo de entrega foram adicionados a maquina de edicao; as fotos e o catalogo permaneceram intactos. Hash de origem e entrega iguais. Recibos em `evidence/native-pilot-package-20261029.json` e `evidence/native-pilot-delivery-20261029.json`.

## Aproveitamento das edicoes existentes

O Neurapix documenta que seus ajustes ficam como configuracoes normais do Lightroom. Portanto, RAWs com edicoes finais aprovadas no catalogo podem fornecer exemplos do gosto do usuario. Isso nao exporta o modelo interno do Neurapix. Distinguir fotografias aprovadas de resultados ainda nao revisados.

O snapshot foi coletado com Lightroom fechado e preservou `.lrcat-data`. Apenas essa copia foi consultada por SQLite em modo de leitura. O catalogo ativo continua no disco local da maquina de edicao. A rede serve para transferencias e relatorios; nao abrir o mesmo catalogo de trabalho pelo SMB.

## Snapshot e extracao privada

`private/snapshots/20261029-124518-192a6383/` contem os originais preservados, recibo e SHA256SUMS. A pasta `analysis/extraction-20261029T155812079523Z/` contem `candidate-settings.jsonl`, `summary.json` e as consultas executadas. Dados individuais, caminhos de clientes e aprovacao humana ficam fora do Git. Resumo sem nomes de clientes em `evidence/catalog-acquisition-20261029.json`; hashes em `binaries/SHA256SUMS.txt`.

O leitor reconhece tabelas do catalogo observado e campos Lua literais, inclusive historico zlib com prefixo de tamanho. Nao executa Lua. Parametros ausentes permanecem ausentes; metadados de Look/perfil e curvas sao preservados como referencias. Mascaras e LUTs externos nao foram reconstruidos. A posicao temporal do estado serializado em cada passo do historico ainda precisa de prova no Lightroom; os alvos do futuro treino sao os parametros atuais aprovados.

## Inventario na maquina de edicao

O script nao precisa de administrador. Examina apenas pastas informadas ou locais padrao, com profundidade e quantidade limitadas. Nao le conteudo de catalogos, configuracoes de conta, senhas ou modelos, nao executa plugins e nao altera fotos. Produz uma nova pasta de relatorio; nao estabelece acesso remoto.

Copiar `scripts/Get-LightroomInventory.ps1` para a maquina de edicao e executar no PowerShell:

```powershell
powershell.exe -NoProfile -File .\Get-LightroomInventory.ps1
```

Se a politica local bloquear scripts, usar `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Get-LightroomInventory.ps1` somente para essa execucao. Isso nao altera a politica permanente do Windows.

Para catalogos fora dos locais padrao, informar a pasta exata:

```powershell
powershell.exe -NoProfile -File .\Get-LightroomInventory.ps1 -CatalogDirectory 'D:\LR CATALOGOS' -OutputDirectory 'C:\Users\Public\Documents\MizinLightroom-Inventario'
```

`OutputDirectory` precisa ser nova e acessivel. O JSON pode conter nomes e caminhos privados; manter na rede local. Nao e necessario desativar protecao por senha, compartilhar o disco inteiro ou habilitar acesso remoto administrativo. Uma pasta especifica com leitura para o usuario apropriado e suficiente para receber o inventario.

## Arquitetura prevista

Plugin Lua no Lightroom -> fila local -> motor proprio CPU/GPU -> ajustes por foto -> Lightroom. A rede pode ajudar no desenvolvimento e na transferencia; o uso normal deve funcionar com plugin e motor juntos na maquina de edicao. Propostas e limites em `notes/02_architecture.md` e `notes/03_protocols_apis.md`.

## Validacao e versionamento

```powershell
pwsh -NoProfile -File .\scripts\Test-LightroomInventory.ps1
pwsh -NoProfile -File .\scripts\Test-LightroomSnapshot.ps1
python -m unittest discover -s .\scripts -p test_catalog_reader.py -v
node .\scripts\version-from-commits.mjs --write
```

O teste passou no Windows PowerShell 5.1 e no PowerShell 7.6.5 com dados sinteticos: preservacao das fontes, limites de busca, arquivos companheiros e recusa de sobrescrita. Nao valida o Lightroom real. Versionamento deriva dos commits deste alvo, com build incremental e changelog rastreavel. `evidence/qa-inventory.json` e `evidence/qa-inventory-ps7.json` registram os resultados locais.

O copiador passou em oito verificacoes no PowerShell 5.1, incluindo recusa de catalogo com lock e de arquivo aberto para escrita sem lock. O leitor passou em nove testes Python, incluindo bloqueio de escrita, rejeicao de codigo Lua, limites de descompressao e exclusao de proxies/copias virtuais/rejeitados da elegibilidade. A execucao no catalogo real extraiu 3.601 exemplos sem erros. Esses testes do leitor validam coleta e leitura de dados. Os recibos nativos posteriores registram separadamente comparacao salva e inferencia da selecao; aplicacao de edicoes ainda precisa de implementacao e QA proprios.

Fontes verificadas em 2026-10-29: [SDK oficial](https://developer.adobe.com/lightroom-classic), [Neurapix e ajustes locais](https://neurapix.com/help/edit-photos-locally), [metadados Adobe](https://helpx.adobe.com/lightroom-classic/desktop/organize-photos-in-lightroom-classic/metadata-basics-actions.html), [copia de catalogos](https://helpx.adobe.com/lightroom-classic/desktop/manage-catalogs-and-files/create-catalogs.html), [compartilhamento Windows](https://support.microsoft.com/en-us/windows/experience/connectivity-networking/file-sharing-over-a-network-in-windows).

