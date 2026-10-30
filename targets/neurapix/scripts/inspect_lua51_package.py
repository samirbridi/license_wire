"""Bounded Lua 5.1 chunk metadata reader. Never executes vendor bytecode."""
from pathlib import Path
import argparse
import collections
import hashlib
import json
import struct
from urllib.parse import urlsplit


class Chunk:
    def __init__(self, data):
        if not 12 <= len(data) <= 8 * 1024 * 1024 or data[:6] != b'\x1bLua\x51\x00':
            raise ValueError('Expected bounded standard Lua 5.1 chunk')
        self.data, self.pos = data, 12
        endian, self.int_size, self.size_t, self.instruction_size, self.number_size, integral = data[6:12]
        if endian not in (0, 1) or self.int_size != 4 or self.size_t not in (4, 8) or self.instruction_size != 4 or self.number_size != 8 or integral != 0:
            raise ValueError('Unsupported Lua ABI')
        self.endian = '<' if endian else '>'
        self.strings, self.numbers, self.prototypes = [], [], 0
        self.prototype(0)
        if self.pos != len(data):
            raise ValueError('Trailing chunk bytes')

    def take(self, size):
        if size < 0 or self.pos + size > len(self.data):
            raise ValueError('Truncated Lua chunk')
        result = self.data[self.pos:self.pos+size]
        self.pos += size
        return result

    def integer(self, size=4):
        return int.from_bytes(self.take(size), 'little' if self.endian == '<' else 'big')

    def count(self):
        value = self.integer()
        if value > 500000:
            raise ValueError('Lua count limit')
        return value

    def string(self):
        size = self.integer(self.size_t)
        if size > 1024 * 1024:
            raise ValueError('Lua string limit')
        value = self.take(size)
        if size and value[-1] != 0:
            raise ValueError('Nonterminated Lua string')
        return value[:-1].decode('utf-8', errors='replace') if size else ''

    def prototype(self, depth):
        if depth > 64 or self.prototypes > 100000:
            raise ValueError('Lua prototype limit')
        self.prototypes += 1
        self.string()  # source/debug names are not published
        self.take(8 + 4)  # line boundaries and function flags
        self.take(self.count() * self.instruction_size)
        for _ in range(self.count()):
            kind = self.integer(1)
            if kind == 0:
                pass
            elif kind == 1:
                self.take(1)
            elif kind == 3:
                self.numbers.append(struct.unpack(self.endian+'d', self.take(8))[0])
            elif kind == 4:
                self.strings.append(self.string())
            else:
                raise ValueError('Unsupported Lua constant tag')
        for _ in range(self.count()):
            self.prototype(depth+1)
        self.take(self.count() * 4)
        for _ in range(self.count()):
            self.string()
            self.take(8)
        for _ in range(self.count()):
            self.string()


def inspect(package):
    package = Path(package)
    rows, chunks, hosts = [], {}, collections.Counter()
    for path in sorted(package.rglob('*')):
        if not path.is_file():
            continue
        data = path.read_bytes()
        relative = path.relative_to(package).as_posix()
        rows.append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        if path.suffix.lower() != '.lua':
            continue
        chunk = Chunk(data)
        chunks[relative] = {'prototypeCount': chunk.prototypes, 'stringConstantCount': len(chunk.strings)}
        for value in chunk.strings:
            if value.startswith(('https://', 'http://')):
                try:
                    host = urlsplit(value).hostname
                    if host:
                        hosts[host] += 1
                except ValueError:
                    pass
        if relative in ('Info.lua', 'BuildSettings.lua'):
            chunks[relative]['metadataConstants'] = chunk.strings
            chunks[relative]['numericConstants'] = chunk.numbers
    return {'schema':'neurapix.static-package-metadata/1', 'method':'BOUNDED_NONEXECUTING_LUA51_CHUNK_READER',
            'vendorCodeExecuted':False, 'vendorLogContentsInterpreted':False, 'networkRequestsMade':False,
            'files':rows, 'fileCount':len(rows), 'bytes':sum(row['bytes'] for row in rows),
            'compiledLuaFiles':len(chunks), 'luaChunks':chunks, 'urlHostConstantCounts':dict(hosts),
            'weightFilesWithCommonExtensions':[row['path'] for row in rows if Path(row['path']).suffix.lower() in ('.onnx','.pt','.pth','.safetensors','.tflite')]}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    report = inspect(args.package)
    with args.output.open('x', encoding='utf-8') as stream:
        json.dump(report, stream, indent=2)
    print(json.dumps({key:report[key] for key in ('fileCount','bytes','compiledLuaFiles','weightFilesWithCommonExtensions','urlHostConstantCounts')}))
