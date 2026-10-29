"""NAS update package built from evidence/private/nas-portal-build-XXXX (prepare-nas-package.py --code-only).

Without --with-bridge the go2rtc binary stays out (~30 MB, copied on the NAS from the previous build).
With --with-bridge it goes in, executable, for builds that change the bridge.
Writes nas-portal-build-XXXX-code.zip and compose-volume4-XXXX.yaml and prints path, size and SHA-256.

  python -I scripts/make-nas-code-zip.py evidence/private 0048 [--with-bridge]
"""
import argparse, hashlib, zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('private')
parser.add_argument('build')
parser.add_argument('--with-bridge', action='store_true')
args = parser.parse_args()
private = Path(args.private); build = args.build
root = private / f'nas-portal-build-{build}'
compose = (root / 'compose.yaml').read_text(encoding='utf-8').replace(
    'build: {context: ./app, dockerfile: Dockerfile}',
    f'build: {{context: /volume4/HDD 1TB - V2/Mizin-Home/nas-portal-build-{build}/app, dockerfile: Dockerfile}}')
assert f'nas-portal-build-{build}/app' in compose
(private / f'compose-volume4-{build}.yaml').write_text(compose, encoding='utf-8')
bridges = [p for p in root.rglob('go2rtc-linux-amd64')]
if args.with_bridge and not bridges:
    raise SystemExit('Bridge binary missing from the prepared package.')
out = private / f'nas-portal-build-{build}-code.zip'
with zipfile.ZipFile(out, 'x', zipfile.ZIP_DEFLATED) as z:
    def add(name, data, mode=0o600):
        info = zipfile.ZipInfo(name); info.create_system = 3; info.external_attr = (0o100000 | mode) << 16
        z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED)
    for p in root.rglob('*'):
        if not p.is_file():
            continue
        if p.name == 'go2rtc-linux-amd64':
            # Only the copy the bridge service runs; the duplicate under app/bridge is unused on the NAS.
            if not args.with_bridge or 'mizin-cameras' not in p.parts:
                continue
            add((Path(root.name) / p.relative_to(root)).as_posix(), p.read_bytes(), 0o700)
            print('bridge', hashlib.sha256(p.read_bytes()).hexdigest())
            continue
        add((Path(root.name) / p.relative_to(root)).as_posix(), p.read_bytes())
    add(f'{root.name}/compose-volume4.yaml', compose.encode('utf-8'))
print(out, out.stat().st_size, hashlib.sha256(out.read_bytes()).hexdigest())
