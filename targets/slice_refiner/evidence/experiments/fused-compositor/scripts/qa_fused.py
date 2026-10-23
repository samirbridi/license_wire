"""Compare GPU pixels of native and fused composition, including semitransparency."""
import json
import argparse
import time
import numpy as np
from PIL import Image
from build_graph import Graph,ROOT,SOURCE
from fuse_compositor import PROBE
import wire_api as w


def assess():
    path=ROOT/'evidence/fused-qa.json'
    report=json.loads(path.read_text())
    for result in report['cases']:
        index=result['case']
        a=np.array(Image.open(ROOT/f'evidence/qa/fused-{index}-native.png').convert('RGBA'),dtype=float)
        b=np.array(Image.open(ROOT/f'evidence/qa/fused-{index}-fused.png').convert('RGBA'),dtype=float)
        # PNG is exported as straight RGBA. Judge compositing error after
        # premultiplication: a 1-LSB RGB change at alpha=16 expands to 16 in PNG.
        pa=np.concatenate((a[:,:,:3]*a[:,:,3:]/255.0,a[:,:,3:]),axis=2)
        pb=np.concatenate((b[:,:,:3]*b[:,:,3:]/255.0,b[:,:,3:]),axis=2)
        error=np.abs(pa-pb)
        result['premult_max_error']=float(error.max())
        result['premult_mean_error']=float(error.mean())
        result['alpha_max_error']=float(np.abs(a[:,:,3]-b[:,:,3]).max())
        result['pass']=error.max()<=2.01 and error.mean()<.1 and result['alpha_max_error']<=1
    report['metric']='Re-premultiplied exported PNG; <=2.01/255 color error, <=1/255 alpha error. Not bit-identical.'
    report['pass']=len(report['cases'])==9 and all(r['pass'] for r in report['cases'])
    path.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
    return report['pass']


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--analyze-only',action='store_true');args=parser.parse_args()
    if args.analyze_only:
        if not assess():raise SystemExit(1)
        return
    ids=json.loads((ROOT/'evidence/fused-probe-map.json').read_text())
    results=[]
    try:
        w.request('/patch/open',{'path':str(PROBE)})
        g=Graph();g.ids=ids
        ns={n['id']:n for n in w.request('/patch/nodes?limit=2000')['items']}
        g.nodes={key:ns[value] for key,value in ids.items()};g.step=len(ns)
        g.add('sample','Solid Color',color={'r':.4,'g':.2,'b':.7,'a':1})
        for target,port in [('refined','input'),('inside','input'),('video_for_mode','input0'),('video_for_mode','input1')]:
            g.link('sample',target,port)
        def capture(key,name):
            port=g.nodes[key]['main_outlet']
            w.snapshot(g.ids[key],port,'qa/fused-warmup.png');time.sleep(.2)
            path=w.snapshot(g.ids[key],port,'qa/fused-'+name+'.png')
            return np.array(Image.open(path).convert('RGBA'))
        cases=[(0,False,1,0,True),(0,False,.5,0,True),(1,False,.5,0,True),
               (2,False,.5,0,True),(0,True,.5,0,True),(2,True,.5,0,True),
               (0,False,.5,12,True),(1,False,.5,12,True),(0,False,.5,0,False)]
        for index,(mode,black,alpha,feather,merge) in enumerate(cases):
            g.set('sample','color',{'r':.4,'g':.2,'b':.7,'a':alpha})
            for key,value in [('output_mode',mode),('black_bg',black),('g1_opacity',alpha),
                              ('feather',feather),('merge_edges',merge)]:g.set(key,'input',value)
            time.sleep(.3)
            a=capture('display',str(index)+'-native');b=capture('fused_display',str(index)+'-fused')
            diff=np.abs(a.astype(int)-b.astype(int))
            result={'case':index,'mode':mode,'black':black,'alpha':alpha,'feather':feather,'merge':merge,
                    'max_error':int(diff.max()),'mean_error':float(diff.mean()),'p999_error':float(np.quantile(diff,.999))}
            result['pass']=result['max_error']<=4 and result['mean_error']<.2
            results.append(result);print(json.dumps(result),flush=True)
    finally:
        report={'pass':len(results)==9 and all(r['pass'] for r in results),'cases':results,
                'scope':'Native Wire GPU output equivalence, 8bpc, premultiplied alpha'}
        (ROOT/'evidence/fused-qa.json').write_text(json.dumps(report,indent=2)+'\n')
        w.request('/patch/open',{'path':str(SOURCE)})
    if not assess():raise SystemExit(1)


if __name__=='__main__':main()
