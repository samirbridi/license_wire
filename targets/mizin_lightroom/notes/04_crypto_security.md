# Preservacao e acesso

- Inventario le somente nomes, caminhos, tamanhos, datas e versao do executavel. Nao le conteudo de fotos, catalogos, preferencias de conta, tokens ou modelos.
- Nao seguir reparse points, nao buscar todos os discos, nao modificar permissoes ou firewall.
- SMB apenas no host fornecido e nas pastas relacionadas ao trabalho. Falha do sandbox nao comprova porta fechada nem ausencia de arquivo.
- Nao copiar catalogo em uso nem remover lock para forcar abertura. Coleta futura exige consistencia e arquivos companheiros.
- Nao armazenar fotos, catalogos ou credenciais no Git. Relatorios privados permanecem locais. Copias futuras de originais precisam de SHA-256 e proveniencia em alvo apropriado.
- Fonte do gosto: exemplos aprovados do usuario. O inventario nao extrai modelos do fornecedor.

## Coleta autorizada do catalogo fechado

O usuario confirmou fechamento e autorizou a continuidade. O copiador exige ausencia de lock/WAL/SHM, abre os vinte arquivos da coleta com acesso Read e compartilhamento somente Read (recusando escritores existentes), calcula SHA-256 dos bytes recebidos e compara cada copia local. Confere estabilidade de nomes/tamanhos/datas e ausencia dos arquivos de runtime ao terminar. O estado original e preservado em nova pasta privada, sem sobrescrita ou exclusao.

O analisador verifica o hash do catalogo antes e depois, consulta apenas a copia local via SQLite `mode=ro&immutable=1`, `query_only=ON` e `trusted_schema=OFF`, com carregamento de extensoes desabilitado. Lua armazenado nos dados e lido por parser literal limitado, nunca por `eval`, `exec` ou um interpretador Lua. Historico comprimido tem tamanho limitado e verificado.

O dataset contem caminhos e metadados pessoais; permanece em `private/`, ignorado pelo Git. A aprovacao de referencia foi obtida diretamente do usuario. Nao houve envio de fotos a provedores, acesso a credenciais nem extracao de modelos do Neurapix.

