"""Produce a bounded, evidence-linked inventory of the extracted original graph."""
import collections
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
d = json.loads((ROOT/'evidence/raw-bundle/patch.wire').read_text(encoding='utf-8'))
p = d['patch']
classes = json.loads((ROOT/'evidence/wire-classes.json').read_text(encoding='utf-8-sig'))['items']
names = {c['id'].lower():c for c in classes}
nodes = p['nodes']
def canonical(n):
    return names.get(n['class']['id'].lower(), {}).get('name', n['name'])
def vals(n):
    return {k:v['value'] for k,v in {**n.get('attributes',{}),**n.get('constants',{})}.items()}
inventory = [{'id':int(i),'class':canonical(n),'label':n['name'],'values':vals(n)} for i,n in nodes.items()]
inputs = []
for i in p['inputOrder']:
    n = nodes[str(i)]
    v = vals(n)
    inputs.append({'id':i,'class':canonical(n),'label':n['name'], 'value':v.get('input'),
                   'min':v.get('min'),'max':v.get('max'),
                   'options':[v[k] for k in v if k.startswith('option') and k.endswith('-label')]})
incoming = collections.defaultdict(list)
for c in p['connections']:
    incoming[c['to'][0]].append(c['from'][0])
outputs = [int(i) for i,n in nodes.items() if canonical(n)=='Texture Out']
visited=set()
def visit(i):
    if i in visited: return
    visited.add(i)
    for j in incoming[i]: visit(j)
for i in outputs:visit(i)
report={'meta':p['meta'],'node_count':len(nodes),'connection_count':len(p['connections']),
        'class_counts':dict(collections.Counter(canonical(n) for n in nodes.values()).most_common()),
        'inputs':inputs,'inventory':inventory,'output_nodes':outputs,
        'not_upstream_of_output':[{'id':int(i),'class':canonical(n),'label':n['name']} for i,n in nodes.items() if int(i) not in visited],
        'connections':p['connections']}
(ROOT/'evidence/original-graph-analysis.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({k:report[k] for k in ['node_count','connection_count','class_counts','inputs','not_upstream_of_output']},indent=2,ensure_ascii=True))
print('CORE:')
for n in inventory:
    if n['class'] in ['Slice Info','Slice In','Rectangle','Transform','Shape Render','Slice Render','Mask','Texture Out','Union','Edge','Blur']:
        print(n['id'],n['class'],n['label'],json.dumps({k:v for k,v in n['values'].items() if k in ['bypass','round','mode','radius','resolution-mode','resolution-absolute','resolution-relative']},ensure_ascii=True))
