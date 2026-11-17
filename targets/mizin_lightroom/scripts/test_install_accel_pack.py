"""Install-AccelPack.py: optional NVIDIA CUDA component, split download, hashes, atomic swap."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock
import zipfile

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('install_accel', SCRIPTS / 'Install-AccelPack.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def fixture(root, version='1.32.0', marker='new'):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w') as z:
        z.writestr('cuda/accel-pack.json', json.dumps({'schema': 'crispix.accel-pack/1', 'name': 'cuda',
                                                       'onnxruntime': version, 'wheels': {}}))
        z.writestr('cuda/nvidia/cu13/bin/x86_64/cudart64_13.dll', marker * 1000)
    data = buffer.getvalue()
    half = len(data) // 2
    blobs = {'https://r2.test/accel/p.zip.001': data[:half], 'https://r2.test/accel/p.zip.002': data[half:]}
    manifest = {'schema': 'crispix.accel-component/1', 'name': 'cuda', 'onnxruntime': version,
                'requiresCudaDriverMajor': 13, 'archiveName': 'p.zip', 'bytes': len(data),
                'archiveSha256': hashlib.sha256(data).hexdigest(),
                'parts': [{'name': u.rsplit('/', 1)[1], 'url': u, 'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
                          for u, b in blobs.items()]}
    path = root / 'accel-cuda.json'
    path.write_text(json.dumps(manifest), encoding='utf-8')
    return path, blobs


def fake_urlopen(blobs):
    def open_url(request, timeout=None):
        return io.BytesIO(blobs[request.full_url])
    return open_url


class InstallAccelPackTests(unittest.TestCase):
    def test_downloads_parts_checks_hashes_and_installs(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest, blobs = fixture(root)
            progress = root / 'progress.json'
            with mock.patch.object(installer.urllib.request, 'urlopen', side_effect=fake_urlopen(blobs)):
                installer.install(str(manifest), root / 'data', progress)
            pack = root / 'data/accel/cuda'
            self.assertEqual(json.loads((pack / 'accel-pack.json').read_text())['onnxruntime'], '1.32.0')
            self.assertTrue((pack / 'nvidia/cu13/bin/x86_64/cudart64_13.dll').is_file())
            self.assertEqual(json.loads(progress.read_text(encoding='utf-8'))['stage'], 'done')
            self.assertEqual([p.name for p in (root / 'data/accel').iterdir()], ['cuda'])  # no staging left

    def test_corrupted_part_installs_nothing_and_keeps_the_previous_pack(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old = root / 'data/accel/cuda'
            old.mkdir(parents=True)
            (old / 'accel-pack.json').write_text('{"previous": true}')
            manifest, blobs = fixture(root)
            first = next(iter(blobs))
            blobs[first] = b'X' + blobs[first][1:]
            with mock.patch.object(installer.urllib.request, 'urlopen', side_effect=fake_urlopen(blobs)):
                with self.assertRaisesRegex(ValueError, 'corrompida'):
                    installer.install(str(manifest), root / 'data', root / 'progress.json')
            self.assertEqual(json.loads((old / 'accel-pack.json').read_text()), {'previous': True})
            self.assertEqual([p.name for p in (root / 'data/accel').iterdir()], ['cuda'])

    def test_reinstall_replaces_previous_pack_atomically(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old = root / 'data/accel/cuda'
            old.mkdir(parents=True)
            (old / 'stale.dll').write_text('old')
            manifest, blobs = fixture(root)
            with mock.patch.object(installer.urllib.request, 'urlopen', side_effect=fake_urlopen(blobs)):
                installer.install(str(manifest), root / 'data', root / 'progress.json')
            self.assertFalse((old / 'stale.dll').exists())
            self.assertTrue((old / 'accel-pack.json').exists())

    def test_manifest_without_https_parts_is_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            manifest, _ = fixture(root)
            data = json.loads(manifest.read_text())
            data['parts'][0]['url'] = 'http://insecure/p.zip.001'
            manifest.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'partes'):
                installer.install(str(manifest), root / 'data', root / 'progress.json')


if __name__ == '__main__':
    unittest.main()
