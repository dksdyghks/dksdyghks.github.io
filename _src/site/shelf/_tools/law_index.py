"""The index of the laws kept in the public mirror legalize-kr (법제처's texts): shelf/lawidx.json, folder → [name, files]
(files: '' for a law alone, else e.g. '법률,시행령,시행규칙' or '중앙선거관리위원회규칙'). The name is read from the head of
each folder's main file (a ranged request: the first 700 bytes).

  git clone --filter=blob:none --no-checkout --depth 1 https://github.com/legalize-kr/legalize-kr laws
  git -C laws -c core.quotePath=false ls-tree -r --name-only HEAD kr/ | sed 's#^kr/##' > law-files.txt
  python3 law_index.py law-files.txt ../lawidx.json

When the index is there already (the weekly refresh), the names it holds are kept and only new folders are read, with
an eighth of the others read again each week (a law renamed in its own folder is caught within two months).
"""
import datetime, hashlib, json, os, ssl, sys, urllib.parse, urllib.request, concurrent.futures as cf

ORDER = ['법률', '헌법', '대통령령']
KEEP = ['헌법', '법률', '대통령령', '시행령', '시행규칙']


def main(listing, dst, cafile=None):
    files = {}
    for l in open(listing, encoding='utf-8'):
        l = l.strip()
        if l.endswith('.md') and l.count('/') == 1:
            d, f = l.split('/')
            files.setdefault(d, []).append(f[:-3])
    ctx = ssl.create_default_context(cafile=cafile) if cafile else None

    def main_file(fs):
        return next((o for o in ORDER if o in fs), next((f for f in fs if f not in ('시행령', '시행규칙')), fs[0]))

    def name(d):
        url = ('https://raw.githubusercontent.com/legalize-kr/legalize-kr/main/kr/' + urllib.parse.quote(d) + '/'
               + urllib.parse.quote(main_file(files[d])) + '.md')
        for _ in range(3):
            try:
                req = urllib.request.Request(url, headers={'Range': 'bytes=0-699'})
                with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
                    head = r.read().decode('utf-8', 'ignore')
                for line in head.split('\n')[1:]:
                    if line.startswith('제목:'):
                        return d, line.split(':', 1)[1].strip().strip("'")
                return d, ''
            except Exception:
                pass
        return d, ''

    prev = {}
    if os.path.exists(dst):
        try:
            prev = {d: v[0] for d, v in json.load(open(dst, encoding='utf-8')).items() if v and v[0] and v[0] != d}
        except Exception:
            prev = {}
    week = datetime.date.today().isocalendar()[1]
    again = lambda d: int(hashlib.sha1(d.encode()).hexdigest(), 16) % 8 == week % 8
    ask = [d for d in files if d not in prev or again(d)]
    with cf.ThreadPoolExecutor(6) as ex:
        names = {d: n for d, n in ex.map(name, ask)}
    for d in files:
        if not names.get(d) and d in prev:
            names[d] = prev[d]          # kept (or read again and not answered: the name it had)
    print(len(ask), 'folders read,', len(files) - len(ask), 'names kept')
    out = {}
    for d in sorted(files):
        fs = sorted(files[d], key=lambda f: (KEEP.index(f) if f in KEEP else len(KEEP), f))
        out[d] = [names.get(d) or d, '' if fs == ['법률'] else ','.join(fs)]
    with open(dst, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(out), 'laws,', sum(1 for d in out if out[d][0] == d and ' ' not in d and not names.get(d)), 'without a name read')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
