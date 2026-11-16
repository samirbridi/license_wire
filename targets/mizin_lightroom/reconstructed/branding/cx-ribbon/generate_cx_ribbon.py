"""Generate the CRISPIX "CX Ribbon Core" brand kit.

Outputs (kit/):
  svg/   master vectors - symbol, horizontal logo, app icon, favicon (transparent where applicable)
  png/   Chrome-rendered rasters with alpha, app icon sizes, social card, plugin header candidate
  crispix.ico, LEIA-ME.txt and CRISPIX-identidade-cx.zip

The wordmark is Montserrat Bold converted to outlines, so no SVG depends on an installed font.
Run:  python generate_cx_ribbon.py
"""
from __future__ import annotations

import os
import shutil
import sys
import zipfile
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cx_geometry as g  # noqa: E402

ROOT = Path(__file__).resolve().parent
KIT = ROOT / 'kit'
SVG_DIR, PNG_DIR = KIT / 'svg', KIT / 'png'

# Palette from the approved brand sheet (Modelo 1)
NAVY, BLUE, CYAN, WHITE = '#0B1A35', '#0A6BFF', '#00E5FF', '#FFFFFF'
INK = '#050B18'            # darkest background used behind the colour mark

FONT_CANDIDATES = [
    os.environ.get('CRISPIX_WORDMARK_FONT', ''),
    os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'Windows', 'Fonts', 'Montserrat-Bold.ttf'),
    r'C:\Windows\Fonts\Montserrat-Bold.ttf',
]


# ---------------------------------------------------------------- symbol

def symbol_defs(p: str) -> str:
    """Gradients of the colour symbol, in symbol units (userSpaceOnUse). p = id prefix."""
    return f'''
    <linearGradient id="{p}c" gradientUnits="userSpaceOnUse" x1="60" y1="0" x2="300" y2="690">
      <stop offset="0" stop-color="{CYAN}"/><stop offset=".38" stop-color="#00CBFF"/><stop offset=".74" stop-color="#0A8BFF"/><stop offset="1" stop-color="#0A5CF2"/>
    </linearGradient>
    <linearGradient id="{p}t" gradientUnits="userSpaceOnUse" x1="500" y1="0" x2="840" y2="320">
      <stop offset="0" stop-color="#0A5CF2" stop-opacity="0"/><stop offset="1" stop-color="#0646D6" stop-opacity=".72"/>
    </linearGradient>
    <radialGradient id="{p}f" gradientUnits="userSpaceOnUse" cx="215" cy="500" r="250">
      <stop offset="0" stop-color="#04239A" stop-opacity=".85"/><stop offset=".55" stop-color="#0530B4" stop-opacity=".35"/><stop offset="1" stop-color="#0530B4" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="{p}r" gradientUnits="userSpaceOnUse" x1="363" y1="648" x2="1120" y2="0">
      <stop offset="0" stop-color="#0A8FFF"/><stop offset=".22" stop-color="#00D2FF"/><stop offset=".6" stop-color="{CYAN}"/><stop offset="1" stop-color="#16C2FF"/>
    </linearGradient>
    <linearGradient id="{p}b" gradientUnits="userSpaceOnUse" x1="600" y1="360" x2="1150" y2="660">
      <stop offset="0" stop-color="#0436C4"/><stop offset=".45" stop-color="#0A5AF4"/><stop offset="1" stop-color="{BLUE}"/>
    </linearGradient>
    <linearGradient id="{p}e" gradientUnits="userSpaceOnUse" x1="363" y1="648" x2="960" y2="270">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/><stop offset=".55" stop-color="#E6FDFF" stop-opacity=".75"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".2"/>
    </linearGradient>
    <clipPath id="{p}a"><path d="{g.piece_a(0)}" clip-rule="evenodd"/></clipPath>'''


