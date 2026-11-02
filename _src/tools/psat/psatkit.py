# Shared helpers for the 송공 item scripts (mk_*.py): building blocks, checks, and the writer.
# A batch script builds `items` (and REVIEW rows), calls kit.check(...) for every claim, then kit.write(...).
# write() refuses to write anything if a single check failed.
import json, re, sys
from fractions import Fraction as F

CIRC = '①②③④⑤'
O, XX = '옳다', '옳지 않다'
T, NT = '반드시 참이다', '반드시 참이라고 할 수 없다'
Y, NY = '필요하다', '필요하지 않다'
fails = []

def check(c, m):
    if not c: fails.append(m)
def ox(items): return {'t': 'ox', 'items': [{'ok': ok, 'v': v, 'why': why} for ok, v, why in items]}
def bx(items): return {'t': 'bx', 'items': [{'label': l, 'text': t, 'ok': ok, 'v': v, 'why': why} for l, t, ok, v, why in items]}
def p(h): return {'t': 'p', 'h': h}
def law(h): return {'t': 'law', 'h': h}
def passage(h): return {'t': 'passage', 'h': h}
def steps(lines): return {'t': 'steps', 'items': [{'ind': 0, 'h': x} for x in lines]}
def box(title, items, plain=False): return {'t': 'box', 'title': title, 'items': items, 'plain': plain}
def table(head, rows, caption='', unit='', num=True, note=None):
    b = {'t': 'table', 'caption': caption, 'unit': unit, 'head': head, 'rows': rows, 'num': num}
    if note: b['note'] = note
    return b
def chart(caption, unit, cats, series, mx=None, step=None, dec=0):
    b = {'t': 'chart', 'kind': 'bar', 'caption': caption, 'unit': unit, 'cats': cats, 'series': [{'name': n, 'v': v} for n, v in series], 'dec': dec}
    if mx: b['max'] = mx
    if step: b['step'] = step
    return b

def n(x, d=0): return f'{float(x):,.{d}f}'
def pct(fr, d=1): return f'{float(fr) * 100:.{d}f}'
def won(x): return f'{int(x):,}원'
def ro(x):  # 로/으로 after a number read aloud (…0 십/백/천/만, 3 삼, 6 육 → 으로)
    return '으로' if str(abs(int(x)))[-1] in '036' else '로'

def combo(truths, options, tag=''):
    want = ', '.join(k for k in 'ㄱㄴㄷㄹ' if truths.get(k))
    hits = [i for i, o in enumerate(options) if o == want]
    check(len(hits) == 1, f'{tag} combo {want} appears {len(hits)} times in {options}')
    return hits[0] if hits else -1
def one_true(flags, ans, tag): check([i for i, f in enumerate(flags) if f] == [ans], f'{tag}: true options {flags}, answer {ans}')
def one_false(flags, ans, tag): check([i for i, f in enumerate(flags) if not f] == [ans], f'{tag}: false options {flags}, answer {ans}')
def unique_max(d, tag): v = sorted(d.values()); check(len(v) < 2 or v[-1] != v[-2], f'{tag}: max not unique {d}')
def unique_min(d, tag): v = sorted(d.values()); check(len(v) < 2 or v[0] != v[1], f'{tag}: min not unique {d}')

def esc_text(h):  # '<표>' and 'a < b' are text; tags we use are kept
    h = re.sub(r'<(?!/?(b|i|br|sup|sub|p|ul|li|span|small)\b)', '&lt;', h)
    return re.sub(r'(?<![a-z"\'/0-9])>', '&gt;', h)

def write(items, REVIEW, out_js, subject, review_md, title, header):
    check(set(REVIEW) == {it['id'] for it in items}, 'review rows for every item')
    check(len({it['id'] for it in items}) == len(items), 'ids unique')
    for it in items:
        it['lv'] = {'하': 1, '중': 2, '상': 3}[REVIEW[it['id']][1]]
        for k in ('answer',): check(0 <= it[k] < len(it['options']), f"{it['id']} answer index")
        check(len(it['options']) == 5 and len(set(it['options'])) == 5, f"{it['id']} five distinct options")
        for blk in it['explain']:
            if 'h' in blk: blk['h'] = esc_text(blk['h'])
            for x in blk.get('items', []):
                for k in ('why', 'h'):
                    if k in x: x[k] = esc_text(x[k])
            if blk.get('t') == 'table':
                blk['rows'] = [[esc_text(str(c)) for c in r] for r in blk['rows']]
                if 'note' in blk: blk['note'] = esc_text(blk['note'])
        # the explanation's closing line must name the keyed answer
        named = [m for blk in it['explain'] if blk.get('t') == 'p' for m in re.findall(r'정답은 <b>([①②③④⑤])</b>', blk['h'])]
        check(named and all(CIRC.index(m) == it['answer'] for m in named), f"{it['id']} explanation names {named}, key {CIRC[it['answer']]}")
    if fails:
        print('CHECKS FAILED — nothing written:'); [print(' -', f) for f in fails]; sys.exit(1)
    pos = [it['answer'] for it in items]
    print('answers', pos, 'distribution', [pos.count(i) for i in range(5)], '| levels', [it['lv'] for it in items])
    js = (f'/* {header} 이 파일은 _src/tools/psat/의 스크립트가 만든다: 모든 선지·보기를 다시 판정해 확인한 뒤에만 쓴다. 손으로 고치지 말고 스크립트를 고친다. */\n'
          '(function (G) {\n  \'use strict\';\n  G.PSAT.addBank(\'' + subject + '\', ' + json.dumps(items, ensure_ascii=False, indent=1) + ');\n'
          '})(typeof window !== \'undefined\' ? window : globalThis);\n')
    open(out_js, 'w', encoding='utf8').write(js)
    rows = ['| 문항 | 유형 | 난이도 | 예상 시간 | 정답 | 평가요소 | 오답의 오류 유형 | 신속 풀이 | 검증 | 기출과의 관계 |', '|---|---|---|---|---|---|---|---|---|---|']
    for it in items:
        c, lv, tm, ev, wr, fast, orig = REVIEW[it['id']]
        rows.append(f"| {it['id']} | {c} | {lv} | {tm} | {CIRC[it['answer']]} | {ev} | {wr} | {fast} | 스크립트로 모든 선지 재판정, 정답 유일 | {orig} |")
    open(review_md, 'w', encoding='utf8').write(f'# {title}\n\n' + '\n'.join(rows) + '\n')
    print('wrote', out_js, len(items), 'items and', review_md)
