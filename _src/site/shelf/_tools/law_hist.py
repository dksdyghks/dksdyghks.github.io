"""조문 연혁 — how each article of the laws the owner works with came to read as it does: shelf/lawhist/, from the history of
the public mirror legalize-kr (법제처's texts; one commit for each promulgation, and each version's head gives its 공포일자,
공포번호 and 시행일자).

A phone cannot work this out itself: 공직선거법 has 84 versions in the mirror (2005-2026), each 0.5-0.8 MB (58 MB in all),
and one article's history would take dozens of them (헌법재판소법: 24 versions, 1988-2026, 41-66 KB each). Here they are
read once a week, and the app reads one small file for an article (the articles of its tens: 제93조 is in 9.json with
제90조 … 제99조 and their 가지조문; 공직선거법's 28 files are 118 KB on average, 9 KB as sent, gzip). For the 76 laws
(2026. 11. 26.): 3,234 versions read (543 MB of text), 12,098 articles in 1,016 files, 44.6 MB (4.3 MB gzip), in a little
over a minute (621 of the versions fetched on the way):

  lawhist/index.json                  {v, built, head, laws: {folder: [file, versions, first 공포일자, last 공포일자, articles]}}
  lawhist/<folder>/<file>/<n>.json    {law, type, arts: {"93": [...], "93-2": [...]}}: each article's versions newest first,
                                      one for each version in which it reads differently from the one before, and the version
                                      its record starts with (the mirror's first, its 신설, or the 전부개정 that wrote it anew);
                                      each {d 공포일자, no 공포번호, kind 제개정구분, eff 시행일자, title, text, how?, gone?}
                                      (text: as it read until the next change — pictures' markup and 란/난 aside, see IMG)
A file changes only when one of its articles does (nothing in it says when it was made), so the weekly commit stays small.

  git clone --filter=blob:none --no-checkout https://github.com/legalize-kr/legalize-kr /tmp/law-hist-src
  python3 law_hist.py /tmp/law-hist-src shelf shelf/lawhist

(it writes the clone's commit-graph first: see ensure_graph). In the site's weekly workflow
(.github/workflows/shelf-indexes.yml), after the step 'The laws (legalize-kr)', which leaves a one-commit clone in
/tmp/law-src (its whole history, commits and trees, is some 190 MB more):

      - name: 조문 연혁 (each article's versions, from the mirror's history)
        continue-on-error: true
        timeout-minutes: 25
        run: |
          if [ -f /tmp/law-src/.git/shallow ]; then git -C /tmp/law-src fetch -q --unshallow --filter=blob:none origin; fi
          python3 _src/site/shelf/_tools/law_hist.py /tmp/law-src shelf shelf/lawhist

and shelf/lawhist beside shelf/prec … in the step 'Publish when changed' (its git diff, its ls-files and its git add).

The laws: those of the owner's research (research.json, the homepage's provisions; research.js, each field's laws) and the
app's own core list (laws.js CORE_NAMES), each by the folder lawidx.json gives it (laws.js ABBR for the names lawyers use),
by its main file (the 법률, 헌법 or rule itself; of two, the one promulgated last, as the app picks). The texts are read the
way laws.js reads them (mirrorArts) and compared as it compares them (spaces aside). A 전부개정 (or 폐지제정) writes the
whole law anew, under new numbers, so an article's record starts again there. The versions are taken in the order of their
공포일자, not of their commits (in 16 files of the mirror a version was backfilled after newer ones, and a commit then put
the newest text back). The versions' files a blob-less clone does not have yet are fetched first, a few hundred to a
request (asked for one at a time as they are read — 427 versions took two minutes — the 3,234 would take a quarter of
an hour).

Nothing is replaced when the mirror could not be read or the result is much smaller than what is there (a law or an article
lost): the old files stay.
"""
import concurrent.futures as cf, datetime, json, os, re, shutil, subprocess, sys

REF = 'origin/main'


