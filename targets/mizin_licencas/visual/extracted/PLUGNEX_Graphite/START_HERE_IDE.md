# PLUGNEX — Graphite Edition / handoff de interface

## Objetivo
Modernizar a interface existente do PLUGNEX sem reescrever o motor de distribuição, autenticação, instalação, atualização e licenciamento. O protótipo é proposta visual, não um backend de produção. Preservar o nome, slogan Discover. Install. Create. e o logotipo do Brand Kit v1.0 (SVG original do kit, sem recoloração). PLUGNEX é independente do Resolume.

## Referências
- `plugnex.html`: protótipo autocontido; abrir no navegador.
- `reference/catalog.png`, `updates.png`, `licenses.png`, `settings.png`: capturas 1440 × 900 do HTML.
- `assets/`: logotipo horizontal e ICO provenientes do kit anterior.
- `design-tokens.json`: nova proposta Graphite para componentes, não substitui a identidade do logotipo.

## Layout
Barra superior 43 px, menu 29 px, abas 45 px, toolbar 48 px, status 28 px. Área de trabalho em três painéis: biblioteca/categorias (210 px), tabela flexível, inspector (350 px). Separadores de 5 px. Cabeçalhos de 32 px. Abas retas, seleção sublinhada de 2 px, bordas de 1 px, raio de 2–3 px, tipografia Segoe UI 13 px na proposta desktop. A marca conserva o lettering vetorial original; usar as fontes do manual para materiais de marca. Evitar banners, glows, sombras e cards gigantes. Ajustar os painéis para telas menores, DPI do Windows e acessibilidade por teclado. Oferecer lista e grid compacta como opções futuras; filtros por host, categoria, busca, instalados e compatibilidade. Não esconder estados críticos apenas em cores.

## Navegação e comportamento
Discover: catálogo e detalhes; My Plugins: instalados; Updates: versão atual versus disponível, changelog e autorização explícita; Licenses: direitos, dispositivos e ativações; Settings: hosts, caminhos, políticas e idioma. Integrar ao estado real do aplicativo. Não confundir instalação com compra/entitlement ou ativação. Exibir estados pending, download, verificando, instalado, update disponível, incompatível, falha e rollback. Permitir atualizações individuais; nunca substituir arquivos em uso sem aviso e confirmação adequada. Planejar fila de download, pausa, cancelamento, assinatura de pacotes, verificação de hash, instalação transacional e rollback. Licenças: utilizar backend autorizado, tokens de curta duração e armazenamento seguro local, não expor segredos nem registrar chaves completas; prever grace period offline conforme política comercial real. Não prometer proteção inviolável. Integração VYLO futura, sem insinuar disponibilidade atual.

## Implementação
1. Inventariar o repositório e a stack; criar branch e registrar baseline de testes.
2. Aplicar tokens e componentes ao framework existente. Não migrar framework só para copiar HTML.
3. Mapear cada ação do protótipo a serviços existentes; preservar funcionalidades não representadas nas capturas.
4. Exibir ícones e thumbnails reais de cada plugin e dados de catálogo reais; versões, estados e entradas de demonstração não são dados oficiais. Não incorporar os dados de teste na produção.
5. Implementar layout adaptativo e painéis redimensionáveis quando suportados; validar escala 100/125/150/200% e teclado, seleção, foco e contraste.
6. Comparar capturas de 1440×900 com as referências e testar regressões de login, catálogo, instalação, atualização, desinstalação, licenças, offline e falhas. Não anunciar recursos sem validar.

## Limites do protótipo
HTML/CSS/JS, sem backend, sem detecção de host, sem arquivos instalados, sem licenças reais. Ações simuladas apenas em memória; preferências não persistem; não implementa docking, compra ou atualização real. Capturas em Chromium/Linux, não validação do executável Windows. O texto está em inglês; preservar idiomas existentes e preparar localização sem remover funcionalidades. A paleta Graphite é proposta para aprovação, com azul discreto como accent do PLUGNEX.
