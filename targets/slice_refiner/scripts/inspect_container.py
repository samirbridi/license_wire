"""Read-only format triage. No changes to the supplied plugin or runtime."""
import hashlib
import json
import math
import pathlib
import re
import struct
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[1]


def pe_exports(path):
    data = path.read_bytes()
    pe = struct.unpack_from('<I', data, 0x3c)[0]
    count = struct.unpack_from('<H', data, pe + 6)[0]
    opt_size = struct.unpack_from('<H', data, pe + 20)[0]
    opt = pe + 24
    image_base = struct.unpack_from('<Q', data, opt + 24)[0]
    export_rva = struct.unpack_from('<I', data, opt + 112)[0]
    sections = []
    for i in range(count):
        p = opt + opt_size + i * 40
        virtual_size, rva, raw_size, offset = struct.unpack_from('<IIII', data, p + 8)
        sections.append((rva, max(virtual_size, raw_size), offset))
    def off(rva):
        return next(o + rva - v for v, n, o in sections if v <= rva < v + n)
    export = off(export_rva)
    nfunc, nnames, funcs, names, ords = struct.unpack_from('<IIIII', data, export + 20)
    result = []
    for i in range(nnames):
        p = off(struct.unpack_from('<I', data, off(names) + i * 4)[0])
        name = data[p:data.index(b'\0', p)].decode('ascii', errors='replace')
        if re.search('bundle|decrypt|unpack|crypt|sha512|stream', name, re.I):
            ordinal = struct.unpack_from('<H', data, off(ords) + i * 2)[0]
            rva = struct.unpack_from('<I', data, off(funcs) + ordinal * 4)[0]
            result.append({'name': name, 'rva': hex(rva), 'va': hex(image_base + rva), 'file_offset': hex(off(rva))})
    master = bytes.fromhex('11c012c6a85754f2c30054f741e96f326b26908015d6475949ca6e9022807f98')
    return {'sha256': hashlib.sha256(data).hexdigest(), 'image_base': hex(image_base),
            'master_constant_file_offset': data.find(master), 'exports': result}


def main():
    path = ROOT / 'binaries/SLICE REFINER.cwired'
    data = path.read_bytes()
    freq = Counter(data[128:])
    entropy = -sum(n / len(data[128:]) * math.log2(n / len(data[128:])) for n in freq.values())
    report = {'file': path.name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
              'first_128_bytes': data[:128].hex(), 'payload_entropy_bits_per_byte': entropy,
              'signatures': {name: data.find(sig) for name, sig in [('zip', b'PK\x03\x04'), ('json_patch', b'"patch"'), ('gzip', b'\x1f\x8b')]},
              'ascii_strings': [{'offset': m.start(), 'text': m.group().decode('ascii')} for m in re.finditer(rb'[\x20-\x7e]{8,}', data)]}
    (ROOT / 'evidence/container-triage.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    runtime = pe_exports(pathlib.Path(r'C:\Program Files\Resolume Wire\WireLib.dll'))
    (ROOT / 'evidence/runtime-bundle-exports.json').write_text(json.dumps(runtime, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'container': {k: v for k, v in report.items() if k != 'ascii_strings'}, 'runtime': runtime}, indent=2))


if __name__ == '__main__':
    main()
