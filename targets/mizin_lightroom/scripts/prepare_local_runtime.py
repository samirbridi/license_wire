"""Assemble an isolated Windows runtime from cached, hash-verified official files."""
import argparse
import hashlib
import json
import shutil
import stat
import subprocess
import uuid
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
PINNED = {
    'python-3.13.14-embed-amd64.zip': '90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907',
    'exiftool-13.60_64.zip': '548b1f4e0b713cd2a26824b34080c35db4e2d2edd166468eb38b1d55ada90c2e',
}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def extract(archive, destination):
    destination = Path(destination).resolve()
    seen = set()
    with zipfile.ZipFile(archive) as package:
        for member in package.infolist():
            name = PurePosixPath(member.filename.replace('\\', '/'))
            if name.is_absolute() or '..' in name.parts or any(':' in part for part in name.parts):
                raise ValueError('Unsafe archive path')
            resolved = destination.joinpath(*name.parts).resolve()
            if not resolved.is_relative_to(destination) or stat.S_ISLNK(member.external_attr >> 16):
                raise ValueError('Unsafe archive member')
            key = str(resolved).lower()
            if key in seen:
                raise ValueError('Duplicate archive member')
            seen.add(key)
            if member.is_dir():
                resolved.mkdir(parents=True, exist_ok=True)
            else:
                resolved.parent.mkdir(parents=True, exist_ok=True)
                with package.open(member) as source, resolved.open('xb') as output:
                    shutil.copyfileobj(source, output)


def prepare(downloads):
    downloads = Path(downloads)
    wheel_receipts = json.loads((downloads / 'wheel-receipts.json').read_text(encoding='utf-8'))
    if {r['project'].lower() for r in wheel_receipts} != {'numpy', 'rawpy', 'pillow'} or len(wheel_receipts) != 3:
        raise ValueError('Expected three pinned wheels')
    for filename, expected in PINNED.items():
        if digest(downloads / filename) != expected:
            raise ValueError('Dependency SHA-256 mismatch: ' + filename)
    for item in wheel_receipts:
        if digest(downloads / 'wheels' / item['filename']) != item['sha256']:
            raise ValueError('Wheel SHA-256 mismatch')
    staging = ROOT / 'private' / 'runtime' / ('local-engine-base-' + uuid.uuid4().hex[:8])
    runtime = staging / 'Runtime'
    runtime.mkdir(parents=True, exist_ok=False)
    extract(downloads / 'python-3.13.14-embed-amd64.zip', runtime)
    site = runtime / 'Lib' / 'site-packages'
    for wheel in wheel_receipts:
        extract(downloads / 'wheels' / wheel['filename'], site)
    # No user site, registry paths, pip or environment-based Python modules.
    (runtime / 'python313._pth').write_text('python313.zip\n.\nLib/site-packages\n../Engine\n', encoding='utf-8')
    tool_staging = staging / 'exiftool-original'
    extract(downloads / 'exiftool-13.60_64.zip', tool_staging)
    executables = list(tool_staging.rglob('exiftool(-k).exe'))
    if len(executables) != 1:
        raise ValueError('Unexpected ExifTool archive layout')
    exif = staging / 'Tools' / 'ExifTool'
    shutil.copytree(executables[0].parent, exif)
    (exif / 'exiftool(-k).exe').rename(exif / 'exiftool.exe')
    source_licenses = ROOT / 'private' / 'tools' / 'exiftool'
    for name in ('README', 'LICENSE', 'META.json'):
        source = source_licenses / name
        if source.is_file():
            shutil.copy2(source, exif / ('source-' + name))
    sources = json.loads((downloads / 'source-receipts.json').read_text(encoding='utf-8'))
    source_output = staging / 'ThirdPartySources'
    source_output.mkdir()
    for item in sources:
        source = downloads / item['filename']
        if digest(source) != item['sha256']:
            raise ValueError('Corresponding source SHA-256 mismatch')
        shutil.copy2(source, source_output / source.name)
    check = subprocess.run([str(runtime / 'python.exe'), '-I', '-c',
                            'import sys,numpy,rawpy,PIL; print(sys.version); print(numpy.__version__,rawpy.__version__,PIL.__version__,sys.flags.isolated)'],
                           capture_output=True, text=True, timeout=60)
    if check.returncode:
        raise RuntimeError(check.stderr)
    receipt = {'schema': 'mizin-lightroom.local-runtime/1', 'directory': str(staging),
               'pythonOfficialPublishedSha256Matched': True, 'exiftoolOriginalArchiveSha256': PINNED['exiftool-13.60_64.zip'],
               'wheels': wheel_receipts, 'sources': sources, 'runtimeCheck': check.stdout.strip(),
               'downloads': json.loads((downloads / 'downloads.json').read_text(encoding='utf-8'))}
    (staging / 'runtime.json').write_text(json.dumps(receipt, indent=2), encoding='utf-8')
    return receipt


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--downloads', type=Path, default=ROOT / 'private/tools/local-engine-downloads')
    args = parser.parse_args()
    print(json.dumps(prepare(args.downloads)))
