"""Independent native Wire mesh implementation. No original graph is used as input."""
import json
import pathlib
import time
import uuid
import wire_api as w

ROOT = w.ROOT
NAME = 'Slice Refine Pro by Mizin'
FOLDER = ROOT / 'reconstructed'
SOURCE = FOLDER / NAME / (NAME + '.wire')


def absolute_resources(document, folder):
    """Resolve native resource paths when making a disposable copy elsewhere."""
    for node in document['patch']['nodes'].values():
        for attribute in node.get('attributes',{}).values():
            if attribute.get('type')=='resourceIsf':
                path=attribute['value']['path']['main']
                if path and not pathlib.Path(path).is_absolute():
                    attribute['value']['path']['main']=(folder/path).as_posix()
    return document


class Graph:
    def __init__(self):
        self.cs = w.classes()
        self.ids = {}
        self.nodes = {}
        self.inputs = []
        self.links = {}
        self.step = 0

    def add(self, key, name, category=None, **values):
        choices=[c for c in self.cs if c['name']==name and (category is None or c['category']==category)]
        if not choices:
            choices=[c for c in self.cs if c['name']==name]
        if len(choices)!=1:
            raise ValueError(f'Ambiguous or unavailable native class: {category}/{name}')
        c=choices[0]
        index = self.step
        self.step += 1
        n = w.create(c['id'], (index % 10) * 260, (index // 10) * 270)
        self.ids[key] = n['id']
        self.nodes[key] = n
        for port, value in values.items():
            info=next((p for p in n['inlets'] if p['id']==port),None)
            if info and info['bundle']['data_type'] in ['flow','data_type']:
                continue
            w.value(n['id'], port, value)
        return key

    def port(self, key):
        n = self.nodes[key]
        return n['main_outlet'] or n['outlets'][0]['id']

    def link(self, source, target, inlet, outlet=None):
        endpoint=(self.ids[target],inlet)
        origin=(self.ids[source],outlet or self.port(source))
        if self.links.get(endpoint)==origin:return target
        r = w.connect(origin[0],origin[1],endpoint[0],endpoint[1])
        unexpected=[c for c in r.get('disconnected',[]) if c['target'] != {'node':self.ids[target],'inlet':inlet}]
        if unexpected:
            raise RuntimeError('Unexpected downstream connection removal: ' + json.dumps(r))
        self.links[endpoint]=origin
        return target

    def set(self, key, port, value):
        info=w.request(f'/patch/nodes/{self.ids[key]}/inlets/{port}')
        data_type=info['bundle']['data_type']
        if isinstance(value,(int,float)) and not isinstance(value,bool) and data_type in ['float_2','float_3','float_4']:
            value={k:float(value) for k in 'xyzw'[:int(data_type[-1])]}
        dimensions=info['bundle']['dimensions']
        if dimensions and not isinstance(value,list):
            count=1
            for dimension in dimensions:
                count*=dimension.get('value',len(info.get('value',[])))
            value=[value for _ in range(count)]
        w.value(self.ids[key], port, value)

    def control(self, key, label, kind='Float In', value=0, low=0, high=1, options=None):
        self.add(key, kind, 'Input')
        if kind in ['Float In', 'Int In']:
            self.set(key, 'max', high)
            self.set(key, 'min', low)
        if options:
            self.set(key, 'options-count', len(options))
            for i, option in enumerate(options):
                self.set(key, f'option{i}-label', option)
                self.set(key, f'option{i}-value', i)
        if value is not None:
            self.set(key, 'input', value)
        w.request('/patch/nodes/' + str(self.ids[key]), {'name': label}, 'PATCH')
        self.inputs.append(self.ids[key])
        return key

    def math(self, key, name, left, right=None, constant=None):
        self.add(key, name, 'Math', flow='signal')
        self.link(left, key, 'input0')
        if right is not None:
            self.link(right, key, 'input1')
        elif constant is not None:
            self.set(key, 'input1', constant)
        return key

    def join(self, key, sources):
        self.add(key, 'Join', 'Collection', **{'num-channels': len(sources)})
        for i, source in enumerate(sources):
            self.link(source, key, 'channel' + str(i))
        return key

    def expand(self, key, source, count):
        self.add(key, 'Expand', 'Collection')
        self.link(source, key, 'input')
        self.link(count, key, 'output-size')
        return key

    def save(self):
        w.request('/patch/save', {'overwrite': True})
        (ROOT/'evidence/reconstruction-node-map.json').write_text(json.dumps(self.ids,indent=2)+'\n',encoding='utf-8')


def blank(destination=SOURCE,name=NAME,resolution=(1920,1080)):
    # This scaffold is a native, newly created probe, not the extracted plugin.
    p = ROOT/'evidence/probes/Mesh Corners Probe/Mesh Corners Probe.wire'
    d = json.loads(p.read_text(encoding='utf-8-sig'))
    d['patch']['nodes'] = {}
    d['patch']['connections'] = []
    d['patch']['inputOrder'] = []
    d['patch']['nextNodeId'] = 1
    m = d['patch']['meta']
    m.update({'displayName': name, 'description': 'Mesh slice refinement with independent pixel corners and group animation.',
              'author':'Mizin', 'vendor':'Mizin', 'mail':'', 'url':'', 'licenseName':'', 'category':'effect',
              'identifier':str(uuid.uuid5(uuid.NAMESPACE_URL,'mizin.local/slice-refine-pro')),
              'resolution':{'width':resolution[0],'height':resolution[1]}})
    m.pop('publisher', None)
    d['ui']['deviceConnections'] = {'input':{}}
    d['ui']['monitors'] = []
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
    w.request('/patch/open', {'path':str(destination)})


def build():
    blank()
    g = Graph()
    g.control('video','Video',kind='Texture In',value=None)
    g.add('info','Patch Info')
    g.add('res','Unpack')
    g.link('info','res','input','resolution')
    g.add('pixel','Divide','Math',flow='signal',input0=2.0)
    g.link('res','pixel','input1','output1')
    groups = []
    props = {key:[] for key in ['radii','stroke','inset','color','opacity','phase','fx','enabled']}
    defaults = [(0.1,0.8,1.0),(1.0,0.3,0.1),(0.7,0.2,1.0),(0.2,1.0,0.4)]
    for i in range(1,5):
        prefix=f'g{i}_'
        def control(key,label,**args):
            return g.control(prefix+key, f'G{i} {label}', **args)
        s=control('slices','Slices',kind='Slice In',value=None)
        groups.append(s)
        g.add(prefix+'count','Size','Collection')
        g.link(s,prefix+'count','container')
        count=prefix+'count'
        control('enabled','Enabled',kind='Bool In',value=True)
        # Wire's Bool Switch uses input0 for true and input1 for false.
        g.add(prefix+'enabled_scale','Switch','Logic',input0=1.0,input1=0.0)
        g.link(prefix+'enabled',prefix+'enabled_scale','selection')
        for key,label in [('tl','Top Left px'),('tr','Top Right px'),('bl','Bottom Left px'),('br','Bottom Right px')]:
            control(key,label,value=80.0,high=1000)
        g.add(prefix+'radii','Float4','Math')
        for port,key in [('input0','tr'),('input1','tl'),('input2','bl'),('input3','br')]:
            g.link(prefix+key,prefix+'radii',port)
        control('stroke','Stroke px',value=8.0,high=200)
        control('inset','Inset px',value=0.0,low=-500,high=500)
        control('opacity','Opacity',value=1.0)
        r,b,c=defaults[i-1]
        control('color','Color',kind='Color In',value={'r':r,'g':b,'b':c,'a':1})
        control('phase','Phase',value=(i-1)*0.25)
        control('fx','Animation',kind='Int In',value=0,high=5,
                options=['Static','Pulse','Chase','Breathe','Strobe','Color Flow'])
        for key in props:
            source=prefix+'enabled_scale' if key=='enabled' else prefix+key
            props[key].append(g.expand(prefix+key+'_list',source,count))
    g.join('slices',groups)
    for key,sources in props.items():g.join(key,sources)
    g.add('slice_info','Slice Info')
    g.link('slices','slice_info','input')
    g.add('dimensions','Unpack')
    g.link('slice_info','dimensions','input','dimension')
    g.math('inset2','Multiply','inset',constant=2.0)
    for axis,port in [('width','output0'),('height','output1')]:
        g.add(axis+'_px','Subtract','Math',flow='signal')
        g.link('dimensions',axis+'_px','input0',port)
        g.link('inset2',axis+'_px','input1')
        g.add(axis+'_clamp','Clamp','Math')
        g.link(axis+'_px',axis+'_clamp','value')
        g.set(axis+'_clamp','min',0.0)
        g.set(axis+'_clamp','max',1000000.0)
        g.math(axis,'Multiply',axis+'_clamp','pixel')
    g.add('centers','Multiply','Math',flow='signal')
    g.link('slice_info','centers','input0','center')
    g.link('pixel','centers','input1')
    g.math('radius_world','Multiply','radii','pixel')
    g.math('stroke_world','Multiply','stroke','pixel')
    g.add('transform','Transformation 2D')
    g.link('centers','transform','translation')
    g.link('slice_info','transform','rotation','rotation')
    g.link('enabled','transform','scale')
    g.add('outer','Rectangle','2D',corner_resolution=16)
    g.link('width','outer','width'); g.link('height','outer','height')
    g.link('radius_world','outer','corner_radius')
    g.add('outer_mesh','Mesh 2D')
    g.link('outer','outer_mesh','geometry')
    g.link('transform','outer_mesh','transformation')
    g.link('color','outer_mesh','material')
    g.add('camera','Camera 2D')
    g.add('outer_render','2D Render')
    g.link('outer_mesh','outer_render','mesh')
    g.link('camera','outer_render','camera')
    g.add('out','Texture Out')
    g.link('outer_render','out','input')
    g.save()
    # Preview devices belong to the new patch's UI only; host slice binding stays exposed.
    d=json.loads(SOURCE.read_text(encoding='utf-8'))
    d['ui']['deviceConnections']['input']={str(g.ids['video']):'Test Card',str(g.ids['g1_slices']):'slice_stage_droid'}
    SOURCE.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
    w.request('/patch/open',{'path':str(SOURCE)})
    time.sleep(0.5)
    print(w.snapshot(g.ids['outer_render'],g.port('outer_render'),'reconstruction-mesh-stage.png'))
    print(json.dumps({'source':str(SOURCE),'nodes':len(g.ids)},indent=2))


if __name__=='__main__':build()
