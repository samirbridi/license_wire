# Plugin próprio Mizin e validação de carga

Slice Refine Pro by Mizin é uma implementação independente, com fonte própria e UUID próprio.
Sua execução usa os componentes nativos do Wire e não carrega o SLICE REFINER original.
O desenvolvimento mantém `.wire` editável e `.cwired` compilado. O original continua preservado.

## Resultado desta etapa

O grafo nativo estável foi exercitado integralmente em 3840×2160, com 64 e 144 instâncias sintéticas
de slices. Foram oito execuções, contando as duas ordens e os três modos na carga de 64.
As coleções foram conferidas ao vivo e as saídas PNG renderizadas foram verificadas como não vazias.
Resultado: PASS. Registro: evidence/full-native-load-check.json.

Na carga de 144, cada um dos quatro grupos grid_4x4 foi expandido para 36 instâncias sobrepostas.
Isso verifica processamento de coleções maiores; não corresponde a 144 posições independentes nem
comprova FPS de show. As medições de ocupação da GPU inteira variaram com a execução e não devem
ser convertidas em um fator de aceleração ou em FPS. Arena e o projeto real ainda precisam de teste.

## Alternativas avaliadas

Um compositor ISF próprio preservou a aparência dentro de pequenas diferenças de quantização,
mas aumentou a ocupação observada da GPU no modo principal. Foi rejeitado para esta entrega.
Uma tentativa de especializar seletores por configuração também foi rejeitada porque não preservou
a especialização necessária na recarga. Nenhuma dessas alterações faz parte do `.cwired` entregue.

Fontes experimentais, decisões e resultados ficam isolados em evidence/experiments/.
A fonte de produção foi restaurada byte a byte à base aprovada, com hash conferido contra o QA.
Os 23 testes funcionais dessa base e o conjunto de controles permanecem válidos.
Esta etapa amplia a validação e a documentação; mantém a lógica de renderização já aprovada.

## Próximo marco

Instalar o plugin em um projeto de teste no Arena, atribuir os slices reais e medir FPS/tempo de GPU.
Depois disso, otimizar o gargalo observado no host, preservando os controles e a imagem.
