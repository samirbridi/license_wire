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
    for name in ('local_engine.py', 'run_local.py'):
        shutil.copy2(ROOT / 'reconstructed/local-engine' / name, engine / name)
    for name in ('raw_features.py', 'train_numeric_pilot.py'):
        shutil.copy2(ROOT / 'scripts' / name, engine / name)
    models = plugin / 'Models'
    models.mkdir()
    for source, destination in (('model.json', 'pilot-model.json'), ('evaluation.json', 'evaluation.json')):
        shutil.copy2(model_folder / source, models / destination)
    info = {'schema': 'mizin-lightroom.local-bundle/1', 'version': version,
            'styleName': 'Meu estilo - piloto de formatura', 'modelSha256': sha(models / 'pilot-model.json'),
            'experimental': True, 'catalogWritesImplemented': False, 'maximumPhotosPerJob': 100,
            'nativeNewSelectionFlowValidated': False}
    (plugin / 'BuildInfo.json').write_text(json.dumps(info, indent=2), encoding='utf-8')
    components = {'schema': 'mizin-lightroom.third-party/1', 'downloads': runtime['downloads'],
                  'wheels': runtime['wheels'], 'sources': runtime.get('sources', []),
                  'runtimeCheck': runtime['runtimeCheck']}
    # Developer machine paths are intentionally omitted from the distributed metadata.
    (plugin / 'THIRD-PARTY.json').write_text(json.dumps(components, indent=2), encoding='utf-8')
    (plugin / 'THIRD-PARTY.md').write_text('''# Componentes de terceiros

O runtime Windows inclui Python (PSF), NumPy e suas bibliotecas, Pillow, rawpy/LibRaw e ExifTool/Perl. Os avisos e licencas recebidos ficam junto aos respectivos componentes: Runtime/LICENSE.txt, Runtime/Lib/site-packages/*dist-info/ e Tools/ExifTool/. As copias fornecidas preservam esses avisos. URLs e SHA-256 dos arquivos de origem constam em THIRD-PARTY.json.

O arquivo Python ._pth isola o runtime: ele usa somente a biblioteca padrao embarcada, os tres pacotes fixados e a pasta Engine. O plugin nao depende do Python do sistema. O modelo e proprio, experimental e privado; nao contem codigo ou pesos do Neurapix.
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

Este pacote calcula sugestoes novas a partir dos RAWs selecionados, com Python, rawpy/LibRaw e ExifTool incluidos. O processamento e os resultados ficam na maquina de edicao. O modelo ainda e experimental, treinado em um unico trabalho, e este pacote apresenta valores para revisao; nao aplica ajustes no catalogo. Exposicao, temperatura e contraste aparecem na janela; o CSV inclui os dez controles experimentais.

## Atualizar a instalacao

1. Feche o Lightroom e extraia TODO o ZIP em uma pasta nova e permanente, por exemplo Documentos/MizinLightroom/{label}. Guarde a pasta anterior para recuperar o piloto antigo.
2. Abra o Lightroom e entre em Arquivo > Gerenciador de plug-ins. Selecione o piloto antigo e remova seu cadastro com Remover; os arquivos recebidos e o acervo devem ser preservados. Adicione a NOVA pasta MizinLightroom.lrplugin. Os pacotes usam o mesmo identificador, portanto mantenha uma instalacao ativa.
3. Execute Biblioteca > Extras de plug-in > Mizin: diagnosticar motor local. O resultado deve informar as versoes de Python, rawpy, LibRaw, NumPy, Pillow, ExifTool e Lightroom. Guarde o texto de qualquer erro e o bootstrap.log indicado.
4. Selecione inicialmente 1 a 5 RAWs CR3 em cor, da Canon EOS R6m2. Execute Mizin: analisar fotos selecionadas. O limite deste piloto e 100 fotos por tarefa.
5. Revise os valores na janela. Abrir pasta dos resultados mostra results.json, results.csv e os logs. Mizin: ver ultimos resultados permite consultar novamente a ultima analise.

O progresso aceita cancelamento entre fotos; uma leitura/decodificacao em andamento pode precisar terminar. Falhas de arquivo, camera ou metadados aparecem por foto. Os resultados ficam na pasta MizinLightroomLocal/jobs dentro dos dados de aplicativo retornados pelo SDK. Nao e necessario manter este computador de desenvolvimento ligado.

As imagens input-*.jpg sao entradas tecnicas LibRaw, sem o estilo aplicado. Nao representam uma previa visual da edicao Adobe. Este pacote nao cria copias virtuais nem modifica ajustes, RAWs ou sidecars. Essa aplicacao depende de uma etapa posterior com QA nativo e restauracao.

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
    receipt = {'schema': 'mizin-lightroom.local-plugin-package/1', **info, 'archive': str(archive),
               'pluginDirectory': str(plugin), 'sha256': sha(archive), 'bytes': archive.stat().st_size,
               'fileCount': len(files), 'newPhotoInferenceImplemented': True, 'portableRuntimeIncluded': True,
               'catalogWritesImplemented': False, 'savedComparisonReferences': len(entries),
               'networkApisUsedByEngine': False, 'photographicQualityApproved': False}
    (delivery / 'package.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('runtime-base', 'model-folder', 'dataset', 'manifest'):
        parser.add_argument('--' + name, required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(build(args.runtime_base, args.model_folder, args.dataset, args.manifest)))
