# Preservacao e acesso

- Inventario le somente nomes, caminhos, tamanhos, datas e versao do executavel. Nao le conteudo de fotos, catalogos, preferencias de conta, tokens ou modelos.
- Nao seguir reparse points, nao buscar todos os discos, nao modificar permissoes ou firewall.
- SMB apenas no host fornecido e nas pastas relacionadas ao trabalho. Falha do sandbox nao comprova porta fechada nem ausencia de arquivo.
- Nao copiar catalogo em uso nem remover lock para forcar abertura. Coleta futura exige consistencia e arquivos companheiros.
- Nao armazenar fotos, catalogos ou credenciais no Git. Relatorios privados permanecem locais. Copias futuras de originais precisam de SHA-256 e proveniencia em alvo apropriado.
- Fonte do gosto: exemplos aprovados do usuario. O inventario nao extrai modelos do fornecedor.

