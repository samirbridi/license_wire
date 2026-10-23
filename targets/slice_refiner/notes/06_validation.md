# Validação local e limites das medições

QA completo no Wire: **PASS**, 23 verificações, relatório evidence/native-qa.json.
O ensaio usa cópias temporárias e restaura a fonte de desenvolvimento em finally.
As imagens de evidence/qa/ são saídas reais da GPU obtidas por HTTP, não desenhos simulados.
Verificações: recarga sem perda de nós/conexões; seis grupos de painel; alpha; canto TL sem alterar TR;
opacidade zero; grupo desativado; espessura zero; inset degenerado; raios extremos; fundo preto;
ramo SDF; feather; seis animações; coleções de 5/4/9/16 e isolamento de cor do grupo 2;
1080×1920 e 3840×2160. O caso base usa 1920×1080.

O primeiro QA revelou halo com stroke zero; o material passou a ser anulado nesse caso e o teste foi repetido.
Uma conexão HTTP também foi encerrada pelo editor durante a inicialização de uma cópia;
escritas idempotentes de constantes têm repetição limitada, registrada no JSON se ocorrer.
Falhas não são convertidas silenciosamente em sucesso.

Benchmark geométrico: scripts/benchmark_core.py, evidence/core-benchmark.json e evidence/benchmark-isolated.log.
GTX 1660 Ti, 4K, 16/64/144 retângulos arredondados, uma pipeline por patch, duas ordens alternadas,
cinco amostras NVIDIA por execução após aquecimento. Medida: ocupação da GPU inteira via nvidia-smi;
outros processos podem interferir. Não há medição de FPS ou tempo de GPU por processo.
Raios físicos equalizados: round_SDF = 4×raio_mundo/(largura_mundo+altura_mundo).
A IoU alpha binária de um retângulo foi aproximadamente 0,994; diferenças de rasterização permanecem.
O ensaio com as duas pipelines no mesmo grafo foi rejeitado e está em core-benchmark-mixed-invalid.json,
com valid_for_performance_comparison=false. Não usar esse arquivo como ganho de performance.

Compilação: **PENDENTE**. O recibo evidence/build-receipt.json registra comando, exit code, SHA-256,
versão do compilador, commit da fonte e equivalência do grafo serializado após compilar.
O ZIP de entrega exclui o original e sua fonte recuperada. A checagem de contêiner não demonstra playback.
Arena fechado na consulta ao conector; execução do `.cwired` no Arena, slices reais, rotação e sobreposição
no projeto de show, aprovação visual e painel físico permanecem pendentes.
