"""Reserve releases from actual scoped structured Git commits."""
import argparse
import datetime
import json
import pathlib
import re
import subprocess

ROOT=pathlib.Path(__file__).resolve().parents[1]
REPO=ROOT.parents[1]
SCOPE=ROOT.relative_to(REPO).as_posix()

def git(*args):
    return subprocess.check_output(['git','-C',str(REPO),*args],text=True,encoding='utf-8').rstrip('\r\n')

def parse_commits(raw):
    commits=[]
    for record in raw.split('\x1e'):
        if not record.strip():continue
        sha,subject,body=record.strip('\r\n').split('\x1f',2)
        m=re.fullmatch(r'(break|feat|fix|improve|perf|refactor): (.+)',subject)
        if not m:raise ValueError('Invalid scoped commit: '+subject)
        commits.append({'sha':sha,'subject':subject,'kind':'break' if m[1]=='break' or 'BREAKING CHANGE' in body else m[1]})
    return commits

def calculate(previous,commits):
    m=re.fullmatch(r'v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)',previous)
    if not m:raise ValueError('Invalid VERSION')
    x,y,z,build=map(int,m.groups())
    kind='break' if any(c['kind']=='break' for c in commits) else 'feat' if any(c['kind']=='feat' for c in commits) else 'fix'
    if kind=='break':x+=1;y=z=0
    elif kind=='feat':y+=1;z=0
    else:z+=1
    return f'v{x}.{y}.{z} (build {build+1:04d})'

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--reserve',action='store_true')
    parser.add_argument('--status',choices=['PASS','FAIL'])
    args=parser.parse_args()
    receipt_path=ROOT/'evidence/build-version.json'
    state_path=ROOT/'evidence/version-state.json'
    history_path=ROOT/'evidence/build-history.json'
    if args.status:
        receipt=json.loads(receipt_path.read_text());receipt['status']=args.status
        receipt_path.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
        history=json.loads(history_path.read_text());history[-1]=receipt
        history_path.write_text(json.dumps(history,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(receipt));return
    state=json.loads(state_path.read_text()) if state_path.exists() else {}
    revision=state['source_commit']+'..HEAD' if state else 'HEAD'
    raw=git('log','--reverse','--format=%H%x1f%s%x1f%b%x1e',revision,'--',SCOPE)
    commits=parse_commits(raw)
    if not state and not commits:raise ValueError('Commit validated source before the first compilation')
    previous=(ROOT/'VERSION').read_text(encoding='utf-8-sig').strip()
    receipt={'display':calculate(previous,commits),'previous':previous,'source_commit':git('rev-parse','HEAD'),
             'commits':commits,'date':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).date().isoformat(),'status':'RESERVED'}
    if args.reserve:
        dirty=git('status','--porcelain','--',SCOPE+'/scripts',SCOPE+'/reconstructed')
        if dirty:raise ValueError('Commit source changes before compilation:\n'+dirty)
        (ROOT/'VERSION').write_text(receipt['display']+'\n',encoding='utf-8')
        receipt_path.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
        state_path.write_text(json.dumps({'source_commit':receipt['source_commit'],'display':receipt['display']},indent=2)+'\n',encoding='utf-8')
        history=json.loads(history_path.read_text()) if history_path.exists() else []
        history.append(receipt);history_path.write_text(json.dumps(history,indent=2)+'\n',encoding='utf-8')
        entry=f'## {receipt["display"]} - {receipt["date"]}\n\n'
        for title,kinds in [('💥 Breaking Changes',['break']),('✨ Features',['feat']),('🐛 Fixes',['fix']),('⚡ Improvements',['improve','perf','refactor'])]:
            items=[f'- {c["subject"]} (`{c["sha"]}`)' for c in commits if c['kind'] in kinds]
            if not commits and 'fix' in kinds:items=[f'- Recompilacao de `{receipt["source_commit"]}`; build incrementado.']
            entry+='### '+title+'\n\n'+('\n'.join(items) if items else '- Nenhum.')+'\n\n'
        path=ROOT/'CHANGELOG.md';old=path.read_text(encoding='utf-8-sig') if state else ''
        path.write_text('# CHANGELOG - Slice Refiner\n\n'+entry+old.partition('\n')[2].lstrip(),encoding='utf-8')
    print(json.dumps(receipt,ensure_ascii=True))

if __name__=='__main__':main()
