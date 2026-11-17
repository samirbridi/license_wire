"""Install the optional NVIDIA CUDA acceleration component into %AppData%\\MizinLightroomLocal\\accel\\cuda.

Runs detached from Lightroom (--detach) and reports {stage, percent, message} to --progress-file for
the native progress bar (same contract as the plugin updater). Steps:
  1. read the component manifest (accel-cuda.json: parts with SHA-256, total SHA-256);
  2. download every part (R2 objects are limited in size, so the ZIP is split), checking each hash;
  3. join the parts, check the total SHA-256, extract into a staging folder, validate accel-pack.json;
  4. swap staging -> accel\\cuda in one rename (the previous pack is removed only after);
  5. re-probe the providers (accelerator.py --refresh) and report the provider now chosen.
Nothing outside accel\\ is touched. Any failure leaves the previous state as it was.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

USER_AGENT = 'CRISPIX-Accel-Installer/1.0'


def write_progress(progress_file: Path, stage: str, percent: float, message: str, **extra):
    try:
        temporary = progress_file.with_name(f'{progress_file.name}.tmp-{os.getpid()}')
        temporary.write_text(json.dumps({'stage': stage, 'percent': round(max(0.0, min(1.0, percent)), 3),
                                         'message': message, **extra}, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, progress_file)
    except OSError:
        pass


def fetch(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def read_manifest(source: str) -> dict:
    text = fetch(source).decode('utf-8-sig') if source.startswith('https://') else \
        Path(source).read_text(encoding='utf-8-sig')
    manifest = json.loads(text)
    if manifest.get('schema') != 'crispix.accel-component/1' or manifest.get('name') != 'cuda':
        raise ValueError('Manifesto do componente de aceleracao invalido')
    parts = manifest.get('parts')
    if not isinstance(parts, list) or not parts or any(
            not str(p.get('url', '')).startswith('https://') or len(str(p.get('sha256', ''))) != 64 for p in parts):
        raise ValueError('Manifesto sem partes validas para download')
    return manifest


def download_parts(manifest: dict, archive: Path, progress_file: Path):
    total = int(manifest['bytes'])
    done = 0
    whole = hashlib.sha256()
    with archive.open('wb') as out:
        for number, part in enumerate(manifest['parts'], 1):
            digest = hashlib.sha256()
            request = urllib.request.Request(part['url'], headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                last = 0.0
                for block in iter(lambda: response.read(1 << 20), b''):
                    out.write(block)
                    digest.update(block)
                    whole.update(block)
                    done += len(block)
                    now = time.monotonic()
                    if now - last > 0.25:
                        last = now
                        write_progress(progress_file, 'downloading', 0.80 * done / total,
                                       f'Baixando parte {number} de {len(manifest["parts"])}: '
                                       f'{done / 2**20:.0f} MB de {total / 2**20:.0f} MB')
            if digest.hexdigest() != part['sha256'].lower():
                raise ValueError(f'Parte {number} chegou corrompida (SHA-256 diferente); nada foi instalado.')
    if whole.hexdigest() != manifest['archiveSha256'].lower():
        raise ValueError('Pacote completo com SHA-256 diferente do manifesto; nada foi instalado.')


def install(manifest_source: str, data: Path, progress_file: Path, engine: Path | None = None) -> dict:
    accel = data / 'accel'
    accel.mkdir(parents=True, exist_ok=True)
    write_progress(progress_file, 'downloading', 0.0, 'Lendo o manifesto do componente NVIDIA CUDA...')
    manifest = read_manifest(manifest_source)
    staging = Path(tempfile.mkdtemp(prefix='cuda.staging-', dir=accel))
    archive = staging / manifest['archiveName']
    try:
        download_parts(manifest, archive, progress_file)
        write_progress(progress_file, 'installing', 0.82, 'Extraindo bibliotecas NVIDIA (CUDA, cuDNN)...')
        with zipfile.ZipFile(archive) as package:
            names = package.namelist()
            if any(not n.startswith('cuda/') or '..' in Path(n).parts for n in names):
                raise ValueError('Pacote com caminhos fora da pasta esperada')
            package.extractall(staging)
        archive.unlink()
        pack = json.loads((staging / 'cuda' / 'accel-pack.json').read_text(encoding='utf-8'))
        if pack.get('schema') != 'crispix.accel-pack/1' or pack.get('onnxruntime') != manifest['onnxruntime']:
            raise ValueError('Conteudo do pacote nao corresponde ao manifesto')
        write_progress(progress_file, 'installing', 0.92, 'Ativando o componente...')
        target, previous = accel / 'cuda', accel / f'cuda.old-{os.getpid()}'
        if target.exists():
            target.rename(previous)
        (staging / 'cuda').rename(target)
        shutil.rmtree(previous, ignore_errors=True)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    decision = {}
    if engine is not None:
        write_progress(progress_file, 'installing', 0.95, 'Testando a GPU com o novo componente...')
        result = subprocess.run([sys.executable, '-I', str(engine / 'accelerator.py'), '--status', '--refresh',
                                 '--plugin', str(engine.parent), '--data', str(data)],
                                capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=600,
                                creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        try:
            decision = json.loads(result.stdout)
        except ValueError:
            decision = {}
    write_progress(progress_file, 'done', 1.0, 'Componente NVIDIA CUDA instalado.',
                   chosen=decision.get('chosen'), chosenLabel=decision.get('chosenLabel'))
    return decision


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True, help='URL https ou arquivo local accel-cuda.json')
    parser.add_argument('--progress-file', required=True, type=Path)
    parser.add_argument('--data', type=Path, default=Path(os.environ.get('APPDATA', Path.home())) / 'MizinLightroomLocal')
    parser.add_argument('--engine', type=Path, help='Pasta Engine do plugin (para testar a GPU ao final)')
    parser.add_argument('--detach', action='store_true')
    args = parser.parse_args()
    if args.detach:  # return to Lightroom at once; the real work continues in the background
        argv = [a for a in sys.argv[1:] if a != '--detach']
        subprocess.Popen([sys.executable, '-I', str(Path(__file__).resolve()), *argv], close_fds=True,
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0) |
                         getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0))
        return
    try:
        install(args.manifest, args.data, args.progress_file.resolve(), args.engine)
    except Exception as error:
        write_progress(args.progress_file.resolve(), 'error', 0.0, f'Falha ao instalar: {error}')
        sys.exit(1)


if __name__ == '__main__':
    main()
