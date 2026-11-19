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


def scene_row(time, temperature, tint=0.0, exposure=0.0, status='COMPUTED'):
    return {'status': status, 'captureTimeExif': time,
            'predictions': {'Temperature': temperature, 'Tint': tint, 'Exposure2012': exposure}}


class SceneConsistencyTests(unittest.TestCase):
    def test_capture_time_parsing(self):
        self.assertAlmostEqual(engine.capture_seconds('2026:10:02 18:57:55.40-03:00') -
                               engine.capture_seconds('2026:10:02 18:57:50'), 5.4, places=4)
        for bad in (None, '', '2026-10-02 18:57:55', '2026:13:02 18:57:55'):
            self.assertIsNone(engine.capture_seconds(bad))

    def test_sequence_white_balance_is_equalized_but_exposure_is_not(self):
        rows = [scene_row('2026:10:02 18:00:00', 5000, 2, .1), scene_row('2026:10:02 18:00:05', 5200, 4, .5),
                scene_row('2026:10:02 18:00:09', 5100, 3, -.2)]
        summary = engine.scene_consistency(rows, 30)
        self.assertEqual([r['predictions']['Temperature'] for r in rows], [5100, 5100, 5100])
        self.assertEqual([r['predictions']['Tint'] for r in rows], [3, 3, 3])
        self.assertEqual([r['predictions']['Exposure2012'] for r in rows], [.1, .5, -.2])
        self.assertEqual((summary['sequences'], summary['adjustedPhotos']), (1, 2))
        self.assertEqual(rows[0]['sceneConsistency']['originalPredictions'], {'Temperature': 5000, 'Tint': 2})

    def test_gaps_outliers_failures_and_missing_times_keep_their_values(self):
        rows = [scene_row('2026:10:02 18:00:00', 5000), scene_row('2026:10:02 18:00:04', 5100),
                scene_row('2026:10:02 18:00:06', 7600),            # flash or new light: outside the band
                scene_row('2026:10:02 18:05:00', 4000),            # after a long gap: own sequence
                scene_row(None, 6000), scene_row('2026:10:02 18:00:02', 9000, status='FAILED')]
        summary = engine.scene_consistency(rows, 30)
        self.assertEqual([r['predictions']['Temperature'] for r in rows], [5050, 5050, 7600, 4000, 6000, 9000])
        self.assertEqual(summary['photosWithoutCaptureTime'], 1)
        self.assertNotIn('sceneConsistency', rows[2])
        with self.assertRaises(ValueError):
            engine.scene_consistency(rows, 0)


