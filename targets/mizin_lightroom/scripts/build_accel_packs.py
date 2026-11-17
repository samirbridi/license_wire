"""Build the ONNX Runtime acceleration packs for the CRISPIX portable runtime (Python 3.13, Windows x64).

Two packs, each a self-contained folder that accelerator.py puts on sys.path only when chosen
(onnxruntime-gpu and onnxruntime-directml both install a module named `onnxruntime`, so they can
never share one site-packages):

  directml  onnxruntime-directml + flatbuffers/packaging/protobuf  -> shipped inside the plugin
            (Runtime/accel/directml). Any DirectX 12 GPU (NVIDIA, AMD, Intel); also has the CPU provider.
  cuda      onnxruntime-gpu + NVIDIA CUDA 13 runtime, cuBLAS, cuFFT, cuRAND, NVRTC, cuDNN 9
            -> optional component (~1 GB) downloaded on demand to %AppData%\\MizinLightroomLocal\\accel\\cuda.
            Requires an NVIDIA driver with CUDA 13 support (R580 or newer).

numpy is NOT copied into the packs: the plugin runtime already pins numpy and the packs must use it.

Usage:
  python scripts/build_accel_packs.py --wheels private/runtime/wheels --out private/runtime/accel
Writes <out>/directml/, <out>/cuda/, and <out>/CRISPIX-accel-cuda-<ort>.zip with a receipt JSON.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

COMMON = ('flatbuffers', 'packaging', 'protobuf')
PACKS = {
    'directml': {'runtime': 'onnxruntime_directml', 'extra': (), 'provider': 'DmlExecutionProvider'},
    'cuda': {'runtime': 'onnxruntime_gpu',
             'extra': ('nvidia_cuda_runtime', 'nvidia_cublas', 'nvidia_cufft', 'nvidia_curand',
                       'nvidia_cuda_nvrtc', 'nvidia_nvjitlink', 'nvidia_cudnn_cu13'),
             'provider': 'CUDAExecutionProvider', 'requiresCudaDriverMajor': 13},
}


def sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(4 << 20), b''):
            digest.update(block)
    return digest.hexdigest()


def wheel(wheels, prefix):
    found = sorted({p for p in wheels.rglob(prefix + '-*.whl')})
    if len(found) != 1:
        raise SystemExit(f'Esperava exatamente uma roda {prefix}, achei {len(found)} em {wheels}')
    return found[0]


def build(name, wheels, out):
    spec = PACKS[name]
    target = out / name
    if target.exists():
        shutil.rmtree(target)
    files = [wheel(wheels, spec['runtime'])] + [wheel(wheels, p) for p in COMMON + spec['extra']]
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--no-deps', '--no-compile', '--only-binary=:all:',
                    '--python-version', '3.13', '--implementation', 'cp', '--platform', 'win_amd64',
                    '--target', str(target), *map(str, files)], check=True)
    for cache in target.rglob('__pycache__'):
        shutil.rmtree(cache, ignore_errors=True)
    shutil.rmtree(target / 'bin', ignore_errors=True)  # console entry points, unused and absolute-pathed
    version = files[0].name.split('-')[1]
    manifest = {'schema': 'crispix.accel-pack/1', 'name': name, 'onnxruntime': version,
                'provider': spec['provider'], 'wheels': {f.name: sha(f) for f in files}}
    if 'requiresCudaDriverMajor' in spec:
        manifest['requiresCudaDriverMajor'] = spec['requiresCudaDriverMajor']
    (target / 'accel-pack.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    size = sum(p.stat().st_size for p in target.rglob('*') if p.is_file())
    print(f'{name}: onnxruntime {version}, {size / 2**20:.0f} MB')
    return target, manifest


def zip_pack(folder, archive):
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
        for path in sorted(p for p in folder.rglob('*') if p.is_file()):
            package.write(path, (Path(folder.name) / path.relative_to(folder)).as_posix())
    with zipfile.ZipFile(archive) as package:
        if package.testzip() is not None:
            raise SystemExit('CRC do ZIP falhou')


PART_BYTES = 250 * 2**20  # wrangler r2 object put refuses objects over 300 MiB


def split(archive, folder, public_base):
    """Cut the ZIP into R2-sized parts; Install-AccelPack.py joins them and checks every hash."""
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    parts = []
    with archive.open('rb') as stream:
        for number, block in enumerate(iter(lambda: stream.read(PART_BYTES), b''), 1):
            name = f'{archive.name}.{number:03}'
            (folder / name).write_bytes(block)
            parts.append({'name': name, 'bytes': len(block), 'sha256': hashlib.sha256(block).hexdigest(),
                          'url': f'{public_base.rstrip("/")}/{name}'})
    return parts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--wheels', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--public-base', default='https://pub-739d5fceaa824a6c8c84e39bb74ec917.r2.dev/accel')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    build('directml', args.wheels, args.out)
    folder, manifest = build('cuda', args.wheels, args.out)
    archive = args.out / f"CRISPIX-accel-cuda-ort{manifest['onnxruntime']}.zip"
    zip_pack(folder, archive)
    receipt = {'schema': 'crispix.accel-component/1', 'name': 'cuda', 'onnxruntime': manifest['onnxruntime'],
               'requiresCudaDriverMajor': manifest['requiresCudaDriverMajor'], 'archiveName': archive.name,
               'archiveSha256': sha(archive), 'bytes': archive.stat().st_size,
               'parts': split(archive, args.out / 'parts', args.public_base)}
    (args.out / 'accel-cuda.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
