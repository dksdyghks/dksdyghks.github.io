# turn a one-paragraph-per-line fixture into PDF-like pages: lines wrapped at ~40 chars on spaces, 28 lines a page, page numbers and a running head
import sys, json
def wrap(p, w=40):
    out, cur = [], ''
    for word in p.split(' '):
        if cur and len(cur) + 1 + len(word) > w: out.append(cur); cur = word
        else: cur = (cur + ' ' + word) if cur else word
    if cur: out.append(cur)
    return out
src = open(sys.argv[1], encoding='utf8').read().split('\n')
lines = [l for p in src for l in (wrap(p) if p.strip() else [''])]
pages, n = [], 0
for i in range(0, len(lines), 28):
    n += 1; pages.append('\n'.join((['판결서 인터넷열람 서비스'] if sys.argv[2:] == ['head'] else []) + lines[i:i + 28] + [f'- {n} -']))
print(json.dumps(pages, ensure_ascii=False))
