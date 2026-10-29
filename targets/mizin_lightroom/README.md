# Mizin Lightroom - aquisicao local e perfil de referencia

> **Versão da Análise**: `v0.2.0 (build 0004)`
> Atualizado em: 2026-10-29, America/Sao_Paulo.

Projeto independente para Lightroom Classic no Windows, inicialmente para uso pessoal. Treinamento e inferencia devem acontecer nos computadores do usuario. O Lightroom continua responsavel pela revelacao e renderizacao final.

## Estado Atual e Próximos Passos

Esta entrega contem pesquisa, inventario, copia consistente de um catalogo autorizado e extrator de parametros. O catalogo de trabalho permaneceu intacto na outra maquina. Nao existe ainda plugin de edicao, modelo treinado ou comprovacao de qualidade fotografica; nenhum RAW ou arquivo do plugin Neurapix foi copiado.

- A maquina indicada pelo usuario, `192.168.1.58`, resolveu para `DESKTOP-M34T3GL.localdomain`.
- TCP 445 esta aberto. Depois do compartilhamento pelo usuario, `net view` lista `Users`, `LR CATALOGOS` e `LRCatalogos`.
- O usuario confirmou catalogos em `D:\LR CATALOGOS` e perfil em `C:\Users\Cris Bridi`.
- A leitura funciona por `\\192.168.1.58\LR CATALOGOS` (com espaco). O alias `LRCatalogos` retorna acesso negado; usar o caminho comprovado, sem solicitar nova configuracao para esse alias.
- Depois da confirmacao humana de fechamento do Lightroom, lock/WAL/SHM desapareceram. Foi preservado um snapshot privado de 20 arquivos, 1.851.905.958 bytes, com vinte comparacoes SHA-256 aprovadas e metadados das fontes estaveis. Nenhuma escrita foi feita na origem.
- A copia local passou no SQLite `quick_check`. O hash do catalogo permaneceu igual antes/depois da analise.
- O catalogo possui 37.871 imagens. Foram extraidos parametros atuais e historico associado ao Neurapix para 3.601 arquivos distintos da Canon EOS R6m2, em oito raizes de trabalhos: 3.513 em cor e 88 em preto e branco, sem erros de parser.
- O usuario confirmou que todas as edicoes de outubro estao revisadas e aprovadas. Essa confirmacao esta registrada separadamente; alteracoes no historico nunca sao usadas como prova de revisao humana.
- Os 33.687 DNGs referenciados na pasta de smart previews e as copias virtuais nao foram misturados aos 3.601 exemplos selecionados por historico Neurapix.
- Pendente: acesso aos pixels RAW, renderizacoes neutras consistentes, versao real do Lightroom e QA do futuro plugin. Os caminhos RAW pertencem a outras pastas da maquina remota, fora do compartilhamento de catalogos.
- Proximo: obter um primeiro trabalho RAW aprovado, validar acesso aos perfis e representacao das configuracoes no SDK, gerar entradas neutras e preparar treino/teste separados por trabalho. Detalhes em `notes/06_aquisicao_e_referencias.md`.

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

O copiador passou em oito verificacoes no PowerShell 5.1, incluindo recusa de catalogo com lock e de arquivo aberto para escrita sem lock. O leitor passou em nove testes Python, incluindo bloqueio de escrita, rejeicao de codigo Lua, limites de descompressao e exclusao de proxies/copias virtuais/rejeitados da elegibilidade. A execucao no catalogo real extraiu 3.601 exemplos sem erros. Isso valida a coleta e a leitura; ainda nao valida previsoes, treino, interface ou aplicacao de ajustes pelo plugin.

Fontes verificadas em 2026-10-29: [SDK oficial](https://developer.adobe.com/lightroom-classic), [Neurapix e ajustes locais](https://neurapix.com/help/edit-photos-locally), [metadados Adobe](https://helpx.adobe.com/lightroom-classic/desktop/organize-photos-in-lightroom-classic/metadata-basics-actions.html), [copia de catalogos](https://helpx.adobe.com/lightroom-classic/desktop/manage-catalogs-and-files/create-catalogs.html), [compartilhamento Windows](https://support.microsoft.com/en-us/windows/experience/connectivity-networking/file-sharing-over-a-network-in-windows).

