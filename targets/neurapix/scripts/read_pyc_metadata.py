"""Bounded CPython 3.11-3.14 marshal metadata reader; never creates code objects.

Format reference: CPython v3.14.0 Python/marshal.c. This is not a VM or a
decompiler. Offsets identify data declarations, not executed call sites.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import struct
from pathlib import Path

NULL=object()
PENDING=object()
MAGICS={3495:'3.11',3531:'3.12',3571:'3.13',3627:'3.14'}


class Reader:
    def __init__(self,data):
        if len(data)>16*1024*1024: raise ValueError('File exceeds budget')
        self.data=data;self.pos=16;self.refs=[];self.nodes=[];self.objects=0
        if len(data)<17 or data[2:4]!=b'\r\n' or int.from_bytes(data[:2],'little') not in MAGICS:
            raise ValueError('Unsupported CPython bytecode header')
        if int.from_bytes(data[4:8],'little') & ~3: raise ValueError('Invalid pyc flags')
        self.version=MAGICS[int.from_bytes(data[:2],'little')]

    def take(self,n):
        if n<0 or self.pos+n>len(self.data): raise ValueError('Truncated data')
        b=self.data[self.pos:self.pos+n];self.pos+=n;return b

    def integer(self): return struct.unpack('<i',self.take(4))[0]

    def length(self):
        n=self.integer()
        if n<0 or n>1000000: raise ValueError('Length exceeds budget')
        return n

    def value(self,depth=0):
        self.objects+=1
        if depth>64 or self.objects>200000: raise ValueError('Object/depth budget exceeded')
        offset=self.pos;tag=self.take(1)[0];kind=chr(tag&127)
        slot=None
        if tag&128:
            slot=len(self.refs);self.refs.append(PENDING)
        read=lambda:self.value(depth+1)
        if kind=='r':
            n=self.integer()
            if slot is not None or not 0<=n<len(self.refs) or self.refs[n] is PENDING:
                raise ValueError('Invalid or recursive reference')
            return self.refs[n]
        if kind=='0': value=NULL
        elif kind=='N': value=None
        elif kind in 'FT': value=kind=='T'
        elif kind in '.S': value={'sentinel':kind}
        elif kind=='i': value=self.integer()
        elif kind=='I': value=struct.unpack('<q',self.take(8))[0]
        elif kind=='l':
            n=self.integer()
            if abs(n)>1024: raise ValueError('Integer exceeds budget')
            digits=[int.from_bytes(self.take(2),'little') for _ in range(abs(n))]
            if any(x>=32768 for x in digits): raise ValueError('Invalid integer digit')
            value=sum(x<<(15*i) for i,x in enumerate(digits))*(-1 if n<0 else 1)
        elif kind in 'gy':
            vals=struct.unpack('<'+('d' if kind=='g' else 'dd'),self.take(8 if kind=='g' else 16))
            value=vals[0] if kind=='g' else {'complex':list(vals)}
        elif kind in 'suatAZz':
            n=self.take(1)[0] if kind in 'Zz' else self.length()
            b=self.take(n)
            value=b if kind=='s' else b.decode('ascii' if kind in 'aAZz' else 'utf-8',errors='surrogatepass')
        elif kind in '([<>)':
            n=self.take(1)[0] if kind==')' else self.length()
            if n>100000: raise ValueError('Container exceeds budget')
            value=[read() for _ in range(n)]
        elif kind=='{':
            value=[]
            for _ in range(100000):
                k=read()
                if k is NULL: break
                value.append([k,read()])
            else: raise ValueError('Dictionary exceeds budget')
        elif kind==':': value={'slice':[read(),read(),read()]}
        elif kind=='c':
            value={'kind':'code','offset':offset}
            self.nodes.append(value)
            for field in ('argcount','posonlyargcount','kwonlyargcount','stacksize','flags'): value[field]=self.integer()
            for field in ('bytecode','consts','names','localsplusnames','localspluskinds','filename','name','qualname'): value[field]=read()
            value['firstlineno']=self.integer();value['linetable']=read();value['exceptiontable']=read()
            if not isinstance(value['bytecode'],bytes) or not isinstance(value['names'],list):
                raise ValueError('Invalid code metadata')
        else: raise ValueError(f'Unsupported marshal tag {kind!r} at {offset}')
        if slot is not None: self.refs[slot]=value
        return value


def constants(value,depth=0):
    if depth>32: raise ValueError('Constant nesting exceeds budget')
    if isinstance(value,dict) and value.get('kind')=='code': return {'code':value['qualname'],'offset':value['offset']}
    if isinstance(value,bytes): return {'bytes':len(value),'sha256':hashlib.sha256(value).hexdigest()}
    if isinstance(value,list): return [constants(v,depth+1) for v in value]
    if isinstance(value,dict): return {k:constants(v,depth+1) for k,v in value.items()}
    if value is NULL: raise ValueError('Unexpected NULL')
    if isinstance(value,int) and value.bit_length()>256: return {'integerBits':value.bit_length()}
    return value


def inspect(data):
    reader=Reader(data);root=reader.value()
    if reader.pos!=len(data) or not isinstance(root,dict) or root.get('kind')!='code':
        raise ValueError('Trailing data or non-code root')
    rows=[]
    for node in reader.nodes:
        rows.append({k:constants(v) for k,v in node.items() if k not in ('linetable','exceptiontable','localspluskinds')})
    return {'schema':'neurapix.pyc-metadata/1','pythonVersion':reader.version,'sha256':hashlib.sha256(data).hexdigest(),
            'bytes':len(data),'parsedBytes':reader.pos,'objects':reader.objects,'vendorExecution':False,'codeObjects':rows}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('file',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();result=inspect(a.file.read_bytes())
    a.output.write_text(json.dumps(result,ensure_ascii=False,allow_nan=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'pythonVersion':result['pythonVersion'],'codeObjects':len(result['codeObjects']),'bytes':result['bytes']}))


if __name__=='__main__': main()
