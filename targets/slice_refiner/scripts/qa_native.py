"""Exercise the complete graph in Wire using disposable copies and real PNG output."""
import json
import hashlib
import time
import traceback
import http.client
import urllib.error
import numpy as np
from PIL import Image
from build_graph import ROOT, SOURCE
import wire_api as w

IDS=json.loads((ROOT/'evidence/reconstruction-node-map.json').read_text())
REPORT={'host':'Resolume Wire 7.28.1.26535','checks':[],'scope':'Native Wire graph, not Arena playback'}
BASE=json.loads(SOURCE.read_text())
REPORT['source_sha256']=hashlib.sha256(SOURCE.read_bytes()).hexdigest()
QA=ROOT/'evidence/qa'
QA.mkdir(exist_ok=True)


def check(name,condition,**evidence):
    REPORT['checks'].append({'name':name,'pass':bool(condition),**evidence})
    print(name, 'PASS' if condition else 'FAIL',json.dumps(evidence),flush=True)


def load(name='default',devices=None,resolution=None):
    d=json.loads(json.dumps(BASE))
    if devices:
        d['ui']['deviceConnections']['input'].update({str(IDS[key]):value for key,value in devices.items()})
    if resolution:d['patch']['meta']['resolution']={'width':resolution[0],'height':resolution[1]}
    path=QA/(name+'.wire');path.write_text(json.dumps(d),encoding='utf-8')
    w.request('/patch/open',{'path':str(path)})
    # Opening and changing an attribute starts asynchronous graph initialization.
    # Activate a render probe and discard its cached first image before assertions.
    time.sleep(.7)
    info=w.request('/patch/nodes/'+str(IDS['display']))
    for _ in range(2):
        w.snapshot(IDS['display'],info['main_outlet'],'qa/warmup.png',160,90)
        time.sleep(.3)


def setv(key,value):
    # Setting a constant is idempotent. Wire may briefly close HTTP while a
    # newly opened instanced graph initializes; bounded retries are recorded.
    for attempt in range(3):
        try:return w.value(IDS[key],'input',value)
        except (http.client.RemoteDisconnected,urllib.error.URLError,TimeoutError):
            REPORT.setdefault('http_retries',[]).append({'key':key,'attempt':attempt+1})
            if attempt==2:raise
            time.sleep(.8)


def shot(name,node='display',width=960,height=540):
    time.sleep(.4)
    info=w.request('/patch/nodes/'+str(IDS[node]))
    for attempt in range(3):
        try:
            w.snapshot(IDS[node],info['main_outlet'],'qa/probe-cache.png',width,height)
            time.sleep(.3)
            path=w.snapshot(IDS[node],info['main_outlet'],f'qa/{name}.png',width,height)
            return np.array(Image.open(path).convert('RGBA'))
        except RuntimeError:
            if attempt==2:raise
            time.sleep(.4)


def live(key):
    n=w.request('/patch/nodes/'+str(IDS[key]))
    return w.request(f'/patch/nodes/{IDS[key]}/outlets/{n["main_outlet"]}/live')


