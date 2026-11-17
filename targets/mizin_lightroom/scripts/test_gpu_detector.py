"""Unit tests for GPU and hardware acceleration detection in CRISPIX."""
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "reconstructed/local-engine"

import sys
sys.path.insert(0, str(ENGINE))
from gpu_detector import (detect_cuda_driver, get_hardware_info,
                          configure_opencv_dnn_backend, opencv_cuda_actually_available)


class _MockNet:
    def __init__(self):
        self.backend = None
        self.target = None
    def setPreferableBackend(self, b):
        self.backend = b
    def setPreferableTarget(self, t):
        self.target = t


class _MockDnnModule:
    """Mirrors the real cv2.dnn module's actual behavior, confirmed 2026-11-16 against
    opencv-python-headless 4.13.0.92: setPreferableBackend(DNN_BACKEND_CUDA) never raises
    even when CUDA support was not compiled in -- it just logs a warning and the net runs
    on CPU anyway. getAvailableTargets() is the only call that honestly reports support.
    """
    DNN_BACKEND_OPENCV = 0
    DNN_TARGET_CPU = 1
    DNN_BACKEND_CUDA = 2
    DNN_TARGET_CUDA = 3

    def __init__(self, cuda_targets):
        self._cuda_targets = cuda_targets

    def getAvailableTargets(self, backend_id):
        if backend_id == self.DNN_BACKEND_CUDA:
            return self._cuda_targets
        return [self.DNN_TARGET_CPU]


class _MockCv:
    def __init__(self, cuda_targets):
        self.dnn = _MockDnnModule(cuda_targets)


class GpuDetectorTests(unittest.TestCase):
    def test_detection_returns_structured_hardware_contract(self):
        info = get_hardware_info()
        self.assertIn("available", info)
        self.assertIn("backend", info)
        self.assertIn("primaryDevice", info)
        self.assertIn("vram", info)
        self.assertIn("recommendedBatchSize", info)
        self.assertIsInstance(info["available"], bool)
        self.assertIsInstance(info["recommendedBatchSize"], int)

    def test_cache_file_generation(self):
        with tempfile.TemporaryDirectory() as temp:
            cache_path = Path(temp) / "gpu_status.json"
            info = get_hardware_info(cache_file=cache_path)
            self.assertTrue(cache_path.is_file())
            loaded = json.loads(cache_path.read_text(encoding="utf-8"))
            self.assertEqual(loaded["primaryDevice"], info["primaryDevice"])
            self.assertEqual(loaded["available"], info["available"])

    def test_opencv_cuda_actually_available_false_on_cpu_only_build(self):
        # Regression: this is the exact shape of the bundled opencv-python-headless
        # wheel (4.13.0.92) -- CUDA backend id exists, but no targets are available.
        cv = _MockCv(cuda_targets=[])
        self.assertFalse(opencv_cuda_actually_available(cv))

    def test_opencv_cuda_actually_available_true_with_real_cuda_build(self):
        cv = _MockCv(cuda_targets=[3])
        self.assertTrue(opencv_cuda_actually_available(cv))

    def test_configure_opencv_falls_back_to_cpu_when_cuda_not_really_supported(self):
        # This is the case that a naive try/except around setPreferableBackend would
        # get wrong: the call succeeds without raising, so the old implementation
        # reported 'cuda' while actually running on the CPU the whole time.
        net = _MockNet()
        cv = _MockCv(cuda_targets=[])
        result = configure_opencv_dnn_backend(cv, net, use_gpu=True)
        self.assertEqual(result, "cpu_fallback")
        self.assertEqual(net.backend, cv.dnn.DNN_BACKEND_OPENCV)
        self.assertEqual(net.target, cv.dnn.DNN_TARGET_CPU)

    def test_configure_opencv_uses_cuda_when_really_supported(self):
        net = _MockNet()
        cv = _MockCv(cuda_targets=[3])
        result = configure_opencv_dnn_backend(cv, net, use_gpu=True)
        self.assertEqual(result, "cuda")
        self.assertEqual(net.backend, cv.dnn.DNN_BACKEND_CUDA)
        self.assertEqual(net.target, cv.dnn.DNN_TARGET_CUDA)

    def test_configure_opencv_respects_use_gpu_false_even_with_real_cuda_support(self):
        net = _MockNet()
        cv = _MockCv(cuda_targets=[3])
        result = configure_opencv_dnn_backend(cv, net, use_gpu=False)
        self.assertEqual(result, "cpu")
        self.assertEqual(net.backend, cv.dnn.DNN_BACKEND_OPENCV)

    def test_against_the_actual_bundled_opencv_wheel(self):
        # Live check against whatever cv2 is installed in this dev environment: must
        # never silently claim CUDA support that is not really compiled in.
        try:
            import cv2
        except ImportError:
            self.skipTest("cv2 not installed in this environment")
        # This assertion documents the known state of the bundled runtime (confirmed
        # 2026-11-16): no CUDA module compiled in. If this ever flips to True because
        # the runtime was rebuilt with real CUDA support, that's good news, not a bug --
        # update this test (and re-enable the "Usar GPU" UI) at that point.
        self.assertFalse(opencv_cuda_actually_available(cv2))


if __name__ == "__main__":
    unittest.main(verbosity=2)
