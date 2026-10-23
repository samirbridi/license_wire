"""Portable Salsa20/20 block function, used only by the local format reader."""
import struct


def block(key, nonce, counter):
    constants = struct.unpack('<4I', b'expand 32-byte k')
    k = struct.unpack('<8I', key)
    n = struct.unpack('<2I', nonce)
    original = [constants[0], *k[:4], constants[1], *n,
                counter & 0xffffffff, counter >> 32, constants[2], *k[4:], constants[3]]
    x = original.copy()
    def rotate(v, n):
        v &= 0xffffffff
        return ((v << n) | (v >> (32-n))) & 0xffffffff
    def quarter(a, b, c, d):
        x[b] ^= rotate(x[a] + x[d], 7)
        x[c] ^= rotate(x[b] + x[a], 9)
        x[d] ^= rotate(x[c] + x[b], 13)
        x[a] ^= rotate(x[d] + x[c], 18)
    for _ in range(10):
        for q in [(0,4,8,12), (5,9,13,1), (10,14,2,6), (15,3,7,11),
                  (0,1,2,3), (5,6,7,4), (10,11,8,9), (15,12,13,14)]:
            quarter(*q)
    return struct.pack('<16I', *[(a+b) & 0xffffffff for a,b in zip(x, original)])


def xor(data, key, nonce, position=0):
    result = bytearray()
    offset = 0
    while offset < len(data):
        counter, skip = divmod(position + offset, 64)
        stream = block(key, nonce, counter)[skip:]
        chunk = data[offset:offset+len(stream)]
        result.extend(a ^ b for a,b in zip(chunk, stream))
        offset += len(chunk)
    return bytes(result)
