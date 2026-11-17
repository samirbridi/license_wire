"""accelerator.py: honest choice among NVIDIA CUDA, DirectML and CPU (ONNX Runtime)."""
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'reconstructed/local-engine'))
import accelerator as acc  # noqa: E402

NVIDIA_OK = {'available': True, 'primaryDevice': 'NVIDIA GeForce RTX 4090', 'vram': '24.0 GB', 'driver': 'CUDA 13.1', 'cudaMajor': 13}


def install(root, name, **extra):
    root.mkdir(parents=True, exist_ok=True)
    (root / 'accel-pack.json').write_text(json.dumps({'schema': 'crispix.accel-pack/1', 'name': name,
                                                      'wheels': {name: 'x'}, **extra}))


class AcceleratorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.plugin = Path(self.temp.name) / 'CRISPIX.lrplugin'
        self.data = Path(self.temp.name) / 'data'
        install(self.plugin / 'Runtime/accel/directml', 'directml')
        install(self.data / 'accel/cuda', 'cuda', requiresCudaDriverMajor=13)
        self.calls = []

    def tearDown(self):
        self.temp.cleanup()

    def prober(self, fail=()):
        def run(name, pack, model):
            self.calls.append(name)
            if name in fail:
                return {'ok': False, 'name': name, 'error': 'ONNX Runtime usou CPUExecutionProvider'}
            return {'ok': True, 'name': name, 'provider': acc.PROVIDERS[name], 'medianMs': 1.0}
        return run

    def decide(self, preference='auto', driver=NVIDIA_OK, fail=()):
        with mock.patch.object(acc, 'nvidia_driver', return_value=driver):
            return acc.decide(self.plugin, preference, self.data, self.prober(fail))

    def test_auto_prefers_cuda_on_a_ready_nvidia_card_and_still_times_every_provider(self):
        decision = self.decide()
        self.assertEqual(decision['chosen'], 'cuda')
        self.assertEqual(self.calls, ['cuda', 'directml', 'cpu'])
        self.assertTrue(all(c['status'] == 'READY' for c in decision['candidates']))

    def test_old_driver_skips_cuda_with_an_actionable_message_and_uses_directml(self):
        decision = self.decide(driver={**NVIDIA_OK, 'driver': 'CUDA 12.8', 'cudaMajor': 12})
        cuda = decision['candidates'][0]
        self.assertEqual((cuda['status'], decision['chosen']), ('DRIVER_TOO_OLD', 'directml'))
        self.assertIn('R580', cuda['detail'])
        self.assertNotIn('cuda', self.calls)

    def test_missing_cuda_component_and_non_nvidia_machine(self):
        (self.data / 'accel/cuda/accel-pack.json').unlink()
        self.assertEqual(self.decide()['candidates'][0]['status'], 'NOT_INSTALLED')
        install(self.data / 'accel/cuda', 'cuda', requiresCudaDriverMajor=13)
        decision = self.decide(driver={'available': False})
        self.assertEqual((decision['candidates'][0]['status'], decision['chosen']), ('NO_NVIDIA_GPU', 'directml'))

    def test_a_provider_that_silently_falls_back_is_reported_failed_not_chosen(self):
        decision = self.decide(fail=('cuda',))
        self.assertEqual((decision['candidates'][0]['status'], decision['chosen']), ('FAILED', 'directml'))
        self.assertIn('CPUExecutionProvider', decision['candidates'][0]['error'])

    def test_manual_preference_goes_first_and_keeps_the_others_as_fallback(self):
        decision = self.decide('cpu')
        self.assertEqual(decision['chosen'], 'cpu')
        self.assertEqual([c['name'] for c in decision['candidates']], ['cpu', 'cuda', 'directml'])
        self.assertEqual(self.decide('directml', fail=('directml',))['chosen'], 'cuda')
        with self.assertRaises(ValueError):
            self.decide('tensorrt')

    def test_nothing_installed_reports_no_provider(self):
        for folder in (self.plugin / 'Runtime/accel/directml', self.data / 'accel/cuda'):
            (folder / 'accel-pack.json').unlink()
        self.calls.clear()
        decision = self.decide()
        self.assertIsNone(decision['chosen'])
        self.assertEqual(self.calls, [])

    def test_decision_is_cached_until_gpu_driver_packs_or_preference_change(self):
        cache = self.data / 'accelerator.json'
        with mock.patch.object(acc, 'nvidia_driver', return_value=NVIDIA_OK):
            acc.status(self.plugin, 'auto', cache, data=self.data, prober=self.prober())
            acc.status(self.plugin, 'auto', cache, data=self.data, prober=self.prober())
            self.assertEqual(len(self.calls), 3)  # second call came from the cache
            acc.status(self.plugin, 'directml', cache, data=self.data, prober=self.prober())
            self.assertEqual(len(self.calls), 6)
        with mock.patch.object(acc, 'nvidia_driver', return_value={**NVIDIA_OK, 'driver': 'CUDA 13.2'}):
            acc.status(self.plugin, 'directml', cache, data=self.data, prober=self.prober())
        self.assertEqual(len(self.calls), 9)
        self.assertEqual(json.loads(cache.read_text())['schema'], 'crispix.accelerator/1')


PACKS = ROOT / 'private/runtime/accel'
RUNTIME = sorted(ROOT.glob('private/deliveries/CRISPIX-*/CRISPIX.lrplugin/Runtime/python.exe'))
MODEL = ROOT / 'private/runtime/culling-base-c75c76d3/PublicModels/YuNet/face_detection_yunet_2023mar.onnx'


@unittest.skipUnless(os.name == 'nt' and (PACKS / 'directml/accel-pack.json').exists() and RUNTIME and MODEL.exists(),
                     'Pacotes de aceleracao reais nao montados nesta maquina')
class RealAcceleratorTests(unittest.TestCase):
    def test_real_directml_and_cpu_probes_with_the_packaged_python(self):
        for name in ('directml', 'cpu'):
            result = acc.run_probe(name, PACKS / 'directml', MODEL, python=str(RUNTIME[-1]))
            self.assertTrue(result['ok'], result)
            self.assertEqual(result['provider'], acc.PROVIDERS[name])


if __name__ == '__main__':
    unittest.main()
