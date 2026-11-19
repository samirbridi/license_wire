# Erro "Controle atual indisponivel: Tint" (build 0049)

2026-11-19. `capturePhotos` exigia numero em todos os controles; balanco de branco com nome pode vir sem Temperature/Tint (1 de 3.601 fotos no catalogo: Daylight sem numeros) e uma unica foto bloqueava o lote.

- Captura aceita Temperature/Tint ausentes; os outros oito controles continuam obrigatorios.
- `M.fingerprint` ignora numeros derivados fora de WhiteBalance=Custom (o Lightroom pode preenche-los depois); `M.matches` aceita tambem hashes exatos de sessoes ate o 0048 (restauracao e AutoEdit).
- Restauracao na grade: registro sem WhiteBalance e sem numeros volta como 'As Shot'.
- Intensidade abaixo de 100, ou Custom sem numeros: a foto mantem o balanco de branco e recebe o resto.
- Publicado: `evidence/publication-0049.json`. 285 testes.
- Pendente: validar no Lightroom real (edicao e restauracao dessas fotos) e a atualizacao 0048 -> 0049 pelo menu.
