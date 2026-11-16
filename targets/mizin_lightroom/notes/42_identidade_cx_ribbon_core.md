# Identidade visual "CX Ribbon Core" e site

2026-11-15, America/Sao_Paulo. Usuario pediu nova identidade (prancha "CRISPIX — Documentacao da Marca / Modelo 1"), logo vetorizado em SVG com transparencia e o site atualizado, com previa temporaria antes de publicar. Substitui o estudo anterior (C aberto + losango, `reconstructed/branding/APROVACAO.md`), mantido como historico.

## Simbolo

- Referencias salvas em `reconstructed/branding/cx-ribbon/referencia/`.
- Geometria parametrica em `cx_geometry.py`, unidades 1180 x 648. Medida na versao monocromatica da prancha:
  - Haste "\": inclinacao 1/1.12; afunila de 244 para 232. Haste "/": 1/1.25, largura de 224.
  - Raios externos do C: 220 em cima e 200 embaixo; miolo com raio 46.
  - Corte em S como cubica, ajustado por minimos quadrados aos pixels do vao (RMS 1,8 unidade). Vao de 22 nas versoes de uma cor; sem vao na colorida, onde a dobra aparece pelos degrades.
- Sobreposicao final contra a referencia: diferencas de ate ~5 unidades nas bordas, no nivel do borrao do webp.
- Peca A: C + metades superiores do X. Peca B: metades inferiores. Fita frontal: realce sobre A, recortado por clip.

## Kit (`generate_cx_ribbon.py` -> `kit/` e `CRISPIX-identidade-cx.zip`)

- SVG: simbolo colorido, simbolos azul profundo e branco, logo horizontal (fundo escuro/claro, azul profundo, branco), icone de app, favicon e cartao social 1200x630.
- Wordmark em Montserrat Bold convertido em curvas (fontTools). A fonte vem de `%LOCALAPPDATA%\Microsoft\Windows\Fonts`; pode ser sobrescrita com CRISPIX_WORDMARK_FONT. O X do wordmark repete o corte em S: metade branca, metade em degrade.
- PNG renderizado no Chrome (Playwright) com alfa real: icones de 16 a 1024, simbolo de 512/1024/2048 e logos de 1200/2400. Inclui `crispix.ico`.
- `png/crispix-header-plugin-candidato.png` (1020x276) **nao aplicado ao plugin**. O Lightroom usa `Branding/crispix-header.png` (PhotoEditor.lua:490); trocar exige novo build.
- Paleta: #0B1A35, #0A6BFF, #00E5FF, #FFFFFF (fundo mais escuro: #050B18).

## Site (`reconstructed/branding/site`)

- O gerador exporta para o site `brand/*.svg`, o PNG social, `favicon.svg/.ico` e `apple-touch-icon.png`.
- `index.html`:
  - Tokens com a nova paleta e Montserrat nos titulos; Inter continua no corpo.
  - Hero sempre na faixa escura da marca, com arco luminoso. Logo claro/escuro trocado por tema via CSS.
  - Divisorias em degrade de fita. Inclui metas og:/twitter e icones.
- `showcase.css`: telas ilustrativas recoloridas para a paleta. Conteudo, IDs e scripts sem alteracao.
- QA: `python scripts/verify_site_showcase.py --output evidence/site-identidade-cx` com o servidor em 8764. 9 verificacoes ok, zero erros de JS e screenshots revisadas.
- Previa privada (claude.ai Artifact): https://claude.ai/artifact/21Zuhqew79sz7TTKt7p4fP. E uma copia sem doctype/head, com titulo "Previa CRISPIX" e o latest.json publico do build 0040.

## Plugin e publicacao (2026-11-16)

- Cabecalho das janelas do plugin (`plugin-assets/crispix-header.png`, 1020x276, exibido em 340x92) gerado pelo kit: faixa azul profunda com o logo colorido e "SEU OLHAR. SUA EDICAO." em curvas. Legivel em dialogo claro ou escuro. Unica imagem usada pelo Lua (PhotoEditor.lua:490).
- Commit `cf5f315` (feat). Versao automatica **v0.28.0 (build 0042)** (`evidence/release-build-0042.json`).
  - Para o script de versao rodar com a arvore limpa, cinco arquivos nao rastreados de outro trabalho (CODE_REVIEW.md, _check_fill.py, _look/, build_explainer.py, crispix_explainer_9x16.mp4) foram retirados temporariamente e devolvidos intactos logo depois.
- Build com os mesmos insumos do 0040 (comando na nota 40). ZIP com 84.191.973 bytes, SHA-256 `9205676146f9f40f035670c58820a3d2e11df05912f4059cb18dddc2223cc7bf`, 1.748 arquivos. Motor, modelo e Lua iguais; mudam o Branding e o LEIA-ME.
- QA: 219 testes. `verify_editing_release.py` ok (CRC, 1.748 hashes, 34 Lua, 2 RAWs reais, edicao/restauracao no SDK simulado). Recibo `evidence/editing-plugin-qa-0042.json`.
- Site: textos fixos atualizados para o 0042 (link reserva, versao, novidades). `verify_site_showcase.py` agora usa `private/deliveries/latest.json`, em vez do manifesto do 0040 fixo no codigo.
- Publicacao com `Publish-CrispixBuild.ps1`:
  - Rede e R2 corretos, com hash conferido.
  - **Bug:** o staging do Pages usava `Copy-Item -LiteralPath "<site>\*"`, que nao expande o `*`. O deploy `b8590586` saiu so com o latest.json, sem pagina.
  - Corrigido na hora: deploy manual de `private/publication-0042/site` (site completo + manifesto ao vivo, sem BOM) -> `dc5c62cd`.
  - O publicador agora copia item a item, ignora `.wrangler` e aborta se o staging nao tiver index.html ou todos os arquivos (testado a seco: 11/11).
- Conferido ao vivo:
  - Os 12 arquivos batem byte a byte no dominio de producao.
  - Download publico com tamanho e SHA-256 identicos.
  - Manifesto lido pelo Json.lua real.
  - QA no Chrome em https://crispixlr.pages.dev/ ok, sem erros JS.
- Recibo: `evidence/publication-0042.json`.

## Pendente

- Primeira atualizacao real pelo "Verificar atualizacoes" dentro do Lightroom (LrHttp ao vivo ainda nao exercitado) e conferencia visual do cabecalho novo no dialogo nativo.
