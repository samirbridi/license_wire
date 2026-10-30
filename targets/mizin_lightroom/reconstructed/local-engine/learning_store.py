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
            label_hash = digest([row['currentParameters'], row['features'], row['eventGroupId']])
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


def summary(root):
    with connect(root) as db:
        rows, conflicts = active_rows(db)
        groups = {}
        for row in rows:
            item = groups.setdefault(row['eventGroupId'],{'name':row['eventName'],'count':0})
            item['count'] += 1
        latest = db.execute('SELECT folder,report FROM evaluations ORDER BY rowid DESC LIMIT 1').fetchone()
        return {'uniqueApprovedReferences':len(rows),'eventCount':len(groups),'events':groups,
                'conflictingRawFilesExcluded':conflicts,'feedbackCount':db.execute('SELECT COUNT(*) FROM feedback').fetchone()[0],
                'latestCandidate':latest[0] if latest else None,'modelActivated':False,
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


def train_candidate(root, contract):
    """A fresh event is evaluated once; candidate weights never activate themselves."""
    root=Path(root)
    with connect(root) as db:
        rows, conflicts=active_rows(db)
        groups={}
        for row in rows:groups.setdefault(row['eventGroupId'],[]).append(row)
        groups={key:values for key,values in groups.items() if len(values)>=50}
        used=set()
        for event_id,old_report in db.execute('SELECT event_id,report FROM evaluations'):
            previous=strict_json(old_report)
            used.update([event_id,previous['validationEvent'],*previous['innerTrainingEvents']])
        fresh=sorted(set(groups)-used, key=lambda key:(max(r['captureTimeExif'] for r in groups[key]),key))
        if len(groups)<3 or not fresh:
            return {'candidateCreated':False,'reason':'MORE_EVENTS_REQUIRED' if len(groups)<3 else 'WAIT_FOR_A_NEW_EVALUATION_EVENT'}
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
            for alpha in (1.0,10.0,100.0):
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
        corpus_hash=digest(sorted((r['rawSha256'],digest(r['currentParameters'])) for r in rows))
        folder=root/'models'/('candidate-'+dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8])
        folder.mkdir(parents=True,exist_ok=False)
        model={**{k:contract[k] for k in ('schema','inputDomain','featureNames','log1pFeatures','supportedCameraModels','rawpyVersions','librawVersions','supportedTreatment')},
               'status':'EXPERIMENTAL_NOT_FOR_AUTOMATIC_EDITING','targets':result_models,'featureDatasetSha256':corpus_hash,
               'crossEventGeneralizationValidated':False,'lightroomHostValidated':False,'modelsAreFinalRefitOnAllData':False}
        report={'schema':'mizin-lightroom.acervo-candidate-evaluation/1','candidateCreated':True,'trainingReferences':len(train),
                'innerTrainingEvents':sorted(set(other)-{validation_group}),'validationEvent':validation_group,'evaluationEvent':test_group,
                'evaluationReferences':len(test),'eventCount':len(groups),'conflictsExcluded':conflicts,'metrics':metrics,
                'modelActivated':False,'photographicQualityApproved':False,'feedbackTreatedAsGroundTruth':False,
                'limitation':'One event is evaluated once; results do not establish general photographic quality.'}
        model_bytes=(encoded(model)+'\n').encode('utf-8');(folder/'model.json').write_bytes(model_bytes)
        report['modelSha256']=hashlib.sha256(model_bytes).hexdigest();report['candidateDirectory']=str(folder)
        (folder/'evaluation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        db.execute('INSERT INTO evaluations(event_id,corpus_hash,folder,report) VALUES(?,?,?,?)',
                   (test_group,corpus_hash,str(folder),encoded(report)))
        return report


def latest_candidate(root):
    with connect(root) as db:
        latest=db.execute('SELECT folder,report FROM evaluations ORDER BY rowid DESC LIMIT 1').fetchone()
    if not latest:raise ValueError('Ainda nao ha modelo candidato: importe referencias de pelo menos tres trabalhos')
    folder=Path(latest[0]).resolve();allowed=(Path(root)/'models').resolve()
    if not folder.is_relative_to(allowed):raise ValueError('Pasta de modelo invalida')
    path=folder/'model.json';report=strict_json(latest[1])
    if hashlib.sha256(path.read_bytes()).hexdigest()!=report['modelSha256']:raise ValueError('Modelo candidato alterado')
    return path,report['modelSha256']