def git(repo, *args, data=None):
    return subprocess.run(['git', '-C', repo, '-c', 'core.quotePath=false', *args], input=data, capture_output=True, check=True).stdout


# ---- the laws to do --------------------------------------------------------------------------------------------------
def law_names(shelf):
    """the names (as the app writes them) of the research's laws, each field's laws and the app's core laws; and ABBR"""
    js = open(os.path.join(shelf, 'laws.js'), encoding='utf-8').read()
    abbr = dict(re.findall(r"([가-힣A-Za-z0-9ㆍ·]+): '([^']+)'", re.search(r'const ABBR = \{([\s\S]*?)\};', js).group(1)))
    core = re.findall(r"'([^']+)'", re.search(r'const CORE_NAMES = \[([\s\S]*?)\];', js).group(1))
    rjs = open(os.path.join(shelf, 'research.js'), encoding='utf-8').read()
    fields = re.search(r'export const FIELDS = \[([\s\S]*?)\n\];', rjs).group(1)
    named = [b or a for a, b in re.findall(r"\['([^']+)'(?:,\s*'([^']+)')?\]", fields)]
    research = []
    try:
        for g in json.load(open(os.path.join(shelf, 'research.json'), encoding='utf-8')).get('provisions', []):
            research += [it.get('law', '') for it in g.get('items', [])]
    except (OSError, ValueError):
        pass
    seen, out = set(), []
    for n in research + named + core:
        n = abbr.get(re.sub(r'\s+', '', n), n)
        if n and n not in seen:
            seen.add(n)
            out.append(n)
    return out


def folder(name):   # laws.js dirOf: no spaces, · as ㆍ; 헌법 under its full name
    d = re.sub(r'\s+', '', name).replace('·', 'ㆍ')
    return '대한민국헌법' if d in ('헌법', '대한민국헌법') else d


# ---- a version's text, read as laws.js mirrorArts reads it ----------------------------------------------------------------
FRONT = re.compile(r'^---\n([\s\S]*?)\n---\n')
FIELD = re.compile(r"^([^\s:][^:]*):\s*'?(.*?)'?\s*$")
END = re.compile(r'^#{1,3}\s*부\s*칙')
CHAPTER = re.compile(r'^#{2,3}\s+(제\s*\d+\s*[편장]\S*\s+.+)$')
SECTION = re.compile(r'^#{3,4}\s+제\s*\d+\s*[절관]')
ARTICLE = re.compile(r'^#{4,6}\s+제(\d{1,4})조(?:의(\d{1,3}))?\s*(?:\((.*)\))?\s*$')


def md_line(l):
    l = re.sub(r'\*\*([①-⑳])\*\*\s*', r'\1 ', l)
    l = re.sub(r'\\([.\-*_#()\[\]])', r'\1', l)
    l = re.sub(r'\*\*(.+?)\*\*', r'\1', l)
    return l.strip()


def read(md):
    m = FRONT.match(md)
    head = {}
    if m:
        for l in m.group(1).split('\n'):
            k = FIELD.match(l)
            if k and k.group(2):
                head[k.group(1)] = k.group(2)
    body = md[m.end():] if m else md
    arts, cur, chapter, pre = [], None, '', None
    for raw in body.split('\n'):
        l = raw.rstrip()
        if END.match(l):
            break
        c = CHAPTER.match(l)
        if c:
            chapter, cur = re.sub(r'\s+', ' ', c.group(1)).strip(), None
            continue
        if SECTION.match(l):
            cur = None
            continue
        a = ARTICLE.match(l)
        if a:
            title = re.sub(r'^\((.*)\)$', r'\1', a.group(3) or '').strip()
            cur = {'art': int(a.group(1)), 'sub': int(a.group(2) or 0), 'title': title, 'lines': []}
            arts.append(cur)
            continue
        if not arts and not chapter and re.match(r'^전\s*문$', l.strip()):
            pre = []
            continue
        if pre is not None and not arts and not chapter and l.strip() and not l.startswith('#'):
            continue
        if l.startswith('#'):
            cur = None
            continue
        if cur is not None and l.strip():
            cur['lines'].append(md_line(l))
    return head, [{'art': x['art'], 'sub': x['sub'], 'title': x['title'], 'text': '\n'.join(x['lines'])} for x in arts]


