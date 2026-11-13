"""Unit tests for skin_tone_sample()/_skin_pixel_mask() (raw_features.py).

Synthetic images only; never requires a real photo. Covers: no face found, face box
with too few classifiable skin pixels, a confident detection with a plausible skin
patch, and that absence is returned as None (never a fabricated neutral value).
"""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from raw_features import _skin_pixel_mask, skin_tone_sample, technical_render


class FixedDetector:
    """Returns exactly one fixed face box with a given confidence, or none."""
    def __init__(self, box=None, confidence=.9):
        self.box = box
        self.confidence = confidence
        self.last_input_size = None

    def setInputSize(self, size):
        self.last_input_size = size

    def detect(self, image):
        if self.box is None:
            return 0, None
        x, y, w, h = self.box
        return 1, np.array([[x, y, w, h, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, self.confidence]], dtype=np.float32)


def solid_image(height, width, rgb):
    image = np.zeros((height, width, 3), dtype=np.uint8)
    image[:, :] = rgb
    return image


class SkinPixelMaskTests(unittest.TestCase):
    def test_plausible_skin_tone_is_classified(self):
        # A typical mid-tone skin RGB satisfying every clause of the Peer et al. rule.
        patch = solid_image(10, 10, (200, 150, 120))
        mask = _skin_pixel_mask(patch)
        self.assertTrue(mask.all())

    def test_blue_sky_and_gray_wall_are_not_skin(self):
        for rgb in ((135, 206, 235), (128, 128, 128), (20, 20, 20)):
            with self.subTest(rgb=rgb):
                mask = _skin_pixel_mask(solid_image(10, 10, rgb))
                self.assertFalse(mask.any())


class SkinToneSampleTests(unittest.TestCase):
    def test_no_face_found_returns_none(self):
        display = solid_image(200, 200, (200, 150, 120))
        self.assertIsNone(skin_tone_sample(display, FixedDetector(box=None)))

    def test_degenerate_or_offscreen_box_returns_none(self):
        display = solid_image(200, 200, (200, 150, 120))
        for box in ((0, 0, 0, 0), (-50, -50, 10, 10), (199, 199, 5, 5)):
            with self.subTest(box=box):
                self.assertIsNone(skin_tone_sample(display, FixedDetector(box=box)))

    def test_face_box_without_enough_skin_pixels_returns_none(self):
        # The whole frame is clearly non-skin (uniform gray); the detector still reports
        # a face box there, but no pixel inside it should classify as skin.
        display = solid_image(200, 200, (128, 128, 128))
        result = skin_tone_sample(display, FixedDetector(box=(40, 40, 80, 80)))
        self.assertIsNone(result)

    def test_confident_detection_with_skin_patch_returns_sampled_tone(self):
        display = solid_image(200, 200, (30, 30, 30))
        # A face box whose inner-central crop (the only region sampled) is uniform skin.
        display[60:140, 60:140] = (190, 140, 110)
        result = skin_tone_sample(display, FixedDetector(box=(50, 50, 100, 100), confidence=.88))
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result['faceConfidence'], .88, places=5)
        self.assertGreater(result['skinSampledPixels'], 25)
        for key in ('skinR', 'skinG', 'skinB', 'skinRedBlueRatio', 'skinRedGreenRatio'):
            self.assertIn(key, result)
            self.assertTrue(np.isfinite(result[key]))
        # Red channel is the strongest in the synthetic patch; ratios must reflect that.
        self.assertGreater(result['skinRedBlueRatio'], 1)
        self.assertGreater(result['skinRedGreenRatio'], 1)

    def test_picks_the_most_confident_face_when_several_are_found(self):
        class MultiDetector:
            def setInputSize(self, size): pass
            def detect(self, image):
                boxes = np.array([
                    [10, 10, 30, 30, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .4],
                    [120, 120, 60, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, .95],
                ], dtype=np.float32)
                return 2, boxes
        display = solid_image(220, 220, (20, 20, 20))
        display[135:185, 135:185] = (195, 145, 115)
        result = skin_tone_sample(display, MultiDetector())
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result['faceConfidence'], .95, places=5)


class FakeRaw:
    """Minimal rawpy.RawPy stand-in: real CR3 decoding needs a camera-produced file
    (LibRaw has no "build a synthetic RAW" path), so only rawpy.imread is mocked here;
    every line of technical_render's own feature composition still runs for real.
    """
    def __init__(self, rgb):
        self._rgb = rgb

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    @property
    def camera_whitebalance(self):
        return [2.1, 1.0, 1.4, 1.0]

    @property
    def sizes(self):
        from types import SimpleNamespace
        return SimpleNamespace(raw_width=self._rgb.shape[1], raw_height=self._rgb.shape[0])

    def postprocess(self, **kwargs):
        return self._rgb


class TechnicalRenderIntegrationTests(unittest.TestCase):
    def _render(self, rgb, face_detector):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'input.jpg'
            with patch('rawpy.imread', return_value=FakeRaw(rgb)):
                return technical_render(Path(temp) / 'fixture.CR3', output, {'ISO': 200}, face_detector)

    def test_without_a_detector_behaves_exactly_as_before_no_skin_keys(self):
        rgb = np.full((400, 400, 3), (90, 70, 60), dtype=np.uint8)
        extracted = self._render(rgb, face_detector=None)
        self.assertNotIn('skinR', extracted['features'])
        self.assertIn('redMean', extracted['features'])
        self.assertEqual(extracted['inputDomain'], 'LIBRAW_CAMERA_WB_SRGB_HALF_SIZE_NO_AUTO_BRIGHT_V1')

    def test_detector_with_no_face_adds_no_skin_keys_either(self):
        rgb = np.full((400, 400, 3), (90, 70, 60), dtype=np.uint8)
        extracted = self._render(rgb, face_detector=FixedDetector(box=None))
        self.assertNotIn('skinR', extracted['features'])

    def test_detector_with_a_face_adds_skin_features_alongside_the_existing_ones(self):
        rgb = np.full((400, 400, 3), (30, 30, 30), dtype=np.uint8)
        rgb[120:280, 120:280] = (190, 140, 110)
        extracted = self._render(rgb, face_detector=FixedDetector(box=(100, 100, 200, 200), confidence=.91))
        features = extracted['features']
        self.assertIn('redMean', features)  # pre-existing whole-frame statistics untouched
        for key in ('skinR', 'skinG', 'skinB', 'skinRedBlueRatio', 'skinRedGreenRatio',
                    'faceConfidence', 'skinSampledPixels'):
            self.assertIn(key, features)
        self.assertGreater(features['skinRedBlueRatio'], 1)


if __name__ == '__main__':
    unittest.main()
