"""Make zero-width stroke exactly transparent, including antialiased boundaries."""
from extend_graph import resume,choose


def main():
    g=resume()
    if 'stroke_positive' not in g.ids:
        g.add('stroke_positive','Greater','Math',input1=0.0)
        g.link('stroke','stroke_positive','input0')
        choose(g,'stroke_visible','stroke_positive',[1.0,0.0])
        g.math('visible_stroke_opacity','Multiply','stroke_opacity','stroke_visible')
        g.link('visible_stroke_opacity','stroke_material','mix')
        g.save()


if __name__=='__main__':main()
