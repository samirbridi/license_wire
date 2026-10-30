import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'reconstructed/local-engine'))
import learning_store as store
from test_reference_import import reference
from test_local_engine import fixture_model


def contract():
    value=fixture_model();value.update({'supportedCameraModels':['Canon EOS R6m2'],'rawpyVersions':['0.27.1'],'librawVersions':['0.22.1']})
    return value


def event_rows(group,count=50):
    rows=[]
    for i in range(count):
        row=reference(group*1000+i,f'2026-10-{20+group:02} - Evento {group}')
        row['captureTimeExif']=f'2026:10:{20+group:02} 20:00:00'
        row['features']={'redMean':i/49,'captureISO':100+group*30}
        row['currentParameters']['Exposure2012']=2*i/49-1
        rows.append(row)
    return rows


class LearningStoreTests(unittest.TestCase):
    def test_unapproved_batch_cannot_partially_enter_registry(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)/'store';rows=event_rows(1,2);rows[1]['approvalStatus']='UNKNOWN'
            with self.assertRaises(ValueError):store.register(root,rows,contract(),'catalog')
            self.assertFalse(root.exists())

    def test_cross_catalog_duplicate_counts_once_but_conflicts_are_excluded(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);row=event_rows(1,1)[0]
            store.register(root,[row],contract(),'catalog A');store.register(root,[row],contract(),'catalog B')
            self.assertEqual(store.summary(root)['uniqueApprovedReferences'],1)
            changed=copy.deepcopy(row);changed['currentParameters']['Tint']=25
            changed['approvedUtc']='2026-10-31T02:00:00+00:00'
            store.register(root,[changed],contract(),'catalog B')
            summary=store.summary(root)
            self.assertEqual((summary['uniqueApprovedReferences'],summary['conflictingRawFilesExcluded']),(0,1))

    def test_newer_human_revision_preserves_history_and_old_exports_cannot_roll_it_back(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);row=event_rows(1,1)[0]
            store.register(root,[row],contract(),'catalog')
            changed=copy.deepcopy(row);changed['currentParameters']['Tint']=25;changed['approvedUtc']='2026-10-31T02:00:00+00:00'
            store.register(root,[changed],contract(),'catalog');store.register(root,[row],contract(),'catalog')
            with store.connect(root) as db:
                rows,conflicts=store.active_rows(db)
                self.assertEqual(rows[0]['currentParameters']['Tint'],25)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM revisions').fetchone()[0],2)

    def test_opinion_is_feedback_and_does_not_become_photographic_ground_truth(self):
        with tempfile.TemporaryDirectory() as directory:
            result=store.record_feedback(directory,'GOOD','Gostei da temperatura','analysis-job')
            self.assertEqual((result['feedbackCount'],result['uniqueApprovedReferences']),(1,0))
            self.assertFalse(result['feedbackUsedAsApprovedEdits'])
            with self.assertRaises(ValueError):store.record_feedback(directory,'OTHER','', 'analysis-job')

    def test_three_events_are_required_and_evaluation_is_not_repeated_on_old_events(self):
        with tempfile.TemporaryDirectory() as directory:
            for group in (1,2):store.register(directory,event_rows(group),contract(),str(group))
            self.assertFalse(store.train_candidate(directory,contract())['candidateCreated'])
            store.register(directory,event_rows(3),contract(),'3')
            result=store.train_candidate(directory,contract())
            self.assertTrue(result['candidateCreated']);self.assertFalse(result['modelActivated'])
            self.assertNotIn(result['evaluationEvent'],result['innerTrainingEvents']+[result['validationEvent']])
            self.assertEqual(len(set(result['innerTrainingEvents']+[result['validationEvent'],result['evaluationEvent']])),3)
            self.assertFalse(store.train_candidate(directory,contract())['candidateCreated'])
            store.register(directory,event_rows(4),contract(),'4')
            second=store.train_candidate(directory,contract());self.assertTrue(second['candidateCreated'])
            self.assertNotEqual(second['evaluationEvent'],result['evaluationEvent'])

    def test_held_out_targets_do_not_change_fitted_weights_and_tampered_candidate_is_rejected(self):
        regressions=[]
        for alter_test in (False,True):
            with tempfile.TemporaryDirectory() as directory:
                for group in (1,2,3):
                    rows=event_rows(group)
                    if alter_test and group==3:
                        for row in rows:row['currentParameters']['Exposure2012']+=50
                    store.register(directory,rows,contract(),str(group))
                result=store.train_candidate(directory,contract())
                model_path,sha=store.latest_candidate(directory)
                model=json.loads(model_path.read_text());regressions.append(model['targets'])
                model_path.write_text('{}')
                with self.assertRaisesRegex(ValueError,'alterado'):store.latest_candidate(directory)
        self.assertEqual(regressions[0],regressions[1])


if __name__=='__main__':unittest.main(verbosity=2)
