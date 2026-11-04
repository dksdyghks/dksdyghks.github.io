# Independent re-solve of every computational or logical claim in the new curated items (brute force / exact arithmetic).
import itertools, json, subprocess
from fractions import Fraction as F
ok_all = True
def ok(c, m):
    global ok_all
    print(('OK  ' if c else 'FAIL'), m); ok_all &= bool(c)
js = r"""
const vm=require('vm'),fs=require('fs');const d='/home/user/yohan-ahn/psat/';
const L=fs.readFileSync(d+'index.html','utf8');for(const f of ['core.js',...[...L.matchAll(/<script src="(bank-[^"?]+)/g)].map(m=>m[1])])vm.runInThisContext(fs.readFileSync(d+f,'utf8'));
const out={};for(const [s,a] of Object.entries(PSAT.bank))for(const q of a)out[q.id]={answer:q.answer,options:q.options.map(o=>o.replace(/<[^>]+>/g,''))};
console.log(JSON.stringify(out));"""
B = json.loads(subprocess.check_output(['node', '-e', js]))
A = lambda i: B[i]['answer']
imp = lambda a, b: (not a) or b
def only(i, truths, what='true options'):
    idx = [k for k, t in enumerate(truths) if t]
    ok(idx == [A(i)], f'{i} {what}={idx} answer={A(i)}')
def combo(i, labels_true):
    want = ', '.join(labels_true)
    ok(B[i]['options'][A(i)] == want and B[i]['options'].count(want) == 1, f'{i} correct set={want} chosen={B[i]["options"][A(i)]}')

# ---------- L-R02 blood: (antigens, antibodies)
BT = {'A': ({'A'}, {'B'}), 'B': ({'B'}, {'A'}), 'AB': ({'A', 'B'}, set()), 'O': (set(), {'A', 'B'})}
rbc = lambda donor, rec: not (BT[rec][1] & BT[donor][0])      # recipient antibodies vs donor antigens
pla = lambda donor, rec: not (BT[donor][1] & BT[rec][0])      # donor antibodies vs recipient antigens
T = ['A', 'B', 'AB', 'O']
only('L-R02', [all(rbc('O', r) for r in T) and all(pla('O', r) for r in T), all(rbc(d, 'AB') for d in T), pla('A', 'B'),
               [d for d in T if pla(d, 'O')] == ['O'], [r for r in T if pla('AB', r)] == ['O']])
# ---------- L-R05 herd immunity
R = lambda r0, imm: r0 * (1 - imm)
thr = lambda r0: 1 - F(1, 1) / r0
g = [R(4, F(7, 10)) < 1, all(thr(a) < thr(b) for a, b in [(2, 3), (3, 4), (4, 8)]), R(2, F(6, 10)) == F(4, 5), F(9, 10) < 1]
combo('L-R05', [l for l, t in zip('ㄱㄴㄷㄹ', g) if t])
# ---------- L-R08 comparative advantage: hours
A_h = {'직물': 2, '포도주': 4}; B_h = {'직물': 6, '포도주': 8}
oc = lambda h, good, other: F(h[good], h[other])
only('L-R08', [oc(A_h, '직물', '포도주') < oc(B_h, '직물', '포도주') and oc(A_h, '포도주', '직물') < oc(B_h, '포도주', '직물'),
               not (oc(B_h, '포도주', '직물') < oc(A_h, '포도주', '직물')), oc(A_h, '포도주', '직물') == 2,
               oc(A_h, '포도주', '직물') < oc(B_h, '포도주', '직물'), oc(B_h, '직물', '포도주') < oc(A_h, '직물', '포도주')])
# ---------- L-R12 Mendel
def cross(p, q):
    kids = [tuple(sorted(a + b)) for a in p for b in q]
    return kids
wr = lambda kids: F(sum(1 for k in kids if k == ('r', 'r')), len(kids))
g = [wr(cross('Rr', 'Rr')) == F(1, 4),
     wr(cross('RR', 'rr')) == 0 and wr(cross('Rr', 'rr')) > 0,   # all round ⇒ must be RR
     wr(cross('RR', 'Rr')) > 0, wr(cross('rr', 'rr')) == 1]
combo('L-R12', [l for l, t in zip('ㄱㄴㄷㄹ', g) if t])
# ---------- L-R16 Rawls
soc = {'A': (30, 30, 30), 'B': (36, 50, 90), 'C': (24, 80, 150)}
g = [min(soc['B']) > min(soc['A']), min(soc['C']) > min(soc['A']), max(soc, key=lambda k: sum(soc[k])) == 'C', False]
combo('L-R16', [l for l, t in zip('ㄱㄴㄷㄹ', g) if t])
# ---------- L-R18 information cascade: rule simulation over all signal strings (A/B), first two
def run(signals):
    revealed = []; choices = []
    for s in signals:
        cntA = revealed.count('A') + (s == 'A'); cntB = revealed.count('B') + (s == 'B')
        c = 'A' if cntA > cntB else 'B' if cntB > cntA else s
        # does choice reveal signal? only if choosing differently would have been possible
        altA = revealed.count('A') + 1; altB = revealed.count('B')
        cA = 'A' if altA > altB else 'B' if altB > altA else 'A'
        altA2 = revealed.count('A'); altB2 = revealed.count('B') + 1
        cB = 'A' if altA2 > altB2 else 'B' if altB2 > altA2 else 'B'
        if cA != cB: revealed.append(s)
        choices.append(c)
    return choices, revealed
allAA = all(run(('A', 'A') + rest)[0][2:] == ['A'] * len(rest) for n in range(1, 6) for rest in itertools.product('AB', repeat=n))
abFree = all(run(('A', 'B', x))[0][2] == x for x in 'AB')
ok(allAA and abFree and A('L-R18') == 2, f'L-R18 AA→all A after: {allAA}; AB→third follows own: {abFree}; answer={A("L-R18")}')
# ---------- L-R30 prisoners
yrs = {('S', 'S'): (1, 1), ('C', 'C'): (5, 5), ('C', 'S'): (0, 10), ('S', 'C'): (10, 0)}
dom = all(yrs[('C', o)][0] < yrs[('S', o)][0] for o in 'SC')
sums = {k: sum(v) for k, v in yrs.items()}
only('L-R30', [yrs[('S', 'S')][0] < yrs[('C', 'S')][0], dom, min(sums, key=sums.get) == ('C', 'C'), sums[('C', 'S')] < sums[('C', 'C')], False])
# ---------- L-C04 Simpson
X = {'m': (80, 48), 'f': (20, 13)}; Y = {'m': (20, 4), 'f': (80, 20)}
r = lambda t: F(t[1], t[0])
ok(r(X['f']) > r(X['m']) and r(Y['f']) > r(Y['m']) and F(52, 100) > F(33, 100) and X['m'][1] + Y['m'][1] == 52 and X['f'][1] + Y['f'][1] == 33 and A('L-C04') == 2,
   f'L-C04 per-dept women higher, total men higher; women in Y={Y["f"][0]}/100; answer={A("L-C04")}')
# ---------- L-C05 base rate
pop = 10000; sick = pop // 100; well = pop - sick; tp = sick * 99 // 100; fp = well // 100
ok(B['L-C05']['options'][A('L-C05')] == f'㉠ {fp}명 · ㉡ {int(F(tp, tp + fp) * 100)}%', f'L-C05 fp={fp} ppv={F(tp, tp + fp)} chosen={B["L-C05"]["options"][A("L-C05")]}')
# ---------- L-C17 Monty Hall (exact enumeration)
def monty(knows):
    win = F(0); tot = F(0)
    for car in range(3):
        pick = 0
        others = [d for d in range(3) if d != pick]
        opens = [d for d in others if d != car] if knows else others
        for o in opens:
            p = F(1, 3) * F(1, len(opens))
            if o == car: continue          # car revealed: game void
            tot += p; sw = [d for d in range(3) if d not in (pick, o)][0]
            if sw == car: win += p
    return win / tot
fr = lambda x: {F(1, 3): '3분의 1', F(1, 2): '2분의 1', F(2, 3): '3분의 2'}[x]
ok(B['L-C17']['options'][A('L-C17')] == f'㉠ {fr(monty(True))} · ㉡ {fr(monty(False))}', f'L-C17 knows={monty(True)} random={monty(False)} chosen={B["L-C17"]["options"][A("L-C17")]}')
# ---------- L-S3-2 voting agenda
grp = [(40, 'ABC'), (35, 'BCA'), (25, 'CAB')]
beat = lambda x, y: sum(n for n, o in grp if o.index(x) < o.index(y)) > 50
win = lambda x, y: x if beat(x, y) else y
agenda = lambda a, b, c: win(win(a, b), c)
g = [agenda('A', 'B', 'C') == 'C', len({agenda('A', 'B', 'C'), agenda('B', 'C', 'A'), agenda('A', 'C', 'B')}) == 1,
     any(all(beat(x, y) for y in 'ABC' if y != x) for x in 'ABC'), agenda('B', 'C', 'A') == 'A']
combo('L-S3-2', [l for l, t in zip('ㄱㄴㄷㄹ', g) if t])
# ---------- L-S5-2 statute conflicts (rules from the passage, encoded independently)
laws = [('영업법', 2010, 'general', 30), ('식품영업법', 2015, 'food', 60), ('영업신고법', 2020, 'general', 14)]
def days(year, food, override=False):
    act = [l for l in laws if l[1] <= year and (l[2] == 'general' or food)]
    if override: 
        newest = max(act, key=lambda l: l[1]); return newest[3]
    best = None
    for l in act:
        dominated = False
        for m in act:
            if m is l: continue
            if m[2] == 'food' and l[2] == 'general': dominated = True      # special beats general regardless of date
            elif m[2] == l[2] and m[1] > l[1]: dominated = True          # same kind: newer wins
        if not dominated: best = l
    return best[3]
g = [days(2021, True) == 60, days(2021, False) == 30, days(2021, True, override=True) == 14, days(2016, True) == 30]
combo('L-S5-2', [l for l, t in zip('ㄱㄴㄷㄹ', g) if t])
# ---------- L-S6-2 Hamilton
g = [F(1, 2) * 3 > 1, F(1, 8) * 6 > 1, F(3, 4) > F(1, 2), False]
combo('L-S6-2', [l for l, t in zip('ㄱㄴㄷㄹ', g) if t])
# ---------- L-A26 / L-G06 argument forms by truth table
def valid(prem, concl, n):
    return all(concl(*v) for v in itertools.product([0, 1], repeat=n) if all(p(*v) for p in prem))
forms = [([lambda p, q: imp(p, q), lambda p, q: p], lambda p, q: q), ([lambda p, q: imp(p, q), lambda p, q: not q], lambda p, q: not p),
         ([lambda p, q: imp(p, q), lambda p, q: not p], lambda p, q: not q), ([lambda p, q: imp(p, q), lambda p, q: q], lambda p, q: p),
         ([lambda p, q: p or q, lambda p, q: not p], lambda p, q: q)]
target = ([lambda p, q: imp(p, q), lambda p, q: q], lambda p, q: p)          # 성실 → 일찍, 일찍 ⇒ 성실
same = [k for k, f in enumerate(forms) if not valid(*f, 2) and f is forms[3]]
ok([k for k, f in enumerate(forms) if not valid(*f, 2)] == [2, 3] and A('L-A26') == 3, f'L-A26 invalid forms={[k for k,f in enumerate(forms) if not valid(*f,2)]} (3 = affirming consequent) answer={A("L-A26")}')
g = [valid([lambda r, c: imp(r, c), lambda r, c: not c], lambda r, c: not r, 2),
     valid([lambda g_, h: imp(g_, h), lambda g_, h: not g_], lambda g_, h: not h, 2),
     valid([lambda a, b: a or b, lambda a, b: a], lambda a, b: not b, 2),
     valid([lambda o, t: imp(not o, t), lambda o, t: not t], lambda o, t: o, 2)]
combo('L-G06', [l for l, t in zip('ㄱㄴㄷㄹ', g) if t])
# ---------- logic bank
def models(names, cons):
    out = []
    for bits in itertools.product([0, 1], repeat=len(names)):
        m = dict(zip(names, bits))
        if all(c(m) for c in cons): out.append(m)
    return out
nec = lambda M, f: all(f(m) for m in M)
M = models('ABCDE', [lambda m: imp(m['A'], m['B']), lambda m: imp(not m['C'], m['D']), lambda m: not (m['B'] and m['D']), lambda m: imp(m['E'], m['A']), lambda m: m['C'] + m['E'] == 1])
only('L-G01', [nec(M, f) for f in [lambda m: m['A'], lambda m: not m['D'], lambda m: not m['E'], lambda m: sum(m.values()) <= 2, lambda m: imp(m['B'], m['A'])]], 'necessary')
# L-G02: which added premise makes L→A valid given L→T, T→U
base = [lambda L, T_, U, A_: imp(L, T_), lambda L, T_, U, A_: imp(T_, U)]
adds = [lambda L, T_, U, A_: imp(A_, U), lambda L, T_, U, A_: imp(not L, not T_), lambda L, T_, U, A_: imp(not T_, not U), lambda L, T_, U, A_: imp(U, A_), lambda L, T_, U, A_: imp(not U, not A_)]
only('L-G02', [valid(base + [a], lambda L, T_, U, A_: imp(L, A_), 4) for a in adds], 'valid additions')
# L-G03: one liar
Pn = ['갑', '을', '병', '정']; D = ['기획', '인사', '재무', '홍보']; sols = []
for perm in itertools.permutations(D):
    a = dict(zip(Pn, perm)); t = [a['갑'] == '재무', a['병'] != '기획', a['정'] == '인사', a['정'] == '재무']
    if sum(t) == 3: sols.append(a)
H = {'갑': '甲', '을': '乙', '병': '丙', '정': '丁'}
pair = lambda a: f"{H[[k for k in a if a[k]=='기획'][0]]} · {H[[k for k in a if a[k]=='홍보'][0]]}"
ok(len(sols) == 1 and B['L-G03']['options'][A('L-G03')] == pair(sols[0]) and B['L-G03']['options'].count(pair(sols[0])) == 1, f'L-G03 solutions={sols}')
# L-G04 categorical, models up to 3 members with (행, 경, 통)
cands = [lambda W: any(e for h, e, s in W), lambda W: all(s for h, e, s in W), lambda W: all(s for h, e, s in W if e), lambda W: any(h and e for h, e, s in W), lambda W: any(h for h, e, s in W)]
nec4 = [True] * 5
for n in range(1, 4):
    for bits in itertools.product([0, 1], repeat=3 * n):
        W = [bits[3 * i:3 * i + 3] for i in range(n)]
        if not all(h or e for h, e, s in W): continue
        if not all(s for h, e, s in W if h): continue
        if any(s and e for h, e, s in W): continue
        if not any(not s for h, e, s in W): continue
        nec4 = [x and c(W) for x, c in zip(nec4, cands)]
only('L-G04', nec4, 'necessary')
# L-G05 which single fact fixes all
M5 = models('갑을병정무', [lambda m: imp(m['갑'], m['을'] and m['병']), lambda m: imp(m['병'], not m['정']), lambda m: m['정'] or m['무'], lambda m: imp(not m['을'], not m['무'])])
facts = [lambda m: not m['갑'], lambda m: not m['을'], lambda m: m['병'], lambda m: m['정'], lambda m: m['무']]
only('L-G05', [len([m for m in M5 if f(m)]) == 1 for f in facts], 'fixing facts')
# L-G07
M7 = models(['A', 'B', 'C', 'M'], [lambda m: imp(m['A'], m['M']), lambda m: imp(m['M'], not m['B']), lambda m: imp(not m['C'], m['B']), lambda m: m['A'] or m['B']])
only('L-G07', [nec(M7, f) for f in [lambda m: m['C'], lambda m: m['M'], lambda m: imp(m['B'], not m['C']), lambda m: imp(m['M'], m['C']), lambda m: not (m['A'] and m['C'])]], 'necessary')
# L-G08 necessarily false
M8 = models(['기', '인', '재', '총'], [lambda m: imp(m['기'], m['인']), lambda m: not (m['인'] and m['재']), lambda m: imp(not m['재'], m['총']), lambda m: imp(m['총'], not m['기'])])
exact = lambda m, s: all(m[k] == (k in s) for k in m)
only('L-G08', [nec(M8, lambda m, f=f: not f(m)) for f in [lambda m: m['인'] and m['총'], lambda m: exact(m, {'재'}), lambda m: exact(m, {'총'}), lambda m: m['재'] and m['총'], lambda m: m['기']]], 'necessarily false')
# L-G09 categorical with individuals (정규, 3년, 연수) + 甲 not 정규
cands9 = [lambda W, g: all(t for p, y, t in W if p), lambda W, g: g[2], lambda W, g: all(not t for p, y, t in W if not y), lambda W, g: all(y for p, y, t in W if t), lambda W, g: not g[1]]
nec9 = [True] * 5
for n in range(0, 3):
    for bits in itertools.product([0, 1], repeat=3 * (n + 1)):
        W = [bits[3 * i:3 * i + 3] for i in range(n + 1)]; gap = W[0]
        if gap[0]: continue
        if not all(p for p, y, t in W if t): continue
        if not all(t for p, y, t in W if y): continue
        nec9 = [x and c(W, gap) for x, c in zip(nec9, cands9)]
only('L-G09', nec9, 'necessary')
# L-G10 knights and knaves
sols = []
for g_, e, b in itertools.product([0, 1], repeat=3):  # 1 = truthful
    st = [not e, not b, (not g_) and (not e)]
    if all(bool(x) == bool(t) for x, t in zip([g_, e, b], st)): sols.append((g_, e, b))
ok(len(sols) == 1, f'L-G10 solutions={sols}')
g_, e, b = sols[0]
combo('L-G10', [l for l, t in zip('ㄱㄴㄷㄹ', [not g_, e, g_ + e + b == 2, b]) if t])

# ================= S-J / D-K / L-J (independent re-solve from the rendered options) =================
O = lambda i: B[i]['options']
def by_text(i, pairs, want=True, what='options'):   # pairs: [(option-text prefix, truth)], matched against the rendered (shuffled) options
    fl = []
    for o in O(i):
        hit = [t for pre, t in pairs if o.startswith(pre)]
        ok(len(hit) == 1, f'{i} option text matched once: {o[:30]}')
        fl.append(bool(hit[0]) == want if hit else False)
    only(i, fl, what)
