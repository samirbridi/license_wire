# Aquisicao do catalogo e referencias de estilo

Data: 2026-10-29, America/Sao_Paulo.

## Resultado comprovado

| Verificacao | Resultado |
| --- | --- |
| Origem | Catalogo de outubro na maquina 192.168.1.58 |
| Autorizacao | Usuario informou Lightroom fechado e autorizou prosseguir |
| Snapshot | 20 arquivos, 1.851.905.958 bytes |
| Integridade | 20 hashes de origem durante copia iguais aos hashes locais |
| Consistencia | Lock/WAL/SHM ausentes antes/depois; fontes estaveis; handles recusando escrita |
| Banco SQLite | quick_check retornou ok; hash antes/depois da leitura igual |
| Imagens catalogadas | 37.871, incluindo 74 copias virtuais |
| Historico Neurapix SmartPreset | 3.728 passos em 3.601 imagens distintas |
| Exemplos extraidos | 3.601 arquivos distintos, oito raizes de trabalhos, Canon EOS R6m2 |
| Tratamento atual | 3.513 em cor; 88 em preto e branco |
| Erros de parser | Zero nos 3.601 exemplos atuais e seus passos historicos associados |
| Aprovacao de referencia | Usuario confirmou todas as edicoes de outubro revisadas/aprovadas |
| Pixels RAW lidos | Zero; imagens fora do compartilhamento atual |
| Modelo treinado | Ainda nao |

Os 33.687 DNGs apontados para downloaded-smart-previews e as copias virtuais nao foram misturados ao conjunto de exemplos fisicos com historico Neurapix. Os arquivos RAW sao referenciados no computador remoto, nao no disco D: da maquina de desenvolvimento.

## Campos recuperados

Exposicao, contraste, realces, sombras, brancos, pretos, saturacao, vibrance, HSL, curvas, enquadramento e referencias de CameraProfile/Look. Exposicao, contraste, Look e curva principal estao presentes em 3.601 exemplos; temperatura e matiz em 3.600. Valores ausentes nao foram substituidos por defaults presumidos.

O catalogo observado armazena `Adobe_imageDevelopSettings.hasDevelopAdjustments` como NULL nos candidatos. Esse cache nao foi usado para decidir se uma foto esta editada. As configuracoes atuais estao em `text`, serializadas como `s = {...}`. Passos de historico podem usar BLOB com quatro bytes de tamanho big-endian seguidos de zlib; o parser verifica o comprimento descomprimido e aceita somente literais de dados.

Os estados atuais foram separados dos estados serializados associados aos passos Neurapix. Diferencas entre eles nao provam revisao humana ou a semantica exata de antes/depois no historico. Para o futuro treino, usar a configuracao atual aprovada, com o historico apenas como proveniencia.

Numeros de `ProcessVersion` ou `Version` dos ajustes nao foram apresentados como versao do aplicativo Lightroom Classic. Os nomes internos do catalogo tambem nao garantem o mesmo contrato do SDK: mapear e validar no host antes de aplicar ajustes.

## Arquivos privados

- `private/snapshots/20261029-124518-192a6383/original/`: catalogo e companheiros preservados, copias marcadas ReadOnly.
- `snapshot.json` e `SHA256SUMS.txt`: recibo completo e hashes da coleta.
- `dataset-approval.json`: pergunta e resposta direta do usuario sobre revisao de outubro.
- `analysis/extraction-20261029T155812079523Z/candidate-settings.jsonl`: parametros atuais e historicos, arquivo/camera/evento, variante cor/P&B e aprovacao.
- `analysis/extraction-20261029T155812079523Z/summary.json`: contagens, cobertura e estatisticas privadas.
- `analysis/extraction-20261029T155812079523Z/queries.json`: consultas exatas do extrator.
- Descobertas exploratorias anteriores foram preservadas; a extracao acima e a que incorpora aprovacao humana e referencias Look.

Resumo sem nomes de clientes em `evidence/catalog-acquisition-20261029.json`. Hashes tambem indexados em `binaries/SHA256SUMS.txt`.

## Comandos reproduziveis

```powershell
pwsh -NoProfile -File .\scripts\Copy-LightroomSnapshot.ps1 -SourceDirectory '\\192.168.1.58\LR CATALOGOS\202610 - OUTUBRO' -CatalogName '202610 - OUTUBRO.lrcat'
python .\scripts\analyze_catalog.py .\private\snapshots\20261029-124518-192a6383
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\Test-LightroomSnapshot.ps1
python -m unittest discover -s .\scripts -p test_catalog_reader.py -v
```

Nesta sessao foi usado o Python 3.12.14 e SQLite 3.53.1 do runtime local do Codex. Os scripts Python usam somente a biblioteca padrao. Rodar o copiador novamente cria outra coleta; nao substitui o snapshot existente.

## Proxima etapa

Preflight posterior ao usuario informar compartilhamento pronto: `RAWReferencia` nao ficou disponivel na sessao SMB atual. `net view` listou um novo compartilhamento chamado `Upper West Perdizes`, mas a leitura retornou acesso negado. Nao concluir que esse compartilhamento corresponde ao trabalho de referencia. O caminho de rede exato exibido pelo Windows foi solicitado; nenhum RAW foi lido ou copiado.

As 546 referencias do primeiro trabalho nao apresentaram MD5, SHA-256 ou tamanhos nas tabelas `AgLibraryFile`, `AgLibraryFileAssetMetadata` e `AgLibraryFileDigest`. O pareamento nao pode depender apenas de nomes, que podem se repetir entre trabalhos. A faixa de captura do conjunto e 2026-10-02T18:57:55.400 a 2026-10-02T23:55:40.660, no horario armazenado, sem presumir fuso. Conferir mapeamento de pasta, camera e metadados de captura dos RAWs antes de formar pares; hashes calculados na coleta verificam integridade da copia, nao substituem prova de correspondencia com a edicao.

Obter acesso de leitura aos RAWs de um trabalho aprovado. Um primeiro conjunto disponivel no catalogo e a pasta remota `D:\2026-10-02 - FORMATURA VICTORIA`, com 546 referencias CR3 aprovadas. Compartilhar somente essa pasta com leitura, por exemplo como `RAWReferencia`, permite validar acesso e um primeiro lote sem expor o disco inteiro. Os outros sete trabalhos podem ser incorporados gradualmente.

Depois: validar perfis e renderizacao neutra consistente, confirmar informacoes de hardware e versao do Lightroom, preparar treino/teste separados por trabalho e por arquivo fisico, e implementar o primeiro plugin com ajustes reversiveis. Avaliar cor e P&B separadamente. Nenhuma velocidade ou qualidade equivalente ao Neurapix foi medida ou prometida.
