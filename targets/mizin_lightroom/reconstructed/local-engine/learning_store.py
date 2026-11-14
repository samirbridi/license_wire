"""Local approved-reference history, feedback and event-separated candidate fitting."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from pathlib import Path

import numpy as np

from import_approved_references import validate, strict_json
from train_numeric_pilot import TARGETS, build_matrix, fit_ridge, native_predictions


def encoded(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def digest(value):
    return hashlib.sha256(encoded(value).encode('utf-8')).hexdigest()


@contextmanager
def connect(root):
    root = Path(root); root.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(root/'learning.sqlite3', timeout=15)
    db.executescript('''
        CREATE TABLE IF NOT EXISTS revisions(
            id INTEGER PRIMARY KEY, source_key TEXT, raw_hash TEXT, event_id TEXT,
            label_hash TEXT, record TEXT, active INTEGER NOT NULL, UNIQUE(source_key,record));
        CREATE TABLE IF NOT EXISTS evaluations(
            event_id TEXT PRIMARY KEY, corpus_hash TEXT, folder TEXT, report TEXT);
        CREATE TABLE IF NOT EXISTS feedback(
            id INTEGER PRIMARY KEY, created_utc TEXT, rating TEXT, note TEXT, analysis_job TEXT);
    ''')
    try:
        with db:
            yield db
    finally:
        db.close()


def register(root, references, model, catalog_identity):
    validated = [validate(row, model) for row in references]
    if not isinstance(catalog_identity, str) or not catalog_identity.strip():
        raise ValueError('Identidade do catalogo ausente')
    added = duplicates = 0
    with connect(root) as db:
        for original, row in zip(references, validated):
            photo_id = original.get('catalogPhotoId') or row['sourcePath'].casefold()
            key = digest([catalog_identity.casefold(), str(photo_id)])
            identity = [row['currentParameters'], row['features'], row['eventGroupId']]
            # Retain historical hashes for references with no additional labels.
            if row.get('extendedParameters'):
                identity.append(row['extendedParameters'])
            if row.get('appearanceFeatures'):
                identity.append(row['appearanceFeatures'])
            label_hash = digest(identity)
            previous = db.execute('SELECT id,label_hash,record FROM revisions WHERE source_key=? AND active=1',(key,)).fetchone()
            if previous and dt.datetime.fromisoformat(strict_json(previous[2])['approvedUtc']) > dt.datetime.fromisoformat(row['approvedUtc']):
                duplicates += 1
                continue
            if previous and previous[1] == label_hash:
                duplicates += 1
                continue
            db.execute('UPDATE revisions SET active=0 WHERE source_key=?',(key,))
            db.execute('INSERT INTO revisions(source_key,raw_hash,event_id,label_hash,record,active) VALUES(?,?,?,?,?,1)',
                       (key,row['rawSha256'],row['eventGroupId'],label_hash,encoded(row)))
            added += 1
    return {'newApprovedRevisions':added,'unchangedReferences':duplicates, **summary(root)}


def active_rows(db):
    grouped = {}
    for raw_hash, label_hash, record in db.execute('SELECT raw_hash,label_hash,record FROM revisions WHERE active=1 ORDER BY id'):
        grouped.setdefault(raw_hash, {})[label_hash] = strict_json(record)
    conflicts = sum(len(versions)>1 for versions in grouped.values())
    return [next(iter(versions.values())) for versions in grouped.values() if len(versions)==1], conflicts


def variant_of(row):
    return row.get('styleVariant', 'color')


def report_variant(report):
    # Evaluations created before monochrome support are color evaluations.
    return report.get('styleVariant', 'color')


def summary(root):
    with connect(root) as db:
        rows, conflicts = active_rows(db)
        monochrome = [row for row in rows if variant_of(row) == 'monochrome']
        mono_groups = {}
        for row in monochrome:
            mono_groups[row['eventGroupId']] = mono_groups.get(row['eventGroupId'], 0) + 1
        rows = [row for row in rows if variant_of(row) == 'color']
        groups = {}
        for row in rows:
            item = groups.setdefault(row['eventGroupId'],{'name':row['eventName'],'count':0})
            item['count'] += 1
        mono_latest = None
        for folder, report in db.execute('SELECT folder,report FROM evaluations ORDER BY rowid DESC'):
            if report_variant(strict_json(report)) == 'monochrome':
                mono_latest = folder
                break
        latest = None; latest_report={}; latest_corpus=None
        for folder, report, stored_corpus in db.execute('SELECT folder,report,corpus_hash FROM evaluations ORDER BY rowid DESC'):
            if report_variant(strict_json(report)) == 'color':
                latest = (folder,)
                latest_report=strict_json(report);latest_corpus=stored_corpus
                break
        return {'uniqueApprovedReferences':len(rows),'eventCount':len(groups),'events':groups,
                'monochromeReferences':len(monochrome),'monochromeEventCount':len(mono_groups),
                'monochromeEventsWith50':sum(count>=50 for count in mono_groups.values()),
                'latestMonochromeCandidate':mono_latest,
                'conflictingRawFilesExcluded':conflicts,'feedbackCount':db.execute('SELECT COUNT(*) FROM feedback').fetchone()[0],
                'latestCandidate':latest[0] if latest else None,'modelActivated':False,
                'candidateTrainingReferences':latest_report.get('deploymentTrainingReferences',latest_report.get('trainingReferences',0)),
                'candidateNeedsRefresh':bool(latest and latest_corpus!=corpus_identity([r for r in rows if groups[r['eventGroupId']]['count']>=50])),
                'appearanceReferences':sum(bool(r.get('appearanceFeatures')) for r in rows),
                'appearanceWhiteBalanceEnabled':latest_report.get('appearanceWhiteBalanceEnabled',False),
                'nextStep':'COLLECT_THREE_EVENTS_WITH_50_REFERENCES' if sum(g['count']>=50 for g in groups.values())<3 else 'CANDIDATE_OR_NEW_EVALUATION_EVENT'}


def record_feedback(root, rating, note, analysis_job):
    if rating not in ('GOOD','ADJUSTED','POOR') or not isinstance(note,str) or len(note)>1000:
        raise ValueError('Avaliacao invalida')
    if not isinstance(analysis_job,str) or len(analysis_job)>128:
        raise ValueError('Identidade da analise invalida')
    with connect(root) as db:
        db.execute('INSERT INTO feedback(created_utc,rating,note,analysis_job) VALUES(?,?,?,?)',
                   (dt.datetime.now(dt.timezone.utc).isoformat(),rating,note,analysis_job))
    return {'feedbackSaved':True,'feedbackUsedAsApprovedEdits':False,**summary(root)}


def evaluation_key(variant, event_id):
    # Color keeps the historical key; monochrome evaluations are namespaced.
    return event_id if variant == 'color' else variant + ':' + event_id


PIPELINE_VERSION = 2
SKIN_KEYS = ['skinR', 'skinG', 'skinB', 'skinRedBlueRatio', 'skinRedGreenRatio']


def corpus_identity(rows):
    return digest(sorted((r['rawSha256'], digest([r['currentParameters'], r['features'],
                        r.get('extendedParameters', {}), r.get('appearanceFeatures', {})])) for r in rows))


def appearance_rows(rows):
    return [{**r, 'features': {**r['features'], **r.get('appearanceFeatures', {})}}
            for r in rows if all(k in r.get('appearanceFeatures', {}) for k in SKIN_KEYS)]


def fit_appearance(inner, validation, train, base):
    """Select WB-only skin regressions on internal validation, never on evaluation labels."""
    parts = [appearance_rows(part) for part in (inner, validation, train)]
    if min(map(len, parts)) < 50:
        return None
    keys = list(base['featureNames'])+SKIN_KEYS
    xs = [build_matrix(part, keys) for part in parts]
    baseline_x = [build_matrix(part, base['featureNames']) for part in parts[:2]]
    targets = {}
    for target in ('Temperature', 'Tint'):
        ys = [np.array([r['currentParameters'][target] for r in part], dtype=float) for part in parts]
        log = target == 'Temperature'
        bounds = [float(ys[0].min()), float(ys[0].max())]
        alpha_base = base['targets'][target]['regression']['alpha']
        base_fit = fit_ridge(baseline_x[0], np.log(ys[0]) if log else ys[0], alpha_base)
        base_error = float(np.abs(native_predictions(base_fit, baseline_x[1], bounds, log)-ys[1]).mean())
        choices = []
        for alpha in (.3, 1., 3., 10., 30., 100., 300.):
            fit = fit_ridge(xs[0], np.log(ys[0]) if log else ys[0], alpha)
            error = float(np.abs(native_predictions(fit, xs[1], bounds, log)-ys[1]).mean())
            choices.append((error, alpha))
        error, alpha = min(choices)
        if error >= base_error*.95:
            continue
        targets[target] = {'regression': fit_ridge(xs[2], np.log(ys[2]) if log else ys[2], alpha),
                           'nativeBoundsFromTrainingOnly': [float(ys[2].min()), float(ys[2].max())],
                           'logTarget': log}
    return {'featureNames': keys, 'requiredFeatures': SKIN_KEYS, 'targets': targets} if targets else None


def refit_all(model, rows):
    """Deployment fit uses ALL approved examples; evaluation weights remain a separate file."""
    import copy
    model = copy.deepcopy(model)
    for group, field in (('targets', 'currentParameters'), ('extendedTargets', 'extendedParameters')):
        for name, target in model.get(group, {}).items():
            eligible = [r for r in rows if name in r.get(field, {})]
            ys = np.array([r[field][name] for r in eligible], dtype=float)
            target['regression'] = fit_ridge(build_matrix(eligible, model['featureNames']),
                                             np.log(ys) if target['logTarget'] else ys, target['regression']['alpha'])
            target['nativeBoundsFromTrainingOnly'] = [float(ys.min()), float(ys.max())]
    appearance = model.get('appearanceWhiteBalance')
    if appearance:
        eligible = appearance_rows(rows)
        if len(eligible) < 50:
            model.pop('appearanceWhiteBalance')
        else:
            for name, target in appearance['targets'].items():
                ys = np.array([r['currentParameters'][name] for r in eligible], dtype=float)
                target['regression'] = fit_ridge(build_matrix(eligible, appearance['featureNames']),
                                                np.log(ys) if target['logTarget'] else ys, target['regression']['alpha'])
                target['nativeBoundsFromTrainingOnly'] = [float(ys.min()), float(ys.max())]
    model.update(modelsAreFinalRefitOnAllData=True, trainingPipelineVersion=PIPELINE_VERSION,
                 deploymentTrainingReferences=len(rows), featureDatasetSha256=corpus_identity(rows))
    return model


def refresh_candidate(db, root, rows, groups, variant, previous):
    path, _ = latest_candidate(root, variant)
    model = strict_json(path.read_text(encoding='utf-8'))
    eligible = [r for group in groups.values() for r in group]
    if model.get('trainingPipelineVersion') == PIPELINE_VERSION and model.get('featureDatasetSha256') == corpus_identity(eligible):
        return {'candidateCreated': False, 'reason': 'NO_APPROVED_CHANGES', 'styleVariant': variant}
    # Reusing training events is allowed for a deployment refresh, but it is NOT a
    # new independent evaluation. Old assessment metrics are not relabelled as current.
    validation_id = previous['validationEvent']
    validation = groups.get(validation_id, [])
    inner = [r for key, group in groups.items() if key != validation_id for r in group]
    if variant == 'color':
        appearance = fit_appearance(inner, validation, eligible, model)
        if appearance:
            model['appearanceWhiteBalance'] = appearance
        else:
            model.pop('appearanceWhiteBalance', None)
    model = refit_all(model, eligible)
    folder = root/'models'/('candidate-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8])
    folder.mkdir(parents=True, exist_ok=False)
    content = (encoded(model)+'\n').encode('utf-8')
    (folder/'model.json').write_bytes(content)
    report = {**previous, 'candidateCreated': True, 'reason': 'APPROVED_DATA_REFIT',
              'freshEvaluationPerformed': False, 'metricsApplyToCurrentWeights': False,
              'deploymentTrainingReferences': len(eligible), 'appearanceTrainingReferences': len(appearance_rows(eligible)),
              'appearanceWhiteBalanceEnabled': bool(model.get('appearanceWhiteBalance')),
              'modelActivated': False, 'modelSha256': hashlib.sha256(content).hexdigest(),
              'candidateDirectory': str(folder), 'refreshedUtc': dt.datetime.now(dt.timezone.utc).isoformat()}
    (folder/'evaluation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    db.execute('INSERT INTO evaluations(event_id,corpus_hash,folder,report) VALUES(?,?,?,?)',
               ('refit:'+variant+':'+uuid.uuid4().hex, model['featureDatasetSha256'], str(folder), encoded(report)))
    return report


def train_candidate(root, contract, variant='color'):
    """A fresh event is evaluated once; candidate weights never activate themselves."""
    from develop_targets import VARIANTS
    if variant not in VARIANTS:
        raise ValueError('Variante de estilo invalida')
    root=Path(root)
    with connect(root) as db:
        rows, conflicts=active_rows(db)
        rows=[row for row in rows if variant_of(row)==variant]
        groups={}
        for row in rows:groups.setdefault(row['eventGroupId'],[]).append(row)
        groups={key:values for key,values in groups.items() if len(values)>=50}
        used=set();latest_report=None
        for event_id,old_report in db.execute('SELECT event_id,report FROM evaluations ORDER BY rowid'):
            previous=strict_json(old_report)
            if report_variant(previous)!=variant:
                continue
            latest_report=previous
            used.update([previous['evaluationEvent'] if 'evaluationEvent' in previous else event_id,
                         previous['validationEvent'],*previous['innerTrainingEvents']])
        fresh=sorted(set(groups)-used, key=lambda key:(max(r['captureTimeExif'] for r in groups[key]),key))
        if len(groups)<3:
            return {'candidateCreated':False,'reason':'MORE_EVENTS_REQUIRED'}
        if not fresh:
            return refresh_candidate(db, root, rows, groups, variant, latest_report)
        test_group=fresh[-1]
        other=sorted(set(groups)-{test_group})
        validation_group=other[-1]
        train=[r for key in other for r in groups[key]]
        inner=[r for key in other if key!=validation_group for r in groups[key]]
        validation=groups[validation_group];test=groups[test_group]
        keys=contract['featureNames']
        matrices=[build_matrix(part,keys) for part in (inner,validation,train,test)]
        result_models={};metrics={}
        for target in TARGETS:
            ys=[np.array([r['currentParameters'][target] for r in part],dtype=float) for part in (inner,validation,train,test)]
            log_target=target=='Temperature'
            choices=[]
            inner_bounds=[float(ys[0].min()),float(ys[0].max())]
            # Widened from (1,10,100): a coarse 10x-spaced grid can miss the true optimum
            # by a wide margin whenever it falls between two grid points (observed for
            # Temperature on the real color dataset). Selection still uses validation only.
            for alpha in (.3,1.0,3.0,10.0,30.0,100.0,300.0):
                candidate=fit_ridge(matrices[0],np.log(ys[0]) if log_target else ys[0],alpha)
                pred=native_predictions(candidate,matrices[1],inner_bounds,log_target)
                choices.append((float(np.abs(pred-ys[1]).mean()),alpha))
            _,alpha=min(choices)
            regression=fit_ridge(matrices[2],np.log(ys[2]) if log_target else ys[2],alpha)
            bounds=[float(ys[2].min()),float(ys[2].max())]
            predictions=native_predictions(regression,matrices[3],bounds,log_target)
            mae=float(np.abs(predictions-ys[3]).mean())
            baseline=float(np.abs(ys[3]-np.median(ys[2])).mean())
            metrics[target]={'mae':mae,'trainingMedianBaselineMae':baseline,'betterThanMedian':mae<baseline,'selectedAlpha':alpha}
            result_models[target]={'regression':regression,'nativeBoundsFromTrainingOnly':bounds,'logTarget':log_target}
        # Optional labels must have sufficient coverage in EVERY independent split.
        # Never impute absent develop settings as neutral training targets.
        extended_keys = sorted({key for r in inner for key in r.get('extendedParameters', {})})
        extended_models = {}; extended_metrics = {}
        for target in extended_keys:
            parts = [[r for r in part if target in r.get('extendedParameters', {})]
                     for part in (inner, validation, train, test)]
            if min(map(len, parts)) < 50:
                extended_metrics[target] = {'status': 'INSUFFICIENT_SPLIT_COVERAGE'}
                continue
            xs = [build_matrix(part, keys) for part in parts]
            ys = [np.array([r['extendedParameters'][target] for r in part], dtype=float) for part in parts]
            bounds_inner = [float(ys[0].min()), float(ys[0].max())]
            choices = []
            for alpha in (.3,1.0,3.0,10.0,30.0,100.0,300.0):
                candidate = fit_ridge(xs[0], ys[0], alpha)
                pred = native_predictions(candidate, xs[1], bounds_inner, False)
                choices.append((float(np.abs(pred-ys[1]).mean()), alpha))
            _, alpha = min(choices)
            regression = fit_ridge(xs[2], ys[2], alpha)
            bounds = [float(ys[2].min()), float(ys[2].max())]
            pred = native_predictions(regression, xs[3], bounds, False)
            mae = float(np.abs(pred-ys[3]).mean())
            baseline = float(np.abs(ys[3]-np.median(ys[2])).mean())
            extended_metrics[target] = {'status': 'EXPERIMENTAL_HELD_OUT_EVENT',
                'mae': mae, 'trainingMedianBaselineMae': baseline,
                'betterThanMedian': mae < baseline, 'selectedAlpha': alpha,
                'splitLabelCounts': list(map(len, parts))}
            extended_models[target] = {'regression': regression,
                'nativeBoundsFromTrainingOnly': bounds, 'logTarget': False}
        eligible=[r for group in groups.values() for r in group]
        corpus_hash=corpus_identity(eligible)
        folder=root/'models'/('candidate-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8])
        folder.mkdir(parents=True,exist_ok=False)
        model={**{k:contract[k] for k in ('schema','inputDomain','featureNames','log1pFeatures','supportedCameraModels','rawpyVersions','librawVersions')},
               'supportedTreatment':variant,'status':'EXPERIMENTAL_NOT_FOR_AUTOMATIC_EDITING','targets':result_models,
               'extendedTargets':extended_models,'featureDatasetSha256':corpus_hash,
               'crossEventGeneralizationValidated':False,'lightroomHostValidated':False,'modelsAreFinalRefitOnAllData':False}
        if variant=='color':
            appearance=fit_appearance(inner,validation,train,model)
            if appearance:
                model['appearanceWhiteBalance']=appearance
                # Evaluate the actual optional/fallback route on the untouched event.
                # Choosing the feature set above never consults these labels.
                for target, fitted in appearance['targets'].items():
                    base=result_models[target]
                    pred=native_predictions(base['regression'],matrices[3],base['nativeBoundsFromTrainingOnly'],base['logTarget'])
                    selected=[i for i,r in enumerate(test) if all(k in r.get('appearanceFeatures',{}) for k in SKIN_KEYS)]
                    if selected:
                        rich=appearance_rows([test[i] for i in selected])
                        pred[selected]=native_predictions(fitted['regression'],build_matrix(rich,appearance['featureNames']),
                            fitted['nativeBoundsFromTrainingOnly'],fitted['logTarget'])
                    truth=np.array([r['currentParameters'][target] for r in test],dtype=float)
                    mae=float(np.abs(pred-truth).mean())
                    metrics[target].update(mae=mae,betterThanMedian=mae<metrics[target]['trainingMedianBaselineMae'],
                        appearanceEvaluationReferences=len(selected),appearanceSelectedAlpha=fitted['regression']['alpha'])
        evaluation_bytes=(encoded(model)+'\n').encode('utf-8')
        (folder/'evaluation-model.json').write_bytes(evaluation_bytes)
        model=refit_all(model,eligible)
        report={'schema':'mizin-lightroom.acervo-candidate-evaluation/1','candidateCreated':True,'styleVariant':variant,'trainingReferences':len(train),
                'innerTrainingEvents':sorted(set(other)-{validation_group}),'validationEvent':validation_group,'evaluationEvent':test_group,
                'evaluationReferences':len(test),'eventCount':len(groups),'conflictsExcluded':conflicts,'metrics':metrics,
                'extendedMetrics':extended_metrics,
                'modelActivated':False,'photographicQualityApproved':False,'feedbackTreatedAsGroundTruth':False,
                'freshEvaluationPerformed':True,'metricsApplyToCurrentWeights':False,
                'evaluationModelSha256':hashlib.sha256(evaluation_bytes).hexdigest(),
                'evaluationModelPath':str(folder/'evaluation-model.json'),
                'deploymentTrainingReferences':len(eligible),'appearanceTrainingReferences':len(appearance_rows(eligible)),
                'appearanceWhiteBalanceEnabled':bool(model.get('appearanceWhiteBalance')),
                'limitation':'One event is evaluated once; results do not establish general photographic quality.'}
        model_bytes=(encoded(model)+'\n').encode('utf-8');(folder/'model.json').write_bytes(model_bytes)
        report['modelSha256']=hashlib.sha256(model_bytes).hexdigest();report['candidateDirectory']=str(folder)
        (folder/'evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        db.execute('INSERT INTO evaluations(event_id,corpus_hash,folder,report) VALUES(?,?,?,?)',
                   (evaluation_key(variant,test_group),corpus_hash,str(folder),encoded(report)))
        return report


def latest_candidate(root, variant='color'):
    latest=None
    with connect(root) as db:
        for folder,report in db.execute('SELECT folder,report FROM evaluations ORDER BY rowid DESC'):
            if report_variant(strict_json(report))==variant:
                latest=(folder,report);break
    if not latest:
        if variant=='monochrome':raise ValueError('Ainda nao ha modelo P&B treinado: colete referencias P&B aprovadas de pelo menos tres trabalhos (50 cada)')
        raise ValueError('Ainda nao ha modelo candidato: importe referencias de pelo menos tres trabalhos')
    folder=Path(latest[0]).resolve();allowed=(Path(root)/'models').resolve()
    if not folder.is_relative_to(allowed):raise ValueError('Pasta de modelo invalida')
    path=folder/'model.json';report=strict_json(latest[1])
    if hashlib.sha256(path.read_bytes()).hexdigest()!=report['modelSha256']:raise ValueError('Modelo candidato alterado')
    return path,report['modelSha256']
