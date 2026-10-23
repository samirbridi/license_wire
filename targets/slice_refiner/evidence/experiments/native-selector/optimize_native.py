"""Resolve global mode switches at setup; preserve the previous stable artifact."""
import json
from build_graph import ROOT,SOURCE
import wire_api as w


def main():
    ids=json.loads((ROOT/'evidence/reconstruction-node-map.json').read_text())
    d=json.loads(SOURCE.read_text());changes=[]
    for key in ['clock_rate','final','stroke_choice','display']:
        node=d['patch']['nodes'][str(ids[key])]
        previous=node['attributes']['selection-flow']['value']
        node['attributes']['selection-flow']['value']='attribute'
        if 'selection' in node.get('constants',{}):node['attributes']['selection']=node['constants'].pop('selection')
        changes.append({'key':key,'node':ids[key],'previous':previous,'new':'attribute'})
    SOURCE.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
    w.request('/patch/open',{'path':str(SOURCE)})
    for change in changes:
        n=w.request('/patch/nodes/'+str(change['node']))
        inlet=next(p for p in n['inlets'] if p['id']=='selection')
        change['observed']=inlet['bundle']['flow']
        if change['observed']!='attribute':raise RuntimeError('Selector was not specialized')
    (ROOT/'evidence/native-optimization.json').write_text(json.dumps({'changes':changes},indent=2)+'\n')
    print(json.dumps(changes))


if __name__=='__main__':main()
