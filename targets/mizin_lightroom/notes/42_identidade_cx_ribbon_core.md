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

## Pendente

- Aprovacao do usuario para publicar o site no Cloudflare Pages (crispixlr). Usar o mesmo fluxo da nota 41: copiar todos os arquivos do site, incluindo `brand/`, os favicons e o latest.json conferido.
- Decidir se o cabecalho/icone do plugin muda (exige novo build do plugin).
- Commit e CHANGELOG ainda nao feitos.
