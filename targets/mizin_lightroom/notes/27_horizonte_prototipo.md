# Horizonte — prototipo independente, nao entregue

Implementado scripts/horizon_analysis.py e seis testes sinteticos, executados com:

python -m unittest discover -s "D:/REA - ENGENHARIA REVERSA/targets/mizin_lightroom/scripts" -p "test_horizon_analysis.py"

Resultado: 6 testes passaram. Propostas exigem quatro segmentos longos, consenso angular ponderado >=80% e distribuicao vertical >=30%. Ausencia de linhas, conflito de perspectiva, linhas localizadas e inclinacoes fora de oito graus mantem o enquadramento. Toda resposta declara applyAutomatically=false.

Nao integrado ao motor/pacote. Nao validado com fotografias reais. Linhas de cenario nao provam horizonte verdadeiro. Sinal de CropAngle, orientacao EXIF, recorte seguro, composicao, preservacao de corte aprovado e restauracao nativa ainda precisam validacao. Nao afirmar correcao automatica disponivel.

Busca por nomes contendo neurapix dentro deste alvo nao encontrou arquivos. Nenhuma inspecao REA do plugin Neurapix executada; nao afirmar que SmartPreset foi analisado.

A base anterior scripts/develop_targets.py possui 31 controles adicionais e cinco testes, mas ainda nao esta integrada a coleta/importacao/treino/inferencia/Lua/build. Build distribuido continua 0027. Nenhuma alteracao em instalacao ou catalogo de producao.
