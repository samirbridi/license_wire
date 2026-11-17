"""Compare the camera's electronic-level roll angle (Canon MakerNotes RollAngle) with the
photographer's approved Lightroom CropAngle, photo by photo.

Usage:
  python scripts/evaluate_camera_roll.py --dataset private/raw-datasets/<id> \
      --exiftool <plugin>/Tools/ExifTool/exiftool.exe --output evidence/camera-roll-ground-truth.json

Split: first 360 rows = development, rest = holdout (same split as evaluate_scene_eyes.py).
"Closer"/"farther" use the note 37/40 thresholds: error reduced > 0.1 deg / increased > 0.2 deg.
"""
import argparse
import json
import statistics
import subprocess
from pathlib import Path


def residual_tilt(roll):
    """Roll relative to the nearest multiple of 90 degrees (vertical frames are ~ +-90)."""
    return roll - round(roll / 90.0) * 90.0


def read_rolls(exiftool, files):
    # Argument file: hundreds of paths exceed the Windows command-line limit.
    import tempfile
    with tempfile.NamedTemporaryFile('w', suffix='.args', delete=False, encoding='utf-8') as handle:
        handle.write('\n'.join(str(f) for f in files) + '\n')
        arg_file = handle.name
    try:
        args = [str(exiftool), '-charset', 'filename=utf8', '-j', '-n', '-RollAngle', '-PitchAngle',
                '-Orientation', '-Model', '-@', arg_file]
        out = subprocess.run(args, capture_output=True, check=True).stdout
    finally:
        Path(arg_file).unlink(missing_ok=True)
    return {Path(item['SourceFile']).name: item for item in json.loads(out.decode('utf-8'))}


def summarize(pairs, predict):
    closer = farther = proposals = 0
    errors_none, errors_rule = [], []
    for truth, tilt in pairs:
        proposal = predict(tilt)
        none_error = abs(truth)
        rule_error = abs(truth - proposal)
        errors_none.append(none_error)
        errors_rule.append(rule_error)
        if proposal != 0:
            proposals += 1
            if rule_error < none_error - 0.1:
                closer += 1
            elif rule_error > none_error + 0.2:
                farther += 1
    return {'photos': len(pairs), 'proposals': proposals, 'closer': closer, 'farther': farther,
            'maeDoNothing': round(statistics.mean(errors_none), 4),
            'maeRule': round(statistics.mean(errors_rule), 4),
            'withinHalfDegree': sum(e <= 0.5 for e in errors_rule)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, required=True)
    parser.add_argument('--exiftool', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--development', type=int, default=360)
    args = parser.parse_args()

    rows = [json.loads(line) for line in (args.dataset / 'paired-features.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    files = [args.dataset / row['rawRelative'] for row in rows]
    cache = args.dataset / 'camera-roll-metadata.json'
    if cache.exists():
        meta = json.loads(cache.read_text(encoding='utf-8'))
    else:
        meta = read_rolls(args.exiftool, files)
        cache.write_text(json.dumps(meta), encoding='utf-8')

    samples = []
    for index, row in enumerate(rows):
        crop_angle = row['currentParameters'].get('CropAngle')
        item = meta.get(Path(row['rawRelative']).name, {})
        if crop_angle is None or 'RollAngle' not in item:
            continue
        samples.append({'index': index, 'cropAngle': float(crop_angle), 'roll': float(item['RollAngle']),
                        'tilt': residual_tilt(float(item['RollAngle'])), 'pitch': item.get('PitchAngle'),
                        'orientation': item.get('Orientation'), 'vertical': abs(round(float(item['RollAngle']) / 90.0)) % 2 == 1})

    def corr(xs, ys):
        mx, my = statistics.mean(xs), statistics.mean(ys)
        sx = sum((x - mx) ** 2 for x in xs) ** .5
        sy = sum((y - my) ** 2 for y in ys) ** .5
        return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / (sx * sy)

    report = {'schema': 'mizin-lightroom.camera-roll-evaluation/1', 'dataset': str(args.dataset).replace('\\', '/'),
              'photosWithRollAndCropAngle': len(samples), 'rowsInDataset': len(rows),
              'models': sorted({str(m.get('Model')) for m in meta.values()})}
    for name, subset in (('all', samples), ('horizontal', [s for s in samples if not s['vertical']]),
                         ('vertical', [s for s in samples if s['vertical']])):
        if len(subset) > 2:
            report[f'correlation_cropAngle_vs_minusTilt_{name}'] = round(corr([s['cropAngle'] for s in subset], [-s['tilt'] for s in subset]), 4)
            report[f'count_{name}'] = len(subset)

    rules = {
        'minus_tilt': lambda t: -t,
        'minus_tilt_deadband_0.2': lambda t: -t if abs(t) >= 0.2 else 0.0,
        'minus_tilt_deadband_0.3': lambda t: -t if abs(t) >= 0.3 else 0.0,
        'minus_tilt_max_5': lambda t: -t if abs(t) <= 5 else 0.0,
        'minus_tilt_deadband_0.2_max_5': lambda t: -t if 0.2 <= abs(t) <= 5 else 0.0,
    }
    dev = [(s['cropAngle'], s['tilt']) for s in samples if s['index'] < args.development]
    hold = [(s['cropAngle'], s['tilt']) for s in samples if s['index'] >= args.development]
    report['rules'] = {name: {'development': summarize(dev, rule), 'holdout': summarize(hold, rule)} for name, rule in rules.items()}
    residuals = [s['cropAngle'] + s['tilt'] for s in samples]
    report['photographerMinusCamera'] = {'median': round(statistics.median(residuals), 4),
                                         'mean': round(statistics.mean(residuals), 4),
                                         'stdev': round(statistics.pstdev(residuals), 4)}
    report['largestDisagreements'] = sorted(({'index': s['index'], 'cropAngle': s['cropAngle'], 'roll': s['roll'],
                                              'vertical': s['vertical']} for s in samples),
                                            key=lambda s: -abs(s['cropAngle'] + residual_tilt(s['roll'])))[:12]
    text = json.dumps(report, indent=2)
    if args.output:
        args.output.write_text(text + '\n', encoding='utf-8')
    print(text)


if __name__ == '__main__':
    main()
