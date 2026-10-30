import importlib.util
import marshal
import struct
import unittest
from read_pyc_metadata import Reader,inspect


class PycMetadataTests(unittest.TestCase):
    def fixture(self):
        return importlib.util.MAGIC_NUMBER+b'\0'*12+marshal.dumps(compile('import json\ndef transform(image):\n return image.resize((224,224))\n','owned_fixture.py','exec'))

    def test_owned_fixture_names_nested_constants_and_offsets(self):
        result=inspect(self.fixture())
        self.assertEqual(result['parsedBytes'],result['bytes'])
        self.assertFalse(result['vendorExecution'])
        function=result['codeObjects'][1]
        self.assertEqual(function['qualname'],'transform')
        self.assertIn('resize',function['names'])
        self.assertIn([224,224],function['consts'])
        self.assertGreater(function['offset'],16)

    def test_truncation_trailing_and_version_fail_closed(self):
        for data in [self.fixture()[:-1],self.fixture()+b'x',b'????'+self.fixture()[4:]]:
            with self.assertRaises(ValueError): inspect(data)

    def test_slice_v5_data_only(self):
        reader=Reader(importlib.util.MAGIC_NUMBER+b'\0'*12+b':Ni'+struct.pack('<i',5)+b'N')
        self.assertEqual(reader.value(),{'slice':[None,5,None]})

    def test_size_and_reference_budgets(self):
        for data in [b's'+struct.pack('<i',2000000),b'r'+struct.pack('<i',0),b'['+struct.pack('<i',-1)]:
            reader=Reader(importlib.util.MAGIC_NUMBER+b'\0'*12+data)
            with self.assertRaises(ValueError): reader.value()


if __name__=='__main__': unittest.main()
