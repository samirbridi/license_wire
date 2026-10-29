# RAWs verificados e primeiro experimento local

Data: 2026-10-29, America/Sao_Paulo.

## Aquisicao

O usuario indicou ARQUIVOS, que foi localizado mas teve leitura negada inclusive no arquivo conhecido. A resolucao direta do nome historico apontou outro IP e o teste foi interrompido antes de conectar a ele. O usuario confirmou depois `\\192.168.1.58\2026-10-02 - formatura victoria`; esse compartilhamento permitiu listar e abrir os RAWs.

A pasta tem 2.755 CR3 e 613 XMPs. Foram selecionados somente os 546 arquivos com referencias aprovadas do catalogo. A leitura inicial de metadados sem fast2 excedeu 300 segundos; a tentativa foi preservada, sem RAWs copiados, em `private/raw-datasets/20261029T172244Z-60392161`. O leitor foi ajustado para lotes de 32, com campos de pareamento obrigatorios e timeout por lote.

Resultado final: 546 arquivos, 17.087.609.188 bytes, pares conferidos por nome/camera/captura com subseguundos antes da copia e depois no disco local. Os 546 hashes de copia passaram, as fontes permaneceram estaveis e os hashes locais nao mudaram com a decodificacao. Nenhum RAW ou XMP original foi escrito e nenhuma foto foi enviada a um provedor.

Dataset: `private/raw-datasets/20261029T172842Z-c6cf2182/`. `dataset.json`, `source-metadata.json`, `SHA256SUMS.txt`, `paired-features.jsonl` e `technical-inputs/` documentam a coleta. Os 22 exemplos P&B ficaram separados dos 524 em cor.

## Entrada tecnica e dependencias

LibRaw gerou sRGB em meia resolucao, usando WB da camera, sem auto-bright e sem aplicar os ajustes do catalogo. Foram extraidos 40 valores numericos de cor/luminancia, WB e exposicao de captura. Essa entrada e um dominio tecnico reproduzivel; nao reproduz perfis, curvas, mascaras ou a renderizacao Adobe. Um futuro motor deve manter o dominio consistente e validar os perfis no Lightroom.

Python 3.12.14, rawpy 0.27.1, LibRaw 0.22.1, NumPy 2.3.5 e Pillow 12.3.0. ExifTool 13.60 veio do repositorio oficial, commit `980409314fddbd83d9092b5c160fafab7f67fd52`, rodando com o Perl ja instalado junto do Git. Ambiente em `private/runtime/raw-pipeline/`; fontes/licencas ExifTool em `private/tools/exiftool/`. Lupa 2.8 foi acrescentado somente para QA de Lua 5.1. Pinagens em `scripts/requirements-raw.txt` e `scripts/requirements-qa.txt`.

Origens e hashes das ferramentas em `evidence/raw-runtime-20261029.json`. O pacote Lua nao redistribui essas dependencias. Documentacao primaria: [rawpy](https://letmaik.github.io/rawpy/api/rawpy.RawPy.html), [ExifTool](https://github.com/exiftool/exiftool).

## Experimento numerico

Regressao ridge por controle, com padronizacao e imputacao ajustadas somente no treino. A regularizacao foi escolhida em validacao interna anterior ao teste. Temperatura usa alvo logaritmico; previsoes sao limitadas a faixa observada no treino. Os parametros nao sao considerados aprovados para aplicacao automatica.

524 fotos em cor: 432 no treino e 92 no teste. O treino teve uma separacao interna de 312/120 para escolher regularizacao. Grupos de meia hora separam as faixas; teste nas duas ultimas faixas (23:00 e 23:30). E um unico trabalho de uma unica camera; essa divisao nao comprova desempenho entre eventos ou qualidade visual.

| Controle | Erro absoluto medio do piloto | Erro usando mediana de treino | Resultado neste teste |
| --- | --- | --- | --- |
| Exposicao | 0,247 EV | 0,349 EV | 29,2% menor |
| Temperatura | 403 K | 904 K | 55,4% menor |
| Contraste | 7,22 | 10,87 | 33,6% menor |
| Sombras | 3,14 | 3,93 | 20,3% menor |
| Pretos | 2,55 | 2,65 | 4,0% menor |
| Matiz | 2,12 | 1,36 | Pior que a mediana |
| Realces | 1,03 | 0,63 | Pior que a mediana |
| Brancos | 2,17 | 1,68 | Pior que a mediana |
| Saturacao | 0,50 | 0,39 | Pior que a mediana |
| Vibrance | 0,42 | 0,38 | Pior que a mediana |

A comparacao e com um valor fixo calculado no treino, nao com o produto Neurapix. O modelo nao foi promovido a edicao automatica. So exposicao, temperatura e contraste aparecem na extensao de comparacao. A escolha da interface nao transforma o teste em validacao final nem elimina os resultados ruins dos demais controles.

Artefatos privados: `pilot-models/20261029T174242827221Z/model.json`, `evaluation.json` e `holdout-predictions.jsonl` dentro do dataset. Resumo sem fotos ou nomes de clientes: `evidence/raw-acquisition-pilot-20261029.json`.

## Reproducao

```powershell
python .\scripts\prepare_raw_dataset.py --manifest .\private\snapshots\20261029-124518-192a6383\analysis\extraction-20261029T155812079523Z\candidate-settings.jsonl --event-root 3456 --original-root 'D:\2026-10-02 - FORMATURA VICTORIA' --share '\\192.168.1.58\2026-10-02 - formatura victoria' --perl 'C:\Program Files\Git\usr\bin\perl.exe' --exiftool .\private\tools\exiftool\exiftool
python .\scripts\train_numeric_pilot.py .\private\raw-datasets\20261029T172842Z-c6cf2182
python -m unittest discover -s .\scripts -p 'test_*.py' -v
```

Usar o Python do ambiente privado com as dependencias pinadas. Reexecutar a aquisicao cria outra pasta, sem apagar ou sobrescrever as anteriores. Os 22 testes Python/Lua passaram, alem da execucao real nos 546 RAWs. QA nativo e visual do plugin segue pendente.
