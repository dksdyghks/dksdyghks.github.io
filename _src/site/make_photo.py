"""Makes the profile photo from photo-src.jpg (the original, kept with the sources).

- photo.b64: the 3:4 card in the hero (shown at 160 x 213, drawn at twice that for sharp screens)
- og-image.png: the link preview; the photo box (x 79-290, y 285-567, corner radius 24) is replaced in place
Run once after changing photo-src.jpg, then run build.py.
"""
import base64, io
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
SITE = Path('/home/user/dksdyghks.github.io')
CROP = (616, 680, 1501, 1860)         # full figure with the mountains and the ice; 885 x 1180 = 3:4

src = Image.open(HERE / 'photo-src.jpg').convert('RGB')
card = src.crop(CROP)
assert abs(card.size[0] / card.size[1] - 0.75) < 0.002, card.size

out = card.resize((320, 427), Image.LANCZOS)
buf = io.BytesIO(); out.save(buf, 'JPEG', quality=84, optimize=True, progressive=True)
(HERE / 'photo.b64').write_text(base64.b64encode(buf.getvalue()).decode())
print('photo.b64', len(buf.getvalue()), 'bytes')

og_path = SITE / 'og-image.png'
og = Image.open(og_path).convert('RGB')
x0, y0, x1, y1, r = 79, 285, 291, 568, 24
w, h = x1 - x0, y1 - y0
tile = card.resize((w, h), Image.LANCZOS)
S = 4                                  # draw the rounded mask large, then shrink, for smooth corners
mask = Image.new('L', (w * S, h * S), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, w * S - 1, h * S - 1), radius=r * S, fill=255)
mask = mask.resize((w, h), Image.LANCZOS)
og.paste(tile, (x0, y0), mask)
og.save(og_path, optimize=True)
print('og-image.png updated')
