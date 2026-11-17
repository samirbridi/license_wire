"""Pick the fastest ONNX Runtime execution provider that really works on this machine.

Order of preference (or a fixed choice from the plugin settings):
  cuda      NVIDIA CUDA 13 + cuDNN 9 (optional component in %AppData%\\MizinLightroomLocal\\accel\\cuda;
            needs an NVIDIA driver with CUDA >= 13, i.e. R580 or newer)
  directml  any DirectX 12 GPU (NVIDIA, AMD, Intel), shipped in Runtime/accel/directml
  cpu       the CPU provider bundled in the DirectML pack

A candidate is only chosen after a PROBE in its own process: create a session on a real ONNX model,
run it, and confirm the provider ONNX Runtime actually kept (ORT silently falls back to CPU when a GPU
provider fails to load). Separate processes because onnxruntime-gpu and onnxruntime-directml are both
the module `onnxruntime` and only one can be loaded per process. The decision is cached and redone
only when the GPU, driver, packs or preference change.

CLI (used by the plugin; prints JSON):
  accelerator.py --status --plugin <dir> [--preference auto|cuda|directml|cpu] [--refresh] [--cache-file f]
  accelerator.py --probe <name> --pack <dir> --model <onnx>      (internal: one probe per process)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ORDER = ('cuda', 'directml', 'cpu')
PROVIDERS = {'cuda': 'CUDAExecutionProvider', 'directml': 'DmlExecutionProvider', 'cpu': 'CPUExecutionProvider'}
LABELS = {'cuda': 'NVIDIA CUDA', 'directml': 'DirectML (GPU DirectX 12)', 'cpu': 'CPU'}
PREFERENCES = ('auto',) + ORDER
PROBE_MODEL = Path('PublicModels/YuNet/face_detection_yunet_2023mar.onnx')
PROBE_RUNS = 20
_dll_handles = []


def data_root() -> Path:
    return Path(os.environ.get('APPDATA', Path.home())) / 'MizinLightroomLocal'


def pack_dirs(plugin: Path, data: Path | None = None) -> dict:
    data = data or data_root()
    directml = plugin / 'Runtime' / 'accel' / 'directml'
    return {'cuda': data / 'accel' / 'cuda', 'directml': directml, 'cpu': directml}


def pack_manifest(path: Path) -> dict | None:
    try:
        manifest = json.loads((path / 'accel-pack.json').read_text(encoding='utf-8'))
        return manifest if manifest.get('schema') == 'crispix.accel-pack/1' else None
    except (OSError, ValueError):
        return None


def nvidia_driver() -> dict:
    """NVIDIA driver/GPU facts without loading any CUDA runtime (gpu_detector uses nvcuda.dll only)."""
    try:
        from gpu_detector import detect_cuda_driver
        info = detect_cuda_driver()
    except Exception as error:  # never let detection break the engine
        return {'available': False, 'reason': str(error)[:200]}
    if info.get('available'):
        text = str(info.get('driver', ''))
        try:
            info['cudaMajor'] = int(text.split()[-1].split('.')[0])
        except ValueError:
            info['cudaMajor'] = 0
    return info


def activate(pack: Path):
    """Make `import onnxruntime` load this pack (and its NVIDIA DLLs). Call before any onnxruntime import."""
    pack = pack.resolve()
    loaded = sys.modules.get('onnxruntime')
    if loaded is not None:
        if not Path(loaded.__file__).resolve().is_relative_to(pack):
            raise RuntimeError('Outro ONNX Runtime ja foi carregado neste processo')
        return loaded
    for folder in sorted(pack.glob('nvidia/*/bin')) + sorted(pack.glob('nvidia/*/bin/*')):
        if folder.is_dir():
            _dll_handles.append(os.add_dll_directory(str(folder)))
            os.environ['PATH'] = str(folder) + os.pathsep + os.environ.get('PATH', '')
    sys.path.insert(0, str(pack))
    import onnxruntime
    return onnxruntime


def session_options(ort, name: str):
    options = ort.SessionOptions()
    options.log_severity_level = 3
    if name == 'directml':  # DirectML requires these (ORT documentation)
        options.enable_mem_pattern = False
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
    return options


def provider_list(name: str, device_id: int = 0) -> list:
    if name == 'cuda':
        return [('CUDAExecutionProvider', {'device_id': device_id}), 'CPUExecutionProvider']
    if name == 'directml':
        return [('DmlExecutionProvider', {'device_id': device_id}), 'CPUExecutionProvider']
    return ['CPUExecutionProvider']


def create_session(model, name: str, pack: Path, device_id: int = 0):
    """Session on the requested provider; raises if ONNX Runtime fell back to another one."""
    ort = activate(pack)
    source = model if isinstance(model, (bytes, bytearray)) else str(model)
    session = ort.InferenceSession(source, sess_options=session_options(ort, name),
                                   providers=provider_list(name, device_id))
    used = session.get_providers()[0]
    if used != PROVIDERS[name]:
        raise RuntimeError(f'ONNX Runtime usou {used} em vez de {PROVIDERS[name]}')
    return session


def probe(name: str, pack: Path, model: Path) -> dict:
    """Runs IN A CHILD PROCESS: one real model, warm-up + timed runs, honest provider check."""
    import numpy as np
    started = time.perf_counter()
    session = create_session(model, name, pack)
    created = time.perf_counter() - started
    entry = session.get_inputs()[0]
    shape = [d if isinstance(d, int) and d > 0 else 640 for d in entry.shape]
    batch = np.random.default_rng(1729).random(shape, dtype=np.float32) * 255
    session.run(None, {entry.name: batch})  # warm-up (kernel compilation / allocation)
    timings = []
    for _ in range(PROBE_RUNS):
        start = time.perf_counter()
        session.run(None, {entry.name: batch})
        timings.append(time.perf_counter() - start)
    import onnxruntime
    return {'ok': True, 'name': name, 'provider': session.get_providers()[0],
            'onnxruntime': onnxruntime.__version__, 'sessionSeconds': round(created, 3),
            'medianMs': round(sorted(timings)[len(timings) // 2] * 1000, 2), 'input': shape}


def run_probe(name: str, pack: Path, model: Path, python: str | None = None, timeout: int = 180) -> dict:
    command = [python or sys.executable, '-I', str(Path(__file__).resolve()), '--probe', name,
               '--pack', str(pack), '--model', str(model)]
    try:
        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', errors='replace',
                                timeout=timeout, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
        if lines:
            return json.loads(lines[-1])
        return {'ok': False, 'name': name, 'error': (result.stderr or result.stdout or 'sem resposta').strip()[-400:]}
    except subprocess.TimeoutExpired:
        return {'ok': False, 'name': name, 'error': f'Teste excedeu {timeout} s'}


def fingerprint(plugin: Path, driver: dict, packs: dict, preference: str) -> str:
    parts = {'preference': preference, 'gpu': driver.get('primaryDevice'), 'driver': driver.get('driver'),
             'packs': {name: (pack_manifest(path) or {}).get('wheels') for name, path in packs.items()}}
    return hashlib.sha256(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()[:16]


def decide(plugin: Path, preference: str = 'auto', data: Path | None = None, prober=run_probe) -> dict:
    """Probe candidates in order; the first that really runs on its provider wins."""
    if preference not in PREFERENCES:
        raise ValueError('Preferencia de aceleracao invalida')
    packs = pack_dirs(plugin, data)
    driver = nvidia_driver()
    model = plugin / PROBE_MODEL
    order = ORDER if preference == 'auto' else (preference,) + tuple(n for n in ORDER if n != preference)
    candidates = []
    chosen = None
    for name in order:
        pack = packs[name]
        entry = {'name': name, 'label': LABELS[name]}
        manifest = pack_manifest(pack)
        if manifest is None:
            entry['status'] = 'NOT_INSTALLED' if name == 'cuda' else 'MISSING_FROM_PLUGIN'
        elif name == 'cuda' and not driver.get('available'):
            entry['status'] = 'NO_NVIDIA_GPU'
        elif name == 'cuda' and driver.get('cudaMajor', 0) < manifest.get('requiresCudaDriverMajor', 13):
            entry['status'] = 'DRIVER_TOO_OLD'
            entry['detail'] = (f"Driver com {driver.get('driver')}; a aceleracao NVIDIA precisa de CUDA "
                               f"{manifest.get('requiresCudaDriverMajor', 13)} (driver R580 ou mais novo).")
        else:
            # Every installed candidate is probed (once, then cached), so the panel shows real
            # timings for all of them; the choice still follows the order above.
            result = prober(name, pack, model)
            entry.update({k: v for k, v in result.items() if k not in ('name', 'ok')})
            entry['status'] = 'READY' if result.get('ok') else 'FAILED'
            if result.get('ok') and chosen is None:
                chosen = name
        candidates.append(entry)
    return {'schema': 'crispix.accelerator/1', 'preference': preference, 'chosen': chosen,
            'chosenLabel': LABELS.get(chosen, 'Nenhum (ONNX Runtime indisponivel)'),
            'nvidia': {k: driver.get(k) for k in ('available', 'primaryDevice', 'vram', 'driver', 'cudaMajor')},
            'candidates': candidates, 'fingerprint': fingerprint(plugin, driver, packs, preference),
            'decidedUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}


def status(plugin: Path, preference: str = 'auto', cache_file: Path | None = None, refresh: bool = False,
           data: Path | None = None, prober=run_probe) -> dict:
    cache_file = cache_file or (data or data_root()) / 'accelerator.json'
    if not refresh:
        try:
            cached = json.loads(cache_file.read_text(encoding='utf-8'))
            packs = pack_dirs(plugin, data)
            if cached.get('fingerprint') == fingerprint(plugin, nvidia_driver(), packs, preference):
                return cached
        except (OSError, ValueError):
            pass
    decision = decide(plugin, preference, data, prober)
    try:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = cache_file.with_name(cache_file.name + f'.tmp-{os.getpid()}')
        temporary.write_text(json.dumps(decision, indent=2, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, cache_file)
    except OSError:
        pass
    return decision


def session_for(model, plugin: Path, preference: str = 'auto', data: Path | None = None):
    """For engine code: (session, name) on the cached best provider, falling back down the order."""
    decision = status(plugin, preference, data=data)
    packs = pack_dirs(plugin, data)
    ready = [c['name'] for c in decision['candidates'] if c.get('status') == 'READY']
    errors = []
    for name in ready or ['cpu']:
        try:
            return create_session(model, name, packs[name]), name
        except Exception as error:
            errors.append(f'{name}: {error}')
    raise RuntimeError('Nenhum provedor ONNX Runtime funcionou: ' + '; '.join(errors))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--status', action='store_true')
    parser.add_argument('--plugin', type=Path)
    parser.add_argument('--preference', default='auto', choices=PREFERENCES)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--cache-file', type=Path)
    parser.add_argument('--data', type=Path, help='Pasta de dados (padrao %%AppData%%\\MizinLightroomLocal)')
    parser.add_argument('--probe', choices=ORDER)
    parser.add_argument('--pack', type=Path)
    parser.add_argument('--model', type=Path)
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    if args.probe:
        try:
            print(json.dumps(probe(args.probe, args.pack, args.model)))
        except Exception as error:
            print(json.dumps({'ok': False, 'name': args.probe, 'error': f'{type(error).__name__}: {error}'[:400]}))
        return
    plugin = args.plugin or Path(__file__).resolve().parents[1]
    print(json.dumps(status(plugin, args.preference, args.cache_file, args.refresh, data=args.data),
                     indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
