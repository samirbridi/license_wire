"""Runs the Node contract tests of the site's download password inside the Python suite."""
import shutil
import subprocess
import unittest
from pathlib import Path


class DownloadGateTests(unittest.TestCase):
    def test_site_download_password_contract(self):
        node = shutil.which('node')
        if not node:
            self.skipTest('Node.js indisponivel')
        script = Path(__file__).with_name('test_download_gate.mjs')
        result = subprocess.run([node, '--test', str(script)], capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout[-4000:] + result.stderr[-2000:])
        self.assertIn('fail 0', result.stdout)


if __name__ == '__main__':
    unittest.main()
