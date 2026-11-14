"""Offline read-only comparison against preserved photographer CropAngle labels.

Use first 360 rows for development; freeze code before inspecting rows 360 onward.
This is a within-event check, not independent multi-event photographic validation.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
import time
import os

# Match the shipped engine bootstrap before NumPy is imported.
os.environ['OPENBLAS_NUM_THREADS']='1'
os.environ['MKL_NUM_THREADS']='1'
os.environ['OMP_NUM_THREADS']='2'

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'reconstructed/local-engine'))
sys.path.insert(0, str(ROOT / 'scripts'))
from culling_engine import create_detector
from horizon_analysis import analyze_image, combine_scene_eyes


def metrics(rows, field):
    proposed = [row for row in rows if row[field]['status'] == 'PROPOSAL_ONLY']
    closer = farther = 0
    errors = []
    for row in rows:
        angle = row[field].get('imageSlopeDegrees', 0) if row[field]['status'] == 'PROPOSAL_ONLY' else 0
        error = abs(angle-row['photographer'])
        errors.append(error)
        if row[field]['status'] == 'PROPOSAL_ONLY':
            closer += error < abs(row['photographer'])-.1
            farther += error > abs(row['photographer'])+.2
    return {'photos': len(rows), 'proposals': len(proposed), 'closer': closer, 'farther': farther,
            'meanAbsoluteErrorDegrees': sum(errors)/max(1, len(errors)),
            'evidence': dict(Counter(row[field].get('evidence', row[field].get('reason')) for row in rows))}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path)
    parser.add_argument('--bundle', type=Path)
    parser.add_argument('--replay-measurements', type=Path,
                        help='Recompute only final decisions from a prior measured report; does not rerun detection.')
    parser.add_argument('--start', type=int, default=0)
    parser.add_argument('--limit', type=int, default=360)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.replay_measurements:
        source = args.replay_measurements
        data = json.loads(source.read_text(encoding='utf-8'))
        for row in data['rows']:
            old = row['new']; scene = old['scene']
            result = combine_scene_eyes(row['legacy'], scene['horizontal'], scene['vertical'], old['eyes'])
            result['scene']['perspectiveVertical'] = scene['perspectiveVertical']
            result.update(imageWidth=old['imageWidth'], imageHeight=old['imageHeight'])
            row['new'] = result
        data.update(sourceSha256=hashlib.sha256(Path(__file__).with_name('horizon_analysis.py').read_bytes()).hexdigest(),
                    measuredSourceSha256=data['sourceSha256'], replayedFrom=str(source),
                    replayedMeasurementsSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                    replayScope='Final decisions only; cached unchanged line/eye/vanishing-point measurements.',
                    new=metrics(data['rows'], 'new'))
        args.output.write_text(json.dumps(data, indent=2)+'\n', encoding='utf-8')
        print(json.dumps(data['new'], indent=2))
        return
    if not args.dataset or not args.bundle:
        parser.error('--dataset and --bundle are required unless replaying measured evidence')
    labels = args.dataset / 'paired-features.jsonl'
    data = [json.loads(line) for line in labels.read_text(encoding='utf-8').splitlines() if line.strip()]
    info = json.loads((args.bundle / 'BuildInfo.json').read_text(encoding='utf-8'))
    detector = create_detector(args.bundle, info)
    started, results = time.time(), []
    import cv2
    for index in range(args.start, min(len(data), args.start+args.limit)):
        row = data[index]
        angle = row['currentParameters'].get('CropAngle')
        if angle is None:
            continue
        result = analyze_image(args.dataset/row['inputJpegRelative'], detector, include_legacy=True)
        legacy = result.pop('legacy')
        results.append({'index': index, 'photographer': angle, 'legacy': legacy, 'new': result})
        if len(results) % 30 == 0:
            print(f'Analyzed {len(results)} photos', flush=True)
    summary = {'sourceSha256': hashlib.sha256(Path(__file__).with_name('horizon_analysis.py').read_bytes()).hexdigest(),
               'labelSha256': hashlib.sha256(labels.read_bytes()).hexdigest(),
               'faceModelSha256': info['cullingFaceModelSha256'],
               'opencvVersion': cv2.__version__,
               'start': args.start, 'limit': args.limit, 'withinEventOnly': True,
               'legacy': metrics(results, 'legacy'), 'new': metrics(results, 'new'),
               'eyes': dict(Counter(row['new']['eyes']['status'] for row in results)),
               'seconds': time.time()-started, 'rows': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({k:v for k,v in summary.items() if k != 'rows'}, indent=2))


if __name__ == '__main__':
    main()
