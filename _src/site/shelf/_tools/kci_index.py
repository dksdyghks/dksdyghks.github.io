"""The KCI law papers found by their words: shelf/kciq/, an index of the law papers gathered into shelf/kci/law/ (by
kci_oai.py from KCI's OAI-PMH), built from each paper's title, authors, journal and the start of its abstract, so that
논문 찾기 finds a law paper by what it is about — on this device, offline, with no daily limit.

  shelf/kciq/v.json       { v, n, shards, block, journals:[[name, publisher, count], …], ymMin, ymMax, stop, built }
  shelf/kciq/f.bin        for each paper, in the index's order (newest first): u16 journalIdx, u16 ym (year*13+month,
                          month 0 when unknown), u16 cites (capped 65535), u8 flags (bit0 원문 공개) — so the whole set can be
                          filtered (by journal, by year) and sorted (by date, by times cited) without the rows
  shelf/kciq/m/<b>.tsv    the papers b*block … , one a line (for showing a page of results):
                          id \t o \t journalIdx \t yyyymm \t vol \t iss \t fp \t lp \t open \t cites \t doi \t authors \t title \t abLead
  shelf/kciq/p/<k>.bin    the two-letter pieces whose hash is k, each with the papers that hold it — in their title (with
                          the authors and the journal), else only in the start of their abstract (two lists, so a search
                          can put first the papers whose title says what was asked)

A paper's number in the index follows its date: the newest first (year, then month, then journal, then volume and issue
descending). So the papers holding every piece asked for, taken in that order, are already the newest to show first.

A piece is two letters next to each other within a word (letters: Hangul, Latin, digits, Hanja); a word of one letter has
none, nor does a piece with a digit in it. The pieces nearly every paper has are left out (STOP of them) and listed in
v.json. Shard file: the same shape as shelf/precq/p, but each piece has two lists (title, abstract) not three.

  python3 kci_index.py <shelf/kci> <shelf/kciq> [commit]
"""
import collections, datetime, json, os, re, struct, sys, unicodedata

SHARDS, BLOCK, NAME, LEAD = 256, 512, 300, 320   # (blocks of 512: a page of 20 rows reads small files as the index grows)
STOP_FRAC, STOP_FLOOR = 0.5, 64   # a piece in half the papers or more (and at least STOP_FLOOR of them) is left out of a search
LETTERS = re.compile(r'[^0-9A-Za-zㄱ-ㆎ가-힣㐀-䶿一-鿿豈-﫿]+')


def hash_of(s, n):   # the same as precq.js / kciq.js
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h % n


def words(text):
    return LETTERS.sub(' ', unicodedata.normalize('NFKC', text or '')).lower().split()


def pieces(text):   # (a number is left to be found whole, not by its two-letter pieces)
    out = set()
    for w in words(text):
        for i in range(len(w) - 1):
            p = w[i:i + 2]
            if not (p[0].isdigit() or p[1].isdigit()):
                out.add(p)
    return out


def varint(n, out):
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def num(x):
    try:
        return int(re.sub(r'\D', '', str(x)) or 0)
    except ValueError:
        return 0


