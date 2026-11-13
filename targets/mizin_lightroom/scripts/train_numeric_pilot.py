"""Local numeric regression pilot; never claims cross-event or Lightroom QA.

The one-event temporal holdout tests the plumbing and a limited prediction task.
It is not a release gate for a photographer-facing editing model.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
from pathlib import Path

import numpy as np

TARGETS = ("Exposure2012", "Temperature", "Tint", "Contrast2012", "Highlights2012",
           "Shadows2012", "Whites2012", "Blacks2012", "Saturation", "Vibrance")


def temporal_split(rows):
    groups = []
    for row in rows:
        capture = dt.datetime.fromisoformat(row["captureTime"])
        groups.append(capture.replace(minute=(capture.minute//30)*30, second=0, microsecond=0).isoformat())
    distinct = sorted(set(groups))
    if len(distinct) < 5:
        raise ValueError("Need at least five half-hour groups for an honest temporal pilot split")
    test_count = max(1, int(np.ceil(len(distinct)*0.2)))
    test_groups = set(distinct[-test_count:])
    validation_groups = {distinct[-test_count-1]}
    train = np.array([i for i,g in enumerate(groups) if g not in test_groups], dtype=int)
    inner = np.array([i for i,g in enumerate(groups) if g not in test_groups|validation_groups], dtype=int)
    validation = np.array([i for i,g in enumerate(groups) if g in validation_groups], dtype=int)
    test = np.array([i for i,g in enumerate(groups) if g in test_groups], dtype=int)
    if len(inner) < 64 or len(validation) < 8 or len(test) < 8:
        raise ValueError("Too few independent temporal samples for the pilot")
    return train, inner, validation, test, {"testGroups": sorted(test_groups), "validationGroups": sorted(validation_groups),
                                         "groupMinutes": 30, "testUsesLaterGroups": True}


def fit_ridge(x, y, alpha):
    centers = np.nanmedian(x, axis=0)
    centers = np.where(np.isfinite(centers), centers, 0.0)
    filled = np.where(np.isfinite(x), x, centers)
    scale = filled.std(axis=0)
    scale = np.where(scale > 1e-9, scale, 1.0)
    z = np.clip((filled-centers)/scale, -6.0, 6.0)
    design = np.column_stack([np.ones(len(z)), z])
    y_center = float(y.mean())
    y_scale = float(y.std()) if y.std() > 1e-9 else 1.0
    penalty = np.eye(design.shape[1])*alpha
    penalty[0,0] = 0.0
    weights = np.linalg.solve(design.T@design + penalty, design.T@((y-y_center)/y_scale))
    return {"featureCenters":centers.tolist(),"featureScales":scale.tolist(),"weights":weights.tolist(),
            "targetCenter":y_center,"targetScale":y_scale,"alpha":float(alpha)}


def predict_ridge(model, x):
    centers = np.array(model['featureCenters'])
    filled = np.where(np.isfinite(x),x,centers)
    z = np.clip((filled-centers)/np.array(model['featureScales']),-6.0,6.0)
    design = np.column_stack([np.ones(len(z)),z])
    return (design@np.array(model['weights']))*model['targetScale']+model['targetCenter']


def native_predictions(model, x, bounds, log_target):
    values = predict_ridge(model,x)
    lower,upper = bounds
    if log_target:
        values = np.exp(np.clip(values,np.log(lower),np.log(upper)))
    return np.clip(values,lower,upper)


def build_matrix(rows, keys):
    matrix = np.array([[row['features'].get(k,np.nan) for k in keys] for row in rows],dtype=float)
    for i,key in enumerate(keys):
        if key.startswith('capture'):
            matrix[:,i] = np.log1p(np.maximum(matrix[:,i],0))
    return matrix


def train(dataset):
    dataset = Path(dataset)
    receipt = json.loads((dataset/'dataset.json').read_text(encoding='utf-8'))
    if receipt['status'] != 'VERIFIED_RAW_AND_TECHNICAL_INPUTS':
        raise ValueError('Use only a complete verified RAW dataset')
    feature_path = dataset/'paired-features.jsonl'
    all_rows = [json.loads(line) for line in feature_path.read_text(encoding='utf-8').splitlines()]
    if len(all_rows) != receipt['referenceCount'] or len(all_rows) != receipt['decodedCount']:
        raise ValueError('Incomplete feature dataset')
    if any(r['approvalStatus'] != 'REFERENCE_APPROVED_BY_PHOTOGRAPHER' for r in all_rows):
        raise ValueError('Reference approval missing')
    copies = {r['imageId']:r['sha256'] for r in receipt['copies']}
    if any(copies.get(r['imageId']) != r['rawSha256'] for r in all_rows):
        raise ValueError('Feature/source hash mapping mismatch')
    rows = sorted([r for r in all_rows if r['styleVariant']=='color'],key=lambda r:r['captureTime'])
    train_ids,inner_ids,val_ids,test_ids,split = temporal_split(rows)
    # Feature schema and imputation are derived from training rows, not test targets.
    keys = sorted({key for i in train_ids for key in rows[i]['features']})
    x = build_matrix(rows,keys)
    result_models = {}
    metrics = {}
    predictions = {int(i):{} for i in test_ids}
    for target in TARGETS:
        y = np.array([r['currentParameters'].get(target,np.nan) for r in rows],dtype=float)
        valid = np.isfinite(y)
        if target=='Temperature':
            valid &= y>0
        outer = train_ids[valid[train_ids]]
        inner = inner_ids[valid[inner_ids]]
        validation = val_ids[valid[val_ids]]
        test = test_ids[valid[test_ids]]
        if min(len(inner),len(outer))<64 or min(len(validation),len(test))<8:
            metrics[target]={'status':'INSUFFICIENT_VALID_LABELS'}
            continue
        log_target = target=='Temperature'
        transformed = np.log(y[valid]) if log_target else y[valid]
        y_fit = np.full_like(y,np.nan)
        y_fit[valid] = transformed
        bounds_inner = [float(y[inner].min()),float(y[inner].max())]
        choices=[]
        # Widened from the original (1,10,100): on the real 524-reference color dataset,
        # Temperature's validation-only MAE kept improving up to alpha=30 then got worse
        # at 100 and 300, so the coarse 1/10/100 grid could land 3x off the true optimum
        # for a target whose best alpha falls between two of the old grid points.
        for alpha in (.3,1.0,3.0,10.0,30.0,100.0,300.0):
            candidate = fit_ridge(x[inner],y_fit[inner],alpha)
            proposed = native_predictions(candidate,x[validation],bounds_inner,log_target)
            choices.append((float(np.abs(proposed-y[validation]).mean()),alpha))
        _,alpha = min(choices)
        model = fit_ridge(x[outer],y_fit[outer],alpha)
        bounds = [float(y[outer].min()),float(y[outer].max())]
        proposed = native_predictions(model,x[test],bounds,log_target)
        baseline = float(np.median(y[outer]))
        baseline_mae = float(np.abs(y[test]-baseline).mean())
        mae = float(np.abs(y[test]-proposed).mean())
        metrics[target]={'status':'EVALUATED_ON_SINGLE_EVENT_TEMPORAL_HOLDOUT',
                         'trainLabels':len(outer),'testLabels':len(test),'mae':mae,
                         'trainingMedianBaselineMae':baseline_mae,'trainingMedianValue':baseline,
                         'improvementVsMedianPercent':100*(baseline_mae-mae)/baseline_mae if baseline_mae>1e-9 else None,
                         'selectedAlphaUsingInnerValidationOnly':alpha,
                         'betterThanMedianOnThisHoldout':mae<baseline_mae-1e-9}
        result_models[target]={'regression':model,'nativeBoundsFromTrainingOnly':bounds,'logTarget':log_target}
        for i,prediction in zip(test,proposed):
            predictions[int(i)][target]={'expected':float(y[i]),'prediction':float(prediction),'medianBaseline':baseline}
    if not result_models:
        raise ValueError('No target could be evaluated')
    folder=dataset/'pilot-models'/dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    folder.mkdir(parents=True,exist_ok=False)
    domains=sorted({row['inputDomain'] for row in rows})
    if len(domains)!=1:
        raise ValueError('Mixed rendering input domains')
    feature_hash=hashlib.sha256(feature_path.read_bytes()).hexdigest()
    source_metadata=json.loads((dataset/'source-metadata.json').read_text(encoding='utf-8'))
    model={'schema':'mizin-lightroom.numeric-pilot/1','status':'EXPERIMENTAL_NOT_FOR_AUTOMATIC_EDITING',
           'inputDomain':domains[0],'featureNames':keys,'log1pFeatures':[k for k in keys if k.startswith('capture')],
           'targets':result_models,'featureDatasetSha256':feature_hash,
           'supportedCameraModels':sorted({r['Model'] for r in source_metadata}),
           'rawpyVersions':sorted({r['rawpyVersion'] for r in rows}),
           'librawVersions':sorted({'.'.join(map(str,r['librawVersion'])) for r in rows}),
           'supportedTreatment':'color','modelsAreFinalRefitOnAllData':False,
           'crossEventGeneralizationValidated':False,'lightroomHostValidated':False}
    report={'schema':'mizin-lightroom.numeric-pilot-evaluation/1','generatedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),
            'datasetReferenceCount':len(all_rows),'colorSamples':len(rows),'featureCount':len(keys),
            'trainSamples':len(train_ids),'testSamples':len(test_ids),'eventCount':len({r['eventRootId'] for r in rows}),
            'split':split,'metrics':metrics,'crossEventGeneralizationValidated':False,
            'photographicQualityApproved':False,'lightroomHostValidated':False,
            'limitation':'A single event with temporal groups cannot establish performance on new jobs or visual quality.'}
    (folder/'model.json').write_text(json.dumps(model,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    (folder/'evaluation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
    with (folder/'holdout-predictions.jsonl').open('x',encoding='utf-8') as stream:
        for i,values in predictions.items():
            stream.write(json.dumps({'imageId':rows[i]['imageId'],'predictions':values},ensure_ascii=False,allow_nan=False)+'\n')
    return folder,report


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('dataset',type=Path)
    args=parser.parse_args()
    folder,report=train(args.dataset)
    print(json.dumps({'modelFolder':str(folder),'train':report['trainSamples'],'test':report['testSamples'],
                      'metrics':report['metrics'],'crossEventGeneralizationValidated':False},ensure_ascii=True))
