"""Offline selection inference. Writes only new job files; never Lightroom/RAW edits."""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import platform
import subprocess
import sys
import time
import traceback
import unicodedata
import uuid
import zipfile
from pathlib import Path

os.environ['OMP_NUM_THREADS'] = '4'
os.environ['OPENBLAS_NUM_THREADS'] = '1'

from raw_features import sha256_file, source_reader, technical_render
from train_numeric_pilot import TARGETS, build_matrix, native_predictions

DOMAIN = 'LIBRAW_CAMERA_WB_SRGB_HALF_SIZE_NO_AUTO_BRIGHT_V1'
MAX_PHOTOS = 100
DISPLAY_TARGETS = ('Exposure2012', 'Temperature', 'Contrast2012')


def utc_now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read_json(path, limit=8 * 1024 * 1024):
    with Path(path).open('rb') as stream:
        content = stream.read(limit + 1)
    if len(content) > limit:
        raise ValueError('JSON excede o limite de tamanho')
    def reject(value):
        raise ValueError('Numero JSON invalido: ' + value)
    return json.loads(content.decode('utf-8-sig'), parse_constant=reject)


def write_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp-' + uuid.uuid4().hex)
    with temporary.open('x', encoding='utf-8', newline='\n') as stream:
        json.dump(value, stream, ensure_ascii=False, allow_nan=False, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    # Windows readers can briefly deny replacement while the SDK reads progress.
    for attempt in range(21):
        try:
            os.replace(temporary, path)
            break
        except PermissionError:
            if attempt == 20:
                raise
            time.sleep(0.05)


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate_model(model):
    if model.get('schema') != 'mizin-lightroom.numeric-pilot/1' or model.get('inputDomain') != DOMAIN:
        raise ValueError('Modelo ou dominio de entrada incompativel')
    if model.get('supportedTreatment') != 'color':
        raise ValueError('Este motor espera um modelo em cor')
    keys = model.get('featureNames', [])
    if not keys or len(keys) > 256 or len(set(keys)) != len(keys) or not all(isinstance(k, str) for k in keys):
        raise ValueError('Schema de atributos invalido')
    if model.get('log1pFeatures') != [k for k in keys if k.startswith('capture')]:
        raise ValueError('Transformacao de atributos incompativel')
    targets = model.get('targets', {})
    if not set(DISPLAY_TARGETS).issubset(targets) or not set(targets).issubset(TARGETS):
        raise ValueError('Controles do modelo incompativeis')
    for name, target in targets.items():
        regression = target['regression']
        for key, size in (('featureCenters', len(keys)), ('featureScales', len(keys)), ('weights', len(keys) + 1)):
            values = regression[key]
            if len(values) != size or not all(finite_number(v) for v in values):
                raise ValueError('Coeficientes invalidos')
        if any(v <= 0 for v in regression['featureScales']):
            raise ValueError('Escalas invalidas')
        if not finite_number(regression['targetCenter']) or not finite_number(regression['targetScale']) or regression['targetScale'] <= 0:
            raise ValueError('Escala do alvo invalida')
        bounds = target['nativeBoundsFromTrainingOnly']
        if len(bounds) != 2 or not all(finite_number(v) for v in bounds) or bounds[0] > bounds[1]:
            raise ValueError('Limites do controle invalidos')
        if target['logTarget'] != (name == 'Temperature') or (name == 'Temperature' and bounds[0] <= 0):
            raise ValueError('Transformacao do controle invalida')
    return model


def predict_features(model, features):
    if any(not finite_number(v) for v in features.values()):
        raise ValueError('Atributos nao finitos')
    matrix = build_matrix([{'features': features}], model['featureNames'])
    output = {}
    for name, target in model['targets'].items():
        value = float(native_predictions(target['regression'], matrix, target['nativeBoundsFromTrainingOnly'], target['logTarget'])[0])
        if not math.isfinite(value):
            raise ValueError('Previsao nao finita')
        output[name] = value
    return output


def metadata_for(path, executable, argument_path):
    text = str(path).replace('\\', '/')
    if any(ord(c) < 32 for c in text):
        raise ValueError('Caminho com caracteres de controle')
    with argument_path.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write('--\n' + text + '\n')
    command = [str(executable), '-config', '', '-fast2', '-json', '-charset', 'filename=UTF8',
               '-FileName', '-FileType', '-EXIF:Model', '-ISO', '-ExposureTime#', '-FNumber', '-FocalLength#',
               '-EXIF:DateTimeOriginal', '-SubSecDateTimeOriginal',
               '-@', str(argument_path)]
    result = subprocess.run(command, capture_output=True, encoding='utf-8', errors='strict', timeout=90,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0), check=False)
    if result.returncode:
        raise RuntimeError('Leitura de metadados falhou: ' + result.stderr[:600])
    rows = json.loads(result.stdout)
    if len(rows) != 1 or rows[0].get('Error'):
        raise ValueError('Metadados indisponiveis')
    row = rows[0]
    if os.path.normcase(os.path.abspath(row['SourceFile'])) != os.path.normcase(str(path)):
        raise ValueError('Metadados associados a outro arquivo')
    if row.get('FileType') != 'CR3':
        raise ValueError('Este piloto aceita somente RAW CR3')
    return row