def symbol_colour(p: str) -> str:
    """Colour symbol: B underneath, A (C + ribbon) on top, no gap - the twist reads by colour."""
    a = g.piece_a(0)
    b = g.piece_b(-8)          # tucked under A so no seam shows
    G = g.s_curve()
    edge = f'M{g.fmt(G[0])}C{g.fmt(G[1])} {g.fmt(G[2])} {g.fmt(G[3])}'
    return f'''
    <path d="{b}" fill="url(#{p}b)"/>
    <path d="{a}" fill="url(#{p}c)" fill-rule="evenodd"/>
    <g clip-path="url(#{p}a)">
      <path d="{a}" fill="url(#{p}t)" fill-rule="evenodd"/>
      <path d="{a}" fill="url(#{p}f)" fill-rule="evenodd"/>
      <path d="{g.ribbon()}" fill="url(#{p}r)"/>
      <path d="{edge}" fill="none" stroke="url(#{p}e)" stroke-width="5"/>
    </g>'''


def symbol_mono(colour: str) -> str:
    a, b = g.pieces()
    return f'<path d="{a}" fill="{colour}" fill-rule="evenodd"/><path d="{b}" fill="{colour}"/>'


# ---------------------------------------------------------------- wordmark

def load_font() -> TTFont:
    for path in FONT_CANDIDATES:
        if path and os.path.exists(path):
            return TTFont(path)
    raise SystemExit('Montserrat-Bold.ttf not found; set CRISPIX_WORDMARK_FONT')


def glyph_path(font, char, scale, x, baseline):
    gs = font.getGlyphSet()
    name = font.getBestCmap()[ord(char)]
    pen = SVGPathPen(gs, ntos=lambda v: f'{round(v, 2):g}')
    gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
    return pen.getCommands(), font['hmtx'][name][0] * scale


CAP_RATIO = 0.5            # cap height / symbol height (as drawn in the concept)
TRACKING = 0.055           # letter spacing in em
TEXT_GAP = 46.0            # symbol right edge -> first letter, symbol units


def wordmark(font, x0, cap_top, cap_h):
    """Return (paths dict, total width).  The final X carries the brand's S cut."""
    upm = font['head'].unitsPerEm
    scale = cap_h / font['OS/2'].sCapHeight
    baseline = cap_top + cap_h
    x = x0
    letters, x_box = [], None
    for i, ch in enumerate('CRISPIX'):
        d, adv = glyph_path(font, ch, scale, x, baseline)
        if ch == 'X' and i == 6:
            x_box = (x, adv)
        letters.append((ch, d))
        x += adv + (TRACKING * upm * scale if i < 6 else 0)
    return letters, x - x0, x_box, baseline


def x_split_clips(p, x_box, cap_top, cap_h, gap):
    """Two clip regions either side of a small S curve across the X (mirrors the symbol)."""
    x, w = x_box
    bottom, top = cap_top + cap_h, cap_top

    def region(shift, side):
        p0 = (x + w * 0.20 + shift, bottom + 2)
        p3 = (x + w * 0.80 + shift, top - 2)
        c1 = (x + w * 0.52 + shift, bottom - cap_h * 0.18)
        c2 = (x + w * 0.48 + shift, top + cap_h * 0.18)
        s = f'C{g.fmt(c1)} {g.fmt(c2)} {g.fmt(p3)}'
        if side == 'left':
            return f'M{x - 20:g} {top - 4:g}L{g.fmt(p3)}' + f'C{g.fmt(c2)} {g.fmt(c1)} {g.fmt(p0)}' + f'L{x - 20:g} {bottom + 4:g}Z'
        return f'M{g.fmt(p0)}{s}L{x + w + 20:g} {top - 4:g}L{x + w + 20:g} {bottom + 4:g}Z'
    return (f'<clipPath id="{p}xl"><path d="{region(-gap / 2, "left")}"/></clipPath>'
            f'<clipPath id="{p}xr"><path d="{region(gap / 2, "right")}"/></clipPath>')


