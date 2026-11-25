"""Law papers in KCI (한국학술지인용색인), gathered from its OAI-PMH (open.kci.go.kr/oai/request, metadataPrefix oai_kci):
shelf/kci/new.json — the law papers KCI took in over the last eight weeks, newest first:
  [{ id, t, a: [authors], j, p, y, m, v, i, s, fp, lp, open, ab, d, o, c, doi }]
  (id ART…, title, authors, journal, publisher, year, month, volume, issue, 통권, pages, 원문 공개, the start of the abstract,
  the day KCI took it in, KCI's OAI number (the whole record, with the full abstract, on demand), times cited, DOI). The app shows the ones in its owner's fields on 논문 찾기's first screen.
shelf/kci/law/YYYY-MM.json — every law paper gathered, kept by the month it came out (YYYY-00 when KCI gives no month),
  for the last YEARS years and this one: [{ id, t, a, j, p, y, m, v, i, s, fp, lp, open, ab }], newest issue first;
  shelf/kci/law/index.json — { months: { "YYYY-MM": count }, back, through }.
shelf/kci/state.json — { "through": the last day gathered going forward, "back": the earliest day gathered going back }.

KCI's records come by the day they were last changed (a journal's new issue comes in as one batch; OAI has no search), a
hundred to a page and some seconds a page: the days since the last run are read one page at a time with a pause between
pages, at most MAX_DAYS days a run and within a time budget; a day not answered ends the run (the next run goes on from
there). Going back (--back), the days before the earliest one read are read the same way, newest first, until YEARS years
are covered — a little every hour, so KCI is never asked much at once. Law papers are told by KCI's subject (법학) or, when
a record has none, by the journal's name.

  python3 kci_oai.py ../kci            (the weekly refresh runs it)
  python3 kci_oai.py ../kci --back     (the hourly gathering of the years before, until done)
  python3 kci_oai.py ../kci --file page.xml     (reads one saved page, for a check)
"""
import datetime, html, json, os, re, sys, time, urllib.parse, urllib.request
import kci_scope

BASE = 'https://open.kci.go.kr/oai/request'
UA = '0128-bookshelf/1.0 (+https://0128.kr/shelf/)'
KEEP_DAYS, MAX_DAYS, YEARS = 56, 21, 3
BUDGET = int(os.environ.get('KCI_BUDGET', 25 * 60))   # seconds a run may take (a long gathering elsewhere may give more)
LAWISH = re.compile(r'법|입법|헌정|선거|의정|인권|정치|규제|행정')


def tag(x, t):
    m = re.search(r'<%s(?:\s[^>]*)?>([\s\S]*?)</%s>' % (t, t), x)
    return html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''


def records(xml):
    out = []
    for r in xml.split('<record>')[1:]:
        if 'status="deleted"' in r[:400]:
            continue
        art = re.search(r'article-id="(ART\d+)"', r)
        if not art:
            continue
        cat, journal = tag(r, 'article-categories'), tag(r, 'journal-name')
        if not ('법' in cat or (not cat and LAWISH.search(journal))):
            continue
        titles = re.findall(r'<article-title lang="(\w+)">([\s\S]*?)</article-title>', r)
        title = next((html.unescape(t).strip() for lang, t in titles if lang == 'original'), titles[0][1].strip() if titles else '')
        names = [html.unescape(n).strip() for n in re.findall(r'<name>([\s\S]*?)</name>', r.split('<author-name>', 1)[1] if '<author-name>' in r else '')]
        abstracts = re.findall(r'<abstract(?: lang="(\w+)")?>([\s\S]*?)</abstract>', r)
        ab = next((a for lang, a in abstracts if lang in ('original', '')), abstracts[0][1] if abstracts else '')
        ab = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', ab))).strip()
        oai = re.search(r'<identifier>oai:kci\.go\.kr:ARTI/(\d+)</identifier>', r)
        cites = tag(r, 'citation-count')
        doi = re.sub(r'^https?://(?:dx\.)?doi\.org/', '', tag(r, 'doi'))
        rec = dict(id=art.group(1), t=re.sub(r'\s+', ' ', title), a=[n for n in names if n][:6], j=journal, p=tag(r, 'publisher-name'),
                   y=tag(r, 'pub-year'), m=tag(r, 'pub-mon'), v=tag(r, 'volume'), i=tag(r, 'issue'), s=tag(r, 'serno'),
                   fp=tag(r, 'fpage'), lp=tag(r, 'lpage'), open=tag(r, 'orte-open-yn') == 'Y',
                   ab=(ab[:158] + '…') if len(ab) > 160 else ab, d=tag(r, 'datestamp'),
                   o=oai.group(1) if oai else '',                      # KCI's OAI number: the whole record (full abstract) on demand
                   c=int(cites) if cites.isdigit() and int(cites) > 0 else None,   # times cited, as KCI counts
                   doi=doi if doi.startswith('10.') else '')
        if not kci_scope.in_field(journal):   # a journal entirely of another field (조세·민사·형사·지재 …): kept, but out of the feed
            rec['pub'] = 0
        out.append({k: v for k, v in rec.items() if v not in ('', [], None, False) or k in ('open', 'pub')})
    return out


