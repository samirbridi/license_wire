"""Version from real commits, compile with installed Wire, verify and package locally."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import zipfile
from build_graph import ROOT, SOURCE, NAME
from extract_bundle import extract


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    qa=json.loads((ROOT/'evidence/native-qa.json').read_text())
    if not qa['pass']:raise RuntimeError('Native QA must pass before compilation')
    if qa.get('source_sha256')!=sha(SOURCE):raise RuntimeError('Source has changed since native QA')
    subprocess.run([sys.executable,str(ROOT/'scripts/version.py'),'--reserve'],check=True)
    version=json.loads((ROOT/'evidence/build-version.json').read_text())
    semantic,build=re.fullmatch(r'(v\d+\.\d+\.\d+) \(build (\d+)\)',version['display']).groups()
    output=ROOT/'reconstructed/releases'/(semantic+'-build'+build)
    output.mkdir(parents=True,exist_ok=False)
    label=NAME+' '+semantic
    source=output/(label+'.wire');artifact=output/(label+'.cwired')
    d=json.loads(SOURCE.read_text())
    d['patch']['meta']['displayName']=label
    d['patch']['meta']['description']=f'by Mizin | {semantic}\nFour slice groups, independent pixel corners and native 2D geometry.'
    d['patch']['meta'].pop('publisher',None)
    source.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
    receipt={'version':version['display'],'source_commit':version['source_commit'],
             'compiler':r'C:\Program Files\Resolume Wire\Wire.exe','compiler_version':'7.28.1.26535',
             'editable':str(source),'artifact':str(artifact),'editable_sha256':sha(source),'status':'FAIL'}
    try:
        command=[receipt['compiler'],'compile',str(source),'--output',str(artifact)]
        receipt['command']=command
        startup=subprocess.STARTUPINFO();startup.dwFlags|=subprocess.STARTF_USESHOWWINDOW;startup.wShowWindow=0
        with (ROOT/'evidence/compile.stdout.log').open('w') as stdout,(ROOT/'evidence/compile.stderr.log').open('w') as stderr:
            process=subprocess.run(command,stdout=stdout,stderr=stderr,timeout=300,startupinfo=startup)
        receipt['exit_code']=process.returncode
        if process.returncode:raise RuntimeError('Wire compiler failed; inspect evidence/compile.*.log')
        if not artifact.is_file() or artifact.stat().st_size<128:raise RuntimeError('Missing compiled bundle')
        verified=ROOT/'evidence/build-verification'/output.name
        bundle=extract(artifact,verified)
        compiled=json.loads((verified/'patch.wire').read_text(encoding='utf-8'))
        if compiled['patch']['meta']['identifier']!=d['patch']['meta']['identifier']:raise RuntimeError('Compiled identity mismatch')
        if compiled['patch']['meta']['displayName']!=label:raise RuntimeError('Compiled version mismatch')
        if compiled['patch']['nodes']!=d['patch']['nodes'] or compiled['patch']['connections']!=d['patch']['connections']:
            raise RuntimeError('Compiled graph differs from validated source')
        receipt.update({'status':'PASS','sha256':sha(artifact),'bytes':artifact.stat().st_size,
                        'nodes':len(compiled['patch']['nodes']),'connections':len(compiled['patch']['connections']),
                        'bundle':bundle,'arena_playback':'PENDING'})
        subprocess.run([sys.executable,str(ROOT/'scripts/version.py'),'--status','PASS'],check=True)
        (ROOT/'evidence/build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
        subprocess.run([sys.executable,str(ROOT/'scripts/write_reports.py')],check=True)
        for name in ['README.md','CHANGELOG.md','VERSION']:
            (output/name).write_bytes((ROOT/name).read_bytes())
        (output/'BUILD.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
        package=output/(label+'.zip')
        files=[source,artifact,output/'README.md',output/'CHANGELOG.md',output/'VERSION',output/'BUILD.json']
        with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
            for path in files:z.write(path,path.name)
        receipt['package']=str(package);receipt['package_sha256']=sha(package)
        (ROOT/'evidence/build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
        print(json.dumps({k:v for k,v in receipt.items() if k!='bundle'},indent=2))
    except Exception as error:
        receipt['error']=str(error)
        (ROOT/'evidence/build-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
        if receipt['status']!='PASS':subprocess.run([sys.executable,str(ROOT/'scripts/version.py'),'--status','FAIL'],check=True)
        raise


if __name__=='__main__':main()
