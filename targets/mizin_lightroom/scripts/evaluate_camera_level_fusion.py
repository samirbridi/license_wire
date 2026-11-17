"""Replay horizon_analysis.apply_camera_level on stored detector results versus the
photographer's approved CropAngle (note 48).

Inputs (no RAW decoding needed):
  - <dataset>/paired-features.jsonl          photographer CropAngle per row
  - <dataset>/camera-roll-metadata.json      written by evaluate_camera_roll.py (RollAngle per RAW)
  - evidence/scene-eyes-perspective-development.json + evidence/scene-eyes-holdout.json
    (analyze_image output per row, the same detector the engine runs)

Each policy result is applied the way PhotoEditor.lua does: only PROPOSAL_ONLY with
0.25 <= |angle| <= 8, rounded to 0.01 degree. Split and closer/farther thresholds follow
notes 37/40: development = first 360 rows; closer = error reduced > 0.1 deg, farther =
error increased > 0.2 deg.
"""
import argparse
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from horizon_analysis import apply_camera_level  # noqa: E402


def lua_angle(result):
    if not isinstance(result, dict) or result.get('status') != 'PROPOSAL_ONLY':
        return None
    angle = result.get('imageSlopeDegrees')
    if not isinstance(angle, (int, float)) or abs(angle) < .25 or abs(angle) > 8:
        return None
    return round(angle * 100) / 100


def summarize(samples, key):
    closer = farther = proposals = 0
    none_errors, errors = [], []
    for s in samples:
        angle = s[key]
        none_error = abs(s['truth'])
        error = abs(s['truth'] - (angle or 0.0))
        none_errors.append(none_error)
        errors.append(error)
        if angle is not None:
            proposals += 1
            if error < none_error - .1:
                closer += 1
            elif error > none_error + .2:
                farther += 1
    return {'photos': len(samples), 'proposals': proposals, 'closer': closer, 'farther': farther,
            'unchangedWithinThresholds': proposals - closer - farther,
            'meanErrorDoNothing': round(statistics.mean(none_errors), 4),
            'meanError': round(statistics.mean(errors), 4),
            'medianError': round(statistics.median(errors), 4),
            'withinHalfDegree': sum(e <= .5 for e in errors)}


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--development', type=int, default=360)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    rows = [json.loads(line) for line in (args.dataset / 'paired-features.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    meta = json.loads((args.dataset / 'camera-roll-metadata.json').read_text(encoding='utf-8'))
    detector = {}
    for name in ('scene-eyes-perspective-development.json', 'scene-eyes-holdout.json'):
        for item in json.loads((root / 'evidence' / name).read_text(encoding='utf-8'))['rows']:
            detector[item['index']] = item['new']
    samples, outcomes = [], {}
    for index, row in enumerate(rows):
        truth = row['currentParameters'].get('CropAngle')
        roll = meta.get(Path(row['rawRelative']).name, {}).get('RollAngle')
        if truth is None or index not in detector:
            continue
        fused = apply_camera_level(detector[index], roll)
        label = fused.get('evidence') or fused.get('reason')
        outcomes[label] = outcomes.get(label, 0) + 1
        samples.append({'index': index, 'truth': float(truth), 'current': lua_angle(detector[index]),
                        'fusion': lua_angle(fused)})
    report = {'schema': 'mizin-lightroom.camera-level-fusion/1', 'dataset': str(args.dataset).replace('\\', '/'),
              'photos': len(samples), 'policyOutcomes': dict(sorted(outcomes.items()))}
    for split, subset in (('development', [s for s in samples if s['index'] < args.development]),
                          ('holdout', [s for s in samples if s['index'] >= args.development])):
        report[split] = {'currentDetector': summarize(subset, 'current'), 'cameraLevelFusion': summarize(subset, 'fusion')}
    text = json.dumps(report, indent=2)
    if args.output:
        args.output.write_text(text + '\n', encoding='utf-8')
    print(text)


if __name__ == '__main__':
    main()
