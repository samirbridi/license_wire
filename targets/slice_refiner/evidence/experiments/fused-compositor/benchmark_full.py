"""Complete plugin comparison on identical synthetic overlapping slice collections."""
import hashlib
import json
import statistics
import time
import http.client
import urllib.error
from build_graph import Graph,ROOT,SOURCE,absolute_resources
from benchmark_core import gpu
import wire_api as w

IDS=json.loads((ROOT/'evidence/reconstruction-node-map.json').read_text())
BASELINE=ROOT/'reconstructed/releases/v0.2.0-build0002/Slice Refine Pro by Mizin v0.2.0.wire'
REPORT={'resolution':[3840,2160],'metric':'whole-device NVIDIA utilization, not FPS or per-process GPU time',
        'scope':'Complete new plugin versus its own v0.2.0, in Wire; not versus proprietary original or Arena',
        'scene':'Four groups of grid_4x4 slices at identical positions; 144 case expands each group to 36 overlapping instances',
        'shader_sha256':hashlib.sha256((SOURCE.parent/'Resources/Mizin_Compositor.fs').read_bytes()).hexdigest(),'runs':[]}


def snapshot(*args):
    for attempt in range(3):
        try:return w.snapshot(*args)
        except (http.client.RemoteDisconnected,urllib.error.URLError,TimeoutError):
            REPORT.setdefault('warmup_http_retries',[]).append(attempt+1)
            if attempt==2:raise
            time.sleep(.6)


def run(kind,count,mode,repeat):
    origin=BASELINE if kind=='baseline' else SOURCE
    d=absolute_resources(json.loads(origin.read_text()),origin.parent)
    d['patch']['meta']['resolution']={'width':3840,'height':2160}
    d['patch']['nodes'][str(IDS['output_mode'])]['attributes']['input']['value']=mode
    for i in range(1,5):d['ui']['deviceConnections']['input'][str(IDS[f'g{i}_slices'])]='slice_grid_4x4'
    for key,node in d['patch']['nodes'].items():node['thumbnail_visible']=int(key)==IDS['out']
    path=ROOT/f'evidence/benchmarks/full-{kind}-{count}-{mode}.wire'
    path.write_text(json.dumps(d),encoding='utf-8')
    w.request('/patch/open',{'path':str(path)})
    if count==144:
        g=Graph();ns={n['id']:n for n in w.request('/patch/nodes?limit=2000')['items']}
        g.ids={key:value for key,value in IDS.items() if value in ns};g.nodes={key:ns[value] for key,value in g.ids.items()}
        g.step=len(ns)
        for i in range(1,5):
            key=f'load_{i}';g.add(key,'Expand','Collection');g.link(f'g{i}_slices',key,'input');g.set(key,'output-size',36)
            g.link(key,f'g{i}_count','container');g.link(key,'slices',f'channel{i-1}')
        w.request('/patch/save',{'overwrite':True})
    links=w.request('/patch/connections?limit=10000')['items']
    root=next(c['source'] for c in links if c['target']=={'node':IDS['out'],'inlet':'input'})
    time.sleep(.5)
    for _ in range(2):
        snapshot(root['node'],root['outlet'],'benchmarks/full-warmup.png',320,180);time.sleep(.3)
    value=w.request(f'/patch/nodes/{IDS["radii"]}/outlets/output/live')
    actual=len(value.get('value',value) if isinstance(value,dict) else value)
    if actual!=count:raise RuntimeError(f'Expected {count} slice instances, got {actual}')
    time.sleep(1)
    samples=[]
    for _ in range(4):samples.append(gpu());time.sleep(1)
    result={'kind':kind,'slices':count,'mode':mode,'repeat':repeat,'samples':samples,
            'gpu_median_percent':statistics.median(s['gpu_device_percent'] for s in samples)}
    snapshot(root['node'],root['outlet'],f'benchmarks/full-{kind}-{count}-{mode}-{repeat}.png')
    REPORT['runs'].append(result)
    (ROOT/'evidence/full-benchmark.json').write_text(json.dumps(REPORT,indent=2)+'\n')
    print(json.dumps({key:value for key,value in result.items() if key!='samples'}),flush=True)


def main():
    try:
        for count,mode in [(64,0),(64,1),(64,2),(144,0)]:
            for repeat,order in [(1,['baseline','fused']),(2,['fused','baseline'])]:
                for kind in order:run(kind,count,mode,repeat)
    finally:w.request('/patch/open',{'path':str(SOURCE)})


if __name__=='__main__':main()