class LocalEngineTests(unittest.TestCase):
    def test_extended_prediction_and_backward_compatibility(self):
        model=fixture_model()
        baseline=engine.predict_features(engine.validate_model(model),{'redMean':.2,'captureISO':100})
        target=copy.deepcopy(model['targets']['Contrast2012'])
        target['regression']['targetCenter']=-17
        model['extendedTargets']={'HueAdjustmentOrange':target}
        values=engine.predict_features(engine.validate_model(model),{'redMean':.2,'captureISO':100})
        self.assertEqual(values.pop('HueAdjustmentOrange'),-17)
        self.assertEqual(values,baseline)

    def test_extended_model_rejects_unknown_controls_and_invalid_bounds(self):
        for key,bounds,log in [('CropAngle',[-10,10],False),
                               ('Texture',[-101,100],False),
                               ('Texture',[-100,101],False),
                               ('Texture',[-100,100],True)]:
            model=fixture_model();target=copy.deepcopy(model['targets']['Contrast2012'])
            target.update(nativeBoundsFromTrainingOnly=bounds,logTarget=log)
            model['extendedTargets']={key:target}
            with self.subTest(key=key,bounds=bounds,log=log),self.assertRaises(ValueError):
                engine.validate_model(model)

    def test_monochrome_model_contract_is_separate(self):
        model=fixture_model();target=copy.deepcopy(model['targets']['Contrast2012'])
        model['extendedTargets']={'GrayMixerRed':target}
        with self.assertRaises(ValueError):engine.validate_model(copy.deepcopy(model))
        model['supportedTreatment']='monochrome'
        self.assertIn('GrayMixerRed',engine.validate_model(copy.deepcopy(model),'monochrome')['extendedTargets'])
        with self.assertRaises(ValueError):engine.validate_model(copy.deepcopy(model))

    def test_horizon_on_render_reports_size_and_survives_unicode_paths_and_failures(self):
        import cv2, numpy
        with tempfile.TemporaryDirectory() as directory:
            image=numpy.full((600,900),255,numpy.uint8)
            for y in (60,200,350,520):
                cv2.line(image,(80,y),(820,y+int(740*math.tan(math.radians(3)))),0,3)
            path=Path(directory)/'ção técnica.jpg'
            ok,data=cv2.imencode('.jpg',image);path.write_bytes(data.tobytes())
            result=engine.horizon_for(path)
            self.assertEqual((result['imageWidth'],result['imageHeight']),(900,600))
            self.assertEqual(result['status'],'PROPOSAL_ONLY')
            self.assertAlmostEqual(result['imageSlopeDegrees'],3,delta=.3)
            failed=engine.horizon_for(Path(directory)/'ausente.jpg')
            self.assertEqual((failed['status'],failed['reason']),('KEEP_EXISTING','ANALYSIS_FAILED'))
            self.assertIs(engine.horizon_for(path,True)['sensorSwapped'],True)
            self.assertNotIn('sensorSwapped',engine.horizon_for(path))
            # Camera level (note 48): a scene axis that agrees with it wins; otherwise half of it.
            confirmed=engine.horizon_for(path,camera_roll=-3.2)
            self.assertEqual(confirmed['evidence'],'SCENE_CONFIRMED_BY_CAMERA_LEVEL')
            self.assertAlmostEqual(confirmed['imageSlopeDegrees'],3,delta=.3)
            camera=engine.horizon_for(path,False,None,1.0)
            self.assertEqual((camera['evidence'],camera['sensorSwapped']),('CAMERA_LEVEL',False))
            self.assertAlmostEqual(camera['imageSlopeDegrees'],-.5)
            self.assertEqual(engine.horizon_for(Path(directory)/'ausente.jpg',camera_roll=2.0)['reason'],'ANALYSIS_FAILED')

    def test_metadata_reads_camera_level_without_changing_model_inputs(self):
        options=engine.METADATA_OPTIONS
        self.assertIn('-MakerNotes:RollAngle#',options)
        self.assertNotIn('-fast2',options)  # -fast2 skips MakerNotes, where RollAngle lives
        for tag in ('ISO','ExposureTime#','FNumber','FocalLength#','Model','DateTimeOriginal'):
            self.assertIn('-EXIF:'+tag,options)

    def test_exiftool_session_matches_one_shot_reads_and_falls_back(self):
        root=Path(__file__).resolve().parents[1]/'private'
        exe=next(iter(sorted(root.glob('deliveries/*/CRISPIX.lrplugin/Tools/ExifTool/exiftool.exe'))),None) if root.exists() else None
        raws=sorted(root.glob('raw-datasets/*/original/*.CR3'))[:3] if root.exists() else []
        if exe is None or not raws:
            self.skipTest('packaged ExifTool or preserved CR3 files unavailable here')
        import shutil
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory)/'Formatura João';folder.mkdir()
            accented=folder/'foto ç.CR3';shutil.copy(raws[0],accented)
            photos=[p.resolve() for p in raws]+[accented.resolve()]
            expected=[engine.metadata_for(p,exe,Path(directory)/f'one-{i}.args') for i,p in enumerate(photos)]
            session=engine.ExifToolSession(exe,Path(directory))
            try:
                got=[engine.metadata_for(p,exe,Path(directory)/f'session-{i}.args',session) for i,p in enumerate(photos)]
                self.assertEqual(got,expected)
                self.assertFalse(list(Path(directory).glob('session-*.args')))  # answered by the session itself
                with self.assertRaisesRegex(RuntimeError,'File not found'):
                    engine.metadata_for(Path(directory)/'ausente.CR3',exe,Path(directory)/'missing.args',session)
                self.assertFalse(session.broken)
            finally:
                session.close()
            broken=engine.ExifToolSession(Path(directory)/'nao-existe.exe',Path(directory))
            self.assertEqual(engine.metadata_for(photos[1],exe,Path(directory)/'fallback.args',broken),expected[1])
            self.assertTrue(broken.broken)

    def test_sensor_swap_compares_render_with_raw_frame(self):
        def extracted(w,h,rw=6288,rh=4056):return {'renderWidth':w,'renderHeight':h,'rawSize':{'rawWidth':rw,'rawHeight':rh}}
        self.assertFalse(engine.sensor_swapped(extracted(1024,683)))
        self.assertTrue(engine.sensor_swapped(extracted(683,1024)))
        for broken in ({},{'renderWidth':10,'renderHeight':10,'rawSize':{'rawWidth':6,'rawHeight':4}},extracted(683,1024,rw=None),None):
            self.assertIsNone(engine.sensor_swapped(broken))

    def test_json_rejects_duplicate_keys_at_every_depth(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'input.json'
            for content in ('{"operation":"analyze","operation":"collect"}',
                            '{"targets":{"Temperature":5000,"Temperature":6000}}'):
                with self.subTest(content=content):
                    path.write_text(content, encoding='utf-8')
                    with self.assertRaisesRegex(ValueError, 'Chave JSON duplicada'):
                        engine.read_json(path)
            path.write_text('﻿{"operation":"analyze","photos":[]}', encoding='utf-8')
            self.assertEqual(engine.read_json(path), {'operation': 'analyze', 'photos': []})

    def test_request_for_thousands_of_photos_is_read(self):
        # A large selection makes request.json grow past the former 8 MiB ceiling.
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'request.json'
            photos = [{'id': str(i), 'path': 'D:/fotos/' + 'x' * 900 + f'{i}.CR3'} for i in range(10000)]
            path.write_text(json.dumps({'operation': 'analyze', 'photos': photos}), encoding='utf-8')
            self.assertGreater(path.stat().st_size, 8 * 1024 * 1024)
            self.assertEqual(len(engine.read_json(path)['photos']), 10000)

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
        def fake_render(path, destination, metadata, face_detector=None):
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

    def test_full_selection_of_280_photos_is_processed(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw = self.fixture(Path(directory), count=280)
            report = self.run_fixture(bundle, job)
            self.assertEqual(report['status'], 'COMPLETED')
            self.assertEqual(report['computedPhotos'], 280)
            self.assertEqual(len(report['results']), 280)

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
            def render(path, destination, metadata, face_detector=None):
                destination.write_bytes(b'input')
                (job / 'cancel.request').write_text('cancel')
                return {'features': {'redMean': .2, 'captureISO': 100}, 'inputDomain': engine.DOMAIN, 'jpegSha256': engine.sha256_file(destination)}
            # One worker: the original sequential guarantee, exactly.
            with unittest.mock.patch.object(engine, 'worker_count', return_value=1):
                report = self.run_fixture(bundle, job, render=render)
            self.assertEqual((report['status'], report['computedPhotos'], len(report['results'])), ('CANCELLED', 1, 1))
            self.assertEqual(report['requestedPhotos'], 2)

    def test_parallel_cancellation_never_starts_a_raw_after_the_request(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle, job, raw = self.fixture(Path(directory), count=6)
            started = []
            def render(path, destination, metadata, face_detector=None):
                started.append(destination.name)
                destination.write_bytes(b'input')
                (job / 'cancel.request').write_text('cancel')
                return {'features': {'redMean': .2, 'captureISO': 100}, 'inputDomain': engine.DOMAIN, 'jpegSha256': engine.sha256_file(destination)}
            with unittest.mock.patch.object(engine, 'worker_count', return_value=2):
                report = self.run_fixture(bundle, job, render=render)
            self.assertEqual(report['status'], 'CANCELLED')
            # At most the photos already in flight (one per worker) finish; all are kept, none fabricated.
            self.assertLessEqual(len(started), 2)
            self.assertEqual(report['computedPhotos'], len(started))
            self.assertEqual(len(report['results']), len(started))

    def test_parallel_results_keep_request_order_and_match_sequential(self):
        with tempfile.TemporaryDirectory() as directory:
            reports = []
            for workers in (1, 4):
                bundle, job, raw = self.fixture(Path(directory) / str(workers), count=12)
                with unittest.mock.patch.object(engine, 'worker_count', return_value=workers):
                    reports.append(self.run_fixture(bundle, job))
            strip = lambda r: [(x['id'], x['status'], x.get('predictions')) for x in r['results']]
            self.assertEqual(strip(reports[0]), strip(reports[1]))
            self.assertEqual(reports[1]['parallelWorkers'], 4)

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
