# Arquitetura proposta - ainda nao implementada

1. Plugin Lua consulta fotos selecionadas, parametros de revelacao e metadados pelo SDK. Aquisicao sem modificar o catalogo e preferivel na primeira etapa.
2. Exportador cria dataset local com identificador, camera/perfil/process version, parametros finais e referencias visuais. Preservar RAWs e registrar se a edicao esta aprovada.
3. A entrada precisa de renderizacao neutra consistente. Uma miniatura ja editada nao pode ser tratada como original sem ajustes. Evitar vazamento dos resultados finais para as entradas do treinamento.
4. Motor local aprende ajustes por foto, com perfis versionados. Arquitetura e tamanho do dataset dependem dos exemplos reais. Exportacao do motor do Neurapix nao foi verificada nem integra nossa implementacao.
5. Validar em eventos/ensaios separados dos usados no treinamento. Nao repartir aleatoriamente fotografias da mesma sequencia entre treino e teste. Medir tempo de revisao, proporcao aceita e problemas de pele, ruido, luz mista e altas luzes.
6. Aplicacao futura usa snapshots ou copias virtuais e registra valores anteriores. Validar recuperacao, cancelamento e idempotencia na versao real do Lightroom.

Como no objetivo local do Foto na Hora, persistencia e recuperacao de tarefas sao relevantes. Nao reutilizar automaticamente codigo ou integracoes daquele produto.

O alvo inicial e o ajuste global editavel. Mascaras, recorte, endireitamento e selecao serao investigados por capacidade e versao do SDK. Nao prometer controle de todos os comandos da interface.