def blobs(repo, ids, ways=4):
    """each blob's text, in the order asked, four readers at once (one not fetched beforehand is fetched alone as it is
    read)"""
    def part(chunk):
        p = subprocess.Popen(['git', '-C', repo, 'cat-file', '--batch'], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        p.stdin.write(''.join(i + '\n' for i in chunk).encode())
        p.stdin.close()
        out = []
        for _ in chunk:
            h = p.stdout.readline().split()
            if len(h) < 3 or h[1] != b'blob':
                out.append(None)
                continue
            out.append(p.stdout.read(int(h[2])).decode('utf-8', 'replace'))
            p.stdout.read(1)
        p.wait()
        return out
    n = max(1, -(-len(ids) // ways))
    with cf.ThreadPoolExecutor(ways) as ex:
        return [t for got in ex.map(part, [ids[i:i + n] for i in range(0, len(ids), n)]) for t in got]


def versions(repo, path):
    """the versions of one file, in the order of its commits (oldest first): commit, blob, its kind of change (from the
    commit's own line). That is not always the order of their days — a version backfilled later stands after newer ones,
    and a commit then puts the newest text back (관세법, 국가정보원법, 국세징수법 …, 2026. 9.–10.): in_order() sorts them"""
    out = git(repo, 'log', '--format=C%x09%H%x09%s', '--raw', '--no-abbrev', REF, '--', path).decode('utf-8', 'replace')
    vs = []
    for line in out.split('\n'):
        if line.startswith('C\t'):
            _, sha, msg = line.split('\t', 2)
            k = re.search(r'\(([^()]*)\)\s*$', msg)
            vs.append({'sha': sha, 'kind': k.group(1) if k else '', 'blob': None})
        elif line.startswith(':') and vs:
            f = line.split('\t', 1)[0].split()
            if f[4] != 'D' and not re.fullmatch('0+', f[3]):
                vs[-1]['blob'] = f[3]
    return [v for v in reversed(vs) if v['blob']]


def in_order(vs, texts):
    """the versions by their 공포일자 (a version without one keeps its place after the one before it), and of two in a row
    with the same text, the first (a commit that only put the newest text back is not a version)"""
    rows, last = [], ''
    for i, (v, t) in enumerate(zip(vs, texts)):
        m = re.search(r"^공포일자:\s*'?(\d{4}-\d{2}-\d{2})", t or '', re.M)
        last = m.group(1) if m else last
        rows.append((last, i, v, t))
    out = []
    for _, _, v, t in sorted(rows, key=lambda r: (r[0], r[1])):
        if out and out[-1][0]['blob'] == v['blob']:
            continue
        out.append((v, t))
    return [v for v, _ in out], [t for _, t in out]


def ensure_graph(repo):
    """the clone's commit-graph, with each commit's changed paths: one law's log then takes 0.3 s instead of 20 (a walk for
    all the files at once takes five minutes either way). Written once for a new clone (minutes: a diff of every commit),
    after that only brought up to date (a second)"""
    subprocess.run(['git', '-C', repo, 'commit-graph', 'write', '--reachable', '--changed-paths'], check=False)


def prefetch(repo, ids, chunk=500):
    """the blobs not here yet, fetched a few hundred to a request (a blob-less clone would otherwise ask for each one alone
    as it is read: minutes for the thousands of versions here); returns how many were asked for"""
    have = set(git(repo, 'cat-file', '--batch-all-objects', '--batch-check=%(objectname)').decode().split())
    need = [i for i in dict.fromkeys(ids) if i and i not in have]
    for k in range(0, len(need), chunk):
        subprocess.run(['git', '-C', repo, '-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '-q', 'origin', '--no-tags', '--no-write-fetch-head',
                        '--recurse-submodules=no', '--filter=blob:none', '--stdin'], input=''.join(i + '\n' for i in need[k:k + chunk]).encode(), check=False)
    return len(need)


def ymd(s):
    s = str(s or '').strip()
    return s if re.fullmatch(r'\d{4}-\d{2}-\d{2}', s) else ''


flat = lambda t: re.sub(r'\s+', '', t or '')
# 법제처's pictures in the texts (<img src="…flDownload.do?flSeq=7399353" …>()</img>: the ㉥ of 공직선거법 제179조): their
# file numbers, an empty "()" or "null" inside come and go between versions that did not amend the article, and so do the
# spellings 란 and 난 (투표용지의 란): neither is a change. laws.js histSig compares the same way (a device's own search)
# (a picture put in brackets, "(㉥)" for "㉥", is none either; a picture's own text — a table drawn in letters inside it —
# is compared as text)
IMG = re.compile(r'<img\b[^>]*>(?:(?:null|\(\))?</img>)?')


def sig_of(title, text):
    t = flat(IMG.sub('\0', text or '').replace('</img>', '')).replace('(\0)', '').replace('\0', '')
    return ((title or '').replace('난', '란'), t.replace('난', '란'))


def history(vs, texts):
    """every article's record, oldest first, from the versions and their texts"""
    lists, state, prev = {}, {}, None
    for v, md in zip(vs, texts):
        if md is None:
            continue
        head, arts = read(md)
        if not arts:
            continue
        meta = {'d': ymd(head.get('공포일자')), 'no': str(head.get('공포번호', '')).lstrip('0'), 'kind': v['kind'], 'eff': ymd(head.get('시행일자')), 'type': head.get('법령구분', '')}
        whole = v['kind'] in ('제정', '전부개정', '폐지제정')
        if whole:   # (written anew, under new numbers: what the numbers meant before is another article)
            lists, state = {}, {}
        now = {}
        for a in arts:
            k = f"{a['art']}-{a['sub']}" if a['sub'] else str(a['art'])
            if k in now:
                continue   # (a number twice: the first, as the app reads it)
            now[k] = a
            sig = sig_of(a['title'], a['text'])
            if state.get(k) == sig:
                # (no change, but the text may differ in what is not one: the record keeps the latest, so that its newest
                # entry reads as the article reads today)
                last_e = lists[k][-1]
                if last_e.get('text') != a['text'] or last_e.get('title') != a['title']:
                    last_e['text'], last_e['title'] = a['text'], a['title']
                continue
            how = 'whole' if whole else 'start' if prev is None else 'new' if k not in state else ''
            e = dict(meta, title=a['title'], text=a['text'])
            if how:
                e['how'] = how
            lists.setdefault(k, []).append(e)
            state[k] = sig
        for k in list(state):   # gone from this version (a number taken out, not 「삭제」 kept in its place)
            if k not in now:
                lists[k].append(dict(meta, gone=True))
                del state[k]
        prev = meta
    return lists, prev


def main(repo, shelf, dst, only=None):
    idx = json.load(open(os.path.join(shelf, 'lawidx.json'), encoding='utf-8'))
    head = git(repo, 'rev-parse', REF).decode().strip()
    built = datetime.date.today().isoformat()
    tmp = dst.rstrip('/') + '.new'
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp)
    laws, missing, n_files, n_bytes = {}, [], 0, 0
    ensure_graph(repo)
    # each law's main files and their versions (from the commits and trees alone: no text is read yet)
    todo, done = [], set()
    for name in law_names(shelf):
        d = folder(name)
        if (only and d not in only) or d in done:
            continue
        done.add(d)
        e = idx.get(d)
        files = (e[1].split(',') if e[1] else ['법률']) if e else []
        cands = [f for f in files if re.sub(r'\(.*\)$', '', f) not in ('시행령', '시행규칙')] or files[:1]
        cands = [(f, vs) for f, vs in ((f, versions(repo, f'kr/{d}/{f}.md')) for f in cands) if vs]
        if cands:
            todo.append((name, d, e, cands))
        else:
            missing.append(name)
    # of two files of one kind, the one promulgated last, as the app picks (the other: an old law's repeal record)
    n_new = prefetch(repo, [vs[-1]['blob'] for *_, cands in todo for _, vs in cands])
    chosen = []
    for name, d, e, cands in todo:
        best = None
        for f, vs in cands:
            last = read(blobs(repo, [vs[-1]['blob']])[0] or '')
            stub = len(last[1]) <= 1   # (a repeal record beside the law in force: 헌법재판소법/법률.md, 1997)
            key = (ymd(last[0].get('공포일자')), not stub)
            if not best or key > best[0]:
                best = (key, f, vs)
        chosen.append((name, d, e) + best[1:])
    n_new += prefetch(repo, [v['blob'] for *_, vs in chosen for v in vs])
    print(f'{len(chosen)} laws, {sum(len(c[4]) for c in chosen)} versions ({n_new} fetched now)')
    for name, d, e, f, vs in chosen:
        vs, texts = in_order(vs, blobs(repo, [v['blob'] for v in vs]))
        lists, last = history(vs, texts)
        if not last:
            missing.append(name)
            continue
        current = {k: v for k, v in lists.items() if not v[-1].get('gone')}
        first = next((ymd(read(t)[0].get('공포일자')) for t in texts if t), '')
        out = os.path.join(tmp, d, f)
        os.makedirs(out, exist_ok=True)
        tens = {}
        for k, entries in sorted(current.items(), key=lambda kv: tuple(int(x) for x in kv[0].split('-')) + (0,)):
            for x in entries:
                if x.get('type') == last['type']:
                    del x['type']
            tens.setdefault(int(k.split('-')[0]) // 10, {})[k] = entries[::-1]
        for t, arts in tens.items():
            s = json.dumps({'law': e[0] or d, 'type': last['type'], 'arts': arts}, ensure_ascii=False, separators=(',', ':'))
            with open(os.path.join(out, f'{t}.json'), 'w', encoding='utf-8') as fh:
                fh.write(s)
            n_files += 1
            n_bytes += len(s.encode())
        laws[d] = [f, len(vs), first, last['d'], len(current)]
        print(f'{d}/{f}: {len(vs)} versions from {first}, {len(current)} articles, {sum(len(x) for x in current.values())} entries')
    if missing:
        print('not done (not in the index, or no versions):', ', '.join(missing))
    before = {}
    try:
        before = json.load(open(os.path.join(dst, 'index.json'), encoding='utf-8')).get('laws', {})
    except (OSError, ValueError):
        pass
    lost = [d for d in before if d not in laws]
    arts_before, arts_now = sum(v[4] for v in before.values()), sum(v[4] for v in laws.values())
    print(f'{len(laws)} laws, {arts_now} articles in {n_files} files, {n_bytes / 1e6:.1f} MB (before: {len(before)} laws, {arts_before} articles)')
    if not laws or len(lost) > max(2, len(before) // 10) or arts_now < arts_before * 0.9:
        shutil.rmtree(tmp, ignore_errors=True)
        sys.exit('lawhist: much less than before (' + ', '.join(lost[:10]) + '): not replaced')
    with open(os.path.join(tmp, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump({'v': 1, 'built': built, 'head': head, 'laws': laws}, fh, ensure_ascii=False, separators=(',', ':'))
    shutil.rmtree(dst, ignore_errors=True)
    os.rename(tmp, dst)


if __name__ == '__main__':   # (a fourth argument, folders with commas between them: only those, to try it out)
    main(sys.argv[1], sys.argv[2], sys.argv[3], set(sys.argv[4].split(',')) if len(sys.argv) > 4 else None)