def logo_body(font, text_colour, mode='colour', p='cx'):
    """Logo drawing without the outer <svg>; returns (markup, width)."""
    cap_h = g.H * CAP_RATIO
    cap_top = (g.H - cap_h) / 2
    letters, text_w, x_box, _ = wordmark(font, g.W + TEXT_GAP, cap_top, cap_h)
    width = g.W + TEXT_GAP + text_w
    x_gap = cap_h * 0.045
    defs = x_split_clips(p, x_box, cap_top, cap_h, x_gap)
    if mode == 'colour':
        defs += symbol_defs(p) + f'''
    <linearGradient id="{p}xg" gradientUnits="userSpaceOnUse" x1="{x_box[0]:.1f}" y1="{cap_top + cap_h:.1f}" x2="{x_box[0] + x_box[1]:.1f}" y2="{cap_top:.1f}">
      <stop offset="0" stop-color="{BLUE}"/><stop offset="1" stop-color="{CYAN}"/>
    </linearGradient>'''
        mark, accent = symbol_colour(p), f'url(#{p}xg)'
    else:
        mark, accent = symbol_mono(text_colour), text_colour
    body = ''.join(f'<path d="{d}"/>' for ch, d in letters[:-1])
    xd = letters[-1][1]
    text = (f'<g fill="{text_colour}">{body}<path d="{xd}" clip-path="url(#{p}xl)"/></g>'
            f'<path d="{xd}" fill="{accent}" clip-path="url(#{p}xr)"/>')
    return f'<defs>{defs}</defs>{mark}{text}', width


def logo_svg(font, text_colour, mode='colour', p='cx'):
    body, width = logo_body(font, text_colour, mode, p)
    pad = 6
    return wrap(f'{-pad} {-pad} {width + 2 * pad:.1f} {g.H + 2 * pad:.1f}', body, 'CRISPIX')


def wrap(viewbox, body, label, extra=''):
    w, h = viewbox.split()[2:]
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="{float(w):g}" height="{float(h):g}" '
            f'role="img" aria-label="{label}"{extra}><title>{label}</title>{body}</svg>\n')


def symbol_svg(mode, colour=None, p='cx'):
    pad = 6
    vb = f'{-pad} {-pad} {g.W + 2 * pad:g} {g.H + 2 * pad:g}'
    if mode == 'colour':
        return wrap(vb, f'<defs>{symbol_defs(p)}</defs>{symbol_colour(p)}', 'CRISPIX')
    return wrap(vb, symbol_mono(colour), 'CRISPIX')


def icon_svg(p='ci', glow=True, size=1024):
    """App icon: deep navy rounded square, electric rim and edge glow, colour symbol at 72% width."""
    s = size
    sym_w = s * 0.72
    k = sym_w / g.W
    tx, ty = (s - sym_w) / 2, (s - g.H * k) / 2 + s * 0.006
    rim = f'''<linearGradient id="{p}rim" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{CYAN}" stop-opacity=".9"/><stop offset=".5" stop-color="{BLUE}" stop-opacity=".55"/><stop offset="1" stop-color="{BLUE}" stop-opacity=".9"/></linearGradient>
    <linearGradient id="{p}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10264E"/><stop offset="1" stop-color="{INK}"/></linearGradient>
    <radialGradient id="{p}gl" cx=".5" cy=".46" r=".62"><stop offset="0" stop-color="{BLUE}" stop-opacity="0"/><stop offset=".7" stop-color="{BLUE}" stop-opacity=".08"/><stop offset=".97" stop-color="{BLUE}" stop-opacity=".42"/><stop offset="1" stop-color="{BLUE}" stop-opacity="0"/></radialGradient>'''
    r = s * 0.225
    sw = s * 0.008
    body = (f'<defs>{rim}{symbol_defs(p)}</defs>'
            f'<rect x="{sw / 2:g}" y="{sw / 2:g}" width="{s - sw:g}" height="{s - sw:g}" rx="{r:g}" fill="url(#{p}bg)"/>'
            + (f'<rect x="{sw / 2:g}" y="{sw / 2:g}" width="{s - sw:g}" height="{s - sw:g}" rx="{r:g}" fill="url(#{p}gl)"/>' if glow else '')
            + f'<rect x="{sw / 2:g}" y="{sw / 2:g}" width="{s - sw:g}" height="{s - sw:g}" rx="{r:g}" fill="none" stroke="url(#{p}rim)" stroke-width="{sw:g}"/>'
            f'<g transform="translate({tx:.2f} {ty:.2f}) scale({k:.5f})">{symbol_colour(p)}</g>')
    return wrap(f'0 0 {s} {s}', body, 'CRISPIX')


