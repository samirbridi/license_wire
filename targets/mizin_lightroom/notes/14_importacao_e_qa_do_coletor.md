# QA nativo do coletor e importacao das referencias

O usuario mostrou diagnostico do build 0010 no Lightroom 15.6, analise de seis fotos sem falhas e coleta de seis referencias sem falhas. Os arquivos mencionados inicialmente nao estavam nos caminhos informados nem nas pastas compartilhadas. Depois da confirmacao do caminho local, `references.jsonl`, `results.json` e `results (1).json` foram encontrados em Downloads, copiados antes da analise e conferidos por SHA-256. Os originais permanecem preservados, sem escrita, em `private/incoming/`; hashes em `binaries/SHA256SUMS.txt`.

## Resultado confirmado

- `references.jsonl`: seis registros, 40 atributos por RAW e dez parametros atuais aprovados por registro.
- `results (1).json`: operacao collect, seis referencias e zero falhas, em 6,656 segundos.
- `results.json`: operacao analyze, seis resultados e zero falhas, em 6,792 segundos, sem atributos ausentes.
- Os seis hashes, caminhos, 60 alvos e 240 atributos correspondem entre o JSONL e os relatorios aplicaveis. Os 60 valores atuais tambem coincidem com o snapshot do catalogo.
- A aprovacao e declarada pelo fluxo nativo do produto. O importador verifica a declaracao e o contrato, sem afirmar autenticacao criptografica do operador ou novo rehash independente dos RAWs na maquina de desenvolvimento.

As referencias pertencem a um unico trabalho ja observado, de 24/10. Foi criado um dataset privado de seis referencias unicas. Nao houve novo treinamento nem ativacao de modelo. Recibo em `evidence/native-reference-import-qa-20261029.json`.

## Precisao observada nesta segunda coorte

| Controle | Diferenca absoluta media | Maior diferenca absoluta |
| --- | --- | --- |
| Exposicao | 0,372 EV | 0,574 EV |
| Temperatura | 511,82 K | 1.381,19 K |
| Matiz / Tint | 15,88 | 36,74 |
| Contraste | 12,09 | 19,00 |
| Sombras | 13,23 | 28,11 |

As seis fotos consecutivas nao sao benchmark independente, e suas metricas nao devem ser comparadas diretamente como se fossem a mesma coorte de cinco do primeiro teste. O funcionamento do coletor esta confirmado; a precisao do piloto ainda precisa de dados diversos e avaliacao separada.

## Importador

`scripts/import_approved_references.py` valida schemas/escopo, aprovacao declarada, camera, dominio, versoes, captura EXIF, campos numericos finitos, identidade do trabalho, UUID nativo e proveniencia do Lightroom. Preserva o export original e gera dados normalizados em uma pasta nova.

RAWs de mesmo SHA-256 e mesmos atributos/alvos/grupo sao deduplicados entre coletas. Conflitos de alvos, atributos ou evento para o mesmo RAW sao recusados; nao ha escolha silenciosa de uma revisao. Fixtures identificadas como desenvolvimento nao sao tratadas como exemplos humanos. Campos extras nao sao executados nem usados como instrucoes.

O relatorio registra contagens por trabalho, duplicatas e SHA-256 dos dados normalizados. A meta de coleta inicial e pelo menos tres trabalhos com 50 referencias unicas cada. Essa contagem e somente organizacao da coleta; nao treina, nao ativa modelo e nao aprova qualidade de producao. Mesmo ao atingir a meta, e necessario definir eventos de validacao/teste antes de escolher modelos ou hiperparametros.

51 testes da suite Python/Lua passaram, incluindo novos casos de preservacao dos exports, deduplicacao, conflitos de rotulos/grupo, NaN, schemas, aprovacoes e contagem sem treino/ativacao. Log em `evidence/qa-reference-import-suite.txt`.

Na raiz deste alvo:

```powershell
python .\scripts\import_approved_references.py --inputs 'caminho\references.jsonl' --model .\private\raw-datasets\20261029T172842Z-c6cf2182\pilot-models\20261029T174242827221Z\model.json
```

Esta ferramenta roda no desenvolvimento. O plugin instalado permanece **v0.5.0 (build 0010)**; nao foi gerado outro ZIP nem alterado o modelo. O proximo passo do usuario e continuar as coletas de 50 a 100 fotos variadas por trabalho e manter um arquivo/subpasta por coleta. O nome confirmado do trabalho deve permanecer igual entre suas varias coletas. Dados de trabalhos ainda nao examinados sao necessarios para uma avaliacao final separada.
