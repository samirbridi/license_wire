import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from test_local_engine import engine
import test_reference_collection as collection_fixtures
from test_reference_import import reference, model_fixture
from import_approved_references import import_sources


class ReferencePackageTests(unittest.TestCase):
    def make_native_job(self, folder):
        job = folder / 'native'; job.mkdir()
        row = reference()
        (job / 'references.jsonl').write_text(json.dumps(row)+'\n')
        (job / 'request.json').write_text(json.dumps({'operation':'collect','jobId':row['jobId']}))
        (job / 'results.json').write_text(json.dumps({'operation':'collect','jobId':row['jobId'],
             'version':row['collectorVersion'],'status':'COMPLETED','collectedReferences':1}))
        (job / 'input-0000.jpg').write_bytes(b'PRIVATE PIXELS MUST NOT BE INCLUDED')
        return job

    def test_zip_contains_only_data_with_matching_hashes_and_imports_without_extracting(self):
        with tempfile.TemporaryDirectory() as directory:
            folder=Path(directory); job=self.make_native_job(folder); path=folder/'refs.zip'
            report=engine.export_reference_package(job,path)
            with zipfile.ZipFile(path) as archive:
                self.assertEqual(set(archive.namelist()),{'references.jsonl','request.json','results.json','manifest.json'})
                manifest=json.loads(archive.read('manifest.json'))
                for name,item in manifest['files'].items():
                    self.assertEqual(item['sha256'],hashlib.sha256(archive.read(name)).hexdigest())
            self.assertFalse(report['containsPixels'])
            model=folder/'model.json'; model.write_text(json.dumps(model_fixture()))
            imported=import_sources([path],model,folder/'output')
            self.assertEqual(imported['uniqueReferences'],1)
            saved=Path(imported['privateDirectory'])/imported['sources'][0]['preservedRelative']
            self.assertEqual(saved.read_bytes(),path.read_bytes())
            self.assertFalse((folder/'references.jsonl').exists())
            with self.assertRaises(FileExistsError):engine.export_reference_package(job,path)

    def test_tampered_package_or_extra_member_is_rejected_before_dataset_creation(self):
        for changed in ('hash','extra','identity','count'):
            with self.subTest(changed=changed), tempfile.TemporaryDirectory() as directory:
                folder=Path(directory);job=self.make_native_job(folder);path=folder/'refs.zip'
                engine.export_reference_package(job,path)
                with zipfile.ZipFile(path) as archive:payloads={name:archive.read(name) for name in archive.namelist()}
                manifest=json.loads(payloads['manifest.json'])
                if changed=='hash':payloads['references.jsonl']+=b'\n'
                elif changed=='extra':payloads['../unwanted.txt']=b'not allowed'
                elif changed=='identity':manifest['jobId']='other'
                else:manifest['referenceCount']=20
                payloads['manifest.json']=json.dumps(manifest).encode()
                bad=folder/'bad.zip'
                with zipfile.ZipFile(bad,'w') as archive:
                    for name,data in payloads.items():archive.writestr(name,data)
                model=folder/'model.json';model.write_text(json.dumps(model_fixture()))
                with self.assertRaises(ValueError):import_sources([bad],model,folder/'output')
                self.assertFalse((folder/'output').exists())

    def test_monochrome_is_skipped_without_reading_raw_and_no_empty_package_is_generated(self):
        with tempfile.TemporaryDirectory() as directory:
            fixtures=collection_fixtures.ReferenceCollectionTests();bundle,job,raw,request=fixtures.prepare(Path(directory))
            request['photos'][0]['treatment']='monochrome'
            (job/'request.json').write_text(json.dumps(request))
            with patch.object(engine,'source_reader',side_effect=AssertionError('P&B must not be read')):
                report=fixtures.run_collection(bundle,job)
            self.assertEqual((report['collectedReferences'],report['skippedPhotos'],report['failedPhotos']),(0,1,0))
            self.assertEqual(report['status'],'COMPLETED_WITH_SKIPS')
            self.assertEqual(report['results'][0]['skipReason'],'MONOCHROME_NOT_SUPPORTED')
            self.assertFalse((job/'references-package.zip').exists())

    def test_package_failure_keeps_approved_jsonl_and_reports_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            fixtures=collection_fixtures.ReferenceCollectionTests();bundle,job,raw,request=fixtures.prepare(Path(directory))
            with patch.object(engine,'export_reference_package',side_effect=OSError('Archive disk failure fixture')):
                report=fixtures.run_collection(bundle,job)
            self.assertEqual((report['status'],report['collectedReferences']),('COMPLETED',1))
            self.assertNotIn('referenceBundleFile',report)
            self.assertIn('Archive disk failure',report['referenceBundleError'])
            self.assertEqual(len((job/'references.jsonl').read_text().splitlines()),1)


if __name__=='__main__':unittest.main(verbosity=2)
