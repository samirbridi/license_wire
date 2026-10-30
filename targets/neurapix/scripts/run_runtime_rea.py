"""Run pinned read-only REA commands and retain raw evidence privately."""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import time
from pathlib import Path


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('label')
    p.add_argument('command')
    p.add_argument('path', type=Path)
    p.add_argument('extra', nargs='*')
    args=p.parse_args()
    target=Path(__file__).resolve().parents[1]
    directory=sorted((target/'private/runtime').glob('20*'))[-1]
    out=directory/'rea';out.mkdir(exist_ok=True)
    entry=json.loads((target/'private/tools/rea-entry.json').read_text())['entry']
    command=['node',entry,args.command,str(args.path.resolve()),*args.extra,'--format','json']
    env=os.environ.copy();env['TEMP']=env['TMP']=str(directory/'rea-tmp')
    Path(env['TEMP']).mkdir(exist_ok=True)
    started=time.monotonic()
    with (out/(args.label+'.json')).open('xb') as stdout, (out/(args.label+'.stderr')).open('xb') as stderr:
        result=subprocess.run(command,stdout=stdout,stderr=stderr,env=env,timeout=300,check=False)
    data=(out/(args.label+'.json')).read_bytes()
    receipt={'label':args.label,'command':command,'exit':result.returncode,'elapsedSeconds':round(time.monotonic()-started,3),
             'outputSha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'vendorExecution':False}
    (out/(args.label+'.command.json')).write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(receipt),flush=True)


if __name__=='__main__':
    main()
