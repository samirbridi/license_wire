# Ambiente, olhos e atualizacao do candidato do acervo

Data: 2026-11-14, America/Sao_Paulo. Usuario confirmou modelo **Meu estilo — candidato do acervo** e motivo das 19 fotos nao niveladas: **Sem linhas ou referencias confiaveis**. Esse resultado indica recusa geometrica; nao demonstra interrupcao do lote. O defeito HasCrop/interrupcao de aplicacao foi tratado no ciclo anterior, nota 39.

## Evidencias e correcoes do aprendizado

No codigo anterior, train_candidate recusava novo treino quando nao havia trabalho inedito. Novas correcoes do mesmo trabalho podiam deixar o candidato antigo em uso. Alem disso, o model.json de uso era o proprio ajuste dos eventos de treino: o evento mais recente separado para avaliacao nunca entrava nos pesos distribuidos. Agora evaluation-model.json preserva o ajuste de avaliacao e model.json e reajustado com todas as referencias aprovadas dos trabalhos elegiveis (50+ por trabalho). Ainda sao necessarios tres trabalhos elegiveis. Revisoes de trabalhos conhecidos atualizam o candidato, sem declarar nova avaliacao independente; pesos anteriores permanecem em pastas imutaveis.

O hash do corpus inclui atributos, controles basicos, controles adicionais e aparencia. O status informa referencias utilizadas e candidato desatualizado. Avaliacoes identificam o arquivo/hash realmente avaliado; metricsApplyToCurrentWeights=false evita atribuir ao reajuste final as metricas do ajuste reservado. Testes verificam que o trabalho de avaliacao fica fora dos pesos avaliados e entra nos pesos de uso.

technical_render ja extraia atributos de pele, mas coleta/exportacao/importacao os descartavam. appearanceFeatures agora preserva apenas campos numericos conhecidos, limitados e finitos; referencias antigas permanecem compativeis. O treino pode usar RGB/razoes da pele junto aos atributos globais para Temperature/Tint, exigindo pelo menos 50 referencias completas nos subconjuntos internos e melhora de 5% no erro de validacao. Sem esses atributos na foto, a previsao usa exatamente o modelo global. Os demais controles nao sao modificados por esse caminho. A avaliacao reservada mede a rota efetiva com esse fallback; nao escolhe hiperparametros usando seus rotulos.

