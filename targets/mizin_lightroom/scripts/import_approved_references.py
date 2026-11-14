"""Validate native reference exports and create an immutable, deduplicated dataset.

This imports data only. It never fits/activates a model or touches the RAW files.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import math
import re
import unicodedata
import uuid
import zipfile
from pathlib import Path, PureWindowsPath

ROOT = Path(__file__).resolve().parents[1]
TARGETS = ('Exposure2012', 'Temperature', 'Tint', 'Contrast2012', 'Highlights2012',
           'Shadows2012', 'Whites2012', 'Blacks2012', 'Saturation', 'Vibrance')
MAX_FILE_BYTES = 64 * 1024 * 1024
MAX_LINE_BYTES = 256 * 1024
APPEARANCE_BOUNDS = {'skinR': (0, 1), 'skinG': (0, 1), 'skinB': (0, 1),
                     'skinRedBlueRatio': (0, 100), 'skinRedGreenRatio': (0, 100),
                     'faceConfidence': (0, 1), 'skinSampledPixels': (1, 1048576)}
CAPTURE = re.compile(r'^(\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2})(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z)?$')


def strict_json(text):
    def constant(value):
        raise ValueError('Nonfinite JSON number')
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(text, parse_constant=constant, object_pairs_hook=pairs)


def normalized_event(name):
    if not isinstance(name, str) or any(ord(c) < 32 for c in name):
        raise ValueError('Invalid event label')
    value = ' '.join(unicodedata.normalize('NFKC', name).split())
    if not 1 <= len(value) <= 160:
        raise ValueError('Invalid event label length')
    return value, hashlib.sha256(value.casefold().encode('utf-8')).hexdigest()


def validate(row, model):
    if not isinstance(row, dict) or row.get('schema') != 'mizin-lightroom.approved-reference/1':
        raise ValueError('Unsupported reference schema')
    if row.get('approvalStatus') != 'REFERENCE_APPROVED_BY_PHOTOGRAPHER' or row.get('approvalSource') not in (
            'USER_CONFIRMED_REVIEWED_SELECTION_IN_PLUGIN','USER_CONFIRMED_APPROVED_CATALOG_IN_PLUGIN',
            'USER_CONFIRMED_COMPLETED_EVENT_IN_PLUGIN'):
        raise ValueError('Explicit reference approval missing')
    if row.get('modelTrainingPerformed') is not False or row.get('sourceMetadataStable') is not True:
        raise ValueError('Invalid collection provenance')
    if row.get('parameterScope') != 'TEN_BASIC_GLOBAL_DEVELOP_CONTROLS' or row.get('styleVariant') not in ('color', 'monochrome'):
        raise ValueError('Unsupported parameter scope/treatment')
    if row.get('inputDomain') != model['inputDomain']:
        raise ValueError('Rendering input domain mismatch')
    if row.get('rawpyVersion') not in model['rawpyVersions'] or row.get('librawVersion') not in model['librawVersions']:
        raise ValueError('Decoder version mismatch')
    if row.get('cameraModel') not in model['supportedCameraModels']:
        raise ValueError('Unsupported camera model')
    if not isinstance(row.get('features'), dict) or row.get('featureNames') != model['featureNames'] or set(row['features']) != set(model['featureNames']):
        raise ValueError('Feature schema mismatch')
    if not isinstance(row.get('currentParameters'), dict) or set(row['currentParameters']) != set(TARGETS):
        raise ValueError('Missing or extra approved parameter')
    for values in (row['features'], row['currentParameters']):
        if any(type(value) not in (int, float) or not math.isfinite(value) for value in values.values()):
            raise ValueError('Nonfinite or nonnumeric reference value')
    if row['currentParameters']['Temperature'] <= 0:
        raise ValueError('Invalid Kelvin reference')
    digest = row.get('rawSha256', '')
    if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
        raise ValueError('Invalid RAW identity hash')
    path = row.get('sourcePath')
    if not isinstance(path, str) or any(ord(c) < 32 for c in path):
        raise ValueError('Invalid source path')
    source = PureWindowsPath(path)
    if not source.is_absolute() or source.suffix.lower() != '.cr3' or '..' in source.parts:
        raise ValueError('Expected absolute CR3 source path')
    name, event_id = normalized_event(row.get('eventName'))
    if row.get('eventGroupId') != event_id:
        raise ValueError('Event label and identity disagree')
    capture = row.get('captureTimeExif', '')
    match = CAPTURE.fullmatch(capture) if isinstance(capture, str) else None
    if not match:
        raise ValueError('Invalid original capture time')
    dt.datetime.strptime(match[1], '%Y:%m:%d %H:%M:%S')
    # Validate the optional offset without interpreting an unzoned EXIF time as UTC.
    dt.datetime.fromisoformat(capture[:10].replace(':', '-') + 'T' + capture[11:])
    try:
        approved = dt.datetime.fromisoformat(row['approvedUtc'])
        uuid.UUID(row['jobId'])
    except (KeyError, TypeError, ValueError):
        raise ValueError('Invalid approval time or native job identity') from None
    if approved.tzinfo is None:
        raise ValueError('Approval time needs timezone')
    if not re.fullmatch(r'v\d+\.\d+\.\d+ \(build \d{4}\)', row.get('collectorVersion', '')):
        raise ValueError('Invalid collector version')
    if not isinstance(row.get('lightroomVersion'), str) or not re.match(r'^\d+\.\d+', row['lightroomVersion']):
        raise ValueError('Native Lightroom provenance missing; development fixtures are not training data')
    result = {key: row[key] for key in ('schema', 'rawSha256', 'cameraModel', 'captureTimeExif', 'approvalStatus',
              'approvalSource', 'approvedUtc', 'parameterScope', 'styleVariant', 'inputDomain', 'rawpyVersion',
              'librawVersion', 'sourceMetadataStable', 'collectorVersion', 'lightroomVersion', 'jobId', 'modelTrainingPerformed')}
    result.update({'sourcePath': str(source), 'eventName': name, 'eventGroupId': event_id,
                   'featureNames': list(model['featureNames']),
                   'features': {k: float(row['features'][k]) for k in model['featureNames']},
                   'currentParameters': {k: float(row['currentParameters'][k]) for k in TARGETS}})
    if 'extendedParameters' in row:
        extra = row['extendedParameters']
        from develop_targets import bounds_for, extended_labels
        allowed = set(bounds_for(row['styleVariant']))
        if not isinstance(extra, dict) or not set(extra).issubset(allowed):
            raise ValueError('Unsupported extended parameters')
        result['extendedParameters'] = extended_labels(extra, row['styleVariant'])
    appearance = row.get('appearanceFeatures', {})
    if not isinstance(appearance, dict) or not set(appearance).issubset(APPEARANCE_BOUNDS):
        raise ValueError('Unsupported appearance features')
    for key, value in appearance.items():
        low, high = APPEARANCE_BOUNDS[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
            raise ValueError('Invalid appearance feature')
    if appearance:
        result['appearanceFeatures'] = dict(appearance)
    return result


def equivalent(first, second):
    if first.get('appearanceFeatures', {}) != second.get('appearanceFeatures', {}):
        return False
    if first.get('extendedParameters', {}) != second.get('extendedParameters', {}):
        return False
    if any(first[key] != second[key] for key in ('eventGroupId', 'cameraModel', 'captureTimeExif', 'inputDomain', 'rawpyVersion', 'librawVersion')):
        return False
    return all(math.isclose(first[field][key], second[field][key], rel_tol=1e-12, abs_tol=1e-9)
               for field in ('features', 'currentParameters') for key in first[field])


def package_payload(content):
    """Read fixed ZIP members in memory; no filesystem extraction or code loading."""
    names = {'manifest.json', 'references.jsonl', 'request.json', 'results.json'}
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        infos = archive.infolist()
        if len(infos) != 4 or {info.filename for info in infos} != names:
            raise ValueError('Reference package must contain exactly four data files')
        if any(info.file_size > 8 * 1024 * 1024 or info.flag_bits & 1 for info in infos):
            raise ValueError('Oversized or encrypted reference package')
        payloads = {info.filename: archive.read(info) for info in infos}
    manifest = strict_json(payloads.pop('manifest.json').decode('utf-8-sig'))
    if manifest.get('schema') != 'mizin-lightroom.reference-package/1' or manifest.get('containsPixels') is not False:
        raise ValueError('Unsupported reference package schema')
    if not isinstance(manifest.get('files'), dict) or set(manifest['files']) != set(payloads):
        raise ValueError('Reference package manifest incomplete')
    for name, data in payloads.items():
        item = manifest['files'][name]
        if item.get('bytes') != len(data) or item.get('sha256') != hashlib.sha256(data).hexdigest():
            raise ValueError('Reference package integrity mismatch')
    request = strict_json(payloads['request.json'].decode('utf-8-sig'))
    report = strict_json(payloads['results.json'].decode('utf-8-sig'))
    rows = [strict_json(line) for line in payloads['references.jsonl'].decode('utf-8-sig').splitlines() if line.strip()]
    if request.get('operation') != 'collect' or report.get('operation') != 'collect' or not rows:
        raise ValueError('Reference package is not a completed collection export')
    if report.get('status') not in ('COMPLETED', 'COMPLETED_WITH_ERRORS', 'COMPLETED_WITH_SKIPS', 'CANCELLED'):
        raise ValueError('Reference package has unsuccessful collection state')
    if (type(manifest.get('referenceCount')) is not int or len(rows) != manifest['referenceCount'] or
            len(rows) != report.get('collectedReferences') or manifest.get('collectionStatus') != report.get('status')):
        raise ValueError('Reference package counts/status disagree')
    if (manifest.get('jobId') != request.get('jobId') or manifest.get('jobId') != report.get('jobId') or
            any(row.get('jobId') != manifest.get('jobId') or row.get('collectorVersion') != manifest.get('collectorVersion') for row in rows)):
        raise ValueError('Reference package job identities disagree')
    return payloads['references.jsonl']


def load_sources(paths, model):
    rows, duplicates, sources = {}, [], []
    count = 0
    for path in map(Path, paths):
        before = path.stat()
        if before.st_size > MAX_FILE_BYTES:
            raise ValueError('Reference export too large')
        content = path.read_bytes()
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError('Reference export changed while reading')
        sources.append({'path': str(path.resolve()), 'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content), 'content': content})
        data = package_payload(content) if path.suffix.lower() == '.zip' else content
        for number, line in enumerate(data.decode('utf-8-sig').splitlines(), 1):
            if not line.strip():
                continue
            if len(line.encode('utf-8')) > MAX_LINE_BYTES:
                raise ValueError('Reference line too large')
            try:
                row = validate(strict_json(line), model)
            except (ValueError, KeyError, TypeError) as error:
                raise ValueError(f'{path.name}:{number}: {error}') from error
            count += 1
            if count > 100000:
                raise ValueError('Too many references in one import')
            key = row['rawSha256']
            if key in rows:
                if not equivalent(rows[key], row):
                    raise ValueError('Conflicting approval/features/event for the same RAW hash; select an explicit revision')
                duplicates.append({'source': path.name, 'line': number, 'rawSha256': key})
            else:
                rows[key] = row
    if not rows:
        raise ValueError('No approved references')
    return list(rows.values()), duplicates, sources


def import_sources(paths, model_path, output_root):
    model_bytes = Path(model_path).read_bytes()
    model = strict_json(model_bytes.decode('utf-8-sig'))
    rows, duplicates, sources = load_sources(paths, model)
    groups = {}
    for row in rows:
        group = groups.setdefault(row['eventGroupId'], {'eventName': row['eventName'], 'referenceCount': 0})
        group['referenceCount'] += 1
    collection_target = sum(group['referenceCount'] >= 50 for group in groups.values()) >= 3
    folder = Path(output_root) / ('import-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex[:8])
    folder.mkdir(parents=True, exist_ok=False)
    (folder / 'original-exports').mkdir()
    for index, source in enumerate(sources):
        saved = folder / 'original-exports' / (f'{index:03}-' + Path(source['path']).name)
        with saved.open('xb') as stream:
            stream.write(source['content'])
        del source['content']
        source['preservedRelative'] = saved.relative_to(folder).as_posix()
    data = folder / 'references.jsonl'
    with data.open('x', encoding='utf-8', newline='\n') as stream:
        for row in sorted(rows, key=lambda r: (r['eventGroupId'], r['rawSha256'])):
            stream.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + '\n')
    report = {'schema': 'mizin-lightroom.approved-reference-dataset/1', 'status': 'VALIDATED_DATA_ONLY',
              'uniqueReferences': len(rows), 'exactDuplicatesRemoved': len(duplicates), 'eventCount': len(groups),
              'eventGroups': groups, 'collectionTargetMet': collection_target,
              'collectionTarget': {'events': 3, 'uniqueReferencesPerEvent': 50},
              'trainingPerformed': False, 'modelActivated': False, 'productionQualityApproved': False,
              'identityAssurance': 'SHA256_REPORTED_BY_NATIVE_COLLECTOR; RAW_BYTES_NOT_REHASHED_BY_IMPORTER',
              'nextAction': 'DESIGN_EVENT_HOLDOUT_BEFORE_FITTING' if collection_target else 'COLLECT_MORE_APPROVED_EVENTS_AND_VARIETY',
              'sources': sources, 'deduplication': duplicates, 'normalizedDataSha256': hashlib.sha256(data.read_bytes()).hexdigest(),
              'validationContractModelSha256': hashlib.sha256(model_bytes).hexdigest(),
              'privateDirectory': str(folder)}
    (folder / 'dataset.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--inputs', type=Path, nargs='+', required=True)
    parser.add_argument('--model', type=Path, required=True)
    parser.add_argument('--output-root', type=Path, default=ROOT / 'private/reference-datasets')
    args = parser.parse_args()
    print(json.dumps(import_sources(args.inputs, args.model, args.output_root), ensure_ascii=True))