def ask(params, tries=3):
    url = BASE + '?' + urllib.parse.urlencode(params)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=90) as r:
                text = r.read().decode('utf-8', 'replace')
            if '<OAI-PMH' in text:
                return text
        except Exception as e:
            body = ''
            try:
                body = e.read().decode('utf-8', 'replace')[:160].replace('\n', ' ') if hasattr(e, 'read') else ''
            except Exception:
                pass
            print('  retry', k + 1, type(e).__name__, str(e)[:80], body)
        time.sleep(5 * (k + 1))
    return None


def day(d, started):
    """every law record KCI took in on day d; None when the day could not be read whole"""
    out, token = [], None
    while True:
        if time.time() - started > BUDGET:
            return None
        xml = ask({'verb': 'ListRecords', 'resumptionToken': token} if token else {'verb': 'ListRecords', 'metadataPrefix': 'oai_kci', 'set': 'ARTI', 'from': d, 'until': d})
        if xml is None:
            return None
        if 'noRecordsMatch' in xml:
            return out
        out += records(xml)
        m = re.search(r'<resumptionToken[^>]*>([^<]+)</resumptionToken>', xml)
        token = m.group(1).strip() if m else None
        if not token:
            return out
        time.sleep(1.5)


def archive(dst, recs, through=None, back=None):
    """the papers into their months (a paper read again replaces the one kept); papers older than YEARS years are not kept"""
    law = os.path.join(dst, 'law')
    os.makedirs(law, exist_ok=True)
    first_year = datetime.date.today().year - YEARS
    by_month = {}
    for r in recs:
        y = r.get('y', '')
        if not (y.isdigit() and int(y) >= first_year):
            continue
        m = r.get('m', '')
        key = '%s-%02d' % (y, int(m)) if m.isdigit() and 1 <= int(m) <= 12 else y + '-00'
        by_month.setdefault(key, []).append({k: v for k, v in r.items() if k != 'd'})
    idx_f = os.path.join(law, 'index.json')
    idx = json.load(open(idx_f, encoding='utf-8')) if os.path.exists(idx_f) else {'months': {}}
    for key, rs in by_month.items():
        f = os.path.join(law, key + '.json')
        have = {r['id']: r for r in (json.load(open(f, encoding='utf-8')) if os.path.exists(f) else [])}
        for r in rs:
            have[r['id']] = r
        out = sorted(have.values(), key=lambda r: (r.get('m', ''), r.get('v', '').zfill(4), r.get('i', '').zfill(4), r.get('fp', '').zfill(5), r['id']), reverse=True)
        with open(f, 'w', encoding='utf-8') as fh:
            json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
        idx['months'][key] = len(out)
    for key in list(idx['months']):   # months now older than kept
        if int(key[:4]) < first_year:
            idx['months'].pop(key)
            try:
                os.remove(os.path.join(law, key + '.json'))
            except OSError:
                pass
    idx['months'] = dict(sorted(idx['months'].items(), reverse=True))
    if through:
        idx['through'] = through
    if back:
        idx['back'] = back
    with open(idx_f, 'w', encoding='utf-8') as fh:
        json.dump(idx, fh, ensure_ascii=False, separators=(',', ':'))


