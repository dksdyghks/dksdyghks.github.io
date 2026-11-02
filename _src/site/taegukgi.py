"""Taegukgi drawn to the construction rules of the Enforcement Decree of the National Flag Act (대한민국국기법 시행령 제6조):
- flag 3:2 (W:H), white field;
- taegeuk centred on the intersection of the diagonals, diameter = H/2, red above / blue below;
- the red/blue boundary lies on the diagonal from the upper-left to the lower-right corner: that diameter is halved and a
  semicircle of half the radius is drawn on each half, the left one bulging downward and the right one bulging upward;
- four trigrams centred on the diagonals, at right angles to them, 건 upper-left, 감 upper-right, 곤 lower-right, 리 lower-left;
- trigram length = 1/2 of the taegeuk diameter, trigram width = 1/3 of it, gap to the taegeuk = 1/4 of it;
- bar (효) width = 1/4 of the trigram width (H/24); space between bars and the break in a broken bar = half a bar (H/48).
Colours: red #CD2E3A, blue #0047A0 (sRGB renderings of the statutory Munsell values), black #000000."""
import math

W, H = 150.0, 100.0
CX, CY = W / 2, H / 2
D = H / 2            # taegeuk diameter
R = D / 2
L = D / 2            # trigram (bar) length
T = D / 3            # trigram width across its three bars
GAP = D / 4          # taegeuk edge -> trigram
B = H / 24           # bar width
S = H / 48           # space between bars / break in a broken bar
RED, BLUE, BLACK = '#CD2E3A', '#0047A0', '#000000'

# trigram: bars listed from the inner (nearest the taegeuk) to the outer bar; True = unbroken, False = broken
TRIGRAMS = {
    '건': ((-3, -2), (True, True, True)),      # upper-left
    '감': ((3, -2), (False, True, False)),     # upper-right
    '곤': ((3, 2), (False, False, False)),     # lower-right
    '리': ((-3, 2), (True, False, True)),      # lower-left
}


def _f(x):
    return f'{x:.3f}'.rstrip('0').rstrip('.')


def _rect(cx, cy, ux, uy, px, py, half_len, half_w):
    """Rectangle centred at (cx, cy): long side along p, short side along u."""
    pts = []
    for sl, sw in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        pts.append((cx + px * half_len * sl + ux * half_w * sw, cy + py * half_len * sl + uy * half_w * sw))
    return 'M' + ' L'.join(f'{_f(x)},{_f(y)}' for x, y in pts) + ' Z'


def svg(width=42, label='대한민국 국기', cls='flag'):
    h = width * H / W
    k = math.hypot(3, 2)
    ux, uy = 3 / k, 2 / k                       # unit vector along the upper-left -> lower-right diagonal
    ax, ay = CX - R * ux, CY - R * uy           # boundary end at the upper left
    bx, by = CX + R * ux, CY + R * uy           # boundary end at the lower right
    r2 = R / 2
    red = (f'M{_f(ax)},{_f(ay)} A{_f(R)},{_f(R)} 0 0 1 {_f(bx)},{_f(by)} '
           f'A{_f(r2)},{_f(r2)} 0 0 0 {_f(CX)},{_f(CY)} '
           f'A{_f(r2)},{_f(r2)} 0 0 1 {_f(ax)},{_f(ay)} Z')
    bars = []
    for _, ((dx, dy), kinds) in TRIGRAMS.items():
        vx, vy = dx / k, dy / k                 # from the centre toward the corner
        px, py = -vy, vx                        # along the bars
        for i, solid in enumerate(kinds):
            dist = R + GAP + B / 2 + i * (B + S)
            cx, cy = CX + vx * dist, CY + vy * dist
            if solid:
                bars.append(_rect(cx, cy, vx, vy, px, py, L / 2, B / 2))
            else:
                half = (L - S) / 2
                off = S / 2 + half / 2
                for sgn in (-1, 1):
                    bars.append(_rect(cx + px * off * sgn, cy + py * off * sgn, vx, vy, px, py, half / 2, B / 2))
    return (f'<svg class="{cls}" viewBox="0 0 {_f(W)} {_f(H)}" width="{_f(width)}" height="{_f(h)}" role="img" aria-label="{label}">'
            f'<rect width="{_f(W)}" height="{_f(H)}" fill="#FFFFFF"/>'
            f'<circle cx="{_f(CX)}" cy="{_f(CY)}" r="{_f(R)}" fill="{BLUE}"/>'
            f'<path d="{red}" fill="{RED}"/>'
            f'<path d="{" ".join(bars)}" fill="{BLACK}"/></svg>')


if __name__ == '__main__':
    open('flag-preview.html', 'w').write(
        '<body style="margin:0;background:#888;display:flex;gap:30px;padding:30px;align-items:flex-start">'
        + svg(600) + svg(42) + '</body>')
