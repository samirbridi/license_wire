"""Acquire hash-verified public CPU vision dependencies, preserving prior runtimes."""
from __future__ import annotations
import hashlib
import json
import shutil
import subprocess
import urllib.request
import uuid
from pathlib import Path
from prepare_local_runtime import extract

ROOT=Path(__file__).resolve().parents[1]
CV_VERSION='4.13.0.92'

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def get(url,path,expected=None):
    request=urllib.request.Request(url,headers={'User-Agent':'MizinLightroom-public-dependency-builder/1'})
    with urllib.request.urlopen(request,timeout=90) as source,path.open('xb') as out:shutil.copyfileobj(source,out)
    actual=sha(path)
    if expected and actual!=expected:raise ValueError('Published dependency digest mismatch')
    return {'url':url,'filename':path.name,'sha256':actual,'bytes':path.stat().st_size}

def main():
    download=ROOT/'private/tools'/('culling-dependencies-'+uuid.uuid4().hex[:8]);download.mkdir(parents=True)
    get(f'https://pypi.org/pypi/opencv-python-headless/{CV_VERSION}/json',download/'pypi.json')
    metadata=json.loads((download/'pypi.json').read_text());wheels=[x for x in metadata['urls'] if x['filename'].endswith('win_amd64.whl') and 'abi3' in x['filename']]
    if len(wheels)!=1:raise ValueError('Expected one public Windows abi3 wheel')
    wheel=wheels[0];receipt=get(wheel['url'],download/wheel['filename'],wheel['digests']['sha256'])
    get('https://api.github.com/repos/opencv/opencv_zoo/commits/main',download/'opencv-zoo-commit.json')
    commit=json.loads((download/'opencv-zoo-commit.json').read_text())['sha']
    relative='models/face_detection_yunet/face_detection_yunet_2023mar.onnx'
    get(f'https://raw.githubusercontent.com/opencv/opencv_zoo/{commit}/{relative}',download/'yunet-lfs-pointer.txt')
    pointer=(download/'yunet-lfs-pointer.txt').read_text();expected=[x.split('sha256:')[1] for x in pointer.splitlines() if x.startswith('oid sha256:')]
    if len(expected)!=1:raise ValueError('Expected authoritative Git LFS model digest')
    model=get(f'https://media.githubusercontent.com/media/opencv/opencv_zoo/{commit}/{relative}',download/'face_detection_yunet_2023mar.onnx',expected[0])
    license=get(f'https://raw.githubusercontent.com/opencv/opencv_zoo/{commit}/models/face_detection_yunet/LICENSE',download/'YuNet-LICENSE.txt')
    if 'MIT License' not in (download/'YuNet-LICENSE.txt').read_text():raise ValueError('Unexpected public model license')
    base=ROOT/'private/runtime/local-engine-base-abb72eb1'
    destination=ROOT/'private/runtime'/('culling-base-'+uuid.uuid4().hex[:8]);shutil.copytree(base,destination)
    extract(download/wheel['filename'],destination/'Runtime/Lib/site-packages')
    assets=destination/'PublicModels/YuNet';assets.mkdir(parents=True)
    for name in ['face_detection_yunet_2023mar.onnx','YuNet-LICENSE.txt']:shutil.copy2(download/name,assets/name)
    info=json.loads((destination/'runtime.json').read_text());info['directory']=str(destination)
    info['wheels'].append({'project':'opencv-python-headless','version':CV_VERSION,'publishedSha256Matched':True,**receipt})
    info['publicCullingModel']={'provider':'OpenCV Zoo','commit':commit,'license':'MIT','model':model,'licenseReceipt':license,'vendorNeurapixArtifactsUsed':False}
    (destination/'runtime.json').write_text(json.dumps(info,indent=2)+'\n')
    check=subprocess.run([str(destination/'Runtime/python.exe'),'-I','-c','import cv2,numpy;print(cv2.__version__,numpy.__version__,cv2.FaceDetectorYN is not None)'],capture_output=True,text=True,timeout=60)
    if check.returncode:raise RuntimeError(check.stderr)
    info['cullingRuntimeCheck']=check.stdout.strip();(destination/'runtime.json').write_text(json.dumps(info,indent=2)+'\n')
    (ROOT/'private/runtime/latest-culling.json').write_text(json.dumps({'directory':str(destination),'downloads':str(download)},indent=2)+'\n')
    print(json.dumps({'directory':str(destination),'downloads':str(download),'opencv':CV_VERSION,'modelSha256':model['sha256'],'check':check.stdout.strip()}),flush=True)

if __name__=='__main__':main()
