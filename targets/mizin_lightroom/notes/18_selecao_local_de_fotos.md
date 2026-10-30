# Selecao local: repetidas, nitidez e exposicao

Implementacao original solicitada em 30/10/2026. Nao usa executaveis, codigo ou pesos do Neurapix. O OpenCV CPU e o detector YuNet foram adquiridos de fontes publicas oficiais, com hashes verificados e licencas preservadas. O modelo de estilo numerico e a base fixa da nota 17 nao sao alterados/usados como classificador de qualidade.

## Fluxo implementado

Biblioteca > Extras de plug-in > **Mizin: selecionar fotos (repetidas e qualidade)** recebe ate 2.000 originais explicitamente selecionados. O dialogo permite escolher de uma a quatro fotos por grupo, com quatro como padrao. Usa a fila/motor local existente, progresso, cancelamento e resultados persistidos; **Mizin: ver ultima selecao de fotos** reabre esse resultado, mesmo depois de uma tarefa de aprendizado.

O motor suporta as extensoes RAW CR3/CR2/NEF/ARW/DNG/RAF/ORF/RW2/PEF/SRW via LibRaw, e JPEG/TIFF/PNG via Pillow. Isso nao garante suporte a todo modelo de camera ou variante do formato: indisponibilidade/erro de decoder aparece por arquivo. RAW real foi exercitado na Canon EOS R6m2; a selecao e independente da restricao de camera/cor do piloto de edicao. Copias virtuais sao recusadas. O original e analisado sem os cortes/ajustes atuais do Lightroom.

Cada arquivo e aberto somente para leitura, hashado antes/depois e conferido por tamanho/data. Os resultados contem identidade local do catalogo/foto e hash da fonte. Nao ha upload, remocao, movimento, mudanca de estrelas/bandeiras/cores ou de revelacao. O usuario pode criar **colecoes** depois de revisar o resumo; esse e o unico novo caminho de escrita no catalogo.

## Repetidas e variedade

1. SHA-256 identico identifica a mesma fonte; imagens tecnicas identicas so agrupam arquivos diferentes quando horario/pasta/camera tambem permitem a comparacao.
2. Para similares, exige mesmo escopo de pasta/camera/serial, relogios comparaveis e ate 45 segundos em relacao ao representante. Nao cria cadeias transitivas que engulam o evento. O trabalho deve ser analisado em um lote para comparar seus grupos entre si.
3. Usa descritores visuais, histograma, hash perceptual e verificacao geometrica. Quando existem rostos, normaliza a escala da regiao do grupo para comparar planos abertos/fechados. Exige suporte em pelo menos 70% das regioes de rosto/parte superior do corpo: o aniversariante comum, sozinho, nao deve juntar grupos de convidados diferentes.
4. Entre as alternativas sem risco severo sinalizado, prioriza qualidade e diversidade de orientacao horizontal/vertical e enquadramento relativo aberto/fechado. O enquadramento usa area ocupada pelos rostos; sem rostos, distancia focal e apenas uma aproximacao. Se todas apresentarem risco, preserva as melhores disponiveis **para revisao**.
5. Escolhe no maximo quatro (ou o limite menor escolhido). Identicas podem resultar em uma unica escolhida. O limite vale por grupo reconhecido neste resultado, nao por uma identidade de grupo humano comprovada nem por todas as analises anteriores.

Troca de pasta/camera, diferenca de contagem de rostos, dados ausentes, mudanca de cena/iluminacao ou pouca textura podem manter similares em grupos separados. Uma sugestao de grupo nao identifica nominalmente pessoas. Nao ha modelo de olhos fechados, expressoes ou ranking artistico nesta versao. Nenhuma classificacao e autorizacao para apagar o acervo.

## Nitidez e movimento

Mede detalhes de borda apos reducao leve de ruido. Em grupos, usa uma estatistica conservadora dos rostos avaliaveis, para nao aprovar apenas porque o fundo esta nitido. Sem rostos, considera regioes com textura. Rostos pequenos e superficies lisas recebem incerteza separada; profundidade de campo curta nao e automaticamente foto perdida.

O limiar do indicador relativo de borda e uma heuristica inicial, sem calibracao supervisionada no acervo. Ele sinaliza **possivel falta de foco ou movimento**, sem afirmar distinguir todas as causas. A primeira rodada de QA com decoracao mostrou sensibilidade excessiva; o limiar foi tornado conservador antes do empacotamento. Essas fotos sao dados de desenvolvimento, nao benchmark intocado nem prova de taxa de acerto.

