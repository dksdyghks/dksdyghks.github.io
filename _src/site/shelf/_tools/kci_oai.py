"""New law papers in KCI (한국학술지인용색인), gathered from its OAI-PMH (open.kci.go.kr/oai/request, metadataPrefix oai_kci):
shelf/kci/new.json — the law papers KCI took in over the last eight weeks, newest first:
  [{ id, t, a: [authors], j, p, y, m, v, i, s, fp, lp, open, ab, d }]
  (id ART…, title, authors, journal, publisher, year, month, volume, issue, 통권, pages, 원문 공개, the start of the abstract,
  the day KCI took it in). The app shows the ones in its owner's fields on 논문 찾기's first screen.
shelf/kci/state.json — { "through": the last day gathered }.

KCI's records come by the day they were taken in (OAI has no search), a hundred to a page and some seconds a page: the
days since the last run are read one page at a time with a pause between pages, at most MAX_DAYS days a run and within
a time budget; a day not answered ends the run (the next run goes on from there). Law papers are told by KCI's subject
(법학) or, when a record has none, by the journal's name.

  python3 kci_oai.py ../kci            (the weekly refresh runs it)
  python3 kci_oai.py ../kci --file page.xml     (reads one saved page, for a check)
"""
import datetime, html, json, os, re, sys, time, urllib.parse, urllib.request

BASE = 'https://open.kci.go.kr/oai/request'
UA = '0128-bookshelf/1.0 (+https://0128.kr/shelf/)'
KEEP_DAYS, MAX_DAYS, BUDGET = 56, 21, 25 * 60
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
        rec = dict(id=art.group(1), t=re.sub(r'\s+', ' ', title), a=[n for n in names if n][:6], j=journal, p=tag(r, 'publisher-name'),
                   y=tag(r, 'pub-year'), m=tag(r, 'pub-mon'), v=tag(r, 'volume'), i=tag(r, 'issue'), s=tag(r, 'serno'),
                   fp=tag(r, 'fpage'), lp=tag(r, 'lpage'), open=tag(r, 'orte-open-yn') == 'Y',
                   ab=(ab[:158] + '…') if len(ab) > 160 else ab, d=tag(r, 'datestamp'))
        out.append({k: v for k, v in rec.items() if v not in ('', [], None)})
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
            print('  retry', k + 1, type(e).__name__, str(e)[:80])
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


def main(dst):
    os.makedirs(dst, exist_ok=True)
    state_f, new_f = os.path.join(dst, 'state.json'), os.path.join(dst, 'new.json')
    state = json.load(open(state_f, encoding='utf-8')) if os.path.exists(state_f) else {}
    have = json.load(open(new_f, encoding='utf-8')) if os.path.exists(new_f) else []
    today = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).date()
    last = today - datetime.timedelta(days=1)
    start = datetime.date.fromisoformat(state['through']) + datetime.timedelta(days=1) if state.get('through') else today - datetime.timedelta(days=14)
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
    else:
        main(sys.argv[1])
