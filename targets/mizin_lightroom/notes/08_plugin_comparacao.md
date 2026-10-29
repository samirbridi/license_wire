# Primeiro pacote Lightroom - somente comparacao

O objetivo deste pacote e provar a integracao de leitura no Lightroom antes de habilitar escrita no catalogo. Os fontes estao em `reconstructed/lightroom-pilot/`. O pacote gerado fica em `private/deliveries/` porque inclui caminhos pessoais e previsoes de 92 fotos do teste.

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

Confirmar se o plugin carrega, se a janela aparece, quantas fotos ele localiza e se os valores atuais correspondem ao Lightroom. Informar o texto de qualquer erro. Esse retorno e QA nativo, nao aprovacao de qualidade fotografica do modelo. Nenhuma edicao precisa ser autorizada para executar essa comparacao de leitura.

## Evidencia e limites

O computador de desenvolvimento nao tem o executavel Lightroom Classic no local padrao verificado. Foi usado Lua 5.1 real via Lupa, com doubles do SDK, para testar escapes de dados, caminho sem fotos e ausencia de escritas. Os testes nao comprovam o comportamento da API dentro do aplicativo instalado na outra maquina.

`Info.lua` e gerado a partir da VERSION calculada por commits. O `PilotData.lua` contem somente literais produzidos pelo nosso serializador, nunca o Lua bruto do catalogo. O menu usa tarefa assincrona e `LrTasks.pcall` para permitir as consultas do SDK. O pacote nao possui rotina de inicio automatico.

Gerar depois do versionamento automatico:

```powershell
python .\scripts\build_lightroom_pilot.py --dataset .\private\raw-datasets\20261029T172842Z-c6cf2182 --manifest .\private\snapshots\20261029-124518-192a6383\analysis\extraction-20261029T155812079523Z\candidate-settings.jsonl
```

A origem primaria da estrutura de menus e o [guia Adobe do SDK](https://ioconsolerykerprodcdn.azureedge.net/static/installers/lr/sdk/2022/cross_platform/v13/doc/Lightroom%20Classic%20SDK%20Guide_1655133965.pdf). A referencia do SDK nao substitui o teste nativo do pacote.

Proximas etapas: testar leitura no host, obter eventos adicionais para avaliacao independente, melhorar os controles que perderam da mediana e integrar inferencia local para novas fotos. Aplicacao futura deve preservar snapshots/copias virtuais, com cancelamento e restauracao testados.
