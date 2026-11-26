"""The courts' judgments found by their words: shelf/precq/, an index of the public mirror precedent-kr (법제처's texts:
대법원 and 하급심), built from each judgment's 사건명, 판시사항 and 판결요지 so that 판례·법령 finds a judgment by what it is
about (당선무효, 허위사실공표, 선거운동 기간 …), not only by its number.

  shelf/precq/v.json        { v, fmt, n, shards, block, arts, courts, cats, stop, lead, built, src }
  shelf/precq/m/<b>.tsv     the judgments b*block … one a line: 사건번호 \t court \t yyyymmdd \t 사건명 \t category, then (left
                            out when empty, from the end) \t the number as the judgment writes it \t 1 for 전원합의체
                            \t how many judgments in the mirror name it in their 참조판례. The first column is the number that
                            opens it (shelf/prec/'s key: of joined numbers the first, 2025다220617 for 2025다220617, 220618);
                            the date is empty when the mirror has none
  shelf/precq/a/<k>.json    the articles each judgment names in its 참조조문 ("공직선거법|250", "헌법|37", "형법|30의2"), whose
                            hash is k, each with the judgments that name it (in the index's order) — so an article lists the
                            judgments on it
  shelf/precq/p/<k>.bin     the two-letter pieces whose hash is k, each with the judgments that hold it — in their 사건명,
                            else in their 판시사항, else only in their 판결요지 (three lists, so a search can put first the
                            judgments whose name says what was asked, then those whose 판시사항 does)

A judgment's number in the index (its line) follows its weight: 대법원 first, then 고등법원, then the rest; within each, the
leading judgments first (전원합의체, and those the mirror's 참조판례 name at least LEAD times), then the others, each newest
first (an undated judgment by the year in its number); so the judgments holding every piece asked for, taken in that order,
are already the ones to show first. A judgment the mirror keeps twice (under two categories, or once more under its
판례일련번호) is indexed once, as shelf/prec/ opens it: the first file of that court and number.

A piece is two letters next to each other once the spaces and punctuation are taken out (letters: Hangul, Latin, digits,
Hanja), so '소의 이익', '소의이익' and '재량권 일탈·남용' give the same pieces as the words written together, and a search can
ask for the words as one phrase (fmt 2; fmt 1 took pieces within a word and left the STOP commonest out, listed in stop). A
piece with a digit in it is not one (an article's or a case's number is found by those searches). No piece is left out.
Shard file: u16 count, then for each piece u16 u16 (its two letters) and, for each of its three lists (사건명, 판시사항,
판결요지), u32 bytes and u32 judgments; then the lists in that order, piece by piece, each ascending, as LEB128 gaps (the
first from 0). Little-endian.

  python3 prec_search.py <precedent-kr checkout> <shelf/precq> [commit]
"""
import json, os, re, struct, sys, collections, datetime, unicodedata

SHARDS, BLOCK, NAME, ARTS, LEAD = 4096, 128, 80, 256, 10
FMT = 2
OLD_NAMES = {'공직선거및선거부정방지법': '공직선거법', '대통령선거법': '대통령선거법', '정당법': '정당법'}   # a law under its earlier name
NO = re.compile(r'^((?:19|20)\d{2}|42\d{2}|\d{2})([가-힣]{1,4})(\d{1,7})')   # the number shelf/prec/ (prec_index.py) opens it by
NUM = re.compile(r'((?:19|20)\d{2}|42\d{2}|\d{2})\s*([가-힣]{1,4})\s*(\d{1,7})')   # one written with more ('사건2023구단13473', '대법원_2006두18270', '2011다 95564')
# a judgment named in 참조판례: 대법원 2006. 3. 16. 선고 2006두330 전원합의체 판결, 서울고법 2005. 12. 21. 선고 2005누4412 판결
CITE = re.compile(r'(대법원|[가-힣]+(?:고등|지방|행정|가정|특허|회생)법원(?:\s*[가-힣]+지원)?|[가-힣]+(?:고법|지법|행법|가법))\s*\d{4}\s*\.\s*\d{1,2}\s*\.'
                  r'\s*\d{1,2}\s*\.?\s*(?:선고|자)\s*(\d{2,4}\s*[가-힣]{1,3}\s*\d+)(\s*전원합의체)?')
SHORT = (('고법', '고등법원'), ('지법', '지방법원'), ('행법', '행정법원'), ('가법', '가정법원'))


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


