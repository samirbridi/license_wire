# Resultado do teste nativo e prioridade de precisao

O usuario forneceu tres screenshots do diagnostico e da janela de resultados. O diagnostico mostra explicitamente `v0.4.0 (build 0008)` em Lightroom 15.6, Python 3.13.14 isolado, rawpy 0.27.1, LibRaw 0.22.1, NumPy 2.3.5, Pillow 12.3.0 e ExifTool 13.60. A analise mostra cinco fotos calculadas, zero falhas e estado COMPLETED. Isso confirma o fluxo nominal de diagnostico, execucao do motor e exibicao dos resultados na maquina de edicao.

## Diferencas observadas

As linhas das duas capturas de resultados foram transcritas manualmente, com estas diferencas entre sugestao e valor lido no inicio:

| Controle | Media da diferenca absoluta | Maior diferenca absoluta |
| --- | --- | --- |
| Exposicao | 0,174 EV | 0,36 EV |
| Temperatura | 871,4 K | 1.665 K |
| Contraste | 6,76 | 10,6 |

As cinco temperaturas sugeridas ficaram acima da referencia. Em CRI_1506.CR3, a referencia mostrada e 3500 K e a sugestao e 5165 K. A sequencia e pequena e correlacionada: esses numeros descrevem os cinco valores arredondados exibidos e nao constituem um benchmark independente de qualidade ou avaliacao visual de imagens renderizadas.

## Relacao com o acervo aprovado

Os cinco nomes, combinados com os quinze valores atuais mostrados, coincidem de forma unica com cinco referencias do evento `2072046` no snapshot. Ha nomes repetidos em outros eventos, portanto o nome sozinho nao foi usado para associacao. Os valores atuais desse outro evento tambem diferem dos registros homonimos.

O evento associado nao faz parte do dataset de 546 referencias que treinou/testou o piloto. Essa correspondencia evidencia a limitacao de cobertura do modelo de um unico trabalho. Como os screenshots nao exibem os caminhos completos nem SHA-256 de origem, a associacao com o snapshot nao equivale a uma verificacao criptografica da identidade dos RAWs da tarefa. O results.json completo permitira conferir caminhos, hashes, dez controles, tempo e versoes efetivamente registrados pelo motor.

## Escopo do QA

- Confirmados: versoes do diagnostico, Python isolado, conclusao da analise, cinco resultados e janela de revisao no host.
- Ainda sem evidencia nativa: cancelamento durante execucao, reabertura do ultimo resultado e abertura da pasta pelo botao.
- Escrita/restauracao, copias virtuais e previa de imagem editada ainda nao sao implementadas neste pacote. As imagens ao fundo sao as fotos do catalogo e nao demonstram o estilo previsto aplicado.
- A aprovacao humana anterior das edicoes de outubro vale para as referencias; nao aprova as novas sugestoes.

O recibo e `evidence/native-selection-user-qa-20261029.json`. A transcricao privada tem hash em `binaries/SHA256SUMS.txt`. Os tres anexos estavam visiveis no chat, mas os caminhos locais mencionados em Downloads nao existem nesta execucao, inclusive apos busca pelos nomes/horarios. Portanto nao se afirma copia ou SHA-256 dos bytes originais dessas imagens. Essa limitacao esta explicita no recibo.

## Coleta necessaria e proxima evolucao

A leitura da pasta esperada de tarefas em `Users/Cris Bridi/AppData/Roaming/Adobe/Lightroom/MizinLightroomLocal/jobs` foi negada pelo SMB. Nao foram alteradas permissoes nem buscadas credenciais. O compartilhamento Public Documents usado para entrega continua acessivel; foi preparada a pasta vazia:

```text
\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot\Resultados-0008-20261029
```

Na maquina de edicao, usar Abrir pasta dos resultados, entrar na pasta da analise caso o Explorador a selecione no diretorio pai e copiar apenas `results.json` para essa pasta compartilhada. Isso fornece os valores completos sem transferir os RAWs ou JPEGs tecnicos. A lista de compartilhamentos foi consultada e filtrada pelo nome do evento associado; nenhum compartilhamento direto correspondente foi identificado. O acesso anterior negado a ARQUIVOS nao foi repetido.

A proxima evolucao deve coletar referencias aprovadas de varios trabalhos diretamente na maquina de edicao, com camera, identidade dos arquivos, atributos de entrada, parametros finais e agrupamento por trabalho. Separar eventos de avaliacao antes de escolher ou calibrar modelos. As cinco fotos exibidas devem permanecer registradas como observacao de QA; ajustar um deslocamento de temperatura somente contra elas e medir melhora nas mesmas cinco nao comprovaria generalizacao.

Esta etapa registra QA e diagnostico de precisao. Nenhum codigo, peso de modelo ou ZIP do build 0008 foi alterado; a instalacao atual pode ser mantida.
