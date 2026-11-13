"""Measures the horizon feature against the photographer's own Lightroom leveling.

Ground truth: a preserved raw dataset (paired-features.jsonl) whose approved Lightroom
settings include CropAngle/CropTop/CropLeft/CropBottom/CropRight, plus the technical
render the engine analyzes for each RAW. Two checks:

1. Crop convention: every centered straighten Lightroom wrote is compared with the
   corner model used by PhotoEditor.lua (M.cropFor).
2. Detector: analyze_image on each render versus the photographer's CropAngle; a proposal
   counts as closer when it reduces the angle error by >0.1 degree, farther when it adds
   >0.2 degree.

Usage: python scripts/evaluate_horizon_ground_truth.py private/raw-datasets/<id> [--output file.json]
Reads only; writes the optional JSON summary.
"""
import argparse
import collections
import json
import math
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))


def lightroom_crop(angle, sensor_width, sensor_height):
    """Python twin of PhotoEditor.lua M.cropFor without the safety shrink."""
    a = math.radians(abs(angle))
    scale = min(sensor_width/(sensor_width*math.cos(a)+sensor_height*math.sin(a)),
                sensor_height/(sensor_width*math.sin(a)+sensor_height*math.cos(a)))
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    return .5-scale/2*(c+sensor_width/sensor_height*s), .5-scale/2*(c-sensor_height/sensor_width*s)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('dataset', type=Path)
    parser.add_argument('--output', type=Path)
    parser.add_argument('--skip-detector', action='store_true')
    args = parser.parse_args()
    rows = [json.loads(line) for line in (args.dataset/'paired-features.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    crop = collections.Counter()
    for row in rows:
        p = row['currentParameters']
        if any(k not in p for k in ('CropAngle', 'CropTop', 'CropLeft', 'CropBottom', 'CropRight')) or abs(p['CropAngle']) < .2:
            continue
        top, left = p['CropTop'], p['CropLeft']
        if abs(top-(1-p['CropBottom'])) > .002 or abs(left-(1-p['CropRight'])) > .002:
            continue  # off-center crop: framing decision, not a pure straighten
        w, h = row['renderWidth'], row['renderHeight']
        predicted = lightroom_crop(p['CropAngle'], max(w, h), min(w, h))  # landscape sensor (CR3)
        crop['matches' if max(abs(predicted[0]-top), abs(predicted[1]-left)) < .002 else 'tightenedByHand'] += 1
    summary = {'photos': len(rows), 'centeredStraightens': dict(crop)}
    if not args.skip_detector:
        from horizon_analysis import analyze_image
        started = time.time()
        closer = farther = level_false = 0
        reasons, pairs = collections.Counter(), []
        for row in rows:
            angle = row['currentParameters'].get('CropAngle')
            if angle is None:
                continue
            result = analyze_image(args.dataset/row['inputJpegRelative'])
            if result['status'] != 'PROPOSAL_ONLY':
                reasons[result.get('reason')] += 1
                continue
            detected = result['imageSlopeDegrees']
            error = abs(detected-angle)
            closer += error < abs(angle)-.1
            farther += error > abs(angle)+.2
            level_false += abs(angle) < .3 and error > .4
            pairs.append({'photographer': angle, 'detector': round(detected, 2), 'evidence': result.get('evidence')})
        summary.update({'withCropAngle': sum(r['currentParameters'].get('CropAngle') is not None for r in rows),
                        'straightenedByPhotographer': sum(abs(r['currentParameters'].get('CropAngle') or 0) >= .3 for r in rows),
                        'proposals': len(pairs), 'closerToPhotographer': closer, 'fartherFromPhotographer': farther,
                        'levelFalsePositives': level_false, 'keepReasons': dict(reasons), 'pairs': pairs,
                        'secondsPerPhoto': round((time.time()-started)/max(1, len(rows)), 3)})
    text = json.dumps(summary, indent=1, ensure_ascii=False)
    if args.output:
        args.output.write_text(text+'\n', encoding='utf-8')
    print(text)


if __name__ == '__main__':
    main()
