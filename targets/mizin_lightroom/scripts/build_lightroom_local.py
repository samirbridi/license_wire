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
    for name in ('raw_features.py', 'train_numeric_pilot.py', 'import_approved_references.py'):
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
            'experimental': True, 'catalogWritesImplemented': True, 'developSettingsWritesImplemented':True,'maximumPhotosPerJob': 100,
            'virtualCopyEditingImplemented':True,'maximumPhotosPerEdit':25,'editingOriginalsImplemented':False,
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
    label = 'MizinLightroom-' + '.'.join(match.group(i) for i in (1, 2, 3)) + '-build' + match[4]
    delivery = ROOT / 'private/deliveries' / (label + '-' + uuid.uuid4().hex[:8])
    plugin = delivery / 'MizinLightroom.lrplugin'
    info = populate_engine(plugin, runtime_base, model_folder, version)
    template = (ROOT / 'reconstructed/lightroom-pilot/Info.local.lua.template').read_text(encoding='utf-8')
    for key, value in {'__MAJOR__': match[1], '__MINOR__': match[2], '__PATCH__': match[3],
                       '__BUILD__': match[4], '__DISPLAY_VERSION__': version}.items():
        template = template.replace(key, value)
    (plugin / 'Info.lua').write_text(template, encoding='utf-8')
    for source in (ROOT / 'reconstructed/lightroom-pilot').glob('*.lua'):
        shutil.copy2(source, plugin / source.name)
    entries = saved_entries(dataset, manifest, model_folder)
    (plugin / 'PilotData.lua').write_text('return ' + lua_literal({
        'schema': 'mizin-lightroom.saved-pilot/1', 'version': version, 'automaticEditing': False, 'entries': entries}) + '\n', encoding='utf-8')
    readme = f'''# Mizin Lightroom - motor local experimental

Versao: {version}

Este pacote oferece selecao local de fotos, aprendizado e edicao experimental em novas copias virtuais. Inclui Python, rawpy/LibRaw, OpenCV, detector publico de rostos e ExifTool. Processamento e resultados ficam na maquina de edicao. O modelo padrao continua o mesmo piloto de dez controles, treinado em um unico trabalho. O candidato do seu acervo pode ser escolhido quando estiver treinado. Nao ha equivalencia de qualidade comprovada com o Neurapix.

## Atualizar a instalacao

1. Feche o Lightroom e extraia TODO o ZIP em uma pasta nova e permanente, por exemplo Documentos/MizinLightroom/{label}. Guarde a pasta anterior para recuperar o piloto antigo.
2. Abra o Lightroom e entre em Arquivo > Gerenciador de plug-ins. Selecione o piloto antigo e remova seu cadastro com Remover; os arquivos recebidos e o acervo devem ser preservados. Adicione a NOVA pasta MizinLightroom.lrplugin. Os pacotes usam o mesmo identificador, portanto mantenha uma instalacao ativa.
3. Execute Biblioteca > Extras de plug-in > Mizin: diagnosticar motor local. O resultado deve informar as versoes de Python, rawpy, LibRaw, NumPy, Pillow, OpenCV, ExifTool e Lightroom, com detector de selecao pronto. Guarde o texto de qualquer erro e o bootstrap.log indicado.
4. Selecione inicialmente 1 a 5 RAWs CR3 em cor, da Canon EOS R6m2. Execute Mizin: analisar fotos selecionadas. O limite deste piloto e 100 fotos por tarefa.
5. Revise os valores na janela. Abrir pasta dos resultados mostra results.json, results.csv e os logs. Mizin: ver ultimos resultados permite consultar novamente a ultima analise.

## Editar no Lightroom e restaurar

1. Selecione de 1 a 25 RAWs CR3 originais, em cor, da Canon EOS R6m2. Execute Mizin: editar fotos em copias virtuais. Escolha Piloto atual ou Candidato do acervo, se ja treinado. Confirme em Calcular e editar copias.
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

1. Selecione inicialmente 5 RAWs originais, em cor, com os dez ajustes basicos ja revisados e aprovados. O piloto aceita de 1 a 100 fotos por coleta, da Canon EOS R6m2.
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
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('runtime-base', 'model-folder', 'dataset', 'manifest'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.runtime_base, args.model_folder, args.dataset, args.manifest)))
