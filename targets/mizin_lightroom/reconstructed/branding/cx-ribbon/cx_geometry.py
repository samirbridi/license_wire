"""CRISPIX "CX Ribbon Core" symbol geometry.

The mark is rebuilt from the approved concept (referencia/conceito-cx-ribbon-core.webp):
measurements were taken on the monochrome version, shifted so the symbol bounding box
starts at (0, 0) and spans 1180 x 648 design units.

Pieces
  A  C ring + upper halves of both X strokes (above the S cut)
  B  lower halves of both X strokes (below the S cut)
  counter  hole of the C, closed by the "\\" stroke and a line parallel to the S cut
  ribbon   highlight band on A (front face of the twist), used only by the colour version
"""
from __future__ import annotations

import math
from dataclasses import dataclass

W, H = 1180.0, 648.0
R_TOP = 220.0            # outer top-left radius of the C
R_BOTTOM = 200.0         # outer bottom-left radius of the C
R_COUNTER = 46.0         # rounded corners of the counter
R_SOFT = 40.0            # top-right corner of the C, counter corners next to the X
R_FOOT = 30.0            # bottom-right foot of the lower "/" stroke
R_COUNTER_FOLD = 120.0   # counter corner where it turns into the S cut
COUNTER = (188.0, 168.0, 468.0)   # left x, top y, bottom y of the counter

# "\" stroke: upper/right edge U, lower/left edge D (tapers from 244 to 232 wide, as drawn)
def U(y): return 644.0 + (y - 48.0) / 1.12
def D(y): return U(y) - (244.0 - 12.0 * y / 648.0)
# "/" stroke: right edge Rr, left edge Lr (horizontal width 224)
def Rr(y): return 1120.0 - (y - 48.0) / 1.25
def Lr(y): return Rr(y) - 224.0

# S cut centre line (least-squares fit to the reference gap, RMS 1.8 units):
# starts on the bottom edge, ends horizontal on the right edge of "/"
G0 = (363.0, 648.0)
G_START_ANGLE = math.radians(31.0)
GAP = 22.0               # width of the S cut (monochrome / single-colour versions)
SLIVER = 12.0            # band of the C kept between the counter and the S cut


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def bez(P, t):
    a, b, c, d = P
    mt = 1 - t
    return (mt**3*a[0] + 3*mt*mt*t*b[0] + 3*mt*t*t*c[0] + t**3*d[0],
            mt**3*a[1] + 3*mt*mt*t*b[1] + 3*mt*t*t*c[1] + t**3*d[1])


def solve(f, lo, hi, it=80):
    flo = f(lo)
    for _ in range(it):
        mid = (lo + hi) / 2
        fm = f(mid)
        if (fm > 0) == (flo > 0):
            lo, flo = mid, fm
        else:
            hi = mid
    return (lo + hi) / 2


def line_cross(f1, f2, lo=-400.0, hi=1100.0):
    """Point where two x(y) edge functions meet."""
    y = solve(lambda y: f1(y) - f2(y), lo, hi)
    return (f1(y), y)


def s_curve(shift_bottom=0.0, shift_top=0.0, a=293.0, b=312.0, top_y=267.0):
    """S cut as a cubic.  Positive shifts move it down/right (towards piece B)."""
    ang = G_START_ANGLE
    p0 = (G0[0] + shift_bottom / math.sin(ang), H)
    p1 = (p0[0] + a * math.cos(ang), H - a * math.sin(ang))
    y3 = top_y + shift_top
    p3 = (Rr(y3), y3)
    p2 = (p3[0] - b, y3)
    return (p0, p1, p2, p3)


@dataclass
class Path:
    d: list

    def M(self, p): self.d.append(f'M{fmt(p)}')
    def L(self, p): self.d.append(f'L{fmt(p)}')
    def C(self, P): self.d.append(f'C{fmt(P[1])} {fmt(P[2])} {fmt(P[3])}')
    def A(self, r, p, sweep=1): self.d.append(f'A{r:g} {r:g} 0 0 {sweep} {fmt(p)}')
    def Z(self): self.d.append('Z')
    def __str__(self): return ''.join(self.d)


def fmt(p):
    return f'{round(p[0], 2):g} {round(p[1], 2):g}'


def unit(v):
    n = math.hypot(*v)
    return (v[0] / n, v[1] / n)


