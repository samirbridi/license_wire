# Especificacao independente - Slice Refine Pro by Mizin

Decisoes de 2026-10-22, antes da implementacao do novo grafo.

O original recebido e v2.0, salvo no Wire 7.14.2. O inventario verificavel esta em
`evidence/original-graph-analysis.json`: 308 nos, 445 conexoes, quatro colecoes de
slices, quatro conjuntos de cantos, efeitos, mascara e stroke. Nao utiliza ISF nem
recursos externos. Os nos 48, 70, 80, 88 e 97 documentam a geometria/rasterizacao.
Isto nao demonstra um gargalo medido: o rasterizador original ja entrega textura
escalar, portanto nao se deve afirmar que aloca um framebuffer para cada slice.

## Contrato do novo efeito

- Quatro listas independentes de slices retangulares, com rotacao preservada.
- Cada grupo: ativacao, quatro raios em pixels, inset em pixels, stroke em pixels,
  cor, opacidade, escolha de animacao e defasagem. Valores nao dependem do tamanho
  dos outros slices do grupo.
- Coordenadas de Slice Info sao pixels relativos ao centro. Para o viewport
  normalizado do Wire, converter dimensoes, centros e raios por 2/altura do host.
- Nucleo novo com Rectangle da categoria 2D, Transformation 2D, Mesh 2D e 2D Render.
  Colecoes instanciadas, uma cadeia compartilhada para qualquer quantidade de slices.
- Novo raio normalizado = raio_px * 2/altura, limitado a metade da menor dimensao.
  No Rectangle 2D a ordem dos cantos foi observada como TR, TL, BL, BR.
- Gerar mascara retangular, mascara arredondada colorida e mascara interior.
  O stroke e a diferenca entre exterior e interior. O preenchimento usa o video
  recebido. Modos de saida: preservar fora dos slices, recortar nos slices, contorno.
- Usar a resolucao fornecida pelo host; qualidade controla tessellacao e escala
  de rasterizacao. Qualidade reduzida deve ser identificada como troca de detalhe
  por custo, nunca como ganho sem perda comprovado.
- Animacoes novas baseadas em fase compartilhada: pulsacao, chase entre slices,
  respiracao geometrica, strobe e mistura de cores. Velocidade manual ou BPM.
- Feather opcional, com bypass quando zero.

## Limites e validacao

Nao copiar o grafo proprietario para reconstructed/. O patch extraido fica apenas
em evidence/raw-bundle/ (ignorado pelo Git). O novo grafo sera construido a partir
das classes publicas e desta especificacao, com novo identificador e autoria.

Verificar cantos separadamente, grupos com quantidades diferentes, tamanhos zero,
insets extremos, transparencia, resolucoes diferentes, animacao e recompilacao.
Comparar o nucleo geometrico em cenas sinteticas identicas, registrando separadamente
medicoes locais e validacao no Arena/painel fisico. Nao prometer FPS a partir do numero
de nos, de capturas HTTP ou de uma comparacao de resolucoes diferentes.
