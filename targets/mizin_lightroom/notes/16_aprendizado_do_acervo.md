# Aprendizado local do acervo, eventos e opiniao

O usuario autorizou aproveitar edicoes existentes em varios catalogos e eventos, e pediu continuidade por evento, com opcao de informar conclusao e avaliar sugestoes. Nao e necessario transferir JSONs ao desenvolvimento para o novo treinamento local.

## Fluxo implementado

`Aprender com catalogo atual` consulta o filtro documentado `hasAdjustments` via SDK. Captura originais CR3 em cor, nao rejeitados e com os dez controles numericos disponiveis. O resumo pede uma confirmacao de que essas edicoes estao finais. O processamento aceita ate 10.000 referencias na fila e executa lotes de 25 sem limitar o acervo a selecoes de 100.

O SDK consulta o catalogo aberto. O usuario abre cada catalogo uma vez para a primeira importacao; a base SQLite em MizinLightroomLocal/jobs/learning e comum a todos eles naquela maquina. Nao le catalogos de trabalho via SQLite nem modifica fotos/catalagacoes. `Registrar evento concluido` adiciona a selecao de um trabalho e confirma sua revisao final. A identidade de trabalho e sugerida pela pasta; selecoes com varias pastas de trabalhos sao direcionadas ao modo de catalogo.

A fila guarda os valores aprovados e confere novamente os dez ajustes antes de cada etapa. Se mudarem, a foto fica fora daquela aprovacao. O arquivo de fila inicial e preservado; checkpoints sao adicionados em journal, que recupera o ultimo registro completo apos escrita interrompida. Cancelamento parcial preserva os itens ainda nao processados. Filas pausadas exigem Continuar; filas interrompidas sem pausa podem retomar no inicio do catalogo correto. Nenhuma foto nova e automaticamente declarada revisada.

## Historico e aprendizagem

SQLite armazena revisoes aprovadas, com identidade de catalogo/foto e RAW SHA-256. Uma nova aprovacao mais recente do mesmo item substitui a revisao ativa, mantendo o historico. Importar um export antigo nao desfaz a revisao recente. Mesmo RAW/rotulos entre catalogos conta uma vez; rotulos ou atributos conflitantes ficam excluidos do treino e aparecem no resumo.

Ao terminar uma importacao, pelo menos tres eventos com 50 referencias unicas cada permitem gerar um candidato. Um evento e reservado para avaliacao, outro para escolha de regularizacao e os demais para treino interno. Normalizacao, limites e coeficientes nao usam alvos do evento avaliado. A versao final do candidato usa os eventos de treino/validacao e e avaliada no evento reservado. Eventos ja usados em treino, validacao ou avaliacao nao viram um novo teste em rodadas futuras; nova rodada exige um evento ainda nao utilizado. O ajuste inicial e regressao ridge com 40 atributos e dez controles; nao e uma reconstrucao da rede do Neurapix.

Os candidatos sao gravados com hash, metricas, particoes e limitacoes. Nao substituem o modelo anterior nem aplicam edicoes. `Avaliar aprendizado do acervo` usa o candidato mais recente e verifica seu hash antes de calcular novas sugestoes. A qualidade fotografica e a generalizacao ampla permanecem sem aprovacao; uma avaliacao numerica de um evento nao resolve essa fronteira.

## Opiniao do usuario

O menu registra gostei/precisou ajustar/nao gostei, uma observacao e a analise correspondente. Uma opcao permite perguntar depois das analises. Notas nao sao executadas nem viram rotulos, e clicar gostei nao treina o modelo em suas proprias previsoes. O fotografo registra os ajustes finais pelo fluxo de evento concluido.

## Verificacao

68 testes passaram, incluindo importacao de 121 fotos em lotes sem escrita no catalogo, cancelamento parcial, journal truncado, isolamento por catalogo, alteracoes depois da aprovacao, opiniao sem coleta de ajustes, historico, deduplicacao/conflitos e separacao de eventos. Modificar somente os alvos do teste nao mudou os coeficientes ajustados. O runtime portatil confirmou SQLite 3.50.4. A interface nova e o desempenho do acervo completo ainda exigem QA no Lightroom real.

Fontes: guia Adobe preservado em private/tools/local-engine-downloads/Lightroom-SDK-guide.pdf, paginas 23-24/32 para inicializacao/encerramento e 77-80 para filtro de ajustes. [SDK oficial](https://developer.adobe.com/lightroom-classic/). A busca e uma capacidade do SDK; a aprovacao do fotografo e um requisito do nosso fluxo, nao uma inferencia a partir de editCount.
