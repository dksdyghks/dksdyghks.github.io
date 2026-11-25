"""The courts' judgments found by their words: shelf/precq/, an index of the public mirror precedent-kr (법제처's texts:
대법원 and 하급심), built from each judgment's 사건명, 판시사항 and 판결요지 so that 판례·법령 finds a judgment by what it is
about (당선무효, 허위사실공표, 선거운동 기간 …), not only by its number.

  shelf/precq/v.json        { v, n, shards, block, courts, cats, stop, built, src }
  shelf/precq/m/<b>.tsv     the judgments b*block … : 사건번호 \t court \t yyyymmdd \t 사건명 \t category (one a line)
  shelf/precq/a/<k>.json    the articles each judgment names in its 참조조문 ("공직선거법|250", "헌법|37", "형법|30의2"), whose
                            hash is k, each with the judgments that name it (in the index's order) — so an article lists the
                            judgments on it
  shelf/precq/p/<k>.bin     the two-letter pieces whose hash is k, each with the judgments that hold it — in their 사건명,
                            else in their 판시사항, else only in their 판결요지 (three lists, so a search can put first the
                            judgments whose name says what was asked, then those whose 판시사항 does)

A judgment's number in the index (its line) follows its weight: 대법원 first, then 고등법원, then the rest, each newest first;
so the judgments holding every piece asked for, taken in that order, are already the ones to show first.

A piece is two letters next to each other within a word (letters: Hangul, Latin, digits, Hanja); a word of one letter has
none, nor does a piece with a digit in it (an article's or a case's number is found by those searches). The pieces nearly every judgment has (하여, 으로, 경우 …: STOP of them) are left out and listed in v.json, so a search
leaves them aside. Shard file: u16 count, then for each piece u16 u16 (its two letters) and, for each of its three lists
(사건명, 판시사항, 판결요지), u32 bytes and u32 judgments; then the lists in that order, piece by piece, each ascending, as
LEB128 gaps (the first from 0). Little-endian.

  python3 prec_search.py <precedent-kr checkout> <shelf/precq> [commit]
"""
import json, os, re, struct, sys, collections, datetime, unicodedata

SHARDS, BLOCK, STOP, NAME, ARTS = 1024, 8192, 300, 80, 256
OLD_NAMES = {'공직선거및선거부정방지법': '공직선거법', '대통령선거법': '대통령선거법', '정당법': '정당법'}   # a law under its earlier name


def refs(text):
    """the articles 참조조문 names: 'law|article' ('공직선거법|250', '형법|30의2'); a bare 제N조 is of the law named before it"""
    t = unicodedata.normalize('NFKC', text or '')
    for _ in range(3):   # the notes in brackets ((2007. 1. 26. 법률 제8293호로 개정되기 전의 것), (현행 제23조 참조)) go
        t = re.sub(r'\([^()]*\)', ' ', t)
    out = set()
    for seg in re.split(r'\s*/\s*|\n', t):
        law = None
        for m in re.finditer(r'(?:((?:구\s*)?[「『]?[가-힣A-Za-z·ㆍ ]{1,60}?(?:법률|법|령|규칙|규정|조례|협정|조약))[」』]?\s*)?제\s*(\d+)\s*조(?:\s*의\s*(\d+))?', seg):
            if m.group(1):
                name = re.sub(r'[\s「」『』]', '', m.group(1))
                name = re.sub(r'^(?:구|및|또는|등)', '', name)
                if name in ('같은법', '동법', '같은법률', '동법률'):
                    name = law
                law = OLD_NAMES.get(name, name) if name else law
            if not law or len(law) < 2:
                continue
            out.add('%s|%s%s' % (law, int(m.group(2)), '의%d' % int(m.group(3)) if m.group(3) else ''))
    return out


def hash_of(s, n):   # the same as precq.js
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h % n
LETTERS = re.compile(r'[^0-9A-Za-zㄱ-ㆎ가-힣㐀-䶿一-鿿豈-﫿]+')


def words(text):
    return LETTERS.sub(' ', unicodedata.normalize('NFKC', text)).lower().split()


def pieces(text):   # (numbers are left to the search by article and by case number)
    out = set()
    for w in words(text):
        for i in range(len(w) - 1):
            p = w[i:i + 2]
            if not (p[0].isdigit() or p[1].isdigit()):
                out.add(p)
    return out


def shard_of(p):   # the same as precq.js
    return hash_of(p, SHARDS)