def runtime_info():
    import numpy
    import rawpy
    import PIL
    return {'python': platform.python_version(), 'architecture': platform.machine(), 'os': platform.platform(),
            'cpuCount': os.cpu_count(), 'numpy': numpy.__version__, 'rawpy': rawpy.__version__,
            'libraw': '.'.join(map(str, rawpy.libraw_version)), 'pillow': PIL.__version__,
            'isolatedPython': bool(sys.flags.isolated)}


def csv_report(path, rows):
    with path.open('x', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream, delimiter=';')
        writer.writerow(['foto', 'estado', 'controle', 'lido_no_inicio', 'sugestao', 'erro'])
        def cell(value):
            text = str(value)
            # Keep RAW names as text if opened in a spreadsheet.
            return "'" + text if text.startswith(('=', '+', '-', '@', '\t', '\r', '\n')) else text
        for row in rows:
            if row['status'] != 'COMPUTED':
                writer.writerow([cell(row['filename']), row['status'], '', '', '', cell(row.get('error', ''))])
                continue
            for control, value in row['predictions'].items():
                current = row['current'].get(control)
                writer.writerow([cell(row['filename']), row['status'], control,
                                 '' if current is None else str(round(current, 4)).replace('.', ','),
                                 str(round(value, 4)).replace('.', ','), ''])


def reference_batch(request):
    if request.get('referencesApproved') is not True:
        raise ValueError('A selecao precisa ser confirmada como revisada e aprovada pelo fotografo')
    name = request.get('eventName')
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 160 or any(ord(c) < 32 for c in name):
        raise ValueError('Informe um nome de trabalho valido, preferencialmente com data')
    name = ' '.join(unicodedata.normalize('NFKC', name).split())
    # Grouping is explicit; the collector never guesses an event from a filename.
    import hashlib
    event_id = hashlib.sha256(name.casefold().encode('utf-8')).hexdigest()
    approval = {'catalog':'USER_CONFIRMED_APPROVED_CATALOG_IN_PLUGIN',
                'event':'USER_CONFIRMED_COMPLETED_EVENT_IN_PLUGIN'}.get(request.get('referenceApprovalScope'),
                       'USER_CONFIRMED_REVIEWED_SELECTION_IN_PLUGIN')
    return {'eventName': name, 'eventGroupId': event_id,
            'approvalSource': approval, 'approvedUtc': utc_now(),
            'parameterScope': 'TEN_BASIC_GLOBAL_DEVELOP_CONTROLS', 'modelTrainingPerformed': False}


def export_references(path, rows, batch, model, runtime):
    with path.open('x', encoding='utf-8', newline='\n') as stream:
        for row in rows:
            if row['status'] != 'REFERENCE_COLLECTED':
                continue
            reference = {'schema': 'mizin-lightroom.approved-reference/1', **batch,
                         'sourcePath': row['path'], 'rawSha256': row['sourceSha256'], 'cameraModel': row['cameraModel'],
                         'captureTimeExif': row['captureTimeExif'], 'sourceMetadataStable': row['sourceMetadataStable'],
                         'approvalStatus': 'REFERENCE_APPROVED_BY_PHOTOGRAPHER', 'styleVariant': 'color',
                         'currentParameters': row['current'], 'features': row['features'], 'featureNames': model['featureNames'],
                         'inputDomain': DOMAIN, 'rawpyVersion': runtime['rawpy'], 'librawVersion': runtime['libraw']}
            if batch.get('catalogIdentity'):
                reference.update({'catalogIdentity':batch['catalogIdentity'],'catalogPhotoId':row['id']})
            stream.write(json.dumps(reference, ensure_ascii=False, allow_nan=False) + '\n')


