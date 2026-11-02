#!/usr/bin/env python3
"""송공's passage face, Noto Serif KR (SIL Open Font License 1.1, (c) Adobe), served from this site.

Why: the serif face sets 송공's passages and choices. Served from 0128.kr it needs no third-party request, and the
offline worker (psat/sw.js) can keep every piece, so a passage looks the same with no connection.

What goes in: every character in psat/*.js and psat/index.html (the curated items, the generators' word lists,
the screens), plus all 2,350 KS X 1001 Hangul syllables as a margin for memos and future items. Hangul is cut
into slices ordered by how often 송공 uses each syllable, so a page downloads only the slices its text needs
(unicode-range), the way Google Fonts serves Korean. File names carry a content hash, so a changed slice is
never confused with an old one in any cache.

Rebuilds only when the character set or this script changes (the key is kept in fonts/noto-serif-kr/build.json).
Sources: fonts-src/NotoSerifKR-{400,600}.ttf, fetched from Google Fonts on first use.
"""
import hashlib
import io
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path('/home/user/yohan-ahn')
SRC = ROOT / 'fonts-src'
OUT = ROOT / 'fonts' / 'noto-serif-kr'
WEIGHTS = (400, 600)
SLICE = 200      # syllables per slice for the ones 송공 uses
SLICE_REST = 500  # the margin is rarely needed, so its slices are larger
API = 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600'
OFL_HEAD = 'Copyright (c) 2017-2024 Adobe (http://www.adobe.com/).\n\n'  # the font's own copyright record



def fetch_sources():
    SRC.mkdir(exist_ok=True)
    if all((SRC / f'NotoSerifKR-{w}.ttf').exists() for w in WEIGHTS):
        return
    req = urllib.request.Request(API, headers={'User-Agent': 'Wget/1.21'})  # an old agent gets whole TTF files
    css = urllib.request.urlopen(req, timeout=60).read().decode()
    for w, url in re.findall(r'font-weight:\s*(\d+);\s*src:\s*url\(([^)]+)\)', css):
        if int(w) in WEIGHTS:
            (SRC / f'NotoSerifKR-{w}.ttf').write_bytes(urllib.request.urlopen(url, timeout=120).read())


def charset():
    """Characters 송공 can show, with how often each appears in the question banks and generators."""
    freq = {}
    for f in sorted((ROOT / 'psat').glob('*')):
        if f.suffix not in ('.js', '.html'):
            continue
        weight = 3 if f.name.startswith(('bank-', 'gen-')) else 1
        for ch in f.read_text():
            if ord(ch) >= 0x20:
                freq[ch] = freq.get(ch, 0) + weight
    for ch in map(chr, range(0x20, 0x7F)):
        freq.setdefault(ch, 0)
    ks = [bytes([hi, lo]).decode('euc-kr') for hi in range(0xB0, 0xC9) for lo in range(0xA1, 0xFF)]
    return freq, ks


def ranges(cps):
    cps = sorted(set(cps))
    out, i = [], 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
        i = j + 1
    return ','.join(out)


def build(force=False):
    from fontTools.ttLib import TTFont
    from fontTools import subset

    freq, ks = charset()
    syll = lambda c: 0xAC00 <= ord(c) <= 0xD7A3
    used = sorted((c for c in freq if syll(c)), key=lambda c: (-freq[c], ord(c)))
    rest = [c for c in ks if c not in freq]
    other = sorted(c for c in freq if not syll(c))
    slices = [other] + [used[i:i + SLICE] for i in range(0, len(used), SLICE)] + [rest[i:i + SLICE_REST] for i in range(0, len(rest), SLICE_REST)]

    # decided before touching the 28 MB sources, so an unchanged build costs nothing
    key = hashlib.sha256((Path(__file__).read_text() + json.dumps(slices, ensure_ascii=False)).encode()).hexdigest()[:16]
    meta = OUT / 'build.json'
    if not force and meta.exists() and json.loads(meta.read_text()).get('key') == key:
        return False

    fetch_sources()
    cmap = set(TTFont(SRC / 'NotoSerifKR-400.ttf', lazy=True).getBestCmap())
    slices = [[c for c in s if ord(c) in cmap] for s in slices]  # letters the face does not have fall back as before
    slices = [s for s in slices if s]
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob('*.woff2'):
        old.unlink()
    faces = []
    for w in WEIGHTS:
        for n, chars in enumerate(slices):
            opts = subset.Options()
            opts.flavor = 'woff2'
            opts.hinting = False
            opts.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
            opts.name_languages = [0x409]
            opts.notdef_outline = True
            font = TTFont(SRC / f'NotoSerifKR-{w}.ttf', recalcTimestamp=False)  # same input, same bytes
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=[ord(c) for c in chars])
            sub.subset(font)
            buf = io.BytesIO()
            font.flavor = 'woff2'
            font.save(buf)
            data = buf.getvalue()
            name = f'{w}-{n}.{hashlib.sha256(data).hexdigest()[:8]}.woff2'
            (OUT / name).write_bytes(data)
            faces.append(f'@font-face{{font-family:"Noto Serif KR";font-style:normal;font-weight:{w};font-display:swap;'
                         f'src:url({name}) format("woff2");unicode-range:{ranges(map(ord, chars))}}}')
    head = ('/* Noto Serif KR, (c) 2017-2024 Adobe, SIL Open Font License 1.1 (LICENSE.txt next to this file).\n'
            '   Cut to the letters 송공 shows (plus all KS X 1001 Hangul) by serif_subset.py. */\n')
    (OUT / 'noto-serif-kr.css').write_text(head + '\n'.join(faces) + '\n')
    lic = (ROOT / 'fonts' / 'pretendard' / 'LICENSE.txt').read_text()
    body = lic[lic.index('This Font Software is licensed'):]
    (OUT / 'LICENSE.txt').write_text(OFL_HEAD + body)
    meta.write_text(json.dumps({'key': key, 'slices': len(slices), 'chars': sum(map(len, slices)),
                                'used_syllables': len(used)}, ensure_ascii=False) + '\n')
    return True


if __name__ == '__main__':
    import sys
    changed = build(force='--force' in sys.argv)
    total = sum(p.stat().st_size for p in OUT.glob('*.woff2'))
    print('noto-serif-kr', 'rebuilt' if changed else 'unchanged', json.loads((OUT / 'build.json').read_text()), f'{total / 1024:.0f} KB')
