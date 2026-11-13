# Aprendizado experimental de controles adicionais

Integração iniciada: LocalAnalysis captura HSL/Texture/Clarity/Dehaze/curva parametrica presentes. local_engine valida e exporta extendedParameters separado dos dez campos basicos. Importador valida lista/faixas sem quebrar referencias antigas. learning_store inclui campos adicionais na identidade de revisao e hash de corpus, evitando ignorar correcoes humanas apenas em HSL.

Treino agora escreve extendedTargets com regressao por campo opcional, exigindo ao menos 50 rotulos em cada split (inner, validacao, treino e teste). Ausencia nao vira zero. Alpha escolhido apenas na validacao; limites e pesos derivados do treino. Metricas por campo no evento reservado. Candidato nao se ativa.

Verificacao: python -m unittest discover -s "D:/REA - ENGENHARIA REVERSA/targets/mizin_lightroom/scripts" -p "test_learning_store.py": 8 passaram, incluindo revisao somente em campo adicional e ausencia de rotulos de teste. Testes importacao anteriores: 6 passaram.

PENDENTE: extendedTargets ainda nao entra na inferencia nem aplicacao Lua; pesos reais nao retreinados; curvas de pontos/Color Grading/perfis nao integrados; horizonte/crop ainda prototipo; mascaras adiadas. Nao distribuido, VERSION continua pacote 0027. Nao declarar paridade Neurapix nem melhoria visual medida. Precisa auditoria de migracao de hashes historicos antes de distribuir banco atualizado.
