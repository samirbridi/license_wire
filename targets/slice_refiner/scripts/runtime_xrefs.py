"""Locate exact RIP-relative string references and x64 unwind function bounds."""
import json
import pathlib
import re
import struct

ROOT = pathlib.Path(__file__).resolve().parents[1]
data = pathlib.Path(r'C:\Program Files\Resolume Wire\WireLib.dll').read_bytes()
pe = struct.unpack_from('<I', data, 0x3c)[0]
opt = pe + 24
section_start = opt + struct.unpack_from('<H', data, pe + 20)[0]
base = struct.unpack_from('<Q', data, opt + 24)[0]
sections = []
for i in range(struct.unpack_from('<H', data, pe + 6)[0]):
    p = section_start + i * 40
    name = data[p:p+8].rstrip(b'\0').decode()
    vsize, rva, rawsize, offset = struct.unpack_from('<IIII', data, p + 8)
    sections.append((name, rva, max(vsize, rawsize), offset, rawsize))
def off(rva):
    return next(o + rva - v for n, v, s, o, z in sections if v <= rva < v + s)
def rva(offset):
    return next(v + offset - o for n, v, s, o, z in sections if o <= offset < o + z)
pdata, psize = struct.unpack_from('<II', data, opt + 112 + 3 * 8)
bounds = [struct.unpack_from('<III', data, off(pdata) + i)[:2] for i in range(0, psize, 12)]
needles = [b'Failed to open patch.wire inside bundle', b'patch.wire', b'Compiled patch does not contain valid wire data', b'failed to parse compiled patch JSON']
report = []
for needle in needles:
    loc = data.find(needle + b'\0')
    target = rva(loc)
    refs = []
    for n, v, s, o, z in sections:
        if n != '.text': continue
        for m in re.finditer(rb'[\x48\x4c]\x8d[\x05\x0d\x15\x1d\x25\x2d\x35\x3d]', data[o:o+z]):
            p = o + m.start()
            if rva(p) + 7 + struct.unpack_from('<i', data, p+3)[0] == target:
                address = rva(p)
                a, b = next(((a,b) for a,b in bounds if a <= address < b), (0,0))
                refs.append({'rva': hex(address), 'function_start': hex(base+a), 'function_end': hex(base+b)})
    report.append({'string': needle.decode(), 'file_offset': hex(loc), 'rva': hex(target), 'refs': refs})
(ROOT / 'evidence/runtime-xrefs.json').write_text(json.dumps(report, indent=2)+'\n', encoding='utf-8')
print(json.dumps(report, indent=2))

descriptor = rva(data.index(b'.?AVbundle@wire@@\0') - 16)
rtti = []
for match in re.finditer(re.escape(struct.pack('<I', descriptor)), data):
    col = match.start() - 12
    if col < 0 or struct.unpack_from('<I', data, col)[0] != 1: continue
    if struct.unpack_from('<I', data, col+20)[0] != rva(col): continue
    locator_va = base + rva(col)
    for pointer in re.finditer(re.escape(struct.pack('<Q', locator_va)), data):
        vtable_offset = pointer.start() + 8
        methods = [hex(struct.unpack_from('<Q', data, vtable_offset+i*8)[0]) for i in range(16)]
        rtti.append({'descriptor_rva': hex(descriptor), 'locator_va': hex(locator_va),
                     'vtable_va': hex(base+rva(vtable_offset)), 'methods': methods})
(ROOT / 'evidence/runtime-bundle-rtti.json').write_text(json.dumps(rtti, indent=2)+'\n', encoding='utf-8')
print(json.dumps(rtti, indent=2))
