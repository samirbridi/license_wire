"""Compare equivalent native mesh/SDF scenes; device GPU usage is not a FPS metric."""
import json
import math
import pathlib
import statistics
import subprocess
import time
import numpy as np
from PIL import Image
from build_graph import Graph,ROOT,SOURCE,blank
import wire_api as w

SMI=r'C:\Windows\System32\nvidia-smi.exe'

def scene(count,kind,width=3840,height=2160,probe=False):
    folder=ROOT/'evidence/benchmarks'
    path=folder/f'isolated-{kind}-{count}.wire'
    blank(path,f'Core comparison {count}',(width,height))
    g=Graph()
    g.add('points','Float2','Math',instances=count)
    side=math.ceil(math.sqrt(count))
    xs=[];ys=[]
    for i in range(count):
        xs.append(-1.5+3.0*(i%side)/(side-1) if side>1 else 0.0)
        ys.append(-.83+1.66*(i//side)/(side-1) if side>1 else 0.0)
    g.set('points','input0',xs if count>1 else xs[0]);g.set('points','input1',ys if count>1 else ys[0])
    rw,rh,r=(1.0,.5,.15) if probe else (2.5/side,1.35/side,.22*1.35/side)
    g.add('white','Color',input0={'r':1,'g':1,'b':1,'a':1})
    if kind=='mesh':
        g.add('mesh_rect','Rectangle','2D',width=rw,height=rh,corner_radius=dict.fromkeys('xyzw',r),corner_resolution=16)
        g.add('transform','Transformation 2D');g.link('points','transform','translation')
        g.add('mesh','Mesh 2D');g.link('mesh_rect','mesh','geometry')
        g.link('transform','mesh','transformation');g.link('white','mesh','material')
        g.add('camera','Camera 2D');g.add('mesh_render','2D Render')
        g.link('mesh','mesh_render','mesh');g.link('camera','mesh_render','camera')
    else:
        g.add('sdf_rect','Rectangle','Shape',width=rw,height=rh,round=dict.fromkeys('xyzw',4*r/(rw+rh)))
        g.add('sdf_transform','Transform');g.link('sdf_rect','sdf_transform','input')
        g.link('points','sdf_transform','translation')
        g.add('sdf_render','Shape Render');g.link('sdf_transform','sdf_render','shape')
        g.link('white','sdf_render','material')
    g.add('out','Texture Out');g.link(kind+'_render','out','input')
    w.request('/patch/save',{'overwrite':True})
    return g,path

def gpu():
    text=subprocess.check_output([SMI,'--query-gpu=utilization.gpu,utilization.memory,memory.used','--format=csv,noheader,nounits'],text=True).strip()
    a,b,c=map(float,text.splitlines()[0].split(','))
    return {'gpu_device_percent':a,'memory_controller_percent':b,'device_memory_mib':c}

def measure(g,kind,count,repeat):
    g.link(kind+'_render','out','input')
    time.sleep(.6)
    path=w.snapshot(g.ids[kind+'_render'],'output0',f'benchmarks/isolated-{kind}-{count}-{repeat}.png')
    time.sleep(2.0)
    samples=[]
    for _ in range(5):
        samples.append(gpu());time.sleep(1.0)
    result={'kind':kind,'slices':count,'repeat':repeat,'samples':samples,
            'gpu_device_median_percent':statistics.median(s['gpu_device_percent'] for s in samples),'snapshot':path}
    print(json.dumps({k:v for k,v in result.items() if k!='samples'}),flush=True)
    return result

def main():
    results=[]
    report={'resolution':[3840,2160], 'metric':'whole-device NVIDIA utilization, not per-process GPU time or FPS',
            'scope':'equivalent core rounded rectangles only; excludes complete plugin effects, slices binding and host playback',
            'samples':results}
    try:
        for kind in ['mesh','sdf']:
            g,path=scene(1,kind,1920,1080,True)
            g.link(kind+'_render','out','input');time.sleep(.5)
            w.snapshot(g.ids[kind+'_render'],'output0',f'benchmarks/radius-{kind}.png')
        a=np.array(Image.open(ROOT/'evidence/benchmarks/radius-mesh.png').convert('RGBA'))
        b=np.array(Image.open(ROOT/'evidence/benchmarks/radius-sdf.png').convert('RGBA'))
        mask_a=a[:,:,3]>127;mask_b=b[:,:,3]>127
        report['radius_probe_iou']=float((mask_a & mask_b).sum()/(mask_a | mask_b).sum())
        report['radius_formula']='sdf round = 4*physical_radius/(width+height), verified by image overlap'
        print(json.dumps({'radius_probe_iou':report['radius_probe_iou']}),flush=True)
        for count in [16,64,144]:
            for repeat,order in [(1,['sdf','mesh']),(2,['mesh','sdf'])]:
                for kind in order:
                    g,path=scene(count,kind)
                    results.append(measure(g,kind,count,repeat))
            (ROOT/'evidence/core-benchmark.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    finally:
        (ROOT/'evidence/core-benchmark.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
        w.request('/patch/open',{'path':str(SOURCE)})

if __name__=='__main__':main()
