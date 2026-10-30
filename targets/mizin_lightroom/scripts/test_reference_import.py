import copy
import hashlib
import json
import tempfile
import unittest
import uuid
from pathlib import Path

from import_approved_references import import_sources, load_sources, normalized_event, validate, strict_json, TARGETS


def model_fixture():
    return {'inputDomain': 'LIBRAW_CAMERA_WB_SRGB_HALF_SIZE_NO_AUTO_BRIGHT_V1',
            'featureNames': ['redMean', 'captureISO'], 'rawpyVersions': ['0.27.1'],
            'librawVersions': ['0.22.1'], 'supportedCameraModels': ['Canon EOS R6m2']}


def reference(index=1, event='2026-10-24 - Evento'):
    name, group = normalized_event(event)
    return {'schema': 'mizin-lightroom.approved-reference/1', 'eventName': name, 'eventGroupId': group,
            'approvalStatus': 'REFERENCE_APPROVED_BY_PHOTOGRAPHER',
            'approvalSource': 'USER_CONFIRMED_REVIEWED_SELECTION_IN_PLUGIN',
            'approvedUtc': '2026-10-30T01:15:51+00:00', 'parameterScope': 'TEN_BASIC_GLOBAL_DEVELOP_CONTROLS',
            'modelTrainingPerformed': False, 'sourceMetadataStable': True, 'styleVariant': 'color',
            'inputDomain': model_fixture()['inputDomain'], 'rawpyVersion': '0.27.1', 'librawVersion': '0.22.1',
            'cameraModel': 'Canon EOS R6m2', 'collectorVersion': 'v0.5.0 (build 0010)', 'lightroomVersion': '15.6',
            'jobId': str(uuid.uuid4()), 'rawSha256': hashlib.sha256(str(index).encode()).hexdigest(),
            'sourcePath': f'D:/Evento/100EOSR6/CRI_{index:04}.CR3', 'captureTimeExif': '2026:10:24 21:00:00.123-03:00',
            'featureNames': ['redMean', 'captureISO'], 'features': {'redMean': .25, 'captureISO': 100},
            'currentParameters': {k: 3500 if k == 'Temperature' else -2 if k == 'Tint' else 10 for k in TARGETS}}


class ReferenceImportTests(unittest.TestCase):
    def write_rows(self, folder, name, rows):
        path = folder / name
        path.write_text(''.join(json.dumps(row) + '\n' for row in rows), encoding='utf-8')
        return path

    def test_import_preserves_original_export_and_never_trains_or_activates(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            source = self.write_rows(folder, 'refs.jsonl', [reference()])
            model = folder / 'model.json'; model.write_text(json.dumps(model_fixture()))
            original = source.read_bytes()
            report = import_sources([source], model, folder / 'output')
            saved = Path(report['privateDirectory'])
            self.assertEqual((saved / report['sources'][0]['preservedRelative']).read_bytes(), original)
            self.assertEqual(source.read_bytes(), original)
            self.assertEqual(report['uniqueReferences'], 1)
            self.assertFalse(report['trainingPerformed'])
            self.assertFalse(report['modelActivated'])
            self.assertFalse(report['collectionTargetMet'])
            self.assertEqual(json.loads((saved / 'references.jsonl').read_text())['currentParameters']['Tint'], -2)

    def test_identical_raw_across_batches_is_counted_once(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory); row = reference()
            first = self.write_rows(folder, 'first.jsonl', [row])
            duplicate = copy.deepcopy(row); duplicate['jobId'] = str(uuid.uuid4())
            second = self.write_rows(folder, 'second.jsonl', [duplicate])
            rows, duplicates, sources = load_sources([first, second], model_fixture())
            self.assertEqual((len(rows), len(duplicates), len(sources)), (1, 1, 2))

    def test_conflicting_labels_features_or_event_for_one_hash_fail_closed(self):
        for changed in ('labels', 'features', 'event', 'capture'):
            with self.subTest(changed=changed), tempfile.TemporaryDirectory() as directory:
                folder = Path(directory); first = reference(); second = copy.deepcopy(first)
                if changed == 'labels': second['currentParameters']['Tint'] = 5
                elif changed == 'features': second['features']['redMean'] = .75
                elif changed == 'event': second['eventName'], second['eventGroupId'] = normalized_event('2026-10-25 - Outro')
                else: second['captureTimeExif'] = '2026:10:25 21:00:00'
                path = self.write_rows(folder, 'refs.jsonl', [first, second])
                with self.assertRaisesRegex(ValueError, 'Conflicting'):
                    load_sources([path], model_fixture())

    def test_schema_provenance_scope_and_numbers_are_validated(self):
        for changed in ('domain', 'approval', 'missing', 'bool', 'decoder', 'event', 'capture', 'offset', 'feature_list', 'parameter_list', 'fixture'):
            row = reference()
            if changed == 'domain': row['inputDomain'] = 'OTHER_DOMAIN'
            elif changed == 'approval': row['approvalStatus'] = 'UNKNOWN'
            elif changed == 'missing': del row['currentParameters']['Tint']
            elif changed == 'bool': row['features']['redMean'] = True
            elif changed == 'decoder': row['librawVersion'] = 'OTHER'
            elif changed == 'event': row['eventGroupId'] = '0' * 64
            elif changed == 'capture': row['captureTimeExif'] = '2026:99:99 21:00:00'
            elif changed == 'offset': row['captureTimeExif'] = '2026:10:24 21:00:00+99:00'
            elif changed == 'feature_list': row['features'] = list(row['features'])
            elif changed == 'parameter_list': row['currentParameters'] = list(row['currentParameters'])
            else: row['lightroomVersion'] = 'NOT_A_NATIVE_HOST_TEST'
            with self.subTest(changed=changed), self.assertRaises(ValueError): validate(row, model_fixture())

    def test_duplicate_json_keys_and_nan_are_not_accepted(self):
        for text in ('{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}'):
            with self.subTest(text=text), self.assertRaises(ValueError): strict_json(text)

    def test_collection_count_target_is_not_a_production_or_training_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            rows = [reference(group * 100 + index, f'2026-10-{20 + group} - Evento') for group in range(3) for index in range(50)]
            rows.append(reference(999, '2026-10-26 - Coleta parcial'))
            source = self.write_rows(folder, 'refs.jsonl', rows)
            model = folder / 'model.json'; model.write_text(json.dumps(model_fixture()))
            report = import_sources([source], model, folder / 'output')
            self.assertTrue(report['collectionTargetMet'])
            self.assertEqual(report['eventCount'], 4)
            self.assertEqual(report['validationContractModelSha256'], hashlib.sha256(model.read_bytes()).hexdigest())
            self.assertFalse(report['trainingPerformed'])
            self.assertFalse(report['productionQualityApproved'])
            self.assertEqual(report['nextAction'], 'DESIGN_EVENT_HOLDOUT_BEFORE_FITTING')


if __name__ == '__main__': unittest.main(verbosity=2)
