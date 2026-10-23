"""Convenience controls and an explicit individual-edge compatibility path."""
import json
import time
from extend_graph import resume,choose,discrete_controls
from build_graph import ROOT
import wire_api as w


def refine():
    g=resume()
    if 'merge_edges' in g.ids:raise RuntimeError('Refinements already installed')
    for i in range(1,5):
        key=f'g{i}_corner_scale'
        g.control(key,f'G{i} Corner Scale',value=1.0,high=2.0)
        g.math(f'g{i}_scaled_radii','Multiply',f'g{i}_radii',key)
        g.link(f'g{i}_scaled_radii',f'g{i}_radii_list','input')
    # SDF is retained as an explicit alternative when internal overlapping edges
    # must remain visible. The default merged path uses the faster mesh geometry.
    g.control('merge_edges','Merge Edges',kind='Bool In',value=True)
    g.add('radius_components','Unpack');g.link('radii_clamp','radius_components','input')
    g.add('sdf_radii_order','Float4','Math')
    for port,out in [('input0','output3'),('input1','output0'),('input2','output2'),('input3','output1')]:
        g.link('radius_components','sdf_radii_order',port,out)
    g.math('perimeter_half','Add','width','height')
    g.add('radius_denominator','Clamp','Math');g.link('perimeter_half','radius_denominator','value')
    g.set('radius_denominator','min',0.000001);g.set('radius_denominator','max',1000000.0)
    g.math('sdf_radii4','Multiply','sdf_radii_order',constant=4.0)
    g.math('sdf_radii','Divide','sdf_radii4','radius_denominator')
    g.add('sdf_rect','Rectangle','Shape');g.link('width','sdf_rect','width')
    g.link('height','sdf_rect','height');g.link('sdf_radii','sdf_rect','round')
    g.add('sdf_edge','Edge',mode=0);g.link('sdf_rect','sdf_edge','input')
    g.link('stroke_world','sdf_edge','thickness')
    g.add('sdf_transform','Transform');g.link('sdf_edge','sdf_transform','input')
    g.link('centers','sdf_transform','translation');g.link('animated_scale','sdf_transform','scale')
    g.link('slice_info','sdf_transform','rotation','rotation')
    g.add('valid_slice','Greater','Math',input1=0.0);g.link('half_side','valid_slice','input0')
    choose(g,'valid_alpha','valid_slice',[1.0,0.0])
    g.math('active_alpha','Multiply','valid_alpha','enabled')
    g.add('sdf_material','Cross Fader');g.link('stroke_material','sdf_material','input2')
    g.set('sdf_material','input1',{'r':0,'g':0,'b':0,'a':0})
    g.link('active_alpha','sdf_material','mix')
    g.add('individual_edges','Shape Render',antialiasing=1.0)
    g.link('sdf_transform','individual_edges','shape');g.link('sdf_material','individual_edges','material')
    choose(g,'stroke_choice','merge_edges',['ring','individual_edges'])
    g.link('stroke_choice','refine_layers','channel1')
    g.link('stroke_choice','inside_layers','channel1')
    g.link('stroke_choice','final','input2')
    g.control('black_bg','Black Background',kind='Bool In',value=False)
    g.add('background','Solid Color',color={'r':0,'g':0,'b':0,'a':1})
    g.join('background_layers',['background','final']);g.add('background_merge','Merge')
    g.link('background_layers','background_merge','input0')
    choose(g,'display','black_bg',['background_merge','final'])
    g.link('display','out','input')
    discrete_controls(g)
    time.sleep(.5)
    print(w.snapshot(g.ids['display'],g.port('display'),'reconstruction-refined.png'))
    print(json.dumps({'nodes':len(g.ids)},indent=2))

if __name__=='__main__':refine()