def social_svg(font, p='og'):
    """1200x630 sharing card for the website."""
    W_, H_ = 1200, 630
    logo_scale = 0.27
    inner, width = logo_body(font, WHITE, 'colour', p)
    tx, ty = (W_ - width * logo_scale) / 2, 205
    body = f'''<defs><radialGradient id="{p}bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="#0E2550"/><stop offset="1" stop-color="{INK}"/></radialGradient>
    <linearGradient id="{p}arc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{CYAN}" stop-opacity="0"/><stop offset=".6" stop-color="{CYAN}" stop-opacity=".9"/><stop offset="1" stop-color="{BLUE}" stop-opacity=".2"/></linearGradient></defs>
    <rect width="{W_}" height="{H_}" fill="url(#{p}bg)"/>
    <path d="M380 630C700 560 980 520 1200 400" fill="none" stroke="url(#{p}arc)" stroke-width="2.5"/>
    <path d="M380 630C700 560 980 520 1200 400L1200 630Z" fill="{BLUE}" opacity=".07"/>
    <g transform="translate({tx:.1f} {ty}) scale({logo_scale})">{inner}</g>
    <text x="600" y="455" text-anchor="middle" fill="#AFC6E8" font-family="Montserrat, Segoe UI, Arial, sans-serif" font-size="30" font-weight="500" letter-spacing="1">Seu olhar. Sua edição. · Plugin para Lightroom Classic</text>'''
    return wrap(f'0 0 {W_} {H_}', body, 'CRISPIX')


# ---------------------------------------------------------------- rasters

def render_pngs(jobs):
    """jobs: list of (svg_text, out_path, width, height). Chrome keeps the alpha channel."""
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(device_scale_factor=1)
        for svg, out, w, h in jobs:
            page.set_viewport_size({'width': max(w, 16), 'height': max(h, 16)})
            sized = svg.replace('<svg ', f'<svg style="display:block;width:{w}px;height:{h}px" ', 1)
            page.set_content(f'<!doctype html><html><body style="margin:0;background:transparent">{sized}</body></html>')
            page.locator('svg').first.screenshot(path=str(out), omit_background=True)
        browser.close()


