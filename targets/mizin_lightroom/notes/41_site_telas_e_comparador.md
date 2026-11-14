# Site: informacoes atuais, telas e comparador fotografico

2026-11-14, America/Sao_Paulo. Usuario pediu atualizar as informacoes do site, incluir telas e comparativo; esclareceu que deseja **fotos antes e depois da edicao**. Foi solicitada a pasta dos pares aprovados para publicacao. Nenhum par real foi fornecido nesta etapa.

## Implementacao

- Site atualizado para apresentar o plugin publicado v0.26.0 (build 0040): 219 testes, aprendizado com referencias recentes, atualizacao no mesmo trabalho, pele condicionada a dados/validacao, falhas individuais do lote e limites reais do nivelamento.
- Tres telas HTML/CSS navegaveis por clique e teclado: preparar edicao, resultado do lote e atualizacao. Identificadas como representacoes ilustrativas, nao capturas nativas. O exemplo 20 analisadas/1 nivelada vem do teste automatizado; nao e taxa de acerto.
- Comparativo antigo com alegacoes de terceiros removido conforme foco solicitado em fotos. Novo comparador carrega pares de comparisons.json, tem divisoria arrastavel diretamente sobre a imagem, slider acessivel, selecao de foto e suporte a toque. Nao ha CSS para simular uma edicao fotografica.
- comparisons.json permanece vazio. Secao e link de navegacao ficam ocultos ate existir um par carregado com sucesso; nao foram publicados retratos privados, fotos geradas ou resultados fabricados. Falta receber fotos antes/depois do CRISPIX aprovadas para publicacao.
- Download e versao consultam latest.json. Se o canal nao responder, o link conhecido do build 0040 permanece com aviso. URL do pacote validada contra o dominio R2 do projeto. Pagina/documento pt-BR, viewport, skip link, foco visivel, abas com teclado e layout responsivo.

## Validacao

```powershell
python -m http.server 8764 --bind 127.0.0.1 --directory reconstructed/branding/site
python scripts/verify_site_showcase.py
```

Chrome headless via Playwright local: nove verificacoes de navegacao/semantica, tres abas/teclado, galeria vazia oculta, link do canal, desktop/mobile claro/escuro sem overflow, fallback do manifesto, carregamento/selecao/extremos do slider, arraste sobre a imagem e foto ausente. Zero erros JavaScript. Manifesto interceptado apenas no teste com dados do canal 0040. Comparador exercitado com pixel sintetico privado, sem servir esse fixture no site. Evidencias em evidence/site-showcase-0041, incluindo screenshots revisadas visualmente. Sem mudanca no motor/Lua do plugin, sem nova suite fotografica ou recompilacao do ZIP.

## Publicacao e versoes

A versao do repositorio para esta entrega web e calculada pelos commits com scripts/version-from-commits.mjs. Ela e distinta do ultimo ZIP do plugin: **o atualizador continua apontando para o build 0040**, com o mesmo SHA-256. Staging deve copiar todos os arquivos de reconstructed/branding/site e o latest.json publico previamente conferido. Conferir os hashes da pagina, CSS, JS, comparisons.json e manifesto apos o deploy; nao promover a versao web como se fosse um novo binario do plugin.

## Para incluir fotos aprovadas

Adicionar exportacoes de antes/depois da mesma foto em assets/, com dimensoes iguais e nomes simples (letras, numeros, hifen/underscore; JPG/PNG/WebP). Cada entrada de comparisons.json deve ter title, before, after e caption; before/after sao caminhos assets/nome.jpg. A legenda identifica versao/modelo e eventuais ajustes manuais, sem atribuir ao plugin trabalho feito pelo fotografo. Publicar apenas pares indicados/aprovados pelo usuario. Revalidar o comparador com os pares reais e conferir a apresentacao visual antes do deploy.
