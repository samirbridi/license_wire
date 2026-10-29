import hashlib
import json
import sqlite3
import tempfile
import unittest
import zlib
from pathlib import Path

from analyze_catalog import LuaLiteralReader, analyze, decode_settings, is_mobile_proxy, numeric_summary, open_readonly_catalog, parse_settings


class CatalogReaderTests(unittest.TestCase):
    def test_global_and_nested_parameters_are_distinct(self):
        value = 's = { Exposure2012 = 0.3, Look = { Parameters = { Exposure2012 = -4 } }, ToneCurvePV2012 = {0,9,255,247}, ConvertToGrayscale = false }'
        parsed, storage, digest = parse_settings(value)
        self.assertEqual(parsed['Exposure2012'], 0.3)
        self.assertEqual(parsed['Look']['Parameters']['Exposure2012'], -4)
        self.assertEqual(parsed['ToneCurvePV2012'], [0, 9, 255, 247])
        self.assertFalse(parsed['ConvertToGrayscale'])
        self.assertEqual(storage, 'plain_text')
        self.assertEqual(digest, hashlib.sha256(value.encode()).hexdigest())

    def test_compressed_history_roundtrip_and_size_validation(self):
        raw = b's = { Exposure2012 = -0.25 }'
        blob = len(raw).to_bytes(4, 'big') + zlib.compress(raw)
        self.assertEqual(decode_settings(blob), (raw.decode(), 'u32be_length_zlib'))
        with self.assertRaises(ValueError):
            decode_settings((len(raw)+1).to_bytes(4, 'big') + blob[4:])

    def test_untrusted_lua_is_never_executed(self):
        for text in ('s = { x = os.execute("calc") }', 's = {} ; os.execute("calc")', 's = { x = function() end }'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                LuaLiteralReader(text).read()

    def test_depth_and_decompression_limits(self):
        with self.assertRaises(ValueError):
            LuaLiteralReader('s = ' + '{x=' * 70 + '1' + '}' * 70).read()
        with self.assertRaises(ValueError):
            decode_settings((17*1024*1024).to_bytes(4, 'big') + zlib.compress(b's = {}'))

    def test_strings_and_unusual_named_keys(self):
        value = 's = { Name = "Cris \\"style\\"", Group = {["x-default"]="Profiles"}, Tint = -2e1 }'
        self.assertEqual(LuaLiteralReader(value).read()['Tint'], -20)
        self.assertEqual(LuaLiteralReader(value).read()['Group']['x-default'], 'Profiles')

    def test_duplicate_keys_are_rejected(self):
        with self.assertRaises(ValueError):
            LuaLiteralReader('s = { Exposure2012=1, Exposure2012=2 }').read()

    def test_readonly_connection_cannot_write(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'catalog.lrcat'
            connection = sqlite3.connect(path)
            connection.execute('CREATE TABLE example(value INTEGER)')
            connection.commit()
            connection.close()
            before = hashlib.sha256(path.read_bytes()).hexdigest()
            connection = open_readonly_catalog(path)
            with self.assertRaises(sqlite3.OperationalError):
                connection.execute('INSERT INTO example VALUES (1)')
            connection.close()
            self.assertEqual(before, hashlib.sha256(path.read_bytes()).hexdigest())

    def test_proxy_detection_and_missing_values(self):
        self.assertTrue(is_mobile_proxy(r'C:\Photos\Downloaded-Smart-Previews\a.dng'))
        self.assertFalse(is_mobile_proxy(r'D:\Events\RAW\a.dng'))
        self.assertEqual(numeric_summary([None, True, '3']), {'observations': 0})
        self.assertEqual(numeric_summary([-1, 1, 4])['median'], 1)

    def test_dataset_keeps_proxies_virtuals_and_rejects_out_of_eligible_pool(self):
        with tempfile.TemporaryDirectory() as temp:
            snapshot = Path(temp)
            (snapshot / 'original').mkdir()
            catalog = snapshot / 'original' / 'test.lrcat'
            connection = sqlite3.connect(catalog)
            connection.executescript('''
                CREATE TABLE Adobe_images(id_local,id_global,rootFile,masterImage,fileFormat,rating,pick,colorLabels,captureTime);
                CREATE TABLE Adobe_imageDevelopSettings(image,text,hasBigData,hasDevelopAdjustments,processVersion);
                CREATE TABLE AgLibraryFile(id_local,baseName,extension,idx_filename,folder);
                CREATE TABLE AgLibraryFolder(id_local,pathFromRoot,rootFolder);
                CREATE TABLE AgLibraryRootFolder(id_local,absolutePath);
                CREATE TABLE AgHarvestedExifMetadata(image,cameraModelRef);
                CREATE TABLE AgInternedExifCameraModel(id_local,value);
                CREATE TABLE Adobe_libraryImageDevelopHistoryStep(id_local,image,dateCreated,name,text);
                INSERT INTO AgLibraryRootFolder VALUES (1,'D:/Event/'),(2,'C:/downloaded-smart-previews/');
                INSERT INTO AgLibraryFolder VALUES (1,'RAW/',1),(2,'',2);
                INSERT INTO AgLibraryFile VALUES (1,'A','CR3','A.CR3',1),(2,'B','dng','B.dng',2),(4,'D','CR3','D.CR3',1);
                INSERT INTO Adobe_images VALUES
                    (1,'one',1,NULL,'RAW',5,1,'',NULL),
                    (2,'two',2,NULL,'DNG',0,0,'',NULL),
                    (3,'virtual',1,1,'RAW',5,1,'',NULL),
                    (4,'rejected',4,NULL,'RAW',0,-1,'',NULL);
            ''')
            text = 's = { Exposure2012 = 0.25, Look = { Name = "Synthetic profile" } }'
            packed = len(text.encode()).to_bytes(4, 'big') + zlib.compress(text.encode())
            for identifier in range(1, 5):
                connection.execute('INSERT INTO Adobe_imageDevelopSettings VALUES (?,?,0,NULL,"15.4")', (identifier, text))
                connection.execute('INSERT INTO Adobe_libraryImageDevelopHistoryStep VALUES (?,?,1,"Neurapix SmartPreset: FIXTURE",?)', (identifier, identifier, packed))
            connection.commit()
            connection.close()
            digest = hashlib.sha256(catalog.read_bytes()).hexdigest()
            (snapshot / 'snapshot.json').write_text(json.dumps({
                'Status':'VERIFIED','AllCopyHashesVerified':True,'SourceMetadataStable':True,
                'RuntimeFilesAbsentBeforeAndAfter':True,'CatalogName':'test.lrcat',
                'Files':[{'Relative':'test.lrcat','CopySha256':digest}],
            }), encoding='utf-8')
            out, summary = analyze(snapshot)
            self.assertEqual(summary['counts']['technicalCandidates'], 1)
            self.assertEqual(summary['counts']['cacheAdjustmentsFlagNull'], 4)
            self.assertEqual(summary['technicalCandidateDistinctFiles'], 1)
            self.assertFalse(summary['referenceApprovalConfirmedByUser'])
            records = [json.loads(line) for line in (out / 'candidate-settings.jsonl').read_text(encoding='utf-8').splitlines()]
            self.assertEqual(records[0]['currentParameters']['Look']['Name'], 'Synthetic profile')
            self.assertEqual(records[0]['approvalStatus'], 'UNKNOWN_REQUIRES_PHOTOGRAPHER_SELECTION')
            self.assertFalse(records[0]['sourceExistenceVerified'])
            self.assertEqual(records[0]['sourcePath'], r'D:\Event\RAW\A.CR3')
            self.assertTrue(summary['catalogUnchanged'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