def main(src, dst, commit=''):
    law = os.path.join(src, 'law')
    papers = {}
    for name in sorted(os.listdir(law)) if os.path.isdir(law) else []:
        if name.endswith('.json') and name != 'index.json':
            for r in json.load(open(os.path.join(law, name), encoding='utf-8')):
                if r.get('id'):
                    papers[r['id']] = r   # (a paper kept under two months: the later file wins, as the list is sorted)
    docs = list(papers.values())
    if not docs:
        sys.exit('no law papers to index')
    # newest first: year, then month, then journal, then volume and issue descending, then first page
    def ym(r):
        y, m = num(r.get('y')), num(r.get('m'))
        return y * 13 + (m if 1 <= m <= 12 else 0) if y else 0   # month 0..12 (0 = unknown); *13 so Dec-Y and unknown-month-(Y+1) never collide
    docs.sort(key=lambda r: (-ym(r), r.get('j', ''), -num(r.get('v')), -num(r.get('i')), num(r.get('fp')), r['id']))

    # the journals, most papers first
    jc = collections.Counter((r.get('j', ''), r.get('p', '')) for r in docs)
    journals = [list(k) + [c] for k, c in jc.most_common()]
    jidx = {(name, pub): i for i, (name, pub, _) in enumerate(journals)}

    # the pieces: a paper's title, authors and journal (list 0), and the start of its abstract (list 1, what is not already
    # in list 0)
    title_pieces, ab_pieces = [], []
    for r in docs:
        head = ' '.join([r.get('t', ''), ' '.join(r.get('a', [])), r.get('j', '')])
        pn = pieces(head)
        pa = pieces(r.get('ab', '')) - pn
        title_pieces.append(pn)
        ab_pieces.append(pa)
    df = collections.Counter()
    for pn, pa in zip(title_pieces, ab_pieces):
        df.update(pn)
        df.update(pa)
    cut = max(STOP_FLOOR, int(STOP_FRAC * len(docs)))   # only near-universal pieces (으로, 하는 …), not topical ones (입법, 선거)
    stop = [p for p, c in df.most_common() if c >= cut]
    stopset = set(stop)
    lists = collections.defaultdict(lambda: ([], []))
    for i in range(len(docs)):
        for f, src_set in ((0, title_pieces[i]), (1, ab_pieces[i])):
            for p in src_set:
                if p not in stopset:
                    lists[p][f].append(i)

    for sub in ('m', 'p'):
        d = os.path.join(dst, sub)
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))

    # f.bin: journalIdx, ym, cites, flags for every paper
    fb = bytearray()
    for r in docs:
        fl = 1 if r.get('open') else 0
        fb += struct.pack('<HHHB', jidx[(r.get('j', ''), r.get('p', ''))], min(ym(r), 65535), min(num(r.get('c')), 65535), fl)
    with open(os.path.join(dst, 'f.bin'), 'wb') as fh:
        fh.write(fb)

    # the rows, for showing a page of results
    for b in range(0, len(docs), BLOCK):
        with open(os.path.join(dst, 'm', '%d.tsv' % (b // BLOCK)), 'w', encoding='utf-8') as fh:
            for r in docs[b:b + BLOCK]:
                t = re.sub(r'\s+', ' ', r.get('t', '')).replace('\t', ' ')
                if len(t) > NAME:
                    t = t[:NAME - 1] + '…'
                ab = re.sub(r'\s+', ' ', r.get('ab', '')).replace('\t', ' ')[:LEAD]
                au = '·'.join(r.get('a', []))[:120].replace('\t', ' ')
                fh.write('\t'.join(str(x) for x in [r['id'], r.get('o', ''), jidx[(r.get('j', ''), r.get('p', ''))],
                         ('%04d%02d' % (num(r.get('y')), num(r.get('m')))) if num(r.get('y')) else '',
                         num(r.get('v')) or '', num(r.get('i')) or '', num(r.get('fp')) or '', num(r.get('lp')) or '',
                         1 if r.get('open') else 0, num(r.get('c')) or '', r.get('doi', ''), au, t, ab]) + '\n')

    # the piece shards, the same shape as precq/p (two lists per piece)
    by_shard = collections.defaultdict(list)
    for p in lists:
        by_shard[hash_of(p, SHARDS)].append(p)
    total = 0
    for k in range(SHARDS):
        ps = sorted(by_shard.get(k, []))
        head, data = bytearray(struct.pack('<H', len(ps))), bytearray()
        for p in ps:
            head += struct.pack('<HH', ord(p[0]), ord(p[1]))
            for ids in lists[p]:
                blob = bytearray()
                last = 0
                for i in ids:
                    varint(i - last, blob)
                    last = i
                head += struct.pack('<II', len(blob), len(ids))
                data += blob
        with open(os.path.join(dst, 'p', '%d.bin' % k), 'wb') as fh:
            fh.write(head + data)
        total += len(head) + len(data)

    yms = [ym(r) for r in docs if ym(r)]
    meta = dict(v=datetime.date.today().isoformat() + '.' + (commit or '')[:7], n=len(docs), shards=SHARDS, block=BLOCK,
                journals=journals, ymMin=min(yms) if yms else 0, ymMax=max(yms) if yms else 0, stop=stop,
                built=datetime.date.today().isoformat(), src=commit)
    with open(os.path.join(dst, 'v.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(docs), 'papers,', len(journals), 'journals,', len(lists), 'pieces,',
          sum(len(a) + len(b) for a, b in lists.values()), 'entries,', total, 'bytes of pieces')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '')
