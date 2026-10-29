# Acesso a maquina de edicao

Atualizado em 2026-10-29, America/Sao_Paulo.

## Caminhos informados pelo usuario

- Maquina: `192.168.1.58`.
- Catalogos: `D:\LR CATALOGOS`.
- Perfil: `C:\Users\Cris Bridi`.
- Pasta padrao de plugins a verificar posteriormente: `C:\Users\Cris Bridi\AppData\Roaming\Adobe\Lightroom\Modules`. O Neurapix pode estar instalado em outro local; confirmar no Gerenciador de plug-ins antes de solicitar acesso adicional.

## Teste depois do compartilhamento - leitura confirmada

O usuario criou os compartilhamentos. `net view` passou a listar `LR CATALOGOS`, `LRCatalogos` e `Users`. O caminho `\\192.168.1.58\LR CATALOGOS`, com espaco, permite listar a raiz e a amostra de outubro. O alias sem espaco permanece negado; usar o caminho que funciona. Nenhuma nova configuracao desse alias e necessaria.

Busca limitada a dois niveis e quarenta pastas, na amostra `202610 - OUTUBRO`: uma pasta examinada, um `.lrcat`, um `.lrcat-data` e tres arquivos runtime/lock. Sem erros nem truncamento nessa amostra. A existencia de runtime/lock e indicio, nao comprovacao, de catalogo em uso. Nenhum conteudo de catalogo foi aberto; nenhum arquivo fonte foi copiado ou modificado.

Resumo em `evidence/network-share-success-20261029.json`; nomes completos e metadados em `private/network-test-20261029-123146-e2e568fe/catalog-metadata.json`, fora do Git.

## Verificacao inicial - historico anterior ao compartilhamento

```powershell
net view \\192.168.1.58
Get-ChildItem -LiteralPath '\\192.168.1.58\Users\Cris Bridi' -Force
Get-ChildItem -LiteralPath '\\192.168.1.58\LR CATALOGOS' -Force
Get-ChildItem -LiteralPath '\\192.168.1.58\D$\LR CATALOGOS' -Force
Get-ChildItem -LiteralPath '\\192.168.1.58\C$\Users\Cris Bridi\AppData\Roaming\Adobe\Lightroom\Modules' -Force
```

Somente `Users` foi listado. Os dois primeiros caminhos nao ficaram disponiveis a sessao atual; `C$` e `D$` retornaram acesso negado. A tentativa administrativa usou somente a sessao Windows existente; nao foram tentadas senhas ou alteradas permissoes. Nao se conclui que os arquivos nao existem.

## Como configurar o compartilhamento - referencia historica

Compartilhar primeiro somente a pasta de catalogos, com permissao de leitura:

1. No Explorador, localizar `D:\LR CATALOGOS`.
2. Clicar com o botao direito > Propriedades > Compartilhamento. Usar o assistente para pessoas especificas ou Compartilhamento Avancado, conforme a versao do Windows.
3. Definir o nome do compartilhamento como `LRCatalogos`, se usar Compartilhamento Avancado.
4. Dar leitura a conta Windows apropriada. Preservar as permissoes de acesso existentes do proprietario; nao conceder acesso geral ao disco ou ao perfil inteiro. A permissao efetiva depende tanto do compartilhamento quanto da seguranca NTFS.
5. Anotar o caminho de rede exibido. O nome sugerido resultara em `\\192.168.1.58\LRCatalogos`.

Se o Windows pedir autenticacao ao abrir a pasta nesta maquina, preencher as credenciais diretamente na janela do Windows. Nao enviar senha ao chat. Nao desativar protecao por senha nem habilitar SMB1. Se a configuracao exigir um administrador do Windows, essa etapa precisa ser feita por uma pessoa com acesso autorizado naquela maquina.

Alternativa sem compartilhar os catalogos: executar `scripts/Get-LightroomInventory.ps1` localmente na maquina de edicao com `-CatalogDirectory 'D:\LR CATALOGOS'`. O script produz somente metadados na pasta nova indicada em `-OutputDirectory`. O relatorio nao exporta ajustes nem resolve sozinho o acesso a RAWs.

O teste de leitura ja passou. Para uma coleta futura de um catalogo de trabalho, aguardar fechamento do Lightroom e verificar os arquivos companheiros, ou usar exportacao pelo proprio Lightroom. Nao abrir o catalogo ativo pela rede nem remover locks.

Fontes: [compartilhamento Windows](https://support.microsoft.com/en-us/windows/experience/connectivity-networking/file-sharing-over-a-network-in-windows), [instalacao Neurapix e Gerenciador de plug-ins](https://neurapix.com/help/install-plugin), [pastas padrao de plugins Adobe](https://helpx.adobe.com/lightroom-classic/help/export-presets-settings-plug-ins.html).