def main():
    font = load_font()
    if KIT.exists():
        shutil.rmtree(KIT)
    SVG_DIR.mkdir(parents=True)
    PNG_DIR.mkdir(parents=True)

    files = {
        'crispix-simbolo.svg': symbol_svg('colour'),
        'crispix-simbolo-azul-profundo.svg': symbol_svg('mono', NAVY),
        'crispix-simbolo-branco.svg': symbol_svg('mono', WHITE),
        'crispix-logo-fundo-escuro.svg': logo_svg(font, WHITE, 'colour'),
        'crispix-logo-fundo-claro.svg': logo_svg(font, NAVY, 'colour'),
        'crispix-logo-azul-profundo.svg': logo_svg(font, NAVY, 'mono'),
        'crispix-logo-branco.svg': logo_svg(font, WHITE, 'mono'),
        'crispix-icone-app.svg': icon_svg(),
        'crispix-favicon.svg': icon_svg('fv', glow=False, size=64),
        'crispix-social-1200x630.svg': social_svg(font),
    }
    for name, text in files.items():
        (SVG_DIR / name).write_text(text, encoding='utf-8')

    def ratio(name):
        vb = files[name].split('viewBox="')[1].split('"')[0].split()
        return float(vb[2]) / float(vb[3])

    jobs = []
    for size in (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024):
        src = files['crispix-favicon.svg'] if size <= 48 else files['crispix-icone-app.svg']
        jobs.append((src, PNG_DIR / f'crispix-icone-{size}.png', size, size))
    for w in (512, 1024, 2048):
        jobs.append((files['crispix-simbolo.svg'], PNG_DIR / f'crispix-simbolo-{w}.png', w, round(w / ratio('crispix-simbolo.svg'))))
    for name in ('crispix-logo-fundo-escuro.svg', 'crispix-logo-fundo-claro.svg', 'crispix-logo-branco.svg', 'crispix-logo-azul-profundo.svg'):
        for w in (1200, 2400):
            jobs.append((files[name], PNG_DIR / name.replace('.svg', f'-{w}.png'), w, round(w / ratio(name))))
    jobs.append((files['crispix-social-1200x630.svg'], PNG_DIR / 'crispix-social-1200x630.png', 1200, 630))
    # Lightroom dialog header: 1020x276 (shown at 340x92, 3x), self-contained brand band
    header = header_svg(font)
    (SVG_DIR / 'crispix-header-plugin.svg').write_text(header, encoding='utf-8')
    jobs.append((header, PNG_DIR / 'crispix-header-plugin.png', 1020, 276))
    render_pngs(jobs)

    from PIL import Image
    icons = [Image.open(PNG_DIR / f'crispix-icone-{s}.png') for s in (16, 32, 48, 256)]
    icons[-1].save(KIT / 'crispix.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
                   append_images=icons[:-1])

    (KIT / 'LEIA-ME.txt').write_text(README, encoding='utf-8')
    with zipfile.ZipFile(ROOT / 'CRISPIX-identidade-cx.zip', 'w', zipfile.ZIP_DEFLATED) as z:
        for path in sorted(KIT.rglob('*')):
            if path.is_file():
                z.write(path, 'CRISPIX-identidade/' + path.relative_to(KIT).as_posix())
    export_site(ROOT.parent / 'site')
    # plugin dialog header (copied into CRISPIX.lrplugin/Branding by build_lightroom_local.py)
    shutil.copyfile(PNG_DIR / 'crispix-header-plugin.png', ROOT.parent / 'plugin-assets' / 'crispix-header.png')
    print(KIT)


def outline_text(font, text, x, baseline, cap_h, tracking_em):
    """Text as outlined paths (no font needed by the consumer); returns (path data, width)."""
    upm = font['head'].unitsPerEm
    scale = cap_h / font['OS/2'].sCapHeight
    parts, cx = [], x
    for i, ch in enumerate(text):
        d, adv = glyph_path(font, ch, scale, cx, baseline)
        parts.append(d)
        cx += adv + (tracking_em * upm * scale if i < len(text) - 1 else 0)
    return ''.join(parts), cx - x


def header_svg(font, p='hd'):
    """Lightroom dialog header: navy band with the colour logo and tagline, legible on any dialog theme."""
    W_, H_ = 1020, 276
    body, logo_w = logo_body(font, WHITE, 'colour', p)
    k = 112 / g.H
    tx, ty = (W_ - logo_w * k) / 2, 50
    semi = font
    for path in FONT_CANDIDATES:
        cand = path.replace('Montserrat-Bold', 'Montserrat-SemiBold') if path else ''
        if cand and os.path.exists(cand):
            semi = TTFont(cand)
            break
    tag_d, tag_w = outline_text(semi, 'SEU OLHAR. SUA EDIÇÃO.', 0, 0, 19, 0.32)
    return wrap(f'0 0 {W_} {H_}', f'''<defs>
    <linearGradient id="{p}bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10264E"/><stop offset="1" stop-color="{INK}"/></linearGradient>
    <radialGradient id="{p}gl" cx=".62" cy=".35" r=".6"><stop offset="0" stop-color="{BLUE}" stop-opacity=".32"/><stop offset="1" stop-color="{BLUE}" stop-opacity="0"/></radialGradient>
    <linearGradient id="{p}arc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{CYAN}" stop-opacity="0"/><stop offset=".65" stop-color="{CYAN}" stop-opacity=".8"/><stop offset="1" stop-color="{BLUE}" stop-opacity=".1"/></linearGradient>
    <clipPath id="{p}band"><rect width="{W_}" height="{H_}" rx="30"/></clipPath></defs>
    <g clip-path="url(#{p}band)">
      <rect width="{W_}" height="{H_}" fill="url(#{p}bg)"/><rect width="{W_}" height="{H_}" fill="url(#{p}gl)"/>
      <path d="M300 276C560 236 820 214 1020 150" fill="none" stroke="url(#{p}arc)" stroke-width="2.5"/>
    </g>
    <rect x="1" y="1" width="{W_ - 2}" height="{H_ - 2}" rx="29" fill="none" stroke="{BLUE}" stroke-opacity=".45" stroke-width="2"/>
    <g transform="translate({tx:.1f} {ty}) scale({k:.5f})">{body}</g>
    <path transform="translate({(W_ - tag_w) / 2:.1f} 218)" d="{tag_d}" fill="#9FC3F0"/>''', 'CRISPIX')


