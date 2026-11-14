import copy
import json
import math
from pathlib import Path
import tempfile
import unittest

import test_learning_store as fixtures
from test_local_engine import engine
from import_approved_references import validate

store = fixtures.store


class LearningRefreshTests(unittest.TestCase):
    def test_correcting_existing_work_refreshes_weights_without_reusing_test_as_new_evaluation(self):
        with tempfile.TemporaryDirectory() as temp:
            for group in (1,2,3):
                store.register(temp,fixtures.event_rows(group),fixtures.contract(),str(group))
            first=store.train_candidate(temp,fixtures.contract())
            self.assertEqual(first['deploymentTrainingReferences'],150)
            self.assertTrue(first['freshEvaluationPerformed'])
            old_path,old_hash=store.latest_candidate(temp)
            old_model=json.loads(old_path.read_text())
            self.assertTrue(old_model['modelsAreFinalRefitOnAllData'])
            corrected=fixtures.event_rows(1)
            for row in corrected:
                row['currentParameters']['Temperature']=2800
                row['approvedUtc']='2026-11-14T12:00:00+00:00'
            store.register(temp,corrected,fixtures.contract(),'1')
            self.assertTrue(store.summary(temp)['candidateNeedsRefresh'])
            refreshed=store.train_candidate(temp,fixtures.contract())
            self.assertEqual(refreshed['reason'],'APPROVED_DATA_REFIT')
            self.assertFalse(refreshed['freshEvaluationPerformed'])
            self.assertFalse(refreshed['metricsApplyToCurrentWeights'])
            self.assertEqual(refreshed['evaluationModelSha256'],first['evaluationModelSha256'])
            new_path,new_hash=store.latest_candidate(temp)
            self.assertNotEqual(old_hash,new_hash)
            new_model=engine.validate_model(json.loads(new_path.read_text()))
            features=corrected[0]['features']
            self.assertLess(engine.predict_features(new_model,features)['Temperature'],engine.predict_features(old_model,features)['Temperature']-100)
            self.assertFalse(store.summary(temp)['candidateNeedsRefresh'])
            self.assertEqual(store.train_candidate(temp,fixtures.contract())['reason'],'NO_APPROVED_CHANGES')
            self.assertTrue(old_path.is_file())

    def test_freshest_event_is_used_for_deployment_but_not_for_evaluation_weights(self):
        with tempfile.TemporaryDirectory() as temp:
            for group in (1,2,3):
                rows=fixtures.event_rows(group)
                for row in rows:row['currentParameters']['Temperature']=2500 if group==3 else 5000
                store.register(temp,rows,fixtures.contract(),str(group))
            result=store.train_candidate(temp,fixtures.contract())
            deployed=json.loads((Path(result['candidateDirectory'])/'model.json').read_text())
            evaluation=json.loads((Path(result['candidateDirectory'])/'evaluation-model.json').read_text())
            self.assertEqual(evaluation['targets']['Temperature']['nativeBoundsFromTrainingOnly'],[5000,5000])
            self.assertEqual(deployed['targets']['Temperature']['nativeBoundsFromTrainingOnly'],[2500,5000])

    def test_skin_features_survive_registration_and_only_improve_wb_with_validation_support(self):
        with tempfile.TemporaryDirectory() as temp:
            for group in (1,2,3):
                rows=fixtures.event_rows(group,60)
                for i,row in enumerate(rows):
                    ratio=1+(i*17%59)/59
                    row['appearanceFeatures']={'skinR':.8,'skinG':.5,'skinB':.8/ratio,
                        'skinRedBlueRatio':ratio,'skinRedGreenRatio':1.6,'faceConfidence':.99,'skinSampledPixels':100}
                    row['currentParameters']['Temperature']=math.exp(8.8-.3*ratio)
                store.register(temp,rows,fixtures.contract(),str(group))
            result=store.train_candidate(temp,fixtures.contract())
            self.assertTrue(result['appearanceWhiteBalanceEnabled'])
            self.assertEqual(store.summary(temp)['appearanceReferences'],180)
            evaluated=engine.validate_model(json.loads((Path(result['candidateDirectory'])/'evaluation-model.json').read_text()))
            errors=[abs(engine.predict_features(evaluated,{**r['features'],**r['appearanceFeatures']})['Temperature']-
                        r['currentParameters']['Temperature']) for r in rows]
            self.assertAlmostEqual(result['metrics']['Temperature']['mae'],sum(errors)/len(errors))
            self.assertEqual(result['metrics']['Temperature']['appearanceEvaluationReferences'],60)
            model=engine.validate_model(json.loads((Path(result['candidateDirectory'])/'model.json').read_text()))
            self.assertIn('Temperature',model['appearanceWhiteBalance']['targets'])
            base_only=copy.deepcopy(model);base_only.pop('appearanceWhiteBalance')
            features={'redMean':.3,'captureISO':160}
            self.assertEqual(engine.predict_features(model,features),engine.predict_features(base_only,features))
            rich={**features,**rows[3]['appearanceFeatures']}
            pred=engine.predict_features(model,rich)
            self.assertAlmostEqual(pred['Temperature'],rows[3]['currentParameters']['Temperature'],delta=120)
            self.assertEqual(pred['Exposure2012'],engine.predict_features(base_only,rich)['Exposure2012'])
            bad=copy.deepcopy(model);bad['appearanceWhiteBalance']['targets']['Temperature']['regression']['weights']=[1]
            with self.assertRaises(ValueError):engine.validate_model(bad)

    def test_invalid_appearance_never_enters_learning_database(self):
        for extra in ({'unknown':1},{'skinR':float('nan')},{'faceConfidence':2}):
            row=fixtures.event_rows(1,1)[0];row['appearanceFeatures']=extra
            with self.assertRaises(ValueError):validate(row,fixtures.contract())
