# Integracoes e limites

## Comprovado por documentacao oficial

- SDK Lua: https://developer.adobe.com/lightroom-classic
- Neurapix deixa os ajustes como configuracoes normais: https://neurapix.com/help/edit-photos-locally
- Ajustes e metadados sao salvos no catalogo; XMP e uma via adicional. RAWs proprietarios usam sidecars; DNG/JPEG/TIFF/PSD podem receber metadados embutidos. Nao executar gravacao em massa nos originais nesta coleta. Desde v15.0 pode existir sidecar adicional ACR: https://helpx.adobe.com/lightroom-classic/desktop/organize-photos-in-lightroom-classic/metadata-basics-actions.html
- Copiar catalogos requer backup e Lightroom fechado; preservar lrcat, lrcat-data e demais companheiros existentes: https://helpx.adobe.com/lightroom-classic/desktop/manage-catalogs-and-files/create-catalogs.html
- lrcat-data pode conter dados essenciais de edicoes AI: https://helpx.adobe.com/in/lightroom-classic/desktop/technical-support/workflow-issues/catalog-issues/catalog-faq-lightroom.html

## Localidade e controle

Projetar treino e inferencia sem envio de fotos a provedores. Motor restrito ao computador de edicao, inicialmente via arquivos locais ou loopback. Uma futura interface LAN precisaria de autenticacao, limites de diretorio e identificadores de tarefa.

O SDK nao promete automacao integral da interface. Cada recurso precisa de prova na versao instalada. Recursos Adobe que requerem nuvem nao se tornam offline com nosso plugin. Generative Remove exige internet: https://helpx.adobe.com/sg/lightroom-classic/desktop/process-and-develop-photos/remove-tool.html

Um processamento de pixels que o SDK nao consiga representar pode exigir TIFF/DNG derivado, afetando tamanho e editabilidade parametrica. Avaliar essa diferenca antes de adotar o recurso.