def export_site(site: Path):
    """Copy the web subset of the kit into the public site folder."""
    brand = site / 'brand'
    brand.mkdir(exist_ok=True)
    for name in ('crispix-simbolo.svg', 'crispix-logo-fundo-claro.svg', 'crispix-logo-fundo-escuro.svg'):
        shutil.copyfile(SVG_DIR / name, brand / name)
    shutil.copyfile(PNG_DIR / 'crispix-social-1200x630.png', brand / 'crispix-social-1200x630.png')
    shutil.copyfile(SVG_DIR / 'crispix-favicon.svg', site / 'favicon.svg')
    shutil.copyfile(KIT / 'crispix.ico', site / 'favicon.ico')
    shutil.copyfile(PNG_DIR / 'crispix-icone-180.png', site / 'apple-touch-icon.png')


README = '''CRISPIX - identidade visual "CX Ribbon Core"

SIMBOLO
  C + X fundidos numa fita continua; o corte em S marca a dobra da fita.
  Geometria reconstruida da prancha aprovada (Modelo 1) e ajustada aos pixels da referencia
  monocromatica. Mestre parametrico em cx_geometry.py.

ARQUIVOS (svg/ e o mestre vetorial; png/ sao exportacoes com transparencia)
  crispix-simbolo.svg                 simbolo colorido, fundo transparente
  crispix-simbolo-azul-profundo.svg   monocromatico #0B1A35 (fundos claros)
  crispix-simbolo-branco.svg          monocromatico branco (fundos escuros/fotos)
  crispix-logo-fundo-escuro.svg       logo horizontal, texto branco
  crispix-logo-fundo-claro.svg        logo horizontal, texto #0B1A35
  crispix-logo-azul-profundo.svg / crispix-logo-branco.svg   versoes de uma cor
  crispix-icone-app.svg               icone de aplicativo (quadrado arredondado)
  crispix-favicon.svg                 icone simplificado para tamanhos pequenos
  crispix-social-1200x630.svg         cartao de compartilhamento do site
  crispix.ico                         16 a 256 px
  png/crispix-header-plugin.png       cabecalho das janelas do plugin no Lightroom (1020x276, exibido em 340x92)

PALETA
  Azul Profundo  #0B1A35   base, solidez
  Azul Eletrico  #0A6BFF   energia, destaque
  Ciano Luminoso #00E5FF   modernidade, fluidez
  Branco Neutro  #FFFFFF   clareza

TIPOGRAFIA
  Montserrat (Bold no logotipo, ja convertido em curvas; SemiBold/Medium/Regular em textos).

USO
  Area de respiro minima: a altura do vao interno do C em todos os lados.
  Tamanho minimo do logo horizontal: 120 px de largura; abaixo disso use o simbolo ou o icone.
  Nao distorcer, nao trocar as cores do degrade, nao aplicar o simbolo colorido sobre fundos
  azuis medios - use a versao branca.
  Uso de marca registrada nao verificado.
'''

if __name__ == '__main__':
    main()
