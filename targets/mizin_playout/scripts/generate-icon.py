"""Rasterize the existing original approved brand geometry for Windows resources.

Pillow is a build-time tool only. Geometry/colors match src/brand.hpp; no generated
proposal or existing artwork is modified. Run before committing the ICO asset.
"""
from pathlib import Path
from PIL import Image, ImageDraw

size = 1024
image = Image.new('RGBA', (size, size))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((0, 0, size-1, size-1), radius=size*.18, fill='#061525')
def points(coords):
    return [(size*(.12+.76*x/100), size*(.12+.76*y/100)) for x,y in coords]
mask = Image.new('L', image.size)
ImageDraw.Draw(mask).polygon(points([(6,5),(50,30),(94,5),(94,90),(76,80),(76,33),(50,48),(24,33),(24,80),(6,90)]), fill=255)
gradient = Image.new('RGBA', image.size)
pixels = gradient.load()
for y in range(size):
    for x in range(size):
        px=(x/size-.12)/.76*100; py=(y/size-.12)/.76*100
        t=max(0,min(1,((px-5)*90+(py-15)*75)/(90**2+75**2)))
        pixels[x,y]=(0,round(232+(174-232)*t),round(237+(186-237)*t),255)
image.paste(gradient, (0,0), mask)
ImageDraw.Draw(image).polygon(points([(39,52),(68,69),(39,86)]), fill='#00dbe4')
output=Path(__file__).resolve().parents[1]/'reconstructed/assets/mizin-playout.ico'
output.parent.mkdir(parents=True, exist_ok=True)
image.resize((256,256),Image.Resampling.LANCZOS).save(output, sizes=[(n,n) for n in (16,24,32,48,64,128,256)])
print(output)
