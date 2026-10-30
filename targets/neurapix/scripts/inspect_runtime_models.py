"""Read only archive structure / pickle opcode declarations, never deserialize tensors."""
from __future__ import annotations
import argparse
import hashlib
import json
import pickletools
import zipfile
from pathlib import Path


def inspect(path):
    with path.open('rb') as stream:
        header = stream.read(64)
    row = {'bytes': path.stat().st_size, 'headerHex': header.hex(), 'zip': zipfile.is_zipfile(path)}
    if row['zip']:
        with zipfile.ZipFile(path) as archive:
            members = archive.infolist()
            if len(members) > 50000:
                raise ValueError('Archive inventory exceeds budget')
            row['members'] = [{'name': m.filename, 'bytes': m.file_size, 'compressedBytes': m.compress_size} for m in members]
            row['pickleDeclarations'] = []
            for member in members:
                if member.filename.endswith('.pkl') and member.file_size <= 4 * 1024 * 1024:
                    data = archive.read(member)
                    declarations = []
                    counts = {}
                    for i, (op, arg, offset) in enumerate(pickletools.genops(data)):
                        if i > 200000:
                            raise ValueError('Pickle opcode limit')
                        counts[op.name] = counts.get(op.name, 0) + 1
                        if op.name in ('GLOBAL', 'STACK_GLOBAL'):
                            declarations.append({'offset': offset, 'opcode': op.name, 'argument': arg})
                    row['pickleDeclarations'].append({'member': member.filename, 'sha256': hashlib.sha256(data).hexdigest(),
                                                       'globals': declarations, 'opcodes': counts})
    return row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('runtime', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    paths = list((args.runtime / 'nets').rglob('*'))
    paths += list((args.runtime / 'culling' / '_internal' / 'neurapix').rglob('*.onnx*'))
    rows = []
    for path in paths:
        if path.is_file():
            rows.append({'relative': path.relative_to(args.runtime).as_posix(), **inspect(path)})
    args.output.write_text(json.dumps({'schema': 'neurapix.model-containers/1', 'vendorExecution': False,
                                     'weightDeserialization': False, 'files': rows}, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'modelsAndMetadata': len(rows), 'summary': [{k:v for k,v in row.items() if k!='members'} for row in rows]}))


if __name__ == '__main__':
    main()
