import unittest
from lupa.lua51 import LuaRuntime
from inspect_lua51_package import Chunk


class ChunkReaderTests(unittest.TestCase):
    def fixture(self):
        runtime=LuaRuntime(encoding=None)
        return runtime.eval(b'string.dump(function() local function child() return "nested fixture" end; return child(), 123 end)')

    def test_reads_synthetic_dump_metadata_without_evaluating_the_dump(self):
        chunk=Chunk(self.fixture())
        self.assertEqual(chunk.prototypes,2)
        self.assertIn('nested fixture',chunk.strings)
        self.assertIn(123,chunk.numbers)

    def test_truncated_or_trailing_data_and_wrong_abi_are_rejected(self):
        data=self.fixture();wrong=bytearray(data);wrong[8]=16
        for value in (data[:10],data[:-1],data+b'junk',bytes(wrong)):
            with self.subTest(size=len(value)),self.assertRaises(ValueError):Chunk(value)

    def test_declared_unbounded_source_string_is_rejected_before_reading(self):
        data=bytearray(self.fixture());size=data[8];data[12:12+size]=(2**32).to_bytes(size,'little')
        with self.assertRaisesRegex(ValueError,'string limit'):Chunk(bytes(data))


if __name__=='__main__':unittest.main(verbosity=2)
