"""Package a read-only native Lightroom comparison; private saved predictions."""
import argparse
import hashlib
import json
import math
import re
import shutil
import uuid
import zipfile
from pathlib import Path, PureWindowsPath

ROOT = Path(__file__).resolve().parents[1]


def lua_literal(value):
    if value is None:
        return 'nil'
    if type(value) is bool:
        return 'true' if value else 'false'
    if type(value) in (int,float):
        if not math.isfinite(value):
            raise ValueError('Nonfinite Lua number')
        return repr(value)
    if isinstance(value,str):
        escaped=''
        for char in value:
            if char in ('"','\\'):
                escaped+='\\'+char
            elif ord(char)<32 or ord(char)==127:
                escaped+='\\'+f'{ord(char):03}'
            else:
                escaped+=char
        return '"'+escaped+'"'
    if isinstance(value,list):
        return '{'+','.join(lua_literal(v) for v in value)+'}'
    if isinstance(value,dict):
        return '{'+','.join('['+lua_literal(str(k))+']='+lua_literal(v) for k,v in value.items())+'}'
    raise TypeError('Unsupported Lua data value')


def build(dataset,manifest):
    dataset=Path(dataset)
    version=(ROOT/'VERSION').read_text(encoding='utf-8-sig').strip()
    match=re.fullmatch(r'v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)',version)
    if not match:
        raise ValueError('Invalid computed project version')
    model_dir=sorted((dataset/'pilot-models').glob('*'))[-1]
    evaluation=json.loads((model_dir/'evaluation.json').read_text(encoding='utf-8'))
    predictions=[json.loads(line) for line in (model_dir/'holdout-predictions.jsonl').read_text(encoding='utf-8').splitlines()]
    references={r['imageId']:r for r in (json.loads(line) for line in Path(manifest).read_text(encoding='utf-8').splitlines())}
    entries=[]
    for row in predictions:
        reference=references[row['imageId']]
        if reference['approvalStatus']!='REFERENCE_APPROVED_BY_PHOTOGRAPHER' or not reference['technicalCandidate']:
            raise ValueError('Unapproved or ineligible plugin reference')
        selected={key:row['predictions'][key]['prediction'] for key in ('Exposure2012','Temperature','Contrast2012')}
        entries.append({'path':reference['sourcePath'],'filename':PureWindowsPath(reference['sourcePath']).name,
                        'imageId':row['imageId'],'predictions':selected})
    if len(entries)!=evaluation['testSamples']:
        raise ValueError('Saved prediction count mismatch')
    label='MizinLightroom-'+'.'.join(match.group(i) for i in (1,2,3))+'-build'+match.group(4)
    delivery=ROOT/'private'/'deliveries'/(label+'-'+uuid.uuid4().hex[:8])
    plugin=delivery/'MizinLightroom.lrplugin'
    plugin.mkdir(parents=True,exist_ok=False)
    template=(ROOT/'reconstructed'/'lightroom-pilot'/'Info.lua.template').read_text(encoding='utf-8')
    for key,value in {'__MAJOR__':match[1],'__MINOR__':match[2],'__PATCH__':match[3],
                      '__BUILD__':match[4],'__DISPLAY_VERSION__':version}.items():
        template=template.replace(key,value)
    (plugin/'Info.lua').write_text(template,encoding='utf-8')
    shutil.copy2(ROOT/'reconstructed'/'lightroom-pilot'/'ComparePilot.lua',plugin/'ComparePilot.lua')
    data={'schema':'mizin-lightroom.saved-pilot/1','version':version,'automaticEditing':False,'entries':entries}
    (plugin/'PilotData.lua').write_text('return '+lua_literal(data)+'\n',encoding='utf-8')
    instructions=f'''# Mizin Lightroom - piloto de comparacao

Versao: {version}

Este pacote mostra previsoes ja calculadas para {len(entries)} fotos do teste da formatura. Consulta os ajustes atuais e mostra sugestoes experimentais de exposicao, temperatura e contraste. Nao aplica edicoes, nao cria colecoes, nao envia fotos e ainda nao executa o motor para imagens novas.

1. Extraia o ZIP em uma pasta permanente e acessivel da maquina de edicao.
2. No Lightroom Classic: Arquivo > Gerenciador de plug-ins > Adicionar. Escolha a pasta MizinLightroom.lrplugin.
3. Abra o catalogo 202610 - OUTUBRO.
4. Biblioteca > Extras de plug-in > Mizin: comparar amostra do piloto.

A janela mostra ate cinco fotos localizadas e o total de referencias encontradas. Se mostrar um erro, copie o texto da mensagem para o desenvolvimento. Campos indisponiveis sao exibidos como tal; o plugin nao altera a foto para forcar atualizacao de cache.

O pacote foi preparado para QA nativo. Testes Lua fora do Lightroom nao comprovam funcionamento no aplicativo. Um unico evento nao valida resultados em novos trabalhos. Os demais controles experimentados tiveram resultados mistos e nao aparecem nesta interface.

O arquivo PilotData.lua contem caminhos privados e previsoes desse teste. Mantenha o pacote no uso pessoal; nao publique esses dados.
'''
    (delivery/'LEIA-ME.md').write_text(instructions,encoding='utf-8')
    archive=delivery/(label+'-piloto-leitura.zip')
    with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as package:
        for source in [delivery/'LEIA-ME.md',*sorted(plugin.glob('*'))]:
            package.write(source,source.relative_to(delivery).as_posix())
    receipt={'schema':'mizin-lightroom.native-pilot-package/1','version':version,'pluginDirectory':str(plugin),
             'archive':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
             'savedPredictions':len(entries),'catalogWritesImplemented':False,'networkApisUsed':False,
             'lightroomHostValidated':False,'newPhotoInferenceImplementedInPlugin':False}
    (delivery/'package.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2),encoding='utf-8')
    return receipt


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--dataset',required=True,type=Path)
    parser.add_argument('--manifest',required=True,type=Path)
    args=parser.parse_args()
    print(json.dumps(build(args.dataset,args.manifest),ensure_ascii=True))
