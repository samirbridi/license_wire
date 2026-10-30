"""Static Lua call/constant locations; conservative symbols, no VM execution."""
from pathlib import Path
import argparse
import hashlib
import json
import re
from urllib.parse import urlsplit

from inspect_lua51_package import Chunk

CONTROLS=re.compile(r'^(?:Exposure2012|Temperature|Tint|Contrast2012|Highlights2012|Shadows2012|Whites2012|Blacks2012|Saturation|Vibrance|Clarity2012|Dehaze|Texture|CameraProfile|ProcessVersion|WhiteBalance|Crop\w+|ToneCurve\w+|HueAdjustment\w+|SaturationAdjustment\w+|LuminanceAdjustment\w+|ColorGrade\w+|LensProfile\w+|Sharpness|LuminanceSmoothing|ColorNoiseReduction)$')


def symbol(name):return ('symbol',name)


def safe_literal(value):
    if type(value) in (int,float,bool) or value is None:return value
    if not isinstance(value,str):return None
    if value.startswith(('https://','http://')):
        url=urlsplit(value);return url.scheme+'://'+url.netloc+url.path
    if re.fullmatch(r'--[a-zA-Z0-9_-]{1,60}',value) or CONTROLS.fullmatch(value):return value
    if re.fullmatch(r'[\w.%-]+\.(?:exe|dll|json|zip|onnx|pt|pth|safetensors)',value):return value
    if re.fullmatch(r'Lr[A-Za-z]+',value):return value
    return None


def trace(chunk):
    functions={f['path']:f for f in chunk.functions};calls=[];exports=[];seen=set()
    def visit(path,upvalues):
        if path in seen:return
        seen.add(path);f=functions[path];code=f['instructions'];constants=f['constants'];regs={}
        def const(index):return constants[index]['value'] if index<len(constants) else None
        def rk(index):return const(index-256) if index>=256 else regs.get(index)
        targets={pc+1+((word>>14)&262143)-131071 for pc,word in enumerate(code) if word&63 in (22,31,32)}
        pc=0
        while pc<len(code):
            if pc in targets:regs={}
            word=code[pc];op=word&63;a=(word>>6)&255;b=(word>>23)&511;c=(word>>14)&511;bx=(word>>14)&262143
            if op==0:regs[a]=regs.get(b)
            elif op==1:regs[a]=const(bx)
            elif op==2:regs[a]=bool(b)
            elif op==3:
                for reg in range(a,b+1):regs[reg]=None
            elif op==4:regs[a]=upvalues.get(b)
            elif op==5:regs[a]=symbol(str(const(bx)))
            elif op==6:
                base,key=regs.get(b),rk(c)
                regs[a]=symbol(base[1]+'.'+key) if isinstance(base,tuple) and base[0]=='symbol' and isinstance(key,str) else None
            elif op==9:
                key,value=rk(b),rk(c)
                if isinstance(key,str) and isinstance(value,tuple) and value[0]=='closure':exports.append({'function':value[1],'name':key})
            elif op==10:regs[a]=None
            elif op==11:
                base,key=regs.get(b),rk(c);regs[a+1]=base
                regs[a]=symbol(base[1]+'.'+key) if isinstance(base,tuple) and base[0]=='symbol' and isinstance(key,str) else None
            elif op in (28,29):
                target=regs.get(a);args=[regs.get(i) for i in range(a+1,a+b)] if b else []
                if isinstance(target,tuple) and target[0]=='symbol':
                    calls.append({'function':path,'pc':pc+1,'fileOffset':f['codeOffset']+4*pc,'target':target[1],
                                  'literalArguments':[safe_literal(arg) for arg in args],
                                  'callbackFunctions':[arg[1] for arg in args if isinstance(arg,tuple) and arg[0]=='closure']})
                result=None
                if target in (symbol('import'),symbol('require')) and args and isinstance(args[0],str):result=symbol(args[0])
                for reg in range(a,a+max(c-1,1)):regs[reg]=None
                regs[a]=result
            elif op==36:
                if bx<len(f['children']):
                    child=f['children'][bx];bindings={}
                    for i in range(functions[child]['upvalues']):
                        if pc+i+1>=len(code):break
                        move=code[pc+i+1];kind=move&63;source=(move>>23)&511
                        bindings[i]=regs.get(source) if kind==0 else upvalues.get(source) if kind==4 else None
                    regs[a]=('closure',child);visit(child,bindings);pc+=functions[child]['upvalues']
            elif op in (22,23,24,25,26,27,31,32,33):regs={}
            elif op not in (7,8,10,30,34,35):regs[a]=None
            pc+=1
    visit('0',{})
    for path in functions:
        if path not in seen:visit(path,{})
    return calls,exports


def inspect(package):
    modules=[]
    for path in sorted(Path(package).glob('*.lua')):
        content=path.read_bytes();chunk=Chunk(content);calls,exports=trace(chunk);facts=[]
        for function in chunk.functions:
            for item in function['constants']:
                value=item['value']
                if not isinstance(value,str):continue
                kind=None;safe=None
                if CONTROLS.fullmatch(value):kind,safe='develop-control',value
                elif re.fullmatch(r'--[a-zA-Z0-9_-]{1,60}',value):kind,safe='cli-option',value
                elif value.startswith(('https://','http://')):kind,safe='url',safe_literal(value)
                elif re.fullmatch(r'[\w.%-]+\.(exe|dll|json|zip|onnx|pt|pth|safetensors)',value):kind,safe='artifact-name',value
                elif value.startswith('/') and len(value)<120 and re.fullmatch(r'/[a-zA-Z0-9_/%{}.*-]+',value):kind,safe='path-literal',value
                if kind:facts.append({'kind':kind,'value':safe,'function':function['path'],'fileOffset':item['offset']})
        modules.append({'file':path.name,'sha256':hashlib.sha256(content).hexdigest(),'functionCount':chunk.prototypes,
                        'calls':calls,'exportedFunctionNames':exports,'facts':facts})
    return {'schema':'neurapix.lua51-static-boundaries/1','vendorCodeExecuted':False,'modules':modules,
            'limitations':['Symbols use conservative straight-line register propagation and closure bindings; unresolved/dynamic targets are omitted.',
                          'Literal presence and static calls do not prove runtime reachability, server behavior or ML model architecture.']}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--package',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();report=inspect(args.package)
    with args.output.open('x',encoding='utf-8') as stream:json.dump(report,stream,indent=2)
    print(json.dumps({'modules':len(report['modules']),'functions':sum(m['functionCount'] for m in report['modules']),
                      'resolvedCallSites':sum(len(m['calls']) for m in report['modules'])}))
