"""Build the private, portable local-inference plugin using the computed VERSION."""
import argparse
import hashlib
import json
import re
import shutil
import uuid
import zipfile
from pathlib import Path

from build_lightroom_pilot import lua_literal, saved_entries

ROOT = Path(__file__).resolve().parents[1]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def populate_engine(plugin, runtime_base, model_folder, version):
    """Also usable by tests without creating a released plugin/archive."""
    plugin, runtime_base, model_folder = map(Path, (plugin, runtime_base, model_folder))
    plugin.mkdir(parents=True, exist_ok=False)
    runtime = json.loads((runtime_base / 'runtime.json').read_text(encoding='utf-8'))
    shutil.copytree(runtime_base / 'Runtime', plugin / 'Runtime')
    shutil.copytree(runtime_base / 'Tools', plugin / 'Tools')
    sources = runtime_base / 'ThirdPartySources'
    if sources.exists():
        shutil.copytree(sources, plugin / 'ThirdPartySources')
    engine = plugin / 'Engine'
    engine.mkdir()
    for name in ('local_engine.py', 'run_local.py', 'learning_store.py','culling_engine.py'):
        shutil.copy2(ROOT / 'reconstructed/local-engine' / name, engine / name)
    for name in ('raw_features.py', 'train_numeric_pilot.py', 'import_approved_references.py', 'develop_targets.py', 'horizon_analysis.py'):
        shutil.copy2(ROOT / 'scripts' / name, engine / name)
    models = plugin / 'Models'
    models.mkdir()
    for source, destination in (('model.json', 'pilot-model.json'), ('evaluation.json', 'evaluation.json')):
        shutil.copy2(model_folder / source, models / destination)
    base_pointer=json.loads((ROOT/'private/style-bases/latest.json').read_text(encoding='utf-8'))
    base_path=Path(base_pointer['directory'])/'style-base.json'
    if sha(base_path)!=base_pointer['baseSha256']:raise ValueError('Fixed style base digest mismatch')
    base=json.loads(base_path.read_text(encoding='utf-8'))
    if base.get('schema')!='mizin-lightroom.fixed-style-base/1' or base.get('completeStyle') is not False or base.get('supportedTreatment')!='color':
        raise ValueError('Unsupported fixed style base')
    resource={key:base[key] for key in ['schema','sourceExportSha256','referenceCount','eventCount','supportedCameraModels','supportedTreatment','settings','completeStyle']}
    resource['usage']='OPTIONAL_CURVES_AND_TONING_ON_NEW_VIRTUAL_COPIES'
    (plugin/'StyleBase.lua').write_text('return '+lua_literal(resource)+'\n',encoding='utf-8')
    info = {'schema': 'mizin-lightroom.local-bundle/1', 'version': version,
            'styleName': 'Meu estilo - piloto de formatura', 'modelSha256': sha(models / 'pilot-model.json'),
            'experimental': True, 'catalogWritesImplemented': True, 'developSettingsWritesImplemented':True,'maximumPhotosPerJob': None,
            'virtualCopyEditingImplemented':True,'maximumPhotosPerEdit':None,'engineThreads':2,'enginePriority':'BELOW_NORMAL','editingOriginalsImplemented':False,
            'restoreVirtualCopyEditsImplemented':True,'nativeEditingWorkflowValidated':False,
            'styleBaseJsonSha256':sha(base_path),'styleBaseLuaSha256':sha(plugin/'StyleBase.lua'),
            'referenceCollectionImplemented': True, 'automaticModelTrainingImplemented': True,
            'automaticModelActivationImplemented': False, 'catalogCorpusCollectionImplemented': True,
            'userFeedbackImplemented': True,
            'referencePackageExportImplemented': True,
            'cullingImplemented':True,'cullingMaximumPhotosPerJob':2000,'cullingMaximumPerSimilarGroup':4,
            'cullingPhotographicQualityValidated':False,'cullingNativeCollectionsValidated':False,
            'cullingFaceModelSha256':runtime.get('publicCullingModel',{}).get('model',{}).get('sha256'),
            'nativeNewSelectionFlowValidated': False}
    if not info['cullingFaceModelSha256']:raise ValueError('Use the new culling runtime with the pinned public face model')
    shutil.copytree(runtime_base/'PublicModels',plugin/'PublicModels')
    (plugin / 'BuildInfo.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    components = {'schema': 'mizin-lightroom.third-party/1', 'downloads': runtime['downloads'],
                  'wheels': runtime['wheels'], 'sources': runtime.get('sources', []),
                  'runtimeCheck': runtime['runtimeCheck'],'publicCullingModel':runtime['publicCullingModel']}
    # Developer machine paths are intentionally omitted from the distributed metadata.
    (plugin / 'THIRD-PARTY.json').write_text(json.dumps(components, indent=2), encoding='utf-8')
    (plugin / 'THIRD-PARTY.md').write_text('''# Componentes de terceiros

O runtime Windows inclui Python (PSF), NumPy e suas bibliotecas, Pillow, rawpy/LibRaw, OpenCV headless (Apache 2.0 e avisos de terceiros) e ExifTool/Perl. O detector YuNet veio do repositorio publico OpenCV Zoo (MIT), com commit e hash verificados. Os avisos/licencas recebidos ficam junto aos respectivos componentes: Runtime/LICENSE.txt, Runtime/Lib/site-packages/*dist-info/, PublicModels/YuNet/ e Tools/ExifTool/. URLs e SHA-256 constam em THIRD-PARTY.json.

O arquivo Python ._pth isola o runtime: ele usa somente a biblioteca padrao embarcada, os pacotes fixados e a pasta Engine. O plugin nao depende do Python do sistema. O modelo de estilo e proprio, experimental e privado; o detector de rostos e publico. Nenhum codigo ou peso do Neurapix foi incluido.
''', encoding='utf-8')
    return info


