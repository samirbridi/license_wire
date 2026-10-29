# Primeiro pacote Lightroom - somente comparacao

O objetivo deste pacote e provar a integracao de leitura no Lightroom antes de habilitar escrita no catalogo. Os fontes estao em `reconstructed/lightroom-pilot/`. O pacote gerado fica em `private/deliveries/` porque inclui caminhos pessoais e previsoes de 92 fotos do teste.

O ZIP validado foi entregue, com hash igual ao local, em `\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot\MizinLightroom-0.3.0-build0006-d05d06ba\MizinLightroom-0.3.0-build0006-piloto-leitura.zip`. Foi criada somente uma nova pasta de entrega e copiado o ZIP; nao houve instalacao automatica ou escrita nas fotos/catalogo. Extrair para uma pasta permanente do usuario, como Documentos, antes de adicionar o plugin.

Resumo de pacote em `evidence/native-pilot-package-20261029.json` e entrega em `evidence/native-pilot-delivery-20261029.json`. Sintaxe do pacote real verificada em Lua 5.1, CRC do ZIP aprovado, versao gerada igual a VERSION da entrega e 92 previsoes finitas. Posteriormente, o usuario instalou e executou o pacote: o fluxo de leitura foi mostrado funcionando no Lightroom, conforme `evidence/native-read-user-qa-20261029.json`. Os recibos de geracao anteriores permanecem como historico do momento da entrega.

## Escopo concreto

- Menu Biblioteca > Extras de plug-in > Mizin: comparar amostra do piloto.
- Consulta as fotos conhecidas no catalogo aberto e le os ajustes atuais.
- Exibe ate cinco exemplos de exposicao, temperatura e contraste, e o total localizado.
- As previsoes foram calculadas anteriormente pelo modelo experimental; o pacote ainda nao analisa novas fotos.
- Nao escreve ajustes, nao cria colecoes, nao executa o motor Python, nao usa rede e nao inclui fotos ou pesos de modelo.
- Se o catalogo nao contiver as fotos, orienta abrir o catalogo de outubro. Campos de revelacao indisponiveis sao mostrados como tal, sem forcar refresh alterando a imagem.

## Instalacao para teste na maquina de edicao

1. Extrair o ZIP privado em uma pasta permanente e acessivel.
2. No Lightroom Classic, Arquivo > Gerenciador de plug-ins > Adicionar.
3. Selecionar a pasta `MizinLightroom.lrplugin`.
4. Abrir o catalogo `202610 - OUTUBRO`.
5. Executar o menu do piloto em Biblioteca > Extras de plug-in.

Esse roteiro foi executado pelo usuario, que forneceu screenshots do menu e do dialogo. O retorno registra QA nativo de leitura, nao aprovacao de qualidade fotografica do modelo. Nenhuma edicao precisa ser autorizada para executar essa comparacao de leitura.

## Evidencia e limites

O computador de desenvolvimento nao tem o executavel Lightroom Classic no local padrao verificado. Foi usado Lua 5.1 real via Lupa, com doubles do SDK, para testar escapes de dados, caminho sem fotos e ausencia de escritas. Esses testes isolados nao comprovam o comportamento da API no aplicativo instalado na outra maquina.

A evidencia posterior fornecida pelo usuario confirmou o fluxo nominal do pacote: menu visivel, dialogo aberto, 92 fotos localizadas e 15 valores atuais lidos nas cinco linhas mostradas. As 15 previsoes exibidas tambem conferem com os resultados salvos, na precisao do dialogo. A transcricao dos campos visiveis e as verificacoes numericas ficam junto aos originais em `private/evidence/`.

O teste nativo observado nao cobriu caminhos de erro, escrita/restauracao, inferencia de novas fotos ou aprovacao visual das previsoes. O numero de versao do Lightroom e do pacote nao aparece nos prints; a associacao com o pacote entregue se apoia nos nomes, fluxo e valores correspondentes.

`Info.lua` e gerado a partir da VERSION calculada por commits. O `PilotData.lua` contem somente literais produzidos pelo nosso serializador, nunca o Lua bruto do catalogo. O menu usa tarefa assincrona e `LrTasks.pcall` para permitir as consultas do SDK. O pacote nao possui rotina de inicio automatico.

Gerar depois do versionamento automatico:

```powershell
python .\scripts\build_lightroom_pilot.py --dataset .\private\raw-datasets\20261029T172842Z-c6cf2182 --manifest .\private\snapshots\20261029-124518-192a6383\analysis\extraction-20261029T155812079523Z\candidate-settings.jsonl
```

A origem primaria da estrutura de menus e o [guia Adobe do SDK](https://ioconsolerykerprodcdn.azureedge.net/static/installers/lr/sdk/2022/cross_platform/v13/doc/Lightroom%20Classic%20SDK%20Guide_1655133965.pdf). A referencia do SDK nao substitui o teste nativo do pacote.

Proximas etapas: obter eventos adicionais para avaliacao independente, melhorar os controles que perderam da mediana e integrar inferencia local para novas fotos. Aplicacao futura deve preservar snapshots/copias virtuais, com cancelamento e restauracao testados. Mapeamento dos modulos e marcos em `09_qa_nativo_e_modulos.md`.
