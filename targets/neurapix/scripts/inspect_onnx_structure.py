"""Inspect ONNX graph declarations by streaming protobuf fields, skipping weights.

Schema reference: https://github.com/onnx/onnx/blob/main/onnx/onnx.proto
No ONNX/PyTorch imports, model loading or inference.
"""
from __future__ import annotations
import argparse
import collections
import io
import json
from pathlib import Path


def varint(stream):
    value=0
    for shift in range(0,70,7):
        b=stream.read(1)
        if not b: raise ValueError('Truncated protobuf varint')
        value|=(b[0]&127)<<shift
        if b[0]<128:return value
    raise ValueError('Oversized protobuf varint')


def fields(stream,start,length):
    end=start+length;stream.seek(start);count=0
    while stream.tell()<end:
        count+=1
        if count>100000:raise ValueError('Field budget exceeded')
        tag=varint(stream);number=tag>>3;wire=tag&7
        if not number:raise ValueError('Invalid protobuf field')
        if wire==0:
            yield number,wire,varint(stream),0
            continue
        if wire==2:size=varint(stream)
        elif wire==1:size=8
        elif wire==5:size=4
        else:raise ValueError('Unsupported protobuf wire type')
        offset=stream.tell()
        if offset+size>end:raise ValueError('Protobuf field exceeds parent')
        yield number,wire,offset,size
        stream.seek(offset+size)
    if stream.tell()!=end:raise ValueError('Invalid message boundary')


def small_fields(stream,start,size):
    if size>1024*1024:raise ValueError('Metadata exceeds budget')
    stream.seek(start);data=stream.read(size)
    if len(data)!=size:raise ValueError('Truncated metadata')
    view=io.BytesIO(data)
    result=[]
    for number,wire,value,length in fields(view,0,len(data)):
        if wire==2:
            view.seek(value);value=view.read(length)
        result.append((number,wire,value))
    return result


def message(data): return small_fields(io.BytesIO(data),0,len(data))
def selected(items,number): return [v for n,w,v in items if n==number]


def tensor_info(items):
    names=selected(items,1);types=selected(items,2)
    output={'name':names[0].decode('utf-8') if names else None,'dimensions':[]}
    if types:
        tensors=selected(message(types[0]),1)
        if tensors:
            tensor=message(tensors[0]);output['elementType']=selected(tensor,1)
            shapes=selected(tensor,2)
            if shapes:
                for dim in selected(message(shapes[0]),1):
                    vals=message(dim);numeric=selected(vals,1);symbolic=selected(vals,2)
                    output['dimensions'].append(numeric[0] if numeric else symbolic[0].decode('utf-8') if symbolic else None)
    return output


def inspect(stream,size):
    output={'graphCount':0,'nodeCount':0,'initializerCount':0,'operators':{},'inputs':[],'outputs':[],
            'modelExecution':False,'weightValuesRead':False}
    counts=collections.Counter()
    for number,wire,offset,length in fields(stream,0,size):
        if number in (2,3) and wire==2:
            if length>1024:raise ValueError('Producer declaration exceeds budget')
            stream.seek(offset);output['producer' if number==2 else 'producerVersion']=stream.read(length).decode('utf-8')
        if number!=7 or wire!=2:continue
        output['graphCount']+=1
        for n,w,pos,nbytes in fields(stream,offset,length):
            if n==1 and w==2:
                output['nodeCount']+=1
                for nn,ww,value,declared in fields(stream,pos,nbytes):
                    if nn==4 and ww==2:
                        if declared>1024:raise ValueError('Operator name exceeds budget')
                        stream.seek(value);counts[stream.read(declared).decode('utf-8')]+=1
            elif n==5:output['initializerCount']+=1
            elif n in (11,12) and w==2:
                output['inputs' if n==11 else 'outputs'].append(tensor_info(small_fields(stream,pos,nbytes)))
    output['operators']=dict(sorted(counts.items()));return output


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('runtime',type=Path);p.add_argument('output',type=Path)
    a=p.parse_args();rows=[]
    paths=list((a.runtime/'nets').rglob('*.onnx'))+list((a.runtime/'culling/_internal/neurapix').rglob('*.onnx'))
    for path in paths:
        with path.open('rb') as stream:r=inspect(stream,path.stat().st_size)
        rows.append({'relative':path.relative_to(a.runtime).as_posix(),**r})
    a.output.write_text(json.dumps({'schema':'neurapix.onnx-structure/1','models':rows},indent=2)+'\n',encoding='utf-8')
    print(json.dumps(rows,indent=2))


if __name__=='__main__':main()