def go_back(dst):
    """the days before the earliest one read, newest first, within the time budget, until YEARS years are covered"""
    state_f = os.path.join(dst, 'state.json')
    state = json.load(open(state_f, encoding='utf-8')) if os.path.exists(state_f) else {}
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).date()
    goal = today.replace(year=today.year - YEARS, month=1, day=1)
    if os.environ.get('KCI_UNTIL'):   # (a gathering of one stretch of the years before, alongside the main one)
        goal = max(goal, datetime.date.fromisoformat(os.environ['KCI_UNTIL']))
    first = state.get('back') or state.get('first') or state.get('through')
    if not first:
        print('nothing gathered going forward yet')
        return
    d = datetime.date.fromisoformat(first) - datetime.timedelta(days=1)
    if d < goal:
        print('done: gathered back to', first)
        return
    started, got, days, total = time.time(), [], 0, 0
    def save():
        archive(dst, got, back=state.get('back'))
        with open(state_f, 'w', encoding='utf-8') as fh:
            json.dump(state, fh)
    while d >= goal:
        recs = day(d.isoformat(), started)
        if recs is None and time.time() - started < BUDGET - 120:   # once more, a minute later (a server busy for a moment)
            time.sleep(60)
            recs = day(d.isoformat(), started)
        if recs is None:
            print('stopped at', d, '(not answered, or out of time)')
            break
        got += recs
        total += len(recs)
        state['back'] = d.isoformat()
        days += 1
        print(d, len(recs), 'law papers', flush=True)
        d -= datetime.timedelta(days=1)
        if days % 7 == 0:   # what is gathered is kept as it goes (a run cut short loses at most a week)
            save()
            got = []
    save()
    print(total, 'law papers in', days, 'days; gathered back to', state.get('back'))


def main(dst):
    os.makedirs(dst, exist_ok=True)
    state_f, new_f = os.path.join(dst, 'state.json'), os.path.join(dst, 'new.json')
    state = json.load(open(state_f, encoding='utf-8')) if os.path.exists(state_f) else {}
    have = json.load(open(new_f, encoding='utf-8')) if os.path.exists(new_f) else []
    today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=9)).date()
    last = today - datetime.timedelta(days=1)
    start = datetime.date.fromisoformat(state['through']) + datetime.timedelta(days=1) if state.get('through') else today - datetime.timedelta(days=14)
    state.setdefault('first', start.isoformat())
    started, got, days = time.time(), [], 0
    d = start
    while d <= last and days < MAX_DAYS:
        recs = day(d.isoformat(), started)
        if recs is None:
            print('stopped at', d, '(not answered, or out of time)')
            break
        got += recs
        state['through'] = d.isoformat()
        print(d, len(recs), 'law papers')
        d += datetime.timedelta(days=1)
        days += 1
    archive(dst, got, through=state.get('through'))
    keep_from = (today - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    by = {r['id']: r for r in have if r.get('d', '') >= keep_from}
    for r in got:
        by[r['id']] = r
    out = sorted(by.values(), key=lambda r: (r.get('d', ''), r['id']), reverse=True)
    with open(new_f, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(',', ':'))
    with open(state_f, 'w', encoding='utf-8') as fh:
        json.dump(state, fh)
    print(len(got), 'gathered,', len(out), 'kept (', days, 'days, through', state.get('through'), ')')


if __name__ == '__main__':
    if len(sys.argv) > 3 and sys.argv[2] == '--file':
        print(json.dumps(records(open(sys.argv[3], encoding='utf-8').read())[:3], ensure_ascii=False, indent=1))
    elif len(sys.argv) > 2 and sys.argv[2] == '--back':
        go_back(sys.argv[1])
    else:
        main(sys.argv[1])
