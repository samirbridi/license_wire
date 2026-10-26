"""Synthetic format fixtures, not camera footage or device results."""
import importlib.util
import struct
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("ram_reader", Path(__file__).with_name("unpack-metro-ram.py"))
reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reader)


class RamReaderTests(unittest.TestCase):
    def fixture(self):
        startup = b"__r(2);\0"
        module = b"__d(function(){});\0"
        table = struct.pack("<6I", 0, 0, 0, 0, len(startup), len(module))
        return struct.pack("<3I", 0xFB0BD1E5, 3, len(startup)) + table + startup + module

    def test_sparse_module_and_exact_span(self):
        slots, startup, modules = reader.inspect(self.fixture())
        self.assertEqual((slots, startup, len(modules)), (3, b"__r(2);\0", 1))
        self.assertEqual(modules[0]["id"], 2)
        self.assertEqual(modules[0]["source"], b"__d(function(){});")

    def test_malformed_tables_and_truncated_modules_are_rejected(self):
        for data in (b"", b"invalid header", self.fixture()[:-1]):
            with self.assertRaises(ValueError):
                reader.inspect(data)
        malformed = bytearray(self.fixture())
        struct.pack_into("<I", malformed, 12 + 2 * 8, 0xFFFFFFFF)
        with self.assertRaises(ValueError):
            reader.inspect(malformed)


if __name__ == "__main__":
    unittest.main()
