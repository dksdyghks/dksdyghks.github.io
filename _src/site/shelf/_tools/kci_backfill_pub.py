"""Add the in-field flag (pub) to KCI law papers already gathered, from the journal name (kci_scope). Run before the index."""
import glob, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kci_scope
law = os.path.join(sys.argv[1], 'law')
changed = 0
for f in glob.glob(os.path.join(law, '2*.json')):
    rows = json.load(open(f, encoding='utf-8'))
    dirty = False
    for r in rows:
        want = 0 if not kci_scope.in_field(r.get('j', '')) else None
        if want == 0 and r.get('pub') != 0:
            r['pub'] = 0; dirty = True; changed += 1
        elif want is None and 'pub' in r:
            del r['pub']; dirty = True
    if dirty:
        json.dump(rows, open(f, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
nf = os.path.join(sys.argv[1], 'new.json')
if os.path.exists(nf):
    rows = json.load(open(nf, encoding='utf-8')); dirty = False
    for r in rows:
        if not kci_scope.in_field(r.get('j', '')):
            if r.get('pub') != 0: r['pub'] = 0; dirty = True
        elif 'pub' in r: del r['pub']; dirty = True
    if dirty: json.dump(rows, open(nf, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('marked', changed, 'out-of-field papers')
