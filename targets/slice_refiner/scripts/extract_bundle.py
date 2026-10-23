"""Read the verified v1 Wire container into this target's private evidence directory.

Evidence: bundle-factory.c 0x180151340, bundle-directory.c 0x1805e20f0.
Does not modify the original file, the editor, licensing, or its installed runtime.
"""
import hashlib
import json
import pathlib
import struct
from salsa20 import xor

ROOT = pathlib.Path(__file__).resolve().parents[1]
MASTER = bytes.fromhex('11c012c6a85754f2c30054f741e96f326b26908015d6475949ca6e9022807f98')


def extract(path, destination):
    data = path.read_bytes()
    version, count, table_size = struct.unpack_from('>HII', data)
    if version != 1 or not 0 < count <= 4096 or table_size > len(data)-64:
        raise ValueError('Unsupported or corrupt bundle header')
    if data[10] not in (0, 1):
        raise ValueError('Unsupported table flag')
    nonce = data[11:19]
    key = MASTER
    if path.suffix.lower() == '.cwired':
        mix = hashlib.blake2b(b'sourceeffectmixer', digest_size=32).digest()
        key = bytes(a ^ b for a,b in zip(MASTER, mix))
    def read(offset, size):
        raw = data[offset:offset+size]
        if len(raw) != size:
            raise ValueError('Truncated entry')
        return xor(raw, key, nonce, offset) if any(nonce) else raw
    table = read(64, table_size)
    cursor = 0
    payload = (64 + table_size + 63) & ~63
    entries = []
    for _ in range(count):
        length = struct.unpack_from('>H', table, cursor)[0]
        cursor += 2
        name = table[cursor:cursor+length].decode('utf-8')
        cursor += length
        size = struct.unpack_from('>Q', table, cursor)[0]
        cursor += 8
        relative = pathlib.PurePosixPath(name.replace('\\', '/'))
        if relative.is_absolute() or '..' in relative.parts or ':' in name:
            raise ValueError('Unsafe archive path')
        target = destination.joinpath(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        raw = read(payload, size)
        target.write_bytes(raw)
        entries.append({'name': name, 'offset': payload, 'size': size,
                        'sha256': hashlib.sha256(raw).hexdigest()})
        payload = (payload + size + 63) & ~63
    if cursor != len(table):
        raise ValueError('Directory size mismatch')
    return {'container_sha256': hashlib.sha256(data).hexdigest(), 'version': version,
            'entry_count': count, 'table_size': table_size, 'nonce_hex': nonce.hex(),
            'cipher': 'Salsa20/20, absolute file offset',
            'key_derivation': 'master XOR BLAKE2b-256(sourceeffectmixer) for .cwired', 'entries': entries}


if __name__ == '__main__':
    report = extract(ROOT / 'binaries/SLICE REFINER.cwired', ROOT / 'evidence/raw-bundle')
    patch = json.loads((ROOT / 'evidence/raw-bundle/patch.wire').read_text(encoding='utf-8'))
    report['json_keys'] = list(patch)
    (ROOT / 'evidence/extraction.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(report, indent=2))