Nao foi aplicado deslocamento frio arbitrario. No Lightroom, elevar Temperature aquece a imagem: [documentacao Adobe](https://helpx.adobe.com/be_en/lightroom-classic/desktop/process-and-develop-photos/image-tone-color.html). A nota 32 recebeu errata: suas medidas eram do piloto antigo, nao do candidato atual do usuario. Nao ha evidencia para atribuir todo o amarelado atual a um unico fator. Modelo utilizado e deslocamento manual de temperatura aparecem no resumo da edicao.

O AppData da maquina de edicao nao estava acessivel pela rede (acesso negado); nao foram lidos nem alterados seu candidato, banco ou fotos dessa ocorrencia. As correcoes foram verificadas em fixtures de aprendizado e no codigo. Atualizar o plugin nao retreina silenciosamente: usar Treinar candidato agora aproveita dados salvos; para os atributos de pele antes descartados, recolher novamente referencias finais aprovadas.

## Nivelamento: resultado medido, sem promessa de cobertura

Cada RAW calculado com a opcao Nivelar foto ativa passa pela analise de linhas do ambiente e deteccao de olhos. YuNet e o modelo publico ja embarcado; nao ha download novo nem reconhecimento de identidade. Layout de landmarks conforme [OpenCV FaceDetectorYN](https://docs.opencv.org/doc/doxygen/html/df/d20/classcv_1_1FaceDetectorYN.html). Rejeitam-se rostos pequenos, fora da imagem, em perfil e com landmarks inconsistentes. Uma linha de olhos mede inclinacao da cabeca, nao gravidade. Olhos corroboram uma proposta de cena, mas nao autorizam sozinhos girar o ambiente.

Linhas horizontais/verticais distribuidas pela imagem sao consideradas, excluindo rostos. Tambem se estima um ponto de fuga vertical robusto, excluindo regioes aproximadas de pessoas. Essa estimativa fica **somente no diagnostico**: os resultados reais nao justificaram sua aplicacao automatica. Falha do detector facial nao impede a analise do ambiente. Os limites de corte existente, inclinacao intencional e restauracao permanecem.

Corpus: 546 linhas do mesmo evento; 544 com CropAngle aprovado. Primeiras 360 linhas (358 utilizaveis) para desenvolvimento; ultimas 186 reservadas ate congelar a decisao. Runtime embarcado OpenCV 4.13.0, hashes dos rotulos, fonte e YuNet nos JSONs. E uma comparacao dentro de um evento, nao validacao entre eventos nem QA visual nativo.

| Regra / conjunto | Propostas | Mais perto do fotografo | Mais longe | Erro absoluto medio |
|---|---:|---:|---:|---:|
| Anterior, desenvolvimento (358) | 11 | 8 | 2 | 0,8123 grau |
| Prototipo eixo unico + olhos, rejeitado | 21 | 10 | 10 | 0,821 aprox. |
| Prototipo perspectiva, rejeitado | 26 | 12 | 12 | 0,8352 grau |
| Final, desenvolvimento (358) | 11 | 8 | 2 | 0,8123 grau |
| Anterior e final, reservado (186) | 0 | 0 | 0 | 0,9961 grau |

"Mais perto" exige reduzir erro em >0,1 grau; "mais longe", aumentar em >0,2 grau. As categorias nao somam necessariamente todas as propostas. O angulo aprovado e referencia do fotografo, nao medida fisica absoluta de gravidade.

Evidencias: scene-eyes-development.json (primeiro prototipo), scene-eyes-perspective-development.json (segundo), scene-eyes-holdout.json (execucao reservada); scene-eyes-final-development.json e scene-eyes-final-holdout.json reaplicam a decisao final as medicoes preservadas. Depois do teste reservado, apenas os motivos foram refinados para nao chamar de conflito um eixo concordante mas insuficiente, nem sobrescrever ALREADY_LEVEL. Propostas e angulos nao mudaram. Os arquivos de replay declaram essa origem e nao fingem uma nova extracao.

**Cobertura continua baixa: 11/544, sem aumento comprovado.** A implementacao acrescenta analise/diagnostico de olhos e ambiente, mas nao resolve o nivelamento geral de fotos sem referencias confiaveis. Nao se afirma ter corrigido as 19 fotos do relato. Proximo passo fotografico requer examinar RAWs desse lote com nivelamentos aprovados; nenhuma politica mais permissiva foi promovida so para aumentar o contador.

O resumo agora distingue fotos analisadas, nivelamentos realmente confirmados, mantidas e falhas. Teste de fluxo completo: 20 selecionadas, uma proposta, 20 edicoes confirmadas, um nivelamento; demais motivos apresentados. Falha individual continua sem abortar o lote conforme nota 39.

## Comandos e verificacao

```powershell
$env:OPENBLAS_NUM_THREADS='1'; $env:OMP_NUM_THREADS='2'; $env:MKL_NUM_THREADS='1'
python -m unittest discover -s scripts -p 'test_*.py' -v
python -m unittest discover -s scripts -p test_scene_eyes.py -q
python -m unittest discover -s scripts -p test_learning_refresh.py -q
& 'private/deliveries/CRISPIX-0.25.0-build0039-2731bcbb/CRISPIX.lrplugin/Runtime/python.exe' -I scripts/evaluate_scene_eyes.py --dataset private/raw-datasets/20261029T172842Z-c6cf2182 --bundle private/deliveries/CRISPIX-0.25.0-build0039-2731bcbb/CRISPIX.lrplugin --start 0 --limit 360 --output evidence/scene-eyes-perspective-development.json
& 'private/deliveries/CRISPIX-0.25.0-build0039-2731bcbb/CRISPIX.lrplugin/Runtime/python.exe' -I scripts/evaluate_scene_eyes.py --dataset private/raw-datasets/20261029T172842Z-c6cf2182 --bundle private/deliveries/CRISPIX-0.25.0-build0039-2731bcbb/CRISPIX.lrplugin --start 360 --limit 186 --output evidence/scene-eyes-holdout.json
python scripts/evaluate_scene_eyes.py --replay-measurements evidence/scene-eyes-perspective-development.json --output evidence/scene-eyes-final-development.json
python scripts/evaluate_scene_eyes.py --replay-measurements evidence/scene-eyes-holdout.json --output evidence/scene-eyes-final-holdout.json
node scripts/version-from-commits.mjs --write
python scripts/build_lightroom_local.py --runtime-base private/runtime/culling-base-c75c76d3 --model-folder private/raw-datasets/20261029T172842Z-c6cf2182/pilot-models/20261111T214051736452Z --dataset private/raw-datasets/20261029T172842Z-c6cf2182 --manifest private/snapshots/20261029-124518-192a6383/analysis/extraction-20261029T155812079523Z/candidate-settings.jsonl
```

As execucoes historicas de prototipos refletem o hash de fonte registrado em cada arquivo; executar o codigo final nao reproduz a politica rejeitada. Suite completa: 219 testes aprovados em 151,447 s, evidence/qa-scene-learning.txt. Revalidacao final focada: 11 testes de ambiente/olhos e 4 de atualizacao do aprendizado aprovados. SDK simulado com Lua 5.1, nao Lightroom nativo. Nao foram usadas ferramentas de engenharia reversa binaria neste ciclo de implementacao propria.

## Entrega verificada

Versao calculada automaticamente: **v0.26.0 (build 0040)**, commit de origem `9b15b8f628755a9ee75892660a993752788f92ff`, recibo `evidence/release-build-0040.json`. ZIP local `private/deliveries/CRISPIX-0.26.0-build0040-800533cb/CRISPIX-0.26.0-build0040-motor-local.zip`, 84.055.445 bytes, SHA-256 `eb7d4f253c3e1720ae1fd7e18a5cfc57e8b6bd14b6f11b38de135dcd527720cf`.

Comando final: `python scripts/verify_editing_release.py --package private/deliveries/CRISPIX-0.26.0-build0040-800533cb/package.json --unit-tests-passed 219`. Aprovados: CRC, 1.748 hashes, 34 fontes Lua, runtime isolado, dois RAWs reais e edicao/restauracao pelo SDK simulado. Hashes dos RAWs intactos. Recibo `evidence/editing-plugin-qa-0040.json`. Piloto embarcado permanece inalterado; o candidato pessoal e atualizado na maquina de uso.

Verificacao adicional em banco temporario: tres trabalhos com 50 referencias, simulacao de candidato antigo substituindo model.json pelos pesos reservados sem metadados do pipeline novo e recalculando o hash do registro; Treinar candidato agora criou novo diretorio com 150 referencias, preservou os bytes anteriores e nao declarou nova avaliacao independente. Recibo `evidence/learning-legacy-candidate-migration.json`; nao usou banco do usuario.

Para adotar o ZIP local: fechar Lightroom, substituir a pasta CRISPIX.lrplugin no mesmo local e executar Treinar candidato agora. Aprendizado fica no AppData, fora do plugin. Novas coletas aprovadas sao necessarias para acrescentar os atributos de pele descartados antes. Nao houve publicacao online/rede nem alteracao da instalacao remota. QA visual e avaliacao das 19 fotos especificas continuam pendentes.


## Publicacao solicitada e concluida em 2026-11-14

Apos autorizacao explicita do usuario, publicado o mesmo ZIP 0040 (sem recompilar ou trocar seu hash). Site de origem conferido byte a byte contra a pagina publica antes do deploy. Staging em private/publication-0040/site contem index.html e latest.json em UTF-8 sem BOM, com downloadUrl publico do R2. Nenhum conteudo visual do site alterado.

Comandos de publicacao:

```powershell
npx --no-install wrangler@4.152.0 r2 object put crispix-updates/CRISPIX-0.26.0-build0040-motor-local.zip --file=private/deliveries/CRISPIX-0.26.0-build0040-800533cb/CRISPIX-0.26.0-build0040-motor-local.zip --content-type=application/zip --remote
curl.exe --fail --silent --show-error -A 'Mozilla/5.0' --max-time 300 -o private/publication-0040/download-verified.zip https://pub-739d5fceaa824a6c8c84e39bb74ec917.r2.dev/CRISPIX-0.26.0-build0040-motor-local.zip
npx --no-install wrangler@4.152.0 pages deploy private/publication-0040/site --project-name=crispixlr --branch=main --commit-dirty=true
```

Tamanho e SHA-256 do download foram comparados ao manifesto local antes de publicar o Pages. Deployment https://c14c1640.crispixlr.pages.dev. Canal de rede tambem atualizado: ZIP na subpasta da entrega e raiz, arquivos auxiliares e latest.json por ultimo; ambos os ZIPs conferidos por hash. Manifesto final https://crispixlr.pages.dev/latest.json lido por HTTP, JSON Python e Json.lua real no Lua 5.1; build 0040 confirmado. Pagina principal continua identica ao original. Recibo evidence/publication-0040.json. Fluxo de instalacao dentro do Lightroom ainda nao exercitado nativamente; nenhuma instalacao remota alterada.
