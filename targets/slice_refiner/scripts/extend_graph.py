"""Add independently designed composition, corner limits, and group animations."""
import json
import time
from build_graph import Graph, ROOT, SOURCE
import wire_api as w


def resume():
    w.request('/patch/open',{'path':str(SOURCE)})
    g=Graph()
    g.ids=json.loads((ROOT/'evidence/reconstruction-node-map.json').read_text())
    nodes={n['id']:n for n in w.request('/patch/nodes?limit=2000')['items']}
    g.nodes={key:nodes[i] for key,i in g.ids.items()}
    g.links={(c['target']['node'],c['target']['inlet']):(c['source']['node'],c['source']['outlet'])
             for c in w.request('/patch/connections?limit=10000')['items']}
    g.step=len(nodes)
    return g


def choose(g,key,selection,cases):
    g.add(key,'Switch','Logic',**{'input-size':len(cases)})
    g.link(selection,key,'selection')
    # A Bool selector means input0=True, input1=False in Wire.
    for i,value in enumerate(cases):
        if isinstance(value,str):g.link(value,key,'input'+str(i))
        else:g.set(key,'input'+str(i),value)
    return key


def discrete_controls(g):
    if 'segments' not in g.ids:
        g.control('segments','Corner Segments',kind='Int In',value=16,low=3,high=64)
    g.save()
    d=json.loads(SOURCE.read_text(encoding='utf-8'))
    values={}
    keys=['segments','output_mode','sync']+[f'g{i}_fx' for i in range(1,5)]
    keys += [key for key in ['merge_edges','black_bg'] if key in g.ids]
    for key in keys:
        n=d['patch']['nodes'][str(g.ids[key])]
        values[key]=n.get('constants',{}).get('input',n['attributes'].get('input'))['value']
        n['attributes']['flow']['value']='attribute'
        # Attribute-flow input values belong in attributes, not constants.
        if 'input' in n.get('constants',{}):
            n['attributes']['input']=n['constants'].pop('input')
    SOURCE.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
    w.request('/patch/open',{'path':str(SOURCE)})
    for key,value in values.items():g.set(key,'input',value)
    g.link('segments','outer','corner_resolution');g.link('segments','inner','corner_resolution')
    g.save()


