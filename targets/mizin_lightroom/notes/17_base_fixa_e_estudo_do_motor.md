# Base fixa do estilo a partir do acervo aprovado

Em 30/10/2026, a nova pasta do motor Neurapix foi estudada no alvo isolado targets/neurapix. Foram usados REA, Ghidra e leitores de dados; nao se incorporaram codigo, pesos ou recursos do fornecedor. A nota 06 daquele alvo e evidence/runtime-analysis-20261030.json distinguem os achados e as limitacoes.

O ganho imediato no nosso projeto e o extrator original scripts/extract_style_base.py. Ele trabalha sobre a exportacao privada do snapshot ja aprovado, sem abrir catalogos ativos ou pedir outra coleta de RAWs. A aprovacao humana foi confirmada pelo usuario anteriormente e registrada na exportacao; historico de um plugin, sozinho, nao serviria como aprovacao.

## Resultado real

Dos 3.601 registros, os 88 em P&B foram separados; restaram 3.513 fotos em cor, Canon EOS R6m2, originais, de oito raizes de trabalho, sem duplicatas de caminho. O perfil Look.Name e Adobe Color nas 3.513 referencias. A estrutura completa Look varia e, por isso, nao foi congelada nem substituida por um valor dominante.

Foram encontrados **22 campos presentes e exatamente iguais em todas as referencias elegiveis**, incluindo CameraProfile, ProcessVersion, curvas de tom e controles de color grading/split toning. As curvas observadas sao:

| Curva | Pares x/y observados |
| --- | --- |
| Global | (0,9), (37,39), (127,130), (255,247) |
| Vermelho | (0,0), (255,255) |
| Verde | (0,0), (255,255) |
| Azul | (0,3), (255,251) |

Isso e uma base estatica **parcial e descritiva** do gosto ja aplicado, nao um modelo treinado nem um preset Adobe pronto. CameraProfile sozinho nao reconstitui Look; os recursos correspondentes do Lightroom continuam necessarios. O Look nao foi exportado como LUT ou recurso proprietario.

Vinte e nove campos apresentaram mais de um valor observado, incluindo HSL, textura, nitidez, clareza/desembacar e a estrutura Look. Eles permanecem fora da base fixa. Campos ausentes nao viram zero, mediana ou padrao. A frequencia de um valor nao e regra suficiente para aplicar esse valor em todas as fotos. Tambem nao foram incluidos corte, geometria, lentes ou mascaras.

Artefatos privados: private/style-bases/20261030-approved-corpus-02/style-base.json e style-corpus-summary.json, com ponteiro latest.json. O recibo sem caminhos de clientes e evidence/style-base-extraction-20261030.json. O hash da exportacao de origem e registrado em ambos. Dados pessoais/modelos ficam fora do Git.

## Estado de integracao

O extrator e funcional e reproduzivel; a base foi efetivamente gerada do acervo. **Ela ainda nao e consumida pelo plugin/motor**, nao amplia as previsoes ativas e nao foi aplicada em fotos. O pacote instalavel entregue continua v0.8.0 (build 0013). Nao houve novo ZIP, novo treino numerico, ativacao, escrita no catalogo ou alteracao dos RAWs nesta etapa.

O resultado permite implementar a proxima representacao do estilo com duas partes: base artistica consistente (curvas/perfil/cor com escopo explicito) e ajustes variaveis calculados por foto. O estudo do nucleo do fornecedor sugere separacao de representacao base/cabeca, mas nao entrega seu treinador. Nosso piloto atual continua uma regressao de dez controles baseada em quarenta atributos; ele precisa evoluir em dados/representacao para avaliar rostos, conteudo e iluminacao de forma mais rica. Nao se declara paridade fotografica.

Antes de aplicar a base, a coleta SDK precisa preservar Look e os campos adicionais com identidade/proveniencia. A aplicacao futura precisa de copia virtual/snapshot/restauracao e validacao da renderizacao Adobe. Essa verificacao da implementacao propria nao pode ser substituida pela leitura de outro produto.

## Reproducao e QA

    python scripts/extract_style_base.py <candidate-settings.jsonl-do-snapshot> <nova-pasta-privada>
    python -m unittest discover -s scripts -p test_style_base.py -v

O destino deve ser novo; o script recusa sobrescrita. Tres testes passaram: extracao somente de unanimidade com presenca completa; exclusao de fotos sem aprovacao/P&B; deduplicacao, conflitos e numeros nao finitos. A execucao no acervo real produziu 22 campos, oito trabalhos e 3.513 referencias. Isso prova o processamento dos dados; nao prova resultado visual, generalizacao ou aplicacao no Lightroom.
