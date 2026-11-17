"""Every LrView call in the plugin must exist in the Lightroom Classic SDK.

Regression: CheckUpdates.lua and LearningInit.lua called View:defaultFactory(), which does not
exist ("attempt to call method 'defaultFactory' (a nil value)" in Lightroom). The Lua unit tests
passed because their mock LrView invented the same function, so this check reads the sources.
"""
from pathlib import Path
import re
import unittest

LUA = Path(__file__).resolve().parents[1] / 'reconstructed/lightroom-pilot'
# LrView namespace functions documented in the Lightroom Classic SDK.
SDK = {'osFactory', 'bind', 'share', 'booleanToNumber', 'negativeOfKey', 'addBinding'}
ALIAS = re.compile(r"(?:local\s+)?([A-Za-z_]\w*)\s*=\s*import\s*\(?\s*['\"]LrView['\"]")
INLINE = re.compile(r"\(\s*import\s*\(?\s*['\"]LrView['\"]\s*\)?\s*\)\s*([.:])\s*([A-Za-z_]\w*)")


class LrViewApiTests(unittest.TestCase):
    def test_only_sdk_functions_called_with_dot(self):
        problems, calls = [], 0
        for path in sorted(LUA.glob('*.lua')):
            text = path.read_text(encoding='utf-8')
            uses = [(sep, name) for sep, name in INLINE.findall(text)]
            for alias in set(ALIAS.findall(text)):
                uses += re.findall(r'\b' + re.escape(alias) + r'\s*([.:])\s*([A-Za-z_]\w*)', text)
            for sep, name in uses:
                calls += 1
                if sep == ':' or name not in SDK:
                    problems.append(f'{path.name}: LrView{sep}{name}')
        self.assertGreater(calls, 20)
        self.assertEqual(problems, [])


if __name__ == '__main__':
    unittest.main()
