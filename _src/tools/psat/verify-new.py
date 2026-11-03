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
print('ALL OK' if ok_all else 'SOME FAILED')
