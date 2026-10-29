# Resultados completos da execucao no Lightroom

O arquivo enviado pelo usuario foi lido em Downloads com 8.077 bytes. Relata o job `5F13B8F1-4A76-4CC7-936F-D1984168A9A9`, build 0008, Lightroom 15.6, cinco fotos calculadas, zero falhas e 5,31 segundos. O hash de modelo relatado corresponde ao modelo entregue. Todas as entradas estavam no dominio esperado, sem atributos ausentes, e o motor relata fontes estaveis e zero escritas/envios.

Os caminhos completos dos cinco RAWs correspondem ao evento 2072046 do snapshot, diferente do evento de treino. Os 50 parametros atuais coincidem com as referencias; os cinco SHA-256 RAW relatados nao aparecem nas 546 referencias originais. Isso cruza o conteudo do relatorio recebido; nao e um novo rehash independente dos RAWs na maquina de edicao.

## Diferencas absolutas medias nesta coorte

| Controle | Piloto | Mediana do treino |
| --- | --- | --- |
| Exposicao | 0,174 EV | 0,184 EV |
| Temperatura | 871,48 K | 1.132,50 K |
| Matiz / Tint | 10,86 | 2,80 |
| Contraste | 6,76 | 7,40 |
| Realces | 3,63 | 0,80 |
| Sombras | 1,92 | 2,60 |
| Brancos | 1,67 | 1,80 |
| Pretos | 0,79 | 1,20 |
| Saturacao | 0,69 | 0,60 |
| Vibracao | 0,24 | 0,20 |

Os cinco desvios de matiz e temperatura foram positivos. Nenhum dos 50 alvos atuais estava fora dos limites numericos observados no treino, portanto a cobertura insuficiente nao se resume a um alvo impedido pelo clipping dos limites. As metricas descrevem cinco fotos consecutivas, ja examinadas: nao validam generalizacao entre eventos nem qualidade visual. Nao escolher um novo modelo ou um deslocamento global usando estas cinco e depois apresenta-las como teste independente.

O novo screenshot mostra o comando antigo de comparacao das 92 previsoes salvas, com CRI_2024 e seguintes. O JSON e da analise nova de CRI_1502 a CRI_1506. Os dois comandos e os dois grupos de fotos sao distintos, como previsto no menu.

## Preservacao e limites

Os arquivos estavam disponiveis na primeira leitura. Quando a copia de preservacao foi tentada, os dois caminhos ja nao existiam em Downloads; a pasta de transferencia Public Documents tambem estava vazia. Nao e possivel afirmar SHA-256 dos arquivos recebidos. Foram preservados os dados relevantes lidos, com caminhos, parametros e hashes relatados, em uma coorte privada derivada. O recibo `evidence/native-results-qa-20261029.json` explicita esse limite; o hash da coorte derivada consta em `binaries/SHA256SUMS.txt`.

A proxima funcionalidade coleta atributos e ajustes aprovados diretamente na maquina de edicao. Assim o treino pode receber trabalhos variados mantendo os RAWs locais, com agrupamento por trabalho, deduplicacao posterior e avaliacao separada.
