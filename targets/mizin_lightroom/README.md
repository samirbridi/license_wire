# Mizin Lightroom - pesquisa e preparacao local

> **Versão da Análise**: `v0.1.2 (build 0003)`
> Atualizado em: 2026-10-29, America/Sao_Paulo.

Projeto independente para Lightroom Classic no Windows, inicialmente para uso pessoal. Treinamento e inferencia devem acontecer nos computadores do usuario. O Lightroom continua responsavel pela revelacao e renderizacao final.

## Estado Atual e Próximos Passos

Esta entrega contem pesquisa, inventario somente de leitura e planejamento. Nao existe ainda plugin de edicao, modelo treinado ou comprovacao de qualidade fotografica. Nenhum arquivo do Neurapix, RAW ou catalogo foi copiado.

- A maquina indicada pelo usuario, `192.168.1.58`, resolveu para `DESKTOP-M34T3GL.localdomain`.
- TCP 445 esta aberto. Depois do compartilhamento pelo usuario, `net view` lista `Users`, `LR CATALOGOS` e `LRCatalogos`.
- O usuario confirmou catalogos em `D:\LR CATALOGOS` e perfil em `C:\Users\Cris Bridi`.
- A leitura funciona por `\\192.168.1.58\LR CATALOGOS` (com espaco). O alias `LRCatalogos` retorna acesso negado; usar o caminho comprovado, sem solicitar nova configuracao para esse alias.
- A amostra `202610 - OUTUBRO` apresentou um `.lrcat`, um `.lrcat-data` e tres arquivos de runtime/lock. Somente metadados foram lidos; nenhum catalogo foi aberto ou copiado. A presenca desses arquivos recomenda tratar o catalogo como potencialmente em uso ate verificar fechamento consistente.
- Proximo: identificar versao do Lightroom, pastas de plugins e acervo representativo; coletar copia consistente de um catalogo escolhido; construir exportador pelo SDK; depois treinar e avaliar um perfil em trabalhos separados dos usados no treinamento.

## Aproveitamento das edicoes existentes

O Neurapix documenta que seus ajustes ficam como configuracoes normais do Lightroom. Portanto, RAWs com edicoes finais aprovadas no catalogo podem fornecer exemplos do gosto do usuario. Isso nao exporta o modelo interno do Neurapix. Distinguir fotografias aprovadas de resultados ainda nao revisados.

Preferir coleta pelo SDK de um conjunto selecionado. Alternativa: copia do catalogo com Lightroom fechado, incluindo `.lrcat-data` e companheiros existentes, ou exportacao de um catalogo de amostra. O catalogo ativo continua no disco local da maquina de edicao. A rede serve para transferencias e relatorios; nao abrir o mesmo catalogo de trabalho pelo SMB.

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
node .\scripts\version-from-commits.mjs --write
```

O teste passou no Windows PowerShell 5.1 e no PowerShell 7.6.5 com dados sinteticos: preservacao das fontes, limites de busca, arquivos companheiros e recusa de sobrescrita. Nao valida o Lightroom real. Versionamento deriva dos commits deste alvo, com build incremental e changelog rastreavel. `evidence/qa-inventory.json` e `evidence/qa-inventory-ps7.json` registram os resultados locais.

Fontes verificadas em 2026-10-29: [SDK oficial](https://developer.adobe.com/lightroom-classic), [Neurapix e ajustes locais](https://neurapix.com/help/edit-photos-locally), [metadados Adobe](https://helpx.adobe.com/lightroom-classic/desktop/organize-photos-in-lightroom-classic/metadata-basics-actions.html), [copia de catalogos](https://helpx.adobe.com/lightroom-classic/desktop/manage-catalogs-and-files/create-catalogs.html), [compartilhamento Windows](https://support.microsoft.com/en-us/windows/experience/connectivity-networking/file-sharing-over-a-network-in-windows).

