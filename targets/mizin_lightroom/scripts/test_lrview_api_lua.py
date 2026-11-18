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


# LrCatalog methods in the Lightroom Classic SDK. getCollections()/getCollectionSets() are NOT
# here: an old SDK doc listed them by mistake; the real calls are getChildCollections() and
# getChildCollectionSets(). Calling the fake one made "Aprender com colecao" always report
# "Nenhuma colecao encontrada" in Lightroom while the mocked tests passed.
CATALOG_SDK = {
    'addPhoto', 'assertHasPrivateWriteAccess', 'assertHasWriteAccess', 'batchGetFormattedMetadata',
    'batchGetPropertyForPlugin', 'batchGetRawMetadata', 'buildSmartPreviews', 'createCollection',
    'createCollectionSet', 'createKeyword', 'createSmartCollection', 'createVirtualCopies',
    'deleteAllEmptyMasks', 'findPhotoByPath', 'findPhotoByUuid', 'findPhotos', 'findPhotosWithProperty',
    'getActiveSources', 'getAllPhotos', 'getChildCollectionSets', 'getChildCollections',
    'getCollectionByLocalIdentifier', 'getCurrentViewFilter', 'getFolderByPath', 'getFolders', 'getKeywords',
    'getKeywordsByLocalId', 'getLabelMapToColorName', 'getMultipleSelectedOrAllPhotos', 'getPath',
    'getPropertyForPlugin', 'getPublishServices', 'getPublishedCollectionByLocalIdentifier', 'getTargetPhoto',
    'getTargetPhotos', 'setActiveSources', 'setPropertyForPlugin', 'setSelectedPhotos', 'setViewFilter',
    'triggerImportFromPathWithPreviousSettings', 'triggerImportUI', 'type', 'updateAISettings',
    'withPrivateWriteAccessDo', 'withProlongedWriteAccessDo', 'withWriteAccessDo'}
CATALOG_CALL = re.compile(r"\b(?:catalog|cat|activeCatalog\(\s*\))\s*:\s*([A-Za-z_]\w*)\s*[({'\"]")


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

    def test_catalog_methods_exist_in_sdk(self):
        problems, calls = [], 0
        for path in sorted(LUA.glob('*.lua')):
            for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
                code = line.split('--', 1)[0]
                for name in CATALOG_CALL.findall(code):
                    calls += 1
                    if name not in CATALOG_SDK:
                        problems.append(f'{path.name}:{number}: catalog:{name}')
        self.assertGreater(calls, 30)
        self.assertEqual(problems, [])


if __name__ == '__main__':
    unittest.main()
