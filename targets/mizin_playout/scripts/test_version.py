"""Meaningful policy cases for commit-driven version arithmetic."""
import unittest
from version import increment


class Policy(unittest.TestCase):
    def test_break_resets_minor_and_patch(self):
        self.assertEqual(increment('v1.4.7 (build 0099)', 'break'), 'v2.0.0 (build 0100)')

    def test_feature_resets_patch(self):
        self.assertEqual(increment('v1.4.7 (build 0099)', 'feat'), 'v1.5.0 (build 0100)')

    def test_fix_and_improvement_are_patch(self):
        for kind in ['fix', 'improve', 'perf', 'refactor']:
            self.assertEqual(increment('v1.4.7 (build 0099)', kind), 'v1.4.8 (build 0100)')

    def test_rejects_nonstandard_version(self):
        with self.assertRaises(ValueError):
            increment('1.4', 'fix')


if __name__ == '__main__':
    unittest.main()