def cites(text):
    """the judgments 참조판례 names, as 'court|number' ('대법원|2006두330'), and those of them it calls 전원합의체"""
    out, eb = set(), set()
    for m in CITE.finditer(text or ''):
        court = re.sub(r'\s+', '', m.group(1))
        for a, b in SHORT:
            court = court.replace(a, b)
        k = court + '|' + re.sub(r'\s+', '', m.group(2))
        out.add(k)
        if m.group(3):
            eb.add(k)
    return out, eb


def enbanc(text):
    """a 대법원 judgment signed by the whole court: 대법원장 presiding (대법원장 이용훈(재판장) 강신욱 …), or a dozen justices"""
    tail = text.rstrip()[-700:]
    last = tail[tail.rfind('\n') + 1:].strip()
    if len(last) > 300:
        return False
    names = re.sub(r'\([^)]*\)', ' ', last).split()
    return bool(names) and (re.sub(r'\s+', '', last).startswith('대법원장') or (names[0] in ('대법관', '대법원') and len(names) >= 8))


def hash_of(s, n):   # the same as precq.js
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) & 0xFFFFFFFF
    return h % n
LETTERS = re.compile(r'[^0-9A-Za-zㄱ-ㆎ가-힣㐀-䶿一-鿿\uf900-\ufaff]+')
DIGITS = re.compile(r'[0-9]+')


def pieces(text):   # (numbers are left to the search by article and by case number: a piece with a digit is not one)
    out = set()
    for w in DIGITS.split(LETTERS.sub('', unicodedata.normalize('NFKC', text or '')).lower()):
        out.update(w[i:i + 2] for i in range(len(w) - 1))
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


def year_of(no):   # where an undated judgment stands: the year in its number (2021두56558 → 2021, 4294민상898 → 1961, 66다1915 → 1966)
    m = NO.match(no)
    if not m:
        return 0
    y = int(m.group(1))
    return y - 2333 if y >= 4200 else y if y >= 1900 else 1900 + y


def varint(n, out):
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return


def read(src):
    """every judgment once, as shelf/prec/ opens it (the first file of a court and number, in the mirror's own order), with
    the judgments its 참조판례 names"""
    docs, seen = [], set()
    for cat in sorted(os.listdir(src)):
        for level in ('대법원', '하급심'):
            d = os.path.join(src, cat, level)
            if not os.path.isdir(d):
                continue
            for name in sorted(os.listdir(d)):
                if not name.endswith('.md'):
                    continue
                seg = name[:-3].split('_')
                if len(seg) < 3 or not seg[0].endswith('법원'):
                    continue
                no = '_'.join(seg[2:])
                m = NO.match(no) or NUM.search(no)
                first = ''.join(m.groups()) if m else no
                if (seg[0], first) in seen:
                    continue
                try:
                    text = open(os.path.join(d, name), encoding='utf-8').read()
                except (OSError, UnicodeDecodeError):
                    continue
                seen.add((seg[0], first))
                head, secs = parse(text)
                day = re.sub(r'\D', '', seg[1])[:8]
                day = '' if not day.strip('0') else day
                written = re.sub(r'\s*,\s*', ', ', re.sub(r'\s+', ' ', head.get('사건번호', ''))).strip()
                named, eb = cites(secs.get('참조판례', ''))
                docs.append(dict(court=seg[0], day=day, at=int(day) if day else year_of(first) * 10000, no=first,
                                 written=written if NO.match(written) and written != first else '', cat=cat,
                                 title=re.sub(r'\s+', ' ', head.get('사건명', '')).strip(),
                                 texts=(head.get('사건명', ''), secs.get('판시사항', ''), secs.get('판결요지', '')),
                                 refs=refs(secs.get('참조조문', '')), named=named, eb=eb,
                                 self_eb=seg[0] == '대법원' and enbanc(secs.get('판례내용', '') or text)))
    return docs


