# Selecoes grandes sem teto e senha para baixar pelo site (build 0050)

2026-11-19. Pedido: "Nao podemos ter um limite, tem que ser ilimitado com a quantidade escolhida" + senha nos downloads do site, como no PDF-to-PPT, sem afetar a atualizacao pelo plugin.

## 121 fotos x 100 + 21
- Nao existe corte em 100 fotos na edicao manual (AutoEdit.MAX_BATCH=100 e so o lote por ciclo da pasta vigiada; o resto segue no ciclo seguinte).
- O erro "Controle atual indisponivel: Tint" (corrigido no 0049) depende da FOTO, nao da quantidade: provavelmente o Lightroom passou a informar os numeros do balanco de branco entre uma tentativa e outra.

## Teto real encontrado e removido
- Json.decode, leitura de results.json/status.json (LocalAnalysis), session.json/checkpoints (PhotoEditor), fila do acervo, estado da pasta vigiada e read_json do motor tinham teto de 8 MiB. Com ~3.000 fotos o results.json passa disso e a edicao parava com "JSON invalido ou muito grande".
- Agora `Json.MAX_BYTES` = 512 MiB (centenas de milhares de fotos) em todos; o motor usa o mesmo valor. Json.decode copia trechos de string de uma vez (arquivos grandes em segundos).
- Testes: `test_selection_far_above_old_file_limits_edits_every_photo` (3.000 fotos, results.json > 8 MiB, todas editadas), `test_json_codec_reads_documents_above_eight_mebibytes`, `test_request_for_thousands_of_photos_is_read`.
- Fora do escopo: a selecao visual (culling) ainda limita 2.000 fotos (`LocalAnalysis.lua`).

## Senha dos downloads do site
- `reconstructed/branding/functions/_middleware.js` (Pages Function, modelo do PDF-to-PPT): `/api/download-access` (GET status, POST senha -> cookie HMAC `crispix_dl` 12 h), `/downloads/<pacote>` exige o cookie e entao redireciona para o ZIP no R2 (110 MB nao cabe no Pages, limite 25 MiB).
- Senha so no segredo `DOWNLOAD_PASSWORD` do projeto crispixlr. Sem o segredo: downloads do site bloqueados (503 no POST).
- O plugin nao passa pela senha: le latest.json e baixa do R2. Consequencia: quem tiver a URL do R2 (esta no latest.json publico) ainda baixa sem senha, igual ao caminho do atualizador no PDF-to-PPT.
- `Publish-CrispixBuild.ps1` faz o deploy a partir de `reconstructed/branding` (para compilar `functions/`) e confere `/api/download-access` no ar.
- Testes: `scripts/test_download_gate.mjs` (8 casos, via `test_download_gate.py`) e `verify_site_showcase.py` (formulario, senha errada, senha certa).

## Pendente
- Senha definida pelo usuario em 2026-11-19. O Pages so aplica um segredo novo na PROXIMA publicacao: foi preciso republicar o 0050 (deploy 402aa03c). Depois disso, senha errada -> 401. A senha certa nao foi testada por mim (so o usuario a conhece).
- Trocar a senha no futuro: `npx wrangler pages secret put DOWNLOAD_PASSWORD --project-name crispixlr` e republicar.
- Validar no Lightroom real uma selecao grande (milhares de fotos) e a atualizacao 0049 -> 0050 pelo menu.
