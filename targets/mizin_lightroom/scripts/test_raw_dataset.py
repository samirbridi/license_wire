import datetime as dt
import contextlib
import hashlib
import io
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path

from prepare_raw_dataset import copy_verified, load_references, read_metadata, validate_pair


class RawDatasetTests(unittest.TestCase):
    def reference(self):
        return {"eventRootId":3456,"technicalCandidate":True,"approvalStatus":"REFERENCE_APPROVED_BY_PHOTOGRAPHER",
                "sourcePath":r'D:\Event\CRI_0005.CR3',"physicalFileId":1,"imageId":1,
                "captureTime":"2026-10-02T18:57:55.400","cameraModel":"Canon EOS R6m2","sourceRelative":"CRI_0005.CR3"}

    def metadata(self):
        return {"FileType":"CR3","FileName":"CRI_0005.CR3","Model":"Canon EOS R6m2",
                "SubSecDateTimeOriginal":"2026:10:02 18:57:55.40-03:00","FileSize":100}

    def test_subsecond_wall_clock_matches_without_wrong_utc_conversion(self):
        result = validate_pair(self.reference(), self.metadata())
        self.assertEqual(result['status'], 'METADATA_CONSISTENT')
        self.assertFalse(result['timezoneConverted'])

    def test_same_name_wrong_event_or_camera_is_rejected(self):
        for key, value in [('SubSecDateTimeOriginal','2026:10:03 18:57:55.40-03:00'),('Model','Another camera'),('FileName','Other.CR3')]:
            metadata = self.metadata()
            metadata[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_pair(self.reference(), metadata)

    def test_second_precision_is_explicit(self):
        metadata = self.metadata()
        metadata.pop('SubSecDateTimeOriginal')
        metadata['DateTimeOriginal'] = '2026:10:02 18:57:55'
        self.assertEqual(validate_pair(self.reference(), metadata)['timePrecision'], 'SECOND_WALL_CLOCK_ONLY')

    def test_wrong_root_unapproved_and_duplicate_inputs_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            manifest = Path(temp) / 'records.jsonl'
            record = self.reference()
            manifest.write_text(json.dumps(record)+'\n',encoding='utf-8')
            with self.assertRaises(ValueError):
                load_references(manifest,3456,r'D:\Other')
            record['approvalStatus'] = 'UNKNOWN'
            manifest.write_text(json.dumps(record)+'\n',encoding='utf-8')
            with self.assertRaises(ValueError):
                load_references(manifest,3456,r'D:\Event')
            record = self.reference()
            manifest.write_text((json.dumps(record)+'\n')*2,encoding='utf-8')
            with self.assertRaises(ValueError):
                load_references(manifest,3456,r'D:\Event')

    def test_copy_hash_source_preservation_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source.CR3'
            destination = Path(temp) / 'copy.CR3'
            source.write_bytes(b'SYNTHETIC_DATA_NOT_A_CAMERA_RAW')
            before = source.stat()
            result = copy_verified(source,destination,source.stat().st_size)
            self.assertEqual(result['sha256'],hashlib.sha256(source.read_bytes()).hexdigest())
            self.assertEqual(source.stat().st_mtime_ns,before.st_mtime_ns)
            with self.assertRaises(FileExistsError):
                copy_verified(source,destination,source.stat().st_size)
            destination.chmod(0o666)

    def test_changed_source_size_is_rejected_before_copy(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / 'source.CR3'
            destination = Path(temp) / 'copy.CR3'
            source.write_bytes(b'fixture')
            with self.assertRaises(ValueError):
                copy_verified(source,destination,100)
            self.assertFalse(destination.exists())

    def test_metadata_batches_keep_path_identity_and_readonly_options(self):
        with tempfile.TemporaryDirectory() as temp:
            paths = [Path(temp) / f'frame-{i}.CR3' for i in range(33)]
            calls = []
            def fake_run(command, **kwargs):
                calls.append(command)
                file = Path(command[-1])
                names = file.read_text(encoding='utf-8').splitlines()[1:]
                return mock.Mock(returncode=0,stderr='',stdout=json.dumps([{'SourceFile':s} for s in reversed(names)]))
            with mock.patch('prepare_raw_dataset.subprocess.run',side_effect=fake_run), contextlib.redirect_stdout(io.StringIO()):
                result = read_metadata(paths,Path('perl'),Path('exiftool'),Path(temp)/'args.txt')
            self.assertEqual(len(calls),2)
            self.assertEqual([row['SourceFile'] for row in result],[str(p).replace('\\','/') for p in paths])
            self.assertTrue(all('-fast2' in call and '-config' in call and '' in call for call in calls))


if __name__ == '__main__':
    unittest.main(verbosity=2)