def parse(text):
    m = re.match(r'---\n(.*?)\n---\n', text, re.S)
    head = {}
    if m:
        for line in m.group(1).split('\n'):
            if ':' in line:
                k, v = line.split(':', 1)
                head[k.strip()] = v.strip().strip('\'"')
    body = text[m.end():] if m else text
    secs = {s.group(1): s.group(2).strip() for s in re.finditer(r'^##\s*(.+?)\s*\n([\s\S]*?)(?=^##\s|\Z)', body, re.M)}
    return head, secs


def rank(court):
    return 0 if court == '대법원' else 1 if '고등법원' in court or court == '특허법원' else 2


def varint(n, out):
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def main(src, dst, commit=''):
    docs = []
    for cat in sorted(os.listdir(src)):
        for level in ('대법원', '하급심'):
            d = os.path.join(src, cat, level)
            if not os.path.isdir(d):
                continue
            for name in os.listdir(d):
                if not name.endswith('.md'):
                    continue
                seg = name[:-3].split('_')
                if len(seg) < 3 or not seg[0].endswith('법원'):
                    continue
                try:
                    head, secs = parse(open(os.path.join(d, name), encoding='utf-8').read())
                except (OSError, UnicodeDecodeError):
                    continue
                no = '_'.join(seg[2:])
                day = re.sub(r'\D', '', seg[1])[:8]
                title = re.sub(r'\s+', ' ', head.get('사건명', '')).strip()
                pn = pieces(title)
                pp = pieces(secs.get('판시사항', '')) - pn
                ps = pieces(secs.get('판결요지', '')) - pn - pp
                docs.append((rank(seg[0]), -int(day or 0), no, seg[0], day, title, cat, (pn, pp, ps), refs(secs.get('참조조문', ''))))
    docs.sort(key=lambda x: (x[0], x[1], x[2]))
    if len(docs) < 1000:
        sys.exit('too few judgments read: %d' % len(docs))
    df = collections.Counter()
    for x in docs:
        for part in x[7]:
            df.update(part)
    stop = [p for p, _ in df.most_common(STOP)]
    stopset = set(stop)
    lists = collections.defaultdict(lambda: ([], [], []))
    for i, x in enumerate(docs):
        for f, part in enumerate(x[7]):
            for p in part:
                if p not in stopset:
                    lists[p][f].append(i)
    courts = sorted({x[3] for x in docs}, key=lambda c: (rank(c), c))
    cats = sorted({x[6] for x in docs})
    ci, ki = {c: i for i, c in enumerate(courts)}, {c: i for i, c in enumerate(cats)}
    for sub in ('m', 'p', 'a'):
        os.makedirs(os.path.join(dst, sub), exist_ok=True)
        for f in os.listdir(os.path.join(dst, sub)):
            os.remove(os.path.join(dst, sub, f))
    for b in range(0, len(docs), BLOCK):
        with open(os.path.join(dst, 'm', '%d.tsv' % (b // BLOCK)), 'w', encoding='utf-8') as fh:
            for x in docs[b:b + BLOCK]:
                title = x[5].replace('\t', ' ')
                if len(title) > NAME:
                    title = title[:NAME - 1] + '…'
                fh.write('%s\t%d\t%s\t%s\t%d\n' % (x[2], ci[x[3]], x[4], title, ki[x[6]]))
    by_shard = collections.defaultdict(list)
    for p in lists:
        by_shard[shard_of(p)].append(p)
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
    cited = collections.defaultdict(list)
    for i, x in enumerate(docs):
        for k in x[8]:
            cited[k].append(i)
    by_art = collections.defaultdict(dict)
    for k, ids in cited.items():
        by_art[hash_of(k, ARTS)][k] = ids
    for k in range(ARTS):
        with open(os.path.join(dst, 'a', '%d.json' % k), 'w', encoding='utf-8') as fh:
            json.dump(by_art.get(k, {}), fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    print(len(cited), 'articles named in 참조조문,', sum(len(v) for v in cited.values()), 'times')
    meta = dict(v=datetime.date.today().isoformat() + '.' + (commit or '')[:7], n=len(docs), shards=SHARDS, block=BLOCK, arts=ARTS,
                courts=courts, cats=cats, stop=stop, built=datetime.date.today().isoformat(), src=commit)
    with open(os.path.join(dst, 'v.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(docs), 'judgments,', len(lists), 'pieces,', sum(len(a) + len(b) + len(c) for a, b, c in lists.values()), 'entries,', total, 'bytes of pieces')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '')
