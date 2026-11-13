"""Generate the approved CRISPIX visual study; does not modify plugin files."""
from pathlib import Path
import zipfile
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'crispix-identidade'
OUT.mkdir(exist_ok=True)
# Geometry follows the approved reduced mark, not the discarded large diaphragm.
MARK='<rect width="86" height="86" rx="20" fill="#1D2C35"/><path d="M60 23 A26 26 0 1 0 62 62" fill="none" stroke="#EEF6F8" stroke-width="8"/><path d="M61 31 L68 38 L61 45 L54 38 Z" fill="#42D9E8"/>'
def svg(name,body,w,h):
    text=f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="CRISPIX">{body}</svg>'
    (OUT/name).write_text(text,encoding='utf-8')
svg('crispix-icone.svg',MARK,86,86)
for mode,bg,fg in [('escuro','#10191F','#EEF6F8'),('claro','#F3F7F8','#1D2C35')]:
    svg(f'crispix-logo-{mode}.svg',f'<rect width="660" height="180" fill="{bg}"/><g transform="translate(35 32) scale(1.35)">{MARK}</g><text x="185" y="111" fill="{fg}" font-family="Segoe UI,Arial,sans-serif" font-size="65" font-weight="600" letter-spacing="4">CRISPIX</text>',660,180)
svg('crispix-simbolo-transparente.svg',MARK.replace('<rect width="86" height="86" rx="20" fill="#1D2C35"/>','').replace('#EEF6F8','#1D2C35'),86,86)
for size in [32,64,128,256,512,1024]:
    scale=8; dim=size*scale; k=dim/86
    im=Image.new('RGBA',(dim,dim));d=ImageDraw.Draw(im)
    def box(values):return tuple(round(v*k) for v in values)
    d.rounded_rectangle((0,0,dim-1,dim-1),radius=round(20*k),fill='#1D2C35')
    # Circular C with flat terminals; close visual match to approved SVG.
    d.arc(box((15,14,71,70)),start=43,end=308,fill='#EEF6F8',width=round(8*k))
    d.polygon([(round(x*k),round(y*k)) for x,y in [(61,31),(68,38),(61,45),(54,38)]],fill='#42D9E8')
    im.resize((size,size),Image.Resampling.LANCZOS).save(OUT/f'crispix-icone-{size}.png')
Image.open(OUT/'crispix-icone-256.png').save(OUT/'crispix.ico',sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
svg('crispix-aprovacao.svg',f'''<rect width="1200" height="840" fill="#10191F"/>
<text x="64" y="65" fill="#91A9B5" font-family="Segoe UI,Arial,sans-serif" font-size="16" letter-spacing="4">CRISPIX / IDENTIDADE APROVADA</text>
<g transform="translate(85 135) scale(2.5)">{MARK}</g>
<text x="365" y="260" fill="#EEF6F8" font-family="Segoe UI,Arial,sans-serif" font-size="96" font-weight="600" letter-spacing="6">CRISPIX</text>
<text x="370" y="303" fill="#91A9B5" font-family="Segoe UI,Arial,sans-serif" font-size="18" letter-spacing="4">SEU OLHAR. SUA EDIÇÃO.</text>
<rect x="64" y="412" width="1072" height="170" rx="20" fill="#F3F7F8"/>
<g transform="translate(90 445)">{MARK}</g><text x="205" y="507" fill="#1D2C35" font-family="Segoe UI,Arial,sans-serif" font-size="52" font-weight="600" letter-spacing="4">CRISPIX</text>
<g transform="translate(790 450) scale(.75)">{MARK}</g><g transform="translate(900 460) scale(.5)">{MARK}</g><g transform="translate(990 467) scale(.37)">{MARK}</g>
<text x="64" y="638" fill="#91A9B5" font-family="Segoe UI,Arial,sans-serif" font-size="16">PALETA</text>
<rect x="64" y="660" width="235" height="58" rx="12" fill="#1D2C35"/><text x="84" y="697" fill="#EEF6F8" font-family="Arial" font-size="20">Grafite · #1D2C35</text>
<rect x="320" y="660" width="235" height="58" rx="12" fill="#42D9E8"/><text x="340" y="697" fill="#10191F" font-family="Arial" font-size="20">Ciano · #42D9E8</text>
<rect x="576" y="660" width="235" height="58" rx="12" fill="#EEF6F8"/><text x="596" y="697" fill="#10191F" font-family="Arial" font-size="20">Gelo · #EEF6F8</text>
<text x="64" y="790" fill="#91A9B5" font-family="Segoe UI,Arial,sans-serif" font-size="16">Kit visual independente · Sem alteração no plugin · Símbolo vetorial mestre em SVG</text>''',1200,840)
(OUT/'LEIA-ME.txt').write_text('CRISPIX — kit visual aprovado\n\nReferencia: C aberto branco, losango ciano e base grafite arredondada.\nSVG e o mestre vetorial. PNG/ICO sao rasterizacoes aproximadas da mesma geometria; conferir antes de uso final.\nLogotipos usam Segoe UI com fallback Arial, nao curvas vetoriais.\nIcone: SVG e PNG 32/64/128/256/512/1024. ICO multirresolucao.\nPaleta: #1D2C35, #42D9E8, #EEF6F8; fundo #10191F.\nAssinatura opcional: Seu olhar. Sua edicao.\nNao aplicado ao plugin. Nao implica verificacao de disponibilidade de marca.\n',encoding='utf-8')
with zipfile.ZipFile(ROOT/'CRISPIX-identidade.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.iterdir()):z.write(p,'CRISPIX-identidade/'+p.name)
print(OUT)
