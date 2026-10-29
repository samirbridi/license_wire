import datetime as dt
import json
import unittest
import numpy as np
from train_numeric_pilot import fit_ridge,predict_ridge,temporal_split


class NumericPilotTests(unittest.TestCase):
    def test_signal_prediction_beats_constant_without_test_fit(self):
        rng=np.random.default_rng(123)
        x=rng.normal(size=(220,4))
        y=2*x[:,0]-x[:,1]+0.5
        model=fit_ridge(x[:160],y[:160],1.0)
        predictions=predict_ridge(model,x[160:])
        self.assertLess(np.abs(predictions-y[160:]).mean(),0.05)
        self.assertLess(np.abs(predictions-y[160:]).mean(),np.abs(y[160:]-np.median(y[:160])).mean())

    def test_serialization_and_missing_inputs_are_finite(self):
        rng=np.random.default_rng(8)
        x=rng.normal(size=(100,3))
        x[0,1]=np.nan
        model=json.loads(json.dumps(fit_ridge(x,np.arange(100,dtype=float),10.0)))
        self.assertTrue(np.isfinite(predict_ridge(model,np.array([[np.nan,1.0,2.0]]))).all())

    def test_temporal_groups_never_overlap_and_test_is_later(self):
        start=dt.datetime(2026,10,2,18,0)
        rows=[{'captureTime':(start+dt.timedelta(minutes=i)).isoformat()} for i in range(240)]
        train,inner,val,test,split=temporal_split(rows)
        self.assertFalse(set(train)&set(test))
        self.assertFalse(set(inner)&set(val))
        self.assertLess(max(train),min(test))
        self.assertFalse(set(split['testGroups'])&set(split['validationGroups']))


if __name__=='__main__':
    unittest.main(verbosity=2)