def export_reference_package(job, destination):
    """Package only approved data and provenance; never include technical images."""
    payloads = {}
    for name in ('references.jsonl', 'request.json', 'results.json'):
        path = Path(job) / name
        if path.stat().st_size > 8 * 1024 * 1024:
            raise ValueError('Arquivo de referencias excede o limite do pacote')
        payloads[name] = path.read_bytes()
    report = json.loads(payloads['results.json'].decode('utf-8-sig'))
    references = [json.loads(line) for line in payloads['references.jsonl'].decode('utf-8-sig').splitlines() if line.strip()]
    if report.get('operation') != 'collect' or not references or len(references) != report.get('collectedReferences'):
        raise ValueError('Contagem ou operacao incompativel com o pacote de referencias')
    if any(row.get('schema') != 'mizin-lightroom.approved-reference/1' for row in references):
        raise ValueError('Formato de referencia incompativel')
    import hashlib
    manifest = {'schema': 'mizin-lightroom.reference-package/1', 'jobId': report['jobId'],
                'collectorVersion': report['version'], 'referenceCount': len(references),
                'collectionStatus': report['status'], 'containsPixels': False,
                'containsPrivatePaths': True, 'trainingPerformed': False, 'modelActivated': False,
                'files': {name: {'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
                          for name, content in payloads.items()}}
    destination = Path(destination)
    with destination.open('xb') as output:
        with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in payloads.items():
                archive.writestr(name, content)
            archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, allow_nan=False, indent=2))
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() is not None:
            raise ValueError('Pacote de referencias corrompido')
    return {'file': destination.name, 'sha256': sha256_file(destination), 'bytes': destination.stat().st_size,
            'referenceCount': len(references), 'containsPixels': False}


