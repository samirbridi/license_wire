"""Verify the final ZIP and real local engine -> Lua SDK double editing contract.

Requires the private prepared RAW fixture and QA Python with Lupa. Never opens a
Lightroom catalog. Native application/visual quality are explicitly unverified.
"""
import argparse
import hashlib
import json
import os
import subprocess
import uuid
import zipfile
from pathlib import Path
from lupa.lua51 import LuaRuntime

from prepare_local_runtime import extract
from test_photo_editor_lua import PhotoEditorLuaTests

ROOT=Path(__file__).resolve().parents[1]
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def verify(package_path,unit_tests_passed):
    package=json.loads(package_path.read_text(encoding='utf-8'))
    qa=ROOT/'private/qa'/('editing-release-'+uuid.uuid4().hex[:8]);qa.mkdir()
    archive=Path(package['archive']);assert sha(archive)==package['sha256']
    with zipfile.ZipFile(archive) as z:assert z.testzip() is None
    deployment=qa/'Instalacao & edicao local';extract(archive,deployment)
    plugin=deployment/'MizinLightroom.lrplugin'
    lines=(deployment/'SHA256SUMS.txt').read_text().splitlines()
    for line in lines:
        digest,name=line.split(' *',1);assert sha(deployment/name)==digest
    lua=LuaRuntime(unpack_returned_tuples=True)
    for path in plugin.glob('*.lua'):lua.execute('assert(loadstring(...))',path.read_text(encoding='utf-8'))
    info=json.loads((plugin/'BuildInfo.json').read_text())
    assert info['virtualCopyEditingImplemented'] and not info['editingOriginalsImplemented'] and not info['nativeEditingWorkflowValidated']
    assert sha(plugin/'StyleBase.lua')==info['styleBaseLuaSha256']
    env=os.environ.copy();env['PATH']=r'C:\Windows\System32';env['PYTHONHOME']='INVALID_QA_HOME';env['PYTHONPATH']='INVALID_QA_PATH'
    app_data=qa/'Dados & contratos SDK';app_data.mkdir()
    runtime=PhotoEditorLuaTests().setup_editor(app_data)
    runtime.globals().plugin_path=plugin.as_posix()
    runtime.execute("_PLUGIN.path=plugin_path;editor=dofile(plugin_path..'/PhotoEditor.lua');modules.LrDialogs.presentModalDialog=function(props) referenceProps.base=true;return 'ok' end")
    previous=json.loads((ROOT/'private/qa/latest-culling.json').read_text())
    raw_request=json.loads((Path(previous['peopleJob'])/'request.json').read_text())
    paths=[Path(row['path']) for row in raw_request['photos'][:2]]
    hashes={str(p):sha(p) for p in paths}
    runtime.globals().raw_a=str(paths[0]);runtime.globals().raw_b=str(paths[1])
    runtime.execute('source.path=raw_a;other.path=raw_b;selected={source,other}')
    before=[runtime.globals().editor.fingerprint(p.settings) for p in [runtime.globals().source,runtime.globals().other]]
    commands=[]
    def launch(command,job):
        commands.append(command)
        line='"'+os.environ.get('COMSPEC',r'C:\Windows\System32\cmd.exe')+'" /d /s /c '+command
        result=subprocess.run(line,env=env,cwd=str(qa),capture_output=True,text=True,errors='replace',timeout=300)
        (job/'launch.stderr').write_text(result.stderr,encoding='utf-8')
        if result.returncode:raise RuntimeError((result.returncode,result.stderr,(job/'bootstrap.log').read_text(errors='replace') if (job/'bootstrap.log').exists() else 'NO_BOOTSTRAP_LOG'))
        return json.loads((job/'results.json').read_text())
    engine=runtime.execute("return dofile(plugin_path..'/LocalAnalysis.lua')")
    diagnostic_job=qa/'diagnostic';diagnostic_job.mkdir()
    (diagnostic_job/'request.json').write_text(json.dumps(dict(schema='mizin-lightroom.selection-request/1',jobId=str(uuid.uuid4()),operation='diagnostic',lightroomVersion='NOT_NATIVE_QA')))
    diagnostic=launch(engine.command(str(plugin),str(diagnostic_job)),diagnostic_job)
    assert diagnostic['status']=='DIAGNOSTIC_OK' and diagnostic['runtime']['isolatedPython']
    reports=[]
    def execute(job):
        report=launch(runtime.globals().launchedCommand,Path(job));assert report['status']=='COMPLETED'
        assert report['computedPhotos']==2 and all(len(row['predictions'])==10 for row in report['results'])
        reports.append(report)
    runtime.globals().mock_execute=execute
    session=Path(runtime.globals().editor.edit())
    assert json.loads((session/'outcome.json').read_text())['status']=='COMPLETED'
    assert runtime.globals().applyCount==2
    assert before==[runtime.globals().editor.fingerprint(p.settings) for p in [runtime.globals().source,runtime.globals().other]]
    runtime.execute("editor=dofile(plugin_path..'/PhotoEditor.lua')")
    restored,skipped,_=runtime.globals().editor.restoreSession(session.as_posix());assert (restored,skipped)==(2,0)
    for original,p in zip(before,[runtime.globals().source,runtime.globals().other]):
        assert runtime.globals().editor.fingerprint(p.settings)==original
        assert runtime.globals().editor.fingerprint(p.copies[1].settings)==original
    assert hashes=={str(p):sha(p) for p in paths}
    receipt=dict(schema='mizin-lightroom.editing-plugin-qa/1',version=package['version'],archiveSha256=package['sha256'],zipCrcPassed=True,
        manifestHashesVerified=len(lines),lua51SourcesCompiled=len(list(plugin.glob('*.lua'))),runtime=diagnostic['runtime'],unitTestsPassed=unit_tests_passed,
        realRawPhotosProcessed=2,numericPredictionCountPerPhoto=10,realEngineToSDKDoubleHandoffPassed=True,
        sdkDoubleNewCopiesEdited=2,sdkDoubleCopiesRestoredAfterModuleReload=restored,sdkDoubleOriginalSettingsUnchanged=True,
        allRawHashesStillEqual=True,styleBaseLuaHashVerified=True,isolatedCommandWithSpacesAndAmpersandPassed=True,
        nativeLightroomEditingValidated=False,nativeLightroomRestorationValidated=False,photographicQualityApproved=False,
        vendorNeurapixArtifactsIncluded=False,photosUploaded=0,numericPilotUnchanged=sha(plugin/'Models/pilot-model.json')=='9f1cd19d844f269bbd6f932e82089df9deb87f8b7de9eda06c7959814a465422')
    assert receipt['numericPilotUnchanged']
    (ROOT/'evidence/editing-plugin-qa-20261030.json').write_text(json.dumps(receipt,indent=2)+'\n')
    (ROOT/'private/qa/latest-editing-release.json').write_text(json.dumps(dict(directory=str(qa),plugin=str(plugin),session=str(session),commands=commands),indent=2)+'\n')
    return receipt

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--package',type=Path,required=True);parser.add_argument('--unit-tests-passed',type=int,required=True)
    args=parser.parse_args();print(json.dumps(verify(args.package,args.unit_tests_passed),indent=2))