## Exposicao e recuperacao

Em RAW Bayer, amostra o sinal real com passo impar para cobrir todas as fases CFA, normalizando pelos niveis de preto/branco da camera. Sinaliza saturacao extensa somente com evidencia tambem nos canais, para nao chamar a saturacao de um canal/luz colorida de perda total. Sinal proximo ao piso e imagem muito escura sao riscos distintos. A imagem linear auxilia a avaliacao e evita decidir apenas pela previa JPEG.

O resultado e **risco que exige revisao**, nao diagnostico de irrecuperabilidade: ruido, area importante da cena, intencao fotografica e revelacao Adobe ainda importam. JPEG/TIFF/PNG nao fornecem o sinal original do sensor e nao recebem um veredito de perda RAW. Nao foram implementadas mascaras de sujeito aplicadas ao sensor, medicao de SNR por camera ou recuperacao experimental no Lightroom.

## Colecoes e integracao SDK

O resultado permite criar um conjunto identificado pelo job sob Mizin - Selecao local, com as colecoes nao vazias:

- 01 - Escolhidas;
- 02 - Repetidas excedentes;
- 03 - Revisar foco ou movimento;
- 04 - Revisar exposicao;
- 05 - Revisar textura ou rostos pequenos;
- 06 - Falhas de leitura.

Qualidade pode sobrepor Escolhidas/Excedentes. Antes de qualquer escrita, confere catalogo, caminho e localIdentifier de todas as fotos processadas e o limite por grupo. Usa dois write gates: primeiro cria/commit as colecoes, depois adiciona fotos; isso evita depender da disponibilidade imediata de uma colecao recem-criada. Repetir uma organizacao concluida nao duplica conjuntos. Uma tentativa interrompida pode reaproveitar as colecoes do mesmo job, apenas acrescentando membros. Nao remove membros existentes.

Nao houve acesso ao catalogo ativo por SQLite/SMB. Os testes SDK sao doubles Lua 5.1, nao uma execucao nativa do Lightroom. A criacao/visualizacao das novas colecoes no Lightroom 15.6 permanece sem confirmacao neste computador de desenvolvimento.

## QA e reproducao

`evidence/qa-culling-suite.txt` registra a suite completa. Inclui cap/diversidade, duplicatas exatas, fundo comum/pessoa comum entre grupos, relogios/pastas diferentes, blur sintetico e textura, saturacao CFA, limites/cancelamento, erros serializaveis e isolamento de modelos. Os testes Lua verificam duas transacoes, identidade do catalogo/foto, sobreposicao de colecoes e ausencia de alteracao de flags/ajustes.

O runtime portatil foi exercitado com RAWs reais do acervo e repeticoes exatas controladas. O detector encontrou rostos em retratos e grupos; a comparacao aberta/fechada de um grupo foi inspecionada durante o desenvolvimento. Repeticoes introduzidas para QA e imagens sinteticas nao sao rotulos humanos de selecao nem entram no treino. O recibo do pacote final registra os numeros/hashes da ultima execucao e distingue testes tecnicos de qualidade fotografica.

    python -m unittest discover -s scripts -p test_*.py -v
    python scripts/prepare_culling_runtime.py

O preparador baixa o wheel OpenCV fixado do PyPI e YuNet do OpenCV Zoo com commit/oid Git LFS verificados. Cria um novo runtime, sem sobrescrever o anterior. O build usa a VERSION calculada por commits, o runtime indicado por private/runtime/latest-culling.json e o modelo numerico anterior. URLs/hashes/licencas acompanham THIRD-PARTY.json e PublicModels/YuNet/.

Fontes primarias: [OpenCV FaceDetectorYN](https://docs.opencv.org/4.x/df/d20/classcv_1_1FaceDetectorYN.html), [YuNet e licenca MIT](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet), [rawpy RawPy](https://letmaik.github.io/rawpy/api/rawpy.RawPy.html), [SDK Adobe](https://developer.adobe.com/lightroom-classic), [exemplo e ciclo de vida de colecoes no forum Adobe](https://community.adobe.com/questions-675/sdk-collection-are-not-updated-in-the-application-view-959272). O guia SDK oficial preservado localmente tambem documenta os objetos de colecao.