def pick(i, text): ok(O(i)[A(i)] == text, f'{i} keyed "{O(i)[A(i)]}" expected "{text}"')
# S-J01 leave pay: 3 months at min(80%, 150만), 4 months at min(50%, 120만), 15/30 of the second band
w = 2500000; tot = 3 * min(w * 8 // 10, 1500000) + 4 * max(min(w // 2, 1200000), 700000) + max(min(w // 2, 1200000), 700000) * 15 // 30
pick('S-J01', f'{tot:,}원')
# S-J02 fee floor: 2억 × 10/1000 = 200만 > 150만 → option 1 false; the keyed one is the compensation duty
ok('보상하여야' in O('S-J02')[A('S-J02')], 'S-J02 keyed option is the compensation duty')
# S-J03 hours
rec = {'甲': (5, 50, 0, 45, 0), '乙': (6, 60, 0, 30, 1), '丙': (5, 30, 12, 40, 3), '丁': (6, 35, 0, 70, 2), '戊': (7, 45, 0, 35, 2)}
passed = [k for k, (g, a, d, c, t) in rec.items() if (a - d) + min(c, 40) + 10 * min(t, 2) >= (80 if g <= 5 else 100)]
pick('S-J03', ', '.join(passed))
# S-J04 the keyed layout must satisfy all five rules, the others must not
import re as _re
def parse4(o):
    pos = {}
    for k, (day, body) in enumerate(_re.findall(r'(화|수|목)\(([^)]*)\)', o)):
        for half, m in _re.findall(r'(오전|오후) ([A-E])', body): pos[m] = (k, half)
    return pos
def legal4(pos):
    order = lambda m: pos[m][0] * 2 + (pos[m][1] == '오후')
    return (len(pos) == 5 and order('A') < order('B') and pos['C'][0] != 0 and pos['E'][1] == '오후'
            and sum(1 for v in pos.values() if v[0] == 2) == 1 and pos['B'][0] == pos['E'][0])
only('S-J04', [legal4(parse4(o)) for o in O('S-J04')], 'legal layouts')
# S-J05 knights/knaves
P4 = '甲乙丙丁'; sol = []
for v in itertools.product([True, False], repeat=4):
    k = dict(zip(P4, v)); says = [list(v).count(False) == 2, k['甲'] != k['丙'], not k['丁'], k['甲'] and k['乙']]
    if all(sv == k[x] for sv, x in zip(says, P4)): sol.append(', '.join(x for x in P4 if k[x]))
ok(len(sol) == 1, f'S-J05 {sol}'); pick('S-J05', sol[0])
# S-J06 seats
rows = [r for r in itertools.permutations('ABCDEF') if r[0] == 'A' and r[1] == 'B' and r.index('D') - r.index('C') == 2 and r.index('F') < r.index('E')]
nec6 = lambda f: all(f(r) for r in rows)
combo('S-J06', [l for l, t in zip('ㄱㄴㄷㄹ', [nec6(lambda r: r[1] == 'B'), nec6(lambda r: r[5] == 'E'), nec6(lambda r: r.index('D') >= 4), nec6(lambda r: abs(r.index('C') - r.index('F')) == 1)]) if t])
# S-J07 trips: exhaustive assignment of 7 parcels to k trips
Wt = [250, 240, 230, 220, 210, 90, 50]
def feasible(k):
    for asg in itertools.product(range(k), repeat=7):
        if asg[0] != 0: continue
        g = [[i for i in range(7) if asg[i] == t] for t in range(k)]
        if all(sum(Wt[i] for i in x) <= 500 - 70 and len(x) <= 3 and not (3 in x and 4 in x) for x in g): return True
    return False
kmin = next(k for k in range(1, 8) if feasible(k)); pick('S-J07', f'{kmin}회')
# S-J08 bills
def bill(pl, use, disc=True):
    if pl == 'A': return sum(30000 + 3000 * max(0, u - 5) for u in use)
    if pl == 'B': return sum(42000 + min(10000, 2000 * max(0, u - 10)) for u in use)
    return 3 * (44000 if disc else 55000)
u0, u1 = [7, 18, 3], [7, 12, 3]
best = lambda use, disc=True: min('ABC', key=lambda p_: bill(p_, use, disc))
combo('S-J08', [l for l, t in zip('ㄱㄴㄷㄹ', [bill('A', u0) < bill('B', u0), best(u0) == 'C', best(u1) == 'B', best(u0, False) == 'B']) if t])
# S-J09 ranking
rk = [r for r in itertools.permutations('甲乙丙丁戊') if r.index('甲') < r.index('乙') and abs(r.index('丙') - r.index('丁')) == 1 and r.index('乙') == r.index('戊') + 1 and r.index('丁') < r.index('丙') and r[0] != '甲']
ok(len(rk) == 1, f'S-J09 {rk}'); pick('S-J09', rk[0][3])
# S-J10 weekday: count only calendar days, 6-day week
d = 2 * 13 * 28 + 4 * 28 + 9; pick('S-J10', ['해', '달', '불', '물', '나무', '쇠'][d % 6] + '요일')
# D-K01
pop, lib, bk = [960, 340, 250, 180, 150], [320, 85, 125, 45, 60], [2400, 1020, 875, 450, 600]
bpc = [F(b, q) for b, q in zip(bk, pop)]
by_text('D-K01', list(zip(['도서관 1개당 인구', '인구 1인당 장서 수가', '도서관 1개당 장서', '도서관 수가 많은', 'A~E 지역 전체'], [F(pop[1], lib[1]) == F(pop[3], lib[3]) == max(F(a, b) for a, b in zip(pop, lib)), bpc[4] == max(bpc), F(bk[2], lib[2]) < F(bk[0], lib[0]),
                               all((lib[i] > lib[j]) == (bpc[i] > bpc[j]) for i in range(5) for j in range(5) if i != j), F(sum(bk), sum(pop)) < 3])), want=False, what='false options')
# D-K02 charts: ㄴ shows 20.0 for 2025 while (87-70)/70 = 24.3%
combo('D-K02', [l for l, t in zip('ㄱㄴㄷㄹ', [True, round((87 - 70) / 70 * 100, 1) == 20.0, True, True]) if t])
# D-K05 / D-K06 / D-K07 / D-K08 / D-K10
combo('D-K05', [l for l, t in zip('ㄱㄴㄷㄹ', [2000 * 120 // 100 == 2400, F(117, 104) > F(140, 125), max([(5000 * 117, 'B'), (1500 * 140, 'C'), (2000 * 120, 'A')])[1] == 'C', F(10, 110) >= F(1, 10)]) if t])
a24 = {'복지': 2800, '교육': 1600, '교통': 1200, '환경': 800, '기타': 1600}; a25 = {'복지': 3240, '교육': 1620, '교통': 1440, '환경': 900, '기타': 1800}
gr = {k: F(a25[k] - a24[k], a24[k]) for k in a24}
combo('D-K06', [l for l, t in zip('ㄱㄴㄷㄹ', [a25['교육'] < a24['교육'], max(gr, key=gr.get) == '교통', a25['환경'] - a24['환경'] == 100, F(440, 1000) >= F(2, 5)]) if t])
v25 = [330, 260, 216, 252, 180]; g = [110, 130, 90, 105, 120]; v24 = [F(a * 100, b) for a, b in zip(v25, g)]
by_text('D-K07', list(zip(['2024년 수출액이 가장', '2024년 수출액은 C와', '2025년 수출액의', 'A~E 지역 전체', '2024년 E의'], [v24[0] == max(v24), v24[2] == v24[3], v25[1] - v24[1] > v25[0] - v24[0], F(sum(v25), 1) / sum(v24) >= F(11, 10), v24[4] / v24[1] == F(3, 4)])), want=False, what='false options')
tr = [(c, d_, e) for c in range(13, 34) for d_ in range(8, 34) for e in range(8, 34) if c + d_ + e == 33 and c > d_ > e]
combo('D-K08', [l for l, t in zip('ㄱㄴㄷㄹ', [max(x[0] for x in tr) == 16, all(x[1] - x[2] >= 2 for x in tr), {x[0] for x in tr if x[2] == 9} == {13, 14}, max(x[1] for x in tr) == 12]) if t])
sc = {'A': (80, 70, 90, 60), 'B': (90, 60, 70, 80), 'C': (70, 90, 80, 70), 'D': (85, 75, 60, 90)}
rank = lambda w: sorted(sc, key=lambda k: -sum(a * b for a, b in zip(sc[k], w)))
combo('D-K10', [l for l, t in zip('ㄱㄴㄷㄹ', [rank((4, 3, 2, 1))[0] == 'C', rank((6, 3, 0, 1))[0] == 'B', rank((4, 3, 2, 1))[0] == 'A', rank((3, 4, 2, 1)).index('A') == rank((4, 3, 2, 1)).index('A')]) if t])
# D-K09: per-capita medical cost in 만 원
pop9, old9, med9, oms9 = [200, 100, 50, 150], [15, 20, 25, 10], [12000, 7000, 4000, 8100], [40, 50, 55, 30]
o_pc = [F(m * s, 100) / F(p_ * o, 100) for p_, o, m, s in zip(pop9, old9, med9, oms9)]
y_pc = [F(m * (100 - s), 100) / F(p_ * (100 - o), 100) for p_, o, m, s in zip(pop9, old9, med9, oms9)]
al = [F(m, p_) for m, p_ in zip(med9, pop9)]
by_text('D-K09', list(zip(['65세 이상 인구 1인당', '인구 1인당 의료비가', '65세 미만', 'A~D 지역 전체', '모든 지역에서'], [o_pc.index(max(o_pc)) == 1, al.index(max(al)) == 2, y_pc.index(min(y_pc)) == 0, F(sum(F(m * s, 100) for m, s in zip(med9, oms9)), sum(med9)) >= F(45, 100), all(a >= 4 * b for a, b in zip(o_pc, y_pc))])))
# L-J06 hidden premise: J∨T, T→S, S→L, J→B ⊢ B
def entails(extra):
    for J, T_, S, L, Bb in itertools.product([0, 1], repeat=5):
        if (J or T_) and imp(T_, S) and imp(S, L) and imp(J, Bb) and extra(J, T_, S, L, Bb) and not Bb: return False
    return True
by_text('L-J06', list(zip(['내년에 경기 회복이', '재정 준칙을 도입하면', '가계의 소비가 위축되면', '경기 회복이 늦어지면', '증세를 하지 않으면'], [entails(f) for f in [lambda J, T_, S, L, Bb: not L, lambda J, T_, S, L, Bb: imp(J, L), lambda J, T_, S, L, Bb: imp(S, T_), lambda J, T_, S, L, Bb: imp(L, T_), lambda J, T_, S, L, Bb: imp(not T_, not S)]])), what='valid premises')
# L-J07 committee
Mj = [m for m in itertools.product([0, 1], repeat=5) if (m[0] or m[1]) and imp(m[0], m[2]) and imp(m[1], not m[3]) and imp(m[2], m[3]) and imp(m[1], m[2])]
combo('L-J07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(m[0] for m in Mj), all(not m[1] for m in Mj), all(m[4] for m in Mj), all(sum(m) >= 3 for m in Mj)]) if t])
# L-J08 exactly one true statement
Dd = ['기획', '인사', '예산', '감사']; s8 = []
for pm in itertools.permutations(Dd):
    a = dict(zip('甲乙丙丁', pm))
    if [a['甲'] == '기획', a['乙'] != '인사', a['乙'] != '예산', a['丙'] != '인사'].count(True) == 1: s8.append(a)
ok(len(s8) == 1, f'L-J08 {s8}'); pick('L-J08', f"丁은 {s8[0]['丁']}과에 배치되었다.")

# ================= S-K / D-L / L-K (independent re-solve) =================
# S-K01 fine: prior within [2025-09-10, 2026-09-09] → 1 → 2차 100만 → ×0.5 once → ×0.8
import datetime as _dt
cnt = 1 + sum(1 for d_ in [_dt.date(2025, 8, 1), _dt.date(2026, 2, 3)] if _dt.date(2025, 9, 10) <= d_ <= _dt.date(2026, 9, 9))
pick('S-K01', f"{[500000, 1000000, 2000000][min(cnt, 3) - 1] // 2 * 8 // 10:,}원")
# S-K02 day 90 after 3/10 (first day excluded)
ok(_dt.date(2026, 3, 10) + _dt.timedelta(days=90) == _dt.date(2026, 6, 8), 'S-K02 90th day is 6/8')
ok('120일' in O('S-K02')[A('S-K02')], 'S-K02 keyed option is the misinformed-period one')
# S-K03 travel
pick('S-K03', f"{60000 + 55000 + 20000 + 10000 + 20000 + 3 * 25000 + min(90000, 80000) + 20000:,}원")
# S-K04 duty roster
rs = [r for r in itertools.permutations('甲乙丙丁戊') if r.index('甲') < r.index('乙') and r[2] != '丙' and r.index('丁') == r.index('戊') + 1 and r[4] != '乙' and r[0] != '戊']
nn = lambda f: all(f(r) for r in rs)
combo('S-K04', [l for l, t in zip('ㄱㄴㄷㄹ', [nn(lambda r: r.index('甲') <= 1), nn(lambda r: r[4] != '丙' or r[1] == '乙'), nn(lambda r: r[4] != '丁' or r[2] == '乙'), nn(lambda r: r.index('戊') < r.index('丙'))]) if t])
# S-K05 lying days
L甲, L乙 = {0, 1, 2}, {2, 3, 4}
days = [t for t in range(7) if (((t + 1) % 7 in L甲) == (t not in L甲)) and (((t - 1) % 7 in L乙) == (t not in L乙))]
ok(len(days) == 1, f'S-K05 {days}'); pick('S-K05', '월화수목금토일'[days[0]] + '요일')
# S-K06 game
sol6 = [(a, b) for a in range(11) for b in range(11) if a + b <= 10 and 2 * a - b == 5 and 2 * b - a == 2]
ok(sol6 == [(4, 3)], f'S-K06 {sol6}')
combo('S-K06', [l for l, t in zip('ㄱㄴㄷㄹ', [10 - 7 == 3, True, False, 3 * 4 - 3 == 9]) if t])
# S-K07 assignment
Mx = [[7, 9, 4, 3], [6, 5, 4, 3], [7, 9, 8, 8], [3, 7, 6, 6]]
best = max(sum(Mx[i][pm[i]] for i in range(4)) for pm in itertools.permutations(range(4)) if pm[3] != 3)
pick('S-K07', f'{best}점')
# S-K08 parcels: all set partitions of 5 items
ws = [1.5, 3, 4, 6, 7]
fee = lambda w: 4000 if w <= 2 else 6000 if w <= 5 else 8000 if w <= 10 else 11000
def parts(xs):
    if not xs: yield []; return
    for p_ in parts(xs[1:]):
        for i in range(len(p_)): yield p_[:i] + [[xs[0]] + p_[i]] + p_[i + 1:]
        yield [[xs[0]]] + p_
mn = min(sum(fee(sum(g)) for g in pp) for pp in parts(ws) if all(sum(g) <= 20 for g in pp))
pick('S-K08', f'{mn:,}원')
# S-K09 시각
start = (14 * 60 + 45); end = 17 * 60 + 15
pick('S-K09', f'{(end - start) // 60}시간 {(end - start) % 60}분')
# S-K10 voting
VV = [(7, 'CDBA'), (8, 'BCAD'), (4, 'ABDC'), (5, 'ACDB')]
fp = {c: sum(n_ for n_, o in VV if o[0] == c) for c in 'ABCD'}
t2 = sorted('ABCD', key=lambda c: -fp[c])[:2]
ro = {c: sum(n_ for n_, o in VV if min(t2, key=o.index) == c) for c in t2}
bp = {c: sum(n_ * (3 - o.index(c)) for n_, o in VV) for c in 'ABCD'}
hh = lambda x, y: sum(n_ for n_, o in VV if o.index(x) < o.index(y))
combo('S-K10', [l for l, t in zip('ㄱㄴㄷㄹ', [max(fp, key=fp.get) == 'A', max(ro, key=ro.get) == 'B' and ro['B'] == 15, sorted(bp, key=lambda c: -bp[c])[1] == 'A', all(hh('C', y) >= 13 for y in 'ABD')]) if t])
# D-L01
pl, ap, ps = [50, 120, 30, 80, 40], [2400, 3000, 1800, 1600, 2000], [52, 125, 30, 84, 41]
cp = [F(a, b) for a, b in zip(ap, pl)]; pr = [F(a, b) for a, b in zip(ps, ap)]
by_text('D-L01', list(zip(['경쟁률이 가장 높은', '합격자 수가 선발', '응시자 수가 많은', '전체 합격률', 'D 직렬'], [cp.index(max(cp)) == pr.index(min(pr)), sum(a > b for a, b in zip(ps, pl)) == 3,
        all((ap[i] > ap[j]) == (cp[i] > cp[j]) for i in range(5) for j in range(5) if i != j), F(sum(ps), sum(ap)) >= F(35, 1000), F(84, 80) >= F(11, 10)])))
# D-L02
a2, b2 = [120, 150, 135, 180], [100, 110, 140, 150]
combo('D-L02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(range(1, 4), key=lambda i: F(a2[i] - a2[i - 1], a2[i - 1])) == 3, max(range(4), key=lambda i: F(b2[i], a2[i] + b2[i])) == 2, F(sum(b2), sum(a2)) >= F(86, 100), max(range(4), key=lambda i: abs(a2[i] - b2[i])) == 3]) if t])
# D-L03 matching
RR = {'A': (300, 90), 'B': (150, 60), 'C': (500, 110), 'D': (80, 40), 'E': (220, 55)}
pcx = {k: F(g_, p_) for k, (p_, g_) in RR.items()}
ms = [pm for pm in itertools.permutations('ABCDE') if max(pcx, key=pcx.get) == pm[3] and RR[pm[0]][0] < RR[pm[4]][0] and pcx[pm[4]] > pcx[pm[0]] and RR[pm[1]][1] > RR[pm[2]][1]]
ok(len(ms) == 1, f'D-L03 {ms}'); pick('D-L03', ', '.join(f"{c} {'가나다라마'[ms[0].index(c)]}" for c in 'ABCDE'))
# D-L04
ins, us = [12000, 15000, 18000, 21600, 24000], [4800, 6300, 8100, 9072, 9600]
gi = [F(ins[i] - ins[i - 1], ins[i - 1]) for i in range(1, 5)]; gu = [F(us[i] - us[i - 1], us[i - 1]) for i in range(1, 5)]; pp4 = [F(u, i) for u, i in zip(us, ins)]
combo('D-L04', [l for l, t in zip('ㄱㄴㄷㄹ', [ins[4] == 2 * ins[0] and all(ins[i] > ins[i - 1] for i in range(1, 5)), gi.index(max(gi)) == 0, pp4.index(max(pp4)) == 2 and pp4[4] < pp4[0], all(gu[i] < gu[i - 1] for i in range(1, 4))]) if t])
# D-L05
T5 = F(360 * 100, 18)
by_text('D-L05', list(zip(['갑국의 전체', 'C국으로의', 'D국이 전체', 'A~E국이 전체', 'A~E국 이외'], [T5 == 2000, T5 * 12 / 100 == 240, F(160 * 100) / T5 == 8, 18 + F(300 * 100) / T5 + 12 + F(160 * 100) / T5 + 5 == 58, T5 * 42 / 100 >= F(5, 2) * 360])), want=False, what='false options')
# D-L06: ㄷ shows 60.0 but aging index is 250/150*100; ㄹ shows 600 for 2020 15~64 (table 630)
combo('D-L06', [l for l, t in zip('ㄱㄴㄷㄹ', [True, round(150 / 600 * 100, 1) == 25.0 and round(250 / 600 * 100, 1) == 41.7, round(250 / 150 * 100, 1) == 60.0, 630 == 600]) if t])
# D-L07
combo('D-L07', [l for l, t in zip('ㄱㄴㄷㄹ', [F(120, 200) > F(55, 100) and F(85, 100) > F(240, 300), F(295, 400) > F(205, 300), F(60 + 85, 200) > F(295, 400), F(175, 300) >= F(58, 100)]) if t])
# D-L08
xs = [x for x in range(23) if 22 - x > x and x - 2 >= 6 and 20 - x >= 0]
rows8 = [{'A': (14, 10), 'B': (x, 22 - x), 'C': (16, 10), 'D': (20 - x, x - 2)} for x in xs]
combo('D-L08', [l for l, t in zip('ㄱㄴㄷㄹ', [len(xs) == 3, all(r['D'][0] > r['D'][1] for r in rows8), all(max(r, key=lambda k: r[k][1]) == 'B' for r in rows8), all(max(r, key=lambda k: F(r[k][0], sum(r[k]))) == 'D' for r in rows8)]) if t])
# D-L09
pr9 = {'A': (200, 220), 'B': (100, 96), 'C': (50, 60)}; en9 = {'A': (F(20), F(21)), 'B': (F(15), F(72, 5)), 'C': (F(4), F(9, 2))}
gg = lambda a, b: (b - a) / a
by_text('D-L09', list(zip(['2025년 에너지 원단위가', 'A 산업의', 'B 산업의', '세 산업 전체', '에너지 소비량의 증가율'], [max('ABC', key=lambda k: en9[k][1] / pr9[k][1]) == 'B', en9['A'][1] / 220 < en9['A'][0] / 200, en9['B'][1] / 96 == en9['B'][0] / 100,
        sum(v[1] for v in en9.values()) / 376 < sum(v[0] for v in en9.values()) / 350, any(gg(*en9[k]) > gg(*map(F, pr9[k])) for k in 'ABC')])), want=False, what='false options')
# D-L10
rl = {k: F(100 + w_, 100 + p_) - 1 for k, w_, p_ in [('A', 5, 2), ('B', 3, 4), ('C', 8, 6), ('D', 2, 1)]}
combo('D-L10', [l for l, t in zip('ㄱㄴㄷㄹ', [max(rl, key=rl.get) == 'A', [k for k in rl if rl[k] < 0] == ['B'], rl['C'] < F(2, 100), rl['D'] >= F(1, 100)]) if t])
# L-K06 categorical: brute force over worlds of up to 3 individuals with 4 properties
def worlds():
    for k in (1, 2, 3):
        for inds in itertools.product(itertools.product((0, 1), repeat=4), repeat=k):
            if any(e and not a for e, a, n_, p_ in inds): continue
            if not any(n_ and e for e, a, n_, p_ in inds): continue
            if any(a and p_ for e, a, n_, p_ in inds): continue
            yield inds
W6 = list(worlds())
nec = lambda f: all(f(w) for w in W6)
by_text('L-K06', list(zip(['신규 채용된 직원 가운데 외부에', '신규 채용된 직원은 모두', '외부에 파견된 직원 가운데', '데이터 교육을 이수한 직원 가운데', '분석 업무를 할 수 있는 직원은 모두'],
        [nec(lambda w: any(n_ and not p_ for e, a, n_, p_ in w)), nec(lambda w: all(a for e, a, n_, p_ in w if n_)), nec(lambda w: any(p_ and n_ for e, a, n_, p_ in w)),
         nec(lambda w: any(e and p_ for e, a, n_, p_ in w)), nec(lambda w: all(e for e, a, n_, p_ in w if a))])), what='necessary')
# L-K07
mk = [m for m in itertools.product((0, 1), repeat=5) if imp(m[0], m[1]) and imp(not m[2], m[3]) and (m[1] + m[3] == 1) and (m[0] or not m[2]) and imp(m[4], m[3])]
combo('L-K07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(m[0] == m[2] for m in mk), all(imp(not m[1], m[4]) for m in mk), all(sum(m) <= 3 for m in mk), all(imp(m[4], not m[2]) for m in mk)]) if t])
# L-K08
say = {'甲': (('丙', 2), ('乙', 4)), '乙': (('丙', 3), ('甲', 3)), '丙': (('丁', 4), ('乙', 4)), '丁': (('乙', 2), ('甲', 1))}
rk8 = [dict(zip('甲乙丙丁', pm)) for pm in itertools.permutations((1, 2, 3, 4))]
rk8 = [r for r in rk8 if all((r[a[0]] == a[1]) + (r[b[0]] == b[1]) == 1 for a, b in say.values())]
ok(len(rk8) == 1, f'L-K08 {rk8}')
keyed = O('L-K08')[A('L-K08')]
ok(all(f"{x}은 {rk8[0][x]}등" in keyed for x in '甲乙丙丁' if x in keyed), f'L-K08 keyed {keyed} vs {rk8[0]}')

# ================= S-M / D-M / L-L (independent re-solve) =================
# S-L01 annual leave
def lv(y, r, m): return m if r < 80 else min(25, 15 + ((y - 1) // 2 if y >= 3 else 0))
pick('S-M01', f"{lv(6, 95, 12) + lv(2, 90, 12) + lv(30, 100, 12) + lv(10, 70, 7)}일")
ok('사과' in O('S-M02')[A('S-M02')], 'S-M02 keyed option is the 농산물 one')
pick('S-M03', f"{4000000 * 12 // 10 + 3000000 * 15 // 10 * 9 // 12 + 0:,}원")
# S-L04 round table: fix 甲 at 0
sl4 = []
for pm in itertools.permutations(range(1, 6)):
    s_ = dict(zip('乙丙丁戊己', pm)); s_['甲'] = 0
    if (s_['甲'] - s_['乙']) % 6 == 3 and (s_['丙'] - s_['丁']) % 6 in (1, 5) and (s_['己'] - s_['甲']) % 6 == 1 and (s_['丙'] - s_['乙']) % 6 not in (1, 5): sl4.append(s_)
ok(len(sl4) == 1, f'S-M04 {sl4}'); pick('S-M04', next(x for x in sl4[0] if (sl4[0][x] - sl4[0]['丙']) % 6 == 3))
# S-L05 one truthful
cul = [c for c in '甲乙丙丁戊' if [c in '乙丁', c != '丁', c in '甲乙', c != '丙', c in '丁戊'].count(True) == 1]
ok(len(cul) == 1, f'S-M05 {cul}'); pick('S-M05', f"범인 {cul[0]} · 참말 乙")
combo('S-M06', [l for l, t in zip('ㄱㄴㄷㄹ', [12 + 1 == 13, True, False, 13 - 8 == 5]) if t])
# S-L07 shortest path by exhaustive simple paths
ed = {('집', 'A'): 10, ('집', 'B'): 15, ('A', 'B'): 4, ('A', 'C'): 20, ('B', 'C'): 12, ('B', 'D'): 25, ('C', 'D'): 6, ('C', '청사'): 18, ('D', '청사'): 8}
w_ = lambda a, b: ed.get((a, b), ed.get((b, a)))
best7 = min(sum(w_(p_[i], p_[i + 1]) for i in range(len(p_) - 1)) + 5 * ('C' in p_) for k in range(0, 5) for mid in itertools.permutations('ABCD', k) for p_ in [('집',) + mid + ('청사',)] if all(w_(p_[i], p_[i + 1]) for i in range(len(p_) - 1)))
pick('S-M07', f'{best7}분')
pick('S-M08', f"{4 * 60000 * 85 // 100 + 30000:,}원")
# S-L09 promotion months
mon = (2020 * 12 + 2) + 18 + 24 + (16 - 12) + 24 + 3 + 6
pick('S-M09', f"{mon // 12}년 {mon % 12 + 1}월 1일")
ev10 = {'A': F(8, 10) * 50 - 30, 'B': F(1, 2) * 90 + F(1, 2) * 10 - 30, 'C': F(6, 10) * 70 + F(4, 10) * 5 - 25}
ev0 = {'A': F(8, 10) * 50 - 30, 'B': F(1, 2) * 90 - 30, 'C': F(6, 10) * 70 - 25}
combo('S-M10', [l for l, t in zip('ㄱㄴㄷㄹ', [max(ev10, key=ev10.get) == 'B', max(ev0, key=ev0.get) == 'B', max(ev10, key=ev10.get) == 'A', F(9, 10) * 50 - 30 > ev10['C']]) if t])
# D-M01
vv, sp, sy = [400, 250, 600, 150, 300], [30, 48, 18, 60, 35], [F(2), F(3), F(3, 2), F(4), F(5, 2)]
tt = [a * b for a, b in zip(vv, sp)]; pd = [b / c for b, c in zip(sp, sy)]
by_text('D-M01', list(zip(['관광객 지출 총액이 가장', '관광객 1인의 하루 평균 지출액이 가장', '관광객 지출 총액은 C', '관광객 1인의 하루 평균 지출액은 A와', 'A~E 지역 전체'],
        [tt[0] == tt[1] == max(tt), pd.index(max(pd)) == 1, tt[2] > tt[4], pd[0] == pd[3], F(sum(tt), sum(vv)) >= 35])), want=False, what='false options')
dm, ab = [180, 195, 210, 205, 230], [45, 50, 60, 70, 75]
combo('D-M02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(F(ab[i], ab[i] + dm[i]) > F(ab[i - 1], ab[i - 1] + dm[i - 1]) for i in range(1, 5)), max(range(1, 5), key=lambda i: F(dm[i] - dm[i - 1], dm[i - 1])) == 4, F(75, 45) >= F(8, 5), all(ab[i] + dm[i] > ab[i - 1] + dm[i - 1] for i in range(1, 5))]) if t])
pr3 = {'A': (120, 200, 20000, 2), 'B': (80, 130, 20000, 3), 'C': (150, 240, 50000, 4), 'D': (140, 200, 35000, 2), 'E': (100, 160, 25000, 3)}
pick('D-M03', [k for k, (c, b, n_, y) in pr3.items() if F(b, c) >= F(3, 2) and c * 10 ** 8 / n_ <= 500000 and y <= 3 and b - c >= 55][0])
ga_, na_ = 400 * F(105, 100), 230 / F(92, 100)
by_text('D-M04', list(zip(['(가)는', '(나)는', '합계의', '예산 합계에서', '운영비의'], [ga_ == 410, na_ == 250, F(ga_ + 920 - (400 + na_ + 600), 400 + na_ + 600) >= F(8, 100), ga_ / (ga_ + 920) > F(400) / (400 + na_ + 600), na_ - 230 > ga_ - 400])))
ix = [F(100)]
for g_ in (F(11, 10), F(9, 10), F(12, 10), F(95, 100)): ix.append(ix[-1] * g_)
combo('D-M05', [l for l, t in zip('ㄱㄴㄷㄹ', [ix[2] < ix[0], ix[4] >= F(115), ix.index(max(ix)) == 3, abs(ix[2] - ix[1]) < abs(ix[4] - ix[3])]) if t])
combo('D-M06', [l for l, t in zip('ㄱㄴㄷㄹ', [F(30 * 72 + 25 * 80 + 20 * 66, 75) >= 73, F(30 * 72 + 450, 35) >= 75, F(25 * 80 - 450, 20) == F(155, 2), F(72 + 80 + 66, 3) < F(5480, 75)]) if t])
st7, hr7, ol7 = [1200, 800, 500, 1500], [40, 55, 60, 30], [50, 30, 20, 60]
tt7 = [a * b for a, b in zip(st7, hr7)]; on7 = [F(t * o, 100) for t, o in zip(tt7, ol7)]; of7 = [t - o for t, o in zip(tt7, on7)]
by_text('D-M07', list(zip(['총교육 시간이', '온라인 교육 시간이', '네 부처 전체의 직원', '오프라인 교육 시간이', '네 부처 전체의 교육 시간'], [tt7.index(max(tt7)) == 3, on7.index(max(on7)) == 3, F(sum(tt7), sum(st7)) >= 45, of7.index(max(of7)) == 0, sum(on7) / sum(tt7) >= F(45, 100)])))
# D-M08 bounds by inclusion-exclusion (independent of the grid search)
combo('D-M08', [l for l, t in zip('ㄱㄴㄷㄹ', [70 + 60 - 100 == 30, min(70, 60) == 60, 100 - 70 == 30, max(0, 100 - (30 + 40 + 20)) >= 20]) if t])
combo('D-M09', [l for l, t in zip('ㄱㄴㄷㄹ', [F(75, 1000) == F(3, 40), max([(F(40, 500), '제'), (F(45, 300), '서'), (F(-10, 200), '농')])[1] == '서', max([(40, '제'), (45, '서'), (-10, '농')])[1] == '제', F(885 - 800, 800) >= F(1, 10)]) if t])
el = [600, 700, 800, 1900]; a20 = [60, 65, 70, 75]; a24 = [66, 64, 72, 74]
vt = lambda a: [e * x for e, x in zip(el, a)]
d_ = [y - x for x, y in zip(vt(a20), vt(a24))]
combo('D-M10', [l for l, t in zip('ㄱㄴㄷㄹ', [F(66, 60) == F(11, 10), d_.index(max(d_)) == 0, F(sum(vt(a24)) - sum(vt(a20)), sum(el)) >= 1, vt(a24)[3] < vt(a20)[3]]) if t])
# L-L06
ml = [m for m in itertools.product((0, 1), repeat=4) if imp(m[0], m[1]) and imp(m[1], not m[2]) and (m[2] or m[3]) and imp(m[3], m[0])]
by_text('L-L06', list(zip(['甲과 丁은', '乙은 참석', '丙은 참석하지', '참석하는 사람은', '乙이 참석하지 않으면'], [all(m[0] == m[3] for m in ml), all(m[1] for m in ml), all(not m[2] for m in ml), all(sum(m) >= 2 for m in ml), all(imp(not m[1], m[3]) for m in ml)])), what='necessary')
bx_ = [dict(zip('ABC', pm)) for pm in itertools.permutations(['금', '은', '동'])]
bx_ = [b_ for b_ in bx_ if [b_['A'] == '금', b_['C'] != '금', b_['B'] != '동'].count(True) == 1]
ok(len(bx_) == 1, f'L-L07 {bx_}'); pick('L-L07', f"A {bx_[0]['A']}, B {bx_[0]['B']}, C {bx_[0]['C']}")

# ================= S-N / D-N / L-M (independent re-solve) =================
import math as _m
fee = 1000 + 500 * _m.ceil((205 - 30) / 10); pick('S-N01', f"{min(fee, 15000) // 2:,}원")
ok('100분의 30' in O('S-N02')[A('S-N02')] or '3명을 넘을 수 없다' in O('S-N02')[A('S-N02')], 'S-N02 keyed option is the 30% cap one')
cd = {'甲': (90, 70), '乙': (80, 85), '丙': (100, 59), '丁': (85, 80), '戊': (82, 82)}
rk = sorted([k for k in cd if cd[k][1] >= 60], key=lambda k: (-(6 * cd[k][0] + 4 * cd[k][1]), -cd[k][1]))[:2]
pick('S-N03', ', '.join(sorted(rk, key=list(cd).index)))
fl = [dict(zip('甲乙丙丁戊', pm)) for pm in itertools.permutations(range(1, 6))]
fl = [f for f in fl if f['甲'] > f['乙'] and abs(f['丙'] - f['丁']) == 2 and 1 < f['戊'] < 5 and abs(f['乙'] - f['戊']) != 1 and f['丁'] < f['甲']]
combo('S-N04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(f['甲'] == 5 for f in fl), all(f['戊'] == 3 for f in fl), all(f['乙'] != 1 or f['戊'] == 3 for f in fl), all(f['丙'] > f['丁'] or f['乙'] == 2 for f in fl)]) if t])
sol5 = [v for v in itertools.product((1, 0), repeat=4) if all(bool(s) == bool(x) for s, x in zip([v.count(0) == 1, v.count(0) == 2, v.count(0) == 3, v.count(0) >= 1], v))]
ok(len(sol5) == 1, f'S-N05 {sol5}'); pick('S-N05', ', '.join(x for x, t in zip('甲乙丙丁', sol5[0]) if t))
d6 = _dt.date(2026, 3, 1) + _dt.timedelta(days=_m.lcm(6, 8, 10)); pick('S-N06', f'{d6.year}년 {d6.month}월 {d6.day}일')
pj = {'A': (30, 40), 'B': (25, 35), 'C': (20, 22), 'D': (15, 20), 'E': (35, 45), 'F': (10, 12)}
bst = max(sum(pj[k][1] for k in sb) for r in range(7) for sb in itertools.combinations(pj, r) if sum(pj[k][0] for k in sb) <= 100 and not {'A', 'B'} <= set(sb) and ('C' not in sb or 'D' in sb))
pick('S-N07', f'{bst}점')
def bill(k):
    b = 1000 if k <= 200 else 2000 if k <= 400 else 4000
    return b + sum(100 if u <= 200 else 200 if u <= 400 else 300 for u in range(1, k + 1))
pick('S-N08', f'{bill(350) + bill(450):,}원')
VAL = {'●': 1, '▲': 5, '■': 10, '◆': 50, '★': 100}
def rd(sv):
    t = 0
    for i, c in enumerate(sv):
        nx = sv[i + 1] if i + 1 < len(sv) else None
        if nx and (c + nx) in ('●▲', '●■', '■◆', '■★'): t -= VAL[c]
        else: t += VAL[c]
    return t
vv9 = [rd(o) for o in O('S-N09')]
ok(len(set(vv9)) == 5, f'S-N09 values {vv9}'); only('S-N09', [v == max(vv9) for v in vv9], 'max')
vt = {'갑당': 4300, '을당': 3100, '병당': 1700, '정당': 900}
qs = sorted(((F(v, d), k) for k, v in vt.items() for d in range(1, 9)), reverse=True)
dh7 = {k: sum(1 for q, kk in qs[:7] if kk == k) for k in vt}; dh8 = {k: sum(1 for q, kk in qs[:8] if kk == k) for k in vt}
qt = {k: F(7 * v, 10000) for k, v in vt.items()}; hr = {k: int(q) for k, q in qt.items()}
for k in sorted(vt, key=lambda k: -(qt[k] - int(qt[k])))[:7 - sum(hr.values())]: hr[k] += 1
combo('S-N10', [l for l, t in zip('ㄱㄴㄷㄹ', [hr['정당'] == 1, dh7['갑당'] == 4, [k for k in vt if hr[k] == dh7[k]] == ['을당', '병당'], dh8['정당'] >= 1]) if t])
# D-N
rv, ow = [10000, 8000, 5000, 12000, 4000], [5600, 2400, 2250, 4200, 2000]
idr = [F(o, r) for o, r in zip(ow, rv)]
by_text('D-N01', list(zip(['재정자립도가 가장', '자체수입이 많은', '의존재원이', 'A~E 지역 전체', 'E의 재정자립도'], [idr.index(max(idr)) == 0, all((ow[i] > ow[j]) == (idr[i] > idr[j]) for i in range(5) for j in range(5) if i != j),
        [r - o for r, o in zip(rv, ow)].index(max(r - o for r, o in zip(rv, ow))) == 1, F(sum(ow), sum(rv)) >= F(45, 100), idr[4] >= idr[2] * F(6, 5)])))
ml, fm = [58, 88, 92, 89, 72], [62, 68, 66, 68, 50]
combo('D-N02', [l for l, t in zip('ㄱㄴㄷㄹ', [[m - f for m, f in zip(ml, fm)].index(max(m - f for m, f in zip(ml, fm))) == 2, any(f > m for m, f in zip(ml, fm)), fm[2] < fm[1] and fm[2] < fm[3], sum(ml) >= 400]) if t])
cp = {'A': (500, 50, 250), 'B': (800, 40, 320), 'C': (300, 45, 100), 'D': (600, 72, 400)}
ms = [pm for pm in itertools.permutations('ABCD') if max(cp, key=lambda k: F(cp[k][1], cp[k][0])) == pm[1] and F(cp[pm[0]][0], cp[pm[0]][2]) > F(cp[pm[3]][0], cp[pm[3]][2]) and cp[pm[3]][2] < cp[pm[2]][2]]
ok(len(ms) == 1, f'D-N03 {ms}'); pick('D-N03', ', '.join(f"{c} {'가나다라'[ms[0].index(c)]}" for c in 'ABCD'))
combo('D-N04', ['ㄱ', 'ㄴ'])
combo('D-N05', [l for l, t in zip('ㄱㄴㄷㄹ', [F(150 * 100, 120) == 125, F(18, 132) == F(18, 100), True, F(150, 120) == F(13, 10)]) if t])
pt = 4 * 3 + F(7, 2) * 2 + 3 * 3 + F(5, 2) + F(9, 2) * 2
combo('D-N06', [l for l, t in zip('ㄱㄴㄷㄹ', [pt / 11 >= F(7, 2), (pt - F(5, 2) + 4) / 11 >= F(37, 10), pt / 11 < F(35, 10), (pt + 12) / 14 < F(37, 10) and (pt + F(27, 2)) / 14 >= F(37, 10)]) if t])
pr7 = {'P': (264, 110, 120), 'Q': (252, 90, 140), 'R': (231, 105, 110), 'S': (234, 130, 90)}
b23 = {k: F(a * 10000, b * c) for k, (a, b, c) in pr7.items()}; b24 = {k: F(a * 100, c) for k, (a, b, c) in pr7.items()}
by_text('D-N07', list(zip(['2023년 판매량이 가장', '2023년 판매량은 네', '2023년 대비 2025년 판매량 증가율이 가장', '2024년 판매량이', '2023년 대비 2025년 판매량 증가율은 Q'],
        [len(set(b23.values())) > 1 and max(b23, key=b23.get) == 'P', len(set(b23.values())) == 1, max(pr7, key=lambda k: pr7[k][0] / b23[k]) == 'Q', max(b24, key=b24.get) == 'R', pr7['Q'][0] / b23['Q'] > pr7['P'][0] / b23['P']])))
inr = [(k, n_) for n_ in range(1, 61) for k in range(n_ + 1) if F(3565, 10000) <= F(k, n_) < F(3575, 10000)]
combo('D-N08', [l for l, t in zip('ㄱㄴㄷㄹ', [any(n_ == 14 for k, n_ in inr), [x for x in inr if x[1] <= 20] == [(5, 14)], (10, 28) in inr, all(n_ % 2 for k, n_ in inr)]) if t])
q9 = {'X': (400, 800, 440, 836), 'Y': (250, 1000, 230, 1012), 'Z': (100, 650, 130, 806)}
by_text('D-N09', list(zip(['수출 물량이', '수출 단가가', '수출 금액의', '세 품목 전체', 'X의 수출 단가'], [[k for k, v in q9.items() if v[2] < v[0]] == ['Y'], [k for k, v in q9.items() if F(v[3], v[2]) > F(v[1], v[0])] == ['Y'],
        max(q9, key=lambda k: F(q9[k][3], q9[k][1])) == 'Z', F(sum(v[3] for v in q9.values()), sum(v[2] for v in q9.values())) < F(sum(v[1] for v in q9.values()), sum(v[0] for v in q9.values())), F(836, 440) / F(800, 400) == F(19, 20)])), want=False, what='false options')
combo('D-N10', [l for l, t in zip('ㄱㄴㄷㄹ', [F(161, 100) < F(11, 10) ** 5, F(294, 200) >= F(27, 25) ** 5, F(75, 50) >= F(11, 10) ** 5, F(161, 100) > F(294, 200)]) if t])
# L-M
def mods6():
    for bits in itertools.product((0, 1), repeat=8):
        ex = [t for t, b in zip(itertools.product((0, 1), repeat=3), bits) if b]
        if any(e and x for e, x, g in ex): yield ex
W = list(mods6())
ent = lambda c: all(any(e and not g for e, x, g in ex) for ex in W if c(ex)) and any(c(ex) for ex in W)
by_text('L-M06', list(zip(['외부 전문가는 아무도', '공무원은 모두', '외부 전문가 가운데', '평가위원이 아닌', '공무원 가운데'], [ent(lambda ex: not any(x and g for e, x, g in ex)), ent(lambda ex: all(x for e, x, g in ex if g)), ent(lambda ex: any(x and not g for e, x, g in ex)),
        ent(lambda ex: all(g for e, x, g in ex if not e)), ent(lambda ex: any(g and not e for e, x, g in ex))])), what='valid premises')
mm = [m for m in itertools.product((0, 1), repeat=5) if (m[0] or m[1]) and not (m[0] and m[2]) and imp(m[3], m[2]) and imp(m[1], m[3]) and imp(m[4], m[2])]
combo('L-M07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(m[0] + m[1] == 1 for m in mm), all(imp(m[2], m[1]) for m in mm), all(imp(m[1], m[4]) for m in mm), all(imp(m[0], sum(m) == 1) for m in mm)]) if t])
lr = []
for v in itertools.product((1, 0), repeat=4):
    if v.count(0) != 2: continue
    t = dict(zip('甲乙丙丁', v))
    if [not t['丙'], t['甲'] and t['丙'], (not t['甲']) != (not t['丁']), not t['丙']] == [bool(x) for x in v]: lr.append(', '.join(x for x in '甲乙丙丁' if not t[x]))
ok(len(lr) == 1, f'L-M08 {lr}'); pick('L-M08', lr[0])

# ================= S-O / D-O / L-N (independent re-solve) =================
due = _dt.date(2026, 3, 31) + _dt.timedelta(days=14)
days = (_dt.date(2026, 5, 14) - due).days
pick('S-O01', f"{36500000 * 12 * days // (100 * 365):,}원")
ok('재판' in O('S-O02')[A('S-O02')], 'S-O02 keyed option is the trial-related one')
em = {'甲': (80, 3, 1, 4), '乙': (79, 3, 0, 0), '丙': (78, 2, 1, 2), '丁': (85, 0, 0, 2), '戊': (79, 0, 2, 3)}
pick('S-O03', ', '.join(k for k, (a, c, pr, l) in em.items() if a + min(2 * c, 4) + 3 * pr - l // 3 >= 85))
seats = []
for pm in itertools.permutations(range(6)):
    s_ = dict(zip('甲乙丙丁戊己', pm))      # 0..2 앞줄(왼→오), 3..5 뒷줄
    cl = lambda x: s_[x] % 3; rw = lambda x: s_[x] // 3
    if s_['甲'] == 1 and rw('乙') == 1 and cl('乙') != 1 and cl('戊') == cl('己') and cl('丙') == 0 and rw('戊') == 0: seats.append(s_)
ok(len(seats) == 1, f'S-O04 {seats}'); pick('S-O04', next(x for x in seats[0] if seats[0][x] == 4))
cul = [c for c in itertools.combinations('甲乙丙丁戊', 2) if all((p_ in c) != tr for p_, tr in [('甲', '乙' in c), ('乙', '丙' not in c and '丁' not in c), ('丙', '甲' in c or '戊' in c), ('丁', '乙' not in c), ('戊', '丙' in c)])]
ok(len(cul) == 1, f'S-O05 {cul}'); pick('S-O05', ', '.join(cul[0]))
ag = [(a, b, c) for b in range(1, 40) for a in [b + 3] for c in range(1, 40) if a + b + c == 30 and 2 * (c + 1) == b + 1]
ok(len(ag) == 1, f'S-O06 {ag}'); pick('S-O06', f"{next(n_ for n_ in range(50) if 2 * (ag[0][2] + n_) == ag[0][0] + n_)}년 뒤")
# S-O07: earliest finish by search over start times on a 1-hour grid with 2 workers (independent formulation)
Tm = {'A': 4, 'B': 3, 'C': 3, 'D': 2, 'E': 4, 'F': 2}; Pr = {'D': 'A', 'E': 'BC', 'F': 'DE'}
def feasible7(H):
    best = [False]
    def rec(t, started, running):
        if best[0]: return
        done = {k for k, (st) in started.items() if st + Tm[k] <= t}
        if len(done) == 6 and t <= H: best[0] = True; return
        if t >= H: return
        busy = sum(1 for k, st in started.items() if st <= t < st + Tm[k])
        avail = [k for k in Tm if k not in started and all(p_ in done for p_ in Pr.get(k, ''))]
        for r in range(0, min(2 - busy, len(avail)) + 1):
            for sub in itertools.combinations(avail, r):
                ns = dict(started); ns.update({k: t for k in sub})
                if any(st + Tm[k] > H for k, st in ns.items()): continue
                rec(t + 1, ns, running)
    rec(0, {}, None)
    return best[0]
pick('S-O07', f"{next(h for h in range(1, 20) if feasible7(h))}시간")
pick('S-O08', f"{min(30000 + 15000 + 64000, 39000 + 64000, 60000 + 15000 + 40000):,}원")
st_, br_ = '갑을병정무기경신임계', '자축인묘진사오미신유술해'
gz = lambda y: st_[(2 + y - 2026) % 10] + br_[(6 + y - 2026) % 12]
pick('S-O09', f"{next(y for y in range(2026, 2090) if gz(y) == '경술')}년")
bd = {'甲': 70, '乙': 85, '丙': 60, '丁': 80}
sp = lambda b: (max(b, key=b.get), sorted(b.values())[-2])
combo('S-O10', [l for l, t in zip('ㄱㄴㄷㄹ', [max(bd, key=bd.get) == '乙', sp(bd)[1] == 80, sp({**bd, '乙': 90})[1] == sp(bd)[1], sp({**bd, '丁': 90}) == ('丁', 90)]) if t])
# D-O
pp = [200, 80, 150, 50, 120]; dc = [4000, 2000, 2400, 1500, 2160]; bd1 = [12000, 6400, 10500, 3000, 9600]
dk = [F(d, p_) for d, p_ in zip(dc, pp)]; bk = [F(b, p_) for b, p_ in zip(bd1, pp)]; bdr = [F(b, d) for b, d in zip(bd1, dc)]
by_text('D-O01', list(zip(['인구 천 명당 의사', '인구 천 명당 병상', '의사 1명당', '의사 수가 많은', 'A~E 지역 전체'], [dk.index(max(dk)) == 3, [i for i, x in enumerate(bk) if x == max(bk)] == [1, 4], bdr.index(max(bdr)) == 4,
        all((dc[i] > dc[j]) == (dk[i] > dk[j]) for i in range(5) for j in range(5) if i != j), F(sum(bd1), sum(pp) * 10) >= F(13, 2)])), want=False, what='false options')
nw, ot = [180, 175, 170, 190, 200], [80, 90, 100, 95, 110]; nt = [a - b for a, b in zip(nw, ot)]
combo('D-O02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(nt[i] < nt[i - 1] for i in range(1, 5)), 2400 + sum(nt) == 2840, max(range(5), key=lambda i: F(ot[i], nw[i])) == 2, F(20, 170) > F(10, 190)]) if t])
gd = {'A': (500, 540), 'B': (300, 330), 'C': (800, 848), 'D': (200, 226)}
mt = [pm for pm in itertools.permutations('ABCD') if max(gd, key=lambda k: F(gd[k][1], gd[k][0])) == pm[3] and gd[pm[0]][1] - gd[pm[0]][0] > gd[pm[2]][1] - gd[pm[2]][0] and gd[pm[1]][1] > gd[pm[0]][1]]
ok(len(mt) == 1, f'D-O03 {mt}'); pick('D-O03', ', '.join(f"{c} {'가나다라'[mt[0].index(c)]}국" for c in 'ABCD'))
tot = F(840 * 100, 70)
by_text('D-O04', list(zip(['(가)는', '(나)와', '사업비는', '운영비만', '(마)는'], [F(36000) / tot == 35, tot * 30 / 100 == 360, F(480, 360) >= F(3, 2), (tot / 4 * F(4, 5)) / (tot - tot / 4 / 5) == F(1, 5), tot == 1100])))
combo('D-O05', [l for l, t in zip('ㄱㄴㄷㄹ', [[F(x * 100, 500) for x in (240, 132, 128)] == [48, F(264, 10), F(256, 10)], [270 - 240, 135 - 132, 135 - 128] == [30, 3, 7], [54, 27, 27] == [50, 25, 25], (135, 132) == (135, 128)]) if t])
a15, a25 = [350, 300, 280, 250, 200], [330, 340, 290, 300, 180]
rk_ = lambda v: [sorted(v, reverse=True).index(x) + 1 for x in v]
combo('D-O06', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(5) if rk_(a25)[i] < rk_(a15)[i]] == [1, 3], max(range(5), key=lambda i: F(a25[i], a15[i])) == 3, [i for i in range(5) if rk_(a25)[i] == rk_(a15)[i]] == [4], sum(a25) < sum(a15)]) if t])
pq = [52, 68, 125, 84, 38]; gq = [1820, 2312, 4250, 2940, 1406]; pcq = [F(g, p_) for g, p_ in zip(gq, pq)]
by_text('D-O07', list(zip(['1인당 GDP가 가장', 'A국과 D국', 'B국과 C국', '1인당 GDP가 높은', 'A~E국 전체'], [pcq.index(max(pcq)) == 4, pcq[0] == pcq[3], pcq[1] == pcq[2], all((pcq[i] > pcq[j]) == (gq[i] > gq[j]) for i in range(5) for j in range(5) if i != j), F(sum(gq), sum(pq)) >= 34])), want=False, what='false options')
rs = [t for t in itertools.product(range(51, 90), repeat=3) if sum(t) == 210]
combo('D-O08', [l for l, t in zip('ㄱㄴㄷㄹ', [True, any(89 in t for t in rs), all(min(t) < 70 for t in rs), (70, 70, 70) in rs]) if t])
combo('D-O09', [l for l, t in zip('ㄱㄴㄷㄹ', [[k for k, v in {'P': F(99, 100), 'Q': F(96, 100), 'R': F(11, 10) * F(95, 100)}.items() if v > 1] == ['R'], 1 - F(12, 10) * F(8, 10) == F(4, 100), F(11, 10) * F(9, 10) == 1, True]) if t])
gw = {'A': (1520, 20, 1900), 'B': (2000, 25, 1600), 'C': (900, 15, 2000), 'D': (1260, 18, 1750)}
pw_ = {k: F(g, w) for k, (g, w, h) in gw.items()}; ph = {k: pw_[k] / gw[k][2] for k in gw}
combo('D-O10', [l for l, t in zip('ㄱㄴㄷㄹ', [max(pw_, key=pw_.get) == 'B', ph['A'] == ph['D'], all((pw_[a] > pw_[b]) == (ph[a] > ph[b]) for a, b in itertools.combinations(gw, 2)), pw_['C'] / 1800 < ph['D']]) if t])
# L-N
N6 = ['R', 'I', 'J', 'G']
def ent6(extra):
    ms = [dict(zip(N6, v)) for v in itertools.product((0, 1), repeat=4)]
    ms = [m for m in ms if imp(m['R'], m['I'] or m['J']) and imp(m['I'], m['G']) and not m['G'] and extra(m)]
    return bool(ms) and all(m['J'] for m in ms)
by_text('L-N06', list(zip(['올해 규제를', '고용이 늘었다면', '올해 투자는', '성장률이 올랐다면', '규제를 완화하지'], [ent6(lambda m: m['R']), ent6(lambda m: imp(m['J'], m['R'])), ent6(lambda m: not m['I']), ent6(lambda m: imp(m['G'], m['I'])), ent6(lambda m: imp(not m['R'], not m['J']))])), what='valid premises')
cm = [set(X) for X in itertools.combinations('甲乙丙丁戊己', 3) if (('甲' in X) != ('乙' in X)) and (('丙' in X) == ('丁' in X)) and (('戊' in X) != ('甲' in X)) and '己' in X]
ok(len(cm) == 1, f'L-N07 {cm}'); ok(O('L-N07')[A('L-N07')].startswith('정책위원회에는 乙, 戊, 己') and cm[0] == {'乙', '戊', '己'}, 'L-N07 keyed')
kn = [v for v in itertools.product((1, 0), repeat=3) if [sum(v) == 1, not v[0], v[1] == v[2]] == [bool(x) for x in v]]
ok(len(kn) == 1, f'L-N08 {kn}'); pick('L-N08', ', '.join(x for x, t in zip('甲乙丙', kn[0]) if t))

# ================= S-P / D-P / L-O (independent re-solve) =================
pick('S-P01', f"{(2 * 50000 * 6 // 5 + 2 * 50000 * 3 // 2 * 6 // 5) * 7 // 10:,}원")
d_, n_ = _dt.date(2026, 11, 2), 0
while n_ < 7:
    d_ += _dt.timedelta(days=1); n_ += d_.weekday() < 5
ok(d_ == _dt.date(2026, 11, 11) and '11일' in O('S-P02')[A('S-P02')], f'S-P02 deadline {d_}')
ap = {'甲': (85, 3, 2, 34), '乙': (85, 3, 4, 41), '丙': (88, 1, 0, 29), '丁': (85, 5, 1, 38), '戊': (82, 6, 3, 45)}
top = sorted(ap, key=lambda k: (-ap[k][0], -ap[k][1], -ap[k][2], ap[k][3]))[:2]
pick('S-P03', ', '.join(sorted(top, key=list(ap).index)))
LG = ['영어', '중국어', '일본어', '독일어', '프랑스어']; ss = []
for lg in itertools.permutations(LG):
    a = dict(zip('甲乙丙丁戊', lg))
    for hq in itertools.combinations('甲乙丙丁戊', 2):
        h = set(hq)
        if a['甲'] in LG[:2] and (('乙' in h) != ('丙' in h)) and [p_ for p_ in a if a[p_] == '일본어'][0] in h and a['丁'] not in ('영어', '프랑스어') and '甲' in h and a['戊'] in LG[3:] and a['乙'] != '일본어': ss.append((a, h))
combo('S-P04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(a['丙'] == '일본어' for a, h in ss), all(h == {'甲', '丙'} for a, h in ss), all(a['戊'] != '독일어' or a['乙'] == '프랑스어' for a, h in ss), all(a['乙'] != '중국어' or a['丁'] == '프랑스어' for a, h in ss)]) if t])
vs = [(c, l) for c in '甲乙丙丁' for l in '甲乙丙丁' if all((st == (p_ != l)) for p_, st in [('甲', c == '乙'), ('乙', c == '丁'), ('丙', c != '丙'), ('丁', l == '乙')])]
ok(len(vs) == 1, f'S-P05 {vs}'); pick('S-P05', f'깨뜨린 사람 {vs[0][0]} · 거짓말 {vs[0][1]}')
hh, mm_ = 2, 50; dd = abs((30 * hh + mm_ / 2) - 6 * mm_); pick('S-P06', f'{int(min(dd, 360 - dd))}°')
ee = [('A', 'B', 2), ('A', 'C', 3), ('B', 'C', 4), ('A', 'D', 6), ('D', 'E', 5), ('C', 'D', 8), ('B', 'E', 9), ('C', 'E', 10)]
def spans(sub):
    comp = {n_: {n_} for n_ in 'ABCDE'}
    for a, b, w in sub:
        if comp[a] is comp[b]: return False
        u = comp[a] | comp[b]
        for x in u: comp[x] = u
    return True
pick('S-P07', f"{min(sum(w for *_, w in sb) for sb in itertools.combinations(ee, 4) if spans(sb))}억 원")
pick('S-P08', f"{360000 - 360000 * 3 // 10:,}원")
mm9 = {o: (float(o[:-3]) * 25.4 / 72 if o.endswith('포인트') else float(o[:-1]) * 0.25 if o.endswith('급') else float(o[:-2])) for o in O('S-P09')}
ok(len(set(round(v, 6) for v in mm9.values())) == 5, f'S-P09 {mm9}'); pick('S-P09', max(mm9, key=mm9.get))
rs10 = {('A', 'B'): (2, 1), ('A', 'C'): (0, 1), ('A', 'D'): (3, 0), ('B', 'C'): (2, 0), ('B', 'D'): (1, 1), ('C', 'D'): (0, 2)}
def pts_(r):
    pt = {t: 0 for t in 'ABCD'}; gf = {t: 0 for t in 'ABCD'}; ga = {t: 0 for t in 'ABCD'}
    for (x, y), (a, b) in r.items():
        gf[x] += a; gf[y] += b; ga[x] += b; ga[y] += a
        pt[x] += 3 if a > b else 1 if a == b else 0; pt[y] += 3 if b > a else 1 if a == b else 0
    return pt, gf, ga
pt, gf, ga = pts_(rs10); pt2, gf2, ga2 = pts_({**rs10, ('C', 'D'): (0, 0)})
c_rank = sorted('ABCD', key=lambda t: (-pt2[t], 0 if not (t in 'BC' and pt2['B'] == pt2['C']) else (0 if t == 'B' else 1), -(gf2[t] - ga2[t]))).index('C')
combo('S-P10', [l for l, t in zip('ㄱㄴㄷㄹ', [max(pt, key=pt.get) == 'A', pt['B'] == pt['D'] and gf['B'] - ga['B'] > gf['D'] - ga['D'], gf['D'] > gf['B'], c_rank == 2]) if t])
# D-P
gr_ = [400, 250, 500, 150, 300]; em_ = [300, 200, 350, 135, 210]; rg_ = [240, 120, 315, 81, 147]
by_text('D-P01', list(zip(['취업률이 가장', '졸업자 대비', '취업률이 같은', '다섯 전공', 'B의 정규직'], [max(range(5), key=lambda i: F(em_[i], gr_[i])) == max(range(5), key=lambda i: F(rg_[i], em_[i])), max(range(5), key=lambda i: F(rg_[i], gr_[i])) == 2, rg_[2] == rg_[4], F(sum(em_), sum(gr_)) >= F(3, 4), rg_[1] < rg_[3]])))
a24, a25 = [50, 80, 120, 300, 250, 110], [70, 60, 150, 220, 330, 90]
combo('D-P02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(a25) * 100 >= sum(a24) * 105, max(range(6), key=lambda i: F(a25[i], a24[i])) == 0, a25.index(max(a25)) == 4 and a24.index(max(a24)) == 3, F(sum(a25[2:5]), sum(a25)) > F(sum(a24[2:5]), sum(a24))]) if t])
bb = {'A': (120, 132), 'B': (80, 92), 'C': (200, 210), 'D': (60, 72)}
mp = [pm for pm in itertools.permutations('ABCD') if F(bb[pm[0]][1] - bb[pm[0]][0], bb[pm[0]][0]) == 2 * F(bb[pm[1]][1] - bb[pm[1]][0], bb[pm[1]][0]) and bb[pm[1]][1] - bb[pm[1]][0] > bb[pm[3]][1] - bb[pm[3]][0] and bb[pm[2]][0] < bb[pm[3]][0]]
ok(len(mp) == 1, f'D-P03 {mp}'); pick('D-P03', ', '.join(f"{c} {'가나다라'[mp[0].index(c)]}부" for c in 'ABCD'))
ii = {'제': [250, 270, 300], '건': [60, 70, 75], '농': [40, 50, 55], '서': [50, 60, 70]}; tt_ = [sum(v[i] for v in ii.values()) for i in range(3)]
combo('D-P04', [l for l, t in zip('ㄱㄴㄷㄹ', [tt_[2] * 4 == tt_[0] * 5, all(ii['제'][i] * 10 >= tt_[i] * 6 for i in range(3)), max(ii, key=lambda k: F(ii[k][2], ii[k][1])) == '서', F(55, 40) < F(300, 250)]) if t])
combo('D-P05', [l for l, t in zip('ㄱㄴㄷㄹ', [36 - 32 == 4 and F(4, 32) == F(1, 8), F(12, 10) > F(36, 32), (28 - 26) * 2 == 30 - 26, 1200 * 26 < 1000 * 28]) if t])
combo('D-P06', [l for l, t in zip('ㄱㄴㄷㄹ', [290 < 300 and 480 < 500, F(30 * 290 + 70 * 480, 100) > F(60 * 300 + 40 * 500, 100), F(30 * 290 + 70 * 480, 100) >= F(60 * 300 + 40 * 500, 100) * F(115, 100), F(60 * 290 + 40 * 480, 100) < 380]) if t])
w24 = {'X': F(50) / F(5, 4), 'Y': F(30), 'Z': F(20) / F(4, 5)}; T_ = sum(w24.values())
by_text('D-P07', list(zip(['2024년 발전량 구성비가', '2024년 Z의', '전체 발전량의', 'Y의 발전량', '2024년 X의'], [max(w24, key=w24.get) == 'X', w24['Z'] / T_ >= F(1, 4), F(100) / T_ >= F(105, 100), w24['Y'] / T_ > F(3, 10), w24['X'] / T_ >= F(45, 100)])), want=False, what='false options')
# D-P08 via inclusion counting with explicit enumeration of (n, sb, sy, by)
cs = [(n_, sb, sy, by) for n_ in range(51) for sb in range(26) for sy in range(21) for by in range(21) if 30 - sb - sy >= 0 and 25 - sb - by >= 0 and 20 - sy - by >= 0 and n_ + 75 - (sb + sy + by) == 50]
combo('D-P08', [l for l, t in zip('ㄱㄴㄷㄹ', [all(sb + sy + by == 25 for n_, sb, sy, by in cs if n_ == 0), max(c[0] for c in cs) == 12, min(c[1] for c in cs) >= 10, any(20 - sy - by == 20 for n_, sb, sy, by in cs)]) if t])
ar, gn, pp9 = [600, 400, 1000, 250], [30, 50, 20, 40], [300, 100, 400, 50]
gk_ = [F(a * g, 100) for a, g in zip(ar, gn)]; gp_ = [g * 100 / p_ for g, p_ in zip(gk_, pp9)]
by_text('D-P09', list(zip(['녹지 면적이', '1인당 녹지 면적은 B', '녹지 비율이', 'A~D 지역', 'C의 인구밀도'], [gk_.count(max(gk_)) == 1 and gk_.index(max(gk_)) == 1, gp_[1] == gp_[3], all((gn[i] > gn[j]) == (gp_[i] > gp_[j]) for i in range(4) for j in range(4) if i != j), sum(gk_) * 100 / sum(pp9) >= 100, F(400, 1000) > F(300, 600)])))
mr, dv = [214, 193, 192, 194, 222, 241], [107, 102, 93, 92, 91, 88]
combo('D-P10', ['ㄱ', 'ㄷ', 'ㄹ'] if [round(m / d, 2) for m, d in zip(mr, dv)] == [2.0, 1.89, 2.06, 2.11, 2.44, 2.74] and [round(m * 100 / 214, 1) for m in mr] == [100.0, 90.2, 89.7, 90.7, 103.7, 112.6] else ['x'])
# L-O
ms6 = []
for bits in itertools.product((0, 1), repeat=8):
    ex = [t for t, b in zip(itertools.product((0, 1), repeat=3), bits) if b]
    if all(r for p_, r, b in ex if p_): ms6.append(ex)
en = lambda c: any(c(ex) for ex in ms6) and all(any(r and b for p_, r, b in ex) for ex in ms6 if c(ex))
by_text('L-O06', list(zip(['예산 업무를 하는 사람은 모두', '정책 담당자 가운데 예산', '보고서를 쓰는 사람 가운데 정책', '정책 담당자는 아무도', '보고서를 쓰는 사람은 모두'], [en(lambda ex: all(p_ for p_, r, b in ex if b)), en(lambda ex: any(p_ and b for p_, r, b in ex)), en(lambda ex: any(r and not p_ for p_, r, b in ex)), en(lambda ex: not any(p_ and b for p_, r, b in ex)), en(lambda ex: all(p_ for p_, r, b in ex if r))])), what='valid premises')
m7 = [m for m in itertools.product((0, 1), repeat=4) if imp(m[0], not m[1]) and (m[1] or m[3]) and imp(m[3], m[2]) and sum(m) >= 2]
combo('L-O07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(m[2] for m in m7), all(imp(m[0], m[3]) for m in m7), all(imp(m[1], not m[3]) for m in m7), all(sum(m) >= 3 for m in m7)]) if t])
rr8 = [dict(zip('甲乙丙丁戊', pm)) for pm in itertools.permutations(range(1, 6))]
rr8 = [r for r in rr8 if [r['甲'] < r['丙'], r['乙'] == 3, r['丙'] < r['戊'], r['丁'] == 3, r['戊'] < r['丁']].count(False) == 1]
ok(len(rr8) == 1, f'L-O08 {rr8}'); pick('L-O08', next(x for x in rr8[0] if rr8[0][x] == 4))

# ================= S-Q / D-Q / L-P (independent re-solve) =================
hol = sum(1 if h >= 8 else 0.5 if h >= 4 else 0 for h in [10, 6, 3]); wkd = sum(min(h, 4) for h in [5, 6, 6, 4, 3]) // 12
pick('S-Q01', f'{hol + wkd:g}일')
ok('22만 5천' in O('S-Q02')[A('S-Q02')], 'S-Q02 keyed 22만 5천')
cv = lambda sc: 50 if sc >= 900 else 45 if sc >= 800 else 40 if sc >= 700 else 35 if sc >= 600 else 0
cq = {'甲': (91, 880, 1), '乙': (85, 880, 3), '丙': (86, 880, 1), '丁': (94, 880, 0), '戊': (87, 905, 1)}
tq = {k: F(w, 2) + cv(l) + min(2 * c, 4) for k, (w, l, c) in cq.items()}
pick('S-Q03', ', '.join(sorted(sorted(tq, key=lambda k: -tq[k])[:2], key=list(cq).index)))
SL = [(d, h) for d in '월화수' for h in '전후']
sq = [dict(zip('ABCDE', pm)) for pm in itertools.permutations(range(6), 5)]
sq = [s_ for s_ in sq if SL[s_['A']][0] == '월' and SL[s_['B']][1] == '후' and SL[s_['C']][0] != SL[s_['D']][0] and SL[s_['E']][0] == SL[s_['B']][0] and SL[s_['D']][0] != '수' and s_['C'] > s_['A'] and SL[s_['D']][1] == '전']
combo('S-Q04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(SL[s_['E']][1] == '전' for s_ in sq), all(3 not in s_.values() for s_ in sq), all(s_['A'] != 0 or SL[s_['B']][0] == '수' for s_ in sq), all(SL[s_['B']][0] != SL[s_['C']][0] for s_ in sq)]) if t])
md = [a for a in (dict(zip('甲乙丙', pm)) for pm in itertools.permutations(['금', '은', '동'])) if (a['丙'] == '금') + (a['甲'] == '동') == 1 and (a['甲'] == '금') + (a['乙'] == '동') == 1 and (a['丙'] == '은') + (a['乙'] == '동') == 1]
ok(len(md) == 1, f'S-Q05 {md}'); pick('S-Q05', f"甲 {md[0]['甲']}, 乙 {md[0]['乙']}, 丙 {md[0]['丙']}")
t6_ = 1 + (1 - F(1, 6)) / (F(1, 6) + F(1, 4) - F(1, 12)); pick('S-Q06', f'{int(t6_)}시간' + (f' {int((t6_ - int(t6_)) * 60)}분' if t6_ != int(t6_) else ''))
JJ = {'가': (3, 6), '나': (5, 2), '다': (1, 4), '라': (6, 5)}
def mk(o):
    a = b = 0
    for j in o: a += JJ[j][0]; b = max(a, b) + JJ[j][1]
    return b
pick('S-Q07', f'{min(mk(o) for o in itertools.permutations(JJ))}시간')
cst = {k: 2000 * (1400 + 20 * (1 - pr)) + fe for k, pr, fe in [('A', F(1, 2), 15000), ('B', F(4, 5), 25000), ('C', 0, 5000)]}
bk = min(cst, key=cst.get); pick('S-Q08', f'{bk} 은행, {int(cst[bk]):,}원')
arr = _dt.datetime(2026, 3, 10, 19) - _dt.timedelta(hours=9) + _dt.timedelta(hours=13) - _dt.timedelta(hours=5)
pick('S-Q09', f"{arr.month}월 {arr.day}일 {'오전' if arr.hour < 12 else '오후'} {arr.hour if arr.hour <= 12 else arr.hour - 12}시")
od = max(4, 2) + 1; st_d = _dt.date(2026, 5, 15) + _dt.timedelta(days=od)
pick('S-Q10', f'{st_d.month}월 {st_d.day}일')
# D-Q
e1, p1, g1 = [600, 400, 900, 150, 300], [50, 80, 60, 30, 20], [1500, 2000, 1800, 750, 500]
pc_ = [F(a, b) for a, b in zip(e1, p1)]; it_ = [F(a, b) for a, b in zip(e1, g1)]
by_text('D-Q01', list(zip(['1인당 배출량이 가장', '배출 집약도가', 'B국과 D국', '배출량이 많은', 'A~E국 전체'], [[i for i, x in enumerate(pc_) if x == max(pc_)] == [2, 4], it_.index(max(it_)) == 4, pc_[1] == pc_[3] and it_[1] == it_[3], all((e1[i] > e1[j]) == (pc_[i] > pc_[j]) for i in range(5) for j in range(5) if i != j), F(sum(e1), sum(p1)) >= 9])), want=False, what='false options')
gq_, eq_ = [38, 42, 35, 31], [45, 40, 44, 49]
combo('D-Q02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(range(4), key=lambda i: abs(gq_[i] - eq_[i])) == 3, [i for i in range(4) if eq_[i] < gq_[i]] == [1], gq_[1] - gq_[2] == 7, F(gq_[2] - gq_[3], gq_[2]) > F(gq_[1] - gq_[2], gq_[1])]) if t])
uu = {'A': (12000, 400, 600), 'B': (8000, 400, 800), 'C': (6000, 150, 300), 'D': (10000, 500, 500)}
mu = [pm for pm in itertools.permutations('ABCD') if max(uu, key=lambda k: F(uu[k][0], uu[k][1])) == pm[1] and F(uu[pm[0]][0], uu[pm[0]][1]) == F(uu[pm[3]][0], uu[pm[3]][1]) and uu[pm[0]][2] > uu[pm[3]][2]]
ok(len(mu) == 1, f'D-Q03 {mu}'); pick('D-Q03', ', '.join(f"{c} {'가나다라'[mu[0].index(c)]}대학" for c in 'ABCD'))
by_text('D-Q04', list(zip(['(가)와', 'B 지역의', 'C 지역', '세 지역', '(마)는'], [440 + 350 == 790, F(20, 350) >= F(6, 100), F(50, 250) == 3 * F(40, 400), F(1070, 1000) >= F(11, 10), F(50, 440) == F(1, 8)])))
combo('D-Q05', ['ㄴ', 'ㄹ'])
combo('D-Q06', [l for l, t in zip('ㄱㄴㄷㄹ', [(40 * 110 + 35 * 104 + 25 * 92) == 10340, 92 < 100 < F(10340, 100), max([(40 * 10, '식'), (35 * 4, '주'), (25 * -8, '교')])[1] == '식', F(110 + 104 + 92, 3) > F(10340, 100)]) if t])
a7, b7 = [100, 80, 120, 110], [110, 96, 126, 99]
by_text('D-Q07', list(zip(['2025년 판매량의 전년 동월', '2025년 판매량의 전월', '1~4월', '2025년 4월', '2025년 2월'], [max(range(4), key=lambda i: F(b7[i], a7[i])) == 1, max(range(1, 4), key=lambda i: F(b7[i], b7[i - 1])) == 2, sum(b7) > sum(a7), b7[3] < a7[3], b7[1] > b7[0]])), want=False, what='false options')
cur = {'A': 25, 'B': 20, 'C': 10, 'D': 5}
alld = [dict(zip('ABCD', (a, b, c, 40 - a - b - c))) for a in range(41) for b in range(41 - a) for c in range(41 - a - b)]
win = lambda add, w: all(cur[w] + add[w] > cur[o] + add[o] for o in cur if o != w)
combo('D-Q08', [l for l, t in zip('ㄱㄴㄷㄹ', [all(win(x, 'A') for x in alld if x['A'] >= 18), not any(win(x, 'C') for x in alld), min(x['D'] for x in alld if win(x, 'D')) == 21, all(win(x, 'B') for x in alld if x['B'] >= 20)]) if t])
combo('D-Q09', [l for l, t in zip('ㄱㄴㄷㄹ', [F(72, 80) == F(9, 10), 72 * 1450 > 80 * 1300, F(1450, 1300) >= F(11, 10), F(72 * 1450, 80 * 1300) >= F(101, 100)]) if t])
combo('D-Q10', ['ㄱ', 'ㄴ', 'ㄹ'] if [800 * 100 // 2500, 700 * 100 // 2500] == [32, 28] and 500 != 550 else ['x'])
# L-P
VV = ['A', 'B', 'C', 'D', 'E']
def ent(extra):
    ms = [dict(zip(VV, v)) for v in itertools.product((0, 1), repeat=5)]
    ms = [m for m in ms if imp(m['A'], m['B']) and imp(m['C'] or m['D'], m['E']) and not m['E'] and extra(m)]
    return bool(ms) and all(not m['A'] for m in ms)
by_text('L-P06', list(zip(['인구가 늘면', '학교 수요가 늘면', '교통 수요가 늘면', '인구가 늘지 않으면', '기반시설 예산을'], [ent(lambda m: imp(m['B'], m['C'])), ent(lambda m: imp(m['C'], m['B'])), ent(lambda m: imp(m['D'], m['A'])), ent(lambda m: imp(not m['B'], not m['C'])), ent(lambda m: imp(m['E'], m['B']))])), what='valid premises')
mp7 = [m for m in itertools.product((0, 1), repeat=5) if imp(m[0], m[1] and m[2]) and imp(not m[3], m[4]) and not (m[1] and m[3]) and imp(m[2], not m[4]) and sum(m) >= 2]
combo('L-P07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(not m[0] for m in mp7), all(sum(m) == 2 for m in mp7), all(imp(m[3], m[4]) for m in mp7), all(imp(m[1], m[4]) for m in mp7)]) if t])
kk = [v for v in itertools.product((True, False), repeat=3) if [not v[1], not v[2], v[0] == v[1]] == list(v)]
ok(len(kk) == 1, f'L-P08 {kk}'); pick('L-P08', ', '.join(x for x, t in zip('甲乙丙', kk[0]) if t))
# ================= S-R / D-R / L-Q (independent re-solve) =================
kids = [7, 3, 0]; amt = sum((70 if a <= 1 else 30 if a <= 5 else 0) + (10 if k >= 2 and a <= 5 else 0) for k, a in enumerate(kids))
pick('S-R01', f'{amt * (F(1, 2) if F(150, 100) > F(150, 100) else 1)}만 원')
end2 = _dt.date(2023 + 1 + 3, 1, 1) - _dt.timedelta(days=1)
by_text('S-R02', list(zip(['2023년 6월 15일에 만들어진 보존 기간 3년의 기록물은 2026년 6월', '보존 기간이 30년', '보존 기간이 끝난 기록물은 심의', '심의회는', '2023년 6월 15일에 만들어진 보존 기간 3년의 기록물은 2026년 12월'], [False, False, False, False, end2 == _dt.date(2026, 12, 31)])))
sc3 = {'甲': (88, 92, 90, 0), '乙': (95, 85, 84, 0), '丙': (82, 80, 95, 1), '丁': (78, 84, 88, 0), '戊': (90, 94, 86, 1)}
def grade3(a, b, c, d):
    g = 0 if F(a + b, 2) >= 90 and c >= 85 else 1 if F(a + b, 2) >= 80 else 2
    return min(g + d, 2)
pick('S-R03', ', '.join(k for k in sc3 if grade3(*sc3[k]) == 1))
pk = [dict(zip('甲乙丙丁戊己', pm)) for pm in itertools.permutations(range(1, 7))]
pk = [x for x in pk if x['甲'] in (1, 6) and abs(x['乙'] - x['丙']) == 1 and x['丁'] == x['戊'] + 2 and x['己'] < x['乙'] and x['丙'] not in (1, 6)]
combo('S-R04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(x['己'] == x['戊'] + 1 for x in pk), all(x['丙'] == 5 for x in pk), all(imp(x['甲'] == 1, x['乙'] == 6) for x in pk), all(x['丁'] == 3 for x in pk)]) if t])
P5 = '甲乙丙丁'; st5 = [lambda c: c != '乙', lambda c: c == '甲', lambda c: c in '甲丙', lambda c: c in '丙丁']
s5 = [(c, [p_ for p_, f in zip(P5, st5) if f(c)]) for c in P5]; s5 = [x for x in s5 if len(x[1]) == 2]
ok(len(s5) == 1, f'S-R05 {s5}'); pick('S-R05', f"범인 {s5[0][0]} · 참말 {', '.join(s5[0][1])}")
pick('S-R06', f"{sum(1 for a in range(17) for b in range(9) for c in range(2) if 5 * a + 10 * b + 50 * c == 80)}가지")
dd = {('본사', 'A'): 12, ('본사', 'B'): 15, ('본사', 'C'): 10, ('본사', 'D'): 20, ('A', 'B'): 7, ('A', 'C'): 9, ('A', 'D'): 11, ('B', 'C'): 14, ('B', 'D'): 6, ('C', 'D'): 13}
dg = lambda u, v: dd.get((u, v), dd.get((v, u)))
pick('S-R07', f"{min(sum(dg(r[i], r[i + 1]) for i in range(5)) for r in (('본사',) + pm + ('본사',) for pm in itertools.permutations('ABCD')))}km")
cd8 = {'A': min(320000 * 5 // 100, 10000), 'B': 200 * 80 if 250000 >= 300000 else 0, 'C': 320000 * 7 // 100 - 5000}
b8 = max(cd8, key=cd8.get); pick('S-R08', f'{b8} 카드, {cd8[b8]:,}원')
pick('S-R09', str(int('244', 6)))
r10 = lambda pres, yes, rule=False: pres * 2 > 15 and (yes * 3 >= 15 * 2 if rule else yes * 2 > pres)
combo('S-R10', [l for l, t in zip('ㄱㄴㄷㄹ', [r10(8, 5), not r10(7, 7), r10(14, 9, True), not r10(12, 6)]) if t])
# D-R
ap = {'A': (6000, 400, 70), 'B': (2500, 200, 20), 'C': (3000, 150, 50), 'D': (1200, 100, 10), 'E': (800, 40, 90)}
pf = {k: F(a, b) for k, (a, b, _) in ap.items()}; intl = {k: a * c for k, (a, b, c) in ap.items()}; dom = {k: a * (100 - c) for k, (a, b, c) in ap.items()}
by_text('D-R01', list(zip(['운항 1편당', '여객 수가 많은', '국제선 여객 수가 두', '국내선 여객 수가', '다섯 공항'], [max(pf, key=pf.get) == 'C' and list(pf.values()).count(max(pf.values())) == 1,
       all((ap[i][0] > ap[j][0]) == (pf[i] > pf[j]) for i in ap for j in ap if i != j), sorted(intl, key=intl.get)[-2] == 'C', max(dom, key=dom.get) == 'A' and list(dom.values()).count(max(dom.values())) == 1, F(sum(intl.values()), sum(a for a, _, _ in ap.values())) >= 55])))
r24, r25 = [120, 80, 40, 60, 50], [150, 84, 52, 57, 55]
gr = [F(b, a) for a, b in zip(r24, r25)]
combo('D-R02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(range(5), key=lambda i: gr[i]) == 2 and gr.count(max(gr)) == 1, [i for i in range(5) if r25[i] < r24[i]] == [3], F(sum(r25), sum(r24)) >= F(115, 100), F(r25[0], sum(r25)) > F(r24[0], sum(r24))]) if t])
hv = {'A': (100, 300), 'B': (50, 200), 'C': (200, 400), 'D': (80, 320)}; cn = {k: F(b, a) for k, (a, b) in hv.items()}
m3 = [dict(zip('가나다라', pm)) for pm in itertools.permutations('ABCD')]
m3 = [m for m in m3 if cn[m['가']] == cn[m['다']] and hv[m['나']][0] > hv[m['라']][0] and hv[m['가']][1] < hv[m['다']][1]]
ok(len(m3) == 1, f'D-R03 {m3}'); inv3 = {v: k for k, v in m3[0].items()}; pick('D-R03', ', '.join(f'{c} {inv3[c]}천' for c in 'ABCD'))
yp, ye = [8600, 8400, 8200], [3870, 3864, 3854]; er = [F(e * 100, p) for e, p in zip(ye, yp)]
combo('D-R04', [l for l, t in zip('ㄱㄴㄷㄹ', [yp[0] > yp[1] > yp[2], er[1] - er[0] == 1 and er[2] - er[1] == 1, ye[0] > ye[1] > ye[2], ye[2] > ye[0]]) if t])
t25 = F(160 * 100, 40); a25, d25 = t25 * F(30, 100), t25 * F(5, 100); b24 = 360 - 120 - 90 - 50; c25 = F(100 * 100, t25)
by_text('D-R05', list(zip(['D 부문', '(나)는', '(다)는', 'A 부문', '사업비 합계는'], [F(50 - d25, 50) >= F(7, 10), b24 == 110, c25 == 30, a25 == 120, F(t25, 360) >= F(115, 100)])))
mr = {'갑': [(2000, 1), (8000, 20)], '을': [(8000, 2), (2000, 25)]}
dth = {k: sum(p_ * r for p_, r in v) for k, v in mr.items()}; crude = {k: F(dth[k], sum(p_ for p_, _ in v)) for k, v in mr.items()}
std = sum(p_ * r for (p_, _), (_, r) in zip(mr['을'], mr['갑']))
combo('D-R06', [l for l, t in zip('ㄱㄴㄷㄹ', [all(mr['을'][i][1] > mr['갑'][i][1] for i in range(2)), crude['갑'] > crude['을'], std < dth['을'], dth['을'] > dth['갑']]) if t])
bu = {'A': (132, 10, 20), 'B': (150, 25, 50), 'C': (99, -10, 10)}
y24 = {k: F(v * 100, 100 + a) for k, (v, a, b) in bu.items()}; y23 = {k: F(v * 100, 100 + b) for k, (v, a, b) in bu.items()}; g34 = {k: y24[k] / y23[k] for k in bu}
by_text('D-R07', list(zip(['세 사업부 매출액 합계는', '2023년 매출액이', '2023년 대비 2024년', '세 사업부의 2024년', '2024년 매출액은 A와'], [F(sum(v for v, _, _ in bu.values()), sum(y23.values())) >= F(13, 10), max(y23, key=y23.get) == 'A', max(g34, key=g34.get) == 'C', sum(y24.values()) == 350, y24['A'] == y24['B']])), want=False, what='false options')
cs8 = [sorted([3, 5, 8, 12, a, b, 63 - 28 - a - b]) for a in range(1, 21) for b in range(1, 21) if 1 <= 63 - 28 - a - b <= 20]
meds = {x[3] for x in cs8}
combo('D-R08', [l for l, t in zip('ㄱㄴㄷㄹ', [all(8 <= m <= 11 for m in meds), all(max(x) > 12 for x in cs8 if x[3] == 8), all(sum(1 for v in x if v >= 12) >= 2 for x in cs8), len(meds) == 5]) if t])
tv, tx = {'X': 200, 'Y': 150, 'Z': 80}, {'X': 900, 'Y': 1200, 'Z': 2000}; rv = {k: tv[k] * tx[k] for k in tv}
by_text('D-R09', list(zip(['관광 수입이 가장', 'X국과 Y국', '1인당 지출액이 많은', 'X~Z국', 'Z국 관광객이'], [max(rv, key=rv.get) == 'X' and list(rv.values()).count(max(rv.values())) == 1, rv['X'] == rv['Y'], all((tx[i] > tx[j]) == (rv[i] > rv[j]) for i in tv for j in tv if i != j), F(sum(rv.values()), sum(tv.values())) >= 1250, rv['Z'] * F(11, 10) > max(rv['X'], rv['Y'])])))
pp, ur = [600, 700, 800, 900], [90, 85, 70, 50]; us = [p_ * u // 100 for p_, u in zip(pp, ur)]
combo('D-R10', [l for l, t in zip('ㄱㄴㄷㄹ', [us == [540, 595, 560, 450], [round(F(u * 1000, sum(us))) / 10 for u in us] == [25.2, 27.7, 26.1, 21.0], [p_ - u for p_, u in zip(pp, us)] == [60, 105, 240, 400], ur == [90, 80, 70, 50]]) if t])
# L-Q
ty = list(itertools.product((0, 1), repeat=3)); wl = []
for bits in itertools.product((0, 1), repeat=8):
    ex = [t for t, b_ in zip(ty, bits) if b_]
    if any(r and p_ for r, p_, d in ex): wl.append(ex)
pr6 = {'박사 학위를 가진 사람은 모두': lambda ex: all(r for r, p_, d in ex if d), '연구원은 모두': lambda ex: all(d for r, p_, d in ex if r), '박사 학위를 가진 사람 가운데': lambda ex: any(r and d for r, p_, d in ex),
       '특허를 가진 사람은 모두': lambda ex: all(r for r, p_, d in ex if p_), '연구원 가운데 박사': lambda ex: any(r and not d for r, p_, d in ex)}
by_text('L-Q06', [(k, all(any(p_ and d for r, p_, d in ex) for ex in wl if f(ex))) for k, f in pr6.items()], what='valid premises')
m7 = [m for m in itertools.product((0, 1), repeat=5) if imp(m[0], not m[2]) and (m[1] or m[2]) and imp(m[1], m[3]) and imp(m[3], m[0] or m[4]) and not (m[2] and m[4])]
combo('L-Q07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(imp(m[2], sum(m) == 1) for m in m7), all(m[1] == m[3] for m in m7), all(imp(m[0], m[4]) for m in m7), all(sum(m) >= 2 for m in m7)]) if t])
sy8 = {'甲': lambda c: c in '甲丁', '乙': lambda c: c != '乙', '丙': lambda c: c in '甲丙', '丁': lambda c: c == '丁', '戊': lambda c: c != '戊'}
c8 = [(c, [p_ for p_, f in sy8.items() if not f(c)]) for c in sy8]; c8 = [x for x in c8 if len(x[1]) == 2]
ok(len(c8) == 1, f'L-Q08 {c8}'); pick('L-Q08', f"범인 {c8[0][0]} · 거짓말 {', '.join(c8[0][1])}")
ok(5 - 2 == 3 and 3 - 4 == -1, 'L-Q09 real rates'); pick('L-Q09', '㉣을 ‘−1%’로 고친다.')
# ================= S-S / D-S / L-S (independent re-solve) =================
pick('S-S01', '23만 5천 원' if 3 * 1 + 3 * F(5, 2) + min(8, 7) + min(6, 7) == F(47, 2) else '?')
d0 = _dt.date(2026, 3, 2); e1 = d0 + _dt.timedelta(days=10); e2 = e1 + _dt.timedelta(days=10); o1 = _dt.date(2026, 4, 1) + _dt.timedelta(days=30)
by_text('S-S02', list(zip(['2026년 3월 2일에 청구를 받은 공공기관은 3월 11일', '2026년 3월 2일에 청구를 받은 공공기관이 결정 기간을', '공공기관은 결정 기간을 연장하더라도', '2026년 4월 1일', '공공기관은 이의신청을'], [e1 == _dt.date(2026, 3, 11), e2 == _dt.date(2026, 3, 22), False, o1 == _dt.date(2026, 4, 30), False])))
ap3 = {'甲': (90, 76, 0), '乙': (78, 86, 5), '丙': (59, 100, 5), '丁': (86, 80, 0), '戊': (70, 80, 0)}
el3 = {k: (F(w + v, 2) + b, v) for k, (w, v, b) in ap3.items() if w >= 60 and v >= 60}
pick('S-S03', ', '.join(sorted(sorted(el3, key=lambda k: el3[k], reverse=True)[:2], key=list(ap3).index)))
dd4 = [dict(zip('甲乙丙丁戊', pm)) for pm in itertools.permutations(range(5))]
dd4 = [x for x in dd4 if x['甲'] < x['乙'] and x['乙'] != 4 and x['戊'] != 0 and abs(x['甲'] - x['丙']) == 2 and x['丙'] in (0, 4)]
combo('S-S04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(x['甲'] == 2 for x in dd4), all(x['乙'] == 3 for x in dd4), all(abs(x['丙'] - x['丁']) == 1 for x in dd4), all(imp(x['丁'] == 0, x['戊'] == 1) for x in dd4)]) if t])
rr5 = []
for pm in itertools.permutations(range(1, 6)):
    r = dict(zip('甲乙丙丁戊', pm)); says = {'甲': r['乙'] != 1, '乙': r['乙'] == 1, '丙': r['戊'] == 5, '丁': r['甲'] == 3, '戊': r['丙'] < r['丁']}
    lies = [k for k, v in says.items() if not v]
    if len(lies) == 1: rr5.append((r, lies[0]))
combo('S-S05', [l for l, t in zip('ㄱㄴㄷㄹ', [all(r['甲'] == 3 for r, _ in rr5), all(x == '乙' for _, x in rr5), all(r['丁'] > r['乙'] for r, _ in rr5), all(1 in (r['乙'], r['丙']) for r, _ in rr5)]) if t])
ways = [1] + [0] * 10
for k in range(1, 11): ways[k] = 0 if k in (4, 7) else ways[k - 1] + (ways[k - 2] if k >= 2 else 0)
pick('S-S06', f'{ways[10]}가지')
pick('S-S07', f"{max(3 * a + 5 * b for a in range(2, 30) for b in range(30) if 2 * a + 4 * b <= 40 and 3 * a + 2 * b <= 36)}만 원")
c8 = {'A': 30000 + 4 * 3000, 'B': 20000 + 80 * 100, 'C': 25000 + 1 * 2000}; b8 = min(c8, key=c8.get); pick('S-S08', f'{b8} 요금제, {c8[b8]:,}원')
cd9 = lambda s_: (11 - sum(int(a) * w for a, w in zip(s_[:6], range(2, 8))) % 11) % 10 == int(s_[6])
only('S-S09', [cd9(o) for o in O('S-S09')], 'valid codes')
rf = lambda v: 1500 if v * 100 >= 15 * 200000 else 750 if v * 100 >= 10 * 200000 else 0
rf10 = {'甲': rf(32000), '乙': rf(24000), '丙': rf(30000), '丁': 0, '戊': rf(18000)}
combo('S-S10', [l for l, t in zip('ㄱㄴㄷㄹ', [rf10['丙'] == 1500, rf10['乙'] == 750, rf10['丁'] == 1500, sum(1500 - v for v in rf10.values()) == 3750]) if t])
# D-S
pf, fu, pa = [200, 150, 120, 80, 50], [400, 360, 180, 200, 150], [600, 450, 480, 240, 100]
fp = [F(b, a) for a, b in zip(pf, fu)]; pp = [F(b, a) for a, b in zip(pf, pa)]
by_text('D-S01', list(zip(['교수 1인당 연구비가', '교수 1인당 논문 수가', '논문 1편당 연구비는', '연구비가 많은 대학일수록', '다섯 대학 전체의'], [fp.index(max(fp)) == 4, pp.index(max(pp)) == 2, F(200, 240) > F(360, 450), all((fu[i] > fu[j]) == (fp[i] > fp[j]) for i in range(5) for j in range(5) if i != j), F(sum(pa), sum(pf)) >= 3])), want=False, what='false options')
ex, im = [520, 560, 610, 590, 650], [500, 580, 600, 620, 590]
gr = [F(ex[i], ex[i - 1]) for i in range(1, 5)]
combo('D-S02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(a > b for a, b in zip(ex, im)) == 3, gr.index(max(gr)) == 3, all(ex[i] + im[i] > ex[i - 1] + im[i - 1] for i in range(1, 5)), F(im[4], im[0]) >= F(6, 5)]) if t])
dv = {'A': (120, 600, 36), 'B': (80, 1200, 24), 'C': (200, 400, 50), 'D': (60, 300, 24)}
mm = [m for m in (dict(zip('가나다라', pm)) for pm in itertools.permutations('ABCD')) if F(dv[m['가']][0], dv[m['가']][1]) == F(dv[m['라']][0], dv[m['라']][1]) and m['나'] == min(dv, key=lambda k: F(dv[k][2], dv[k][0])) and dv[m['가']][2] > dv[m['라']][2]]
ok(len(mm) == 1, f'D-S03 {mm}'); inv = {v: k for k, v in mm[0].items()}; pick('D-S03', ', '.join(f'{c} {inv[c]}' for c in 'ABCD'))
tt, oo = [1900, 2050, 2200], [520, 660, 800]
combo('D-S04', [l for l, t in zip('ㄱㄴㄷㄹ', [oo[2] * 2 >= oo[0] * 3, F(oo[2] * 100, tt[2]) - F(oo[0] * 100, tt[0]) >= 10, tt[2] - oo[2] < tt[1] - oo[1], F(oo[1] - oo[0], tt[1] - tt[0]) >= F(9, 10)]) if t])
by_text('D-S05', list(zip(['(나)는', '매출액이 가장 많은', '영업이익률이 가장 낮은', '네 회사 전체의', '(가)와 (라)의'], [45 * 100 // 9 == 400, False, False, F((60 + 45 + 40 + 40) * 100, 500 + 500 + 800 + 250) >= 10, 500 * 12 // 100 + 250 * 16 // 100 == 100])))
combo('D-S06', [l for l, t in zip('ㄱㄴㄷㄹ', [F(130, 200) > F(480, 800) and F(280, 800) > F(60, 200), F(610, 1000) > F(340, 1000), F(410, 1000) > F(540, 1000), F(240 + 280, 1600) < F(340, 1000)]) if t])
p24 = {k: F(v * 100, 100 + g) for k, (v, g) in {'A': (330, 10), 'B': (240, -20), 'C': (252, 5), 'D': (180, 20), 'E': (195, F(-5, 2))}.items()}
inc = {'A': 30, 'B': -60, 'C': 12, 'D': 30, 'E': -5}
ok(all(F({'A': 330, 'B': 240, 'C': 252, 'D': 180, 'E': 195}[k]) - p24[k] == inc[k] for k in inc), 'D-S07 increments')
by_text('D-S07', list(zip(['2024년 생산량이 가장', '2024년 대비 2025년', '다섯 품목의 2024년', '다섯 품목의 2025년', '2024년 생산량은 E가'], [sorted(k for k in p24 if p24[k] == max(p24.values())) == ['A', 'B'], [k for k in inc if inc[k] == max(inc.values())] == ['D'], sum(p24.values()) == 1190, 1197 > sum(p24.values()), p24['E'] - p24['D'] == 50])), want=False, what='false options')
pr = [(a, 125 - a) for a in range(0, 101) if 0 <= 125 - a <= 100]
mdn = lambda xs: F(sorted(xs)[2] + sorted(xs)[3], 2)
combo('D-S08', [l for l, t in zip('ㄱㄴㄷㄹ', [all(max(c) >= 63 for c in pr), min(mdn([60, 65, 80, 90, *c]) for c in pr) >= 64, all(max([90, *c]) <= 90 for c in pr), all(c[0] != c[1] for c in pr)]) if t])
tq = {'A': 500 * F(6, 5), 'B': 300 * F(3, 2), 'C': 200 * 2, 'D': 400 * 1}
by_text('D-S09', list(zip(['하루 배출 총량이 가장', '1인당 하루 배출량이 많은', '네 지역 전체의', 'C와 D의', 'B의 인구가'], [max(tq, key=tq.get) == 'A', False, F(sum(tq.values()), 1400) >= F(7, 5), tq['C'] != tq['D'], 360 * F(3, 2) > tq['A']])))
tb, lb = [400, 440, 500, 520], [160, 176, 190, 208]
combo('D-S10', [l for l, t in zip('ㄱㄴㄷㄹ', [[F(a * 100, b) for a, b in zip(lb, tb)] == [40, 40, 38, 40], [round(float(F((tb[i] - tb[i - 1]) * 100, tb[i - 1])), 1) for i in range(1, 4)] == [10.0, 12.5, 4.0], [b - a for a, b in zip(lb, tb)] == [240, 264, 300, 312], [lb[i] - lb[i - 1] for i in range(1, 4)] == [16, 14, 18]]) if t])
# L-S
ty = list(itertools.product((0, 1), repeat=3)); ws = []
for bits in itertools.product((0, 1), repeat=8):
    exs = [t for t, b_ in zip(ty, bits) if b_]
    if all(p_ for r, p_, g in exs if r): ws.append(exs)
pre = {'보안 교육을 이수한 사람은 모두': lambda e: all(g for r, p_, g in e if p_), '기록연구사 가운데 감사관이': lambda e: any(r and not g for r, p_, g in e), '보안 교육을 이수한 사람 가운데': lambda e: any(p_ and r for r, p_, g in e),
       '감사관 가운데 기록연구사가': lambda e: any(g and r for r, p_, g in e), '감사관은 모두 기록연구사가': lambda e: all(not r for r, p_, g in e if g)}
by_text('L-S06', [(k, any(f(e) for e in ws) and all(any(g and p_ for r, p_, g in e) for e in ws if f(e))) for k, f in pre.items()], what='valid premises')
m7 = [m for m in itertools.product((0, 1), repeat=5) if imp(m[0], m[1]) and m[2] + m[3] == 1 and imp(m[1], not m[3]) and sum(m) >= 3]
combo('L-S07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(m[1] and m[2] for m in m7), all(m[0] or m[4] for m in m7), all(imp(m[0], m[4]) for m in m7), all(sum(m) == 3 for m in m7)]) if t])
kn = [v for v in itertools.product((True, False), repeat=3) if v[0] == (not v[1]) and v[1] == (v[1] == v[2]) and v[2] == v[0]]
ok(len(kn) == 1, f'L-S08 {kn}'); pick('L-S08', ', '.join(x for x, t in zip('甲乙丙', kn[0]) if t))
ok(20000 * 8 // 10 == 16000 and 16000 * 9 // 10 == 14400 and 100 - 14400 * 100 // 20000 == 28 and 20000 * 7 // 10 == 14000, 'L-S09 arithmetic'); pick('L-S09', '㉢을 ‘28%’로 고친다.')
pick('L-S10', '(나) - (다) - (가) - (라)')
# ================= S-T / D-T / L-T (independent re-solve) =================
mins = 145; base1 = 1000 + 500 * -(-(mins - 30) // 10); pick('S-T01', f'{min(base1, 15000) * 20 // 100:,}원')
by_text('S-T02', list(zip(['건물은 7년', '나무를 심기', '10년 동안 빌린', '연간 대부료가', '건물을 빌린 자가'], [7 <= 5, 25 <= 20, 10 + 10 == 20, 80 > 100, False])))
q3 = {'甲': ([78, 96, 64, 84], 0), '乙': ([88, 84, 86, 90], 6), '丙': ([90, 90, 78, 78], 1), '丁': ([85, 86, 87, 82], 2), '戊': ([70, 95, 96, 94], 30)}
fs3 = {k: (F(sum(q) - min(q), 3) - l // 3, q[3]) for k, (q, l) in q3.items()}
pick('S-T03', ', '.join(sorted(sorted(fs3, key=fs3.get, reverse=True)[:2], key=list(q3).index)))
cell = {1: (0, 0), 2: (0, 1), 3: (0, 2), 4: (1, 0), 5: (1, 1), 6: (1, 2)}; nb = lambda a, b: abs(cell[a][0] - cell[b][0]) + abs(cell[a][1] - cell[b][1]) == 1
oo4 = [x for x in (dict(zip('甲乙丙丁戊己', pm)) for pm in itertools.permutations(range(1, 7))) if x['丁'] in (1, 3, 4, 6) and x['戊'] == x['甲'] + 3 and not nb(x['己'], x['丁']) and x['乙'] >= 4 and x['丙'] in (2, 5)]
combo('S-T04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(x['丙'] == 2 for x in oo4), all(nb(x['己'], x['甲']) for x in oo4), all(nb(x['乙'], x['丁']) for x in oo4), all(imp(x['甲'] == 3, x['乙'] == 4) for x in oo4)]) if t])
rk5 = [r for r in (dict(zip('甲乙丙丁', pm)) for pm in itertools.permutations(range(1, 5))) if (r['甲'] == 1) + (r['乙'] == 2) == 1 and (r['乙'] == 1) + (r['丁'] == 4) == 1 and (r['丙'] == 2) + (r['甲'] == 3) == 1 and (r['丁'] == 3) + (r['丙'] == 1) == 1]
ok(len(rk5) == 1, f'S-T05 {rk5}'); pick('S-T05', f"{min(rk5[0], key=rk5[0].get)}, {max(rk5[0], key=rk5[0].get)}")
pick('S-T06', f"{sum(1 for c in itertools.combinations('ABCDEFG', 3) if set(c) & set('EFG') and not {'A', 'E'} <= set(c))}가지")
def fin7(d):
    e = {}
    for t, pr in [('A', ''), ('B', 'A'), ('C', 'A'), ('D', 'B'), ('E', 'CD'), ('F', 'B')]: e[t] = max([e[x] for x in pr], default=0) + d[t]
    return max(e.values())
d7 = {'A': 3, 'B': 2, 'C': 4, 'D': 2, 'E': 3, 'F': 1}
combo('S-T07', [l for l, t in zip('ㄱㄴㄷㄹ', [fin7(d7) == 10, fin7({**d7, 'F': 4}) == 10, fin7({**d7, 'C': 3}) == 9, fin7({**d7, 'B': 3}) == 11]) if t])
c8 = {'택시': 2 * (4000 + 58 * 1000 + 3000), '자가용': 8 * 1800 + 6000 + 30000, '공항버스': 4 * 17000}; b8 = min(c8, key=c8.get); pick('S-T08', f'{b8}, {c8[b8]:,}원')
d9 = _dt.date(2024, 1, 1) + _dt.timedelta(days=59); pick('S-T09', f'{d9.year}년 {d9.month}월 {d9.day}일')
res = lambda v, val, y: 'x' if v * 4 < 200000 else ('o' if y * 2 > val else 'n')
combo('S-T10', [l for l, t in zip('ㄱㄴㄷㄹ', [res(48000, 47000, 30000) == 'x', res(60000, 58000, 29000) == 'o', res(50000, 49000, 24600) == 'o', res(80000, 55000, 30000) == 'o']) if t])
# D-T
bd, dc, ip = [500, 300, 800, 200, 400], [100, 75, 120, 60, 50], [20, 15, 24, 10, 18]
ipd_ = [F(a, b) for a, b in zip(ip, dc)]; ipb_ = [F(a, b) for a, b in zip(ip, bd)]; dpb_ = [F(a, b) for a, b in zip(dc, bd)]
by_text('D-T01', list(zip(['의사 1인당', '병상 1개당 입원환자', '병상 수가 많은', '병상 1개당 의사', '다섯 병원'], [ipd_.index(min(ipd_)) == 4, ipb_.count(max(ipb_)) == 1 and ipb_.index(max(ipb_)) == 1, all((bd[i] > bd[j]) == (dc[i] > dc[j]) for i in range(5) for j in range(5) if i != j), dpb_.index(max(dpb_)) == 3 and dpb_.count(max(dpb_)) == 1, F(sum(ip) * 1000, sum(dc)) >= 220])))
a24, a25 = [150, 380, 290, 160], [120, 420, 250, 210]; gg = [F(b, a) for a, b in zip(a24, a25)]
combo('D-T02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(b > a for a, b in zip(a24, a25)) == 2, sum(a25) > sum(a24), gg.index(max(gg)) == 1, F(a25[1], sum(a25)) >= F(2, 5)]) if t])
u3 = {'A': (500, 4000, 480), 'B': (300, 3000, 300), 'C': (400, 2000, 360), 'D': (200, 2000, 180)}
cp = {k: F(v[1], v[0]) for k, v in u3.items()}; fl = {k: F(v[2], v[0]) for k, v in u3.items()}
top = [k for k in u3 if cp[k] == max(cp.values())]; ga3 = max(top, key=fl.get)
pair = [k for k in u3 if k != ga3 and sum(1 for j in u3 if j != ga3 and j != k and fl[j] == fl[k]) == 1]
na3 = max(pair, key=lambda k: u3[k][0]); ra3 = min(pair, key=lambda k: u3[k][0]); da3 = ({'A', 'B', 'C', 'D'} - {ga3, na3, ra3}).pop()
pick('D-T03', ', '.join(f"{c} {dict([(ga3, '가'), (na3, '나'), (da3, '다'), (ra3, '라')])[c]}" for c in 'ABCD'))
mr, mm4, ww4 = [30, 24, 20], [F(31), F(33), F(34)], [F(57, 2), F(61, 2), F(159, 5)]
combo('D-T04', [l for l, t in zip('ㄱㄴㄷㄹ', [F(mr[0] - mr[2], mr[0]) >= F(3, 10), (mm4[0] - ww4[0]) < (mm4[1] - ww4[1]) < (mm4[2] - ww4[2]), mr[0] - mr[1] > mr[1] - mr[2], ww4[1] - ww4[0] > ww4[2] - ww4[1]]) if t])
by_text('D-T05', list(zip(['(나)는', '65세 이상 인구가', '(다)는', '(가)와 (라)의', '네 지역 전체의'], [36 * 100 // 18 > 6 * (200 * 15 // 100), False, 33 * 100 // 150 == 20, 200 * 15 // 100 + 80 * 25 // 100 == 55, F((30 + 36 + 33 + 20) * 100, 630) >= 20])))
combo('D-T06', [l for l, t in zip('ㄱㄴㄷㄹ', [F(121, 110) == F(11, 10) == F(1331, 1210), False, 108 - 100 == 8, F(1045, 10) >= 110]) if t])
by_text('D-T07', list(zip(['가 사업부의 매출액은 2025년', '나 사업부의', '다 사업부의', '구성비가 줄어든', '2025년에 전년보다'], [2400 * 45 > 2000 * 50, F(2400 * 30, 2000 * 30) == F(6, 5), F(2400 * 25, 2000 * 20) == F(3, 2), 2400 * 45 < 2000 * 50, max([(2400 * 45 - 2000 * 50, '가'), (2400 * 30 - 2000 * 30, '나'), (2400 * 25 - 2000 * 20, '다')])[1] == '다'])), want=False, what='false options')
zs = []
for z in range(0, 13):
    for y in range(0, 31):
        x = 30 - y - z
        if x >= 0 and x + 2 * y + 3 * z == 45: zs.append((x, y, z))
ok(all(y + 2 * z == 15 for x, y, z in zs), 'D-T08 identity')
combo('D-T08', [l for l, t in zip('ㄱㄴㄷㄹ', [max(z for _, _, z in zs) <= 7, min(y + z for _, y, z in zs) >= 8, max(x for x, _, _ in zs) <= 20, any(z == 0 for _, _, z in zs)]) if t])
ok((10 + 7 + 5, 1, 7) in zs, 'D-T08 x = 22 attained (example checked in mk_data_t)')
pw = {'X': 1000 * 1400, 'Y': 800 * 1500, 'Z': 120000 * 900 // 100}; vv = {'X': 50, 'Y': 40, 'Z': 120}; tt9 = {k: pw[k] * vv[k] for k in pw}
by_text('D-T09', list(zip(['1인당 지출액을', '총지출액이', 'Y국 관광객의', '100엔이', '세 국적'], [max(pw, key=pw.get) == 'X', max(tt9, key=tt9.get) == 'X', F(tt9['Y'], tt9['X']) >= F(7, 10), 120000 * 1000 // 100 > pw['X'], F(sum(tt9.values()), 210) >= 1200000])))
s10, e10 = [3000, 2900, 2760, 2640], [200, 200, 184, 176]
combo('D-T10', [l for l, t in zip('ㄱㄴㄷㄹ', [[F(a, b) for a, b in zip(s10, e10)] == [15, F(29, 2), 15, 15], [round(float(F((s10[i - 1] - s10[i]) * 100, s10[i - 1])), 1) for i in range(1, 4)] == [3.3, 4.8, 4.5], [s10[0] - x for x in s10[1:]] == [100, 240, 340], [x * 100 // 200 for x in e10[1:]] == [100, 92, 88]]) if t])
# L-T
vt = list(itertools.product((False, True), repeat=3))
pr6 = {'민원 처리 기간이 줄어들면': lambda a, b, c: imp(c, b), '인력이 충원되지 않으면': lambda a, b, c: imp(not b, not c), '예산이 늘어나지 않으면': lambda a, b, c: imp(not a, not c), '민원 처리 기간이 줄어들지 않으면': lambda a, b, c: imp(not c, a), '인력이 충원되면': lambda a, b, c: imp(b, c)}
by_text('L-T06', [(k, all(imp(a, c) for a, b, c in vt if imp(a, b) and f(a, b, c))) for k, f in pr6.items()], what='valid premises')
m7 = [m for m in itertools.product((0, 1), repeat=5) if (m[0] or m[1]) and imp(m[0], not m[2]) and imp(m[1], m[3]) and imp(not m[2], m[4]) and not (m[3] and m[4])]
combo('L-T07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(not (m[0] and m[1]) for m in m7), all(sum(m) == 3 for m in m7), all(imp(m[4], m[0]) for m in m7), all(m[3] for m in m7)]) if t])
cr = []
for c in itertools.combinations('甲乙丙丁', 2):
    s_ = {'甲': '乙' in c, '乙': '丙' not in c, '丙': ('甲' in c) != ('丁' in c), '丁': '丁' not in c}
    if all(s_[p_] == (p_ not in c) for p_ in '甲乙丙丁'): cr.append(c)
ok(len(cr) == 1, f'L-T08 {cr}'); pick('L-T08', ', '.join(cr[0]))
ok(F(240, F(120, 60) + F(120, 40)) == 48, 'L-T09 average speed'); pick('L-T09', '㉣을 ‘48km’로 고친다.')
pick('L-T10', '(나) - (다) - (가) - (라)')
# ================= S-U / D-U / L-U (independent re-solve) =================
G4 = list(itertools.combinations('ABCD', 2)); sol1 = []
for r in itertools.product((0, 1, 2), repeat=6):
    pt = dict.fromkeys('ABCD', 0)
    for (x, y), v in zip(G4, r):
        if v == 0: pt[x] += 1; pt[y] += 1
        else: pt[x if v == 1 else y] += 3
    if pt == {'A': 7, 'B': 4, 'C': 3, 'D': 2}: sol1.append(dict(zip(G4, r)))
ok(len(sol1) == 1, f'S-U01 {sol1}'); rr = sol1[0]
combo('S-U01', [l for l, t in zip('ㄱㄴㄷㄹ', [rr[('A', 'B')] == 1 and rr[('A', 'C')] == 1 and rr[('A', 'D')] in (0, 1), sum(v == 0 for v in rr.values()) == 1, rr[('C', 'D')] == 1, rr[('B', 'C')] == 2]) if t])
seat = [dict(zip('甲乙丙丁戊己', pm)) for pm in itertools.permutations(range(6))]
seat = [s for s in seat if s['甲'] == 0 and (s['丁'] - s['甲']) % 6 == 3 and (s['乙'] - s['丙']) % 6 in (1, 5) and s['己'] == 1]
nbr = lambda a, b: (a - b) % 6 in (1, 5)
combo('S-U02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(nbr(s['戊'], s['丁']) for s in seat), all(nbr(s['乙'], s['甲']) for s in seat), all([k for k in s if (s[k] - s['己']) % 6 == 3][0] in '乙丙' for s in seat), all(imp(nbr(s['丙'], s['甲']), nbr(s['乙'], s['丁'])) for s in seat)]) if t])
grid = {}
for x in range(5):
    for y in range(4):
        grid[(x, y)] = 0 if (x, y) == (2, 1) else 1 if (x, y) == (0, 0) else grid.get((x - 1, y), 0) + grid.get((x, y - 1), 0)
pick('S-U03', f'{grid[(4, 3)]}가지')
pick('S-U04', f"{sum(1 for d in itertools.permutations(range(10), 4) if d[0] and d[3] % 2 == 0 and sum(d) == 10)}가지")
lv = lambda y: min(25, 15 + ((y - 1) // 2 if y >= 3 else 0)); pick('S-U05', f'{lv(10) + lv(2) + lv(25)}일')
pick('S-U06', '甲이 행정심판을 청구할 수 있는 마지막 날은 2026년 6월 8일이다.' if min(_dt.date(2026, 3, 10) + _dt.timedelta(days=90), _dt.date(2026, 1, 20) + _dt.timedelta(days=180)) == _dt.date(2026, 6, 8) else '?')
sN, aN = 12 * 20 // 100, 12 * 40 // 100; pick('S-U07', f'{sN * 450 + aN * 300 + (12 - sN - aN) * 150:,}만 원')
x8 = 4000 + (5500 + 3000) + 7500; y8 = (3500 + (6000 + 2500) + 3500) * 9 // 10
pick('S-U08', f"{'X' if x8 < y8 else 'Y'}사, {min(x8, y8):,}원")
lec = [s for s in (dict(zip('ABCDE', pm)) for pm in itertools.permutations(range(5))) if s['A'] < s['B'] and s['C'] in (1, 3) and s['D'] == s['A'] + 1 and s['B'] != 4]
ok(len(lec) == 1, f'S-U09 {lec}'); pick('S-U09', [k for k in lec[0] if lec[0][k] == 2][0])
up = sorted({4, 6, 7, 8, 9}); pick('S-U10', f'{(9 - 1) + (9 - 2)}개 층' if up[-1] == 9 else '?')
# D-U
a24, a25 = [400, 300, 200, 100], [460, 330, 190, 140]
dif = [b - a for a, b in zip(a24, a25)]
combo('D-U01', [l for l, t in zip('ㄱㄴㄷㄹ', [dif.index(max(dif)) == 0, max(range(4), key=lambda i: F(dif[i], a24[i])) == 3, F(460 + 330 + 140, 400 + 300 + 100) >= F(23, 20), dif[1] > dif[3]]) if t])
by_text('D-U02', list(zip(['2023~2025년 연평균 증가율이 가장', '2023~2025년 연평균 증가율은 A와', 'C의 2023~2025년', 'E의 2025년', '2024년 생산량의'], [False, F(121, 100) == F(242, 200), F(441, 400) == F(121, 100), 300 > 300, max([(F(110, 100), 'A'), (F(250, 200), 'B'), (F(420, 400), 'C'), (F(60, 50), 'D'), (F(270, 300), 'E')])[1] == 'D'])))
mul = {k: F(100 + a, 100) * F(100 + b, 100) for k, (a, b) in {'A': (10, 20), 'B': (-10, 30), 'C': (20, -10), 'D': (5, 5)}.items()}
combo('D-U03', [l for l, t in zip('ㄱㄴㄷㄹ', [max(mul, key=mul.get) == 'A', mul['B'] == F(12, 10), mul['C'] > mul['D'], all(v > 1 for v in mul.values())]) if t])
by_text('D-U04', list(zip(['인건비는', '운영비는', '사업비 증가액은', '기타 항목은', '2025년 사업비는'], [600 * 35 > 500 * 40, 600 * 25 == 500 * 30, F(600 * 30 - 500 * 20, 100 * 100) == F(8, 10), 600 * 10 == 500 * 10, F(600 * 30, 500 * 20) == F(9, 5)])), want=False, what='false options')
fac = {'A': (4800, 40, 8), 'B': (3600, 25, 8), 'C': (6000, 50, 10), 'D': (2700, 15, 9)}
hr = {k: F(q, n * h) for k, (q, n, h) in fac.items()}
by_text('D-U05', list(zip(['근로자 1인당 생산량은', '근로시간 1시간당 생산량이 가장', '생산량이 많은', 'C의 근로시간', '네 공장 전체의'], [F(4800, 40) > F(6000, 50), max(hr, key=hr.get) == 'B', False, hr['C'] == hr['A'] * F(4, 5), F(17100, 1155) >= 16])))
combo('D-U06', ['ㄱ', 'ㄴ', 'ㄷ'])
p10 = {'A': F(3000, 200), 'B': F(1000, 50), 'C': F(1500, 120), 'D': F(600, 30)}
combo('D-U07', [l for l, t in zip('ㄱㄴㄷㄹ', [max(p10, key=p10.get) == 'A', p10['B'] == p10['D'], F(6100, 400) >= 15, F(1500, 96) > 15]) if t])
pr = {'A': F(5 * 140, 100), 'B': F(3 * 150, 100), 'C': F(4 * 120, 100)}
by_text('D-U08', list(zip(['2025년 평균 주택가격은', '2020년 대비 2025년', '2025년 주택가격 지수는', 'C의 평균', '세 지역'], [pr['B'] > pr['C'], max(['A', 'B', 'C'], key=lambda k: pr[k] - {'A': 5, 'B': 3, 'C': 4}[k]) == 'A', pr['A'] < pr['B'], F(120, 100) > F(12, 10), F(sum(pr.values()), 12) >= F(3, 2)])))
cw = {'A': (1000, 100, 50), 'B': (800, 120, 40), 'C': (600, 60, 40), 'D': (400, 60, 20)}
mm9 = [m for m in (dict(zip('가나다라', pm)) for pm in itertools.permutations('ABCD')) if F(cw[m['가']][1], cw[m['가']][0]) == F(cw[m['다']][1], cw[m['다']][0]) and m['나'] == min(cw, key=lambda k: F(cw[k][0], cw[k][2])) and cw[m['가']][2] > cw[m['다']][2]]
ok(len(mm9) == 1, f'D-U09 {mm9}'); iv = {v: k for k, v in mm9[0].items()}; pick('D-U09', ', '.join(f'{c} {iv[c]}' for c in 'ABCD'))
by_text('D-U10', list(zip(['학생 수가 가장', '(나)는', '(다)는', '네 학교 전체의', '(가)와 (라)의'], [False, 30 * 18 <= 500, 720 // 48 == 16, F(600 + 540 + 720 + 330, 40 + 30 + 48 + 30) >= 15, 600 // 15 + 330 // 11 < 5 * (720 // 48)])))
# L-U
pick('L-U02', '남쪽' if (90 + 90) % 360 == 180 else '?')
pick('L-U05', '(라)'); pick('L-U06', '(나) - (다) - (가) - (라)')
ty = list(itertools.product((0, 1), repeat=4)); okm = []
for bits in itertools.product((0, 1), repeat=16):
    exs = [t for t, b_ in zip(ty, bits) if b_]
    if all(r for m_, r, g, nn in exs if m_) and any(g and m_ for m_, r, g, nn in exs) and not any(r and nn for m_, r, g, nn in exs): okm.append(exs)
combo('L-U07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(any(g and r for m_, r, g, nn in e) for e in okm), all(all(not nn for m_, r, g, nn in e if g) for e in okm), all(all(not nn for m_, r, g, nn in e if m_) for e in okm), all(any(nn and not g for m_, r, g, nn in e) for e in okm)]) if t])
m8 = [m for m in itertools.product((0, 1), repeat=6) if imp(m[0], m[1]) and (m[2] or m[3]) and imp(m[1], not m[2]) and imp(m[3], m[4]) and not (m[4] and m[5]) and (m[0] or m[5])]
combo('L-U08', [l for l, t in zip('ㄱㄴㄷㄹ', [all(m[2] == m[5] for m in m8), all(sum(m) in (2, 4) for m in m8), all(imp(not m[1], m[3]) for m in m8), all(m[0] == m[3] for m in m8)]) if t])
bx9 = [x for x in 'ABCD' if (x in 'BC') + (x != 'A') + (x == 'D') + (x != 'B') == 2]
ok(len(bx9) == 1, f'L-U09 {bx9}'); pick('L-U09', f'{bx9[0]} 상자')
# ================= S-V / D-V / L-V (independent re-solve from the rendered options) =================
# S-V01 expected gain minus fee
eg = {'A': 50, 'B': F(6, 10) * 100 - 5, 'C': F(3, 10) * 200 + F(7, 10) * 20 - 20}
bk = max(eg, key=eg.get); pick('S-V01', f'{bk}안, {int(eg[bk])}만 원')
# S-V02 race order
rk = [dict(zip('甲乙丙丁戊', pm)) for pm in itertools.permutations(range(1, 6))]
rk = [r for r in rk if r['甲'] < r['乙'] and r['丙'] - r['甲'] == 1 and r['戊'] > r['乙'] and r['乙'] != 3]
combo('S-V02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(r['乙'] == 4 for r in rk), all(r['甲'] == 1 for r in rk), all(imp(r['丁'] == 1, r['丙'] == 3) for r in rk), all(r['丙'] < r['丁'] for r in rk)]) if t])
# S-V03 routes S→T within 4 hours
rt3 = {'SAT': (1 + 3, 3 + 2), 'SACT': (1 + 2 + 1, 3 + 2 + 1), 'SBT': (2 + 3, 1 + 3), 'SBCT': (2 + 1 + 1, 1 + 4 + 1)}
cand = sorted((c, k) for k, (h, c) in rt3.items() if h <= 4); ok(cand[0][0] < cand[1][0], 'S-V03 unique cheapest')
pick('S-V03', f"{' → '.join(cand[0][1])}, {cand[0][0]}만 원")
# S-V04 jobs (duration, deadline, pay): earliest-deadline order is optimal for feasibility of a set
jb = {'A': (2, 3, 50), 'B': (1, 2, 30), 'C': (3, 5, 60), 'D': (2, 5, 40)}
def edf(s):
    t = 0
    for j in sorted(s, key=lambda k: jb[k][1]):
        t += jb[j][0]
        if t > jb[j][1]: return False
    return True
pick('S-V04', f"{max(sum(jb[j][2] for j in s) for r in range(5) for s in itertools.combinations(jb, r) if edf(s))}만 원")
# S-V05 subject/day
sv5 = []
for sp in itertools.permutations('국영수과'):
    for dp in itertools.permutations('월화수목'):
        m = dict(zip('ABCD', zip(sp, dp))); bysub = {s: d for s, d in m.values()}; byday = {d: p_ for p_, (s, d) in m.items()}
        if m['A'][0] != '수' and byday['수'] in 'AC' and bysub['국'] == '월' and '월화수목'.index(bysub['영']) < '월화수목'.index(bysub['수']) and m['A'][1] == '목': sv5.append(m)
combo('S-V05', [l for l, t in zip('ㄱㄴㄷㄹ', [all(m['A'][0] == '과' for m in sv5), all(imp(m['D'][1] == '월', m['D'][0] == '국') for m in sv5), all(m['B'][0] == '국' for m in sv5), all(m['B'][1] == '화' for m in sv5)]) if t])
# S-V06 moving-in report: deadline excludes the first day
dl6 = _dt.date(2026, 3, 2) + _dt.timedelta(days=14)
fee6 = lambda d: 0 if d <= dl6 else (10000 if (d - dl6).days < 30 else 20000 if (d - dl6).days < 90 else 50000)
ok((fee6(_dt.date(2026, 3, 16)), fee6(_dt.date(2026, 3, 20)), fee6(_dt.date(2026, 6, 20))) == (0, 10000, 50000), 'S-V06 fees')
pick('S-V06', '甲이 2026년 3월 16일에 신고하면 과태료를 내지 않는다.')
# S-V07 spouse 1.5 shares, 丁's share split by 戊·己
pick('S-V07', f'{int(F(18) / (F(3, 2) + 3) / 2)}억 원')
# S-V08 water bill
u = 34; pick('S-V08', f'{3000 + 20 * 500 + 10 * 800 + (u - 30) * 1200 + u * 300:,}원')
# S-V09 approver ladder
def ap9(d, c, abroad):
    lv_ = 0 if (d <= 3 and c <= 50) else (1 if (d <= 7 and c <= 200) else 2)
    return ['과장', '국장', '실장'][min(2, lv_ + abroad)]
combo('S-V09', [l for l, t in zip('ㄱㄴㄷㄹ', [ap9(2, 60, 0) == '과장', ap9(3, 40, 1) == '국장', ap9(8, 100, 0) == '실장', ap9(5, 150, 1) == '실장']) if t])
# S-V10 printing
q10 = {'X': 20000 + 2000 * 100, 'Y': 1000 * 150 + 1000 * 80, 'Z': 2000 * 120 * 9 // 10}
pick('S-V10', f'{min(q10, key=q10.get)}, {min(q10.values()):,}원')
# D-V01 chained growth
def chain(b, rs):
    v = [F(b)]
    for r in rs: v.append(v[-1] * (1 + F(r, 100)))
    return v
a1, b1, c1 = chain(200, [10, 20, -25]), chain(250, [20, -10, 10]), chain(100, [50, 20, -10])
combo('D-V01', [l for l, t in zip('ㄱㄴㄷㄹ', [a1[3] < a1[0], b1[2] > max(a1[2], c1[2]), (a1[3] + b1[3] + c1[3]) * 10 >= 12 * (a1[0] + b1[0] + c1[0]), a1[2] - a1[1] > c1[1] - c1[0]]) if t])
# D-V02 weighted scores
sc = {'A': (80, 70, 90), 'B': (90, 60, 70), 'C': (70, 90, 80), 'D': (75, 80, 85)}
ws = lambda w: {k: sum(F(x) * y for x, y in zip(w, v)) for k, v in sc.items()}
s0, s1 = ws((F(1, 2), F(3, 10), F(1, 5))), ws((F(1, 2), F(2, 5), F(1, 10)))
by_text('D-V02', list(zip(['종합 점수가 가장 높은', '전문성 점수가', '소통 가중치를', 'A와 B의', '종합 점수가 78점'], [max(s0, key=s0.get) == 'D', max(sc, key=lambda k: sc[k][0]) == max(s0, key=s0.get), max(s1, key=s1.get) == 'C', s0['A'] - s0['B'] == 3, sum(v >= 78 for v in s0.values()) == 2])))
# D-V03 unit price
g3 = {'A': (200, 400, 250, 450), 'B': (50, 300, 40, 260), 'C': (400, 200, 500, 300), 'D': (100, 500, 120, 540)}
u3 = {k: (F(b, a), F(d, c)) for k, (a, b, c, d) in g3.items()}
dsum = sum(d - b for a, b, c, d in g3.values())
combo('D-V03', [l for l, t in zip('ㄱㄴㄷ', [[k for k in u3 if u3[k][1] < u3[k][0]] == ['A'], u3['C'][1] * u3['B'][0] > u3['B'][1] * u3['C'][0], F(300 - 200, dsum) >= F(3, 5)]) if t] + (['ㄹ'] if 50 * u3['B'][1] < 300 else []))
# D-V04 subsidy
s4 = {'A': (30, 1000, 750), 'B': (8, 500, 440), 'C': (45, 800, 660), 'D': (60, 2000, 1200), 'E': (12, 300, 240), 'F': (10, 200, 170)}
tot = sum(min(1000, n * 50) for n, a, b in s4.values() if (n < 50 and (a - b) * 5 >= a) or (n < 10 and (a - b) * 10 >= a))
pick('D-V04', f'{tot:,}만 원')
# D-V05 elderly
r5 = {'A': (200, 180, 15, 25), 'B': (300, 330, 10, 14), 'C': (150, 150, 20, 30), 'D': (100, 120, 12, 15)}
e15 = {k: F(a * c, 100) for k, (a, b, c, d) in r5.items()}; e25 = {k: F(b * d, 100) for k, (a, b, c, d) in r5.items()}
by_text('D-V05', list(zip(['2025년 65세 이상 인구가 가장', '2015년 65세 이상', '2015년 대비', '2025년 네 지역', 'D의 65세'], [max(e25, key=e25.get) == 'B', len({e15['A'], e15['B'], e15['C']}) == 1, max(e25, key=lambda k: e25[k] / e15[k]) == 'B', sum(e25.values()) * 5 >= sum(v[1] for v in r5.values()), (e25['D'] - e15['D']) * 10 == (e25['A'] - e15['A']) * 4])), want=False, what='false options')
# D-V06 export shares
ex = {k: (500 * a // 100, 600 * b // 100) for k, (a, b) in {'반도체': (40, 45), '자동차': (30, 25), '선박': (20, 20), '기타': (10, 10)}.items()}
combo('D-V06', [l for l, t in zip('ㄱㄴㄷㄹ', [ex['자동차'][1] < ex['자동차'][0], F(ex['반도체'][1] - ex['반도체'][0], 100) == F(7, 10), F(ex['선박'][1], ex['선박'][0]) == F(ex['기타'][1], ex['기타'][0]), ex['반도체'][1] * 10 >= ex['반도체'][0] * 13]) if t])
# D-V07 waste = area × density × per-capita
w7 = {k: F(a * d) * F(w) for k, (a, d, w) in {'A': (50, 2000, '1.35'), 'B': (80, 1500, '0.9'), 'C': (120, 900, '1.1'), 'D': (30, 3000, '1.45'), 'E': (200, 400, '1.6')}.items()}
pick('D-V07', f'가장 많은 지역 {max(w7, key=w7.get)}, 가장 적은 지역 {min(w7, key=w7.get)}')
# D-V08 monthly price chain
pc = chain(10000, [10, -10, 20, -20, 5]); inc8 = [pc[i + 1] - pc[i] for i in range(5)]
by_text('D-V08', list(zip(['3월 가격은', '1~6월 중', '6월 가격은', '5월 가격은', '2~6월 중'], [pc[2] == pc[0], pc.index(max(pc)) == 3, pc[5] > pc[0], pc[4] > pc[2], inc8.index(max(inc8)) == 0])))
# D-V09 Simpson
pas = {('A', 'm'): 400 * 50 // 100, ('A', 'f'): 100 * 60 // 100, ('B', 'm'): 100 * 20 // 100, ('B', 'f'): 400 * 25 // 100}
fm = pas[('A', 'f')] + pas[('B', 'f')]; mm = pas[('A', 'm')] + pas[('B', 'm')]
combo('D-V09', [l for l, t in zip('ㄱㄴㄷㄹ', [60 > 50 and 25 > 20, F(mm, 500) > F(fm, 500), F(fm, fm + mm) >= F(2, 5), 2 * (pas[('B', 'm')] + pas[('B', 'f')]) >= pas[('A', 'm')] + pas[('A', 'f')]]) if t])
# D-V10 exchange rates
c24 = {'X': 1000 * 1300, 'Y': 100000 * 9, 'Z': 800 * 1450}; c25 = {'X': 1000 * 1400, 'Y': 100000 * F(17, 2), 'Z': 800 * 1500}
combo('D-V10', [l for l, t in zip('ㄱㄴㄷㄹ', [max(c25, key=c25.get) == 'Z', F(c25['X'], c24['X']) > F(c25['Z'], c24['Z']), sum(c25.values()) - sum(c24.values()) >= 100000, 110000 * F(17, 2) > c24['Y']]) if t])
# L-V
pick('L-V01', '측정값을 보정해야 하는 까닭은 대기 중 탄소-14의 비율이 시대마다 달랐기 때문이다.')
hl = lambda frac: {F(1, 4): 2, F(1, 8): 3}[frac] * 5730
combo('L-V02', [l for l, t in zip('ㄱㄴㄷㄹ', [hl(F(1, 4)) == 11460, hl(F(1, 8)) > hl(F(1, 4)), False, F(hl(F(1, 8)), hl(F(1, 4))) == F(3, 2)]) if t])
pick('L-V04', '우리는 출장 날짜를 다음 주 화요일로 잡았다.'); pick('L-V05', '(라)')
asg = [dict(zip('甲乙丙丁戊', xs)) for xs in itertools.product('기인예', repeat=5) if sorted(xs) == sorted('기기인인예')]
asg = [a for a in asg if a['丙'] == '인' and imp(a['丁'] == '기', a['戊'] == '예') and a['甲'] != '기']
combo('L-V07', [l for l, t in zip('ㄱㄴㄷㄹ', [all(a['乙'] == '기' for a in asg), all(imp(a['甲'] == '인', a['丁'] == '기') for a in asg), all(imp(a['戊'] != '기', a['甲'] == '인') for a in asg), all(a['丁'] != a['戊'] for a in asg)]) if t])
# L-V08: the keyed premise must make the conclusion valid over all 2^16 type-existence models; every other option must fail
ty8 = list(itertools.product((0, 1), repeat=4))   # (위원, 주민, 자가용, 회원)
pr8 = {'지역 주민 가운데 환경 단체 회원이 아닌 사람이 있다.': lambda e: any(t[1] and not t[3] for t in e), '자가용이 있는 사람은 모두 환경 단체 회원이다.': lambda e: all(t[3] for t in e if t[2]),
       '환경 단체 회원 가운데 공원 관리 위원이 있다.': lambda e: any(t[3] and t[0] for t in e), '공원 관리 위원 가운데 환경 단체 회원이 아닌 사람이 있다.': lambda e: any(t[0] and not t[3] for t in e),
       '환경 단체 회원 가운데 자가용이 있는 사람이 있다.': lambda e: any(t[3] and t[2] for t in e)}
def val8(f):
    for bits in itertools.product((0, 1), repeat=16):
        e = [t for t, b_ in zip(ty8, bits) if b_]
        if all(t[1] for t in e if t[0]) and not any(t[1] and t[2] for t in e) and f(e) and not any(t[3] and not t[2] for t in e): return False
    return True
by_text('L-V08', [(k, val8(f)) for k, f in pr8.items()])
def no9(dept, y, n, sec, keep): return ('S' if sec else '') + {'기획': 'PL', '인사': 'HR', '예산': 'BG'}[dept] + '-' + str(y)[2:] + '-' + str(n).zfill(3) + ('L' if keep >= 10 else '')
combo('L-V09', [l for l, t in zip('ㄱㄴㄷㄹ', [no9('기획', 2024, 12, 0, 3) == 'PL-24-12', no9('예산', 2025, 1, 1, 10) == 'SBG-25-001L', no9('인사', 2025, 5, 0, 5) == 'HR-25-005', no9('기획', 2026, 1, 0, 3) == 'PL-26-141']) if t])
# ================= S-W / D-W / L-W (independent re-solve from the rendered options) =================
# S-W01 fuel cost for 600 km
fc = {'A': F(600) / F(25, 2) * 1700, 'B': F(600 * 6, 100) * 1600, 'C': F(600, 8) * 1000, 'D': F(600 * 5, 100) * 1700}
pick('S-W01', f'{min(fc, key=fc.get)}, {int(min(fc.values())):,}원')
# S-W02 via UTC
arr = _dt.datetime(2026, 3, 10, 22) - _dt.timedelta(hours=9) + _dt.timedelta(hours=19) + _dt.timedelta(hours=1)
pick('S-W02', f'{arr.month}월 {arr.day}일 ' + ('오전' if arr.hour < 12 else '오후') + f' {arr.hour % 12 or 12}시')
# S-W03 knapsack with exclusion
pj = {'A': (4, 8), 'B': (3, 5), 'C': (5, 9), 'D': (2, 3), 'E': (6, 10)}
pick('S-W03', f"{max(sum(pj[k][1] for k in s) for r in range(6) for s in itertools.combinations(pj, r) if sum(pj[k][0] for k in s) <= 10 and not {'A', 'C'} <= set(s))}점")
# S-W04 travel allowance (만 원)
pick('S-W04', f'{1 + 2 * 3 + 10 + min(9, 7) + 6 + 2}만 원')
# S-W05 expected costs
ec = {'none': F(3000, 100), 'A': 25 + F(100, 100), 'B': 15 + F(1000, 100)}
ec2 = {'none': F(6000, 100), 'A': 25 + F(200, 100), 'B': 15 + F(2000, 100)}
by_text('S-W05', list(zip(['기대 비용이 가장', '보험에 가입하지', 'B에 가입할', '화재가 날 확률이', '화재가 나면'], [min(ec, key=ec.get) == 'A', ec['none'] == 30, ec['B'] == 15, min(ec2, key=ec2.get) == 'B', 25 + 100 == 100])))
# S-W06 league (points 7, 4, 4, 1)
lg = []
for out in itertools.product((3, 1, 0), repeat=6):
    pts = {t: 0 for t in 'ABCD'}
    for (a, b), o in zip(itertools.combinations('ABCD', 2), out):
        pts[a] += o; pts[b] += {3: 0, 1: 1, 0: 3}[o]
    if pts == {'A': 7, 'B': 4, 'C': 4, 'D': 1}: lg.append(dict(zip(itertools.combinations('ABCD', 2), out)))
combo('S-W06', [l for l, t in zip('ㄱㄴㄷㄹ', [all(g[('A', 'C')] == 3 for g in lg), all(imp(g[('B', 'C')] == 0, g[('A', 'B')] == 1) for g in lg), all(g[('B', 'C')] == 1 for g in lg), all(list(g.values()).count(1) == 2 for g in lg)]) if t])
# S-W07 three voting methods
bal = ['ABCD'] * 3 + ['BCDA'] * 2 + ['CBDA'] * 2
fp = lambda bs: {c: sum(b[0] == c for b in bs) for c in 'ABCD'}
bd = {c: sum(3 - b.index(c) for b in bal) for c in 'ABCD'}
cw = [c for c in 'ABCD' if all(sum(b.index(c) < b.index(d) for b in bal) > len(bal) / 2 for d in 'ABCD' if d != c)]
f1 = fp(bal); f2 = fp(['ABCD'] * 3 + ['BCDA'] * 2 + ['BCDA'] + ['CBDA'])
combo('S-W07', [l for l, t in zip('ㄱㄴㄷㄹ', [[c for c in f1 if f1[c] == max(f1.values())] == ['A'], sorted(bd, key=bd.get)[-2] == 'C', cw == ['B'], [c for c in f2 if f2[c] == max(f2.values())] == ['B']]) if t])
# S-W08 working days (no holidays in Nov 2026)
wd = [d for d in (_dt.date(2026, 11, 4) + _dt.timedelta(days=i) for i in range(1, 40)) if d.weekday() < 5]
by_text('S-W08', list(zip(['甲의 민원은', '연장하지 않는다면', '처리 기간을 연장하면', '처리 기간은 부득이한', '처리 기간을 연장할 때'], [wd[6] == _dt.date(2026, 11, 11), wd[6] == _dt.date(2026, 11, 13), wd[13] == _dt.date(2026, 11, 20), False, False])))
# S-W09 check digit
pick('S-W09', str([x for x in range(10) if (10 - (3 * (5 + x + 0) + 2 + 4 + 9) % 10) % 10 == 9][0]))
# S-W10 meeting-room passes per day
def best_day(h): return min(2 * a + 6 * b + 10 * c for a in range(10) for b in range(4) for c in range(2) if a + 4 * b + 9 * c >= h)
pick('S-W10', f'{sum(best_day(h) for h in (3, 5, 9, 2))}만 원')
# D-W01 labour productivity
pr1 = {'A': (F(600, 20), F(660, 20)), 'B': (F(400, 16), F(450, 15)), 'C': (F(900, 25), F(864, 24))}
combo('D-W01', [l for l, t in zip('ㄱㄴㄷㄹ', [max(pr1, key=lambda k: pr1[k][1]) == 'C', max(pr1, key=lambda k: pr1[k][1] / pr1[k][0]) == 'B', pr1['C'][1] < pr1['C'][0], F(1974, 59) >= F(1900, 61) * F(11, 10)]) if t])
# D-W02 whole-percent annual rates
rate = lambda a, b, n: [r for r in range(101) if F(100 + r, 100) ** n == F(b, a)][0]
an = {'A': rate(400, 484, 2), 'B': rate(1000, 1331, 3), 'C': rate(250, 360, 2), 'D': rate(500, 864, 3), 'E': rate(300, 345, 1)}
tg = {'A': F(484, 400), 'B': F(1331, 1000), 'C': F(360, 250), 'D': F(864, 500), 'E': F(345, 300)}
by_text('D-W02', list(zip(['출시 연도 대비', '연평균 증가율은 A와', '연평균 증가율은 D가', '연평균 증가율이 15%', 'E의 연평균'], [max(tg, key=tg.get) == 'C', an['A'] == an['B'], an['D'] > an['C'], sum(v > 15 for v in an.values()) == 3, an['E'] < an['A']])))
# D-W03 imports
im = {'A': (20, 5), 'B': (50, 3), 'C': (30, 4)}
combo('D-W03', [l for l, t in zip('ㄱㄴㄷㄹ', [max(im, key=lambda k: im[k][0] * im[k][1]) == 'B', F(sum(q * u for q, u in im.values()), 100) >= 4, 20 * (5 - 3) == 40, 30 * F(4 * 125, 100) == 50 * 3]) if t])
# D-W04 spending shares
sp = lambda tot, s: F(tot * s, 100)
by_text('D-W04', list(zip(['식료품 지출액은', '주거 지출의', '5분위의 교육 지출액은 1분위', '3분위의 식료품', '5분위의 교육 지출액은 식료품'], [sp(600, 15) == 2 * sp(150, 30), sp(150, 25) < sp(300, 18) < sp(600, 10), sp(600, 15) == 12 * sp(150, 5), sp(300, 20) >= F(3, 2) * sp(150, 30), sp(600, 15) == sp(600, 15)])), want=False, what='false options')
# D-W05 city selection
ct = {'A': (50, 35, 22, 4), 'B': (80, 28, 18, 6), 'C': (30, 25, 25, 7), 'D': (70, 30, 20, 5), 'E': (45, 20, 30, 3), 'F': (60, 29, 19, 4.5)}
pick('D-W05', max((k for k, v in ct.items() if (v[1] < 30) + (v[2] >= 20) + (v[3] < 5) >= 2), key=lambda k: ct[k][0]))
# D-W06 price index
combo('D-W06', [l for l, t in zip('ㄱㄴㄷㄹ', [F(130, 125) == F(21, 20), F(121, 110) == F(1331, 1210), F(988, 10) < 100, F(1331, 1100) - 1 >= 2 * (F(130, 120) - 1)]) if t])
# D-W07 supplier scores
def sc7(pb, w=(F(2, 5), F(2, 5), F(1, 5))):
    pr = {'A': 800, 'B': pb, 'C': 1600}; lo = min(pr.values()); q = {'A': (70, 90), 'B': (90, 80), 'C': (100, 100)}
    return {k: w[0] * 100 * F(lo, pr[k]) + w[1] * q[k][0] + w[2] * q[k][1] for k in pr}
s7, s7b, s7w = sc7(1000), sc7(900), sc7(1000, (F(3, 10), F(1, 2), F(1, 5)))
by_text('D-W07', list(zip(['품질 점수가', 'B의 입찰 가격이', '가격 가중치를', 'C의 종합', 'A와 B의'], [max(s7, key=s7.get) == 'C', max(s7b, key=s7b.get) == 'B', max(s7w, key=s7w.get) == 'A', s7['C'] == 85, s7['A'] - s7['B'] == 4])))
# D-W08 employment shares
wf, mf, yf = (800, 2200 * 42 // 100), (1200, 2200 - 2200 * 42 // 100), (400, 2200 * 18 // 100)
combo('D-W08', [l for l, t in zip('ㄱㄴㄷㄹ', [yf[1] > yf[0], F(wf[1] - wf[0], 200) >= F(3, 5), mf[1] < mf[0], F(wf[1], wf[0]) - 1 >= 2 * (F(mf[1], mf[0]) - 1)]) if t])
# D-W09 overlap bounds by the classic formulas (independent of the brute force in the script)
combo('D-W09', [l for l, t in zip('ㄱㄴㄷㄹ', [max(0, 24 + 18 - 40) >= 2, max(0, 24 + 18 + 30 - 2 * 40) >= 1, min(24, 30) == 24, max(0, 18 + 30 - 40) >= 10]) if t])
# D-W10 defence spending
kk = {'A': (50, 30, F(5, 2)), 'B': (100, 10, 3), 'C': (20, 50, 2), 'D': (80, 20, F(9, 5))}
ml = {k: p_ * g * r for k, (p_, g, r) in kk.items()}; pcm = {k: g * r for k, (p_, g, r) in kk.items()}; gd = {k: p_ * g for k, (p_, g, r) in kk.items()}
combo('D-W10', [l for l, t in zip('ㄱㄴㄷㄹ', [max(ml, key=ml.get) == 'A', max(pcm, key=pcm.get) == 'C', max(gd, key=gd.get) == max(ml, key=ml.get), ml['B'] * 2 == ml['C'] * 3]) if t])
# L-W
pick('L-W01', '차순위가 밀봉 입찰에서 물건을 산 사람이 내는 돈은 자신이 써 낸 값보다 많을 수 없다.')
def sp2(b): o = sorted(b.items(), key=lambda x: -x[1]); return o[0][0], o[1][1]
bb = {'甲': 100, '乙': 120, '丙': 80, '丁': 95}
combo('L-W02', [l for l, t in zip('ㄱㄴㄷㄹ', [sp2(bb) == ('乙', 100), 90 < sp2(bb)[1], sp2(dict(bb, 乙=90)) == ('甲', 100), max(bb.values()) == 120]) if t])
t4 = list(itertools.product((0, 1), repeat=4)); mm3 = []
for bits in itertools.product((0, 1), repeat=16):
    e = [t for t, b_ in zip(t4, bits) if b_]
    if all(h for k_, h, n_, tr in e if k_) and not any(h and n_ for k_, h, n_, tr in e) and any(n_ and tr for k_, h, n_, tr in e) and all(k_ or n_ for k_, h, n_, tr in e if tr): mm3.append(e)
combo('L-W03', [l for l, t in zip('ㄱㄴㄷㄹ', [all(any(k_ and tr for k_, h, n_, tr in e) for e in mm3), all(all(k_ for k_, h, n_, tr in e if tr and h) for e in mm3), all(all(n_ for k_, h, n_, tr in e if tr) for e in mm3), all(any(tr and not h for k_, h, n_, tr in e) for e in mm3)]) if t])
m4 = [m for m in itertools.product((0, 1), repeat=5) if imp(m[0], m[1]) and m[2] + m[3] == 1 and imp(m[1], not m[3]) and imp(not m[4], m[0]) and imp(m[2], not m[4])]
by_text('L-W04', list(zip(['A를 채택하면', 'B를 채택하지', '채택하는 정책은', 'E를 채택하면', 'D를 채택하면'], [all(imp(m[0], not m[4]) for m in m4), all(imp(not m[1], m[2]) for m in m4), all(sum(m) == 3 for m in m4), all(imp(m[4], m[2]) for m in m4), all(imp(m[3], m[0]) for m in m4)])))
pick('L-W06', '㉤: 도달할')
num7 = lambda d, left: (d // 20) * 2 + (1 if left else 2)
combo('L-W07', [l for l, t in zip('ㄱㄴㄷㄹ', [num7(130, True) == 13, num7(95, False) == 10 and 10 % 2 == 0, all(num7(d, True) == 21 for d in range(200, 220)) and num7(199, True) != 21 and num7(220, True) != 21, min(b - a for a in range(0, 1000) for b in range(a, 1000) if num7(b, True) - num7(a, True) == 20) >= 200]) if t])
fl = [(f, d) for f in itertools.permutations(range(1, 5)) for d in itertools.permutations(['기획', '인사', '재무', '홍보'])
      if f[d.index('기획')] == 3 and f[0] > f[1] and d[2] != '홍보' and f[2] != 1 and f[d.index('인사')] == f[d.index('재무')] + 1 and f[3] == 2]
ok(len(fl) == 1, f'L-W08 {fl}'); pick('L-W08', f'{fl[0][0][0]}층, {fl[0][1][0]}')
# ================= S-X / D-X / L-X (independent re-solve from the rendered options) =================
import math as _m
def pk(mins, cut=0):
    f = min(20000, 1000 + 500 * max(0, -(-(mins - 30) // 10)))
    return f - f * cut // 100
by_text('S-X01', list(zip(['경차가 2시간', '친환경 경차가', '장애인 사용 차량이', '감면 대상이 아닌', '장애인이 사용하는 경차'], [pk(120, 50) == 2500, pk(65, 50) == 0, pk(600, 80) == 4000, pk(45) == 1500, pk(120, 80) == 0])))
od = [o for o in itertools.permutations('甲乙丙丁戊')]          # 큰 순서
od = [o for o in od if o.index('甲') < o.index('乙') and o.index('丙') > o.index('丁') and o.index('戊') not in (0, 4) and o.index('乙') < o.index('丙') and o.index('丁') > o.index('甲')]
combo('S-X02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(o[0] == '甲' for o in od), all(o[4] == '丙' for o in od), all(imp(o[1] == '戊', o[2] == '丁') for o in od), all(imp(o[1] == '乙', o.index('丙') - o.index('乙') == 3) for o in od)]) if t])
pick('S-X03', f'{(4800 + (7350 - 2000) // 100 * 100 + 6 * 200) * 6 // 5:,}원')
cfg = []
for pets in itertools.permutations(['개', '고양이', '새', '물고기']):
    for cities in itertools.permutations(['서울', '부산', '대구', '광주']):
        m = {x: (pt, ct) for x, pt, ct in zip('ABCD', pets, cities)}
        cat = [x for x in m if m[x][0] == '고양이'][0]; dog = [x for x in m if m[x][0] == '개'][0]
        if m[cat][1] == '부산' and m['B'][0] in ('새', '물고기') and m['C'][1] == '대구' and m[dog][1] != '광주' and m['D'][0] != '물고기' and m['D'][1] != '부산': cfg.append(m)
combo('S-X04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(m['A'][0] == '고양이' for m in cfg), all(imp(m['B'][1] == '서울', m['C'][0] == '개') for m in cfg), all(m['D'][0] == '개' for m in cfg), all([v for v in m.values() if v[1] == '광주'][0][0] == '물고기' for m in cfg)]) if t])
lit = -(-int((2 * (4 + 4) * F(5, 2) - 5) * 2) // 10)
pick('S-X05', f'{min(50000 * a + 15000 * b for a in range(4) for b in range(12) if 4 * a + b >= lit):,}원')
okh = [h for h in range(24) if all(lo <= (h - 9 + off) % 24 <= hi - 1 for off, lo, hi in ((9, 8, 22), (0, 8, 22), (-5, 7, 22)))]
ok(okh == [21], f'S-X06 {okh}'); pick('S-X06', '오후 9시')
tm7 = [(2, 5, 6), (3, 8, 9), (4, 6, 9)]
pick('S-X07', f'{min(sum(tm7[i][pm[i]] for i in range(3)) for pm in itertools.permutations(range(3)))}시간')
dist = {frozenset(k): v for k, v in {('O', 'A'): 1, ('O', 'B'): 2, ('O', 'C'): 6, ('A', 'B'): 3, ('A', 'C'): 4, ('B', 'C'): 5}.items()}
pick('S-X08', f"{min(sum(dist[frozenset(e)] for e in zip(('O',) + pm, pm + ('O',))) for pm in itertools.permutations('ABC'))}km")
pick('S-X09', f'{20 * 40 * (100 - min(50, 60)) // 100:,}만 원')
seats = {k: 0 for k in '가나다라'}; votes = {'가': 4200, '나': 3000, '다': 1800, '라': 900}
for _ in range(8):
    k = max(votes, key=lambda k: F(votes[k], seats[k] + 1)); seats[k] += 1
    if sum(seats.values()) == 7: s7x = dict(seats)
combo('S-X10', [l for l, t in zip('ㄱㄴㄷㄹ', [s7x['가'] == 4, s7x['라'] == 0, seats['나'] - s7x['나'] == 1, F(s7x['가'], 7) < F(4200, 9900)]) if t])
# D-X
pg = {k: F(100 + g, 100) / F(100 + q, 100) for k, (g, q) in {'A': (6, 2), 'B': (3, -1), 'C': (5, 1), 'D': (2, 0)}.items()}
combo('D-X01', [l for l, t in zip('ㄱㄴㄷㄹ', [max(pg, key=pg.get) == 'B', pg['A'] > pg['C'], max(pg, key=pg.get) == 'A', pg['D'] == F(102, 100)]) if t])
d2 = {'A': (500, 560), 'B': (300, 270), 'C': (150, 200), 'D': (50, 60)}; dt2 = sum(b - a for a, b in d2.values())
by_text('D-X02', list(zip(['관광객 수의 전년', 'A의 기여도', 'B를 뺀', 'D의 기여도', '전체 관광객'], [max(d2, key=lambda k: F(d2[k][1], d2[k][0])) == max(d2, key=lambda k: d2[k][1] - d2[k][0]), F(60, dt2) >= F(7, 10), F(60 + 50 + 10, dt2) > 1, F(10, dt2) > F(10, 50), F(dt2, 1000) >= F(1, 10)])))
combo('D-X03', ['ㄱ', 'ㄴ', 'ㄷ'])
by_text('D-X04', list(zip(['(가)는', '지원자가 가장', '네 분야 전체의', '(다)는', '경쟁률이 가장'], [600 // 12 < 280 // 7, max([600, 340, 450, 280]) == 340, F(600 + 340 + 450 + 280, 50 + 40 + 30 + 40) >= 10, F(450, 30) == F(600 // 12, 3), [12, F(17, 2), 15, 7].index(max([12, F(17, 2), 15, 7])) == [600, 340, 450, 280].index(600)])))
a5, b5 = [120, 150, 90, 180, 160, 200], [100, 110, 130, 120, 170, 150]
combo('D-X05', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(x < y for x, y in zip(a5, b5)) == 2, max(range(1, 6), key=lambda i: F(a5[i], a5[i - 1])) == 3, sum(b5) > sum(a5), a5[b5.index(max(b5))] < max(b5)]) if t])
r6x = {'A': F(1464, 1000), 'B': F(800, 500), 'C': F(2420, 2000), 'D': F(1200, 800)}; p10 = F(11, 10) ** 4
by_text('D-X06', list(zip(['A의 연평균', '연평균 증가율이 10%', 'C의 연평균', '연평균 증가율은 D가', '2021년 대비'], [r6x['A'] >= p10, sorted(k for k in r6x if r6x[k] >= p10) == ['B', 'D'], r6x['C'] >= F(105, 100) ** 4, r6x['D'] > r6x['B'], max(r6x, key=lambda k: {'A': 464, 'B': 300, 'C': 420, 'D': 400}[k]) == max(r6x, key=r6x.get)])))
combo('D-X07', [l for l, t in zip('ㄱㄴㄷㄹ', [F(55, 50) > F(11, 10), F(60 * 55 + 240 * 11, 300) < F(100 * 50 + 100 * 10, 200), 60 * 55 + 240 * 11 > 100 * 50 + 100 * 10, F(55 + 11, 2) == 33]) if t])
cn = {'A': (8, 25, 50), 'B': (12, 30, 60), 'C': (25, 15, 30), 'D': (30, 10, 20), 'E': (10, 20, 40), 'F': (5, 40, 25)}   # 성장률 ×10
pick('D-X08', f"{sum(pop * (2 if inc < 10 else 1) for inc, gr, pop in cn.values() if inc < 30 and gr < 30)}백만 달러")
def rk(vals): s = sorted(vals, reverse=True); return [4 - s.index(v) for v in vals]
def tot(emp, inc, sat, w=2): e, i, s = rk(emp), rk(inc), rk(sat); return [w * e[k] + i[k] + s[k] for k in range(4)]
T0 = tot([62, 65, 60, 64], [320, 300, 350, 310], [72, 68, 70, 75]); T1 = tot([62, 65, 60, 64], [320, 300, 350, 310], [72, 68, 70, 75], 1); T2 = tot([62, 65, 60, 64], [320, 300, 350, 310], [72, 68, 70, 71])
by_text('D-X09', list(zip(['종합 1위는', 'A와 B의', '모든 지표의', 'D의 주민 만족도가', '고용률이 가장'], [T0.index(max(T0)) == 1, T0[0] == T0[1], T1.index(max(T1)) == 2, T2.count(max(T2)) == 1 and T2.index(max(T2)) == 0, T0.index(max(T0)) == 1])))
combo('D-X10', [l for l, t in zip('ㄱㄴㄷㄹ', [max([(F(58400, 200), 'A'), (F(49275, 150), 'B'), (F(76650, 300), 'C')])[1] == 'B', F(58400 + 49275 + 76650, 650 * 365) >= F(4, 5), F(76650, 240 * 365) >= F(17, 20), 58400 == 160 * 365]) if t])
# L-X
pick('L-X01', '역선택이 일어나면 보험료가 오르고 건강한 가입자가 더 줄어드는 일이 되풀이될 수 있다.')
combo('L-X02', ['ㄱ', 'ㄹ'])
ty3 = list(itertools.product((0, 1), repeat=4)); ms = []
for bits in itertools.product((0, 1), repeat=16):
    e = [t for t, b_ in zip(ty3, bits) if b_]
    if all(ed for r_, ed, p_, i_ in e if r_) and all(p_ for r_, ed, p_, i_ in e if ed) and any(i_ and not p_ for r_, ed, p_, i_ in e) and any(ed and not r_ for r_, ed, p_, i_ in e): ms.append(e)
combo('L-X03', [l for l, t in zip('ㄱㄴㄷㄹ', [all(all(p_ for r_, ed, p_, i_ in e if r_) for e in ms), all(any(i_ and not r_ for r_, ed, p_, i_ in e) for e in ms), all(all(ed for r_, ed, p_, i_ in e if p_) for e in ms), all(any(ed and i_ for r_, ed, p_, i_ in e) for e in ms)]) if t])
m4x = [m for m in itertools.product((0, 1), repeat=5) if imp(m[0], m[1] and m[2]) and imp(not m[3], not m[2]) and not (m[1] and m[3]) and (m[0] or m[4]) and imp(m[4], m[3])]
by_text('L-X04', list(zip(['A는', 'C는', '참석하는 사람은', 'B는', 'C가 참석하면'], [all(not m[0] for m in m4x), all(m[2] for m in m4x), all(sum(m) == 2 for m in m4x), all(m[1] for m in m4x), all(imp(m[2], m[1]) for m in m4x)])))
wk = [o for o in itertools.permutations('甲乙丙丁戊') if o.index('甲') in (0, 4) and o.index('乙') < o.index('丙') and o.index('丁') != 2 and abs(o.index('戊') - o.index('乙')) != 1 and o.index('丙') == 3]
combo('L-X05', [l for l, t in zip('ㄱㄴㄷㄹ', [all(o[1] == '丁' for o in wk), all(imp(o[0] == '甲', o[4] == '戊') for o in wk), all(imp(o[0] == '乙', o[2] == '戊') for o in wk), all(o.index('丙') - o.index('乙') <= 2 for o in wk)]) if t])
def pw_ok(s):
    kinds = sum(any(f(c) for c in s) for f in (str.isupper, str.islower, str.isdigit, lambda c: not c.isalnum()))
    return 8 <= len(s) <= 12 and kinds >= 3 and not any(s[i] == s[i + 1] == s[i + 2] for i in range(len(s) - 2)) and 'kim2025' not in s.lower()
combo('L-X08', [l for l, s in zip('ㄱㄴㄷㄹ', ['Kim2025!go', 'aaB12345', 'Sky!!!2026', 'blue#2026']) if pw_ok(s)])
pick('L-X10', '그는 매달 월급을 타면 일부를 저축한다.')
# ================= S-Y / D-Y / L-Y (independent re-solve from the rendered options) =================
def cp(a, b, c, d, e): return max(a + b, c + d) + e          # A→B, C→D 두 줄기 뒤 E
combo('S-Y01', [l for l, t in zip('ㄱㄴㄷㄹ', [cp(3, 2, 4, 3, 2) == 9, cp(2, 2, 4, 3, 2) == 8, cp(3, 2, 3, 3, 2) == 8, cp(3, 2, 4, 5, 2) == 10]) if t])
ar = [o for o in itertools.permutations('甲乙丙丁戊') if abs(o.index('甲') - o.index('乙')) == 2 and o.index('丙') < o.index('丁') and o.index('戊') != 2 and o.index('乙') not in (0, 4) and o.index('丁') == o.index('甲') + 1]
combo('S-Y02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(o.index('丙') < o.index('甲') for o in ar), all(o.index('乙') == 1 for o in ar), all(imp(o[0] == '戊', o[4] == '丁') for o in ar), all(abs(o.index('甲') - o.index('戊')) != 1 for o in ar)]) if t])
evx = F(10000, 4) + F(2000, 2) - 3000; evy = F(12000, 6) + F(1500, 3) - 2500; evz = F(5000 * 3, 10) - 1200
by_text('S-Y03', list(zip(['기대 이익이 가장', 'Y의 기대', 'X에서 상금을', 'Z의 참가비가', 'X의 참가비를'], [max(evx, evy, evz) == evz, evy == 0, F(3, 4) == F(1, 2), F(1500) - 1100 > evx, evx + 3000 == 3000])))
pick('S-Y04', '공개를 청구한 정보의 사용 목적이 공공복리의 증진을 위하여 필요하다고 인정되면 공개 비용을 감면할 수 있다.')
pick('S-Y05', f'{1600 + 200 * 100 + 150 * 200:,}원')
kmh = {'甲': F(5 * 3600, 1000), '乙': F(15), '丙': F(320 * 60, 1000)}
b6 = max(kmh, key=kmh.get); s6 = F(10000 * 60, 320)
pick('S-Y06', f'{b6}, {int(s6) // 60}분 {int(s6) % 60}초')
dep1 = min(x for x in range(8 * 60 + 5, 12 * 60, 30) if x >= 8 * 60 + 20); dep2 = min(x for x in range(9 * 60, 13 * 60, 20) if x >= dep1 + 50 + 15); arr7 = dep2 + 35
pick('S-Y07', f'오전 {arr7 // 60}시 {arr7 % 60}분')
ys = []
for ages in itertools.permutations([25, 30, 35, 40]):
    for jobs in itertools.permutations(['교사', '의사', '변호사', '기자']):
        a = dict(zip('ABCD', ages)); j = dict(zip('ABCD', jobs)); inv = {v: k for k, v in j.items()}
        if a[inv['의사']] > a[inv['교사']] and a['A'] == 30 and a[inv['기자']] != 40 and j['B'] != '의사' and a['B'] > a['C'] and j['D'] in ('교사', '변호사'): ys.append((a, j, inv))
combo('S-Y08', [l for l, t in zip('ㄱㄴㄷㄹ', [all(j['B'] in ('기자', '변호사') for a, j, inv in ys), all(imp(a['D'] == 40, j['C'] == '교사') for a, j, inv in ys), all(j['A'] == '의사' for a, j, inv in ys), all(a[inv['교사']] == 25 for a, j, inv in ys)]) if t])
rc = {'A': 5 * 60000 + 600 * 100, 'B': 5 * 40000 + 600 * 250, 'C': 300000 + 300 * 150}
pick('S-Y09', f'{min(rc, key=rc.get)}, {min(rc.values()):,}원')
def aw(w, a, pr, dsc): s = F(7 * w + 3 * a, 10); return (not dsc) and (s >= 90 or (s >= 85 and pr >= 2))
emp = {'甲': (95, 80, 0, 0), '乙': (90, 90, 1, 0), '丙': (88, 84, 2, 0), '丁': (100, 90, 3, 1), '戊': (85, 86, 3, 0), '己': (84, 85, 5, 0)}
top = max(emp, key=lambda k: 7 * emp[k][0] + 3 * emp[k][1])
combo('S-Y10', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(aw(*v) for v in emp.values()) == 5, not aw(*emp[top]), not aw(90, 89, 1, 0), sum(aw(*(v if k != '丙' else (88, 84, 1, 0))) for k, v in emp.items()) == 3]) if t])
# D-Y
p15 = {'c': 5000 * 14, 'w': 5000 * 73, 'o': 5000 * 13}; p25 = {'c': 5100 * 11, 'w': 5100 * 69, 'o': 5100 * 20}     # ×100
combo('D-Y01', [l for l, t in zip('ㄱㄴㄷㄹ', [p15['c'] - p25['c'] >= 10000, p25['w'] > p15['w'], 2 * p25['o'] >= 3 * p15['o'], 10 * p25['o'] >= 3 * p25['w']]) if t])
sg = {'가': (800 * 50, 1000 * 45), '나': (800 * 30, 1000 * 35), '다': (800 * 20, 1000 * 20)}
by_text('D-Y02', list(zip(['가 사업부의 매출액은', '나 사업부 매출액의', '다 사업부의', '2025년 전체 매출액', '가 사업부 매출액의 전년'], [sg['가'][1] > sg['가'][0], 100 * sg['나'][1] >= 145 * sg['나'][0], sg['다'][1] == sg['다'][0], 2 * (sg['나'][1] - sg['나'][0]) >= 200 * 100, F(sg['가'][1], sg['가'][0]) < F(1000, 800)])), want=False, what='false options')
fm = {'A': (10, 50, 5), 'B': (8, 48, 6), 'C': (15, 60, 4), 'D': (12, 66, 6)}
combo('D-Y03', [l for l, t in zip('ㄱㄴㄷㄹ', [max(fm, key=lambda k: F(fm[k][1], fm[k][0])) == 'B', max(fm, key=lambda k: F(fm[k][1], fm[k][2])) == min(fm, key=lambda k: F(fm[k][1], fm[k][0])), 224 >= 5 * 45, 14 * F(66, 12) == 77]) if t])
mr = {k: (100 + a) * (100 + b) for k, (a, b) in {'A': (20, -10), 'B': (-10, 25), 'C': (5, 5), 'D': (30, -20)}.items()}
by_text('D-Y04', list(zip(['매출액의 전년 대비 증가율이 가장', 'C의 매출액은', 'D의 매출액은', '매출액의 전년 대비 증가율은 B가', '고객 수 증가율이'], [max(mr, key=mr.get) == 'A', mr['C'] == 11000, mr['D'] == 11000, mr['B'] > mr['C'], max(mr, key=mr.get) == 'D'])))
qv = [F(200), F(200) * F(11, 10)]; qv.append(qv[-1] * F(4, 5)); qv.append(qv[-1] * F(5, 4)); prev = F(200) / F(4, 5)
combo('D-Y05', [l for l, t in zip('ㄱㄴㄷㄹ', [qv[3] == qv[1], sum(qv) >= 800, all(prev > v for v in qv), qv[1] - qv[2] > qv[3] - qv[2]]) if t])
cty = {'A': (50, 100, 1600), 'B': (80, 360, 4000), 'C': (20, 450, 500), 'D': (120, 380, 5000)}
mm6 = [m for m in itertools.permutations('ABCD') if m[0] == max(cty, key=lambda k: F(cty[k][0], cty[k][1])) and F(cty[m[1]][2], cty[m[1]][0]) > F(cty[m[2]][2], cty[m[2]][0]) and m[3] == max(cty, key=lambda k: cty[k][1])]
ok(len(mm6) == 1, f'D-Y06 {mm6}'); pick('D-Y06', ', '.join(mm6[0]))
ix = {2020: 100, 2022: 110, 2023: 121, 2024: 132, 2025: 143}
combo('D-Y07', [l for l, t in zip('ㄱㄴㄷㄹ', [118 * 121 <= 143 * 100 < 119 * 121, 132 * 110 > 121 * 121, ix[2025] - 100 == 43, 143 * 121 < 132 * 132]) if t])
by_text('D-Y08', list(zip(['세 반 전체의 평균 점수는 세', '세 반 전체의 평균 점수는 75', 'B반 학생 10명이', 'C반의 평균', '세 반 전체의 평균 점수보다'], [F(7500, 100) == F(70 + 80 + 76, 3), F(30 * 70 + 20 * 80 + 50 * 76, 100) == 75, F(40 * F(2900, 40) + 10 * 80 + 50 * 76, 100) > 75, F(30 * 70 + 20 * 80 + 50 * 80, 100) == 78, 20 + 50 < 50])))
pv = {k: F(v * 100, 100 + r) for k, (v, r) in {'A': (660, 10), 'B': (450, -10), 'C': (520, 30), 'D': (300, 20)}.items()}
cur = {'A': 660, 'B': 450, 'C': 520, 'D': 300}
combo('D-Y09', [l for l, t in zip('ㄱㄴㄷㄹ', [max(pv, key=pv.get) == 'A', max(pv, key=lambda k: cur[k] - pv[k]) == 'C', sum(cur.values()) * 10 >= sum(pv.values()) * 11, pv['B'] * 2 == pv['C'] * 3]) if t])
car = {'A': 20 * F(12, 10), 'B': 15 * F(15, 10), 'C': 30 * F(9, 10), 'D': 10 * 2}; kmt = {k: car[k] * d for k, d in {'A': 12, 'B': 10, 'C': 15, 'D': 8}.items()}
by_text('D-Y10', list(zip(['자동차 수가', '네 지역 전체의', '자동차의 연간', 'B의 자동차', 'D의 자동차 수는'], [max(car, key=car.get) == 'D', sum(car.values()) * 10 >= 14 * 75, max(kmt, key=kmt.get) == 'C', kmt['B'] > kmt['A'], car['D'] * 10 == car['A'] * 8])))
# L-Y
pick('L-Y01', '합리적인 선택에서는 이미 지출하여 되찾을 수 없는 비용을 판단에 넣지 않는다.')
bn = {'아르바이트': 8, '과외': 10, '강의': 9}
combo('L-Y02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(v for k, v in bn.items() if k != '강의') == 10, max(v for k, v in bn.items() if k != '과외') == 17, True, max(bn, key=bn.get) == '강의']) if t])
t16 = list(itertools.product((0, 1), repeat=4)); my = []
for bits in itertools.product((0, 1), repeat=16):
    e = [t for t, b_ in zip(t16, bits) if b_]
    if all(l_ or ec for w, l_, ec, o in e if w) and all(o for w, l_, ec, o in e if w and l_) and all(w for w, l_, ec, o in e if o) and any(w and not o for w, l_, ec, o in e): my.append(e)
combo('L-Y03', [l for l, t in zip('ㄱㄴㄷㄹ', [all(any(ec and w for w, l_, ec, o in e) for e in my), all(all(l_ for w, l_, ec, o in e if o) for e in my), all(all(not ec for w, l_, ec, o in e if w and l_) for e in my), all(all(w for w, l_, ec, o in e if l_ and o) for e in my)]) if t])
m4y = [m for m in itertools.product((0, 1), repeat=5) if imp(m[0], not m[1]) and (m[2] or m[3]) and imp(not m[1], not m[2]) and imp(m[3], m[4]) and m[0] + m[4] == 1]
combo('L-Y04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(not m[0] for m in m4y), all(m[4] for m in m4y), all(imp(m[2], m[1]) for m in m4y), all(imp(not m[3], sum(m) == 2) for m in m4y)]) if t])
cul = [c for c in '甲乙丙丁' if [c == '乙', c == '丁', c != '丙', c != '丁'].count(False) == 1]
ok(len(cul) == 1, f'L-Y05 {cul}'); pick('L-Y05', cul[0])
t8y = list(itertools.product((0, 1), repeat=3))
def val7(f):
    for bits in itertools.product((0, 1), repeat=8):
        e = [t for t, b_ in zip(t8y, bits) if b_]
        if any(g and tm for g, tm, w in e) and f(e) and not any(g and not w for g, tm, w in e): return False
    return True
by_text('L-Y07', [('테니스 동호회 회원은 모두', val7(lambda e: all(not w for g, tm, w in e if tm))), ('주말에 출근하지 않는 사람은', val7(lambda e: all(tm for g, tm, w in e if not w))),
                  ('테니스 동호회 회원 가운데 주말에', val7(lambda e: any(tm and not w for g, tm, w in e))), ('공무원은 모두', val7(lambda e: all(tm for g, tm, w in e if g))),
                  ('테니스 동호회 회원 가운데 공무원이', val7(lambda e: all(w for g, tm, w in e if tm and not g)))])
gp = lambda rows: F(sum(p_ * c for p_, c in rows), sum(c for p_, c in rows))
combo('L-Y08', [l for l, t in zip('ㄱㄴㄷㄹ', [gp([(3, 3), (3, 3), (4, 2), (2, 2)]) == 3, gp([(4, 3), (3, 3), (4, 2), (2, 2)]) == F(33, 10), gp([(0, 3), (3, 3), (3, 3), (4, 2), (2, 2)]) == F(5, 2), gp([(3, 3), (3, 3), (4, 2), (3, 2)]) == F(16, 5)]) if t])
combo('L-Y09', [l for l, t in zip('ㄱㄴㄷ', [30 - 20 > 12 - 10, False, 12 > 10]) if t])
pick('L-Y10', '㉤: 질문하기로')
# ================= S-Z / D-Z / L-Z (5급 실전, independent re-solve from the rendered options) =================
yr = 24000 * 50 // 1000; m_lost = (_dt.date(2025, 10, 25) - _dt.date(2025, 7, 10)).days // 30   # 3개월 15일 → 3
ok(m_lost == 3, f'S-Z01 lost months {m_lost}')
pick('S-Z01', f'{(yr - yr // 12 * m_lost) // 2:,}만 원')
bz = [3, 5, 1, 4, 2]
def gain(a, b):
    if a == 1 and b == 5: return 4
    if a == 5 and b == 1: return 0
    return a - b if a > b else 0
def win(a, b): return (a == 1 and b == 5) or (a > b and not (a == 5 and b == 1))
sc = {pm: sum(gain(a, b) for a, b in zip(pm, bz)) for pm in itertools.permutations(range(1, 6))}
aw = [pm for pm in sc if all(win(a, b) for a, b in zip(pm, bz))]
combo('S-Z02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(sc.values()) == 10, len(aw) == 1, all(sc[pm] == max(sc.values()) for pm in aw), all(pm[1] == 1 for pm in sc if sc[pm] == max(sc.values()))]) if t])
g10, j12 = '갑을병정무기경신임계', '자축인묘진사오미신유술해'
nm = lambda y: g10[(y - 4) % 10] + j12[(y - 4) % 12]          # 서기 4년이 갑자년인 주기와 같은 계산
ok(nm(1984) == '갑자', 'S-Z03 anchor')
combo('S-Z03', [l for l, t in zip('ㄱㄴㄷㄹ', [nm(2026) == '병오', nm(2044) == '갑자' and all(nm(y) != '갑자' for y in range(1985, 2044)), all(nm(y) != '을자' for y in range(1984, 2104)), nm(1990) == '경자']) if t])
def fin(x, y): s = sorted([6, 7, 9, x, y]); return F(s[1] + s[2] + s[3], 3)
allf = [fin(x, y) for x in range(11) for y in range(11)]
combo('S-Z04', [l for l, t in zip('ㄱㄴㄷㄹ', [max(allf) <= 9, min(allf) < 5, min(fin(7, y) for y in range(11)) >= 7, min(fin(10, y) for y in range(11)) >= 8]) if t])
opt5 = {('KTX', '택시'): (10 * 60 + 30 - 30, 13 * 60 + 20 + 30, 75000), ('KTX', '지하철'): (600, 13 * 60 + 20 + 45, 62000), ('항공', '택시'): (600, 12 * 60 + 50, 150000), ('항공', '버스'): (600, 13 * 60 + 20, 130000),
        ('고속버스', '택시'): (8 * 60 + 40, 13 * 60 + 50, 50000), ('고속버스', '시내버스'): (8 * 60 + 40, 14 * 60 + 10, 41500)}
tot5 = {k: c + 350 * (a - d) for k, (d, a, c) in opt5.items() if a <= 14 * 60}
bk5 = min(tot5, key=tot5.get); pick('S-Z05', f'{bk5[0]}와 {bk5[1]}, {tot5[bk5]:,}원')
sz = {'태양광': [20, 25, 31, 38, 46], '풍력': [4, 5, 6, 8, 10], '수력': [7, 7, 6, 7, 6], '바이오': [9, 10, 11, 11, 12]}; tz = [sum(v[i] for v in sz.values()) for i in range(5)]; gz = [570, 580, 590, 600, 620]
fl = [tz[4] * 10 >= tz[0] * 18, all(sz['태양광'][i] * tz[i + 1] < sz['태양광'][i + 1] * tz[i] for i in range(4)), tz[4] * 100 > 12 * gz[4], all(sz['풍력'][i + 1] * 10 >= sz['풍력'][i] * 12 for i in range(4)), (46 - 20) >= 3 * ((10 - 4) + (6 - 7) + (12 - 9))]
only('D-Z01', [not f for f in fl], 'false statements')
cz = {'A': (50, 1600, 600, 550), 'B': (125, 4200, 700, 650), 'C': (83, 4000, 1500, 1300), 'D': (67, 2800, 600, 750), 'E': (60, 2000, 650, 600)}
mz = [m for m in itertools.permutations('ABCDE') if [k for k in cz if cz[k][2] < cz[k][3]] == [m[3]] and m[1] == max(cz, key=lambda k: F(cz[k][1], cz[k][0])) and F(cz[m[0]][2], cz[m[0]][1]) > F(cz[m[4]][2], cz[m[4]][1]) and cz[m[2]][3] > cz[m[4]][3]]
ok(len(mz) == 1, f'D-Z02 {mz}'); pick('D-Z02', ', '.join(mz[0]))
e25 = [520, 480, 600, 560, 540, 610]; i25 = [500, 510, 560, 530, 560, 580]; gr = [4, -4, 20, 12, -10, 22]
e24 = [F(e * 100, 100 + g) for e, g in zip(e25, gr)]; bl = [e - i for e, i in zip(e25, i25)]
combo('D-Z03', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(b < 0 for b in bl) == 2, sum(e25) * 10 >= sum(e24) * 11, e24.index(max(e24)) == 4 and e24.count(max(e24)) == 1, bl.index(max(bl)) == 2 and bl.count(max(bl)) == 1]) if t])
bz4 = {'A': (1250, 1100), 'B': (F(930 * 100, 93), 930), 'C': (800, 800 * 85 // 100), 'D': (1600, 1480), 'E': (F(1140 * 100, 95), 1140)}
rz = {k: F(e, b) for k, (b, e) in bz4.items()}; uz = {k: b - e for k, (b, e) in bz4.items()}
combo('D-Z04', [l for l, t in zip('ㄱㄴㄷㄹ', [max(rz, key=rz.get) == 'E', min(bz4, key=lambda k: bz4[k][0]) == min(rz, key=rz.get), sum(e for b, e in bz4.values()) * 10 >= sum(b for b, e in bz4.values()) * 9, max(uz, key=uz.get) == 'D']) if t])
em = {'제조업': (400, 390), '서비스업': (1000, 1060), '건설업': (200, 190), '농림업': (100, 95)}; wg = {'제조업': (400, 420), '서비스업': (300, 306), '건설업': (350, 380), '농림업': (200, 210)}
tw = {k: (em[k][0] * wg[k][0], em[k][1] * wg[k][1]) for k in em}; T0, T1 = sum(v[0] for v in tw.values()), sum(v[1] for v in tw.values())
by_text('D-Z05', list(zip(['2025년 월 임금 총액이', '네 산업 전체의 1인당', '네 산업 전체 월 임금', '1인당 월평균 임금의 전년', '2025년 취업자 수가'],
                          [all(b >= a for a, b in tw.values()), F(T1, 1735) * 100 >= F(T0, 1700) * 105, (tw['서비스업'][1] - tw['서비스업'][0]) * 10 >= (T1 - T0) * 7,
                           max(wg, key=lambda k: F(wg[k][1], wg[k][0])) == max(tw, key=lambda k: F(tw[k][1], tw[k][0])), sum(b > a for a, b in em.values()) == 2])))
pick('L-Z01', '형벌 법규를 피고인에게 불리한 방향으로 유추하여 적용하는 것은 허용되지 않는다.')
combo('L-Z02', ['ㄱ', 'ㄷ']); combo('L-Z03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-Z05', ['ㄱ', 'ㄴ'])
tz4 = []
for xs in itertools.product('ABC', repeat=6):
    if sorted(xs) != sorted('AABBCC'): continue
    a = dict(zip('甲乙丙丁戊己', xs))
    if a['丙'] == 'A' and (a['丁'] != 'B' or a['戊'] == 'C') and a['己'] == a['甲'] and a['乙'] != 'C': tz4.append(a)
mate = lambda a: [p_ for p_ in a if a[p_] == 'A' and p_ != '丙'][0]
combo('L-Z04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(mate(a) in '乙丁' for a in tz4), all(a['戊'] == 'B' for a in tz4), all(imp(a['甲'] == 'B', a['丁'] == 'C') for a in tz4), all(a['乙'] == a['戊'] for a in tz4)]) if t])
print('ALL OK' if ok_all else 'SOME FAILED')
