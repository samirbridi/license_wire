import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import test_local_engine as fixtures

engine = fixtures.engine


class ReferenceCollectionTests(unittest.TestCase):
    def prepare(self, root, count=1):
        bundle, job, raw = fixtures.LocalEngineTests().fixture(root, count=count)
        request = json.loads((job / 'request.json').read_text())
        request.update({'operation': 'collect', 'referencesApproved': True, 'eventName': '2026-10-24 - Evento'})
        for row in request['photos']:
            row['isVirtualCopy'] = False
            row['current'] = {key: (3500 if key == 'Temperature' else -2 if key == 'Tint' else 10) for key in engine.TARGETS}
        (job / 'request.json').write_text(json.dumps(request))
        return bundle, job, raw, request

    def run_collection(self, bundle, job, render=None):
        def fake_render(path, destination, metadata):
            destination.write_bytes(b'technical input')
            return {'features': {'redMean': .2, 'captureISO': 100}, 'inputDomain': engine.DOMAIN,
                    'jpegSha256': engine.sha256_file(destination)}
        with patch.object(engine, 'runtime_info', return_value={'rawpy': 'test', 'libraw': 'test'}), \
             patch.object(engine, 'metadata_for', return_value={'Model': 'Supported Camera', 'DateTimeOriginal': '2026:10:24 20:00:00'}), \
             patch.object(engine, 'technical_render', side_effect=render or fake_render), \
             patch.object(engine, 'predict_features', side_effect=AssertionError('Collection must not replace approved labels with predictions')):
            return engine.run_job(job, bundle)

    def test_export_has_features_approved_labels_and_event_identity_without_photos(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw, request = self.prepare(Path(directory))
            before = engine.sha256_file(raw)
            report = self.run_collection(bundle, job)
            self.assertEqual((report['status'], report['collectedReferences'], report['computedPhotos']), ('COMPLETED', 1, 0))
            exported = json.loads((job / 'references.jsonl').read_text())
            self.assertEqual(exported['currentParameters']['Tint'], -2)
            self.assertEqual(exported['features'], {'redMean': .2, 'captureISO': 100})
            self.assertEqual(exported['approvalStatus'], 'REFERENCE_APPROVED_BY_PHOTOGRAPHER')
            self.assertEqual(exported['eventName'], request['eventName'])
            self.assertEqual(exported['rawSha256'], before)
            self.assertEqual(engine.sha256_file(raw), before)
            self.assertNotIn('predictions', exported)
            self.assertNotIn('pixels', exported)
            self.assertFalse(report['referenceBatch']['modelTrainingPerformed'])

    def test_missing_human_approval_stops_before_reading_raw(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw, request = self.prepare(Path(directory))
            request['referencesApproved'] = False
            (job / 'request.json').write_text(json.dumps(request))
            with patch.object(engine, 'technical_render') as render:
                report = engine.run_job(job, bundle)
            self.assertEqual(report['status'], 'FAILED')
            render.assert_not_called()
            self.assertFalse((job / 'references.jsonl').exists())

    def test_missing_control_is_not_replaced_by_a_default_or_prediction(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw, request = self.prepare(Path(directory))
            del request['photos'][0]['current']['Tint']
            (job / 'request.json').write_text(json.dumps(request))
            report = self.run_collection(bundle, job)
            self.assertEqual(report['collectedReferences'], 0)
            self.assertEqual(report['failedPhotos'], 1)
            self.assertEqual((job / 'references.jsonl').read_text(), '')

    def test_duplicate_raw_in_selection_does_not_duplicate_training_example(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw, request = self.prepare(Path(directory), count=2)
            report = self.run_collection(bundle, job)
            self.assertEqual((report['collectedReferences'], report['failedPhotos']), (1, 1))
            self.assertEqual(len((job / 'references.jsonl').read_text().splitlines()), 1)
            self.assertIn('duplicado', report['results'][1]['error'])

    def test_event_id_is_stable_for_case_and_spacing_and_differs_for_other_event(self):
        first = engine.reference_batch({'referencesApproved': True, 'eventName': '2026-10-24   Evento'})
        same = engine.reference_batch({'referencesApproved': True, 'eventName': '  2026-10-24 evento  '})
        other = engine.reference_batch({'referencesApproved': True, 'eventName': '2026-10-25 Evento'})
        self.assertEqual(first['eventGroupId'], same['eventGroupId'])
        self.assertNotEqual(first['eventGroupId'], other['eventGroupId'])

    def test_export_failure_cannot_report_a_successful_collection(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw, request = self.prepare(Path(directory))
            with patch.object(engine, 'export_references', side_effect=OSError('Disk full fixture')):
                report = self.run_collection(bundle, job)
            self.assertEqual(report['status'], 'FAILED')
            self.assertIn('Disk full', report['error'])


if __name__ == '__main__': unittest.main(verbosity=2)
