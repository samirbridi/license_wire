"""Preserve a supplied runtime as private, non-executed, verified evidence."""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import hashlib
import json
import os
import shutil
import uuid
from pathlib import Path


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def inventory(root):
    files = []
    for base, directories, names in os.walk(root, followlinks=False):
        for name in directories + names:
            candidate = Path(base) / name
            stat = candidate.lstat()
            if candidate.is_symlink() or getattr(stat, 'st_file_attributes', 0) & 0x400:
                raise ValueError('Reparse point refused: ' + str(candidate))
        files.extend(Path(base) / name for name in names)
        if len(files) > 30000:
            raise ValueError('Too many input files')
    if sum(p.stat().st_size for p in files) > 16 * 1024**3:
        raise ValueError('Input exceeds size budget')
    return sorted(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    source = args.source.resolve(strict=True)
    if not source.is_dir() or source.is_symlink():
        raise ValueError('Expected an ordinary directory')
    files = inventory(source)
    target = Path(__file__).resolve().parents[1]
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    destination = target / 'private' / 'runtime' / stamp
    payload = destination / 'npx'
    payload.mkdir(parents=True, exist_ok=False)
    rows = []
    extensions = collections.Counter()
    total = 0
    for i, path in enumerate(files, 1):
        before = path.stat()
        rel = path.relative_to(source)
        copy = payload / rel
        copy.parent.mkdir(parents=True, exist_ok=True)
        source_hash = digest(path)
        shutil.copyfile(path, copy)
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise ValueError('Source changed during copy: ' + str(rel))
        if source_hash != digest(copy):
            raise ValueError('Copy digest mismatch: ' + str(rel))
        rows.append({'relative': rel.as_posix(), 'bytes': before.st_size, 'sha256': source_hash,
                     'sourceMtimeNs': before.st_mtime_ns})
        total += before.st_size
        extensions[path.suffix.lower() or '(no extension)'] += 1
        if i % 2000 == 0:
            print(json.dumps({'progressFiles': i, 'totalFiles': len(files), 'bytesVerified': total}), flush=True)
    if [str(p.relative_to(source)) for p in inventory(source)] != [r['relative'].replace('/', os.sep) for r in rows]:
        raise ValueError('Source file list changed')
    manifest = {'schema': 'neurapix.preserved-runtime/1', 'source': str(source), 'destination': str(payload),
                'sourceStable': True, 'allCopyHashesEqual': True, 'vendorExecution': False, 'files': rows}
    manifest_path = destination / 'manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    (destination / 'SHA256SUMS.txt').write_text(''.join(f"{r['sha256']}  npx/{r['relative']}\n" for r in rows), encoding='utf-8')
    pointer = {'directory': str(destination), 'payload': str(payload), 'manifest': str(manifest_path),
               'manifestSha256': digest(manifest_path), 'files': len(rows), 'bytes': total}
    (target / 'private' / 'runtime' / 'latest.json').write_text(json.dumps(pointer, indent=2) + '\n', encoding='utf-8')
    summary = {**pointer, 'schema': 'neurapix.runtime-acquisition/1', 'date': '2026-10-30',
               'sourceStable': True, 'allCopyHashesEqual': True, 'vendorExecution': False,
               'extensions': dict(sorted(extensions.items()))}
    (target / 'evidence' / 'runtime-acquisition-20261030.json').write_text(json.dumps(summary, indent=2) + '\n', encoding='utf-8')
    with (target / 'binaries' / 'SHA256SUMS.txt').open('a', encoding='utf-8') as out:
        out.write('\n# Supplied external runtime ' + stamp + '\n')
        out.writelines(f"{r['sha256']}  private/runtime/{stamp}/npx/{r['relative']}\n" for r in rows)
    print(json.dumps(pointer), flush=True)


if __name__ == '__main__':
    main()