def run_job(job, bundle):
    job, bundle = Path(job).resolve(strict=True), Path(bundle).resolve(strict=True)
    if job.is_relative_to(bundle):
        raise ValueError('Resultados devem ficar fora da pasta do plugin')
    if any((job / name).exists() for name in ('run.lock', 'status.json', 'results.json', 'results.csv', 'references.jsonl')):
        raise ValueError('A tarefa ja foi executada; crie uma nova pasta')
    with (job / 'run.lock').open('x', encoding='ascii') as stream:
        stream.write(str(os.getpid()))
    report = {'schema': 'mizin-lightroom.selection-analysis/1', 'startedUtc': utc_now(), 'status': 'FAILED',
              'results': [], 'catalogWrites': 0, 'sourceWrites': 0, 'photosUploaded': 0,
              'photographicQualityApproved': False, 'crossEventGeneralizationValidated': False}
    started = time.monotonic()
    def progress(phase, completed=0, total=0, filename=''):
        write_json(job / 'status.json', {'phase': phase, 'completed': completed, 'total': total,
                                         'filename': filename, 'updatedUtc': utc_now()})
    try:
        progress('STARTING')
        request = read_json(job / 'request.json')
        if request.get('schema') != 'mizin-lightroom.selection-request/1' or request.get('operation') not in ('analyze', 'diagnostic', 'collect', 'learning-status', 'learning-update', 'feedback'):
            raise ValueError('Pedido incompativel')
        collecting = request['operation'] == 'collect'
        batch = reference_batch(request) if collecting else None
        report['jobId'] = request['jobId']
        info = read_json(bundle / 'BuildInfo.json')
        if collecting:
            batch.update({'collectorVersion': info['version'], 'jobId': request['jobId'],
                          'lightroomVersion': request.get('lightroomVersion')})
            if request.get('learnFromReferences') is True:
                identity=request.get('catalogIdentity')
                if not isinstance(identity,str) or not 1<=len(identity)<=2000:
                    raise ValueError('Identidade do catalogo ausente no aprendizado')
                batch['catalogIdentity']=identity
        model_path = bundle / 'Models' / 'pilot-model.json'
        if sha256_file(model_path) != info['modelSha256']:
            raise ValueError('Modelo diferente do incluido no pacote')
        model = validate_model(read_json(model_path))
        learning_root=job.parent/'learning'
        if request.get('modelVariant') == 'candidate':
            if request['operation'] != 'analyze':raise ValueError('Modelo candidato e usado somente na avaliacao de sugestoes')
            from learning_store import latest_candidate
            model_path,candidate_sha=latest_candidate(learning_root)
            model=validate_model(read_json(model_path))
        runtime = runtime_info()
        if runtime['rawpy'] not in model['rawpyVersions'] or runtime['libraw'] not in model['librawVersions']:
            raise ValueError('Decodificador diferente do dominio de treino')
        report.update({'version': info['version'], 'modelSha256': info['modelSha256'], 'modelStatus': model['status'],
                       'styleName': info['styleName'], 'runtime': runtime, 'lightroomVersion': request.get('lightroomVersion'),
                       'operation': request['operation'], 'displayTargets': list(DISPLAY_TARGETS)})
        if request.get('modelVariant') == 'candidate':
            report.update({'modelSha256':candidate_sha,'styleName':'Meu estilo - candidato do acervo','usingCandidateModel':True})
        if request['operation'] in ('learning-status','learning-update','feedback'):
            from learning_store import summary,record_feedback,train_candidate
            if request['operation']=='feedback':
                feedback=request.get('feedback',{})
                report['learning']=record_feedback(learning_root,feedback.get('rating'),feedback.get('note',''),feedback.get('analysisJobId',''))
            else:
                if request['operation']=='learning-update':report['candidateTraining']=train_candidate(learning_root,model)
                report['learning']=summary(learning_root)
            report['status']='COMPLETED'
            return report
        executable = bundle / 'Tools' / 'ExifTool' / 'exiftool.exe'
        if not executable.is_file():
            raise ValueError('ExifTool ausente; extraia o pacote completo')
        if request['operation'] == 'diagnostic':
            result = subprocess.run([str(executable), '-config', '', '-ver'], capture_output=True, text=True,
                                    timeout=30, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if result.returncode:
                raise RuntimeError('ExifTool nao iniciou')
            report['runtime']['exiftool'] = result.stdout.strip()
            report['status'] = 'DIAGNOSTIC_OK'
            return report
        photos = request.get('photos')
        if not isinstance(photos, list) or not 1 <= len(photos) <= MAX_PHOTOS:
            raise ValueError('Selecione entre 1 e 100 fotos para este piloto')
        report['requestedPhotos'] = len(photos)
        if collecting:
            report['referenceBatch'] = batch
            report['referenceFile'] = 'references.jsonl'
        seen_hashes = set()
        ids = [row.get('id') for row in photos]
        if not all(isinstance(i, str) and 0 < len(i) <= 128 for i in ids) or len(set(ids)) != len(ids):
            raise ValueError('Identificadores de fotos invalidos')
        for index, photo in enumerate(photos):
            if (job / 'cancel.request').exists():
                report['status'] = 'CANCELLED'
                break
            path_text = photo.get('path', '')
            row = {'id': photo['id'], 'path': path_text, 'filename': Path(path_text).name,
                   'status': 'FAILED', 'current': {k: v for k, v in photo.get('current', {}).items()
                                                  if k in TARGETS and finite_number(v)}}
            report['results'].append(row)
            progress('PROCESSING', index, len(photos), row['filename'])
            if collecting and photo.get('treatment') == 'monochrome':
                row.update({'status': 'SKIPPED', 'skipReason': 'MONOCHROME_NOT_SUPPORTED',
                            'message': 'Foto em preto e branco ignorada nesta coleta em cor'})
                progress('PROCESSING', index + 1, len(photos), row['filename'])
                continue
            try:
                path = Path(path_text)
                if not path.is_absolute() or path.suffix.lower() != '.cr3' or not path.is_file():
                    raise ValueError('RAW CR3 original indisponivel neste caminho')
                if photo.get('treatment') != 'color':
                    raise ValueError('Modelo experimental somente para fotos em cor')
                if collecting and (photo.get('isVirtualCopy') is not False or any(k not in row['current'] for k in TARGETS)):
                    raise ValueError('Referencia requer RAW original e os dez controles atuais disponiveis')
                before = path.stat()
                with source_reader(path):
                    digest = sha256_file(path)
                    meta = metadata_for(path, executable, job / f'metadata-{index:04}.args')
                    if meta.get('Model', '').strip() not in model['supportedCameraModels']:
                        raise ValueError('Camera nao suportada por este modelo: ' + meta.get('Model', 'desconhecida'))
                    capture_time = meta.get('SubSecDateTimeOriginal') or meta.get('DateTimeOriginal')
                    if collecting and (not isinstance(capture_time, str) or not capture_time.strip()):
                        raise ValueError('Referencia sem data/hora de captura EXIF')
                    if collecting and digest in seen_hashes:
                        raise ValueError('RAW duplicado nesta coleta; mantenha somente uma referencia por arquivo')
                    image = job / f'input-{index:04}.jpg'
                    extracted = technical_render(path, image, meta)
                    if sha256_file(path) != digest:
                        raise ValueError('Arquivo original alterado durante a analise')
                    after = path.stat()
                    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
                        raise ValueError('Metadados do arquivo mudaram durante a analise')
                missing = [k for k in model['featureNames'] if k not in extracted['features']]
                if collecting and missing:
                    raise ValueError('Referencia com atributos de entrada incompletos')
                row.update({'status': 'REFERENCE_COLLECTED' if collecting else 'COMPUTED', 'computedUtc': utc_now(),
                            'sourceSha256': digest, 'sourceMetadataStable': True, 'cameraModel': meta['Model'],
                            'inputDomain': extracted['inputDomain'], 'technicalInputRelative': image.name,
                            'technicalInputSha256': extracted['jpegSha256'],
                            'missingFeatures': missing})
                if collecting:
                    row.update({'features': {k: extracted['features'][k] for k in model['featureNames']},
                                'captureTimeExif': capture_time})
                    seen_hashes.add(digest)
                else:
                    row['predictions'] = predict_features(model, extracted['features'])
            except Exception as error:
                row['status'] = 'FAILED'
                row['error'] = str(error)[:1500]
            progress('PROCESSING', index + 1, len(photos), row['filename'])
        else:
            report['status'] = ('COMPLETED_WITH_ERRORS' if any(r['status'] == 'FAILED' for r in report['results']) else
                                'COMPLETED_WITH_SKIPS' if any(r['status'] == 'SKIPPED' for r in report['results']) else 'COMPLETED')
        if collecting:
            export_references(job / 'references.jsonl', report['results'], batch, model, runtime)
            if request.get('learnFromReferences') is True and any(r['status']=='REFERENCE_COLLECTED' for r in report['results']):
                from learning_store import register,summary
                references=[json.loads(line) for line in (job/'references.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
                report['learning']=register(learning_root,references,model,request['catalogIdentity'])
                report['learning'].update(summary(learning_root))
        else:
            csv_report(job / 'results.csv', report['results'])
    except Exception as error:
        report['status'] = 'FAILED'
        report['error'] = str(error)[:2000]
        with (job / 'engine-error.txt').open('x', encoding='utf-8') as stream:
            traceback.print_exc(file=stream)
    finally:
        report['finishedUtc'] = utc_now()
        report['elapsedSeconds'] = round(time.monotonic() - started, 3)
        report['computedPhotos'] = sum(r['status'] == 'COMPUTED' for r in report['results'])
        report['collectedReferences'] = sum(r['status'] == 'REFERENCE_COLLECTED' for r in report['results'])
        report['failedPhotos'] = sum(r['status'] == 'FAILED' for r in report['results'])
        report['skippedPhotos'] = sum(r['status'] == 'SKIPPED' for r in report['results'])
        if report.get('operation') == 'collect' and report['collectedReferences'] and (job / 'references.jsonl').is_file():
            report['referenceBundleFile'] = 'references-package.zip'
        write_json(job / 'results.json', report)
        if report.get('referenceBundleFile'):
            try:
                export_reference_package(job, job / report['referenceBundleFile'])
            except Exception as error:
                del report['referenceBundleFile']
                report['referenceBundleError'] = str(error)[:1500]
                write_json(job / 'results.json', report)
        progress(report['status'], len(report['results']), len(report['results']))
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--job', type=Path, required=True)
    args = parser.parse_args()
    report = run_job(args.job, Path(__file__).resolve().parents[1])
    return 1 if report['status'] == 'FAILED' else 0


if __name__ == '__main__':
    raise SystemExit(main())
