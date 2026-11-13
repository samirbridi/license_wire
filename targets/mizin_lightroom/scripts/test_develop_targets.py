import unittest
from develop_targets import EXTENDED_BOUNDS, extended_labels


class ExtendedLabelsTests(unittest.TestCase):
    def test_all_hsl_channels_and_global_controls(self):
        self.assertEqual(len(EXTENDED_BOUNDS), 31)
        values = {key: 12 for key in EXTENDED_BOUNDS}
        self.assertEqual(extended_labels(values), values)

    def test_missing_is_not_neutral(self):
        self.assertEqual(extended_labels({}), {})
        self.assertEqual(extended_labels({'Texture': 0}), {'Texture': 0})

    def test_reject_invalid(self):
        for value in (True, None, '20', float('nan'), float('inf'), -101, 101):
            with self.subTest(value=value), self.assertRaises(ValueError):
                extended_labels({'Texture': value})

    def test_preserve_unrelated_controls(self):
        original = {'MaskGroupBasedCorrections': [{'id': 'existing'}],
                    'CropTop': 0.1, 'CameraProfile': 'Adobe Color', 'Texture': 15}
        self.assertEqual(extended_labels(original), {'Texture': 15})
        self.assertEqual(original['MaskGroupBasedCorrections'], [{'id': 'existing'}])

    def test_angles_and_point_curves_not_scalar_labels(self):
        self.assertEqual(extended_labels({'ColorGradeGlobalHue': 359,
                                         'ToneCurvePV2012': [0, 0, 255, 255]}), {})


if __name__ == '__main__':
    unittest.main()
