#!/usr/bin/env python3
"""The homepage's display faces, served from this site and cut to the exact letters the page sets in them.

  signature   안요환 / Yohan Ahn          Nanum Brush Script / Kaushan Script
  serif (ko)  the statement and headings  Noto Serif KR 400 · 600
  serif (en)  the statement and headings  Source Serif 4 400 · 600 (static instances, optical size fixed)

Before, these came from Google Fonts: two style sheets on another site had to arrive before the first paint, and
the name stayed invisible until its font did. Now the rules are inlined in the page and the files sit next to it,
each a few to a few dozen KB, so the hero paints as soon as the page and Pretendard arrive.

All four families are under the SIL Open Font License 1.1. Three of them reserve their names (Kaushan Script,
Nanum, Source), and a cut-down copy is a modified version, so each file here carries its own family name
(Yohan Sign KO/EN, Yohan Serif EN) while keeping the original copyright and license records; LICENSE.txt in
fonts/home/ has the notices. Files are named by content hash, so no cache ever holds a stale cut.
"""
import hashlib
import io
import json
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path('/home/user/yohan-ahn')
SRC = ROOT / 'fonts-src'
OUT = ROOT / 'fonts' / 'home'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
SOURCES = {  # what Google Fonts serves for these requests (fetched once, kept in fonts-src/)
    'nanum-brush-sig.woff2': ('css', 'https://fonts.googleapis.com/css2?family=Nanum+Brush+Script&text=%EC%95%88%EC%9A%94%ED%99%98&display=block'),
    'kaushan-sig.woff2': ('css', 'https://fonts.googleapis.com/css2?family=Kaushan+Script&text=Yohan%20Ahn&display=block'),
    'ss4-latin.woff2': ('url', 'https://fonts.gstatic.com/s/sourceserif4/v15/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2'),
}
ASCII = ''.join(map(chr, range(0x20, 0x7F)))
PUNCT = ' ‘’“”–—…·'


class _Text(HTMLParser):
    """Text of each view, split by the face it is set in (.stmt and .h use the serif, .name the signature)."""
    VOID = {'br', 'img', 'meta', 'link', 'input', 'hr', 'source', 'path', 'circle', 'rect', 'use', 'wbr'}

    def __init__(self):
        super().__init__()
        self.stack, self.view, self.out = [], None, {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = (a.get('class') or '').split()
        if a.get('id') in ('view-ko', 'view-en'):
            self.view = a['id'][5:]
        if tag in self.VOID:
            return
        self.stack.append('serif' if ('stmt' in cls or 'h' in cls) else 'sign' if 'name' in cls else None)

    def handle_endtag(self, tag):
        if tag not in self.VOID and self.stack:
            self.stack.pop()

    def handle_data(self, data):
        roles = [r for r in self.stack if r]
        if roles and self.view:
            self.out[(self.view, roles[-1])] = self.out.get((self.view, roles[-1]), '') + data


def _fetch(name):
    f = SRC / name
    if f.exists():
        return f.read_bytes()
    kind, url = SOURCES[name]
    if kind == 'css':
        css = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60).read().decode()
        url = css.split('url(', 1)[1].split(')', 1)[0]
    data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=120).read()
    SRC.mkdir(exist_ok=True)
    f.write_bytes(data)
    return data


def _rename(font, family, style):
    """A modified OFL font may not use a reserved name: give the cut its own family name, keep copyright/licence."""
    name = font['name']
    keep = {0, 7, 8, 9, 11, 12, 13, 14}
    name.names = [r for r in name.names if r.nameID in keep]
    ps = family.replace(' ', '') + '-' + style.replace(' ', '')
    for nid, val in ((1, family), (2, 'Regular'), (3, ps + ';0128.kr'), (4, f'{family} {style}'.strip()), (6, ps),
                     (10, 'A cut of the original font for 0128.kr (SIL Open Font License 1.1).')):
        name.setName(val, nid, 3, 1, 0x409)
    if 'CFF ' in font:
        font['CFF '].cff.fontNames = [ps]


