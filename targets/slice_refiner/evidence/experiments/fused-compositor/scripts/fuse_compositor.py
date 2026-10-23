"""Fuse final masks/compositing while keeping attribute switches for lazy branches."""
import argparse
import json
import time
from build_graph import ROOT,SOURCE
from extend_graph import resume,choose
import wire_api as w

RESOURCE=SOURCE.parent/'Resources/Mizin_Compositor.fs'
PROBE=ROOT/'evidence/probes/Fused Compositor Probe/Fused Compositor Probe.wire'


def install(g):
    g.add('compositor','ISF','Video')
    g.set('compositor','fragment-shader',{'path':str(RESOURCE)})
    g.nodes['compositor']=w.request('/patch/nodes/'+str(g.ids['compositor']))
    g.add('transparent','Solid Color',color={'r':0,'g':0,'b':0,'a':0})
    choose(g,'raw_for_mode','output_mode',['raw_render','transparent','transparent'])
    choose(g,'soft_for_mode','output_mode',['soft_mask','soft_mask','transparent'])
    choose(g,'video_for_mode','output_mode',['video','video','transparent'])
    for source,port in [('video_for_mode','videoImage'),('soft_for_mode','softMask'),
                        ('raw_for_mode','rawMask'),('stroke_choice','strokeImage'),
                        ('output_mode','outputMode'),('black_bg','blackBackground')]:
        g.link(source,'compositor',port)
    choose(g,'fused_final','output_mode',['compositor','compositor','stroke_choice'])
    choose(g,'fused_display','black_bg',['compositor','fused_final'])


def main():
    p=argparse.ArgumentParser();p.add_argument('--apply',action='store_true');a=p.parse_args()
    g=resume()
    if 'compositor' in g.ids:raise RuntimeError('Compositor already installed')
    if not a.apply:
        PROBE.parent.mkdir(parents=True,exist_ok=True);PROBE.write_bytes(SOURCE.read_bytes())
        w.request('/patch/open',{'path':str(PROBE)})
    install(g)
    if a.apply:
        g.link('fused_display','out','input')
        g.save()
        # Delete obsolete composition only; preserve every exposed parameter ID.
        dead=['cutout_raw','cutouts','refined','inside','refine_layers','refine_merge',
              'inside_layers','inside_merge','background','background_layers',
              'background_merge','display','final']
        d=json.loads(SOURCE.read_text());removed={g.ids[key] for key in dead}
        for i in removed:d['patch']['nodes'].pop(str(i))
        d['patch']['connections']=[c for c in d['patch']['connections'] if c['from'][0] not in removed and c['to'][0] not in removed]
        for key in dead:g.ids.pop(key)
        g.ids['display']=g.ids.pop('fused_display')
        # Native save stores shader paths relative to the patch; copying Resources
        # alongside the editable release makes the source relocatable.
        for node in d['patch']['nodes'].values():node['thumbnail_visible']=False
        d['patch']['nodes'][str(g.ids['out'])]['thumbnail_visible']=True
        d['patch']['nodes'][str(g.ids['compositor'])]['attributes']['fragment-shader']['value']['path']['main']='Resources/Mizin_Compositor.fs'
        SOURCE.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
        (ROOT/'evidence/reconstruction-node-map.json').write_text(json.dumps(g.ids,indent=2)+'\n')
        w.request('/patch/open',{'path':str(SOURCE)})
    else:
        w.request('/patch/save',{'overwrite':True})
        (ROOT/'evidence/fused-probe-map.json').write_text(json.dumps(g.ids,indent=2)+'\n')
    time.sleep(.5)
    print(json.dumps({'apply':a.apply,'nodes':len(g.ids),'shader':str(RESOURCE)}))


if __name__=='__main__':main()
