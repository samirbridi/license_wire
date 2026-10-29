import copy
import importlib.util
import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / 'reconstructed/local-engine/local_engine.py'
spec = importlib.util.spec_from_file_location('local_engine', SOURCE)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)


def fixture_model():
    targets = {}
    for key, center, bounds in [('Exposure2012', 0.0, [-5, 5]), ('Temperature', math.log(5000), [2000, 10000]), ('Contrast2012', 20.0, [-100, 100])]:
        targets[key] = {'regression': {'featureCenters': [0.0, 0.0], 'featureScales': [1.0, 1.0],
                         'weights': [0.0, 1.0, 0.5] if key == 'Exposure2012' else [0.0, 0.0, 0.0],
                         'targetCenter': center, 'targetScale': 1.0},
                        'nativeBoundsFromTrainingOnly': bounds, 'logTarget': key == 'Temperature'}
    return {'schema': 'mizin-lightroom.numeric-pilot/1', 'inputDomain': engine.DOMAIN, 'supportedTreatment': 'color',
            'status': 'EXPERIMENTAL_NOT_FOR_AUTOMATIC_EDITING', 'featureNames': ['redMean', 'captureISO'],
            'log1pFeatures': ['captureISO'], 'targets': targets, 'supportedCameraModels': ['Supported Camera'],
            'rawpyVersions': ['test'], 'librawVersions': ['test']}


class LocalEngineTests(unittest.TestCase):
    def test_inference_preserves_log_transform_units_and_bounds(self):
        model = engine.validate_model(fixture_model())
        values = engine.predict_features(model, {'redMean': 0.2, 'captureISO': 100})
        self.assertAlmostEqual(values['Exposure2012'], 0.2 + 0.5 * math.log1p(100))
        self.assertAlmostEqual(values['Temperature'], 5000)
        self.assertEqual(values['Contrast2012'], 20)
        clipped = engine.predict_features(model, {'redMean': 1000, 'captureISO': 1000000})
        self.assertEqual(clipped['Exposure2012'], 5)

    def test_rejects_incompatible_or_nonfinite_model(self):
        for change in ('domain', 'scale', 'weights', 'transform'):
            model = fixture_model()
            if change == 'domain': model['inputDomain'] = 'DIFFERENT_RENDER'
            elif change == 'scale': model['targets']['Exposure2012']['regression']['featureScales'][0] = 0
            elif change == 'weights': model['targets']['Exposure2012']['regression']['weights'][0] = float('nan')
            else: model['log1pFeatures'] = []
            with self.subTest(change=change), self.assertRaises(ValueError): engine.validate_model(model)

    def fixture(self, root, count=1):
        bundle, job = root / 'bundle', root / 'job'
        (bundle / 'Models').mkdir(parents=True)
        (bundle / 'Tools/ExifTool').mkdir(parents=True)
        (bundle / 'Tools/ExifTool/exiftool.exe').write_bytes(b'fixture')
        model = bundle / 'Models/pilot-model.json'
        model.write_text(json.dumps(fixture_model()))
        (bundle / 'BuildInfo.json').write_text(json.dumps({'version': 'TEST_FIXTURE', 'modelSha256': engine.sha256_file(model), 'styleName': 'Fixture'}))
        job.mkdir()
        raw = root / 'untouched.CR3'
        raw.write_bytes(b'RAW FIXTURE DO NOT MODIFY')
        photos = [{'id': str(i), 'path': str(raw), 'current': {'Exposure2012': 0.75}, 'treatment': 'color'} for i in range(count)]
        (job / 'request.json').write_text(json.dumps({'schema': 'mizin-lightroom.selection-request/1', 'jobId': 'fixture', 'operation': 'analyze', 'photos': photos}))
        return bundle, job, raw

    def run_fixture(self, bundle, job, camera='Supported Camera', render=None):
        def fake_render(path, destination, metadata):
            destination.write_bytes(b'TECHNICAL INPUT')
            return {'features': {'redMean': .2, 'captureISO': 100}, 'inputDomain': engine.DOMAIN,
                    'jpegSha256': engine.sha256_file(destination)}
        with patch.object(engine, 'runtime_info', return_value={'rawpy': 'test', 'libraw': 'test'}), \
             patch.object(engine, 'metadata_for', return_value={'Model': camera}), \
             patch.object(engine, 'technical_render', side_effect=render or fake_render):
            return engine.run_job(job, bundle)

    def test_fresh_predictions_keep_raw_unchanged_and_job_cannot_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw = self.fixture(Path(directory))
            before = engine.sha256_file(raw)
            report = self.run_fixture(bundle, job)
            self.assertEqual(report['status'], 'COMPLETED')
            self.assertEqual(report['computedPhotos'], 1)
            self.assertEqual(report['results'][0]['sourceSha256'], before)
            self.assertEqual(engine.sha256_file(raw), before)
            self.assertEqual((report['catalogWrites'], report['sourceWrites'], report['photosUploaded']), (0, 0, 0))
            with self.assertRaises(ValueError): engine.run_job(job, bundle)
            self.assertTrue((job / 'results.csv').is_file())

    def test_unsupported_camera_is_a_per_photo_failure_without_rendering(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw = self.fixture(Path(directory))
            render = unittest.mock.Mock(side_effect=AssertionError('Must not decode unsupported camera'))
            report = self.run_fixture(bundle, job, camera='Other Camera', render=render)
            self.assertEqual(report['status'], 'COMPLETED_WITH_ERRORS')
            self.assertEqual(report['computedPhotos'], 0)
            self.assertIn('Camera nao suportada', report['results'][0]['error'])
            render.assert_not_called()

    def test_cancellation_preserves_completed_result_and_does_not_start_next_raw(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw = self.fixture(Path(directory), count=2)
            def render(path, destination, metadata):
                destination.write_bytes(b'input')
                (job / 'cancel.request').write_text('cancel')
                return {'features': {'redMean': .2, 'captureISO': 100}, 'inputDomain': engine.DOMAIN, 'jpegSha256': engine.sha256_file(destination)}
            report = self.run_fixture(bundle, job, render=render)
            self.assertEqual((report['status'], report['computedPhotos'], len(report['results'])), ('CANCELLED', 1, 1))
            self.assertEqual(report['requestedPhotos'], 2)

    def test_changed_model_fails_before_raw_processing(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw = self.fixture(Path(directory))
            with (bundle / 'Models/pilot-model.json').open('a') as stream: stream.write(' ')
            with patch.object(engine, 'technical_render') as render:
                report = engine.run_job(job, bundle)
            self.assertEqual(report['status'], 'FAILED')
            self.assertIn('Modelo diferente', report['error'])
            render.assert_not_called()

    def test_source_change_is_not_reported_as_a_prediction(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw = self.fixture(Path(directory))
            # The Windows read-only guard itself blocks writers; inject a changed digest.
            real_hash = engine.sha256_file
            calls = 0
            def digest(path):
                nonlocal calls
                if Path(path) == raw:
                    calls += 1
                    return 'a' * 64 if calls == 1 else 'b' * 64
                return real_hash(path)
            with patch.object(engine, 'sha256_file', side_effect=digest):
                report = self.run_fixture(bundle, job)
            self.assertEqual(report['computedPhotos'], 0)
            self.assertIn('alterado', report['results'][0]['error'])


if __name__ == '__main__': unittest.main(verbosity=2)