def _cut(data, chars, family, style, instance=None, rename=True):
    from fontTools.ttLib import TTFont
    from fontTools import subset
    font = TTFont(io.BytesIO(data), recalcTimestamp=False)  # same input, same bytes, same file name
    if instance:
        from fontTools.varLib.instancer import instantiateVariableFont
        font = instantiateVariableFont(font, instance)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.hinting = False
    opts.name_IDs = ['*']
    opts.name_languages = [0x409]
    opts.notdef_outline = True
    opts.layout_features = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=sorted({ord(c) for c in chars}))
    sub.subset(font)
    if rename:
        _rename(font, family, style)
    font.flavor = 'woff2'
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def build(body_html):
    """Cut the faces for this page body. Returns (inline @font-face rules, preload links). Rebuilds only on change."""
    p = _Text()
    p.feed(body_html)
    txt = lambda view, role: p.out.get((view, role), '')
    sets = {
        'serif-ko': ''.join(sorted(set(txt('ko', 'serif') + ASCII + PUNCT) - set('\n\t'))),
        'serif-en': ''.join(sorted(set(txt('en', 'serif') + ASCII + PUNCT) - set('\n\t'))),
        'sign-ko': ''.join(sorted(set(txt('ko', 'sign').strip()))),
        'sign-en': ''.join(sorted(set(txt('en', 'sign').strip()))),
    }
    key = hashlib.sha256((Path(__file__).read_text() + json.dumps(sets, ensure_ascii=False)).encode()).hexdigest()[:16]
    meta = OUT / 'build.json'
    if meta.exists() and json.loads(meta.read_text()).get('key') == key and all((OUT / f).exists() for f in json.loads(meta.read_text())['files'].values()):
        files = json.loads(meta.read_text())['files']
    else:
        jobs = {
            'sign-ko': lambda: _cut(_fetch('nanum-brush-sig.woff2'), sets['sign-ko'], 'Yohan Sign KO', 'Regular'),
            'sign-en': lambda: _cut(_fetch('kaushan-sig.woff2'), sets['sign-en'], 'Yohan Sign EN', 'Regular'),
            # Noto Serif KR keeps its name: its only reserved name is 'Source', which it does not use
            'serif-ko-400': lambda: _cut((SRC / 'NotoSerifKR-400.ttf').read_bytes(), sets['serif-ko'], '', '', rename=False),
            'serif-ko-600': lambda: _cut((SRC / 'NotoSerifKR-600.ttf').read_bytes(), sets['serif-ko'], '', '', rename=False),
            'serif-en-400': lambda: _cut(_fetch('ss4-latin.woff2'), sets['serif-en'], 'Yohan Serif EN', 'Regular', {'wght': 400, 'opsz': 16}),
            'serif-en-600': lambda: _cut(_fetch('ss4-latin.woff2'), sets['serif-en'], 'Yohan Serif EN', 'SemiBold', {'wght': 600, 'opsz': 20}),
        }
        OUT.mkdir(parents=True, exist_ok=True)
        for old in OUT.glob('*.woff2'):
            old.unlink()
        files = {}
        for k, job in jobs.items():
            data = job()
            files[k] = f'{k}.{hashlib.sha256(data).hexdigest()[:8]}.woff2'
            (OUT / files[k]).write_bytes(data)
        meta.write_text(json.dumps({'key': key, 'files': files, 'chars': {k: len(v) for k, v in sets.items()}}, ensure_ascii=False) + '\n')
        _license()
    u = lambda k: f'/fonts/home/{files[k]}'
    face = lambda fam, k, w, disp: f'@font-face{{font-family:"{fam}";font-style:normal;font-weight:{w};font-display:{disp};src:url({u(k)}) format("woff2")}}'
    css = '\n'.join([
        '/* display faces served from this site (SIL OFL 1.1; notices in /fonts/home/LICENSE.txt) */',
        face('Yohan Sign KO', 'sign-ko', 400, 'block'),
        face('Yohan Sign EN', 'sign-en', 400, 'block'),
        face('Noto Serif KR', 'serif-ko-400', 400, 'swap'),
        face('Noto Serif KR', 'serif-ko-600', 600, 'swap'),
        face('Yohan Serif EN', 'serif-en-400', 400, 'swap'),
        face('Yohan Serif EN', 'serif-en-600', 600, 'swap'),
    ]) + '\n'
    # the two signatures are tiny and invisible until loaded, so they are fetched with the page
    preload = ''.join(f'<link rel="preload" href="{u(k)}" as="font" type="font/woff2" crossorigin>\n' for k in ('sign-ko', 'sign-en'))
    return css, preload


def _license():
    ofl = (ROOT / 'fonts' / 'pretendard' / 'LICENSE.txt').read_text()
    body = ofl[ofl.index('This Font Software is licensed'):]
    from fontTools.ttLib import TTFont
    rec = lambda src: TTFont(io.BytesIO(src))['name'].getDebugName(0)  # each font's own copyright record, verbatim
    notes = [
        ('sign-ko.*.woff2  (family "Yohan Sign KO")', 'a cut of Nanum Brush Script', rec(_fetch('nanum-brush-sig.woff2'))),
        ('sign-en.*.woff2  (family "Yohan Sign EN")', 'a cut of Kaushan Script', rec(_fetch('kaushan-sig.woff2'))),
        ('serif-ko-*.woff2  (family "Noto Serif KR")', 'a cut of Noto Serif KR', rec((SRC / 'NotoSerifKR-400.ttf').read_bytes())),
        ('serif-en-*.woff2  (family "Yohan Serif EN")', 'a cut of Source Serif 4', rec(_fetch('ss4-latin.woff2'))),
    ]
    head = ('The files in this folder are cut-down copies (only the letters the page uses) of the fonts below.\n'
            'Each is a Modified Version under the SIL Open Font License 1.1 and carries its own family name.\n\n')
    head += '\n'.join(f'{f}: {what}\n  {c}\n' for f, what, c in notes)
    (OUT / 'LICENSE.txt').write_text(head + '\n' + body)


if __name__ == '__main__':
    import sys
    html = Path('/home/user/dksdyghks.github.io/index.html').read_text()
    css, pre = build(html)
    print(css + pre)
    print(json.loads((OUT / 'build.json').read_text()))
    for f in sorted(OUT.glob('*.woff2')):
        print(f.name, f.stat().st_size)