def main():
    try:
        load()
        nodes=w.request('/patch/nodes?limit=2000')['items']
        connections=w.request('/patch/connections?limit=10000')['items']
        expected={(c['from'][0],c['from'][1],c['to'][0],c['to'][1]) for c in BASE['patch']['connections']}
        actual={(c['source']['node'],c['source']['outlet'],c['target']['node'],c['target']['inlet']) for c in connections}
        check('reload_preserves_graph',len(nodes)==len(BASE['patch']['nodes']) and actual==expected,
              nodes=len(nodes),connections=len(connections),missing=list(expected-actual))
        panel=w.request('/patch/inputs')
        check('six_panel_groups',len(panel)==6 and all(i['type']=='group' for i in panel))
        setv('output_mode',2)
        a=shot('outline-default');alpha=a[:,:,3]
        check('outline_has_transparency',alpha.max()==255 and alpha.min()==0,nonzero_pixels=int((alpha>0).sum()))
        setv('g1_tl',0)
        b=shot('corner-tl-square')
        changed=(b[:,:,3].astype(int)-alpha.astype(int))
        check('top_left_independent',changed[:150,:480].max()>100 and np.max(np.abs(changed[:150,480:]))<5,
              upper_left_max=int(changed[:150,:480].max()),upper_right_max=int(np.max(np.abs(changed[:150,480:]))))
        setv('g1_tl',80);setv('g1_opacity',0)
        a=shot('opacity-zero');check('zero_opacity',a[:,:,3].max()==0)
        setv('g1_opacity',1);setv('g1_enabled',False)
        a=shot('disabled');check('disabled_group',a[:,:,3].max()==0)
        setv('g1_enabled',True);setv('g1_stroke',0)
        a=shot('stroke-zero');check('zero_stroke',a[:,:,3].max()==0)
        setv('g1_stroke',8);setv('g1_inset',500)
        a=shot('inset-extreme');check('degenerate_dimensions',a[:,:,3].max()==0)
        setv('g1_inset',0);setv('g1_tl',1000);setv('g1_tr',1000)
        a=shot('radii-extreme');check('large_radii_finite',np.isfinite(a).all() and a[:,:,3].max()>0)
        setv('g1_tl',80);setv('g1_tr',80)
        setv('black_bg',True)
        a=shot('black-background');check('opaque_background',a[:,:,3].min()==255)
        setv('black_bg',False);setv('merge_edges',False)
        a=shot('individual-edges');check('individual_edges_render',a[:,:,3].max()==255 and a[270,480,3]==0)
        setv('merge_edges',True);setv('output_mode',1)
        a=shot('feather-zero');setv('feather',12);b=shot('feather-twelve')
        check('soft_edges_change_mask',np.abs(a[:,:,3].astype(int)-b[:,:,3]).sum()>1000)
        # Inspect full output for every animation. Different phases must change actual pixels.
        setv('feather',0);setv('output_mode',2);setv('sync',False);setv('speed',.43)
        for index,name in enumerate(['Static','Pulse','Chase','Breathe','Strobe','Color Flow']):
            setv('g1_fx',index)
            frames=[shot('animation-'+str(index)+'-'+str(j)) for j in range(3)]
            difference=max(int(np.abs(frames[j].astype(int)-frames[0].astype(int)).sum()) for j in range(1,3))
            check('animation_'+name.lower().replace(' ','_'),difference>1000 if index else difference==0,
                  pixel_difference=difference)
        setv('g1_fx',0)
        # Different collection lengths: validate per-group expansion, join ordering and rendering.
        load('mixed-groups',{'g1_slices':'slice_stage_droid','g2_slices':'slice_grid_2x2',
                             'g3_slices':'slice_grid_3x3','g4_slices':'slice_grid_4x4'})
        setv('output_mode',2)
        a=shot('four-groups')
        expanded=[live(f'g{i}_radii_list') for i in range(1,5)]
        radii=live('radii');colors=live('color')
        # Wire returns a bundle object, including value and instance metadata.
        def unpack(value):return value.get('value',value) if isinstance(value,dict) else value
        counts=[len(unpack(v)) for v in expanded];radii=unpack(radii);colors=unpack(colors)
        check('mixed_group_counts',counts==[5,4,9,16],counts=counts)
        check('properties_expand_to_34',isinstance(radii,list) and len(radii)==34 and len(colors)==34,
              radii_count=len(radii),color_count=len(colors),group_colors=[colors[i] for i in [0,5,9,18]])
        for i in [1,3,4]:setv(f'g{i}_enabled',False)
        a=shot('group-two-only');visible=a[a[:,:,3]>200]
        check('group_two_color_isolated',len(visible)>100 and np.median(visible[:,0])>np.median(visible[:,2])*2)
        for dimensions in [(1080,1920),(3840,2160)]:
            load('resolution-'+str(dimensions[0]),resolution=dimensions);setv('output_mode',2)
            a=shot('resolution-'+str(dimensions[0]))
            check('render_'+str(dimensions[0])+'x'+str(dimensions[1]),a[:,:,3].max()==255)
    except Exception:
        REPORT['error']=traceback.format_exc();print(REPORT['error'],flush=True)
    finally:
        w.request('/patch/open',{'path':str(SOURCE)})
        REPORT['pass']='error' not in REPORT and all(c['pass'] for c in REPORT['checks'])
        (ROOT/'evidence/native-qa.json').write_text(json.dumps(REPORT,indent=2)+'\n',encoding='utf-8')
    if not REPORT['pass']:raise SystemExit(1)


if __name__=='__main__':main()
