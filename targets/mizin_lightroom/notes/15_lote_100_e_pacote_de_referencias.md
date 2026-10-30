# Lote de 100 fotos e transferencia das referencias

O usuario colocou a pasta da tarefa, sete prints e uma copia do Neurapix em Downloads/PLUGIN LIGHTROOM. Antes de interpretar os dados, 205 arquivos proprios foram copiados e comparados por SHA-256, sem escrita na origem. Os 964 arquivos do fornecedor foram preservados separadamente em `targets/neurapix/private/`; nao entraram no nosso produto nem no dataset.

## Resultado real do build 0010

- Pedido: 100 fotos; coleta: 96 referencias em cor, em 102,27 s.
- Quatro fotos estavam em P&B e foram recusadas pelo limite documentado do piloto. O pacote antigo as contava como falhas; nao houve falha de decodificacao nesses quatro casos, pois a exclusao ocorreu antes da leitura.
- 960 parametros correspondem ao relatorio e ao snapshot do catalogo; 3.840 atributos correspondem ao relatorio. Todos os registros foram validados pelo contrato do importador.
- As seis referencias anteriores estao presentes neste lote. Deduplicacao confirmou 96 RAWs unicos no conjunto nativo, todos do mesmo trabalho.
- Nenhum novo modelo foi treinado ou ativado; nao houve escrita no catalogo/RAW nem upload. Hashes RAW sao os relatados pelo coletor, sem novo rehash independente na maquina de desenvolvimento.

Recibo em `evidence/native-hundred-reference-qa-20261029.json`. O primeiro dataset ja possuia 524 referencias em cor de outro trabalho, de um total de 546 com 22 P&B. Existem assim 620 exemplos em cor disponiveis em dois trabalhos, com origens distintas documentadas; isso nao muda os 432 exemplos usados no treino atual nem transforma os dados ja observados em um teste final intocado.

## Mudancas no nosso plugin

1. A coleta marca fotos P&B como `SKIPPED`, com motivo, sem ler o RAW. Elas aparecem como ignoradas no resumo; falhas de arquivo, dados ou camera continuam como falhas.
2. Coletas com referencias geram `references-package.zip`, contendo somente `references.jsonl`, `request.json`, `results.json` e `manifest.json`. O manifesto registra SHA-256 e tamanho de cada payload. Os arquivos contem caminhos privados e devem permanecer no uso pessoal/rede local.
3. O botao da janela revela o pacote. Se houver erro de empacotamento, os dados aprovados permanecem no JSONL e a janela permite revelar esse arquivo.
4. O importador aceita ZIP e JSONL. ZIPs sao lidos em memoria, sem extracao, com limite de tamanho, quatro membros exatos, CRC/hash e consistencia de contagem/identidade. Integridade nao equivale a assinatura/autenticacao do operador.

O pacote dos dados reais de 96 fotos tem 76.660 bytes. A pasta recebida tinha 18.306.397 bytes, incluindo JPEGs tecnicos, logs e prints. Nenhum pixel foi incluido no pacote reduzido. Esse pacote tambem foi importado junto ao JSONL anterior para confirmar a remocao das seis duplicatas.

56 testes Python/Lua passaram, incluindo export sem pixels, recusa de ZIP adulterado/membros extras, preservacao dos arquivos de origem, queda para JSONL, P&B sem leitura e revelacao do ZIP via SDK double. Os testes locais nao confirmam a nova janela no Lightroom real. O novo pacote precisa do teste nominal do usuario; a coleta antiga de 100 fotos ja tem evidencia nativa.

## Recursos de referencia e proximas etapas

Os prints mostram selecao por flags/cores/estrelas, cache configuravel, opcoes de GPU e automacoes. O inventario correspondente esta em `targets/neurapix/notes/01_overview.md`. Isso orienta fases reais: primeiro dados/precisao; depois previa e aplicacao reversivel; posteriormente ajustes de estilo, cor/curvas e selecao/automacoes com algoritmos proprios. Nenhum desses recursos passa a existir por acrescentar um botao.

Para prosseguir na precisao, basta uma nova coleta de 50 a 100 fotos aprovadas, variadas e de um terceiro trabalho. Ela deve ser reservada antes de novo ajuste de modelo, conforme o desenho de avaliacao. O primeiro trabalho e o de 24/10 ja foram examinados; nao sao testes finais intocados.

## Entrega

v0.7.0 (build 0012) foi gerado automaticamente pelos commits. ZIP de 43682533 bytes, SHA-256 `7042347eca87a114ccd5cc0c36e4313988d2553d1c41e8502bd3e7051e46557f`. O pacote final teve 1.624 hashes conferidos, nove fontes Lua compiladas sem execucao e testes reais de analise e coleta com runtime isolado/PATH restrito. A coleta de QA usou aprovacao simulada marcada como desenvolvimento, e nao foi importada como dado humano. O RAW permaneceu com o mesmo hash.

As duas copias de entrega foram conferidas por SHA-256: uma em Downloads/PLUGIN LIGHTROOM e outra no compartilhamento publico autorizado. Atualizar cadastrando a nova pasta .lrplugin, conforme LEIA-ME.md, e confirmar o botao Mostrar pacote de referencias no Lightroom 15.6.
