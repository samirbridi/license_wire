"""Keep the output preview, avoiding many unnecessary intermediate UI thumbnails."""
import json
from build_graph import ROOT,SOURCE
import wire_api as w


def main():
    ids=json.loads((ROOT/'evidence/reconstruction-node-map.json').read_text())
    d=json.loads(SOURCE.read_text())
    for key,node in d['patch']['nodes'].items():node['thumbnail_visible']=int(key)==ids['out']
    SOURCE.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
    w.request('/patch/open',{'path':str(SOURCE)})
    w.request('/patch/save',{'overwrite':True})


if __name__=='__main__':main()
