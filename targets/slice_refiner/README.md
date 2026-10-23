# Slice Refine Pro by Mizin

Reconstrução independente em Resolume Wire, baseada na análise do **SLICE REFINER v2.0**, de kpt hippo.
Formato preservado: fonte editável `.wire` e efeito compilado `.cwired`.
Versão calculada pelos commits: **v0.1.0 (build 1)**. Compilação: **PENDENTE**. QA no Wire: **PASS**.

## O que foi entregue

- Quatro grupos, cada um com lista de slices, ativação, quatro raios independentes em pixels,
  multiplicador dos cantos, espessura, inset, cor, opacidade, animação e fase.
- Seis modos por grupo: Static, Pulse, Chase, Breathe, Strobe e Color Flow.
- Relógio compartilhado com velocidade manual em Hz ou frequência derivada do BPM.
- Três saídas: Refine + Stroke, Inside Slices e Outline Only; suavização opcional e fundo preto opcional.
- Geometria nativa 2D instanciada como caminho padrão; alternativa SDF para conservar bordas internas
  sobrepostas, selecionada ao desligar Merge Edges. Essa alternativa tem custo maior.
- Painel organizado em seis grupos. Fonte independente: 233 nós e 331 conexões,
  identificador próprio `4c13d7fe-8506-5f66-bc59-2e6665c3ac4c`.

## Usar no Resolume

1. Instale o `.cwired` gerado usando o procedimento de patches Wire do seu Resolume.
2. Aplique o efeito ao vídeo. Em Group 1 a Group 4, atribua os slices desejados.
3. Comece com Merge Edges ligado, Corner Segments = 16 e Soft Edges px = 0.
4. Ajuste cada canto em pixels da composição; Corner Scale altera os quatro raios daquele grupo.
5. Selecione a animação por grupo. Motion Amount = 0 neutraliza a modulação;
   BPM Sync desligado habilita Speed Hz; ligado usa BPM Multiplier.
6. Use Inside Slices para remover conteúdo fora dos slices, ou Outline Only para uma camada de contornos.

No Wire, a fonte abre com Test Card e cinco slices Droid apenas como dispositivos de prévia.
Eles não substituem a atribuição dos slices da sua composição no Arena.
`Slice Refine Pro by Mizin.wire`, na pasta de mesmo nome, é a fonte de desenvolvimento.
O pacote de cada release contém o `.wire` com nome e descrição da versão, o `.cwired`, VERSION,
CHANGELOG e BUILD.json com hashes e commit de origem.

## Como o original funciona

O arquivo recebido é um contêiner Wire, não uma DLL. Foi recuperado um único `patch.wire`, sem
recursos externos: **308 nós, 445 conexões e quatro grupos de slices**. Slice Info fornece dimensão,
centro e rotação; operações de coleção e matemática aplicam os parâmetros; Rectangle/Transform/Shape Render
geram as formas, e máscaras/composição combinam os cantos e contornos com o vídeo.
O grafo original já usa instâncias e saída escalar. Não há evidência de que crie um framebuffer por slice.
A nova implementação foi construída separadamente a partir de classes públicas do Wire.
Ela mantém os controles centrais e traz seu próprio conjunto de animações; não é uma atualização oficial
do fabricante e não converte presets antigos automaticamente.

## Desempenho medido

GTX 1660 Ti, 3840×2160, duas ordens de execução, cinco amostras por execução. Medianas de ocupação da GPU inteira:

| Formas | Núcleo SDF | Núcleo 2D |
|---|---|---|
| 16 | 12–14% | 10–11% |
| 64 | 77–82% | 11–12% |
| 144 | 97% | 9–10% |

Esses dados comparam **somente o núcleo geométrico** em cenas sintéticas isoladas, com raios físicos equivalentes.
Não são FPS nem tempo por processo e não comparam o plugin original completo contra o novo completo.
A correspondência das máscaras de uma forma teve IoU de aproximadamente 0,994, com diferenças de rasterização nas bordas.
O ensaio anterior com ambos os caminhos no mesmo grafo foi rejeitado e está marcado como inválido.
Dados: `evidence/core-benchmark.json`; método: `notes/06_validation.md`.

## Compatibilidade e limites

- Fonte criada e renderizada no Wire **7.28.1.26535**, deployment target nativo **7.27.0**.
  Não foi comprovada compatibilidade com versões anteriores.
- Retângulos com rotação são o contrato da implementação. Deformações arbitrárias dos vértices,
  máscaras complexas do Advanced Output e composição com slices sobrepostos precisam de ensaio no seu projeto.
- Com Merge Edges ligado, o contorno é a diferença entre a união das formas exteriores e a união das interiores.
  Sobreposições podem eliminar trechos internos; desligue a opção para desenhar as bordas individualmente.
- A validação local cobre 23 verificações no Wire, incluindo grupos de 5, 4, 9 e 16 slices,
  transparência, limites, animações e resoluções paisagem/retrato/4K.
- **Reprodução do `.cwired` no Arena e avaliação visual no projeto real permanecem pendentes.**
  O conector encontrou o Arena fechado durante esta sessão.
- O original e a cópia de evidência foram preservados. Nenhum patch de licença ou alteração do runtime foi aplicado.

## Estado Atual e Próximos Passos

Análise estrutural concluída, nova fonte implementada, QA Wire **PASS**, build **PENDENTE**.
Próximo passo de operação: instalar o efeito em um projeto de teste do Arena, atribuir os slices reais,
verificar rotação/overlap e observar FPS/GPU na resolução do show. Depois disso, avaliar presets adicionais.
Não foi feita publicação no Acervo, upload ou substituição do original.

## Rastreabilidade e reprodução

Consulte `notes/01_overview.md` a `notes/06_validation.md`, `evidence/native-qa.json`,
`evidence/build-receipt.json`, `binaries/SHA256SUMS.txt` e o mapa `evidence/reconstruction-node-map.json`.
As evidências privadas extraídas ficam em `evidence/raw-bundle/` e não entram no pacote de entrega.
O comando de compilação é registrado literalmente no recibo. O versionador lê apenas commits estruturados
que alteraram este alvo, desde a última versão; cada compilação reserva um novo build e gera changelog com SHA.

Referências oficiais: [Slice Refiner](https://kpthippo.com/slice-refiner/),
[compilação Wire](https://resolume.com/support/en/wire-saving-consolidating).
