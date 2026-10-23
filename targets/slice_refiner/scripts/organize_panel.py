"""Arrange the native input panel without changing processing or control values."""
import json
from build_graph import ROOT, SOURCE
import wire_api as w


def main():
    w.request('/patch/open', {'path': str(SOURCE)})
    ids = json.loads((ROOT/'evidence/reconstruction-node-map.json').read_text())
    existing = {i['name']: i['id'] for i in w.request('/patch/inputs') if i['type']=='group'}
    groups = [('Output and Quality', ['video','output_mode','merge_edges','black_bg','segments','feather']),
              ('Animation', ['sync','speed','beat_div','amount','color_b'])]
    for i in range(1,5):
        groups.append((f'Group {i}', [f'g{i}_{key}' for key in
            ['slices','enabled','tl','tr','bl','br','corner_scale','stroke','inset','opacity','color','fx','phase']]))
    for index,(name,keys) in enumerate(groups):
        group_id = existing.get(name)
        if group_id is None:
            group_id = w.request('/patch/inputs/groups', {'name':name,'index':index})['id']
        for position,key in enumerate(keys):
            w.request(f'/patch/inputs/{ids[key]}/move', {'index':position,'group_id':group_id})
    w.request('/patch/save', {'overwrite':True})
    panel = w.request('/patch/inputs')
    (ROOT/'evidence/native-panel.json').write_text(json.dumps(panel,indent=2)+'\n',encoding='utf-8')
    print(json.dumps([{'group':i['name'],'controls':len(i.get('inputs',[]))} for i in panel]))


if __name__=='__main__':main()