def main(src, dst, commit=''):
    docs = read(src)
    if len(docs) < 1000:
        sys.exit('too few judgments read: %d' % len(docs))
    # the leading judgments: 전원합의체 (signed by the whole court, or named so by another judgment), and those cited often
    cited, eb = collections.Counter(), set()
    for x in docs:
        cited.update(x['named'])
        eb |= x['eb']
    for x in docs:
        k = x['court'] + '|' + x['no']
        x['cited'] = cited.get(k, 0)
        x['enbanc'] = x['self_eb'] or k in eb
        x['lead'] = 0 if LEAD and (x['enbanc'] or x['cited'] >= LEAD) else 1
    docs.sort(key=lambda x: (rank(x['court']), x['lead'], -x['at'], x['no']))
    # every piece, with the judgments holding it in their name, else their 판시사항, else their 판결요지: LEB128 gaps as they come
    lists = {}
    entries = 0
    for i, x in enumerate(docs):
        pn = pieces(x['texts'][0])
        pp = pieces(x['texts'][1]) - pn
        ps = pieces(x['texts'][2]) - pn - pp
        x['texts'] = None
        for f, part in enumerate((pn, pp, ps)):
            entries += len(part)
            for p in part:
                e = lists.get(p)
                if e is None:
                    e = lists[p] = [bytearray(), bytearray(), bytearray(), 0, 0, 0, 0, 0, 0]
                varint(i - e[3 + f], e[f])
                e[3 + f] = i
                e[6 + f] += 1
    courts = sorted({x['court'] for x in docs}, key=lambda c: (rank(c), c))
    cats = sorted({x['cat'] for x in docs})
    ci, ki = {c: i for i, c in enumerate(courts)}, {c: i for i, c in enumerate(cats)}
    for sub in ('m', 'p', 'a'):
        os.makedirs(os.path.join(dst, sub), exist_ok=True)
        for f in os.listdir(os.path.join(dst, sub)):
            os.remove(os.path.join(dst, sub, f))
    for b in range(0, len(docs), BLOCK):
        with open(os.path.join(dst, 'm', '%d.tsv' % (b // BLOCK)), 'w', encoding='utf-8') as fh:
            for x in docs[b:b + BLOCK]:
                title = x['title'].replace('\t', ' ')
                if len(title) > NAME:
                    title = title[:NAME - 1] + '…'
                cols = [x['no'], str(ci[x['court']]), x['day'], title, str(ki[x['cat']]), x['written'].replace('\t', ' '),
                        '1' if x['enbanc'] else '', str(x['cited']) if x['cited'] else '']
                while cols[-1] == '':
                    cols.pop()
                fh.write('\t'.join(cols) + '\n')
    by_shard = collections.defaultdict(list)
    for p in lists:
        by_shard[shard_of(p)].append(p)
    total = biggest = 0
    for k in range(SHARDS):
        ps = sorted(by_shard.get(k, []))
        head, data = bytearray(struct.pack('<H', len(ps))), bytearray()
        for p in ps:
            e = lists[p]
            head += struct.pack('<HH', ord(p[0]), ord(p[1]))
            for f in range(3):
                head += struct.pack('<II', len(e[f]), e[6 + f])
                data += e[f]
        with open(os.path.join(dst, 'p', '%d.bin' % k), 'wb') as fh:
            fh.write(head + data)
        total += len(head) + len(data)
        biggest = max(biggest, len(head) + len(data))
    by_art = collections.defaultdict(lambda: collections.defaultdict(list))
    for i, x in enumerate(docs):
        for k in x['refs']:
            by_art[hash_of(k, ARTS)][k].append(i)
    for k in range(ARTS):
        with open(os.path.join(dst, 'a', '%d.json' % k), 'w', encoding='utf-8') as fh:
            json.dump(by_art.get(k, {}), fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    print(sum(len(v) for v in by_art.values()), 'articles named in 참조조문,', sum(len(ids) for v in by_art.values() for ids in v.values()), 'times')
    print(sum(1 for x in docs if x['enbanc']), '전원합의체,', sum(1 for x in docs if x['cited']), 'judgments named in 참조판례,',
          sum(1 for x in docs if not x['lead']), 'leading (전원합의체, or named %d times or more)' % LEAD)
    meta = dict(v=datetime.date.today().isoformat() + '.' + (commit or '')[:7], fmt=FMT, n=len(docs), shards=SHARDS, block=BLOCK, arts=ARTS,
                courts=courts, cats=cats, stop=[], lead=LEAD, built=datetime.date.today().isoformat(), src=commit)
    with open(os.path.join(dst, 'v.json'), 'w', encoding='utf-8') as fh:
        json.dump(meta, fh, ensure_ascii=False, separators=(',', ':'))
    print(len(docs), 'judgments,', len(lists), 'pieces,', entries, 'entries,', total, 'bytes of pieces (largest shard %d)' % biggest)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else '')