def build(runtime_base, model_folder, dataset, manifest):
    version = (ROOT / 'VERSION').read_text(encoding='utf-8-sig').strip()
    match = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)', version)
    if not match:
        raise ValueError('Use the commit-derived project version')
    label = 'CRISPIX-' + '.'.join(match.group(i) for i in (1, 2, 3)) + '-build' + match[4]
    delivery = ROOT / 'private/deliveries' / (label + '-' + uuid.uuid4().hex[:8])
    plugin = delivery / 'CRISPIX.lrplugin'
    info = populate_engine(plugin, runtime_base, model_folder, version)
    template = (ROOT / 'reconstructed/lightroom-pilot/Info.local.lua.template').read_text(encoding='utf-8')
    for key, value in {'__MAJOR__': match[1], '__MINOR__': match[2], '__PATCH__': match[3],
                       '__BUILD__': match[4], '__DISPLAY_VERSION__': version}.items():
        template = template.replace(key, value)
    def brand(text):
        return text.replace('Mizin Lightroom', 'CRISPIX').replace('Mizin:', 'CRISPIX:').replace('Mizin -', 'CRISPIX -')
    (plugin / 'Info.lua').write_text(brand(template), encoding='utf-8')
    for source in (ROOT / 'reconstructed/lightroom-pilot').glob('*.lua'):
        (plugin / source.name).write_text(brand(source.read_text(encoding='utf-8')), encoding='utf-8')
    shutil.copytree(ROOT / 'reconstructed/branding/plugin-assets', plugin / 'Branding')
    # Copy the updater scripts directly into the plugin root, so CheckUpdates.lua can reveal
    # them via LrShell and the user can run them directly from inside the plugin folder.
    for name in ('Atualizar-CRISPIX.cmd', 'Update-CrispixPlugin.ps1', 'Launch-CrispixUpdate.py'):
        shutil.copy2(ROOT / 'scripts' / name, plugin / name)
    entries = saved_entries(dataset, manifest, model_folder)
    (plugin / 'PilotData.lua').write_text('return ' + lua_literal({
        'schema': 'mizin-lightroom.saved-pilot/1', 'version': version, 'automaticEditing': False, 'entries': entries}) + '\n', encoding='utf-8')
    readme = f'''# CRISPIX - motor local experimental

## {version}: candidato atualizado e analise do ambiente e dos olhos

Use Treinar candidato agora depois de atualizar para aproveitar as correcoes do
aprendizado com as referencias ja salvas. Veja abaixo Aprendizado e nivelamento
desta entrega. O nivelamento segue conservador e nao corrige todas as fotos.

### Atualizacao dentro do Lightroom e lotes resistentes a falhas

No menu Arquivo > Extras de plug-in > CRISPIX, use VERIFICAR ATUALIZACOES.
O Gerenciador de plug-ins tambem tem um botao. Ao encontrar uma versao nova,
Atualizar agora baixa e valida o pacote, fecha o Lightroom de forma limpa e o reabre.
Conclua a janela de backup do catalogo quando ela aparecer. A politica de scripts
e ajustada somente para o processo do atualizador, sem alterar a configuracao do Windows.

Uma falha de aplicacao numa foto fica registrada e o lote segue para as demais.
O resumo distingue edicoes confirmadas, falhas e horizontes realmente aplicados.
HasCrop deixou de ser exigido na leitura do SDK; os cinco controles numericos
do corte continuam conferidos. Fotos sem linhas confiaveis conservam o corte.
Confira fotos com falhas (podem ter ajustes parciais); RESTAURAR ULTIMA SESSAO
continua disponivel e preserva alteracoes posteriores feitas pelo fotografo.

## Build 0038: atualizacao pela internet funcionando de verdade

O arquivo de versao publicado no site saia com uma marca invisivel (BOM) que nem o plugin nem o atualizador conseguiam ler; por isso "Verificar atualizações" e o Atualizar-CRISPIX.cmd sempre recorriam a rede local, e fora dela diziam que nao havia conexao. O site agora publica o arquivo sem essa marca e o plugin/atualizador passaram a aceita-la de qualquer forma. Inclui todas as mudancas do build 0037 abaixo.

## Build 0037: enquadramento corrigido e analise mais rapida

Endireitar horizonte: o corte gravado no Lightroom estava na convencao errada. O Lightroom guarda o corte inclinado como os dois cantos (superior-esquerdo e inferior-direito) do retangulo girado, sempre na orientacao do sensor (mesmo em fotos verticais). Conferido contra 127 endireitamentos feitos pelo proprio Lightroom no seu catalogo aprovado: a formula nova bate em 111 (as outras 16 foram apertadas a mao depois). O sinal do angulo tambem foi confirmado com fotos reais (8 de 9 concordam). A edicao automatica por pasta vigiada agora respeita a opcao "Endireitar horizonte" salva (antes era sempre desligada).

O detector continua conservador de proposito: em 544 fotos suas, ele propoe em cerca de 2% delas, chegando mais perto do seu angulo em 8 e se afastando em 2 (antes: 6 e 4). Ele agora so aceita a inclinacao quando as linhas verticais (paredes, portas, colunas) nao contradizem as horizontais, e ignora inclinacoes acima de 5 graus (provavelmente intencionais). A maioria das fotos de evento continua sem endireitamento automatico: a mensagem final diz o motivo de cada uma.

Velocidade: a leitura de metadados usa um unico ExifTool aberto durante todo o trabalho, em vez de abrir um por foto (medido: 1,78 s -> 0,20 s por foto, resultados identicos). Em 500 fotos isso economiza cerca de 13 minutos.

Atualizador: espera ate 3 minutos o Lightroom fechar (backup do catalogo) e nunca forca o encerramento sem perguntar; antes forcava apos 15 segundos.

TESTE no Lightroom: endireite uma foto claramente inclinada em NOVA COPIA e confira que o resultado fica nivelado e sem cantos vazios. Se ficar mais torto, use Restaurar ultima sessao e avise.

## Build 0036: atualizacao tambem funciona pela internet (nao so na rede local)

A verificacao de atualizacao ("Verificar atualizações" no menu) agora tenta primeiro o site https://crispixlr.pages.dev -- funciona de qualquer lugar com internet, nao precisa mais estar na mesma rede local da maquina de publicacao. Se a internet estiver fora, cai automaticamente para a pasta de rede de antes, sem precisar fazer nada. O pacote em si (~84MB) fica hospedado num bucket publico da Cloudflare (R2); o site so guarda um arquivo pequeno (latest.json) apontando para ele.

`Atualizar-CRISPIX.cmd`/`Update-CrispixPlugin.ps1` seguem a mesma logica: baixam da internet quando possivel, da rede local quando nao. A integridade do pacote continua validada por hash SHA-256 antes de qualquer instalacao, nos dois canais.

Para quem publica uma nova versao: `Publish-CrispixBuild.ps1` agora publica nos dois canais de uma vez (rede local + internet), confirmando a integridade em cada um antes de considerar concluido. Use `-SkipInternet` para publicar so na rede local se preferir.

## Aprendizado e nivelamento desta entrega

Depois de atualizar, use FERRAMENTAS E APRENDIZADO > Treinar candidato agora com o que ja foi aprendido. O candidato passa a incluir todas as referencias aprovadas elegiveis, inclusive as mais recentes. Corrigir e reaprender fotos do mesmo trabalho tambem permite atualizar o candidato. A avaliacao em trabalho reservado fica registrada separadamente; atualizar pesos com referencias conhecidas nao representa uma nova avaliacao independente.

Novas coletas preservam atributos de tom de pele. Com cobertura suficiente por trabalho e melhora medida na validacao interna, o treino usa esses atributos em Temperatura/Matiz. Referencias antigas continuam validas, mas precisam ser coletadas novamente para ganhar esses atributos. Nao ha deslocamento frio fixo imposto a todas as fotos. Confira o modelo e qualquer ajuste fino de temperatura indicados no resumo da edicao.

Com Nivelar foto ligado, cada foto e analisada: linhas horizontais/verticais do ambiente e olhos detectados. Olhos sao apoio; cabecas inclinadas, perspectiva e ausencia de linhas ainda podem impedir o nivelamento. O resumo separa fotos analisadas de nivelamentos confirmados e apresenta motivos. Esta entrega nao promete nivelar todas as fotos: criterios que aumentavam a cobertura mas pioravam os resultados foram recusados nos testes. Falhas individuais continuam sem interromper o restante do lote, com registros para restauracao.

## Build 0035: atualizacao automatica (sem reinstalar manualmente)

Responde a pedido direto: atualizar sem ter que remover/adicionar o plugin no Gerenciador toda vez.

**Dentro do Lightroom:** FERRAMENTAS E APRENDIZADO > "Verificar atualizações" consulta o canal de publicacao na rede (`\\\\192.168.1.58\\Users\\Public\\Documents\\MizinLightroomPilot\\latest.json`) e compara com a versao instalada. Se houver uma mais nova, avisa e oferece abrir a pasta com o atualizador de um clique. Se ja estiver atualizado, so confirma. Se a rede estiver fora, avisa sem travar.

**Atualizador de um clique:** dois arquivos novos ja incluidos dentro da propria pasta do plugin -- `Atualizar-CRISPIX.cmd` (clique duplo) chama `Update-CrispixPlugin.ps1`, que: confere o hash SHA-256 do pacote antes de tocar em qualquer coisa; fecha o Lightroom se estiver aberto (pede confirmacao se nao fechar sozinho); faz backup da instalacao anterior; extrai a nova versao NO MESMO LUGAR da instalacao (pasta fixa, sem duplicar nem precisar re-cadastrar no Gerenciador de plug-ins); e oferece reabrir o Lightroom ao final. Em caso de qualquer falha, restaura o backup automaticamente.

**Publicacao (lado do desenvolvimento):** `scripts/Publish-CrispixBuild.ps1` copia o ultimo pacote gerado por `build_lightroom_local.py` para o canal de rede e atualiza o `latest.json`, validando o hash no destino antes de finalizar. `build_lightroom_local.py` agora grava esse `latest.json` automaticamente a cada build.

**O que NAO muda:** seus dados de aprendizado, referencias aprovadas e registros de edicao continuam em `%AppData%\\MizinLightroomLocal\\`, fora da pasta do plugin -- nunca sao tocados pelo atualizador, em nenhum cenario (sucesso, falha ou restauracao de backup).

## Build 0034: aprender a partir de uma colecao escolhida

Novo em FERRAMENTAS E APRENDIZADO: "Aprender com colecao" abre um seletor com TODAS as colecoes do catalogo (incluindo as que estao dentro de conjuntos de colecoes, mostradas com o caminho completo, ex.: "CRISPIX - Edicao automatica / Auto 2026-11-07"). Util quando voce ja separa manualmente, numa colecao propria, so as fotos realmente editadas e escolhidas (diferente do catalogo inteiro, que tambem tem as nao escolhidas). Ao contrario de "Registrar evento concluido" (que exige que a selecao seja de um unico trabalho), uma colecao pode reunir fotos de varios trabalhos de uma vez — o aprendizado aceita isso normalmente. As fotos da colecao escolhida passam pela MESMA confirmacao e fila em lotes de 25 ja usada pelos outros dois modos (catalogo inteiro, evento). Repita o comando para aprender com outra colecao depois.

## Build 0033: treino sob demanda, enquadramento com tolerancia e inicio do tom de pele

ONDE FICAM SEUS DADOS (pergunta recorrente): nada do que voce ja coletou, aprovou ou treinou fica dentro da pasta .lrplugin. Referencias aprovadas, fila do acervo, candidatos treinados e registros de edicao/restauracao ficam todos em `%AppData%\\MizinLightroomLocal\\` (fora da pasta do plugin). Trocar a instalacao (apagar a pasta .lrplugin antiga e adicionar a nova) NAO apaga nada disso; e seguro atualizar assim sempre que houver uma nova versao. So apague manualmente essa pasta de dados se quiser mesmo recomecar o aprendizado do zero.

Aprendizado sob demanda: FERRAMENTAS E APRENDIZADO ganhou "Treinar candidato agora com o que ja foi aprendido". Antes, o treino do candidato SO rodava automaticamente quando uma fila inteira de "Aprender com catalogo" terminava de processar TODAS as fotos (pode ser milhares, em lotes de 25); se voce tem 3+ trabalhos com 50+ fotos cada ja registrados mas a fila ainda nao terminou (ou foi interrompida), o treino nunca disparava, mesmo com dados mais que suficientes ja salvos. O novo comando dispara o treino imediatamente com o que ja esta salvo, sem depender de nenhuma fila terminar. Use FERRAMENTAS E APRENDIZADO > Ver aprendizado para confirmar quantos trabalhos/referencias ja existem antes de treinar.

Enquadramento (horizonte): investigando por que nao funcionou nem em fotos novas sem edicao previa, medimos no catalogo real (3.601 fotos) que NENHUMA foto, nem a recem-importada, chega ao Lightroom com corte perfeitamente zerado -- toda foto carrega uma margem residual minuscula (correcao de lente, perfil da camera). O codigo exigia corte EXATAMENTE zerado antes de tentar endireitar, o que bloqueava 100% das fotos reais, sempre, independente de terem sido editadas antes. Agora tolera uma margem pequena (ate 5% de posicao, ate 0.5 grau de angulo residual) antes de considerar que ha um recorte deliberado a preservar. Tambem passamos a dizer o motivo exato quando uma foto NAO e endireitada (ex.: "sem linhas de horizonte confiaveis", "corte existente alem da tolerancia foi preservado"), em vez de só um total agregado.

Tom de pele (inicio): adicionada a extracao de uma amostra de cor de pele por foto (reaproveitando o MESMO detector de rosto publico ja usado na selecao, YuNet/OpenCV Zoo — nenhum modelo novo foi adicionado). Medido em 186 fotos reais aprovadas: a razao vermelho/azul da pele tem correlacao de -0.73 com a Temperatura aprovada pelo fotografo -- um sinal bem mais forte que qualquer estatistica da foto inteira ja usada. Por enquanto isso so ALIMENTA o conjunto de atributos tecnicos (nunca se torna um ajuste nem e obrigatorio: fotos sem rosto detectado ficam sem essas colunas, nunca com um valor inventado); nenhum modelo ainda foi treinado usando essa informacao. Collect/aprendizado continuam identicos; o motor so aceitara aplicar essa pista assim que um modelo novo for treinado com ela.

## Build 0032: janela compacta, horizonte em edicao direta e correcoes de treino

EDITAR FOTOS: a janela agora rola internamente (cabe em telas 1080p; nada fica cortado). O texto do bloco AJUSTE FINO DO ESTILO deixa explicito que esses campos NAO sao o ajuste calculado por foto (isso o modelo ja faz sozinho, sem abrir esta janela): eles somam o MESMO deslocamento extra a TODAS as fotos da edicao atual e ficam salvos para a proxima vez, ate voce mudar ou apertar "Zerar ajuste fino".

Horizonte: duas correcoes.
1. O detector (scripts/horizon_analysis.py) foi recalibrado contra 102 imagens tecnicas reais preservadas de analises anteriores: os limiares antigos nunca geravam proposta em nenhuma delas (um deles, o espalhamento vertical minimo, era quase impossivel de atingir por construcao geometrica para uma linha quase nivelada). Continua conservador por desenho (poucas fotos reais tem consenso suficiente); so nao fica mais travado em zero.
2. "Endireitar horizonte quando houver linhas confiaveis" ficava sempre desligado ao aplicar Na selecao atual (sem duplicar) -- que e o UNICO modo usado pelo item de menu real EDITAR FOTOS. Ou seja, essa opcao nunca podia ter efeito no uso normal do plugin. Agora funciona nos dois destinos (selecao atual e novas copias): o corte usa a mesma restauracao exata de antes/depois que todo outro controle de edicao direta ja usa. So a mascara de pessoa/ceu continua exigindo nova copia (ela depende de applyDevelopPreset, que so e seguro aplicar numa copia nova).

Treino numerico: a busca do fator de regularizacao (alpha) usava uma grade grosseira de so tres valores (1, 10, 100); ampliada para sete valores (0.3 a 300), ainda escolhidos somente pela validacao interna, nunca pelo teste. No dataset real de 524 referencias em cor, isso melhorou Temperature, Highlights, Whites, Blacks e Saturation sem piorar nenhum alvo de categoria (melhor/pior que a mediana identico ao modelo anterior).

Sobre fotos muito amareladas que parecem nao corrigir o suficiente: medido diretamente no conjunto de teste real, o modelo sub-corrige consistentemente as fotos mais quentes (vies medio de aproximadamente +300 K nos 25% de temperatura mais baixa) e exagera a correcao nas mais frias (vies de aproximadamente -570 K nos 25% mais altos) -- um padrao classico de regressao-a-media. A correcao de alpha ajuda pouco nesse vies especifico (+301K passou para +295K): a causa principal e o modelo ter sido treinado em um UNICO evento/trabalho, sem variedade suficiente de cenas muito quentes. Isso nao e um bug de codigo corrigivel agora; precisa das novas referencias variadas (incluindo fotos de ambientes bem amarelados) que voce esta preparando.

## Build 0031: edicao automatica por pasta vigiada

FERRAMENTAS E APRENDIZADO > Edicao automatica (pasta vigiada). Selecione uma foto da pasta que recebera as importacoes e ligue. A partir dai, a cada minuto: fotos NOVAS (importadas depois de ligar) sao editadas diretamente, com as opcoes salvas da ultima janela EDITAR FOTOS (estilo, intensidade, ajuste fino, preset, equilibrio de WB). O plug-in espera a importacao terminar e os ajustes ficarem estaveis; foto que voce alterar antes disso nunca e editada automaticamente. Fotos antigas, movidas para a pasta, copias virtuais e nao-CR3 sao ignoradas. Sua selecao e o modulo atual nao mudam; cada lote vai para a colecao CRISPIX - Edicao automatica e pode ser desfeito com RESTAURAR (ultima sessao). Erros pausam a vigilancia. Horizonte e mascaras nao entram no automatico (exigem novas copias).

Teste sugerido: ligue numa pasta de teste, importe 3 a 5 CR3 descartaveis e aguarde 2 a 3 minutos.

## Build 0030: horizonte, mascaras adaptativas e P&B

EDITAR FOTOS (somente em novas copias): "Endireitar horizonte" detecta linhas quase horizontais consistentes no RAW e aplica angulo com o maior corte centralizado sem cantos vazios; fotos com corte existente ou sem linhas confiaveis ficam intocadas. "Mascara de pessoa/ceu" aplica um preset ADAPTATIVO do proprio Lightroom (a IA de mascaras e da Adobe); presets sem mascaras sao recusados antes de qualquer alteracao.

P&B: a coleta e o aprendizado do catalogo agora aceitam fotos P&B como variante separada, com o mixer de cinza. O modelo P&B so existe depois de tres trabalhos com 50 referencias P&B aprovadas cada (ver FERRAMENTAS > Ver aprendizado). Sem esse modelo, fotos P&B na edicao aparecem como nao calculadas e ficam intocadas.

TESTE OBRIGATORIO do horizonte: use uma foto claramente inclinada em nova copia. Se a correcao dobrar a inclinacao em vez de corrigir, o sinal do angulo precisa ser invertido (avise o desenvolvedor) e use Restaurar ultima sessao. Teste tambem se o painel Mascaramento mostra a mascara criada pelo preset adaptativo.

## Build 0029: ajuste fino do estilo e correcoes

Novo na janela EDITAR FOTOS: intensidade da edicao (mistura a sugestao com o valor atual), ajuste fino somado ao modelo (exposicao, temperatura, matiz, contraste, realces, sombras, brancos, pretos, saturacao, vibratilidade, textura, claridade, desembacar), preset complementar do Lightroom (nunca altera corte, mascaras, retoques nem versao de processo; o modelo prevalece nos controles que calcula) e equilibrio opcional de balanco de branco entre fotos da mesma sequencia (ate 30 s entre disparos; exposicao continua por foto). As escolhas ficam salvas para a proxima edicao.

Correcoes: JPEG/DNG/outros formatos na selecao sao ignorados com aviso em vez de abortar tudo; se algumas fotos nao puderem ser calculadas, o plug-in pergunta se continua com as calculadas; o aprendizado do catalogo agora envia HSL, textura, claridade, desembacar e curva parametrica e detecta alteracao desses controles depois da aprovacao; o motor que encerra sem resultado gera erro em segundos em vez de aguardar o tempo limite; restauracao direta registra problemas em disco.

Teste sugerido: cinco fotos descartaveis em novas copias, primeiro com ajuste fino zerado, depois com intensidade 70% e um preset simples (ex.: granulacao); conferir Restaurar ultima sessao. O modelo numerico permanece o mesmo piloto; qualidade fotografica ainda nao homologada.

## Build 0028: teste da coleta ampliada

Objetivo deste pacote: coletar referencias aprovadas com ate 31 controles adicionais (HSL, textura, claridade, desembacar e curva parametrica). O modelo incluido permanece o piloto anterior de dez controles; instalar esta versao NAO melhora automaticamente temperatura ou estilo. Curvas de pontos aprendidas, Color Grading aprendido, horizonte automatico, crop inteligente e geracao de mascaras NAO estao implementados.

Teste inicial: apos instalar em pasta nova, execute FERRAMENTAS E APRENDIZADO > diagnostico. Selecione cinco CR3 originais EM COR com edicoes finais aprovadas e execute a coleta de referencias aprovadas. A coleta nao altera revelacao. Confira references.jsonl: extendedParameters deve conter os controles disponiveis. Depois colete ao menos 50 referencias variadas de cada um de tres trabalhos. Nao use resultados do CRISPIX sem sua revisao como aprovacao. Candidatos nao sao ativados automaticamente. Preserve instalacao anterior e registros de recuperacao.

Os detalhes historicos abaixo descrevem tambem funcoes anteriores; onde mencionarem coleta somente de dez controles, a coleta ampliada acima e a atualizacao desta build.


Versao: {version}

NOVO: Mizin: editar selecao na grade (sem duplicar) altera diretamente os itens selecionados, sem criar colecoes/copias ou selecionar foto por foto. Primeiro teste cinco fotos. O menu de restaurar ultima edicao atende tambem este modo: registro local dos ajustes anteriores, sem snapshot Adobe; mudancas manuais posteriores bloqueiam restauracao automatica. Aplicacao parcial por erro exige recuperacao manual pelo registro. Modelo numerico permanece igual, com valores absolutos: nao corrige automaticamente tendencia de exposicao/temperatura. Ainda le RAW, NAO usa Smart Previews. P&B fica preservado, sem aprendizado novo. Fluxo novo ainda exige homologacao nativa.

Este pacote oferece selecao local de fotos, aprendizado e edicao experimental em novas copias virtuais. Inclui Python, rawpy/LibRaw, OpenCV, detector publico de rostos e ExifTool. Processamento e resultados ficam na maquina de edicao. O modelo padrao continua o mesmo piloto de dez controles, treinado em um unico trabalho. O candidato do seu acervo pode ser escolhido quando estiver treinado. Nao ha equivalencia de qualidade comprovada com o Neurapix.

## Atualizar a instalacao

1. Feche o Lightroom e extraia TODO o ZIP em uma pasta nova e permanente, por exemplo Documentos/MizinLightroom/{label}. Guarde a pasta anterior para recuperar o piloto antigo.
2. Abra o Lightroom e entre em Arquivo > Gerenciador de plug-ins. Selecione o piloto antigo e remova seu cadastro com Remover; os arquivos recebidos e o acervo devem ser preservados. Adicione a NOVA pasta MizinLightroom.lrplugin. Os pacotes usam o mesmo identificador, portanto mantenha uma instalacao ativa.
3. Execute Biblioteca > Extras de plug-in > Mizin: diagnosticar motor local. O resultado deve informar as versoes de Python, rawpy, LibRaw, NumPy, Pillow, OpenCV, ExifTool e Lightroom, com detector de selecao pronto. Guarde o texto de qualquer erro e o bootstrap.log indicado.
4. Selecione inicialmente 1 a 5 RAWs CR3 em cor, da Canon EOS R6m2. Execute Mizin: analisar fotos selecionadas. Analise e edicao aceitam toda a selecao, sem os antigos tetos de 100/25 fotos. O motor processa um RAW de cada vez, com duas threads e prioridade abaixo do normal. Permanecem limites de seguranca de tamanho dos registros; nao significa capacidade infinita.
5. Revise os valores na janela. Abrir pasta dos resultados mostra results.json, results.csv e os logs. Mizin: ver ultimos resultados permite consultar novamente a ultima analise.

## Editar no Lightroom e restaurar

1. Selecione CR3 em cor ou suas copias virtuais, da Canon EOS R6m2. Ha progresso desde a preparacao. Em selecoes mistas, P&B e contado e preservado mediante confirmacao para continuar somente com cor; aprendizado/edicao P&B ainda NAO implementados. Execute Mizin: editar fotos em copias virtuais. Escolha Piloto atual ou Candidato do acervo, se ja treinado. Confirme em Calcular e editar copias.
2. O plugin calcula os dez controles por foto, cria novas copias virtuais e aplica os ajustes nelas, usando a revelacao do Lightroom. A opcao de curvas e tonalidade acrescenta ate 19 campos constantes encontrados nas suas 3.513 edicoes aprovadas de oito trabalhos. Controles de tonalidade indisponiveis na origem ficam fora da aplicacao.
3. As copias partem dos ajustes atuais dos originais; perfil/Look, HSL, cortes, mascaras e lentes sao herdados. Para avaliar o aprendizado, use fotos novas ainda nao editadas: herdar uma edicao pronta nao prova aprendizado do estilo completo. A base nao troca o perfil nem a versao do processo.
4. As copias ficam em Mizin - Edicoes / Edicao <identificador>. O plugin muda entre Biblioteca e Revelacao durante a tarefa. Aguarde a conclusao antes de alterar selecao ou ajustes. Cancelamento deixa as copias ja criadas para revisao e para a restauracao disponivel.
5. Mizin: restaurar ultima edicao das copias usa o snapshot anterior de cada copia. Copias alteradas manualmente depois sao preservadas para revisao, com o motivo exibido. Restaura somente a ultima sessao; nao remove copias nem snapshots. No Lightroom, snapshots sao compartilhados entre o original e suas copias: o snapshot tambem pode aparecer na origem, sem aplicar nela os ajustes da copia.
6. Os registros ficam em MizinLightroomLocal/editing, com uma pasta por sessao e etapas por copia. Preserve esses dados. Snapshots permanecem no catalogo se houver interrupcao. O plugin nao chama salvar metadados nem regrava pixels; a gravacao automatica de XMP segue as preferencias do Lightroom.

O fluxo foi verificado localmente com contratos do SDK e motor real. A aplicacao/restauracao no Lightroom 15.6 e a qualidade fotografica desta nova etapa ainda precisam de confirmacao no computador de edicao. Os JPEGs tecnicos continuam sem a revelacao Adobe; a comparacao visual deve ser feita nas copias dentro do Lightroom.

## Selecao: repetidas, foco/movimento e exposicao

1. Selecione as fotos de um trabalho no Lightroom (ate 2.000 originais por analise) e execute Mizin: selecionar fotos (repetidas e qualidade). O padrao e ate quatro escolhidas por grupo semelhante; pode reduzir para tres, duas ou uma.
2. A comparacao considera tempo de captura, aparencia e geometria da cena. Em grupos com pessoas, normaliza a escala do conjunto para comparar aberta/fechada e exige correspondencia visual em varias regioes das pessoas. A variedade horizontal/vertical e aberta/fechada e preservada entre alternativas com qualidade; nao precisa preencher quatro vagas com arquivos identicos.
3. Foco e movimento sao sinalizados para revisao, com prioridade a nitidez dos rostos avaliaveis. Fundo desfocado pode ser intencional. Rostos pequenos e superficies sem textura sao incertos. O detector nao identifica pessoas pelo nome nem avalia olhos fechados.
4. Em RAWs, o motor examina sinal e saturacao do sensor, incluindo os canais da matriz. Escuridao de previa nao e prova de perda irrecuperavel. Em JPEG/TIFF/PNG, o resultado pede conferir o RAW original. Riscos de exposicao sao sugestoes, nao uma garantia de recuperacao.
5. Ao terminar, Criar colecoes no Lightroom organiza Escolhidas, Repetidas excedentes, Revisar foco ou movimento, Revisar exposicao, Revisar textura ou rostos pequenos e Falhas de leitura, quando houver fotos em cada categoria. As colecoes de qualidade podem conter fotos escolhidas: sao dois criterios diferentes.
6. Mizin: ver ultima selecao de fotos reabre a revisao. Cancelamento preserva a parte processada; somente essa parte pode ser organizada. results.json e culling.csv ficam na pasta do resultado. As pequenas previas tecnicas nao incluem a edicao/corte do Lightroom.

O limite de quatro vale por grupo reconhecido nesta analise. Cenas/cameras/pastas diferentes ou sem horario comparavel podem ficar separadas; nao ha garantia de reconhecer todas as repeticoes. A analise utiliza o original sem os cortes/ajustes atuais do Lightroom. Os limiares de foco/exposicao sao conservadores e ainda nao tem homologacao fotografica. O menu e a criacao de colecoes precisam ser conferidos no Lightroom real. Nenhuma foto e apagada, movida ou rejeitada automaticamente; estrelas, cores e ajustes existentes sao preservados.

## Aprender com acervo, novos eventos e sua opiniao

1. Abra um catalogo e execute Mizin: aprender com catalogo atual. O plugin localiza fotos com ajustes, filtra originais CR3 em cor e pede uma confirmacao de que as edicoes estao finais. Nao e necessario selecionar grupos de 100. Nesta versao, ate 10.000 referencias entram em uma fila, processada automaticamente em lotes de 25.
2. Abra os outros catalogos e repita uma vez em cada um. O SDK trabalha no catalogo aberto; a base de aprendizado e compartilhada entre os catalogos na mesma maquina. RAWs repetidos nao contam duas vezes. Rotulos conflitantes entre catalogos sao excluidos do treino ate revisao, e revisoes anteriores ficam preservadas.
3. Nos trabalhos novos, selecione as fotos finais de um evento e use Mizin: registrar evento concluido. Fotos que mudarem depois da confirmacao ficam pendentes de nova aprovacao. Camera diferente da Canon EOS R6m2, P&B, copias virtuais e formatos diferentes de CR3 continuam fora deste piloto.
4. Use Mizin: continuar aprendizado se pausar uma importacao. Filas aprovadas interrompidas sem pausa sao retomadas ao reabrir seu catalogo. O plugin nao varre catalogos fechados nem presume que fotos novas estejam aprovadas.
5. Apos importar pelo menos tres trabalhos com 50 referencias unicas cada, o motor treina automaticamente um candidato local. Um evento separado e usado somente uma vez na avaliacao; novas rodadas aguardam um evento ainda nao utilizado. Quantidade e metricas numericas nao garantem qualidade fotografica.
6. Mizin: meu aprendizado mostra referencias, trabalhos e conflitos. Mizin: avaliar aprendizado do acervo calcula sugestoes com o candidato. O modelo anterior continua disponivel no comando de analise original. Nao ha ativacao automatica; a escolha e aplicacao do candidato acontecem pelo comando separado de editar copias virtuais.
7. Mizin: minha opiniao sobre as sugestoes registra gostei/precisei ajustar/nao gostei e uma observacao. Voce pode ativar a pergunta ao fim das analises. Opinioes e textos nao viram ajustes de treino; os ajustes finais aprovados entram pelo comando de evento concluido.

Todos os dados, historicos e candidatos ficam na maquina de edicao, dentro de MizinLightroomLocal. A nova interface precisa de confirmacao no Lightroom real; o teste local com SDK doubles nao valida a interface do aplicativo.

## Coleta manual e transferencia opcional

1. Selecione inicialmente 5 RAWs originais, em cor, com os dez ajustes basicos ja revisados e aprovados. A coleta aceita a selecao completa da Canon EOS R6m2, respeitando os limites de tamanho do pacote de referencias.
2. Execute Mizin: coletar referencias aprovadas. Informe a data e o nome do trabalho e confirme a revisao final. Use exatamente o mesmo nome em coletas do mesmo trabalho.
3. Ao concluir, Mostrar pacote de referencias abre a pasta com references-package.zip selecionado. Esse ZIP inclui references.jsonl, request.json, results.json e um manifesto SHA-256, sem os pixels das fotos. Fotos em P&B sao contadas como ignoradas, separadamente de falhas; ainda nao ha treino em P&B.
4. Depois desse primeiro teste, colete 50 a 100 fotos variadas de cada trabalho, cobrindo iluminacoes e situacoes diferentes. Para a proxima etapa, reunir pelo menos tres trabalhos separados permite reservar um para avaliacao. Manter o trabalho de 24/10 como observacao ja examinada, sem apresenta-lo como teste final intocado.
5. Copie apenas references-package.zip para a pasta de transferencia indicada pelo desenvolvimento, usando uma subpasta para cada trabalho/coleta. Preserve os arquivos originais e o nome do trabalho dentro do JSONL. Se o ZIP nao puder ser criado, a janela mantem o acesso ao JSONL e informa o erro do empacotamento.

A coleta nao retreina nem ativa um modelo. Registra somente os dez controles globais basicos, com o mesmo dominio tecnico do piloto. Dados incompletos e RAWs duplicados dentro da coleta sao recusados; a deduplicacao entre varias coletas e a separacao treino/avaliacao sao tarefas da etapa de treinamento.

O progresso aceita cancelamento entre fotos; uma leitura/decodificacao em andamento pode precisar terminar. Falhas de arquivo, camera ou metadados aparecem por foto. Os resultados ficam na pasta MizinLightroomLocal/jobs dentro dos dados de aplicativo retornados pelo SDK. Nao e necessario manter este computador de desenvolvimento ligado.

As imagens input-*.jpg sao entradas tecnicas LibRaw, sem o estilo aplicado. Nao representam uma previa visual da edicao Adobe. Analise, coleta e selecao nao aplicam revelacao; editar copias virtuais e um comando separado que grava no catalogo com snapshots de restauracao. A selecao cria novas colecoes quando voce usa o botao de organizar.

Mizin: comparar amostra salva do piloto conserva o teste anterior das {len(entries)} referencias. Ele e separado da analise nova e exige o catalogo de outubro. O pacote contem caminhos privados dessa amostra e seu modelo de estilo; mantenha no uso pessoal.

O motor foi preparado para teste no Lightroom da maquina de edicao. Testes locais do runtime e Lua com doubles nao substituem a execucao dessa nova interface no aplicativo.
'''
    (delivery / 'LEIA-ME.md').write_text(readme, encoding='utf-8')
    files = [delivery / 'LEIA-ME.md', *sorted(p for p in plugin.rglob('*') if p.is_file() and '__pycache__' not in p.parts)]
    hashes = {p.relative_to(delivery).as_posix(): sha(p) for p in files}
    (delivery / 'SHA256SUMS.txt').write_text(''.join(value + ' *' + name + '\n' for name, value in hashes.items()), encoding='utf-8')
    archive = delivery / (label + '-motor-local.zip')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
        for source in [*files, delivery / 'SHA256SUMS.txt']:
            package.write(source, source.relative_to(delivery).as_posix())
    with zipfile.ZipFile(archive) as package:
        if package.testzip() is not None:
            raise ValueError('ZIP CRC check failed')
    receipt = {**info, 'schema': 'mizin-lightroom.local-plugin-package/1', 'archive': str(archive),
               'pluginDirectory': str(plugin), 'sha256': sha(archive), 'bytes': archive.stat().st_size,
               'fileCount': len(files), 'newPhotoInferenceImplemented': True, 'portableRuntimeIncluded': True,
               'catalogWritesImplemented': True,'developSettingsWritesImplemented':True, 'savedComparisonReferences': len(entries),
                'networkApisUsedByEngine': False, 'photographicQualityApproved': False}
    (delivery / 'package.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    # Update the single-point latest manifest in deliveries root, used by the updater script
    # and in-plugin update checker to find the newest release without directory scans.
    latest = {'schema': 'crispix.latest-delivery/1', 'version': version, 'build': match[4],
              'publishedUtc': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
              'archiveName': archive.name, 'archiveSha256': sha(archive), 'archiveBytes': archive.stat().st_size,
              'deliveryFolder': delivery.name}
    (ROOT / 'private/deliveries/latest.json').write_text(json.dumps(latest, indent=2), encoding='utf-8')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('runtime-base', 'model-folder', 'dataset', 'manifest'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.runtime_base, args.model_folder, args.dataset, args.manifest)))
