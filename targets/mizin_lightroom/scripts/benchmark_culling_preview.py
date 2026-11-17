"""Benchmark and agreement check for culling: RAW render vs embedded camera JPEG, sequential vs parallel.

Usage (with the packaged runtime, so rawpy/OpenCV match what Lightroom runs):
  <plugin>/Runtime/python.exe -I scripts/benchmark_culling_preview.py <plugin dir> <raw folder> <count> <out.json>

Reads RAW originals only (locked against writes while analysed); writes previews and the receipt
under a temporary job folder. Never touches a catalog.
"""
import json
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(cull, plugin, info, files, preview, workers):
    original = cull.worker_count
    cull.worker_count = lambda total: min(total, workers)
    try:
        with tempfile.TemporaryDirectory(prefix='crispix-bench-') as job:
            request = {'catalogIdentity': 'benchmark.lrcat', 'cullingOptions': {'maxPerGroup': 4, 'previewSource': preview},
                       'photos': [{'id': f'p{i:04}', 'path': str(p), 'isVirtualCopy': False} for i, p in enumerate(files)]}
            report = {'results': []}
            start = time.perf_counter()
            cull.run_culling(request, Path(job), plugin, info, report, lambda *a: None)
            report['seconds'] = time.perf_counter() - start
            return report
    finally:
        cull.worker_count = original


def summary(report):
    return {r['id']: {'keep': r.get('suggestedKeep'), 'group': r.get('groupId'), 'reasons': sorted(r.get('reviewReasons', [])),
                      'faces': r.get('faceCount'), 'focus': r.get('focusScore'), 'status': r['status']}
            for r in report['results']}


def main():
    plugin, folder, count, out = Path(sys.argv[1]), Path(sys.argv[2]), int(sys.argv[3]), Path(sys.argv[4])
    sys.path[:0] = [str(ROOT / 'reconstructed/local-engine'), str(plugin / 'Engine')]
    import culling_engine as cull
    info = json.loads((plugin / 'BuildInfo.json').read_text(encoding='utf-8-sig'))
    files = sorted(folder.glob('*.CR3'))[:count]
    runs = {'raw_sequential': run(cull, plugin, info, files, 'raw', 1),
            'raw_parallel': run(cull, plugin, info, files, 'raw', cull.worker_count(len(files))),
            'embedded_parallel': run(cull, plugin, info, files, 'embedded', cull.worker_count(len(files)))}
    base, par, emb = (summary(runs[k]) for k in ('raw_sequential', 'raw_parallel', 'embedded_parallel'))
    keys = sorted(base)
    flag = lambda s, k, r: r in s[k]['reasons']
    reasons = sorted({r for s in (base, emb) for k in keys for r in s[k]['reasons']})
    import numpy as np
    pairs = [(base[k]['focus'], emb[k]['focus']) for k in keys if base[k]['focus'] is not None and emb[k]['focus'] is not None]
    result = {
        'photos': len(keys), 'workers': cull.worker_count(len(files)),
        'seconds': {k: round(v['seconds'], 1) for k, v in runs.items()},
        'secondsPerPhoto': {k: round(v['seconds'] / len(keys), 3) for k, v in runs.items()},
        'parallelIdenticalToSequential': base == par,
        'embeddedVsRaw': {
            'keepAgreement': sum(base[k]['keep'] == emb[k]['keep'] for k in keys) / len(keys),
            'faceCountAgreement': sum(base[k]['faces'] == emb[k]['faces'] for k in keys) / len(keys),
            'groupCount': {'raw': len({base[k]['group'] for k in keys}), 'embedded': len({emb[k]['group'] for k in keys})},
            'focusSpearman': float(np.corrcoef(np.argsort(np.argsort([a for a, _ in pairs])),
                                               np.argsort(np.argsort([b for _, b in pairs])))[0, 1]) if len(pairs) > 2 else None,
            'reasons': {r: {'raw': sum(flag(base, k, r) for k in keys), 'embedded': sum(flag(emb, k, r) for k in keys),
                            'both': sum(flag(base, k, r) and flag(emb, k, r) for k in keys)} for r in reasons},
        },
    }
    out.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