def fillet(prev_pt, corner, next_pt, r):
    """Tangent points and sweep flag for rounding the corner prev->corner->next."""
    d1 = unit((corner[0] - prev_pt[0], corner[1] - prev_pt[1]))
    d2 = unit((next_pt[0] - corner[0], next_pt[1] - corner[1]))
    cosang = max(-1.0, min(1.0, -(d1[0]*d2[0] + d1[1]*d2[1])))
    theta = math.acos(cosang)            # interior angle
    t = r / math.tan(theta / 2)
    p1 = (corner[0] - d1[0]*t, corner[1] - d1[1]*t)
    p2 = (corner[0] + d2[0]*t, corner[1] + d2[1]*t)
    cross = d1[0]*d2[1] - d1[1]*d2[0]
    return p1, p2, 1 if cross > 0 else 0


def _parallel_edge(offset):
    """x(y) of a straight line parallel to the S cut's diagonal, `offset` units up/left."""
    G = s_curve()
    m, m2 = bez(G, 0.5), bez(G, 0.51)
    tang = unit((m2[0] - m[0], m2[1] - m[1]))
    normal = (tang[1], -tang[0])            # points up/left, away from piece B
    base = (m[0] + normal[0]*offset, m[1] + normal[1]*offset)
    return lambda y: base[0] + (y - base[1]) * tang[0] / tang[1]


def piece_a(gap=0.0):
    """C + upper X.  gap = half width of the S cut on this side."""
    G = s_curve(-gap, -gap)
    top_corner = (U(0), 0.0)
    tc = line_cross(U, Lr)              # crotch between the two upper arms
    p = Path([])
    p.M((R_TOP, 0))
    f1, f2, sw = fillet((R_TOP, 0), top_corner, (U(100), 100), R_SOFT)
    p.L(f1); p.A(R_SOFT, f2, sw)
    p.L(tc)
    p.L((Lr(0), 0)); p.L((Rr(0), 0))
    p.L(G[3])
    p.C((G[3], G[2], G[1], G[0]))
    p.L((R_BOTTOM, H)); p.A(R_BOTTOM, (0, H - R_BOTTOM))
    p.L((0, R_TOP)); p.A(R_TOP, (R_TOP, 0))
    p.Z()
    return str(p) + counter_path(gap)


def counter_path(gap=0.0):
    """Counter hole, drawn counter-clockwise (works with nonzero and evenodd)."""
    x0, y0, y1 = COUNTER
    cl = _parallel_edge(gap + SLIVER)
    tip = line_cross(cl, D, 150, 460)
    top_right = (D(y0), y0)
    bottom_right = (cl(y1), y1)
    p = Path([])
    p.M((x0 + R_COUNTER, y0))
    p.A(R_COUNTER, (x0, y0 + R_COUNTER), 0)
    p.L((x0, y1 - R_COUNTER)); p.A(R_COUNTER, (x0 + R_COUNTER, y1), 0)
    f1, f2, sw = fillet((x0, y1), bottom_right, tip, R_COUNTER_FOLD)
    p.L(f1); p.A(R_COUNTER_FOLD, f2, sw)
    p.L(tip)
    f1, f2, sw = fillet(tip, top_right, (x0, y0), R_SOFT)
    p.L(f1); p.A(R_SOFT, f2, sw)
    p.Z()
    return str(p)


def piece_b(gap=0.0):
    """Lower halves of the X, below the S cut."""
    G = s_curve(gap, gap)
    notch = line_cross(Rr, U)
    bc = line_cross(D, Rr)
    foot = (Rr(H), H)
    p = Path([])
    p.M(G[0]); p.C(G)
    p.L(notch); p.L((U(H), H)); p.L((D(H), H)); p.L(bc)
    f1, f2, sw = fillet(bc, foot, G[0], R_FOOT)
    p.L(f1); p.A(R_FOOT, f2, sw)
    p.Z()
    return str(p)


def ribbon():
    """Front face of the twist: between the "/" left edge and the S cut (colour version)."""
    G = s_curve()
    k = line_cross(_parallel_edge(SLIVER), Lr, 150, 460)
    p = Path([])
    p.M((Lr(0), 0)); p.L((Rr(0), 0)); p.L(G[3])
    p.C((G[3], G[2], G[1], G[0]))
    # left edge hugs the counter's fold, so the front face widens like the concept art
    p.C((G[0], (G[0][0] - 40, H - 40), (k[0] - 150, k[1] + 190), k))
    p.Z()
    return str(p)


def pieces(gap=GAP):
    return piece_a(gap / 2), piece_b(gap / 2)
