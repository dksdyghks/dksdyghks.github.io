"""The index of the courts' judgments kept in the public mirror precedent-kr (법제처's texts): shelf/prec/{year}.json,
case number → "category|file stem", one file a year (the year in the number: 2000두7735 → 2000.json, 95누1234 → 95.json,
4281민상298 → 4281.json). 대법원 first; a 하급심 judgment under the same number follows after ';'.

  git clone --filter=blob:none --no-checkout --depth 1 https://github.com/legalize-kr/precedent-kr prec
  git -C prec ls-tree -r --name-only HEAD > prec-files.txt
  python3 prec_index.py prec-files.txt ../prec
"""
import json, os, re, sys, collections

NO = re.compile(r'^((?:19|20)\d{2}|42\d{2}|\d{2})([가-힣]{1,4})(\d{1,7})')
# a file name with more before the number, or spaces inside it (사건2023구단13473, 서울고법2006누16559, 2011다 95564): the number
# found in it, its spaces taken out (as the index of judgments by their words reads it)
NO_IN = re.compile(r'(?<!\d)((?:19|20)\d{2}|42\d{2}|\d{2})\s*([가-힣]{1,4})\s*(\d{1,7})')


def main(listing, dst):
    out = collections.defaultdict(dict)
    for line in open(listing, encoding='utf-8'):
        parts = line.strip().split('/')
        if len(parts) != 3 or parts[1] not in ('대법원', '하급심') or not parts[2].endswith('.md'):
            continue
        cat, stem = parts[0], parts[2][:-3]
        seg = stem.split('_')
        if len(seg) < 3 or not seg[0].endswith('법원'):
            continue
        m = NO.match('_'.join(seg[2:])) or NO_IN.search('_'.join(seg[2:]))
        if not m:
            continue
        key, year = ''.join(m.groups()), m.group(1)
        entry = cat + '|' + stem
        # a judgment kept under the other level's folder (a 고등법원 judgment under 대법원/): its folder said, as the app
        # otherwise reads the folder from the court's name
        if (parts[1] == '대법원') != (seg[0] == '대법원'):
            entry += '|' + parts[1]
        have = out[year].get(key)
        if not have:
            out[year][key] = entry
        elif parts[1] == '대법원' and not have.split(';')[0].split('|')[1].startswith('대법원_'):
            out[year][key] = entry + ';' + have          # 대법원 first
        elif not any(e.split('|')[1].split('_')[0] == seg[0] for e in have.split(';')):
            out[year][key] = have + ';' + entry          # another court's judgment under the same number
    os.makedirs(dst, exist_ok=True)
    for f in os.listdir(dst):
        if f.endswith('.json'):
            os.remove(os.path.join(dst, f))
    total = 0
    for year, d in out.items():
        with open(os.path.join(dst, year + '.json'), 'w', encoding='utf-8') as fh:
            json.dump(d, fh, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
        total += len(d)
    print(len(out), 'years,', total, 'case numbers')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