def extend():
    g=resume()
    if 'final' in g.ids:raise RuntimeError('Graph already extended; rebuild the base before extending')
    # Constant-pixel radii, including degenerate and very small slices.
    g.add('width_less','Less','Math')
    g.link('width','width_less','input0');g.link('height','width_less','input1')
    choose(g,'small_side','width_less',['width','height'])
    g.math('half_side','Multiply','small_side',constant=0.5)
    g.add('radii_clamp','Clamp','Math')
    g.link('radius_world','radii_clamp','value');g.link('half_side','radii_clamp','max')
    g.set('radii_clamp','min',0.0)
    g.link('radii_clamp','outer','corner_radius')

    # One phase clock; collection math supplies distinct phases without N clocks.
    g.control('sync','BPM Sync',kind='Bool In',value=True)
    g.control('speed','Speed Hz',value=0.5,high=8)
    g.control('beat_div','BPM Multiplier',value=0.25,low=0.03125,high=8)
    g.control('amount','Motion Amount',value=0.8)
    g.control('color_b','Color B',kind='Color In',value={'r':1,'g':0.15,'b':0.5,'a':1})
    g.add('transport','Transport Info')
    g.add('bpm_hz','Bpm to Frequency')
    g.link('transport','bpm_hz','input0','bpm')
    g.math('bpm_rate','Multiply','bpm_hz','beat_div')
    choose(g,'clock_rate','sync',['bpm_rate','speed'])
    g.add('clock','Saw Oscillator',unipolar=True)
    g.link('clock_rate','clock','frequency')
    g.add('global_sin','Sin','Math',**{'normalized-input':True})
    g.link('clock','global_sin','input0')
    g.math('pulse_half','Multiply','global_sin',constant=0.5)
    g.math('pulse','Add','pulse_half',constant=0.5)
    g.add('indices','Indices','Collection');g.link('slices','indices','input0')
    g.add('slice_count','Size','Collection');g.link('slices','slice_count','container')
    g.add('count_clamp','Clamp','Math');g.link('slice_count','count_clamp','value')
    g.set('count_clamp','min',1);g.set('count_clamp','max',1000000)
    g.math('index_phase','Divide','indices','count_clamp')
    g.math('phase_offset','Add','index_phase','phase')
    g.math('slice_phase','Add','clock','phase_offset')
    g.add('slice_sin','Sin','Math',**{'normalized-input':True})
    g.link('slice_phase','slice_sin','input0')
    g.math('chase_half','Multiply','slice_sin',constant=0.5)
    g.math('chase','Add','chase_half',constant=0.5)
    g.add('strobe_bool','Less','Math',input1=0.5);g.link('clock','strobe_bool','input0')
    choose(g,'strobe','strobe_bool',[1.0,0.0])
    choose(g,'brightness','fx',[1.0,'pulse','chase',1.0,'strobe',1.0])
    g.add('amount_floor','Subtract','Math',input0=1.0);g.link('amount','amount_floor','input1')
    g.math('scaled_brightness','Multiply','brightness','amount')
    g.math('brightness_range','Add','scaled_brightness','amount_floor')
    g.math('stroke_opacity','Multiply','brightness_range','opacity')
    # Breathe remains inside the original slice footprint by default.
    g.math('breath_depth','Multiply','amount',constant=0.2)
    g.add('breath_floor','Subtract','Math',input0=1.0);g.link('breath_depth','breath_floor','input1')
    g.math('breath_wave','Multiply','pulse','breath_depth')
    g.math('breath_scale','Add','breath_wave','breath_floor')
    choose(g,'scale_modes','fx',[1.0,1.0,1.0,'breath_scale',1.0,1.0])
    g.math('animated_scale','Multiply','enabled','scale_modes')
    g.link('animated_scale','transform','scale')
    g.add('color_wave','Cross Fader');g.link('color','color_wave','input1')
    g.link('color_b','color_wave','input2');g.link('chase','color_wave','mix')
    g.add('is_color_flow','Equal','Math',input1=5);g.link('fx','is_color_flow','input0')
    choose(g,'stroke_colors','is_color_flow',['color_wave','color'])
    g.add('stroke_material','Cross Fader');g.link('stroke_colors','stroke_material','input2')
    g.set('stroke_material','input1',{'r':0,'g':0,'b':0,'a':0})
    g.link('stroke_opacity','stroke_material','mix')
    g.add('white','Color',input0={'r':1,'g':1,'b':1,'a':1})
    g.link('white','outer_mesh','material')
    g.add('stroke_mesh','Mesh 2D');g.link('outer','stroke_mesh','geometry')
    g.link('transform','stroke_mesh','transformation');g.link('stroke_material','stroke_mesh','material')
    g.add('stroke_render','2D Render');g.link('stroke_mesh','stroke_render','mesh')
    g.link('camera','stroke_render','camera')

    g.math('stroke2','Multiply','stroke_world',constant=2.0)
    for axis in ['width','height']:
        g.math('inner_'+axis+'_unclamped','Subtract',axis,'stroke2')
        g.add('inner_'+axis,'Clamp','Math')
        g.link('inner_'+axis+'_unclamped','inner_'+axis,'value')
        g.set('inner_'+axis,'min',0.0);g.set('inner_'+axis,'max',1000000.0)
    g.math('inner_radii_raw','Subtract','radii_clamp','stroke_world')
    g.add('inner_radii','Clamp','Math');g.link('inner_radii_raw','inner_radii','value')
    g.set('inner_radii','min',0.0);g.set('inner_radii','max',1000000.0)
    g.add('inner','Rectangle','2D',corner_resolution=16)
    g.link('inner_width','inner','width');g.link('inner_height','inner','height')
    g.link('inner_radii','inner','corner_radius')
    g.add('inner_mesh','Mesh 2D');g.link('inner','inner_mesh','geometry')
    g.link('transform','inner_mesh','transformation');g.link('white','inner_mesh','material')
    g.add('inner_render','2D Render');g.link('inner_mesh','inner_render','mesh')
    g.link('camera','inner_render','camera')
    g.add('ring','Mask',channel=4,invert=True)
    g.link('stroke_render','ring','input');g.link('inner_render','ring','mask')
    # Original slice footprint is kept independent of animated/inset geometry.
    g.add('raw_dims','Multiply','Math');g.link('slice_info','raw_dims','input0','dimension')
    g.link('pixel','raw_dims','input1')
    g.add('raw_unpacked','Unpack');g.link('raw_dims','raw_unpacked','input')
    g.add('raw_rect','Rectangle','2D');g.link('raw_unpacked','raw_rect','width','output0')
    g.link('raw_unpacked','raw_rect','height','output1')
    g.add('raw_transform','Transformation 2D');g.link('centers','raw_transform','translation')
    g.link('slice_info','raw_transform','rotation','rotation');g.link('enabled','raw_transform','scale')
    g.add('raw_mesh','Mesh 2D');g.link('raw_rect','raw_mesh','geometry')
    g.link('raw_transform','raw_mesh','transformation');g.link('white','raw_mesh','material')
    g.add('raw_render','2D Render');g.link('raw_mesh','raw_render','mesh')
    g.link('camera','raw_render','camera')

    g.control('feather','Soft Edges px',value=0.0,high=100)
    g.add('feather_distance','Float2','Math');g.link('feather','feather_distance','input0')
    g.link('feather','feather_distance','input1')
    g.add('feather_zero','Equal','Math',input1=0.0);g.link('feather','feather_zero','input0')
    g.add('soft_mask','Pixel Blur',sampleInterval=1.0)
    g.link('outer_render','soft_mask','input');g.link('feather_distance','soft_mask','distance')
    g.link('feather_zero','soft_mask','bypass')
    g.math('cutout_raw','Subtract','raw_render','soft_mask')
    g.add('cutouts','Clamp','Math');g.link('cutout_raw','cutouts','value')
    g.set('cutouts','min',0.0);g.set('cutouts','max',1.0)
    g.add('refined','Mask',channel=4,invert=True)
    g.link('video','refined','input');g.link('cutouts','refined','mask')
    g.add('inside','Mask',channel=4);g.link('video','inside','input')
    g.link('soft_mask','inside','mask')
    g.join('refine_layers',['refined','ring']);g.add('refine_merge','Merge')
    g.link('refine_layers','refine_merge','input0')
    g.join('inside_layers',['inside','ring']);g.add('inside_merge','Merge')
    g.link('inside_layers','inside_merge','input0')
    g.control('output_mode','Output',kind='Int In',value=0,high=2,
              options=['Refine + Stroke','Inside Slices','Outline Only'])
    choose(g,'final','output_mode',['refine_merge','inside_merge','ring'])
    g.link('final','out','input')
    discrete_controls(g)
    time.sleep(.5)
    print(w.snapshot(g.ids['final'],g.port('final'),'reconstruction-composed.png'))
    print(json.dumps({'nodes':len(g.ids),'source':str(SOURCE)},indent=2))


if __name__=='__main__':extend()
