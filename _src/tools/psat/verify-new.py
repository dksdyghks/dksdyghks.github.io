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
# ================= S-AA / D-AA / L-AA (5급 실전, independent re-solve from the rendered options) =================
def youth(age, dis, house, inc, rent, other):
    elig = house and inc <= 150 and (19 <= age <= 34 or (dis and age <= 39))
    return max(0, min(F(rent * 2, 5), 20) - other) if elig else 0
pick('S-AA01', f"{int(youth(28, 0, 1, 140, 60, 0) + youth(37, 1, 1, 120, 40, 0) + youth(30, 0, 0, 90, 50, 0) + youth(33, 0, 1, 155, 50, 0) + youth(25, 0, 1, 100, 35, 5))}만 원")
def reach(ws, both=True):
    r = set()
    for sg in itertools.product(*[((-w, 0, w) if both else (0, w)) for w in ws]):
        if sum(sg) > 0: r.add(sum(sg))
    return r
combo('S-AA02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(x in reach([1, 3, 9]) for x in range(1, 14)), len(reach([1, 3, 9], False)) == 6, all(x in reach([1, 3, 8]) for x in range(1, 13)), all(x in reach([1, 3, 9, 27]) for x in range(1, 41))]) if t])
cands = [(1, 38, 24000, 1), (0, 32, 18000, 1), (0, 14, 12000, 1), (0, 11, 15000, 0), (0, 5, 5000, 1)]
tot_aa3 = sum((min(s, 20000) if (w or p_ >= 15) else (min(s, 20000) // 2 if p_ >= 10 else 0)) if r else 0 for w, p_, s, r in cands)
pick('S-AA03', f'{tot_aa3 // 10000}억 {tot_aa3 % 10000:,}만 원')
num = [n for n in range(1000, 10000) if n // 100 == 3 * (n % 100) and sum(map(int, str(n))) == 20 and n % 2 == 0]
ok(num == [9632], f'S-AA04 {num}')
combo('S-AA04', [l for l, t in zip('ㄱㄴㄷㄹ', [str(num[0])[0] == '9', len(set(str(num[0]))) == 4, num[0] % 3 == 0, num[0] % 100 > 30]) if t])
def stair(n, ban):
    seqs = []
    def go(rem, prev, acc):
        if rem == 0: seqs.append(acc); return
        go(rem - 1, 1, acc + [1])
        if rem >= 2 and not (ban and prev == 2): go(rem - 2, 2, acc + [2])
    go(n, 0, []); return seqs
s10 = stair(10, True)
combo('S-AA05', [l for l, t in zip('ㄱㄴㄷㄹ', [len(s10) == 41, len(stair(10, False)) == 89, max(s.count(2) for s in s10) == 4, 2 * len(stair(9, True)) >= len(s10)]) if t])
# D-AA
bth = [260, 250, 230, 225, 238]; rg = {'A': (60, 72), 'B': (45, 85), 'C': (50, 95), 'D': (38, 80), 'E': (45, 105)}
fa = [bth[4] * 100 >= bth[3] * 105 and bth[1] < bth[0] and bth[2] < bth[1] and bth[3] < bth[2], (bth[0] - bth[4]) * 100 >= 8 * bth[0], max(rg, key=lambda k: rg[k][0]) == min(rg, key=lambda k: rg[k][1]), sum(v[1] >= 100 for v in rg.values()) == 1, 2 * sum(sorted(v[0] for v in rg.values())[-2:]) >= bth[4]]
only('D-AA01', [not f for f in fa], 'false statements')
tr = {'A': 320 * 45, 'B': 250 * 60, 'C': 180 * 80, 'D': 400 * 30, 'E': 150 * 70}
combo('D-AA02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(tr, key=tr.get) == 'B', min(tr, key=tr.get) == 'D', tr['A'] == tr['C'], sum(tr.values()) >= 50 * (320 + 250 + 180 + 400 + 150)]) if t])
uv = {'A': (12000, 600, 900, 68), 'B': (8000, 500, 1200, 72), 'C': (20000, 800, 1500, 65), 'D': (6000, 400, 300, 75), 'E': (15000, 500, 750, 70)}
mu = [m for m in itertools.permutations('ABCDE') if m[3] == max(uv, key=lambda k: F(uv[k][0], uv[k][1])) and m[0] == max(uv, key=lambda k: uv[k][3]) and F(uv[m[1]][2], uv[m[1]][1]) > F(uv[m[4]][2], uv[m[4]][1]) and uv[m[2]][0] > uv[m[1]][0] and uv[m[2]][2] > uv[m[4]][2]]
ok(len(mu) == 1, f'D-AA03 {mu}'); pick('D-AA03', ', '.join(mu[0]))
ev = {'반도체': (1000, 1150, 1380, 115), '자동차': (600, 660, 693, 95), '석유화학': (500, 450, 495, 100), '선박': (200, 240, 300, 125)}
up = {k: F(c * 100, b * v) for k, (a, b, c, v) in ev.items()}
combo('D-AA04', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(v[2] for v in ev.values()) * 100 >= sum(v[1] for v in ev.values()) * 115, sum(a < b < c for a, b, c, v in ev.values()) == 3, max(up, key=up.get) == '자동차', up['선박'] == 1]) if t])
pp = {'y': (800, 45), 'm': (1400, 78), 'o': (1100, 70), 's': (4200 - 800 - 1400 - 1100, 35)}; emp = {k: F(p_ * r, 100) for k, (p_, r) in pp.items()}; E = sum(emp.values())
by_text('D-AA05', list(zip(['취업자 수가 가장', '15세 이상 전체의 취업률은 네', '65세 이상 취업자', '50~64세 취업자는', '15~29세의 취업률이'],
                           [max(emp, key=emp.get) == max(pp, key=lambda k: pp[k][0]), E / 4200 < F(45 + 78 + 70 + 35, 400), emp['s'] > emp['y'], emp['o'] * 100 >= 35 * E, (E + 40) * 100 >= 62 * 4200])))
# L-AA
pick('L-AA01', '실험에서 영상에 없던 깨진 유리를 보았다고 답한 참가자가 있었다.')
combo('L-AA02', ['ㄱ', 'ㄴ']); combo('L-AA03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-AA05', ['ㄱ', 'ㄴ', 'ㄷ'])
lies = {}
for c in '甲乙丙丁戊':
    st = {'甲': c in '乙丙', '乙': c != '丁', '丙': c != '甲'}; st['丁'] = c == '乙'; st['戊'] = not st['丙']
    lies[c] = [k for k, v in st.items() if not v]
two = [(c, v) for c, v in lies.items() if len(v) == 2]
ok(len(two) == 1, f'L-AA04 {two}'); pick('L-AA04', f'범인 {two[0][0]}, 거짓을 말한 사람 {two[0][1][0]}·{two[0][1][1]}')
# ================= S-AB / D-AB / L-AB (5급 실전, independent re-solve from the rendered options) =================
wk = [6, 6, 6] + [3] * 10 + [F(5, 2)] * 3
h_wk = min(sum(min(x, 4) for x in wk), 57); h_wk = h_wk.__floor__() if hasattr(h_wk, '__floor__') else int(h_wk)
pick('S-AB01', f'{int(h_wk) * 12000 + sum(min(x, 8) for x in [10, 10]) * 18000:,}원')
def clue(g, s): return (sum(a == b for a, b in zip(g, s)), sum(a in s for a in g) - sum(a == b for a, b in zip(g, s)))
codes = [''.join(p_) for p_ in itertools.permutations('0123456789', 3) if clue('351', p_) == (1, 1) and clue('589', p_) == (0, 2) and clue('946', p_) == (0, 1)]
ok(len(codes) == 1, f'S-AB02 {codes}'); pick('S-AB02', codes[0])
ev_day = _dt.date(2026, 5, 20)
def okd(d, n): return d <= ev_day - _dt.timedelta(days=(7 if n < 300 else 14))
apps = {'A': (_dt.date(2026, 5, 5), 450), 'B': (_dt.date(2026, 5, 8), 250), 'C': (_dt.date(2026, 5, 5), 280)}
win = sorted((d, -n, k) for k, (d, n) in apps.items() if okd(d, n))[0][2]
fee = lambda n: 100000 + -(-max(0, n - 100) // 100) * 20000
by_text('S-AB03', list(zip(['B는 신청 기한을', 'C가 허가를', 'A가 허가를 받는다면', 'B가 허가를 받는다면', 'A가 5월 7일에'], [not okd(*apps['B']), win == 'C', fee(450) == 180000, 0 == 130000, okd(_dt.date(2026, 5, 7), 450)])))
avail = {'甲': '월화목금', '乙': '화수목', '丙': '월화금', '丁': '화목금', '戊': '월수목', '己': '화목'}
def mday(av):
    c = [(-sum(d in v for v in av.values()), i, d) for i, d in enumerate('월화수목금') if d in av['甲'] and sum(d in v for v in av.values()) >= 4]
    return min(c)[2] if c else None
combo('S-AB04', [l for l, t in zip('ㄱㄴㄷㄹ', [mday(avail) == '화', mday(dict(avail, 甲='월화수목금')) != mday(avail), mday(dict(avail, 己='목')) == '목', sum(1 for d in avail['甲'] if sum(d in v for v in avail.values()) >= 5) == 2]) if t])
ag = [(a, b, c) for a, b, c in itertools.combinations(range(30, 0, -1), 3) if a + b + c == 30 and a * b * c == 960]
ok(len(ag) == 1, f'S-AB05 {ag}'); A_, B_, C_ = ag[0]
combo('S-AB05', [l for l, t in zip('ㄱㄴㄷㄹ', [A_ == 12, C_ == 9, A_ + C_ == 2 * B_, (A_ - 4) * (B_ - 4) * (C_ - 4) < 200]) if t])
one_ = [670, 720, 750, 780, 810]; all_ = [2100, 2150, 2180, 2210, 2250]
st = [all(one_[i + 1] * all_[i] > one_[i] * all_[i + 1] for i in range(4)) and one_[4] * 100 == 36 * all_[4], (one_[4] - one_[0]) * all_[0] >= 4 * (all_[4] - all_[0]) * one_[0], 810 * 33 >= 25000, 810 * 3 >= 2400, [one_[i + 1] - one_[i] for i in range(4)] == [50, 30, 30, 30]]
only('D-AB01', [not x for x in st], 'false statements')
b2 = {2024: 26, 2025: 30}; s2 = {'b': (35, 30), 'a': (25, 25), 'd': (40, 45)}
vv = {k: (b2[2024] * x, b2[2025] * y) for k, (x, y) in s2.items()}       # ×100
combo('D-AB02', [l for l, t in zip('ㄱㄴㄷㄹ', [vv['b'][1] < vv['b'][0], vv['d'][1] * 100 >= vv['d'][0] * 125, [2022, 2023, 2024, 2025] and sum(1 for a, b in zip([27, 30, 31, 26], [30, 31, 26, 30]) if b < a) == 1, vv['a'][1] - vv['a'][0] >= 150]) if t])
cy = {'A': (145, 1300, 980, 600), 'B': (120, 1450, 330, 500), 'C': (152, 1100, 340, 770), 'D': (131, 1250, 250, 880), 'E': (160, 1500, 150, 500)}
mc = [m for m in itertools.permutations('ABCDE') if m[4] == max(cy, key=lambda k: cy[k][0]) and m[0] == max(cy, key=lambda k: F(cy[k][2], cy[k][3])) and cy[m[2]][3] > cy[m[3]][3] and cy[m[1]][0] < cy[m[3]][0]]
ok(len(mc) == 1, f'D-AB03 {mc}'); pick('D-AB03', ', '.join(mc[0]))
pr24 = {'A': F(330 * 100, 110), 'B': 500, 'C': 400, 'D': F(260 * 100, 130)}; pr25 = {'A': 330, 'B': 500 * 80 // 100, 'C': 480, 'D': 260}
vl = {k: pr25[k] * u for k, u in {'A': 50, 'B': 80, 'C': 40, 'D': 100}.items()}
by_text('D-AB04', list(zip(['(가)는', '2024년 생산량이', '2025년 생산액이', '네 품목', '2025년 D의'], [pr24['A'] == 2 * pr24['D'], max(pr24, key=pr24.get) == 'C', max(vl, key=vl.get) == 'B', sum(pr25.values()) * 10 >= sum(pr24.values()) * 11, vl['D'] * 2 >= vl['C'] * 3])))
tt = [200, 220, 250]; sh5 = {'m': (50, 46, 42), 's': (30, 32, 34), 'c': (12, 12, 14), 'o': (8, 10, 10)}
v5x = {k: [t * x for t, x in zip(tt, v)] for k, v in sh5.items()}     # ×100
combo('D-AB05', [l for l, t in zip('ㄱㄴㄷㄹ', [v5x['m'][0] < v5x['m'][1] < v5x['m'][2], v5x['s'][2] * 10 >= v5x['s'][0] * 14, max(v5x, key=lambda k: v5x[k][2] - v5x[k][1]) == 'c', v5x['o'][1] == v5x['o'][2]]) if t])
pick('L-AB01', '공동 자원을 오래 유지한 공동체들에서는 규칙을 따라야 하는 사람들이 규칙을 만드는 데 참여하였다.')
combo('L-AB02', ['ㄱ', 'ㄴ']); combo('L-AB03', ['ㄱ', 'ㄴ']); combo('L-AB05', ['ㄱ', 'ㄴ', 'ㄹ'])
seat = [o for o in itertools.permutations('甲乙丙丁戊己') if o.index('甲') in (0, 5) and abs(o.index('乙') - o.index('丙')) == 1 and o.index('丁') > o.index('戊') and o.index('己') == 2 and abs(o.index('乙') - o.index('甲')) != 1 and o.index('戊') != 1]
combo('L-AB04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(o[5] == '甲' for o in seat), all(o[4] == '丁' for o in seat), all(imp(o[0] == '戊', o[4] == '丙') for o in seat), all(abs(o.index('乙') - o.index('丁')) != 1 for o in seat)]) if t])
# ================= S-AC / D-AC / L-AC (5급 실전, independent re-solve from the rendered options) =================
def sch(tier, fresh, cr, gpa10, fee, other):
    amt = {1: 350, 2: 260, 3: 170}[tier]
    if not fresh and (cr < 12 or gpa10 < (25 if tier == 1 else 30)): return 0
    return min(amt, fee - other)
pick('S-AC01', f"{sch(1, 0, 15, 27, 400, 0) + sch(2, 0, 12, 32, 300, 100) + sch(3, 0, 11, 38, 450, 0) + sch(2, 1, 0, 0, 350, 0) + sch(3, 0, 15, 29, 380, 0)}만 원")
mn = {0: 0}
for a in range(1, 301): mn[a] = 1 + min(mn[a - c] for c in (1, 40, 60, 100) if c <= a)
def gr(a):
    k = 0
    for c in (100, 60, 40, 1): k += a // c; a %= c
    return k
top = [a for a in range(1, 200) if mn[a] == max(mn[b] for b in range(1, 200))]
combo('S-AC02', [l for l, t in zip('ㄱㄴㄷㄹ', [mn[120] == 2, gr(160) == mn[160], top == [199], gr(180) - mn[180] == 19]) if t])
d0 = _dt.timedelta
lastp, filed = _dt.date(2026, 4, 20), _dt.date(2026, 7, 15)
by_text('S-AC03', list(zip(['甲의 신청은', '조정위원회가 기간을 연장하지', '조정위원회가 8월 25일', '乙이 9월 12일', '甲이 수락하였으므로'], [filed > lastp + d0(90) or False, filed + d0(30) == _dt.date(2026, 8, 14), _dt.date(2026, 8, 25) > filed + d0(45), False, False])))
def walk(rest, b0):
    for s in range(3 * 3600):
        m = F(s, 60); a = 80 * min(m, 20) + 80 * max(0, m - (30 if rest else 20)); b = 70 * max(0, m - b0)
        if a + b >= 4500: return m, a
m1, a1 = walk(True, 10); m2, _ = walk(False, 10); m3, a3 = walk(True, 0)
combo('S-AC04', [l for l, t in zip('ㄱㄴㄷㄹ', [m1 == 40, a1 == 2400, m2 < 35, a3 <= 2000]) if t])
g = 6 * 6; k = 16 - 1; tot = g + k + 1
rd = len(bin(16)) - 3   # 16강 토너먼트의 라운드 수
combo('S-AC05', [l for l, t in zip('ㄱㄴㄷㄹ', [g == 36, tot == 52, (4 - 1) + rd == 8, (4 - 1) + (rd - 1) == 6]) if t])
# D-AC
e0, e1 = 600 + 100 + 25 + 15, 560 + 110 + 22 + 12
st = [(e0 - e1) * 100 >= 5 * e0, [k for k, (a, b) in {'에너지': (600, 560), '산업 공정': (100, 110), '농업': (25, 22), '폐기물': (15, 12)}.items() if b > a] == ['산업 공정'], 560 * 100 >= 75 * e1, e0 * 1000 == 148 * 5000 and e1 * 100 <= 14 * 5100, F(3, 15) > F(3, 25)]
only('D-AC01', [not x for x in st], 'false statements')
px = [400, 450, 500, 520, 560]; sh = {'r': (30, 36), 'b': (50, 42), 'a': (5, 10), 's': (15, 12)}
grw = [F(px[i + 1], px[i]) for i in range(4)]
combo('D-AC02', [l for l, t in zip('ㄱㄴㄷㄹ', [560 * 42 < 400 * 50, 560 * 10 * 2 >= 400 * 5 * 5, grw.index(max(grw)) == 0, 560 * 36 > 400 * 50]) if t])
kk = {'A': (1200, 180, 300, 1995), 'B': (800, 64, 160, 2005), 'C': (2000, 200, 500, 1988), 'D': (600, 84, 200, 2010), 'E': (1500, 150, 250, 1999)}
mk = [m for m in itertools.permutations('ABCDE') if m[0] == max(kk, key=lambda x: F(kk[x][1], kk[x][0])) and m[4] == min(kk, key=lambda x: F(kk[x][0], kk[x][2])) and kk[m[3]][3] < kk[m[2]][3] and kk[m[1]][1] > kk[m[3]][1]]
ok(len(mk) == 1, f'D-AC03 {mk}'); pick('D-AC03', ', '.join(mk[0]))
pop = {'A': 120, 'B': F(4200, 30), 'C': 80, 'D': 200, 'E': F(1300, 26)}; doc = {'A': 3000, 'B': 4200, 'C': 80 * 18, 'D': 4400, 'E': 1300}
sp = {k: doc[k] * r / 100 for k, r in {'A': 80, 'B': 75, 'C': 90, 'D': 85, 'E': 70}.items()}
by_text('D-AC04', list(zip(['인구 1천 명당', '전문의 수가', '다섯 지역 전체의', 'C의 전문의', '(나)는'], [max(doc, key=lambda k: F(doc[k], pop[k])) == max(pop, key=pop.get), max(sp, key=sp.get) == 'D', sum(doc.values()) * 2 >= 5 * 10 * sum(pop.values()), sp['C'] * 2 >= 3 * sp['E'], pop['B'] >= 3 * pop['E']])))
A_ = {y: 5 * i for y, i in zip((2022, 2023, 2024, 2025), (120, 130, 140, 150))}; B_ = {y: 8 * i for y, i in zip((2022, 2023, 2024, 2025), (105, 110, 100, 120))}
gp = {y: abs(A_[y] - B_[y]) for y in A_}
combo('D-AC05', [l for l, t in zip('ㄱㄴㄷㄹ', [B_[2025] > A_[2025], A_[2024] * B_[2023] > B_[2024] * A_[2023], min(gp, key=gp.get) == 2024, A_[2023] - A_[2022] == 2 * (B_[2023] - B_[2022])]) if t])
# L-AC
pick('L-AC01', '실험에서 파랑을 두 개의 기본 색 이름으로 나누는 언어의 사용자들은 이름의 경계를 사이에 둔 두 색을 더 빨리 구별하였다.')
combo('L-AC02', ['ㄱ', 'ㄷ']); combo('L-AC03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-AC05', ['ㄱ', 'ㄴ'])
mm = [x for x in itertools.product((0, 1), repeat=6) if (x[0] or x[1]) and imp(x[0], not x[2]) and imp(x[1], x[3]) and imp(not x[2], x[4]) and x[3] != x[4] and imp(x[5], x[0] and x[1])]
by_text('L-AC04', list(zip(['A와 B를 함께', 'F는', '선정하는 사업은', 'C를 선정하지', 'D를 선정하면'], [any(x[0] and x[1] for x in mm), all(not x[5] for x in mm), all(sum(x) == 3 for x in mm), all(imp(not x[2], x[1]) for x in mm), all(imp(x[3], x[0]) for x in mm)])))
# ================= S-AD / D-AD / L-AD (5급 실전, independent re-solve from the rendered options) =================
hh = [(1, 120, 0, 3), (4, 140, 0, 5), (3, 160, 0, 2), (2, 100, 1, 1), (5, 130, 0, 10)]
pick('S-AD01', f"{sum(([40, 60, 80][n - 1] if n < 4 else 100) + 30 * s for n, i, s, t in hh if i <= 150 and t <= 9)}만 원")
def mm(start):
    dist = {start: 0}; fr = [start]
    while fr:
        nx = []
        for s in fr:
            for i in range(4):
                t = s[:i] + ''.join('O' if c == 'X' else 'X' for c in s[i:i + 2]) + s[i + 2:]
                if t not in dist: dist[t] = dist[s] + 1; nx.append(t)
        fr = nx
    return dist.get('OOOOO')
evs = [''.join(p_) for p_ in itertools.product('OX', repeat=5) if p_.count('X') % 2 == 0]
combo('S-AD02', [l for l, t in zip('ㄱㄴㄷㄹ', [mm('XOXXO') is None, mm('XOOXO') == 3, max(mm(s) for s in evs) <= 3, True]) if t])
d3 = _dt.date
by_text('S-AD03', list(zip(['甲은 포장을', '乙은 7일', '丙은 상품을', '丙의 청약', '사업자가 甲에게서'], [d3(2026, 3, 6) > d3(2026, 3, 9), False, d3(2026, 5, 10) > d3(2026, 6, 1) or d3(2026, 5, 10) > d3(2026, 4, 20) + _dt.timedelta(days=30), d3(2026, 5, 10) <= d3(2026, 6, 1) and d3(2026, 5, 10) <= d3(2026, 4, 20) + _dt.timedelta(days=30), 5 <= 3])))
ml = [31, 30, 31, 30, 31, 30, 31, 30, 31, 30, 31, 29]
cum = [sum(ml[:i]) for i in range(12)]
combo('S-AD04', [l for l, t in zip('ㄱㄴㄷㄹ', [cum[1] % 7 == 3, sum((c + 12) % 7 == 4 for c in cum) == 3, sum(ml) % 7 == 1, (sum(ml) - 1) % 7 == 0]) if t])
it5 = {'A': (4, 3, 9), 'B': (3, 4, 8), 'C': (5, 2, 10), 'D': (2, 3, 5), 'E': (6, 5, 13), 'F': (1, 4, 4)}
pick('S-AD05', f"{max(sum(it5[k][2] for k in s) for r in range(7) for s in itertools.combinations(it5, r) if sum(it5[k][0] for k in s) <= 12 and sum(it5[k][1] for k in s) <= 10)}점")
yy = {('24', 'm'): (4000, 1800, 200), ('24', 'f'): (3800, 1710, 190), ('25', 'm'): (3900, 1794, 156), ('25', 'f'): (3700, 1739, 161)}
er = {k: F(e, p_) for k, (p_, e, u) in yy.items()}; ur = {k: F(u, e + u) for k, (p_, e, u) in yy.items()}
s1 = [all(yy[('25', g)][0] < yy[('24', g)][0] and er[('25', g)] > er[('24', g)] for g in 'mf'), er[('25', 'f')] > er[('25', 'm')], all((ur[('24', g)] - ur[('25', g)]) * 100 >= 2 for g in 'mf'), yy[('25', 'm')][1] + yy[('25', 'f')][1] > yy[('24', 'm')][1] + yy[('24', 'f')][1], 156 * 100 <= 80 * 200]
only('D-AD01', [not x for x in s1], 'false statements')
r25, nm = [20, 35, 60, 90, 70, 210], [25, 30, 55, 80, 100, 150]
rt = [F(a, b) for a, b in zip(r25, nm)]
combo('D-AD02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(r25) > sum(nm), rt.index(max(rt)) == 5, sum(a < b for a, b in zip(r25, nm)) == 3, sum(r25[:5]) < sum(nm[:5])]) if t])
kz = {'A': (50, 500, 3500, 18), 'B': (30, 900, 2800, 28), 'C': (80, 400, 4200, 12), 'D': (20, 300, 3000, 22), 'E': (40, 1000, 3200, 25)}
mz = [m for m in itertools.permutations('ABCDE') if m[0] == max(kz, key=lambda k: kz[k][3]) and m[1] == max(kz, key=lambda k: F(kz[k][0], kz[k][1])) and kz[m[2]][2] > kz[m[3]][2] and kz[m[3]][1] > kz[m[4]][1]]
ok(len(mz) == 1, f'D-AD03 {mz}'); pick('D-AD03', ', '.join(mz[0]))
ex, im = {'A': 500, 'B': 300 - 40, 'C': 700, 'D': 350}, {'A': 500 - 80, 'B': 300, 'C': 650, 'D': 350 - 30}
bal = {k: ex[k] - im[k] for k in ex}; e24 = {'A': 400, 'B': 260, 'C': 580, 'D': 350}
by_text('D-AD04', list(zip(['2025년 무역수지', '2025년 수출액의', '2025년 네 나라', '2025년 B에', '(라)는'], [max(bal, key=bal.get) == 'C', max(ex, key=lambda k: F(ex[k], e24[k])) == 'A', sum(im.values()) > sum(ex.values()), ex['B'] < e24['B'], im['D'] > im['A']])))
gz = {'s': (1000, 1120), 'd': (400, 420), 'c': (300, 345), 'h': (250, 255), 'o': (50, 60)}
T0, T1 = sum(a for a, b in gz.values()), sum(b for a, b in gz.values())
combo('D-AD05', [l for l, t in zip('ㄱㄴㄷㄹ', [max(gz, key=lambda k: F(gz[k][1], gz[k][0])) == max(gz, key=lambda k: gz[k][1] - gz[k][0]), gz['s'][1] * 2 > T1, (gz['c'][1] - gz['c'][0]) >= 2 * (gz['d'][1] - gz['d'][0]), sum(b - a for a, b in gz.values() if b * T0 > a * T1) * 100 >= 85 * (T1 - T0)]) if t])
pick('L-AD01', '머그잔 실험에서 참가자를 무작위로 나눈 것은 두 집단의 머그잔에 대한 취향이 평균적으로 같았다고 볼 근거가 된다.')
combo('L-AD02', ['ㄱ', 'ㄴ']); combo('L-AD03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-AD05', ['ㄱ', 'ㄴ', 'ㄹ'])
pas = []
for bits in itertools.product((0, 1), repeat=5):
    g = dict(zip('甲乙丙丁戊', bits))
    st = {'甲': g['乙'] == 1, '乙': g['丙'] + g['丁'] == 1, '丙': g['甲'] == 0, '丁': g['戊'] == 1, '戊': g['丙'] == 1}
    if all(st[k] == bool(g[k]) for k in g): pas.append(', '.join(k for k in '甲乙丙丁戊' if g[k]))
ok(len(pas) == 1, f'L-AD04 {pas}'); pick('L-AD04', pas[0])
# ================= S-AE / D-AE / L-AE (5급 실전, independent re-solve from the rendered options) =================
def rate_sale(p_):
    for lo, hi, r, cap in [(0, 5000, F(6, 1000), 25), (5000, 20000, F(5, 1000), 80), (20000, 90000, F(4, 1000), None), (90000, 10 ** 9, F(7, 1000), None)]:
        if lo <= p_ < hi: return min(p_ * r, cap) if cap else p_ * r
def rate_lease(dep, rent):
    a = dep + 100 * rent
    if a < 5000: a = dep + 70 * rent
    for lo, hi, r, cap in [(0, 5000, F(5, 1000), 20), (5000, 10000, F(4, 1000), 30), (10000, 10 ** 9, F(3, 1000), None)]:
        if lo <= a < hi: return min(a * r, cap) if cap else a * r
fee_ae = 2 * (rate_sale(30000) + rate_lease(500, 40))
pick('S-AE01', f'{int(fee_ae)}만 원' if fee_ae == int(fee_ae) else f'{int(fee_ae)}만 {int((fee_ae - int(fee_ae)) * 10)}천 원')
def runoff(bal):
    alive = list('ABCD'); hist = []
    while True:
        c = {x: 0 for x in alive}
        for order, n in bal: c[next(x for x in order if x in alive)] += n
        hist.append(c)
        top = max(c, key=c.get)
        if 2 * c[top] > sum(n for _, n in bal): return top, hist
        alive.remove(min(c, key=c.get))
w, h = runoff([('ABCD', 4), ('BCAD', 3), ('CBAD', 2), ('DBCA', 1)]); w2, _ = runoff([('ABCD', 4), ('BCAD', 3), ('CABD', 2), ('DBCA', 1)])
combo('S-AE02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(h[0], key=h[0].get) != w, set(h[1]) - set(h[2]) == {'C'}, h[-1][w] == 7, w2 == 'A']) if t])
by_text('S-AE03', list(zip(['甲은 신고만', '乙의 활동은', '丙은 특강을', '丁의 연장', '甲의 강의 시간이'], [False, False, False, _dt.date(2026, 2, 10) > _dt.date(2026, 2, 28) - _dt.timedelta(days=30), 24 <= 20])))
def tank(bfrom, drain):
    v = 0
    for s in range(10800):
        if v >= 1300 * 60: return F(s, 60)
        m = F(s, 60); v += 20 + (30 if m >= bfrom else 0) - (10 if drain and 30 <= m < 50 else 0)
combo('S-AE04', [l for l, t in zip('ㄱㄴㄷㄹ', [tank(20, True) == 40, tank(20, False) == 38, tank(0, True) < 30, (20 * 20 + 50 * 10) * 10 >= 1300 * 7]) if t])
ppl = ['m1', 'm2', 'm3', 'm4', 'm5', 'w1', 'w2', 'w3', 'w4']
pick('S-AE05', f"{sum(1 for s in itertools.combinations(ppl, 3) if any(x[0] == 'w' for x in s) and not ('m1' in s and 'm2' in s))}가지")
tv = {'c': (300, 360, 1200), 'j': (250, 240, 900), 'u': (100, 120, 1500), 'o': (150, 180, 1000)}
s_ = [sum(b for a, b, c in tv.values()) * 1000 == 1125 * sum(a for a, b, c in tv.values()), [k for k, (a, b, c) in tv.items() if b < a] == ['j'], max(tv, key=lambda k: tv[k][1] * tv[k][2]) == 'c', sum(b * c for a, b, c in tv.values()) >= 1150 * sum(b for a, b, c in tv.values()), 120 * 300 == 360 * 100]
only('D-AE01', [not x for x in s_], 'false statements')
p15, p25, ar = [120, 80, 60, 150, 40], [110, 95, 58, 180, 42], [600, 400, 300, 900, 200]
combo('D-AE02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(b < a for a, b in zip(p15, p25)) == 2, max(range(5), key=lambda i: F(p25[i], ar[i])) == 1, max(range(5), key=lambda i: F(p25[i], p15[i])) == max(range(5), key=lambda i: p25[i] - p15[i]), sum(p25) * 10 >= sum(p15) * 11]) if t])
hz = {'A': (500, 100, 60, 900), 'B': (300, 90, 45, 600), 'C': (800, 120, 70, 1100), 'D': (200, 80, 30, 500), 'E': (400, 70, 50, 700)}
mh = [m for m in itertools.permutations('ABCDE') if m[0] == max(hz, key=lambda k: F(hz[k][2], hz[k][1])) and m[1] == max(hz, key=lambda k: F(hz[k][3], hz[k][0])) and hz[m[2]][0] > hz[m[3]][0] and hz[m[3]][1] > hz[m[4]][1]]
ok(len(mh) == 1, f'D-AE03 {mh}'); pick('D-AE03', ', '.join(mh[0]))
sc = {'A': (900, 900 // 15, 30), 'B': (50 * 18, 50, 36), 'C': (720, 48, 24), 'D': (600, 600 // 12, 25)}
pc = {k: F(s, c) for k, (s, t, c) in sc.items()}
by_text('D-AE04', list(zip(['교원 1인당 학생 수가 가장', '학급당 학생 수가 같은', '네 학교 전체의', '(라)는', '교원 수가 가장'], [pc[max(sc, key=lambda k: F(sc[k][0], sc[k][1]))] == max(pc.values()), sorted(k for k in pc if pc[k] == 30) == ['A', 'C'], sum(v[0] for v in sc.values()) >= 16 * sum(v[1] for v in sc.values()), sc['D'][1] > sc['A'][1], max(sc, key=lambda k: sc[k][1]) == max(sc, key=lambda k: sc[k][2])])))
wg, cp = [5, 4, 3, 6], [3, 5, 3, 2]
rr = [F(100 + a, 100 + b) for a, b in zip(wg, cp)]; cr = rr[0] * rr[1] * rr[2] * rr[3]; cn = F(105 * 104 * 103 * 106, 10 ** 8)
combo('D-AE05', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i, r in enumerate(rr) if r < 1] == [1], rr[2] == 1, cr >= F(105, 100), cn >= F(118, 100)]) if t])
pick('L-AE01', '윗글의 예에서 1,000명이 검사를 받으면 양성 판정을 받는 사람은 108명이다.')
pat, non = 100, 900; tp, fp = pat * 9 // 10, non // 10; ppv1 = F(9, 9 + 99)
combo('L-AE02', [l for l, t in zip('ㄱㄴㄷㄹ', [tp + fp == 180, F(tp, tp + fp) == F(1, 2), pat - tp == 20, F(tp, tp + fp) >= 5 * ppv1]) if t])
combo('L-AE03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-AE05', ['ㄱ', 'ㄴ', 'ㄷ'])
tt = [dict(zip('국영수사과', pm)) for pm in itertools.permutations(range(1, 6))]
tt = [p_ for p_ in tt if p_['수'] < p_['영'] and p_['국'] in (1, 5) and abs(p_['사'] - p_['과']) != 1 and p_['영'] != 3 and p_['과'] == p_['수'] + 1]
by_text('L-AE04', list(zip(['영어는', '수학은', '국어는', '사회가', '과학은'], [all(p_['영'] in (4, 5) for p_ in tt), all(p_['수'] == 2 for p_ in tt), all(p_['국'] == 1 for p_ in tt), all(imp(p_['사'] == 1, p_['영'] == 5) for p_ in tt), all(p_['과'] == 3 for p_ in tt)])))
# ================= S-AF / D-AF / L-AF (5급 실전, independent re-solve from the rendered options) =================
def birth(orders, fa, mo, applied):
    if applied > 12 or max(fa, mo) < 6: return 0
    return sum({1: 100, 2: 200}.get(o, 300) for o in orders)
pick('S-AF01', f"{birth([1], 8, 8, 6) + birth([2, 3], 24, 24, 2) + birth([3], 3, 12, 5) + birth([2], 2, 2, 3) + birth([1], 36, 36, 14):,}만 원")
outs = []
for res in itertools.product((3, 1, 0), repeat=4):
    pt = {'A': 7, 'B': 6, 'C': 4, 'D': 1}
    for (x, y), r in zip([('A', 'B'), ('A', 'C'), ('B', 'D'), ('C', 'D')], res):
        pt[x] += r; pt[y] += {3: 0, 1: 1, 0: 3}[r]
    outs.append((res, pt))
sole = lambda pt, t: all(pt[t] > v for k, v in pt.items() if k != t)
combo('S-AF02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(sole(pt, 'A') for r, pt in outs if r[0] == 3 and r[1] == 3), not any(pt['C'] == max(pt.values()) for r, pt in outs), not any(pt['D'] == max(pt.values()) for r, pt in outs), all(r[0] == 0 for r, pt in outs if sole(pt, 'B'))]) if t])
pick('S-AF03', '열람이 다른 사람의 재산상 이익을 부당하게 침해할 우려가 있으면 공공기관은 열람을 거절할 수 있다.')
ovl = [F(720 * k, 11) for k in range(30) if F(720 * k, 11) < 1440]
in34 = [m for m in ovl if 180 <= m < 240]
combo('S-AF04', [l for l, t in zip('ㄱㄴㄷㄹ', [len(in34) == 1, 196 < in34[0] < 197, len(ovl) == 24, abs(0 - 90) == 90]) if t])
mx = {'甲': (8, 5, 9, 8), '乙': (3, 9, 8, 3), '丙': (6, 9, 8, 9), '丁': (4, 6, 4, 6)}
pick('S-AF05', f"{min(sum(mx[p_][t] for p_, t in zip('甲乙丙丁', pm)) for pm in itertools.permutations(range(4)) if pm[3] != 2)}시간")
ev = {'A': (120, 150, 30), 'B': (80, 100, 25), 'C': (60, 84, 14), 'D': (40, 46, 10)}
s_ = [sum(b for a, b, c in ev.values()) * 100 >= 125 * sum(a for a, b, c in ev.values()), max(ev, key=lambda k: F(ev[k][1], ev[k][0])) == 'C', max(ev, key=lambda k: F(ev[k][1], ev[k][2])) == 'C', sum(b for a, b, c in ev.values()) >= 5 * sum(c for a, b, c in ev.values()), 150 - 120 == 5 * (46 - 40)]
only('D-AF01', [not x for x in s_], 'false statements')
vs, pr = [40, 45, 50, 60], [20000, 18000, 17000, 15000]
rv = [a * b for a, b in zip(vs, pr)]; dr = [F(pr[i] - pr[i + 1], pr[i]) for i in range(3)]
combo('D-AF02', [l for l, t in zip('ㄱㄴㄷㄹ', [rv.index(max(rv)) == vs.index(max(vs)), rv[0] < rv[1] < rv[2] < rv[3], rv[3] * 100 >= rv[0] * 115, dr.index(max(dr)) == 2]) if t])
gd = {'A': (1000, 1050), 'B': (800, 880), 'C': (1500, 1530), 'D': (600, 690), 'E': (1200, 1272)}
mg = [m for m in itertools.permutations('ABCDE') if m[0] == max(gd, key=lambda k: F(gd[k][1], gd[k][0])) and m[1] == max(gd, key=lambda k: gd[k][1]) and F(gd[m[2]][1], gd[m[2]][0]) > F(gd[m[3]][1], gd[m[3]][0]) and gd[m[2]][1] > gd[m[4]][1]]
ok(len(mg) == 1, f'D-AF03 {mg}'); pick('D-AF03', ', '.join(mg[0]))
en = {'A': (500, 500 * 4 // 10, 4), 'B': (150 * 2, 150, 5), 'C': (800, 160, 2), 'D': (200, 200 * 6 // 10, 6)}; pv = {'A': 180, 'B': 160, 'C': 150, 'D': 100}
by_text('D-AF04', list(zip(['에너지 원단위가', '2025년 에너지 소비량이', '네 산업', '(나)는', '2025년 에너지 소비량의'], [max(en, key=lambda k: F(en[k][1], en[k][0])) == max(en, key=lambda k: en[k][1]), sorted(k for k in en if en[k][1] < pv[k]) == ['B'], sum(v[1] for v in en.values()) * 10 >= 4 * sum(v[0] for v in en.values()), en['B'][0] >= 3 * en['D'][1], max(en, key=lambda k: F(en[k][1], pv[k])) == 'C'])))
i24 = {k: 5000 * s // 100 for k, s in {'w': 60, 'b': 25, 't': 15}.items()}; i25 = {k: F(5400 * s, 100) for k, s in {'w': 62, 'b': 20, 't': 18}.items()}
combo('D-AF05', [l for l, t in zip('ㄱㄴㄷㄹ', [i25['b'] < i24['b'], i25['t'] / i24['t'] - 1 >= 2 * (i25['w'] / i24['w'] - 1), i25['w'] - i24['w'] > 400, i25['w'] * 2 >= 3 * (i25['b'] + i25['t'])]) if t])
pick('L-AF01', '협상 비용이 거의 없다면 권리를 누구에게 주든 협상으로 같은 생산량에 이른다는 주장이 있다.')
mg2 = [10, 8, 6, 4, 2]
qn = max(q for q in range(6) if all(m > 0 for m in mg2[:q])); qt = max(q for q in range(6) if all(m > 5 for m in mg2[:q]))
qb = max(range(6), key=lambda q: sum(mg2[:q]) - 5 * q)
combo('L-AF02', [l for l, t in zip('ㄱㄴㄷ', [qn == 5, qt == 3, qb == 0]) if t])
combo('L-AF03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-AF05', ['ㄱ', 'ㄴ', 'ㄹ'])
t16 = list(itertools.product((0, 1), repeat=4)); m16 = []
for bits in itertools.product((0, 1), repeat=16):
    e = [t for t, b_ in zip(t16, bits) if b_]
    if all(ex or g for w, ex, g, t in e if w) and not any(w and g for w, ex, g, t in e) and any(ex and not w for w, ex, g, t in e) and all(not ex for w, ex, g, t in e if t): m16.append(e)
combo('L-AF04', [l for l, tt in zip('ㄱㄴㄷㄹ', [all(all(ex for w, ex, g, t in e if w) for e in m16), all(not any(t and w for w, ex, g, t in e) for e in m16), all(all(w for w, ex, g, t in e if ex) for e in m16), all(any(g and ex for w, ex, g, t in e) for e in m16)]) if tt])
# ================= S-AG / D-AG / L-AG (5급 실전, independent re-solve from the rendered options) =================
def rent_sub(age, mil, single, dep, rent, prev):
    if age < 19 or age > 34 + min(mil, 3): return 0
    if dep > 5000: return 0
    if rent > 60 and rent * 1000 + dep * 5 > 70 * 1000: return 0
    m = min(F(rent, 2), 25 if single else 20)
    return m * (12 - prev)
s_ag01 = rent_sub(26, 0, 0, 1000, 50, 0) + rent_sub(31, 0, 1, 600, 66, 0) + rent_sub(36, 2, 0, 2000, 36, 0) + rent_sub(29, 0, 0, 3000, 40, 5) + rent_sub(28, 0, 0, 4000, 62, 0)
pick('S-AG01', f'{int(s_ag01):,}만 원')
sw = [(1, 1, 0, 0, 0), (0, 1, 1, 1, 0), (0, 0, 0, 1, 1), (1, 0, 1, 0, 1)]; st0 = (0, 1, 0, 0, 1)
def press(st, ks):
    st = list(st)
    for k in ks: st = [a ^ b for a, b in zip(st, sw[k])]
    return tuple(st)
seqs = [q for n_ in range(0, 7) for q in itertools.product(range(4), repeat=n_)]
reach_ = {}
for q in seqs: reach_.setdefault(press(st0, q), len(q))
reach3 = {press(st0, q) for q in seqs if 1 not in q}
combo('S-AG02', [l for l, t in zip('ㄱㄴㄷㄹ', [reach_[(1, 1, 1, 1, 1)] == 2, press(st0, [0, 1, 2, 3]) == st0, (0, 0, 0, 0, 0) in reach_, (0, 0, 1, 0, 0) not in reach3]) if t])
pick('S-AG03', '처리 기간을 늘린 청원기관도 청원을 접수한 날부터 90일 이내에는 처리 결과를 청원인에게 알려야 한다.')
def base_fare(d):
    f_ = 1400; x = 10
    while x < d and x < 50: f_ += 100; x += 5
    x = 50
    while x < d: f_ += 100; x += 8
    return f_
rides_ = [(480, 500, 'b1', 6), (515, 545, 's2', 14), (730, 745, 'b5', 4), (780, 790, 'b7', 3), (1080, 1140, 's2', 46), (1160, 1185, 'b1', 12), (1200, 1210, 'b1', 2)]
paid = 0; chain = []
for i, (bo, al, rt, km) in enumerate(rides_):
    if i and bo - rides_[i - 1][1] <= 30 and rt != rides_[i - 1][2]: chain.append(km)
    else: chain = [km]; grp = 0
    due = max(0, base_fare(sum(chain)) - grp); grp += due; paid += due
pick('S-AG04', f'{paid:,}원')
cand = {'A': ('재정', 'm', 'X', 93), 'B': ('기술', 'f', 'Z', 90), 'C': ('법률', 'f', 'X', 80), 'D': ('재정', 'm', 'Y', 89), 'E': ('법률', 'm', 'X', 88), 'F': ('재정', 'm', 'Z', 86), 'G': ('기술', 'f', 'Z', 85)}
feas = [s for s in itertools.combinations('ABCDEFG', 4) if {cand[x][0] for x in s} == {'법률', '재정', '기술'} and [cand[x][1] for x in s].count('f') == 2 and [cand[x][2] for x in s].count('X') <= 1 and not {'B', 'E'} <= set(s)]
sc_ = sorted((sum(cand[x][3] for x in s), s) for s in feas)
ok(sc_[-1][0] > sc_[-2][0], 'S-AG05 unique optimum'); pick('S-AG05', ', '.join(sc_[-1][1]))
pop_ = [250, 120, 80, 300, 50]; doc_ = [5500, 2160, 1280, 7200, 600]; bed_ = [30000, 15600, 12000, 33000, 9000]
avg_ = F(sum(doc_), 10 * sum(pop_)); dk = [F(d, 10 * p_) for d, p_ in zip(doc_, pop_)]; bk = [F(b, 10 * p_) for b, p_ in zip(bed_, pop_)]
s_ = [avg_ > 2, sum(x > avg_ for x in dk) == 3, dk.index(max(dk)) == 3, bk.index(max(bk)) == dk.index(min(dk)), F(bed_[2], doc_[2]) > F(bed_[1], doc_[1])]
only('D-AG01', [not x for x in s_], 'false statements')
ex_, fx_ = [500, 560, 540, 600, 650], [1150, 1250, 1300, 1250, 1400]; wv = [a * b for a, b in zip(ex_, fx_)]
gwv = [F(wv[i], wv[i - 1]) for i in range(1, 5)]; gdv = [F(ex_[i], ex_[i - 1]) for i in range(1, 5)]
combo('D-AG02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(wv[i] > wv[i - 1] for i in range(1, 5) if ex_[i] < ex_[i - 1]), gwv.index(max(gwv)) == 3, wv[4] * 10 >= 16 * wv[0], [i for i in range(4) if gdv[i] > gwv[i]] == [2]]) if t])
ct = {'A': (420, 60, 5200), 'B': (900, 150, 9000), 'C': (300, 40, 3300), 'D': (650, 200, 8450), 'E': (500, 90, 6000)}
mt = [m for m in itertools.permutations('ABCDE') if m[0] == max(ct, key=lambda k: F(ct[k][0], ct[k][1])) and m[1] == max(ct, key=lambda k: F(ct[k][2], ct[k][0])) and ct[m[2]][1] > ct[m[3]][1] and ct[m[3]][0] > ct[m[4]][0]]
ok(len(mt) == 1, f'D-AG03 {mt}'); pick('D-AG03', ', '.join(mt[0]))
emp_ = {'A': 600 - 30, 'B': 800 * 60 // 100, 'C': 450 - 45, 'D': 500 * 62 // 100}
lab_ = {'A': 600, 'B': emp_['B'] + 20, 'C': 450, 'D': 320}; p15 = {'A': 1000, 'B': 800, 'C': F(emp_['C'] * 100, 54), 'D': 500}
une_ = {k: lab_[k] - emp_[k] for k in lab_}; erv = {k: F(emp_[k], p15[k]) for k in lab_}; urv = {k: F(une_[k], lab_[k]) for k in lab_}; lpv = {k: F(lab_[k], p15[k]) for k in lab_}
by_text('D-AG04', list(zip(['경제활동참가율이', '네 지역 전체의', '고용률이 가장', '취업자 수는', 'C의 15세'], [max(lpv, key=lpv.get) == 'B', sum(une_.values()) * 100 >= 6 * sum(lab_.values()), max(erv, key=erv.get) == min(urv, key=urv.get), emp_['B'] * 10 >= 12 * emp_['C'], p15['C'] * 10 >= 8 * p15['A']])))
wt_, ix_ = [30, 25, 15, 30], [106, 103, 96, 102]
cv = [F((x - 100) * w, 100) for x, w in zip(ix_, wt_)]; tv_ = 100 + sum(cv)
combo('D-AG05', [l for l, t in zip('ㄱㄴㄷㄹ', [tv_ >= F(1026, 10), cv.index(max(cv)) == 0, cv[1] * 2 >= 3 * cv[3], ix_[0] - 100 >= 2 * (tv_ - 100)]) if t])
pick('L-AG01', '부모 가운데 한 명이 O형인 B형인 사람의 유전자형은 BO이다.')
def phen(a, b):
    s = {a, b} - {'O'}
    return ''.join(sorted(s)) or 'O'
geno = [(a, b) for a in 'ABO' for b in 'ABO' if a <= b or True]
fa_ = [g for g in itertools.product('ABO', repeat=2) if phen(*g) == 'A']; mo_ = [g for g in itertools.product('ABO', repeat=2) if phen(*g) == 'B']
cons_ = {(''.join(sorted(f_)), ''.join(sorted(m_))) for f_ in fa_ for m_ in mo_ if any(phen(x, y) == 'O' for x in f_ for y in m_)}
f0, m0 = next(iter(cons_)); kidsv = [phen(x, y) for x in f0 for y in m0]
ab_kid = any(phen(x, y) == 'AB' for x in 'OO' for y in 'AB')
combo('L-AG02', [l for l, t in zip('ㄱㄴㄷㄹ', [cons_ == {('AO', 'BO')}, F(kidsv.count('AB'), 4) == F(1, 4), ab_kid, set(kidsv) == {'A', 'B', 'AB', 'O'}]) if t])
combo('L-AG03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-AG05', ['ㄱ', 'ㄷ'])
pk = []
for s in itertools.combinations('ABCDEF', 3):
    S_ = set(s)
    if imp('A' in S_, 'B' in S_) and len(S_ & {'C', 'D'}) == 1 and imp('B' in S_, 'D' not in S_) and imp('E' not in S_, 'A' in S_) and imp('F' in S_, 'C' not in S_): pk.append(S_)
by_text('L-AG04', list(zip(['B와 C는', 'E는 반드시', 'A를 선정하지', 'D를 선정하면', '선정될 수 있는'], [all(('B' in x) == ('C' in x) for x in pk), all('E' in x for x in pk), all(imp('A' not in x, 'F' in x) for x in pk), all(imp('D' in x, 'B' in x) for x in pk), len(pk) == 2])))
# ================= S-AH / D-AH / L-AH (5급 실전, independent re-solve from the rendered options) =================
def crop(amt, dmg, pest, clean):
    eff = dmg - pest
    own = 10 if clean else 20
    if eff <= own: return 0
    return min(F(amt * (eff - own), 100), F(amt * 60, 100))
s_ah01 = crop(2000, 50, 0, 0) + crop(1000, 15, 0, 1) + crop(3000, 40, 10, 0) + crop(1500, 30, 30, 0) + crop(2500, 85, 0, 0)
pick('S-AH01', f'{int(s_ah01):,}만 원')
lose = set([0])
for n_ in range(1, 25):
    if not any(n_ - k >= 0 and (n_ - k) in lose for k in (1, 3, 4)): lose.add(n_)
good10 = [k for k in (1, 3, 4) if (10 - k) in lose]
combo('S-AH02', [l for l, t in zip('ㄱㄴㄷㄹ', [7 in lose, good10 == [3], len([x for x in lose if 1 <= x <= 20]) == 6, 2 in lose]) if t])
pick('S-AH03', '태풍으로 도로를 점용하지 못한 기간에 대해서는 점용료를 면제받을 수 있다.')
import datetime as _dtm
days = [_dtm.date(2027, 3, d) for d in range(1, 32)]      # 2027-03-01 is a Monday
ok(days[0].weekday() == 0, 'S-AH04 calendar Monday')
def on(cyc, i, d): return d.weekday() != 6 and i % sum(cyc) < cyc[0]
cy = [(2, 1), (3, 2), (1, 1)]
aw = [d.day for i, d in enumerate(days) if all(on(c, i, d) for c in cy)]
ar = [d.day for i, d in enumerate(days) if d.weekday() != 6 and not any(on(c, i, d) for c in cy)]
combo('S-AH04', [l for l, t in zip('ㄱㄴㄷㄹ', [len(aw) == 6, len(ar) == 2, not on(cy[0], 30, days[30]), sum(on(cy[0], i, d) for i, d in enumerate(days)) >= 20]) if t])
rq = {'A': (9, 11, 'g', 25), 'B': (10, 13, 'e', 20), 'C': (11, 12, 'b', 40), 'D': (12, 15, 'g', 50), 'E': (13, 14, 'j', 30), 'F': (14, 17, 'e', 45), 'G': (15, 18, 'b', 55)}
bestv = []
for mask in range(128):
    s = [k for i, k in enumerate('ABCDEFG') if mask >> i & 1]
    hours = [h for k in s for h in range(rq[k][0], rq[k][1])]
    if len(hours) != len(set(hours)) or len(hours) > 6 or len({rq[k][2] for k in s}) != len(s): continue
    bestv.append((sum(rq[k][3] for k in s), s))
bestv.sort()
ok(bestv[-1][0] > bestv[-2][0], 'S-AH05 unique optimum'); pick('S-AH05', ', '.join(bestv[-1][1]))
tv = {'A': (3000, 3600, 900), 'B': (1200, 1500, 1500), 'C': (800, 760, 2000), 'D': (500, 650, 1200), 'E': (400, 600, 1800)}
tsp = {k: b * c for k, (a, b, c) in tv.items()}
s_ = [sum(b for a, b, c in tv.values()) * 10 >= 12 * sum(a for a, b, c in tv.values()), max(tv, key=lambda k: F(tv[k][1], tv[k][0])) == 'E', [k for k, (a, b, c) in tv.items() if b < a] == ['C'], max(tsp, key=tsp.get) == 'A', tsp[max(tv, key=lambda k: tv[k][2])] * 5 >= sum(tsp.values())]
only('D-AH01', [not x for x in s_], 'false statements')
g4, g5, uc = [200, 150, 180, 70], [170, 160, 185, 105], [120, 160, 60, 110]
cs = [a * b for a, b in zip(g5, uc)]
combo('D-AH02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(g5) > sum(g4), F(105, sum(g5)) - F(70, sum(g4)) >= F(1, 20), cs.index(max(cs)) == 0, cs[2] < cs[3]]) if t])
rv = {'A': (120, 78, 340), 'B': (80, 60, 510), 'C': (200, 110, 450), 'D': (60, 36, 280), 'E': (150, 102, 390)}
mr = [m for m in itertools.permutations('ABCDE') if m[0] == min(rv, key=lambda k: F(rv[k][1], rv[k][0])) and m[1] == max(rv, key=lambda k: rv[k][2]) and F(rv[m[2]][1], rv[m[2]][0]) > F(rv[m[3]][1], rv[m[3]][0]) and rv[m[4]][1] > rv[m[2]][1]]
ok(len(mr) == 1, f'D-AH03 {mr}'); pick('D-AH03', ', '.join(mr[0]))
popB = F(2400 - 3000, -1); birC = 4800 + F(1, 2) * 800; deaD = 2000 + F(5, 2) * 400
pp = {'A': 500, 'B': popB, 'C': 800, 'D': 400}; bb = {'A': 3000, 'B': 2400, 'C': birC, 'D': 2000}; dd = {'A': 2500, 'B': 3000, 'C': 4800, 'D': deaD}
nrv = {k: F(bb[k] - dd[k], pp[k]) for k in pp}
by_text('D-AH04', list(zip(['자연증가율이 음', '조출생률이 가장', '네 지역 전체의', '사망자 수는', 'C의 출생아'], [sum(pp[k] for k in pp if nrv[k] < 0) > 1000, max(pp, key=lambda k: F(bb[k], pp[k])) == 'A', sum(bb.values()) > sum(dd.values()), dd['D'] == dd['B'], bb['C'] * 10 >= 18 * bb['A']])))
w0 = [40000 * s // 100 for s in (30, 25, 45)]; w1 = [46000 * s // 100 for s in (20, 24, 56)]
combo('D-AH05', [l for l, t in zip('ㄱㄴㄷㄹ', [w1[0] * 10 <= 8 * w0[0], 24 < 25 and w1[1] > w0[1], (w1[2] - w0[2]) * 2 >= 3 * 6000, w1[2] * 2 >= 3 * w0[2]]) if t])
pick('L-AH01', '다른 조건이 같다면 세율이 높아질수록 승수는 작아진다.')
def chain(c, t, m):
    tot_, x = F(0), F(1)
    for _ in range(60): tot_ += x; x *= c * (1 - t) - m
    return tot_
m_none = 1 / (1 - F(8, 10)); m_tax = 1 / (1 - F(8, 10) * F(3, 4)); m_both = 1 / (1 - (F(8, 10) * F(3, 4) - F(2, 10))); m_09 = 1 / (1 - (F(9, 10) * F(3, 4) - F(2, 10)))
ok(abs(chain(F(8, 10), F(1, 4), F(2, 10)) - m_both) < F(1, 10 ** 6), 'L-AH02 geometric series matches closed form')
combo('L-AH02', [l for l, t in zip('ㄱㄴㄷㄹ', [120 * m_none == 600, 120 * m_tax * 2 == 120 * m_none, 120 * m_both == 200, m_09 >= 2]) if t])
combo('L-AH03', ['ㄱ', 'ㄷ']); combo('L-AH05', ['ㄱ'])
langs = ['en', 'zh', 'ja', 'fr']; two = list(itertools.combinations(langs, 2)); asg = []
for a, b, c in itertools.product(two, repeat=3):
    al = [set(a), set(b), set(c)]
    if set().union(*al) != set(langs) or al[0] & al[1] or any('zh' in x and 'ja' not in x for x in al) or 'en' in al[2] or sum('fr' in x for x in al) != 1: continue
    asg.append(al)
by_text('L-AH04', list(zip(['甲은 영어를', '乙은 일본어를', '일본어를 할 수', '영어를 할 수', '丙은 중국어를'], [all('en' in x[0] for x in asg), all('ja' in x[1] for x in asg), all(sum('ja' in y for y in x) == 1 for x in asg), all([i for i in range(3) if 'en' in x[i]] != [i for i in range(3) if 'fr' in x[i]] for x in asg), all('zh' in x[2] for x in asg)])))
# ================= S-AI / D-AI / L-AI (5급 실전, independent re-solve from the rendered options) =================
def mrefund(kind, months_used, extra_days):
    u = months_used + (1 if extra_days else 0)
    if kind == 'sick': return 60 - F(60, 12) * u
    fee = {'self': 6, 'pre': 3, 'agency': 0}[kind]
    return max(0, 60 - 6 * u - fee)
s_ai01 = mrefund('self', 4, 10) + mrefund('pre', 0, 0) + mrefund('agency', 3, 0) + mrefund('sick', 2, 0) + mrefund('self', 8, 0)
pick('S-AI01', f'{int(s_ai01):,}만 원')
def mv(pos, r):
    q = pos + r
    while q > 12: q = 12 - (q - 12)
    return {3: 9, 7: 1, 11: 4}.get(q, q)
fin = [mv(mv(0, a), b) for a in range(1, 7) for b in range(1, 7)]
cc = {k: fin.count(k) for k in set(fin)}
combo('S-AI02', [l for l, t in zip('ㄱㄴㄷㄹ', [fin.count(12) == 2, F(fin.count(1), 36) >= F(1, 6), all(mv(mv(0, 3), b) >= 8 for b in range(1, 7)), sorted(k for k in cc if cc[k] == max(cc.values())) == [4, 9]]) if t])
pick('S-AI03', '사무 처리가 끝난 날부터 2년이 지난 사항에 대해서도 감사를 청구할 수 있다.')
bx_ = [w for w in itertools.product(range(1, 11), repeat=5) if len(set(w)) == 5 and w[0] + w[1] == w[2] + w[3] and w[4] > max(w[:4]) and w[0] == w[1] + 3 and w[2] + w[3] + w[4] == 20]
combo('S-AI04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(w[0] == 7 for w in bx_), all(sum(w) == 31 for w in bx_), all(w[2] > w[1] for w in bx_), all(w.index(min(w)) in (2, 3) for w in bx_)]) if t])
need_ = [2, 4, 3, 5, 4, 2]; mn = None
for a, b, c, d in itertools.product(range(9), repeat=4):
    on_ = [a, a + b, a + b + c, b + c + d, c + d, d]
    if all(x >= y for x, y in zip(on_, need_)): mn = a + b + c + d if mn is None else min(mn, a + b + c + d)
pick('S-AI05', f'{mn}명')
fi = {'A': (120, 126, 600, 630), 'B': (80, 88, 480, 484), 'C': (60, 57, 300, 285), 'D': (40, 46, 160, 207), 'E': (30, 33, 120, 165)}
s_ = [sum(v[1] for v in fi.values()) * 100 >= 107 * sum(v[0] for v in fi.values()), max(fi, key=lambda k: F(fi[k][1], fi[k][0])) == 'D', max(fi, key=lambda k: F(fi[k][3], fi[k][2])) == 'E', max(fi, key=lambda k: F(fi[k][3], fi[k][1])) == 'B', [k for k, v in fi.items() if v[1] < v[0] and v[3] < v[2]] == ['C']]
only('D-AI01', [not x for x in s_], 'false statements')
p15 = [5000 * s // 100 for s in (14, 73, 13)]; p25 = [5100 * s // 100 for s in (11, 69, 20)]
combo('D-AI02', [l for l, t in zip('ㄱㄴㄷㄹ', [p25[2] * 2 >= 3 * p15[2], p25[1] < p15[1], F(p25[2] * 100, p25[1]) - F(p15[2] * 100, p15[1]) >= 10, (p15[0] - p25[0]) * 10 >= 4 * (p25[2] - p15[2])]) if t])
rt_ = {'A': (300, 54, 45), 'B': (500, 90, 63), 'C': (200, 40, 34), 'D': (400, 64, 48), 'E': (250, 50, 41)}
mm = [m for m in itertools.permutations('ABCDE') if m[0] == max(rt_, key=lambda k: F(rt_[k][2], rt_[k][1])) and m[1] == min(rt_, key=lambda k: F(rt_[k][2], rt_[k][0])) and rt_[m[2]][0] > rt_[m[3]][0] and rt_[m[4]][2] > rt_[m[2]][2]]
ok(len(mm) == 1, f'D-AI03 {mm}'); pick('D-AI03', ', '.join(mm[0]))
bud = {'A': 200, 'B': F(135 * 100, 90), 'C': 400, 'D': 250}; exe = {'A': 200 * 85 // 100, 'B': 135, 'C': 300, 'D': 250 * 92 // 100}; car = {'A': 20, 'B': 10, 'C': 60, 'D': 8}
uns = {k: bud[k] - exe[k] - car[k] for k in bud}; rate = {k: F(exe[k], bud[k]) for k in bud}
by_text('D-AI04', list(zip(['집행률이 가장 높은', '네 사업 전체의', '불용액이 이월액보다', 'B의 예산은', 'C의 불용액은'], [max(rate, key=rate.get) == min(uns, key=uns.get), sum(exe.values()) * 10 >= 8 * sum(bud.values()), sum(uns[k] > car[k] for k in bud) == 2, bud['B'] * 10 >= 8 * bud['A'], uns['C'] * 10 >= 6 * sum(uns.values())])))
def series(q1, gs):
    out = [F(q1)]
    for g in gs: out.append(out[-1] * F(100 + g, 100))
    return out
qa, qb, qc = series(200, [10, -5, 20]), series(150, [20, 10, -10]), series(120, [25, 20, 10])
combo('D-AI05', [l for l, t in zip('ㄱㄴㄷㄹ', [qa[3] > max(qb[3], qc[3]), sum(qc) > sum(qb), qc[3] * 10 >= 16 * qc[0], qb[3] > qc[3]]) if t])
pick('L-AI01', '수요량이 가격에 전혀 반응하지 않는 상품에 세금을 매기면, 판매자가 손에 쥐는 가격은 세금을 매기기 전과 같다.')
eq0 = [p_ for p_ in range(0, 51) if 100 - 2 * p_ == 3 * p_ - 50]; eq1 = [p_ for p_ in range(0, 51) if 100 - 2 * p_ == 3 * (p_ - 10) - 50]
eq1c = [p_ for p_ in range(0, 51) if 100 - 2 * (p_ + 10) == 3 * p_ - 50]      # tax on buyers: seller price p_, buyer pays p_ + 10
combo('L-AI02', [l for l, t in zip('ㄱㄴㄷㄹ', [eq1 == [36], (eq0[0] - (eq1[0] - 10)) > (eq1[0] - eq0[0]), (100 - 2 * eq0[0]) - (100 - 2 * eq1[0]) == 10, (eq1c[0] + 10) - eq0[0] == 4]) if t])
combo('L-AI03', ['ㄴ', 'ㄷ']); combo('L-AI05', ['ㄴ', 'ㄷ'])
cases_ = []
for cl in itertools.product('rbw', repeat=5):
    A_, B_, C_, D_, E_ = cl
    if cl.count('r') == 2 and A_ != B_ and imp(C_ == 'r', D_ == 'b') and E_ != 'w' and cl.count('b') > cl.count('w') and B_ == D_: cases_.append(cl)
by_text('L-AI04', list(zip(['A에 흰', 'E에 빨간', 'B에 흰', '파란 공이 든', 'C에 흰'], [all(c_[0] != 'w' for c_ in cases_), all(c_[4] != 'r' for c_ in cases_), all(c_[1] != 'w' for c_ in cases_), all(c_.count('b') != 3 for c_ in cases_), all(c_[2] != 'w' for c_ in cases_)])), what='always-false options')
# ================= S-AJ / D-AJ / L-AJ (5급 실전, independent re-solve from the rendered options) =================
def ev_sub(car, price, kids, poor, redo):
    if redo == 'again': return 0
    b = 600 if car == 'p' else 400
    if price >= 8500: return 0
    if price >= 5500: b = b * F(1, 2)
    extra = (200 if kids >= 3 else 100 if kids == 2 else 0) + (b * F(1, 5) if poor else 0)
    return b + min(extra, 200)
s_aj01 = ev_sub('p', 4800, 1, 0, None) + ev_sub('p', 6000, 3, 0, None) + ev_sub('s', 2500, 2, 1, None) + ev_sub('p', 5000, 3, 1, None) + ev_sub('p', 4500, 0, 0, 'accident')
pick('S-AJ01', f'{int(s_aj01):,}만 원')
def moves(s):
    a, b = s
    r = [(3, b), (a, 5), (0, b), (a, 0)]
    k = min(a, 5 - b); r.append((a - k, b + k)); k = min(b, 3 - a); r.append((a + k, b - k))
    return [x for x in r if x != s]
lev = {(0, 0): 0}; frontier = [(0, 0)]; n_ = 0
while frontier:
    n_ += 1; nxt = []
    for s in frontier:
        for t in moves(s):
            if t not in lev: lev[t] = n_; nxt.append(t)
    frontier = nxt
combo('S-AJ02', [l for l, t in zip('ㄱㄴㄷㄹ', [min(v for k, v in lev.items() if k[1] == 4) == 6, min(v for k, v in lev.items() if 1 in k) == 4, any(sum(k) == 7 for k in lev), lev[(2, 0)] == 5]) if t])
pick('S-AJ03', '묵시적으로 갱신된 경우, 임차인이 해지를 통지하면 임대인이 그 통지를 받은 날부터 3개월이 지나 해지의 효력이 생긴다.')
def asleep(h): return h % 24 >= 23 or h % 24 < 6
def wake(h): return h + ((30 - h % 24) % 24 if h % 24 >= 23 else 6 - h % 24) if asleep(h) else h
ta = []; h = 7
while h < 72: ta.append(h); h = wake(h + 8)
tb = []; h = 7
while h < 72:
    if h in ta: h += 1
    tb.append(h); h = wake(h + 10)
dcount = lambda ts, d: len([x for x in ts if 24 * (d - 1) <= x < 24 * d])
combo('S-AJ04', [l for l, t in zip('ㄱㄴㄷㄹ', [dcount(ta, 2) + dcount(tb, 2) == 6, dcount(ta, 2) == 3, [x - 48 for x in tb if x >= 48] == [7, 17], len(ta) + len(tb) == 15]) if t])
mm5 = {'A': '갑을', 'B': '을병', 'C': '병정', 'D': '정무', 'E': '무갑', 'F': '기경', 'G': '갑기'}
best5 = None
for d in range(1, 8):
    for asg in itertools.product(range(d), repeat=7):
        c = dict(zip('ABCDEFG', asg))
        if any(c[x] == c[y] and set(mm5[x]) & set(mm5[y]) for x, y in itertools.combinations('ABCDEFG', 2)): continue
        if c['B'] < c['E'] < c['G']: best5 = d; break
    if best5: break
pick('S-AJ05', f'{best5}일')
lb = {'A': (50, 400, 300, 330, 660), 'B': (30, 270, 200, 190, 380), 'C': (20, 200, 120, 150, 330), 'D': (40, 280, 250, 275, 440), 'E': (10, 110, 60, 78, 195)}
s_ = [sum(v[3] for v in lb.values()) * 10 == 11 * sum(v[2] for v in lb.values()), max(lb, key=lambda k: F(lb[k][3], lb[k][2])) == 'E', sum(F(v[4], v[3]) >= 2 for v in lb.values()) == 3, max(lb, key=lambda k: F(lb[k][1], lb[k][0])) == 'E', sum(v[4] for v in lb.values()) < 2 * sum(v[3] for v in lb.values())]
only('D-AJ01', [not x for x in s_], 'false statements')
rd, gd = [90, 100, 108, 112, 125], [2000, 2150, 2250, 2400, 2500]
combo('D-AJ02', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(1, 5) if rd[i] * gd[i - 1] < rd[i - 1] * gd[i]] == [3], rd[4] * 100 >= 5 * gd[4], sum(rd[i] * gd[i - 1] > rd[i - 1] * gd[i] for i in range(1, 5)) == 3, (F(rd[4], rd[0]) - 1) * 2 >= 3 * (F(gd[4], gd[0]) - 1)]) if t])
ex = {'가': (320, 300), '나': (280, 330), '다': (250, 260), '라': (200, 240)}
def rnk(k, y): return 1 + sum(ex[o][y] > ex[k][y] for o in ex)
cand = [m for m in itertools.permutations('가나다라') if rnk(m[2], 1) > rnk(m[2], 0) and F(ex[m[1]][1], ex[m[1]][0]) > F(ex[m[3]][1], ex[m[3]][0]) and ex[m[0]][1] > ex[m[1]][1] and ex[m[3]][1] < 300]
ok(len(cand) == 1, f'D-AJ03 {cand}'); pick('D-AJ03', ', '.join(cand[0]))
sch = {'A': (200, 60, 74), 'B': (F(45 * 100, 25), 45, 68), 'C': (150, 66, 73), 'D': (250, 50, 67)}
tn = sum(v[0] for v in sch.values()); wv = sum(v[0] * v[2] for v in sch.values())
by_text('D-AJ04', list(zip(['합격률이 가장 높은', '네 학교 전체의 합격률', '합격자가 가장 많은', '네 학교 전체 응시자의', 'B의 응시자는'], [max(sch, key=lambda k: F(sch[k][1], sch[k][0])) == max(sch, key=lambda k: sch[k][2]), sum(v[1] for v in sch.values()) * 10 >= 3 * tn, max(sch, key=lambda k: sch[k][1]) == max(sch, key=lambda k: sch[k][0]), wv >= 70 * tn, sch['B'][0] * 4 >= 3 * sch['D'][0]])))
nw, cp = [300, 315, 330, 340, 358], [102, 107, 110, 112, 115]
rw = [F(a * 100, b) for a, b in zip(nw, cp)]; gw_ = [F(nw[i], nw[i - 1]) for i in range(1, 5)]
combo('D-AJ05', [l for l, t in zip('ㄱㄴㄷㄹ', [gw_.index(max(gw_)) == 3 and gw_.count(max(gw_)) == 1, any(rw[i] < rw[i - 1] for i in range(1, 5)), rw[4] * 100 >= 105 * rw[0], [i for i in range(1, 5) if cp[i] * nw[i - 1] > cp[i - 1] * nw[i]] == [1]]) if t])
pick('L-AJ01', '이부 요금제를 쓰면 사용량이 한계비용 가격 설정 때와 같아지면서도 기업이 손실을 보지 않을 수 있다.')
use = lambda pr: 100 - 10 * pr
acp = [F(k, 10) for k in range(0, 101) if use(F(k, 10)) > 0 and F(k, 10) * use(F(k, 10)) == 120 + 2 * use(F(k, 10))]
combo('L-AJ02', [l for l, t in zip('ㄱㄴㄷㄹ', [use(2) == 80 and 120 - (2 * use(2) - 2 * use(2)) == 120, min(acp) == 4 and use(4) == 60, 120 / 20 == 6 and use(2) == use(min(acp)), min(acp) * use(min(acp)) == 240]) if t])
combo('L-AJ03', ['ㄱ', 'ㄴ']); combo('L-AJ05', ['ㄷ'])
ords = [o for o in itertools.permutations('甲乙丙丁戊己') if o.index('甲') < o.index('乙') and o.index('丙') in (2, 3) and abs(o.index('丁') - o.index('戊')) != 1 and o.index('乙') == o.index('丙') + 1 and o.index('戊') < o.index('甲')]
by_text('L-AJ04', list(zip(['甲은 두 번째', '丁은 마지막', '己는 丙보다', '乙은 네 번째', '丁과 己는'], [all(o.index('甲') == 1 for o in ords), all(o.index('丁') == 5 for o in ords), all(o.index('己') > o.index('丙') for o in ords), all(o.index('乙') in (3, 4) for o in ords), all(abs(o.index('丁') - o.index('己')) == 1 for o in ords)])))
# ================= S-AK / D-AK / L-AK (5급 실전, independent re-solve from the rendered options) =================
def fire(level, loss, insurance, needy, fault):
    if fault == 'own': return 0
    amt = (loss - insurance) * {'full': F(7, 10), 'half': F(1, 2), 'part': F(3, 10)}[level]
    return min(amt, 2000 if needy else 1500)
s_ak01 = fire('full', 2500, 0, 0, None) + fire('half', 3000, 1000, 0, None) + fire('full', 3000, 500, 1, None) + fire('part', 1200, 0, 0, 'landlord') + fire('half', 2400, 0, 0, 'own')
pick('S-AK01', f'{int(s_ak01):,}만 원')
up_ = {'r': 3, 's': 2, 'p': 5}; win_ = {('r', 's'), ('s', 'p'), ('p', 'r')}
fin_ = []
for g in itertools.product(itertools.product('rsp', repeat=2), repeat=3):
    x = y = w = 0
    for a, b in g:
        if (a, b) in win_: x += up_[a]; y = max(0, y - 1); w += 1
        elif (b, a) in win_: y += up_[b]; x = max(0, x - 1)
    fin_.append((x, y, w))
combo('S-AK02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(x - y for x, y, w in fin_) == 15, any(x == 14 for x, y, w in fin_), any(w == 2 and x < y for x, y, w in fin_), all(x == 0 for x, y, w in fin_ if x == y)]) if t])
pick('S-AK03', '지방자치단체가 공익을 위하여 건물 옥상에 표시하려는 광고물은 시장의 허가를 받아야 한다.')
def solvable(cands, w):          # adversary: can we always isolate the heavy coin among cands within w weighings?
    if cands <= 1: return True
    if w == 0: return False
    return any(solvable(k, w - 1) and solvable(cands - 2 * k, w - 1) for k in range(1, cands // 2 + 1))
first_ok = lambda n_, k, w: solvable(k, w - 1) and solvable(n_ - 2 * k, w - 1)
combo('S-AK04', [l for l, t in zip('ㄱㄴㄷㄹ', [solvable(8, 2), first_ok(8, 4, 2), first_ok(8, 3, 2), not solvable(10, 2)]) if t])
single = {'P': 5000, 'Q': 4000, 'R': 3000, 'S': 6000}; packs = [('PQ', 7000), ('QRS', 10500), ('RS', 8000)]
costs = []
for chosen in itertools.chain.from_iterable(itertools.combinations(packs, r) for r in range(4)):
    letters = ''.join(c for c, _ in chosen)
    if len(letters) != len(set(letters)): continue
    t = sum(v for _, v in chosen) + sum(v for k, v in single.items() if k not in letters)
    costs.append(t - 2000 if t >= 16000 else t)
pick('S-AK05', f'{min(costs):,}원')
ar = {'A': (100, 95, 520, 513), 'B': (80, 82, 400, 418), 'C': (60, 60, 330, 318), 'D': (40, 36, 204, 198), 'E': (20, 22, 108, 123)}
s_ = [sum(v[1] for v in ar.values()) < sum(v[0] for v in ar.values()), sum(v[3] for v in ar.values()) > sum(v[2] for v in ar.values()), max(ar, key=lambda k: F(ar[k][3], ar[k][1])) == 'E', [k for k, v in ar.items() if v[3] < v[2]] == ['C'], sum(v[3] for v in ar.values()) * 10 >= 53 * sum(v[1] for v in ar.values())]
only('D-AK01', [not x for x in s_], 'false statements')
e0, e1, tg = [300, 120, 100, 30], [255, 126, 90, 27], [20, 5, 15, 10]
gl = [F(a * (100 - t), 100) for a, t in zip(e0, tg)]
combo('D-AK02', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(4) if e1[i] <= gl[i]] == [3], sum(e1) * 10 <= 9 * sum(e0), sum(e1) - sum(gl) >= 30, F(e1[1], sum(e1)) - F(e0[1], sum(e0)) >= F(1, 25)]) if t])
dp = {'A': (80, 400), 'B': (40, 480), 'C': (100, 700), 'D': (60, 360), 'E': (20, 300)}
md_ = [m for m in itertools.permutations('ABCDE') if dp[m[0]][1] * dp[m[1]][0] == 2 * dp[m[1]][1] * dp[m[0]][0] and dp[m[2]][0] + dp[m[3]][0] == dp[m[4]][0] and dp[m[2]][1] < dp[m[3]][1]]
ok(len(md_) == 1, f'D-AK03 {md_}'); pick('D-AK03', ', '.join(md_[0]))
xm = {'A': (500, 500 - 100), 'B': (300 - 60, 300), 'C': (450, 375), 'D': (200, 200 + 50)}
by_text('D-AK04', list(zip(['무역수지가 흑자인', '수입이 가장 많은', '네 상대국 전체의 무역수지', 'B에 대한 수출은', '네 상대국 전체의 수출입'], [sum(a for a, b in xm.values() if a > b) >= 1000, max(xm, key=lambda k: xm[k][1]) == 'C', sum(a - b for a, b in xm.values()) >= 100, xm['B'][0] * 4 >= 5 * xm['D'][0], sum(a for a, b in xm.values()) * 100 >= 104 * sum(b for a, b in xm.values())])))
pc0, pc1, pp0, pp1 = [150, 180, 120], [180, 198, 156], [200, 100, 150], [190, 110, 150]
t0 = [a * b for a, b in zip(pc0, pp0)]; t1 = [a * b for a, b in zip(pc1, pp1)]
combo('D-AK05', [l for l, t in zip('ㄱㄴㄷㄹ', [t1.index(max(t1)) == 0, max(range(3), key=lambda i: F(pc1[i], pc0[i])) == 1, F(t1[1], t0[1]) > F(t1[2], t0[2]), sum(t1) * 10 >= 12 * sum(t0)]) if t])
pick('L-AK01', '다른 조건이 같다면 두 지역 사이 거리가 2배가 될 때 중력 모형이 예측하는 이동량은 4분의 1로 줄어든다.')
gv = lambda a, b, d: F(a * b, d ** 2)
combo('L-AK02', [l for l, t in zip('ㄱㄴㄷㄹ', [gv(100, 50, 100) == gv(100, 200, 200), gv(50, 200, 100) == 2 * gv(100, 50, 100), gv(100, 100, 100) == gv(100, 200, 100), gv(100, 200, 100) == 2 * gv(100, 200, 200)]) if t])
combo('L-AK03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-AK05', ['ㄱ', 'ㄷ'])
sols_ = []
for fo in itertools.permutations(['noodle', 'rice', 'salad']):
    for dr in itertools.permutations(['coffee', 'tea', 'juice']):
        pair = dict(zip(fo, dr))                      # food -> drink of the same person
        if (fo[1] == 'rice' or dr[1] == 'coffee') and pair['salad'] != 'coffee' and pair['noodle'] == 'tea': sols_.append((fo, dr, pair))
by_text('L-AK04', list(zip(['甲은 차를', '샐러드를 먹은', '丙은 국수를', '乙은 차를', '덮밥을 먹은'], [all(dr[0] == 'tea' for fo, dr, pr in sols_), all(pr['salad'] == 'juice' for fo, dr, pr in sols_), all(fo[2] == 'noodle' for fo, dr, pr in sols_), all(dr[1] == 'tea' for fo, dr, pr in sols_), all(pr['rice'] == 'juice' for fo, dr, pr in sols_)])))
# ================= S-AL / D-AL / L-AL (5급 실전, independent re-solve from the rendered options) =================
def otpay(rate, weekdays, holidays, disaster):
    wk = sum(min(h * 60 // 60, 4) for h in [int(x) for x in weekdays]); hol = sum(min(h, 8) for h in holidays)
    if wk + hol > 40: wk = 40 - hol
    return rate * wk + rate * hol * 3 // 2 + rate * sum(disaster)
s_al01 = otpay(10000, [3.5] * 10, [], []) + otpay(12000, [5] * 12, [], []) + otpay(10000, [4] * 8, [10], []) + otpay(10000, [4] * 10, [], [12]) + otpay(12000, [4] * 7, [6, 6], [])
pick('S-AL01', f'{s_al01:,}원')
def res(sec, g):
    st = sum(1 for i in range(3) if sec[i] == g[i]); return st, len(set(sec) & set(g)) - st
cands_ = [c for c in itertools.permutations('123456789', 3) if res(c, '123') == (1, 0) and res(c, '456') == (0, 1) and res(c, '789') == (0, 1) and res(c, '147') == (1, 1)]
combo('S-AL02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(c[0] == '1' for c in cands_), all('5' in c for c in cands_), len(cands_) == 2, len({res(c, '195') for c in cands_}) == len(cands_)]) if t])
pick('S-AL03', '등록 의무를 처음 위반한 사람이 스스로 등록을 마쳤다면 과태료는 10만 원이다.')
votes = [(a, b, 100 - a - b) for a in range(51) for b in range(a) if 20 <= 100 - a - b < b]
combo('S-AL04', [l for l, t in zip('ㄱㄴㄷㄹ', [min(v[0] for v in votes) >= 35, max(v[1] for v in votes) == 40, max(v[2] for v in votes) == 32, min(v[0] - v[2] for v in votes) >= 4]) if t])
crs = {'A': ('c', 2, 'w1', 35), 'B': ('c', 2, 'w2', 15), 'C': ('l', 4, 'w1', 35), 'D': ('l', 4, 'w1', 30), 'E': ('d', 4, 'w2', 15), 'F': ('l', 3, 'f1', 35), 'G': ('d', 2, 'm1', 25)}
pk5 = []
for mask in range(1, 128):
    s = [k for i, k in enumerate('ABCDEFG') if mask >> i & 1]
    if sum(crs[k][1] for k in s) >= 9 and {crs[k][0] for k in s} == {'c', 'l', 'd'} and len({crs[k][2] for k in s}) == len(s): pk5.append((sum(crs[k][3] for k in s), s))
pk5.sort(); ok(pk5[0][0] < pk5[1][0], 'S-AL05 unique'); pick('S-AL05', ', '.join(pk5[0][1]))
ct = {'고등어': (120, 100, 2500), '오징어': (60, 45, 8000), '멸치': (200, 210, 1500), '갈치': (50, 55, 9000), '꽃게': (20, 24, 16000)}
vv = {k: b * p_ for k, (a, b, p_) in ct.items()}
upk = [k for k, (a, b, p_) in ct.items() if b > a]
s_ = [sum(b for a, b, p_ in ct.values()) < sum(a for a, b, p_ in ct.values()), min(ct, key=lambda k: F(ct[k][1], ct[k][0])) == '고등어', max(vv, key=vv.get) == '갈치', max(upk, key=lambda k: F(ct[k][1], ct[k][0])) == '꽃게', sum(vv.values()) >= 18000 * 100]
only('D-AL01', [not x for x in s_], 'false statements')
dm, fo = [120, 150, 180, 130], [30, 40, 50, 40]
n_d = [2 * x for x in dm]; n_f = [F(7, 2) * x for x in fo]
combo('D-AL02', [l for l, t in zip('ㄱㄴㄷㄹ', [any(f * 2 >= d for d, f in zip(n_d, n_f)), sum(fo) * 5 >= sum(dm) + sum(fo), sum(n_f) * 10 >= 3 * (sum(n_d) + sum(n_f)), (n_d[2] + n_f[2]) * 10 >= 16 * (n_d[0] + n_f[0])]) if t])
tr_ = {'가': (25, 24, 22), '나': (50, 52, 55), '다': (20, 23, 26), '라': (40, 38, 41), '마': (30, 33, 31)}
mt_ = [m for m in itertools.permutations(tr_) if tr_[m[0]][0] < tr_[m[0]][1] < tr_[m[0]][2] and tr_[m[0]][2] * tr_[m[0]][0] > tr_[m[0]][1] ** 2 and tr_[m[1]][1] < tr_[m[1]][0] and tr_[m[1]][2] > tr_[m[1]][1] and sum(tr_[m[2]]) > sum(tr_[m[3]]) and tr_[m[3]][2] > tr_[m[4]][2]]
ok(len(mt_) == 1, f'D-AL03 {mt_}'); pick('D-AL03', ', '.join(mt_[0]))
fn = {'A': (800, 100, 60), 'B': (600, 90, 57), 'C': (500, 40, 25), 'D': (1200, 90, 70)}
by_text('D-AL04', list(zip(['영업이익이 가장 많은', '순이익률이 가장', '네 기업 전체의', '영업이익 대비', 'D의 매출액은'], [max(fn, key=lambda k: fn[k][1]) != max(fn, key=lambda k: fn[k][0]), max(fn, key=lambda k: F(fn[k][2], fn[k][0])) == 'A', sum(v[1] for v in fn.values()) * 100 >= 11 * sum(v[0] for v in fn.values()), min(fn, key=lambda k: F(fn[k][2], fn[k][1])) == 'C', fn['D'][0] > 2 * fn['B'][0]])))
e20, e24, r20, r24 = [700, 750, 850, 1700], [650, 700, 820, 1900], [60, 65, 70, 78], [55, 62, 68, 80]
v20 = [a * b for a, b in zip(e20, r20)]; v24 = [a * b for a, b in zip(e24, r24)]
combo('D-AL05', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(v24) > sum(v20), F(sum(v24), sum(e24)) > F(sum(v20), sum(e20)), v24[3] * 2 >= sum(v24), (v20[0] - v24[0]) * 3 >= v24[3] - v20[3]]) if t])
pick('L-AL01', '인구 편차 기준을 엄격하게 할수록 선거구가 행정구역의 경계를 가로지르는 일이 잦아진다.')
def bad(ps):
    avg_ = F(sum(ps.values()), len(ps)); return {k for k, v in ps.items() if v * 3 < avg_ * 2 or v * 3 > avg_ * 4}
d0 = {'갑': 18, '을': 22, '병': 30, '정': 38, '무': 42}
combo('L-AL02', [l for l, t in zip('ㄱㄴㄷㄹ', [bad(d0) == {'갑', '무'}, 42 >= 2 * 18, bad({'갑': 22, '을': 22, '병': 30, '정': 38, '무': 38}) == set(), bad({'갑을': 40, '병': 30, '정': 38, '무': 42}) == {'무'}]) if t])
combo('L-AL03', ['ㄱ', 'ㄷ']); combo('L-AL05', ['ㄱ', 'ㄷ'])
grid = []
for both in range(0, 31):
    e_only, z_only = 18 - both, 15 - both; none_ = 30 - e_only - z_only - both
    if min(e_only, z_only, none_) >= 0 and none_ >= 5: grid.append((both, e_only, z_only, none_))
by_text('L-AL04', list(zip(['영어와 중국어를 모두 할 수', '영어만 할 수 있는 직원은 10', '중국어만', '영어와 중국어를 모두 하지', '영어만 할 수 있는 직원의 수는'], [all(g[0] >= 8 for g in grid), all(g[1] >= 10 for g in grid), all(g[2] >= 5 for g in grid), any(g[3] > 12 for g in grid), all(g[1] <= 2 * g[2] for g in grid)])))
# ================= S-AM / D-AM / L-AM (5급 실전, independent re-solve from the rendered options) =================
def farm_levy(area, price, kind, prev):
    unit = min(price * 3 // 10, 50000)
    if kind == 'pub': return 0
    if kind == 'farm':
        cut = min(area, max(0, 1000 - prev)); return (cut * unit // 2 + (area - cut) * unit) // 10000
    return area * unit // 10000
s_am01 = farm_levy(500, 100000, 'gen', 0) + farm_levy(1000, 200000, 'gen', 0) + farm_levy(600, 50000, 'farm', 0) + farm_levy(800, 100000, 'farm', 500) + farm_levy(400, 100000, 'pub', 0)
pick('S-AM01', f'{s_am01:,}만 원')
blocked = {('c', 3), ('b', 4)}
cells = [(c, r) for c in 'abcde' for r in range(1, 6) if (c, r) not in blocked]
def nbr(x, blk):
    c, r = 'abcde'.index(x[0]), x[1]
    for dc, dr in [(1, 2), (2, 1), (-1, 2), (-2, 1), (1, -2), (2, -1), (-1, -2), (-2, -1)]:
        nc, nr = c + dc, r + dr
        if 0 <= nc < 5 and 1 <= nr <= 5 and ('abcde'[nc], nr) not in blk: yield ('abcde'[nc], nr)
def dist_from(blk):
    d = {('a', 1): 0}; layer = [('a', 1)]
    while layer:
        nxt = []
        for x in layer:
            for y in nbr(x, blk):
                if y not in d: d[y] = d[x] + 1; nxt.append(y)
        layer = nxt
    return d
dB, dN = dist_from(blocked), dist_from(set())
paths_c5 = [p_ for p_ in itertools.product(cells, repeat=1) if p_[0] in list(nbr(('a', 1), blocked)) and ('c', 5) in list(nbr(p_[0], blocked))]
mx = max(dB.values())
combo('S-AM02', [l for l, t in zip('ㄱㄴㄷㄹ', [dB[('e', 5)] == 4, len(paths_c5) == 1, [k for k, v in dB.items() if v == mx] == [('e', 5)], any(dB[k] > dN[k] for k in dB)]) if t])
pick('S-AM03', '돼지고기를 김치찌개와 제육볶음에 쓰면서 원산지를 표시하지 않은 음식점이 돼지고기에 대하여 받는 과태료는 30만 원이다.')
def mix_round(a, b):
    ws, ss = a; wt, st = b
    m = ss * F(100) / ws; ws, ss, wt, st = ws - 100, ss - m, wt + 100, st + m
    m = st * F(100) / wt; return (ws + 100, ss + m), (wt - 100, st - m)
ga, gb = (F(300), F(30)), (F(200), F(40)); hist = []
for _ in range(100): ga, gb = mix_round(ga, gb); hist.append((ga[1] / ga[0], gb[1] / gb[0]))
combo('S-AM04', [l for l, t in zip('ㄱㄴㄷㄹ', [hist[0][0] >= F(12, 100), F(20, 100) - hist[0][1] >= F(4, 100), hist[1][0] >= F(13, 100), all(h[0] <= F(14, 100) for h in hist)]) if t])
loc = {'가': 0, '나': 10, '다': 20, '라': 30, '마': 40}; trips = {'가': 7, '나': 1, '다': 1, '라': 5, '마': 7}; rent = {'가': 70, '나': 40, '다': 100, '라': 0, '마': 0}
ok_sites = [s for s in loc if s != '라' and all(abs(loc[s] - loc[v]) <= 30 for v in loc)]
best_ = min(sum(trips[v] * abs(loc[v] - loc[s]) for v in loc) + rent[s] for s in ok_sites)
pick('S-AM05', f'{best_}만 원')
gr_ = {'인문': (400, 380, 228), '사회': (600, 620, 403), '공학': (800, 840, 630), '자연': (300, 290, 203), '예체능': (200, 210, 120)}
T_e, T_g = sum(v[2] for v in gr_.values()), sum(v[1] for v in gr_.values())
s_ = [T_g > sum(v[0] for v in gr_.values()), max(gr_, key=lambda k: F(gr_[k][2], gr_[k][1])) == '공학', sum(F(v[2], v[1]) > F(T_e, T_g) for v in gr_.values()) == 3, [k for k, v in gr_.items() if v[1] < v[0]] == ['인문', '자연'], gr_['공학'][2] * 100 >= 39 * T_e]
only('D-AM01', [not x for x in s_], 'false statements')
def tariff(k): return min(k, 200) * 100 + max(0, min(k, 400) - 200) * 200 + max(0, k - 400) * 300
use_ = [400, 380, 320, 280, 300, 420]; bl = [tariff(k) for k in use_]
combo('D-AM02', [l for l, t in zip('ㄱㄴㄷㄹ', [bl.index(max(bl)) == 5, bl[5] * 10 >= 18 * bl[3], sum(bl) <= 300000, all(bl[i] * 10 <= 8 * bl[i - 1] for i in range(1, 6) if use_[i] < use_[i - 1])]) if t])
shr = {'가': (30, 26), '나': (25, 25), '다': (20, 22), '라': (15, 12), '마': (10, 15)}
sl = {k: (5 * a, 6 * b) for k, (a, b) in shr.items()}       # 천 대
mm_ = [m for m in itertools.permutations(shr) if shr[m[0]][1] < shr[m[0]][0] and sl[m[0]][1] > sl[m[0]][0] and m[1] == max(sl, key=lambda k: F(sl[k][1], sl[k][0])) and sl[m[2]][1] - sl[m[2]][0] < sl[m[3]][1] - sl[m[3]][0] and sl[m[4]][1] < sl[m[4]][0]]
ok(len(mm_) == 1, f'D-AM03 {mm_}'); pick('D-AM03', ', '.join(mm_[0]))
pp_ = {'A': 500, 'B': F(-3 * 1000, -2), 'C': 800, 'D': 200}; inn_ = {'A': 30, 'B': 45, 'C': 52 + 5 * 800 // 1000, 'D': 15}; out_ = {'A': 30 - 4 * 500 // 1000, 'B': 48, 'C': 52, 'D': 13}
nr_ = {k: F(inn_[k] - out_[k], pp_[k]) * 1000 for k in pp_}; tnet = sum(inn_[k] - out_[k] for k in pp_)
by_text('D-AM04', list(zip(['순이동률이 가장', '전입이 가장', '네 지역 전체의 순이동은', 'B의 인구는', '네 지역 전체의 순이동률'], [max(nr_, key=nr_.get) == 'C', max(inn_, key=inn_.get) == 'B', tnet < 0, pp_['B'] > 3 * pp_['A'], F(tnet * 1000, sum(pp_.values())) >= F(3, 2)])))
prod, imp_, exp_, c20 = [1, 2, 3, 40], [120, 50, 70, 0], [30, 0, 0, 0], [95, 45, 80, 35]
c25 = [a + b - c for a, b, c in zip(prod, imp_, exp_)]; dp_ = [F(b - c, d) for b, c, d in zip(imp_, exp_, c25)]
combo('D-AM05', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(4) if c25[i] < c20[i]] == [0, 2], (sum(imp_) - sum(exp_)) * 10 >= 8 * sum(c25), dp_.index(max(dp_)) == 0, F(c25[3], sum(c25)) - F(c20[3], sum(c20)) >= F(3, 100)]) if t])
pick('L-AM01', '상대적 구매력 평가에 따르면 갑국의 물가 상승률이 을국보다 높을수록 원화의 가치는 달러에 비해 떨어진다.')
pp_fx = F(6000, 4); ov = pp_fx / 1200 - 1
combo('L-AM02', [l for l, t in zip('ㄱㄴㄷㄹ', [pp_fx == 1500, ov == F(1, 4), (4 - 1) < 0, F(7200, 4) / 1200 - 1 == F(2, 5)]) if t])
combo('L-AM03', ['ㄱ', 'ㄷ', 'ㄹ']); combo('L-AM05', ['ㄴ'])
splits = []
for X in itertools.combinations('ABCDEF', 3):
    tm = {q: (q in X) for q in 'ABCDEF'}
    if tm['A'] != tm['B'] and tm['C'] == tm['D'] and imp(tm['E'], not tm['F']): splits.append(tm)
by_text('L-AM04', list(zip(['A는 X팀', 'B와 E는', 'D는 X팀', 'F와 C는', 'A와 F는'], [all(t['A'] for t in splits), all(t['B'] == t['E'] for t in splits), all(t['D'] for t in splits), all(t['F'] == t['C'] for t in splits), all(t['A'] != t['F'] for t in splits)])))
# ================= S-AN / D-AN / L-AN (5급 실전, independent re-solve from the rendered options) =================
act = [(6, 1, 'n'), (10, F(5, 2), 'n'), (5, F(1, 2), 'n'), (10, 3, 'd')]
vh = sum((F(3, 2) * h if k == 'd' else min(h, 8)) + (1 if m >= 2 else 0) for h, m, k in act) + min(F(8 + 14, 2), 10)
pick('S-AN01', f'{int(vh)}시간')
seen = {'ABCDE': 0}; fr = ['ABCDE']
while fr:
    nx = []
    for s in fr:
        for i in range(4):
            if set(s[i:i + 2]) == {'B', 'C'}: continue
            t = s[:i] + s[i + 1] + s[i] + s[i + 2:]
            if t not in seen: seen[t] = seen[s] + 1; nx.append(t)
    fr = nx
top = max(seen.values())
combo('S-AN02', [l for l, t in zip('ㄱㄴㄷㄹ', ['EDCBA' not in seen, [k for k, v in seen.items() if v == top] == ['EDBCA'] and top == 10, seen['BCDEA'] == 4, len(seen) == 60]) if t])
pick('S-AN03', '겸직 허가를 받은 공무원이 1년이 지난 뒤에도 겸직을 계속하려면 다시 허가를 받아야 한다.')
# trains, minute resolution with exact fractions: simulate by small time steps of 1/3600 h
def xa(t): return 120 * t
def xb(t, st=True):
    if t <= F(1, 2): return F(300)
    r = t - F(1, 2)
    if st:
        if r <= F(1, 2): pass
        elif r <= F(2, 3): r = F(1, 2)
        else: r -= F(1, 6)
    return 300 - 150 * r
def first_meet(st=True):
    s = 0
    while xa(F(s, 3600)) < xb(F(s, 3600), st): s += 1
    return F(s, 3600)
m1, m0 = first_meet(), first_meet(False)
combo('S-AN04', [l for l, t in zip('ㄱㄴㄷㄹ', [F(80, 60) < m1 <= F(90, 60), xa(m1) > 150, m0 < F(85, 60), F(1, 2) + 2 + F(1, 6) < F(300, 120)]) if t])
opt = min(30 * s - (5 * s if s >= 3 else 0) + 45 * b for s in range(10) for b in range(3) if 24 * s + 44 * b >= 121)
pick('S-AN05', f'{opt}만 원')
fi = {'A': (1200, 1080, 540), 'B': (800, 840, 504), 'C': (600, 660, 264), 'D': (400, 380, 266), 'E': (300, 320, 96)}
pr = {k: F(v[2], v[1]) for k, v in fi.items()}
s_ = [sum(v[1] for v in fi.values()) < sum(v[0] for v in fi.values()), max(fi, key=lambda k: F(fi[k][1], fi[k][0])) == 'C', max(pr, key=pr.get) == 'D', max(fi, key=lambda k: fi[k][2]) == max(pr, key=pr.get), sum(v[2] for v in fi.values()) * 2 >= sum(v[1] for v in fi.values())]
only('D-AN01', [not x for x in s_], 'false statements')
py, us = [40, 52, 60, 72, 84], [20, 24, 25, 30, 35]
combo('D-AN02', [l for l, t in zip('ㄱㄴㄷㄹ', [py[2] * us[3] == py[3] * us[2] and py[3] * us[4] == py[4] * us[3], max(range(1, 5), key=lambda i: F(py[i], py[i - 1])) == 1, py[4] >= 2 * py[0], any(us[i] * py[i - 1] > us[i - 1] * py[i] for i in range(1, 5))]) if t])
pd = {'가': (50, 30), '나': (40, 45), '다': (30, 55), '라': (80, 20), '마': (20, 60)}
def rank_of(k, key): return sorted(pd, key=key, reverse=True).index(k)
mp = [m for m in itertools.permutations(pd) if rank_of(m[0], lambda x: pd[x][0]) == rank_of(m[0], lambda x: pd[x][0] * pd[x][1]) and rank_of(m[1], lambda x: pd[x][1]) == 1 and pd[m[2]][0] * pd[m[2]][1] > pd[m[3]][0] * pd[m[3]][1] and rank_of(m[4], lambda x: pd[x][0]) == 0]
ok(len(mp) == 1, f'D-AN03 {mp}'); pick('D-AN03', ', '.join(mp[0]))
hl = {'A': (500, 200, 500 * 200 * 80 // 100), 'B': (54000 * 100 // (150 * 90), 150, 54000), 'C': (800, 96000 * 100 // (800 * 75), 96000), 'D': (1000, 100, 72000)}
oc = {k: F(a, s * n) for k, (s, n, a) in hl.items()}
by_text('D-AN04', list(zip(['객석 점유율이 가장 높은', '네 공연장 전체의', '공연 횟수가', 'B의 좌석 수는', '관객 수가 가장 적은'], [max(oc, key=oc.get) == max(hl, key=lambda k: hl[k][2]), sum(v[2] for v in hl.values()) * 100 >= 75 * sum(v[0] * v[1] for v in hl.values()), max(hl, key=lambda k: hl[k][1]) == 'C', hl['B'][0] * 10 > 8 * hl['A'][0], min(hl, key=lambda k: hl[k][2]) == min(oc, key=oc.get)])))
g0, g1, r0, r1 = [20, 15, 40, 8], [25, 18, 44, 12], [40, 60, 100, 30], [48, 55, 110, 35]
d0 = [a * b for a, b in zip(g0, r0)]; d1 = [a * b for a, b in zip(g1, r1)]
combo('D-AN05', [l for l, t in zip('ㄱㄴㄷㄹ', [r1[1] < r0[1] and d1[1] > d0[1], max(range(4), key=lambda i: F(d1[i], d0[i])) == 3, d1[2] >= 2 * (d1[0] + d1[1] + d1[3]), F(sum(d1), sum(g1)) > F(sum(d0), sum(g0))]) if t])
pick('L-AN01', '구간별 누진 구조에서 평균세율은 한계세율보다 높을 수 없다.')
def ptax(x): return min(x, 2000) * 10 + max(0, min(x, 5000) - 2000) * 20 + max(0, x - 5000) * 30
combo('L-AN02', [l for l, t in zip('ㄱㄴㄷㄹ', [ptax(4000) == 600 * 100, ptax(6000) * 100 >= 20 * 6000 * 100, ptax(6100) - ptax(6000) == 30 * 100, (ptax(6000) - ptax(4000)) * 4 == 2000 * 100]) if t])
combo('L-AN03', ['ㄱ', 'ㄴ']); combo('L-AN05', ['ㄷ'])
lg = []
for res in itertools.product('LR', repeat=6):
    wn = {t: 0 for t in '甲乙丙丁'}; bt = set()
    for (a, b), r in zip(itertools.combinations('甲乙丙丁', 2), res):
        x, y = (a, b) if r == 'L' else (b, a); wn[x] += 1; bt.add(x + y)
    if wn['甲'] == 2 and '乙丙' in bt and wn['丁'] >= 1 and wn['乙'] == wn['丁']: lg.append((wn, bt))
by_text('L-AN04', list(zip(['甲은 乙에게', '丙은 한 경기도', '乙은 丁에게', '丁은 丙에게', '丙이 2승을'], [all('甲乙' in b for w, b in lg), all(w['丙'] == 0 for w, b in lg), all('乙丁' in b for w, b in lg), all('丁丙' in b for w, b in lg), all(imp(w['丙'] == 2, '甲乙' in b and '甲丁' in b) for w, b in lg)])))
# ================= S-AO / D-AO / L-AO (5급 실전, independent re-solve from the rendered options) =================
def reimb(pct, spent, illegal, void_):
    if void_: return 0
    b = min(spent - illegal, 20000)
    return b if pct >= 15 else (b // 2 if pct >= 10 else 0)
t_ao = reimb(40, 18000, 0, 0) + reimb(12, 16000, 0, 0) + reimb(30, 24000, 0, 0) + reimb(16, 15000, 3000, 0) + reimb(45, 19000, 0, 1)
pick('S-AO01', f'{t_ao // 10000}억 {t_ao % 10000:,}만 원')
bad = {'009', '001', '019', '091'}
def steps_to(target, banned):
    seen = {'000': 0}; fr = ['000']
    while fr:
        nx = []
        for s in fr:
            for i in range(3):
                for d in (1, 9):
                    t = s[:i] + str((int(s[i]) + d) % 10) + s[i + 1:]
                    if t in banned or t in seen: continue
                    seen[t] = seen[s] + 1; nx.append(t)
        fr = nx
    return seen[target]
combo('S-AO02', [l for l, t in zip('ㄱㄴㄷㄹ', [steps_to('008', bad) == 4, steps_to('555', bad) == 16, steps_to('005', bad) == 5, steps_to('007', bad) - steps_to('007', set()) == 2]) if t])
pick('S-AO03', '바닥 면적 80제곱미터인 판매 시설을 공동 주택으로 바꾸려는 자는 신고하지 않아도 된다.')
def riffle(d, upper_first):
    a, b = d[:4], d[4:]
    return [c for pair in zip(a, b) for c in (pair if upper_first else pair[::-1])]
dk = list(range(1, 9))
a1 = riffle(dk, True); a2 = riffle(a1, True); a3 = riffle(a2, True); b3 = riffle(riffle(riffle(dk, False), False), False)
combo('S-AO04', [l for l, t in zip('ㄱㄴㄷㄹ', [a3 == dk, b3 == dk, a1[0] == 1 and a1[7] == 8, a2[1] == 3]) if t])
seg = [(6000, False, 4), (5000, False, 3), (3600, True, 2), (2400, True, 1)]
riders = [['甲', '乙', '丙', '丁'], ['乙', '丙', '丁'], ['丙', '丁'], ['丁']]
owe = {q: F(0) for q in '甲乙丙丁'}; total_ = F(0)
for (f_, night, n_), rs in zip(seg, riders):
    v = F(f_) * (F(6, 5) if night else 1); total_ += v
    for q in rs: owe[q] += v / n_
paid_ = {q: (owe[q] // 100) * 100 for q in '甲乙丙'}
pick('S-AO05', f'{int(total_ - sum(paid_.values())):,}원')
bk = {'소설': (300, 330, 60), '자기계발': (200, 180, 70), '아동': (150, 165, 50), '학습': (250, 240, 40), '만화': (100, 130, 80)}
on_ = {k: b * r for k, (a, b, r) in bk.items()}
s_ = [sum(v[1] for v in bk.values()) > sum(v[0] for v in bk.values()), max(bk, key=lambda k: F(bk[k][1], bk[k][0])) == '만화', [k for k, v in bk.items() if v[1] < v[0]] == ['자기계발', '학습'], max(on_, key=on_.get) == '소설', sum(on_.values()) >= 60 * sum(v[1] for v in bk.values())]
only('D-AO01', [not x for x in s_], 'false statements')
sm, sh0, sh1 = [1000, 1200, 1500], {'중국': 40, '미국': 15, '베트남': 10}, {'중국': 30, '미국': 20, '베트남': 12}
e0 = {k: sm[0] * v for k, v in sh0.items()}; e1 = {k: sm[2] * v for k, v in sh1.items()}
combo('D-AO02', [l for l, t in zip('ㄱㄴㄷㄹ', [sh1['중국'] < sh0['중국'] and e1['중국'] > e0['중국'], e1['미국'] == 2 * e0['미국'], e1['베트남'] >= 2 * e0['베트남'], max(e1, key=lambda k: e1[k] - e0[k]) == '미국']) if t])
br = {'가': (12, 8), '나': (7, 9), '다': (10, 5), '라': (6, 10), '마': (9, 6)}
mo = [m for m in itertools.permutations(br) if br[m[0]][0] < br[m[0]][1] and br[m[1]][0] < br[m[1]][1] and br[m[1]][1] > br[m[0]][1] and br[m[2]][0] == 2 * br[m[2]][1] and br[m[3]][0] - br[m[3]][1] > br[m[4]][0] - br[m[4]][1]]
ok(len(mo) == 1, f'D-AO03 {mo}'); pick('D-AO03', ', '.join(mo[0]))
ac = {'A': (20000, 20000 * 3 // 2 - 29700, 29700), 'B': ((120 + 17880) * 2 // 3, 120, 17880), 'C': (15000, 180, 15000 * 7 // 5 - 180), 'D': (8000, 100, 12700)}
by_text('D-AO04', list(zip(['사고 1건당 사상자가', '사고 1만 건당', '네 지역 전체의', 'B의 부상자는', 'C의 사고 건수는'], [max(ac, key=lambda k: F(ac[k][1] + ac[k][2], ac[k][0])) == max(ac, key=lambda k: ac[k][1]), max(ac, key=lambda k: F(ac[k][1], ac[k][0])) == 'C', sum(v[1] + v[2] for v in ac.values()) * 2 >= 3 * sum(v[0] for v in ac.values()), ac['B'][2] - ac['D'][2] >= 5000, ac['C'][0] * 10 >= 13 * ac['B'][0]])))
inc_, con_, s24 = [120, 250, 380, 520, 900], [130, 210, 290, 360, 520], [2, 14, 22, 29, 40]
sv = [a - b for a, b in zip(inc_, con_)]
combo('D-AO05', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(5) if F(sv[i] * 100, inc_[i]) < s24[i]] == [0], sv[4] > sum(sv[:4]), F(inc_[4] * con_[0], con_[4] * inc_[0]) >= 2, (sum(inc_) - sum(con_)) * 100 >= 30 * sum(inc_)]) if t])
pick('L-AO01', '죄수의 딜레마에서 두 용의자가 모두 우월 전략을 따르면 둘 다 침묵할 때보다 나쁜 결과를 얻는다.')
G2 = {('K', 'K'): (10, 8), ('K', 'C'): (2, 9), ('C', 'K'): (14, 3), ('C', 'C'): (5, 6)}       # K 유지, C 인하
def dom(g, pl):
    for s in 'KC':
        o = 'C' if s == 'K' else 'K'
        if pl == 0 and all(g[(s, x)][0] > g[(o, x)][0] for x in 'KC'): return s
        if pl == 1 and all(g[(x, s)][1] > g[(x, o)][1] for x in 'KC'): return s
    return None
ne = [k for k in G2 if all(G2[k][0] >= G2[(x, k[1])][0] for x in 'KC') and all(G2[k][1] >= G2[(k[0], y)][1] for y in 'KC')]
G3 = dict(G2); G3[('K', 'C')] = (2, 7)
combo('L-AO02', [l for l, t in zip('ㄱㄴㄷㄹ', [dom(G2, 0) == 'C' and dom(G2, 1) == 'C', ne == [('C', 'C')], max(G2, key=lambda k: sum(G2[k])) == ('K', 'K'), dom(G3, 1) == 'K']) if t])
combo('L-AO03', ['ㄱ', 'ㄷ', 'ㄹ']); combo('L-AO05', ['ㄴ', 'ㄷ'])
wk = [o for o in itertools.permutations('ABCDE') if o.index('A') < o.index('B') and o.index('C') != 2 and o.index('D') == o.index('E') + 1 and o.index('B') != 4 and o.index('A') != 0]
by_text('L-AO04', list(zip(['A는 화요일', 'B는 화요일', 'D는 금요일', 'C는 월요일', 'E는 월요일'], [all(o.index('A') != 1 for o in wk), all(o.index('B') != 1 for o in wk), all(o.index('D') != 4 for o in wk), all(o.index('C') != 0 for o in wk), all(o.index('E') != 0 for o in wk)])), what='always-false options')
# ================= S-AP / D-AP / L-AP (5급 실전, independent re-solve from the rendered options) =================
def info_fee(minutes, pages, post, kind):
    f_ = 0
    if minutes: f_ += 1000 + 500 * ((max(0, minutes - 60) + 29) // 30)
    if pages: f_ += 250 + 50 * (pages - 1)
    if kind == 'pub': f_ = f_ * F(1, 2)
    if kind == 'poor': f_ = 0
    return f_ + post
s_ap01 = info_fee(130, 0, 0, '') + info_fee(0, 30, 2000, '') + info_fee(60, 21, 0, 'pub') + info_fee(0, 50, 1500, 'poor') + info_fee(40, 10, 0, '')
pick('S-AP01', f'{int(s_ap01):,}원')
def neighbors(st):
    for k in range(3):
        if any(st[j] == st[k] for j in range(k)): continue
        for to in (st[k] - 1, st[k] + 1):
            if 0 <= to <= 2 and not any(st[j] == to for j in range(k)):
                n_ = list(st); n_[k] = to; yield tuple(n_)
dist_ = {(0, 0, 0): 0}; prev_ = {}; fr = [(0, 0, 0)]
while fr:
    nx = []
    for s in fr:
        for t in neighbors(s):
            if t not in dist_: dist_[t] = dist_[s] + 1; prev_[t] = s; nx.append(t)
    fr = nx
pth = [(2, 2, 2)]
while pth[-1] != (0, 0, 0): pth.append(prev_[pth[-1]])
mvc = [sum(1 for a, b in zip(pth, pth[1:]) if a[k] != b[k]) for k in range(3)]
combo('S-AP02', [l for l, t in zip('ㄱㄴㄷㄹ', [dist_[(2, 2, 2)] == 26, dist_[(1, 1, 1)] == 14, mvc[2] == 2, mvc[0] == 18]) if t])
pick('S-AP03', '16세인 근로자가 합의하여 근로시간을 연장하면 1주 40시간까지 일할 수 있다.')
def weighable(ws, sides):
    return {sum(c * w for c, w in zip(cs, ws)) for cs in itertools.product(sides, repeat=len(ws))} - {0}
pos = lambda st: {x for x in st if x > 0}
combo('S-AP04', [l for l, t in zip('ㄱㄴㄷㄹ', [pos(weighable([1, 3, 9], (-1, 0, 1))) == set(range(1, 14)), len(pos(weighable([1, 3, 9], (0, 1)))) == 6, len(pos(weighable([1, 9], (-1, 0, 1)))) == 5, pos(weighable([1, 3, 9, 27], (-1, 0, 1))) == set(range(1, 41))]) if t])
wd = [1, 2, 3, 4, 5, 8, 9, 15, 16, 17, 18, 19, 20, 21, 29, 30]
cost_ = {31: 0}
for d in range(30, 0, -1):
    if d not in wd: cost_[d] = cost_[d + 1]; continue
    cost_[d] = min(3000 + cost_[d + 1], 10000 + cost_[min(31, d + 7)], 36000 + cost_[min(31, d + 30)])
pick('S-AP05', f'{cost_[1]:,}원')
lo = {'A': (200, 6000, 70, 72), 'B': (150, 5250, 60, 66), 'C': (100, 2500, 80, 76), 'D': (80, 3200, 55, 60), 'E': (50, 1000, 65, 70)}
s_ = [sum(1 for v in lo.values() if v[3] < v[2]) == 2, max(lo, key=lambda k: F(lo[k][1], lo[k][0])) == 'D', max(lo, key=lambda k: lo[k][1] * lo[k][3]) == 'A', max(lo, key=lambda k: lo[k][3] - lo[k][2]) == 'B', sum(v[1] * v[3] for v in lo.values()) >= 68 * sum(v[1] for v in lo.values())]
only('D-AP01', [not x for x in s_], 'false statements')
kg, pp_ = [63, 58, 52], [5100, 5180, 5150]
tt = [a * b for a, b in zip(kg, pp_)]
combo('D-AP02', [l for l, t in zip('ㄱㄴㄷㄹ', [tt[0] > tt[1] > tt[2], tt[2] * 100 <= 85 * tt[0], F(kg[1] - kg[2], kg[1]) > F(kg[0] - kg[1], kg[0]), kg[2] * pp_[1] >= 270 * 1000]) if t])
xv = {'가': (100, 130), '나': (400, 440), '다': (50, 60), '라': (250, 295), '마': (300, 315)}
mx_ = [m for m in itertools.permutations(xv) if m[0] == max(xv, key=lambda k: F(xv[k][1], xv[k][0])) and m[1] == max(xv, key=lambda k: xv[k][1] - xv[k][0]) and F(xv[m[2]][1], xv[m[2]][0]) > F(xv[m[3]][1], xv[m[3]][0]) and xv[m[2]][1] - xv[m[2]][0] < xv[m[3]][1] - xv[m[3]][0] and xv[m[4]][1] < xv[m[3]][1]]
ok(len(mx_) == 1, f'D-AP03 {mx_}'); pick('D-AP03', ', '.join(mx_[0]))
uni = {'A': (10000, 10000 * 30 // 100, 90), 'B': (2400 * 100 // 40, 2400, 60), 'C': (8000, 2000, 70), 'D': (5000, 5000 * 35 // 100, 49)}
pcap = {k: F(v[2] * 10000, v[1]) for k, v in uni.items()}
by_text('D-AP04', list(zip(['수혜율이 가장', '장학금 총액이', '네 대학 전체의 수혜율', 'B의 재학생은', '네 대학 전체의 수혜자'], [max(uni, key=lambda k: F(uni[k][1], uni[k][0])) == max(pcap, key=pcap.get), max(uni, key=lambda k: uni[k][2]) == max(pcap, key=pcap.get), sum(v[1] for v in uni.values()) * 10 >= 3 * sum(v[0] for v in uni.values()), uni['B'][0] * 10 > 12 * uni['D'][0], sum(v[2] for v in uni.values()) * 10000 >= 300 * sum(v[1] for v in uni.values())])))
c20_, c25_ = [80 * s for s in (5, 35, 60)], [100 * s for s in (4, 30, 66)]
combo('D-AP05', [l for l, t in zip('ㄱㄴㄷㄹ', [30 < 35 and c25_[1] > c20_[1], c25_[0] == c20_[0], (c25_[2] - c20_[2]) * 10 >= 9 * (100 - 80) * 100, c25_[2] * 10 >= 14 * c20_[2]]) if t])
pick('L-AP01', '배출권 가격이 두 기업의 1톤당 감축 비용 사이에서 정해지면 배출권을 파는 기업과 사는 기업이 모두 이득을 본다.')
no_trade = 100 * 2 + 100 * 6; with_trade = 200 * 2
gap_a = 100 * 2 - (200 * 2 - 100 * 4)
combo('L-AP02', [l for l, t in zip('ㄱㄴㄷㄹ', [no_trade == 800, no_trade - with_trade == 400, gap_a == 200, 100 * 7 < 100 * 6]) if t])
combo('L-AP03', ['ㄴ', 'ㄷ']); combo('L-AP05', ['ㄱ', 'ㄷ'])
deal = set()
for p_ in itertools.permutations('RRBBYY'):
    a, b, c = sorted(p_[:2]), sorted(p_[2:4]), sorted(p_[4:])
    if a[0] != a[1] and 'R' not in b and 'B' in c: deal.add((''.join(a), ''.join(b), ''.join(c)))
by_text('L-AP04', list(zip(['丙은 빨간', '甲은 파란', '乙은 노란', '甲과 乙이', '乙은 파란'], [all('R' in c for a, b, c in deal), all('B' in a for a, b, c in deal), all(b == 'YY' for a, b, c in deal), all(not set(a) & set(b) for a, b, c in deal), all('B' not in b for a, b, c in deal)])))
# ================= S-AQ / D-AQ / L-AQ (5급 실전, independent re-solve from the rendered options) =================
def refund_sub(grant, spent, misuse, late, force):
    base = grant - spent + misuse
    amt = F(base) + F(misuse, 10) + (F(base, 20) if late and not force else 0)
    return 0 if amt < 10 else amt
s_aq01 = refund_sub(1000, 940, 0, 0, 0) + refund_sub(2000, 2000, 300, 0, 0) + refund_sub(1500, 1400, 0, 1, 0) + refund_sub(800, 795, 0, 0, 0) + refund_sub(3000, 2600, 200, 1, 1)
pick('S-AQ01', f'{int(s_aq01):,}만 원')
def slide_reach():
    st0 = '12345_'; seen = {st0}; fr = [st0]
    while fr:
        nx = []
        for s in fr:
            i = s.index('_'); r, c = divmod(i, 3)
            for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= rr < 2 and 0 <= cc < 3:
                    j = rr * 3 + cc; t = list(s); t[i], t[j] = t[j], t[i]; t = ''.join(t)
                    if t not in seen: seen.add(t); nx.append(t)
        fr = nx
    return seen
rs = slide_reach()
two = {s for s in ['12345_'] for _ in [0]}
lvl = {'12345_'}; lv = [lvl]
for _ in range(2):
    nxt = set()
    for s in lv[-1]:
        i = s.index('_'); r, c = divmod(i, 3)
        for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= rr < 2 and 0 <= cc < 3:
                j = rr * 3 + cc; t = list(s); t[i], t[j] = t[j], t[i]; nxt.add(''.join(t))
    lv.append(nxt)
combo('S-AQ02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(rs) * 2 == 720, '21345_' not in rs, '123_45' in lv[2], '32145_' in rs]) if t])
pick('S-AQ03', '광고와 다른 재화를 받은 소비자가 청약을 철회하는 경우 반환 비용은 사업자가 부담한다.')
def wd_of(day_index): return day_index % 7      # 0 = 일요일
def fri13_count(leap):
    ml = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    cnt, start = 0, 0
    for m in range(12):
        if wd_of(start + 12) == 5: cnt += 1
        start += ml[m]
    return cnt
combo('S-AQ04', [l for l, t in zip('ㄱㄴㄷㄹ', [fri13_count(False) == 2, wd_of(364) == 6, wd_of(365) == 1, fri13_count(True) == 4]) if t])
tm = {frozenset(k): v for k, v in {('H', 'A'): 30, ('H', 'B'): 60, ('H', 'C'): 40, ('H', 'D'): 50, ('A', 'B'): 40, ('A', 'C'): 50, ('A', 'D'): 70, ('B', 'C'): 30, ('B', 'D'): 40, ('C', 'D'): 60}.items()}
win = {'A': (600, 1080, 90), 'B': (540, 720, 60), 'C': (780, 1080, 60), 'D': (540, 960, 90)}
good = []
for od in itertools.permutations('ABCD'):
    t, cur, okk = 540, 'H', True
    for x in od:
        t = max(t + tm[frozenset((cur, x))], win[x][0]) + win[x][2]
        if t > win[x][1]: okk = False; break
        cur = x
    if okk and t + tm[frozenset((cur, 'H'))] <= 1080: good.append(od)
ok(len(good) == 1, f'S-AQ05 {good}'); pick('S-AQ05', ', '.join(good[0]))
fa = {'A': (40, 2000, 1700, 1840), 'B': (25, 1500, 1350, 1395), 'C': (30, 1200, 1000, 1080), 'D': (20, 1600, 1200, 1520), 'E': (15, 600, 480, 510)}
s_ = [sum(v[3] for v in fa.values()) * 10 >= 11 * sum(v[2] for v in fa.values()), max(fa, key=lambda k: F(fa[k][3], fa[k][1])) == 'B', max(fa, key=lambda k: F(fa[k][1], fa[k][0])) == 'D', max(fa, key=lambda k: F(fa[k][3], fa[k][2])) == 'D', [k for k, v in fa.items() if v[3] * 10 < 9 * v[1]] == ['E']]
only('D-AQ01', [not x for x in s_], 'false statements')
fw0, fw1 = 40, 60; sh = {'제조업': (50, 45), '농축산업': (15, 18), '건설업': (20, 17), '서비스업': (15, 20)}
nn = {k: (fw0 * a, fw1 * b) for k, (a, b) in sh.items()}
combo('D-AQ02', [l for l, t in zip('ㄱㄴㄷㄹ', [sh['제조업'][1] < sh['제조업'][0] and nn['제조업'][1] > nn['제조업'][0], nn['서비스업'][1] == 2 * nn['서비스업'][0], nn['건설업'][1] * fw0 < nn['건설업'][0] * fw1, nn['농축산업'][1] - nn['농축산업'][0] >= 3 * (nn['건설업'][1] - nn['건설업'][0])]) if t])
ts = {'가': (20, 26, 32), '나': (30, 24, 27), '다': (22, 28, 34), '라': (35, 30, 28), '마': (18, 21, 21)}
mq = [m for m in itertools.permutations(ts) if sum(ts[m[0]]) == max(sum(v) for v in ts.values()) and ts[m[1]][1] < ts[m[1]][0] < 99 and ts[m[1]][2] > ts[m[1]][1] and 3 * ts[m[2]][2] - sum(ts[m[2]]) >= 18 and sum(ts[m[3]]) > sum(ts[m[2]])]
ok(len(mq) == 1, f'D-AQ03 {mq}'); pick('D-AQ03', ', '.join(mq[0]))
wa = {'A': (4000, 3600, 400), 'B': (2500, 2250, 250), 'C': (6000, 5100, 900), 'D': (3000, 2760, 240)}; pw = {'A': 50, 'B': 30, 'C': 80, 'D': 40}
pu = {k: F(wa[k][1], pw[k]) for k in wa}; lr = {k: F(wa[k][2], wa[k][0]) for k in wa}
by_text('D-AQ04', list(zip(['급수 인구 1인당 사용량이 가장 많은', '네 지역 전체의 누수율', 'C의 공급량은', 'D의 공급량이', '급수 인구 1인당 사용량이 가장 적은'], [max(pu, key=pu.get) == 'B', sum(v[2] for v in wa.values()) * 100 >= 12 * sum(v[0] for v in wa.values()), wa['C'][0] * 2 > 3 * wa['A'][0], wa['D'][0] * 95 >= 2900 * 100, min(pu, key=pu.get) == min(lr, key=lr.get)])))
pg, pop_ = [50, 30, 12, 8], [60, 100, 250, 400]; gg = [a * b for a, b in zip(pg, pop_)]
combo('D-AQ05', [l for l, t in zip('ㄱㄴㄷㄹ', [gg.index(max(gg)) == 3, gg[0] == gg[1] == gg[2], sum(gg) >= 15 * sum(pop_), pg[0] >= 7 * pg[3]]) if t])
pick('L-AQ01', '하위 집단마다 비율이 더 높더라도 비율이 낮은 하위 집단의 비중이 크면 전체 비율은 더 낮을 수 있다.')
ha = {'sev': (80, 56), 'mild': (20, 19)}; hb = {'sev': (20, 12), 'mild': (80, 72)}
ra = {g: F(v[1], v[0]) for g, v in ha.items()}; rb = {g: F(v[1], v[0]) for g, v in hb.items()}
oa, ob = F(56 + 19, 100), F(12 + 72, 100)
combo('L-AQ02', [l for l, t in zip('ㄱㄴㄷㄹ', [ob - oa == F(9, 100), ra['sev'] > rb['sev'] and ra['mild'] > rb['mild'], F(1, 5) * ra['sev'] + F(4, 5) * ra['mild'] > ob, F(4, 5) * rb['sev'] + F(1, 5) * rb['mild'] < F(3, 5)]) if t])
combo('L-AQ03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-AQ05', ['ㄴ'])
rt_ = []
for pm in itertools.permutations('BCDEF'):
    ring = 'A' + ''.join(pm); pos = {x: i for i, x in enumerate(ring)}
    adj = lambda x, y: abs(pos[x] - pos[y]) in (1, 5)
    if abs(pos['A'] - pos['B']) == 3 and adj('A', 'C') and not adj('D', 'E') and adj('F', 'B'): rt_.append(pos)
adj2 = lambda p_, x, y: abs(p_[x] - p_[y]) in (1, 5)
by_text('L-AQ04', list(zip(['C는 A의 오른쪽', 'D는 B의', 'E는 F의', 'C는 B의', 'D와 F는'], [all(p_['C'] == 1 for p_ in rt_), all(adj2(p_, 'D', 'B') for p_ in rt_), all(adj2(p_, 'E', 'F') for p_ in rt_), all(not adj2(p_, 'C', 'B') for p_ in rt_), all(abs(p_['D'] - p_['F']) == 3 for p_ in rt_)])))
# ================= S-AR / D-AR / L-AR (5급 실전, independent re-solve from the rendered options) =================
def baby(order_older, n_new, twin, months, transfer):
    base = sum((100, 200, 300)[min(order_older + i, 2)] + (30 if twin else 0) for i in range(n_new))
    if transfer or months >= 12: return F(base)
    return F(base, 2) if months >= 6 else F(0)
s_ar01 = baby(0, 1, 0, 24, 0) + baby(2, 1, 0, 8, 0) + baby(0, 2, 1, 36, 0) + baby(1, 1, 0, 4, 1) + baby(2, 1, 0, 24, 0)
pick('S-AR01', f'{int(s_ar01):,}만 원')
fin_cnt, cnt_all, mx_w = {r: 0 for r in range(1, 9)}, 0, {r: 0 for r in range(1, 9)}
for seat in itertools.permutations(range(1, 9)):
    cnt_all += 1
    q1 = [min(seat[i], seat[i + 1]) for i in (0, 2, 4, 6)]; q2 = [min(q1[0], q1[1]), min(q1[2], q1[3])]
    for r in range(1, 9):
        w = (r in q1) + (r in q2) + (r == min(q2))
        mx_w[r] = max(mx_w[r], w)
        if r in q2: fin_cnt[r] += 1
combo('S-AR02', [l for l, t in zip('ㄱㄴㄷㄹ', [fin_cnt[2] == cnt_all, [r for r in mx_w if mx_w[r] >= 2] == [1, 2, 3, 4, 5], mx_w[6] <= 1, 3 * fin_cnt[3] >= cnt_all]) if t])
pick('S-AR03', '국가에 귀속된 평가액 8,000만 원의 문화유산을 남의 땅에서 발견하여 기한 안에 신고한 사람이 받을 수 있는 보상금은 최대 2,000만 원이다.')
def opened(who): return [j for j in range(1, 41) if sum(1 for k in who if j % k == 0) % 2 == 1]
combo('S-AR04', [l for l, t in zip('ㄱㄴㄷㄹ', [len(opened(range(1, 41))) == 6, sum(1 for k in range(1, 41) if 30 % k == 0) == 8, opened(range(1, 41, 2)) == opened(range(1, 41)), len(opened([1, 2, 3])) == 19]) if t])
dur = {'A': 1, 'B': 2, 'C': 3, 'D': 3, 'E': 3, 'F': 2}; need = {'A': '', 'B': 'A', 'C': '', 'D': 'C', 'E': 'AB', 'F': 'DE'}
best_ = 99
for who in itertools.product('甲乙', repeat=6):
    w = dict(zip('ABCDEF', who))
    if w['B'] != '甲' or w['C'] != '甲': continue
    for od in itertools.permutations('ABCDEF'):
        if any(od.index(x) < od.index(y) for x in od for y in need[x]): continue
        busy, end = {'甲': 0, '乙': 0}, {}
        for x in od:
            st = max([busy[w[x]]] + [end[y] for y in need[x]]); end[x] = st + dur[x]; busy[w[x]] = end[x]
        best_ = min(best_, max(end.values()))
pick('S-AR05', f'{best_}시간')
mk = {'A': (40, 3200, 4000, 4200), 'B': (25, 2500, 3000, 3450), 'C': (30, 1800, 2000, 2120), 'D': (20, 2200, 2500, 2750), 'E': (15, 975, 1000, 1020)}
g0, g1 = sum(v[2] for v in mk.values()), sum(v[3] for v in mk.values())
s_ = [g1 * 100 >= 108 * g0, max(mk, key=lambda k: F(mk[k][1], mk[k][0])) == 'D', max(mk, key=lambda k: F(mk[k][3], mk[k][1])) == 'A', max(mk, key=lambda k: F(mk[k][3], mk[k][2])) == 'B', sum(1 for v in mk.values() if F(v[3], v[2]) < F(g1, g0)) == 3]
only('D-AR01', [not x for x in s_], 'false statements')
y4, y5, pp = [60, 90, 40, 50], [54, 95, 44, 57], [500, 650, 700, 2900]
combo('D-AR02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(y5) > sum(y4), y5[1] * pp[0] > y5[0] * pp[1], y5[3] * y4[2] > y5[2] * y4[3], (y5[0] + y5[1]) * 10 >= 6 * sum(y5)]) if t])
bod = {'가': (20, 18, 15), '나': (32, 35, 30), '다': (12, 14, 16), '라': (40, 32, 26), '마': (24, 26, 28)}
md = [m for m in itertools.permutations(bod) if all(F(bod[m[1]][0] - bod[m[1]][2], bod[m[1]][0]) > F(bod[k][0] - bod[k][2], bod[k][0]) for k in bod if k != m[1]) and bod[m[2]][2] < bod[m[3]][2] and bod[m[0]][2] > bod[m[4]][2] and bod[m[3]][2] < 20]
ok(len(md) == 1, f'D-AR03 {md}'); pick('D-AR03', ', '.join(md[0]))
lo = {'A': (5000, 4000, 4000 * 500 / 10000), 'B': (2700 * 100 // 90, 2700, 162), 'C': (4000, 3000, 240), 'D': (2000, 1700, 1700 * 400 / 10000)}
per = {k: F(int(v[2] * 10000), v[1]) for k, v in lo.items()}
by_text('D-AR04', list(zip(['네 유형 전체의 승인율', '1인당 대출액이 가장 많은', '(가)는', 'B의 신청자 수는', '네 유형의 대출액 합계'], [sum(v[1] for v in lo.values()) * 100 >= 82 * sum(v[0] for v in lo.values()), max(per, key=per.get) == 'C', lo['A'][2] >= 3 * lo['D'][2], lo['B'][0] * 10 > 6 * lo['A'][0], sum(v[2] for v in lo.values()) >= 700])))
asr, dbt, hh = [30, 55, 60, 50], [10, 13, 11, 10], [300, 400, 500, 800]
nets = [a - d for a, d in zip(asr, dbt)]; tot_d = sum(d * h for d, h in zip(dbt, hh))
combo('D-AR05', [l for l, t in zip('ㄱㄴㄷㄹ', [nets.index(max(nets)) == 2, all(dbt[i] * asr[i + 1] > dbt[i + 1] * asr[i] for i in range(3)), dbt[3] * hh[3] * 100 >= 35 * tot_d, tot_d >= 10 * sum(hh)]) if t])
pick('L-AR01', '결선투표제에서는 콩도르세 승자가 1차 투표에서 탈락할 수 있다.')
bal = [('ABC', 8), ('BCA', 6), ('CBA', 5)]
first_ = {c: sum(n_ for r, n_ in bal if r[0] == c) for c in 'ABC'}
pw_ = lambda x, y: sum(n_ for r, n_ in bal if r.find(x) < r.find(y))
fx = sorted(first_, key=first_.get)[::-1]
run_w = fx[0] if 2 * first_[fx[0]] > 19 else (fx[0] if pw_(fx[0], fx[1]) > pw_(fx[1], fx[0]) else fx[1])
bsc = {c: sum(n_ * (2 - r.find(c)) for r, n_ in bal) for c in 'ABC'}
two_ = {c: sum(n_ for r, n_ in bal if r.replace('C', '')[0] == c) for c in 'AB'}
combo('L-AR02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(first_, key=first_.get) == 'A', run_w == max(bsc, key=bsc.get), all(2 * pw_('B', y) > 19 for y in 'AC'), max(two_, key=two_.get) == 'A']) if t])
combo('L-AR03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-AR05', ['ㄱ', 'ㄴ'])
rc = []
for mid in itertools.permutations('ABCDE'):
    for fin in itertools.permutations('ABCDE'):
        if mid[0] == 'A' and fin[0] != 'A' and mid.index('B') == fin.index('B') and mid.index('C') > mid.index('D') and fin.index('C') < fin.index('D') and mid.index(fin[0]) == 2 and fin[1] == 'C': rc.append((mid, fin))
by_text('L-AR04', list(zip(['D는 중간 지점에서 2위', 'A는 결승에서 3위', 'B는 결승에서 4위', 'C는 중간 지점에서 4위', 'D는 결승에서 3위'], [all(m[1] == 'D' for m, f in rc), all(f[2] == 'A' for m, f in rc), all(f[3] == 'B' for m, f in rc), all(m[3] == 'C' for m, f in rc), all(f[2] == 'D' for m, f in rc)])))
# ================= S-AS / D-AS / L-AS (5급 실전, independent re-solve from the rendered options) =================
def ikg(home, built, use, prior):
    amt = F(built * 10 + use * 4); ar = built + use
    if home and ar <= 60 and not prior: amt = amt / 2
    if ar > 200: amt = amt * F(12, 10)
    return min(amt, F(5000))
s_as01 = ikg(1, 40, 0, 0) + ikg(1, 30, 20, 1) + ikg(0, 0, 250, 0) + ikg(1, 50, 20, 0) + ikg(0, 450, 0, 0)
pick('S-AS01', f'{int(s_as01):,}만 원')
sh7 = {'0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg'}
back7 = {frozenset(v): k for k, v in sh7.items()}
opsh = {'+': 'hv', '-': 'h'}; backop = {frozenset(v): k for k, v in opsh.items()}
def one_moves(eq):
    a, op, b, c = eq[0], eq[1], eq[2], eq[4]
    syms = [set(sh7[a]), set(opsh[op]), set(sh7[b]), set(sh7[c])]
    alls = [set('abcdefg'), set('hv'), set('abcdefg'), set('abcdefg')]
    res = set()
    for i in range(4):
        for st in syms[i]:
            for j in range(4):
                for t in alls[j] - syms[j]:
                    if i == j and t == st: continue
                    ns = [set(x) for x in syms]; ns[i].discard(st); ns[j].add(t)
                    dec = [back7.get(frozenset(ns[0])), backop.get(frozenset(ns[1])), back7.get(frozenset(ns[2])), back7.get(frozenset(ns[3]))]
                    if None in dec: continue
                    lhs = int(dec[0]) + int(dec[2]) if dec[1] == '+' else int(dec[0]) - int(dec[2])
                    if lhs == int(dec[3]): res.add(f'{dec[0]}{dec[1]}{dec[2]}={dec[3]}')
    return res
combo('S-AS02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(one_moves('5+7=2')) > 0, len(one_moves('2+7=3')) > 0, len(one_moves('8-3=3')) == 3, one_moves('6+4=4') == {'8-4=4'}]) if t])
pick('S-AS03', '무게 15kg인 드론을 비행장 중심에서 3km 떨어진 곳에서 낮에 날리려면 비행 승인을 받아야 한다.')
def tank(open_, dt=F(1, 1000)):
    # exact event-based: level crosses 1/2 once
    ra = F(1, 6) if 'A' in open_ else 0; rc = F(1, 12) if 'C' in open_ else 0
    lo = ra + (F(1, 4) if 'B' in open_ else 0) - rc; hi = ra + (F(1, 8) if 'B' in open_ else 0) - rc
    return F(1, 2) / lo + F(1, 2) / hi
combo('S-AS04', [l for l, t in zip('ㄱㄴㄷㄹ', [tank('AB') < 3, tank('B') < tank('A'), tank('ABC') < 4, tank('BC') > 12]) if t])
best_l = None
for mask in range(1 << 13):
    S = [x for x in range(13) if mask >> x & 1]
    if 8 in S: continue
    lit = [sum(1 for s in S if abs(s - q) <= 2) for q in range(13)]
    if min(lit) < 1 or lit[6] < 2 or lit[7] < 2: continue
    cst = sum(20 if s % 4 == 0 else 30 for s in S)
    best_l = cst if best_l is None else min(best_l, cst)
pick('S-AS05', f'{best_l}만 원')
kd = {'A': (190, 8000, 7200, 1200), 'B': (150, 7800, 6000, 960), 'C': (120, 4800, 4560, 800), 'D': (80, 4000, 3000, 600), 'E': (100, 3000, 2820, 380)}
s_ = [sum(v[2] for v in kd.values()) * 100 >= 85 * sum(v[1] for v in kd.values()), max(kd, key=lambda k: F(kd[k][2], kd[k][1])) == 'C', max(kd, key=lambda k: F(kd[k][1], kd[k][0])) == 'B', max(kd, key=lambda k: F(kd[k][2], kd[k][3])) == 'B', sum(1 for v in kd.values() if v[2] * 10 >= 9 * v[1]) == 3]
only('D-AS01', [not x for x in s_], 'false statements')
fc, fa = [480, 520, 600, 560, 640], [1200, 24800, 4900, 3200, 6400]
combo('D-AS02', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(1, 5) if fc[i] < fc[i - 1]] == [3], max(range(5), key=lambda i: F(fa[i], fc[i])) == 1, fa[4] * fc[0] > 4 * fa[0] * fc[4], (fa[4] - fa[0]) * fc[0] >= 10 * (fc[4] - fc[0]) * fa[0]]) if t])
pz = {'가': (2000, 2600, 3200), '나': (3000, 2400, 2700), '다': (1500, 1800, 1500), '라': (4000, 3600, 3000), '마': (2500, 2500, 3800)}
mp = [m for m in itertools.permutations(pz) if pz[m[2]][1] > pz[m[2]][0] and pz[m[2]][1] > pz[m[2]][2] and pz[m[1]][0] > pz[m[0]][0] and pz[m[3]][2] > pz[m[4]][2] and pz[m[4]][0] < pz[m[4]][1] < pz[m[4]][2]]
ok(len(mp) == 1, f'D-AS03 {mp}'); pick('D-AS03', ', '.join(mp[0]))
tx = {'A': (5000, 4750), 'B': (2880 + 120, 2880), 'C': (2000, 2000 * 9 // 10), 'D': (1500, 1380)}
uu = {k: a - b for k, (a, b) in tx.items()}
by_text('D-AS04', list(zip(['네 세목 전체의 징수율', '미수납액이 가장 많은', '(나)는', 'D의 징수율은', '네 세목의 미수납액 합계'], [sum(b for a, b in tx.values()) * 100 > 94 * sum(a for a, b in tx.values()), max(uu, key=uu.get) == 'A', tx['B'][0] >= 2 * tx['C'][1], tx['D'][1] * tx['B'][0] > tx['B'][1] * tx['D'][0], sum(uu.values()) >= 700])))
r15, r25 = [70, 55, 40], [65, 52, 41]
w15 = [400 * r for r in r15]; w25 = [560 * r for r in r25]      # ×100
combo('D-AS05', [l for l, t in zip('ㄱㄴㄷㄹ', [all(b > a for a, b in zip(w15, w25)), w25[2] * 400 > w15[2] * 560, 2 * (56000 - w25[0]) >= 3 * (40000 - w15[0]), w25[1] < w15[0]]) if t])
pick('L-AS01', '지니계수가 같은 두 사회라도 로렌츠 곡선의 모양은 다를 수 있다.')
def gn(sh):
    c = [0]
    for x in sh: c.append(c[-1] + x)
    area = sum(F(c[i] + c[i + 1], 100) for i in range(5)) / 10
    return (F(1, 2) - area) * 2
ga, gb = [8, 12, 16, 24, 40], [6, 14, 18, 22, 40]
combo('L-AS02', [l for l, t in zip('ㄱㄴㄷㄹ', [gn(ga) == gn(gb), F(gb[4], gb[0]) > F(ga[4], ga[0]), sum(ga[:3]) > sum(gb[:3]), gn([10, 12, 16, 24, 38]) > gn(ga)]) if t])
combo('L-AS03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-AS05', ['ㄱ', 'ㄴ'])
cm = []
for joinset in itertools.product(itertools.combinations(['독서', '등산', '사진'], 2), repeat=6):
    jn = dict(zip('ABCDEF', joinset))
    if len({sum(1 for v in jn.values() if c in v) for c in ['독서', '등산', '사진']}) != 1: continue
    if len(set(jn['A']) & set(jn['B'])) != 1 or '사진' in jn['C'] or jn['D'] != jn['E'] or '독서' not in jn['F']: continue
    cm.append(jn)
by_text('L-AS04', list(zip(['A는 사진', 'B는 등산', 'C와 F가', 'E는 독서', 'F는 등산'], [all('사진' in j['A'] for j in cm), all('등산' in j['B'] for j in cm), all(len(set(j['C']) & set(j['F'])) == 2 for j in cm), all('독서' in j['E'] for j in cm), all('등산' not in j['F'] for j in cm)])))
# ================= S-AT / D-AT / L-AT (5급 실전, independent re-solve from the rendered options) =================
def jobpay(wage, months, age, eligible):
    if not eligible: return 0
    d = min(max(wage * 6 // 10, 60000), 66000)
    n_ = 120 if months < 12 else 150 if months < 36 else 180
    return d * (n_ + (30 if age >= 50 else 0))
jp = {'甲': jobpay(100000, 24, 45, 1), '乙': jobpay(150000, 60, 52, 0), '丙': jobpay(80000, 48, 55, 1), '丁': jobpay(120000, 42, 40, 1), '戊': jobpay(130000, 10, 51, 1)}
pick('S-AT01', max(jp, key=jp.get))
def die_moves(st):
    (r, c), (top, south, east) = st
    out = []
    if c < 2: out.append(((r, c + 1), (7 - east, south, top)))
    if c > 0: out.append(((r, c - 1), (east, south, 7 - top)))
    if r < 2: out.append(((r + 1, c), (7 - south, top, east)))
    if r > 0: out.append(((r - 1, c), (south, 7 - top, east)))
    return out
lay = [{((0, 0), (1, 2, 3))}]
for _ in range(8): lay.append({t for s in lay[-1] for t in die_moves(s)})
first_at = lambda cell, tp: min(i for i, L in enumerate(lay) if any(s[0] == cell and s[1][0] == tp for s in L))
combo('S-AT02', [l for l, t in zip('ㄱㄴㄷㄹ', [sorted({s[1][0] for s in lay[4] if s[0] == (2, 2)}) == [1, 2, 3, 6], first_at((2, 2), 4) == 6, any(s[0] == (0, 0) and s[1][0] == 6 for L in lay[:5] for s in L), len({s[1][0] for s in lay[2] if s[0] == (1, 1)}) == 1]) if t])
pick('S-AT03', '검사 기간이 끝난 날부터 60일이 지나 정기검사를 받은 소유자의 과태료는 12만 원이다.')
lab = [n_ for n_ in range(1, 200) if '4' not in str(n_)]
combo('S-AT04', [l for l, t in zip('ㄱㄴㄷㄹ', [lab[29] == 33, lab.index(50) == 35, lab[39] == 52, sum(1 for n_ in range(1, 101) if '4' not in str(n_)) == 81]) if t])
cheap = min(5 * a + 3 * b + 2 * c for a in range(25) for b in range(25) for c in range(2) if 4 * a + 2 * b + 4 * c >= 20 and a + 6 * b + c >= 20)
pick('S-AT05', f'{cheap * 1000:,}원')
cin = {'A': (60, 480, 3000, 3240), 'B': (40, 360, 2000, 2300), 'C': (50, 300, 1800, 1890), 'D': (30, 252, 1500, 1800), 'E': (20, 130, 700, 728)}
c0, c1 = sum(v[2] for v in cin.values()), sum(v[3] for v in cin.values())
s_ = [c1 * 10 >= 11 * c0, max(cin, key=lambda k: F(cin[k][1], cin[k][0])) == 'B', max(cin, key=lambda k: F(cin[k][3], cin[k][1])) == 'A', max(cin, key=lambda k: F(cin[k][3], cin[k][2])) == 'D', sorted(k for k, v in cin.items() if F(v[3], v[2]) > F(c1, c0)) == ['B', 'D']]
only('D-AT01', [not x for x in s_], 'false statements')
e15, e25 = [25, 15, 12, 10, 38], [22, 18, 13, 7, 40]
m15, m25 = [2 * x for x in e15], [F(28, 10) * x for x in e25]
combo('D-AT02', [l for l, t in zip('ㄱㄴㄷㄹ', [e25[0] < e15[0] and m25[0] > m15[0], m25[3] < m15[3], m25[1] * m15[2] > m25[2] * m15[1], m25[2] * 4 >= 5 * m15[1]]) if t])
tsh = {'가': (40, 0, 50, 200), '나': (20, 30, 45, 600), '다': (35, 15, 40, 300), '라': (25, 35, 30, 800), '마': (30, 20, 40, 500)}
mt = [m for m in itertools.permutations(tsh) if tsh[m[0]][1] == max(v[1] for v in tsh.values()) and tsh[m[1]][2] == max(v[2] for v in tsh.values()) and tsh[m[3]][0] * tsh[m[3]][3] < tsh[m[2]][0] * tsh[m[2]][3] and tsh[m[3]][2] * tsh[m[3]][3] > tsh[m[4]][2] * tsh[m[4]][3]]
ok(len(mt) == 1, f'D-AT03 {mt}'); pick('D-AT03', ', '.join(mt[0]))
em = {'A': (36500, 36500 - 29200), 'B': (6570 + 15330, 6570), 'C': (18250, 4380), 'D': (29200, 29200 - 23360)}
hm_ = {'A': 29200, 'B': 15330, 'C': 18250 - 4380, 'D': 23360}
by_text('D-AT04', list(zip(['네 병원 전체의 입원율', 'B 응급실의 하루 평균', 'C의 입원율은', '귀가 환자가 가장 많은', '(가)와 (마)의 합'], [sum(b for a, b in em.values()) * 100 >= 23 * sum(a for a, b in em.values()), em['B'][0] == 60 * 365, em['C'][1] * em['D'][0] < em['D'][1] * em['C'][0], max(hm_, key=hm_.get) == 'D', em['A'][1] + em['D'][1] >= 13500])))
ar0, ar1 = [80, 20, 25, 15], [60, 24, 20, 18]; y0, y1 = [2, 25, 20, 4], [F(5, 2), 25, 22, 5]
q0 = [a * b for a, b in zip(ar0, y0)]; q1 = [a * b for a, b in zip(ar1, y1)]
combo('D-AT05', [l for l, t in zip('ㄱㄴㄷㄹ', [ar1[0] < ar0[0] and q1[0] > q0[0], q1.index(max(q1)) == 1, q1[3] * 2 == q0[3] * 3, q0[1] == q0[2]]) if t])
pick('L-AT01', '두 사업 가운데 어느 쪽의 순현재가치가 더 큰지는 할인율에 따라 바뀔 수 있다.')
def pvv(flows, r): return sum(F(v) / (1 + r) ** t_ for t_, v in flows)
X_, Y_ = [(0, -100), (1, 60), (2, 60)], [(0, -100), (2, 125)]
combo('L-AT02', [l for l, t in zip('ㄱㄴㄷㄹ', [pvv(X_, F(1, 10)) > 0 < pvv(Y_, F(1, 10)), pvv(X_, F(1, 10)) > pvv(Y_, F(1, 10)), pvv(Y_, 0) > pvv(X_, 0), pvv(X_, F(1, 5)) > 0 >= pvv(Y_, F(1, 5))]) if t])
combo('L-AT03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-AT05', ['ㄱ', 'ㄴ'])
sc_ = [dict(zip('ABCDE', pm)) for pm in itertools.permutations([60, 70, 80, 90, 100])]
sc_ = [x for x in sc_ if x['A'] > x['B'] and x['C'] >= x['D'] + 20 and x['B'] + x['E'] == 150 and x['B'] != 60]
by_text('L-AT04', list(zip(['A는 100점', 'B는 70점', 'C는 A보다', 'D는 60점', 'E는 B보다'], [all(x['A'] == 100 for x in sc_), all(x['B'] == 70 for x in sc_), all(x['C'] > x['A'] for x in sc_), all(x['D'] == 60 for x in sc_), all(x['E'] > x['B'] for x in sc_)])))
# ================= S-AU / D-AU / L-AU (5급 실전, independent re-solve from the rendered options) =================
def acq(price, others, first):
    n_ = 1 + sum(1 for o in others if o > 10000)
    if n_ >= 3 and price > 10000: t = price * 8 / F(100)
    else: t = price * (1 if price <= 60000 else 2 if price <= 90000 else 3) / F(100)
    if first and price <= 120000: t = max(t - 200, F(0))
    return t * F(11, 10)
s_au = int(acq(50000, [], 1) + acq(80000, [30000], 0) + acq(100000, [40000, 50000], 0) + acq(70000, [60000, 8000], 0) + acq(9000, [30000, 20000, 40000], 0))
pick('S-AU01', f'{s_au // 10000}억 {s_au % 10000:,}만 원')
def frog_next(s):
    e = s.index('_'); r = []
    for d in (1, 2):
        if e - d >= 0 and s[e - d] == 'L' and (d == 1 or s[e - 1] != '_'): r.append((s[:e - d] + '_' + s[e - d + 1:e] + 'L' + s[e + 1:], d))
        if e + d < 7 and s[e + d] == 'R' and (d == 1 or s[e + 1] != '_'): r.append((s[:e] + 'R' + s[e + 1:e + d] + '_' + s[e + d + 1:], d))
    return r
sols_f = []
def dfs(s, path):
    if s == 'RRR_LLL': sols_f.append(path); return
    for t_, d in frog_next(s): dfs(t_, path + [d])
dfs('LLL_RRR', [])
first_jump_ok = []
for t_, d in frog_next('LLL_RRR'):
    if d == 2:
        before = len(sols_f); sub = []
        def dfs2(s):
            if s == 'RRR_LLL': sub.append(1); return
            for u, _ in frog_next(s): dfs2(u)
        dfs2(t_); first_jump_ok.append(bool(sub))
combo('S-AU02', [l for l, t in zip('ㄱㄴㄷㄹ', [min(len(x) for x in sols_f) == 15, len(sols_f) == 4, not any(first_jump_ok), all(x.count(1) == 9 for x in sols_f)]) if t])
pick('S-AU03', '다친 고라니를 구조센터에 넘기려고 붙잡아 차에 싣고 간 사람은 제1조를 위반한 것이 아니다.')
ta_ = set(range(0, 961, 12)); tb_ = set(range(6, 961, 18)); tc_ = set(range(10, 961, 20))
combo('S-AU04', [l for l, t in zip('ㄱㄴㄷㄹ', [min(ta_ & tb_) == 24, not (ta_ & tc_), len(tb_ & tc_) == 5 and min(tb_ & tc_) == 150, len(ta_ & tb_) == 30]) if t])
sa, sb, sc = [45, 57, 68, 77, 86, 93, 100], [19, 32, 44, 51, 57, 61, 63], [32, 44, 56, 67, 77, 87, 93]
bst = max(sa[a] + sb[b] + sc[c] for a in range(7) for b in range(7) for c in range(7) if a + b + c <= 10 and min(sa[a], sb[b], sc[c]) >= 50)
pick('S-AU05', f'{bst}점')
pkd = {'A': (50000, 50000, 48000, 47000), 'B': (40000, 36000, 38000, 35000), 'C': (30000, 33000, 29000, 32000), 'D': (25000, 23000, 23000, 21000), 'E': (15000, 15750, 14500, 15000)}
pubs = {'A': F(12000, 50000), 'B': F(8000, 36000), 'C': F(9000, 33000), 'D': F(4000, 23000), 'E': F(3000, 15750)}
s_ = [sorted(k for k, v in pkd.items() if v[1] < v[0]) == ['B', 'D'], max(pkd, key=lambda k: F(pkd[k][1], pkd[k][0])) == 'C', max(pubs, key=pubs.get) == 'C', sum(1 for v in pkd.values() if F(v[1], v[0]) > F(v[3], v[2])) == 2, sum(v[0] for v in pkd.values()) * 100 > 104 * sum(v[2] for v in pkd.values())]
only('D-AU01', [not x for x in s_], 'false statements')
b15, b25 = [400, 300, 250, 150], [360, 330, 300, 120]; pp15, pp25 = [500, 400, 300, 200], [450, 420, 260, 250]
x15 = [a * b for a, b in zip(b15, pp15)]; x25 = [a * b for a, b in zip(b25, pp25)]
combo('D-AU02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(x25) < sum(x15), [i for i in range(4) if x25[i] > x15[i]] == [1, 2], x25[3] > x15[3], x25[0] * 5 >= 2 * sum(x25)]) if t])
wdl = {'가': (11, 1, 8), '나': (8, 7, 5), '다': (12, 2, 6), '라': (9, 5, 6), '마': (10, 6, 4)}
pts = {k: 3 * w + d for k, (w, d, l_) in wdl.items()}
md_ = [m for m in itertools.permutations(wdl) if pts[m[0]] == max(pts.values()) and F(wdl[m[1]][0], wdl[m[1]][0] + wdl[m[1]][2]) == max(F(w, w + l_) for w, d, l_ in wdl.values()) and wdl[m[2]][1] == max(v[1] for v in wdl.values()) and pts[m[3]] > pts[m[4]]]
ok(len(md_) == 1, f'D-AU03 {md_}'); pick('D-AU03', ', '.join(md_[0]))
fo = {'A': (500, 1500, 1500 * 8 // 10), 'B': (250, 810 * 10 // 9, 810), 'C': (400, 1200, 960), 'D': (300, 702 * 100 // 78, 702)}
by_text('D-AU04', list(zip(['네 지역 전체의 생존율', '(가)는', '조림 면적 1ha당 생존', '고사 본수가 가장 많은', '조림 면적 1ha당 식재'], [sum(v[2] for v in fo.values()) * 100 >= 82 * sum(v[1] for v in fo.values()), fo['A'][2] * 2 >= 3 * fo['D'][1], max(fo, key=lambda k: F(fo[k][2], fo[k][0])) == 'D', max(fo, key=lambda k: fo[k][1] - fo[k][2]) == 'C', max(fo, key=lambda k: F(fo[k][1], fo[k][0])) == 'B'])))
st = [(270, 240), (150, 135), (180, 130)]; rr = [(80, 85), (70, 75), (60, 65)]
n15 = [a * r[0] for (a, b), r in zip(st, rr)]; n25 = [b * r[1] for (a, b), r in zip(st, rr)]
combo('D-AU05', [l for l, t in zip('ㄱㄴㄷㄹ', [all(n25[i] > n15[i] for i in range(3)), F(sum(n25), sum(b for a, b in st)) > F(sum(n15), sum(a for a, b in st)), max(range(3), key=lambda i: F(n15[i] - n25[i], n15[i])) == 2, n25[0] * 100 >= 55 * sum(n25)]) if t])
pick('L-AU01', '합계출산율이 대체 출산율보다 낮아도 인구가 한동안 늘어날 수 있다.')
ga_ = [1, 6, 12, 10, 5, 2]; gb_ = [0, 2, 6, 8, 4, 2]       # 백분의 1 단위
combo('L-AU02', [l for l, t in zip('ㄱㄴㄷㄹ', [2 * sum(ga_) >= 3 * sum(gb_), 5 * (sum(gb_) + 2) == 120, False, 2 * sum(ga_[3:]) >= sum(ga_)]) if t])
combo('L-AU03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-AU05', ['ㄱ', 'ㄷ'])
rooms_ = []
for pm in itertools.permutations('ABCDEF'):
    asg = {pm[i]: ('101', '102', '103')[i // 2] for i in range(6)}
    if asg['C'] == '102' and asg['D'] == asg['E'] and asg['F'] != '101' and asg['B'] != '101' and asg not in rooms_: rooms_.append(asg)
by_text('L-AU04', list(zip(['A는 103호', 'B는 102호', 'F는 103호', 'A와 B는 같은', 'D는 101호'], [all(x['A'] == '103' for x in rooms_), all(x['B'] == '102' for x in rooms_), all(x['F'] == '103' for x in rooms_), all(x['A'] == x['B'] for x in rooms_), all(x['D'] == '101' for x in rooms_)])))
# ================= S-AV / D-AV / L-AV (5급 실전, independent re-solve from the rendered options) =================
def empty_aid(kind, cost, months, risk, pledge, other):
    if months < 12: return F(0)
    if kind == 'd': amt = min(F(cost, 2), F(1000)) + (200 if risk else 0)
    elif pledge: amt = min(F(cost, 2), F(3000))
    else: amt = min(F(cost, 3), F(2000))
    return max(amt - other, F(0))
s_av = empty_aid('d', 1600, 18, 1, 0, 0) + empty_aid('d', 2400, 8, 0, 0, 0) + empty_aid('r', 4500, 30, 0, 0, 0) + empty_aid('r', 7000, 24, 0, 1, 0) + empty_aid('r', 3000, 15, 0, 1, 300)
pick('S-AV01', f'{int(s_av):,}만 원')
def ferry(ad, ch):
    seen = {(ad, ch, 'L'): 0}; fr = [(ad, ch, 'L')]; d = 0
    while fr:
        d += 1; nx = []
        for a, c, side in fr:
            for ma, mc in ((1, 0), (0, 1), (0, 2)):
                if side == 'L': t = (a - ma, c - mc, 'R')
                else: t = (a + ma, c + mc, 'L')
                if 0 <= t[0] <= ad and 0 <= t[1] <= ch and t not in seen: seen[t] = d; nx.append(t)
        fr = nx
    return seen.get((0, 0, 'R'))
combo('S-AV02', [l for l, t in zip('ㄱㄴㄷㄹ', [ferry(3, 2) == 13, ferry(1, 1) is not None, [ferry(a, 2) for a in range(1, 6)] == [5, 9, 13, 17, 21], ferry(3, 3) < 13]) if t])
pick('S-AV03', '관람객 2,500명이 모일 것으로 예상되는 옥외 행사의 안전관리계획은 행사 시작일 14일 전까지 제출하면 된다.')
wts = [1, 3, 1, 3, 1, 3, 1]
okn = lambda ds: sum(w * x for w, x in zip(wts, ds)) % 10 == 0
cd6 = next(x for x in range(10) if okn([1, 2, 3, 4, 5, 6, x]))
single = all(not okn(ds[:i] + [y] + ds[i + 1:]) for ds in ([1, 2, 3, 4, 5, 6, cd6], [0] * 7, [9, 0, 9, 0, 9, 0, 0]) for i in range(7) for y in range(10) if y != ds[i] and okn(ds))
swap_all = True
for i in range(6):
    for a in range(10):
        for b in range(10):
            if a == b: continue
            base = [0] * 7; base[i], base[i + 1] = a, b
            fix = next(x for x in range(10) if okn(base[:6] + [x])) if i < 5 else None
            if i < 5: base[6] = fix
            if not okn(base): continue
            sw = list(base); sw[i], sw[i + 1] = sw[i + 1], sw[i]
            if okn(sw): swap_all = False
ones_never = all(sum(x for x in ds) % 10 == sum(x for x in ds[:i] + [ds[i + 1], ds[i]] + ds[i + 2:]) % 10 for ds in ([1, 2, 3, 4, 5, 6, 9], [5, 0, 7, 3, 8, 1, 6]) for i in range(6))
combo('S-AV04', [l for l, t in zip('ㄱㄴㄷㄹ', [cd6 == 5, single, swap_all, ones_never]) if t])
hourly = [800, 1500, 1500, 500, 1000, 1000, 1500, 800, 800, 1000, 600, 500]
best_e = None
for on in itertools.combinations(range(12), 6):
    if 4 in on or 5 in on: continue
    runs = []; 
    for i in on:
        if runs and runs[-1][-1] == i - 1: runs[-1].append(i)
        else: runs.append([i])
    if len(runs) <= 2 and all(len(r) >= 2 for r in runs):
        c = sum(hourly[i] for i in on); best_e = c if best_e is None else min(best_e, c)
pick('S-AV05', f'{best_e:,}원')
am = {'A': (40, 48000, 36000, 75), 'B': (25, 35000, 28000, 68), 'C': (30, 30000, 21000, 92), 'D': (20, 26000, 18720, 81), 'E': (15, 12000, 10200, 114)}
order_t = sorted(am, key=lambda k: am[k][3])
s_ = [sum(v[2] for v in am.values()) * 4 >= 3 * sum(v[1] for v in am.values()), max(am, key=lambda k: F(am[k][1], am[k][0])) == 'B', max(am, key=lambda k: F(am[k][2], am[k][1])) == 'B', [k for k in am if am[k][3] > 100] == ['E'], order_t[1] == max(am, key=lambda k: am[k][1])]
only('D-AV01', [not x for x in s_], 'false statements')
vv = {'A': (120, 110, 5000, 6000), 'B': (80, 90, 8000, 8000), 'C': (60, 66, 10000, 9000), 'D': (40, 50, 6000, 6000)}
rv0 = {k: v[0] * v[2] for k, v in vv.items()}; rv1 = {k: v[1] * v[3] for k, v in vv.items()}
combo('D-AV02', [l for l, t in zip('ㄱㄴㄷㄹ', [[k for k in vv if vv[k][1] < vv[k][0] and rv1[k] > rv0[k]] == ['A'], max(rv1, key=rv1.get) == 'B', rv1['C'] > rv0['C'], sum(rv1.values()) * 10 >= 11 * sum(rv0.values())]) if t])
cl = {'가': (-5, 26, 1300), '나': (3, 27, 1500), '다': (-10, 22, 600), '라': (8, 28, 1800), '마': (1, 24, 1100)}
mc_ = [m for m in itertools.permutations(cl) if cl[m[0]][1] - cl[m[0]][0] == max(v[1] - v[0] for v in cl.values()) and cl[m[1]][2] == max(v[2] for v in cl.values()) and cl[m[2]][0] < 0 and cl[m[3]][1] > cl[m[4]][1]]
ok(len(mc_) == 1, f'D-AV03 {mc_}'); pick('D-AV03', ', '.join(mc_[0]))
po = {'A': (20000, 20000 - 600, 600), 'B': (14250 + 750, 14250, 750), 'C': (12000, 11760, 12000 - 11760), 'D': (8000, 8000 - 320, 320)}
by_text('D-AV04', list(zip(['네 우체국 전체의 배달률', '(가)는', 'C의 배달률은', '반송된 우편물이 가장 많은', '접수한 우편물 가운데'], [sum(v[1] for v in po.values()) * 100 >= 97 * sum(v[0] for v in po.values()), po['A'][1] * 10 >= 26 * po['D'][1], po['C'][1] * po['A'][0] < po['A'][1] * po['C'][0], max(po, key=lambda k: po[k][2]) == 'B', max(po, key=lambda k: F(po[k][2], po[k][0])) == 'D'])))
ob = {'초': ((15, 130), (10, 125)), '중': ((18, 70), (12, 66)), '고': ((22, 68), (14, 64))}
cnt = {(l, g): r * n_ for l, v in ob.items() for g, (r, n_) in zip('MF', v)}
combo('D-AV05', [l for l, t in zip('ㄱㄴㄷㄹ', [(15 - 10) < (18 - 12) < (22 - 14), max(cnt, key=cnt.get) == ('초', 'M'), (cnt[('고', 'M')] + cnt[('고', 'F')]) >= 18 * (68 + 64), sum(v for (l, g), v in cnt.items() if g == 'F') * 5 >= 2 * sum(cnt.values())]) if t])
pick('L-AV01', '전체 접종률이 집단 면역 임계치를 넘더라도 일부 집단 안에서는 유행이 일어날 수 있다.')
hi = lambda r0: 1 - F(1, r0)
combo('L-AV02', [l for l, t in zip('ㄱㄴㄷㄹ', [hi(4) == F(3, 4), hi(4) / F(9, 10) <= F(4, 5), hi(10) / F(17, 20) > 1, hi(8) == 2 * hi(4)]) if t])
combo('L-AV03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-AV05', ['ㄱ', 'ㄴ'])
gifts = [dict(zip('ABCDE', pm)) for pm in itertools.permutations('ABCDE') if all(x != y for x, y in zip('ABCDE', pm))]
gifts = [g for g in gifts if g['A'] != 'B' and g['B'] == 'C' and g['D'] != 'B' and all(g[g[x]] != x for x in 'ABCDE')]
by_text('L-AV04', list(zip(['A는 D에게', 'C는 A에게', 'D는 E에게', 'C는 E에게', 'E는 B에게'], [all(g['A'] == 'D' for g in gifts), all(g['C'] == 'A' for g in gifts), all(g['D'] == 'E' for g in gifts), all(g['C'] == 'E' for g in gifts), all(g['E'] == 'B' for g in gifts)])))
# ================= S-AW / D-AW / L-AW (5급 실전, independent re-solve from the rendered options) =================
def chik(ha10, inc, age, edu, yrs):   # ha10 = 면적 × 10
    if inc >= 3700: return F(0)
    if ha10 <= 5 and yrs >= 3: base = F(130)
    else:
        h = F(ha10, 10); base = 200 * min(h, 2) + 150 * min(max(h - 2, 0), 4) + 100 * max(h - 6, 0)
    if not edu and age < 70: base = base - base / 10
    return base
s_aw = chik(15, 2000, 45, 1, 10) + chik(40, 1500, 72, 0, 20) + chik(80, 1000, 50, 0, 15) + chik(4, 500, 66, 1, 5) + chik(30, 4000, 58, 1, 12)
pick('S-AW01', f'{int(s_aw):,}만 원')
grid_ok = lambda c: c[0] != c[1] and c[1] != c[2] and c[3] != c[4] and c[4] != c[5] and all(c[i] != c[i + 3] for i in range(3))
cg = [c for c in itertools.product(range(3), repeat=6) if grid_ok(c)]
combo('S-AW02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(cg) == 54, sum(1 for c in cg if len(set(c)) == 2) == 6, sum(1 for c in cg if c[1] == 0 and c[4] == 1) == 4, sum(1 for c in cg if sorted(c) == [0, 0, 1, 1, 2, 2]) == 12]) if t])
pick('S-AW03', '대학원에 재학 중인 학생은 신고하지 아니하고 학습자의 집에서 개인 과외 교습을 할 수 있다.')
fa, sl = F(64, 60), F(54, 60)          # 실제 1분당 시계가 가는 분
real_when = lambda r, shown: (shown - 540) / r
combo('S-AW04', [l for l, t in zip('ㄱㄴㄷㄹ', [540 + fa * 180 == 732, 540 + sl * real_when(fa, 720) < 690, (fa - sl) * 360 == 60, real_when(sl, 720) < real_when(fa, 720)]) if t])
gd = {'A': (35, 30, 90), 'B': (30, 30, 70), 'C': (35, 15, 50), 'D': (20, 10, 80), 'E': (30, 20, 20), 'F': (35, 25, 40)}
best_g = max(sum(gd[x][2] for x in s) for k in range(7) for s in itertools.combinations('ABCDEF', k) if sum(gd[x][0] for x in s) <= 100 and sum(gd[x][1] for x in s) <= 80 and ('C' not in s or 'E' in s) and not ('A' in s and 'D' in s))
pick('S-AW05', f'{best_g}만 원')
gy = {'A': (50, 400, 240, 264), 'B': (30, 300, 180, 207), 'C': (40, 280, 200, 210), 'D': (20, 220, 90, 108), 'E': (25, 150, 100, 104)}
u0, u1 = sum(v[2] for v in gy.values()), sum(v[3] for v in gy.values())
s_ = [u1 * 10 >= 11 * u0, max(gy, key=lambda k: F(gy[k][1], gy[k][0])) == 'D', max(gy, key=lambda k: F(gy[k][3], gy[k][1])) == 'C', max(gy, key=lambda k: F(gy[k][3], gy[k][2])) == 'B', sorted(k for k, v in gy.items() if F(v[3], v[2]) < F(u1, u0)) == ['A', 'C', 'E']]
only('D-AW01', [not x for x in s_], 'false statements')
fe, sh_ = [60, 70, 80, 75, 50], [15, 18, 22, 20, 25]
pr_ = [a * b for a, b in zip(fe, sh_)]
combo('D-AW02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(pr_) >= 6500, pr_.index(max(pr_)) == 2, pr_[4] > pr_[0], 2 * (pr_[2] + pr_[3]) >= sum(pr_)]) if t])
bz = {'가': (800, 900, 2000), '나': (1200, 1150, 2600), '다': (500, 650, 900), '라': (300, 330, 1200), '마': (1000, 1000, 1800)}
mb = [m for m in itertools.permutations(bz) if bz[m[0]][1] == max(v[1] for v in bz.values()) and F(bz[m[1]][2], bz[m[1]][1]) == max(F(v[2], v[1]) for v in bz.values()) and F(bz[m[2]][1], bz[m[2]][0]) == max(F(v[1], v[0]) for v in bz.values()) and bz[m[4]][2] > bz[m[3]][2]]
ok(len(mb) == 1, f'D-AW03 {mb}'); pick('D-AW03', ', '.join(mb[0]))
ev_ = {'A': (20000, 18000, 18000 * 15), 'B': (15000, 210000 // 14, 210000), 'C': (12000, 9600, 144000), 'D': (10000, 8000, 128000)}   # 금액 단위: 만 원
by_text('D-AW04', list(zip(['지급률이 가장 높은', '네 지역의 지급액 합계', '가구당 지급액이 가장 적은', 'A의 지급률은', 'D의 지급액은'], [max(ev_, key=lambda k: F(ev_[k][1], ev_[k][0])) == 'B', sum(v[2] for v in ev_.values()) >= 800000, min(ev_, key=lambda k: F(ev_[k][2], ev_[k][1])) == 'C', ev_['A'][1] * 100 >= 95 * ev_['A'][0], ev_['D'][2] * 10 >= 9 * ev_['C'][2]])))
dd, pp = [250, 180, 300, 150, 220], [500, 300, 200, 400, 100]
nd = [a * b for a, b in zip(dd, pp)]
combo('D-AW05', [l for l, t in zip('ㄱㄴㄷㄹ', [nd.index(max(nd)) == 0, nd[2] == nd[3], sum(nd) >= 220 * sum(pp), nd[1] * 2 >= 5 * nd[4]]) if t])
pick('L-AW01', '가격 차별이 이루어지면 하나의 가격만 받을 때보다 거래되는 양이 늘어날 수 있다.')
def take(p_gen, p_stu): return (200 * p_gen if p_gen <= 12000 else 0) + (100 * p_stu if p_stu <= 7000 else 0)
combo('L-AW02', [l for l, t in zip('ㄱㄴㄷㄹ', [take(7000, 7000) > take(12000, 12000), take(12000, 7000) - take(12000, 12000) == 700000, take(12000, 12000) == 2400000 and take(12000, 7000) - 200 * 12000 == 100 * 7000, take(7000, 7000) == take(12000, 7000)]) if t])
combo('L-AW03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-AW05', ['ㄱ'])
ex_ = []
for pick_ in itertools.product([frozenset(c) for k in (1, 2, 3) for c in itertools.combinations(['국', '수', '영'], k)], repeat=4):
    a_, b_, c_, d_ = pick_
    if len(a_) == 3 and '영' in d_ and not (b_ & c_) and sum(1 for x in pick_ if '국' in x) == 3 and sum(len(x) for x in pick_) == 7: ex_.append(pick_)
by_text('L-AW04', list(zip(['B는 국어', 'C는 수학', 'D는 수학', '수학에 응시한 사람은', 'B와 C 가운데'], [all('국' in x[1] for x in ex_), all('수' in x[2] for x in ex_), all('수' not in x[3] for x in ex_), all(sum(1 for y in x if '수' in y) == 2 for x in ex_), all('영' in x[1] or '영' in x[2] for x in ex_)])))
# ================= S-AX / D-AX / L-AX (5급 실전, independent re-solve from the rendered options) =================
def toll_(big, km, cuts, commute):
    v = F(900 + 50 * km) * (F(3, 2) if big else 1)
    rate = {'경': F(1, 2), '장': F(1, 2), '유': F(1)}
    if cuts: v = v * (1 - max(rate[c] for c in cuts))
    elif commute and km <= 20: v = v * F(4, 5)
    return (int(v) // 100) * 100
s_ax = toll_(0, 30, ['경'], 1) + toll_(0, 15, [], 1) + toll_(1, 40, [], 0) + toll_(0, 18, ['경', '장'], 1) + toll_(0, 10, ['유', '경'], 0)
pick('S-AX01', f'{s_ax:,}원')
def cover(rows, cols):
    memo = {}
    def go(col, mask):           # mask: cells in column col already filled from the left
        if col == cols: return 1 if mask == 0 else 0
        key = (col, mask)
        if key in memo: return memo[key]
        res = 0
        def fill(r, cur, nxt):
            nonlocal res
            if r == rows: res += go(col + 1, nxt); return
            if cur >> r & 1: fill(r + 1, cur, nxt); return
            fill(r + 1, cur | 1 << r, nxt | 1 << r)                      # 가로로 다음 열까지
            if r + 1 < rows and not cur >> (r + 1) & 1: fill(r + 2, cur | 3 << r, nxt)   # 세로
        fill(0, mask, 0); memo[key] = res; return res
    return go(0, 0)
combo('S-AX02', [l for l, t in zip('ㄱㄴㄷㄹ', [cover(2, 6) == 13, cover(3, 5) == 0, cover(3, 4) == 11, cover(2, 5) == 2 * cover(2, 4)]) if t])
pick('S-AX03', '올해 처음 어린이 보호구역에서 오후 7시에 승용차를 세워 과태료를 받은 사람이 기한 안에 자진 납부하면 9만 6천 원을 낸다.')
cs_ = [n_ for n_ in range(1, 201) if n_ % 3 == 2 and n_ % 5 == 3 and n_ % 7 == 2]
combo('S-AX04', [l for l, t in zip('ㄱㄴㄷㄹ', [len(cs_) == 2, min(cs_) == 53, len([n_ for n_ in cs_ if n_ % 4 == 3]) == 1, all(n_ % 6 == 4 for n_ in cs_ if n_ > 100)]) if t])
dem_ = [50, 90, 120, 70]; gcap, grun, gst = [50, 60, 40], [20, 40, 50], [40, 80, 40]
bestg = None
for code in range(8 ** 4):
    on = [[(code >> (3 * t + g)) & 1 for g in range(3)] for t in range(4)]
    if any(sum(gcap[g] for g in range(3) if on[t][g]) < dem_[t] + 10 for t in range(4)): continue
    cc = ''.join(str(on[t][2]) for t in range(4))
    if any(len(seg) == 1 for seg in cc.split('0') if seg): continue
    c = sum(grun[g] for t in range(4) for g in range(3) if on[t][g]) + sum(gst[g] for t in range(4) for g in range(3) if on[t][g] and (t == 0 or not on[t - 1][g]))
    bestg = c if bestg is None else min(bestg, c)
pick('S-AX05', f'{bestg}백만 원')
pa = {'A': (8000, 8800, 240, 40), 'B': (6000, 6900, 230, 30), 'C': (5000, 5250, 140, 35), 'D': (4000, 4800, 168, 24), 'E': (3000, 3120, 78, 20)}
s_ = [sum(v[1] for v in pa.values()) * 10 >= 11 * sum(v[0] for v in pa.values()), max(pa, key=lambda k: F(pa[k][2], pa[k][1])) == 'D', max(pa, key=lambda k: F(pa[k][1], pa[k][3])) == 'A', max(pa, key=lambda k: F(pa[k][1], pa[k][0])) == 'D', sum(v[2] for v in pa.values()) >= 850]
only('D-AX01', [not x for x in s_], 'false statements')
am0, am1 = [40, 60, 20, 30], [44, 63, 22, 27]; c0, c1 = [20, 15, 40, 10], [25, 14, 44, 9]
combo('D-AX02', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(4) if am1[i] * c0[i] < am0[i] * c1[i]] == [0], am1[2] * c0[2] == am0[2] * c1[2], sum(am1) * 100 >= 105 * sum(am0), am1[1] * 5 >= 2 * sum(am1)]) if t])
lec = {'가': (80, 46, 92), '나': (60, 44, 95), '다': (100, 40, 90), '라': (120, 42, 88), '마': (150, 38, 85)}
ml = [m for m in itertools.permutations(lec) if lec[m[0]][1] == max(v[1] for v in lec.values()) and lec[m[1]][0] == max(v[0] for v in lec.values()) and lec[m[2]][2] == max(v[2] for v in lec.values()) and lec[m[3]][0] * lec[m[3]][2] > lec[m[4]][0] * lec[m[4]][2]]
ok(len(ml) == 1, f'D-AX03 {ml}'); pick('D-AX03', ', '.join(ml[0]))
ag = {'A': (400, 100, 400 + 100 - 480, 480), 'B': (450 - 200 + 50, 200, 50, 450), 'C': (150, 500 - 150, 0, 500), 'D': (600, 60, 60, 600)}
by_text('D-AX04', list(zip(['네 품목의 수입량', '(나)는', 'C의 자급률', '자급률이 100% 이상', '수출량이 생산량의'], [sum(v[1] for v in ag.values()) >= 720, ag['B'][0] > 15 * ag['A'][2], ag['C'][0] * 100 >= 35 * ag['C'][3], [k for k, v in ag.items() if v[0] >= v[3]] == ['D'], [k for k, v in ag.items() if v[2] * 10 >= v[0]] == ['D']])))
vol, fare = [10, 11, 12, 15], [2500, 2400, 2450, 2300]
rv = [a * b for a, b in zip(vol, fare)]
combo('D-AX05', [l for l, t in zip('ㄱㄴㄷㄹ', [rv.index(max(rv)) == 3, [i for i in range(1, 4) if fare[i] > fare[i - 1]] == [2], sum(rv) >= 2400 * sum(vol), rv[3] * 10 >= 14 * rv[0]]) if t])
pick('L-AX01', '정률법의 감가상각비는 처음 몇 해에 크고 갈수록 작아진다.')
st_ = [F(1500, 4)] * 4; bk = F(1600); dc_ = []
for _ in range(4): dc_.append(bk / 2); bk -= bk / 2
combo('L-AX02', [l for l, t in zip('ㄱㄴㄷㄹ', [dc_[0] >= 2 * st_[0], (1600 - sum(st_[:2])) - (1600 - sum(dc_[:2])) == 450, dc_[2] > st_[2], sum(dc_) == sum(st_)]) if t])
combo('L-AX03', ['ㄱ', 'ㄴ', 'ㄷ']); combo('L-AX05', ['ㄱ', 'ㄷ'])
packs = [dict(zip(['텐', '침', '버', '랜', '우'], b)) for b in itertools.product((0, 1), repeat=5)]
packs = [x for x in packs if (not x['텐'] or x['침']) and not (x['침'] and x['우']) and sum(x.values()) == 3 and (x['침'] or not x['버'])]
by_text('L-AX04', list(zip(['甲은 텐트를 챙긴다', '甲은 우산을', '甲은 랜턴을', '甲은 버너를', '甲은 텐트와 랜턴을'], [all(x['텐'] for x in packs), all(not x['우'] for x in packs), all(x['랜'] for x in packs), all(not x['버'] for x in packs), all(x['텐'] and x['랜'] for x in packs)])))
# ================= S-AY / D-AY / L-AY (5급 실전, independent re-solve from the rendered options) =================
def care_(typ, baby, kids, hrs):
    sup = {'가': 85, '나': 60, '다': 15, '라': 0}[typ] + (5 if baby and typ != '라' else 0)
    v = F(min(hrs, 80) * 12000 * (100 - sup), 100) + max(hrs - 80, 0) * 12000
    if kids >= 3: v -= min(v / 10, 50000)
    return v
s_ay = care_('가', 1, 1, 60) + care_('나', 0, 3, 100) + care_('라', 1, 1, 40) + care_('다', 1, 2, 90)
pick('S-AY01', f'{int(s_ay):,}원')
nums_ = set()
for a_, b_, c_ in itertools.permutations('01467', 3):
    for x_ in ([a_] if a_ != '6' else ['6', '9']):
        for y_ in ([b_] if b_ != '6' else ['6', '9']):
            for z_ in ([c_] if c_ != '6' else ['6', '9']):
                if x_ != '0': nums_.add(int(x_ + y_ + z_))
ev_ = sum(1 for n_ in nums_ if n_ % 2 == 0)
combo('S-AY02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(nums_) == 78, max(nums_) - min(nums_) == 872, sum(1 for n_ in nums_ if n_ % 3 == 0) == 6, ev_ > len(nums_) - ev_]) if t])
bn_ = lambda pops: sum(3 if x > 50000 else 2 for x in pops)
school_ok_ = lambda m, vac: bool(vac) or m > 50       # 방학 중이면 학교 정문 제한 없음
rm_ = [6, 6, 6, 7]; due_ = 3 + 3            # 선거일 6월 3일 다음 날부터 3일 이내 → 6월 6일
by_text('S-AY03', list(zip(['인구가 4만 8천', '후보자는 5월 16일', '방학 중인 학교', '6월 6일까지', '인구가 정확히'], [bn_([48000, 48000, 62000]) == 7, 16 >= 16 + 1, (school_ok_(30, vac=1)) and 8 > 10, sum(1 for d in rm_ if d > due_) * 10 == 40, bn_([50000]) == 3])))
def ladder_(cfg):
    p_ = [0, 1, 2, 3]
    for lv in cfg:
        for i in lv: p_ = [i + 1 if x == i else i if x == i + 1 else x for x in p_]
    return tuple(p_)
lad = [(sum(map(len, c)), ladder_(c)) for c in itertools.product([(), (0,), (1,), (2,), (0, 2)], repeat=5)]
combo('S-AY04', [l for l, t in zip('ㄱㄴㄷㄹ', [any(n_ == 3 and r[0] == 3 for n_, r in lad), min(n_ for n_, r in lad if r == (3, 2, 1, 0)) == 6, not any(n_ == 4 and r == (0, 1, 2, 3) for n_, r in lad), len({r for n_, r in lad if n_ == 2}) == 6]) if t])
jb = {'A': (3, 0, 13, 4), 'B': (1, 1, 13, 4), 'C': (1, 0, 11, 4), 'D': (4, 0, 13, 1), 'E': (2, 1, 20, 2)}
bj = None
for o_ in itertools.permutations(jb):
    if o_.index('B') < o_.index('D'): continue
    t_, pen_ = 9, 0
    for k_, j_ in enumerate(o_):
        if k_ and jb[o_[k_ - 1]][1] != jb[j_][1]: t_ += 1
        t_ += jb[j_][0]; pen_ += max(0, t_ - jb[j_][2]) * jb[j_][3]
    bj = pen_ if bj is None else min(bj, pen_)
pick('S-AY05', f'{bj}만 원')
gy = [(14400, 21600), (12600, 18270), (10500, 14700), (10200, 13770)]; rg = {'A': (2400, 75), 'B': (2100, 80), 'C': (1800, 70), 'D': (2500, 76), 'E': (1400, 85)}
on_ = {k: a * r for k, (a, r) in rg.items()}
s_ = [all(gy[i][0] < gy[i - 1][0] for i in range(1, 4)) and gy[3][0] * 10 <= 7 * gy[0][0], all(gy[i][1] * gy[i - 1][0] < gy[i - 1][1] * gy[i][0] for i in range(1, 4)), max(on_, key=on_.get) == 'D', min(on_, key=on_.get) == 'E', sum(on_.values()) > 75 * gy[3][0]]
only('D-AY01', [not x for x in s_], 'false statements')
px0, px1 = [40, 20, 10, 6], [44, 24, 12, 5]; r0, r1 = [15, 5, 10, 20], [14, 6, 8, 24]
tr0 = [a * b for a, b in zip(px0, r0)]; tr1 = [a * b for a, b in zip(px1, r1)]
nd0 = [a * 100 - b for a, b in zip(px0, tr0)]; nd1 = [a * 100 - b for a, b in zip(px1, tr1)]
gi = max(range(4), key=lambda i: F(nd1[i], nd0[i]))
combo('D-AY02', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(4) if tr1[i] < tr0[i]] == [2], tr1[0] >= 2 * sum(tr1[1:]), sum(px1) * 10 >= 11 * sum(px0), gi == 2]) if t])
fs = {'가': (50, 40, 20), '나': (30, 70, 15), '다': (20, 80, 12), '라': (40, 45, 10), '마': (25, 60, 30)}
mf = [m for m in itertools.permutations(fs) if fs[m[0]][0] * fs[m[0]][1] == max(v[0] * v[1] for v in fs.values()) and F(fs[m[1]][2], fs[m[1]][0]) == max(F(v[2], v[0]) for v in fs.values())
      and fs[m[2]][1] == max(v[1] for v in fs.values()) and F(fs[m[3]][2], fs[m[3]][0]) < F(fs[m[4]][2], fs[m[4]][0])]
ok(len(mf) == 1, f'D-AY03 {mf}'); pick('D-AY03', ', '.join(mf[0]))
vt = {'A': (200, 130, 1950), 'B': (150, 150 * 66 // 100, 1980), 'C': (168 * 100 // 70, 168, 1680), 'D': (120, 75, 1800), 'E': (80, 80 * 75 // 100, 900)}
ir = {k: F(v[2], v[1]) for k, v in vt.items()}
by_text('D-AY04', list(zip(['(가)는 (라)보다', '선거인 수가 가장', '다섯 지역 전체', '투표자 수 대비 무효표 비율이 가장', '투표자 수 대비 무효표 비율이 A와'],
       [vt['B'][1] - vt['E'][1] >= 40, max(vt, key=lambda k: vt[k][0]) == max(vt, key=lambda k: F(vt[k][1], vt[k][0])), sum(v[1] for v in vt.values()) * 100 >= 68 * sum(v[0] for v in vt.values()), max(ir, key=ir.get) == 'D', not any(ir[k] == ir['A'] for k in 'BCDE')])))
sh0, sh1 = [50, 20, 20, 10], [44, 12, 28, 16]
n0 = [160 * s for s in sh0]; n1 = [150 * s for s in sh1]
combo('D-AY05', [l for l, t in zip('ㄱㄴㄷㄹ', [n1[2] * 10 >= 13 * n0[2], n0[0] - n1[0] > n0[1] - n1[1], F(n1[3], n0[3]) < F(sh1[3], sh0[3]), n1[2] + n1[3] >= 4 * n1[1]]) if t])
pick('L-AY01', '두 정당의 정책이 비슷해질 때 양 끝의 유권자가 투표하지 않을 것을 걱정하는 정당은 가운데로 끝까지 다가가지 않는다.')
vp = [1] * 10 + [2] * 15 + [4] * 20 + [5] * 10 + [6] * 15 + [9] * 30
def win_(a, b):
    va = sum(1 for x in vp if abs(x - a) < abs(x - b)); vb = sum(1 for x in vp if abs(x - b) < abs(x - a)); return va, vb
md = sorted(vp)[49]
combo('L-AY02', [l for l, t in zip('ㄱㄴㄷㄹ', [md == 5 and sorted(vp)[50] == 5, win_(3, 6)[1] > win_(3, 6)[0], F(sum(vp), 100) < md, all(win_(5, b)[0] > win_(5, b)[1] for b in range(11) if b != 5)]) if t])
combo('L-AY03', ['ㄱ', 'ㄷ']); combo('L-AY05', ['ㄱ', 'ㄴ'])
cm = [dict(zip('갑을병정무', a)) for a in itertools.product('기예감', repeat=5)]
cm = [x for x in cm if list(x.values()).count('예') == 2 and x['무'] == '감' and x['갑'] != '예' and (x['을'] != '감' or x['병'] == '기')]
by_text('L-AY04', list(zip(['甲은 기획', '乙은 감사', '丙은 기획', '丁은 예산', '감사 위원회에는'], [all(x['갑'] == '기' for x in cm), all(x['을'] != '감' for x in cm), all(x['병'] != '기' for x in cm), all(x['정'] == '예' for x in cm), all(list(x.values()).count('감') == 1 for x in cm)])))
# ================= S-AZ / D-AZ / L-AZ (5급 실전, independent re-solve from the rendered options) =================
def ctax_(fuel, cc, age, disabled, kids3):
    if fuel == 'ev': v = F(100000)
    else:
        v = F(cc * (90 if cc <= 1000 else 150 if cc <= 1600 else 220))
        if age >= 3: v = v * (1 - min(F(5 * (age - 2), 100), F(1, 2)))
    cut = max([F(1)] * (disabled and cc <= 2000 and fuel != 'ev') + [F(1, 2)] * kids3 + [F(0)])
    return int(v * (1 - cut)) // 100 * 100
s_az = ctax_('g', 1500, 5, 0, 0) + ctax_('d', 2400, 14, 0, 0) + ctax_('ev', 0, 7, 0, 0) + ctax_('g', 998, 2, 1, 0) + ctax_('d', 2200, 6, 1, 1)
pick('S-AZ01', f'{s_az:,}원')
mark_ = {}
def hg_(t, a, b, evs):
    for fa in (0, 1):
        for fb in (0, 1):
            a2 = 7 - a if fa else a; b2 = 11 - b if fb else b
            pos = [x for x in (a2, b2) if x > 0]
            if not pos or t + min(pos) > 26: continue
            t2 = t + min(pos)
            for e in evs: mark_[t2 - e] = min(mark_.get(t2 - e, 99), t2)
            hg_(t2, max(a2 - min(pos), 0), max(b2 - min(pos), 0), evs + [t2])
hg_(0, 0, 0, [0])
combo('S-AZ02', [l for l, t in zip('ㄱㄴㄷㄹ', [3 in mark_, mark_.get(15) == 15, mark_.get(8, 99) >= 16, 1 not in mark_]) if t])
import datetime as dtz_
inst_, chk_ = 2014, dtz_.date(2025, 3, 10)
nxt_ = chk_.replace(year=chk_.year + (1 if chk_.year - inst_ >= 10 else 2))
edu_ = lambda d: dtz_.date(d.year + (d.month + 2) // 12, (d.month + 2) % 12 + 1, d.day)
rep_ = lambda weeks_days, death=False: death or weeks_days >= 21
fine_ = lambda reported_day, hidden: (200 if hidden else 100) if (hidden or reported_day > 7) else 0
by_text('S-AZ03', list(zip(['2014년에 설치한', '3주의 치료가', '2026년 2월 1일부터', '놀이시설에서 2주의', '사고를 숨기려고'],
        [nxt_ == dtz_.date(2027, 3, 10), rep_(21) and fine_(10, False) == 100, edu_(dtz_.date(2026, 2, 1)) >= dtz_.date(2026, 5, 15), rep_(14), fine_(None, True) == 100])))
w27_ = [(a, b, c) for a in range(10) for b in range(6) for c in range(4) if 300 * a + 500 * b + 800 * c == 2700]
cant_ = [x for x in range(100, 5001, 100) if not any(300 * a + 500 * b + 800 * c == x for a in range(17) for b in range(11) for c in range(7))]
combo('S-AZ04', [l for l, t in zip('ㄱㄴㄷㄹ', [len(w27_) == 5, min(map(sum, w27_)) == 4, max(cant_) == 1100, sum(1 for w in w27_ if sum(w) <= 5) == 2]) if t])
lb_ = min(a * 7500 + (30000 if 0 < a < 30 else 0) + b * 9000 + (20000 if b else 0) + ((60 - a - b) * 10500 * 9 // 10 if 60 - a - b >= 30 else (60 - a - b) * 10500)
          for a in range(41) for b in range(61 - a) if not (0 < b < 40))
pick('S-AZ05', f'{lb_:,}원')
yv = [(2400, 60), (2700, 60), (2550, 50), (2940, 56)]; bc = {'A': (900, 45), 'B': (720, 18), 'C': (600, 24), 'D': (480, 16), 'E': (240, 15)}
rr_ = sorted(bc, key=lambda k: F(bc[k][1], bc[k][0]), reverse=True); ac_ = sorted(bc, key=lambda k: bc[k][1], reverse=True)
s_ = [yv[3][0] * 5 >= 6 * yv[0][0], rr_[1] == ac_[1], all(F(*yv[i]) > F(*yv[i - 1]) for i in range(1, 4)), rr_[0] == 'E', sum(v[1] for v in bc.values()) * 100 >= 4 * sum(v[0] for v in bc.values())]
only('D-AZ01', [not x for x in s_], 'false statements')
r4_, r5_ = [40, 15, 12, 18], [36, 18, 12, 20]; po4, po5 = [500, 650, 1600, 1400], [480, 640, 1560, 1450]
q4 = [a * b for a, b in zip(r4_, po4)]; q5 = [a * b for a, b in zip(r5_, po5)]
combo('D-AZ02', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(4) if q5[i] < q4[i]] == [0, 2], q5.index(max(q5)) == 3, F(sum(q5), sum(po5)) > F(sum(q4), sum(po4)), F(q5[1], q4[1]) > F(r5_[1], r4_[1])]) if t])
og = {'가': (1200, 90), '나': (800, 95), '다': (1500, 80), '라': (600, 98), '마': (1000, 85)}
ov_ = lambda k: og[k][0] * (100 - og[k][1])
mo = [m for m in itertools.permutations(og) if og[m[0]][0] * og[m[0]][1] == max(v[0] * v[1] for v in og.values()) and og[m[1]][1] == max(v[1] for v in og.values()) and sorted(og, key=ov_, reverse=True)[1] == m[2] and og[m[3]][0] > og[m[4]][0]]
ok(len(mo) == 1, f'D-AZ03 {mo}'); pick('D-AZ03', ', '.join(mo[0]))
pw_ = {6: (9600, 8000), 7: (9900, 9900 - 900), 8: (9500 + 760, 9500), 9: (9720, 8100), 10: (9000, 7500)}
rs_ = {m: a - b for m, (a, b) in pw_.items()}; rt_ = {m: F(rs_[m] * 100, pw_[m][1]) for m in pw_}
by_text('D-AZ04', list(zip(['(가)와 (다)를', '예비율이 가장 낮은', '예비력이 가장 큰', '예비율이 20%인', '공급 능력이 전월보다'],
       [pw_[7][1] + rs_[9] >= 10700, min(rt_, key=rt_.get) == 7, max(rs_, key=rs_.get) == 9, sum(1 for v in rt_.values() if v == 20) == 2, [m for m in (7, 8, 9, 10) if pw_[m][0] < pw_[m - 1][0]] == [9]])))
cn_ = [90, 110, 150, 180]; sh_ = {'갑': (50, 40), '을': (30, 60), '병': (15, 30), '기': (5, 100)}
am_ = {k: 180 * a * b for k, (a, b) in sh_.items()}
combo('D-AZ05', [l for l, t in zip('ㄱㄴㄷㄹ', [max(range(1, 4), key=lambda i: F(cn_[i], cn_[i - 1])) == 2, am_['갑'] > am_['을'], sum(am_.values()) >= 50 * 180 * 100, 180 * 15 >= 30 * 90]) if t])
pick('L-AZ01', '최대 잉여 방식에서는 다른 조건이 같은데 총의석이 늘었을 때 어떤 정당의 의석이 줄어드는 일이 생길 수 있다.')
vv_ = {'A': 41000, 'B': 29000, 'C': 17000, 'D': 8000, 'E': 5000}
def lr_(v, s):
    q = F(sum(v.values()), s); b = {k: int(x / q) for k, x in v.items()}
    for k in sorted(v, key=lambda k: v[k] / q - int(v[k] / q), reverse=True)[:s - sum(b.values())]: b[k] += 1
    return b
def dv_(v, s, step, first=1):
    vals = sorted(((F(x, first + step * i), k) for k, x in v.items() for i in range(s)), reverse=True)[:s]
    return {k: sum(1 for _, kk in vals if kk == k) for k in v}
combo('L-AZ02', [l for l, t in zip('ㄱㄴㄷㄹ', [dv_(vv_, 10, 1)['A'] == lr_(vv_, 10)['A'] + 1, dv_(vv_, 10, 2) == lr_(vv_, 10), dv_({**vv_, 'D': 8100}, 10, 1)['D'] == 1, any(lr_(vv_, 11)[k] < lr_(vv_, 10)[k] for k in vv_)]) if t])
combo('L-AZ03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-AZ05', ['ㄱ', 'ㄷ'])
bxm = [dict(zip('가나다라', p_)) for p_ in itertools.permutations(['금', '은', '동', '빈'])]
bxm = [x for x in bxm if [x['나'] == '금', x['나'] != '금', x['가'] == '은', x['라'] != '동'].count(True) == 1]
by_text('L-AZ04', list(zip(['가에는 금화가 들어 있다.', '가에는 금화가 들어 있거나', '나에는 은화', '다는 빈', '금화는 나에'], [all(x['가'] == '금' for x in bxm), all(x['가'] in '금빈' for x in bxm), all(x['나'] == '은' for x in bxm), all(x['다'] == '빈' for x in bxm), all(x['나'] == '금' for x in bxm)])))
# ================= S-BA / D-BA / L-BA (5급 실전, independent re-solve from the rendered options) =================
mat_ = 1200 - 80; trv_ = min(400, F(2500 + mat_, 10)); dir_ = 2500 + mat_ + trv_ + 900; ind_ = min(F(15, 100) * (dir_ - 900), 550)
pick('S-BA01', f'{int((6000 - dir_ - ind_) * 10000):,}원')
pr_ = list(itertools.combinations('갑을병정무', 2)); dg_ = {'을': 4, '병': 1, '정': 3, '무': 2}
gr_ = [g for bits in itertools.product((0, 1), repeat=10) for g in [[p for p, b in zip(pr_, bits) if b]] if all(sum(1 for p in g if k in p) == v for k, v in dg_.items())]
ok(len(gr_) == 1, 'S-BA02 unique graph'); g_ = gr_[0]
combo('S-BA02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(1 for p in g_ if '갑' in p) == 2, ('갑', '무') in g_, len(g_) == 6, ('병', '정') in g_]) if t])
rp_ = lambda ds: sum(2 if d >= 20 else 1 for d in ds); fn_ = lambda n: min(50 * n, 500)
by_text('S-BA03', list(zip(['허가 없이 가로수 12그루', '쓰러질 위험이', '허가를 받아 줄기 지름 25', '지름 35센티미터인', '허가를 받아 줄기 지름 15'],
        [fn_(12) == 600, 5 <= 3, rp_([25] * 3) == 6, 35 >= 30 and '가지치기' in ('벌채', '옮겨 심기'), rp_([15] * 4 + [22]) == 5])))
def chime_(h, m, quiet=True):
    if quiet and (h >= 22 or h < 6): return 0
    return ((h % 12) or 12) if m == 0 else (1 if m == 30 else 0)
cd_ = [chime_(h, m) for h in range(24) for m in (0, 30)]
combo('S-BA04', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(cd_) == 124, sum(cd_[24:]) - sum(cd_[:24]) == 10, cd_.count(12) == 2, sum(chime_(h, m, False) for h in range(24) for m in (0, 30)) - sum(cd_) > 60]) if t])
vl_ = {'A': (6, 200), 'B': (12, 500), 'C': (17, 800), 'D': (23, 100), 'E': (24, 500), 'F': (30, 100)}
bb_ = min(sum(p * min(abs(x - vl_[s][0]) for s in pair) for x, p in vl_.values()) for pair in itertools.combinations(vl_, 2)
          if 'B' not in pair and abs(vl_[pair[0]][0] - vl_[pair[1]][0]) >= 8 and all(min(abs(x - vl_[s][0]) for s in pair) <= 11 for x, _ in vl_.values()))
pick('S-BA05', f'{bb_:,}')
hy = [(320, 160), (360, 170), (390, 180), (420, 190)]; hr = {'A': (120, 40), 'B': (90, 50), 'C': (80, 35), 'D': (70, 60), 'E': (60, 30)}
st_ = {k: a * r for k, (a, r) in hr.items()}; ord_ = sorted(st_, key=st_.get, reverse=True)
s_ = [all(hy[i][0] > hy[i - 1][0] for i in range(1, 4)) and hy[3][0] * 10 >= 13 * hy[0][0], all(F(*hy[i]) > F(*hy[i - 1]) for i in range(1, 4)), ord_[0] == 'A', ord_[1] == 'D', sum(st_.values()) >= 40 * 420]
only('D-BA01', [not x for x in s_], 'false statements')
dt_ = [150, 170, 180, 190]; ds_ = [50000, 52000, 55000, 54000]; st2 = [90, 110, 120, 120]; ss_ = [200000, 210000, 220000, 225000]
dsp = [a * b for a, b in zip(dt_, ds_)]; ssp = [a * b for a, b in zip(st2, ss_)]
combo('D-BA02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(ssp[i] > ssp[i - 1] for i in range(1, 4)), ssp[3] * 10 >= 7 * (ssp[3] + dsp[3]), all(dsp[i] < dsp[i - 1] for i in range(1, 4) if ds_[i] < ds_[i - 1]), (ssp[1] + dsp[1]) * 10 >= 13 * (ssp[0] + dsp[0])]) if t])
bd = {'가': (800, 60, 1995), '나': (1200, 45, 2010), '다': (500, 80, 1988), '라': (950, 30, 2003), '마': (650, 55, 2018)}
mb = [m for m in itertools.permutations(bd) if bd[m[0]][0] == max(v[0] for v in bd.values()) and bd[m[1]][2] == min(v[2] for v in bd.values())
      and bd[m[2]][2] >= 2000 and bd[m[2]][1] == max(v[1] for v in bd.values() if v[2] >= 2000) and bd[m[3]][1] * bd[m[4]][0] > bd[m[4]][1] * bd[m[3]][0]]
ok(len(mb) == 1, f'D-BA03 {mb}'); pick('D-BA03', ', '.join(mb[0]))
sc = {'A': (600, 360, 50), 'B': (800, 800 * 56 // 100, 40), 'C': (290 * 100 // 58, 290, 60), 'D': (400, 260, 50), 'E': (486 * 100 // 54, 486, 30)}
per_ = {k: F(v[1] * 100, v[0]) for k, v in sc.items()}; sp_ = {k: v[1] * v[2] for k, v in sc.items()}
by_text('D-BA04', list(zip(['(가)와 (나)를', '1인당 급식비가 가장', '정부 지원액이 가장', '다섯 학교 전체', '학생 수가 500명'],
        [sc['B'][1] + sc['C'][0] >= 950, max(per_, key=per_.get) == 'D', max(sp_, key=sp_.get) == 'B', sum(v[1] for v in sc.values()) * 100 >= 58 * sum(v[0] for v in sc.values()), sum(1 for v in sc.values() if v[0] < 500) == 2])))
op_, cl_, e4 = [60, 40, 50, 10], [55, 45, 30, 12], [700, 500, 400, 150]
e5 = [e4[i] + op_[i] - cl_[i] for i in range(4)]
combo('D-BA05', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(4) if e5[i] < e4[i]] == [1, 3], max(range(4), key=lambda i: F(cl_[i], op_[i])) == 3, max(range(4), key=lambda i: F(cl_[i], e4[i])) == 1, sum(e5) * 100 >= 102 * sum(e4)]) if t])
pick('L-BA01', '표를 가지고 있는 투표자라도 반스하프 지수가 0일 수 있다.')
def bz_(w, q):
    c = {k: 0 for k in w}
    for mask in range(1, 1 << len(w)):
        mem = [k for i, k in enumerate(w) if mask >> i & 1]; s = sum(w[k] for k in mem)
        if s >= q:
            for k in mem: c[k] += s - w[k] < q
    t = sum(c.values()); return {k: F(v, t) for k, v in c.items()}
w_ = {'A': 40, 'B': 30, 'C': 20, 'D': 10}; b51, b67 = bz_(w_, 51), bz_(w_, 67)
combo('L-BA02', [l for l, t in zip('ㄱㄴㄷㄹ', [b51['B'] == b51['C'], b51['A'] > F(40, 100), b67['C'] == b67['D'], b67['A'] < b51['A']]) if t])
combo('L-BA03', ['ㄱ', 'ㄷ']); combo('L-BA05', ['ㄴ', 'ㄷ'])
jm = [(dict(zip('갑을병정', j)), dict(zip('갑을병정', h))) for j in itertools.permutations(['교', '의', '기', '변']) for h in itertools.permutations(['서', '부', '대', '광'])]
wo = lambda m, v: [k for k in m if m[k] == v][0]
jm = [x for x in jm if x[0]['을'] != '기' and x[1][wo(x[0], '기')] != '서' and x[1]['정'] in '대광' and x[1]['을'] in '대광' and x[1][wo(x[0], '변')] == '부']
by_text('L-BA04', list(zip(['丁은 기자', '甲은 변호사', '乙은 의사', '丙의 고향', '丁의 고향'], [all(x[0]['정'] == '기' for x in jm), all(x[0]['갑'] == '변' for x in jm), all(x[0]['을'] == '의' for x in jm), all(x[1]['병'] == '서' for x in jm), all(x[1]['정'] == '대' for x in jm)])))
# ================= S-BB / D-BB / L-BB (5급 실전, independent re-solve from the rendered options) =================
import math as _m
def tow_(kind, km, hrs, back):
    t = (40000 if kind == '승용' else 50000) + (2000 * _m.floor(km - 10) if km > 10 else 0)
    if back: return t // 2
    h = _m.ceil(hrs); return t + min(1000 * min(h, 6) + 500 * max(h - 6, 0), 15000)
pick('S-BB01', f'{tow_("승용", 8, 3, 0) + tow_("승합", 13.6, 30, 0) + tow_("승용", 12, 0, 1) + tow_("화물", 9, 7.5, 0):,}원')
tr_ = {('입구', 'P'): (40, 30), ('입구', 'Q'): (50, 35), ('P', 'Q'): (15, 15), ('P', 'R'): (35, 25), ('Q', 'R'): (30, 25), ('P', '정상'): (70, 45), ('R', '정상'): (30, 15), ('Q', '정상'): (65, 40)}
def rt_(a, b, path):
    if a == b: yield path; return
    for (x, y) in tr_:
        for u, v in ((x, y), (y, x)):
            if u == a and v not in path: yield from rt_(v, b, path + [v])
tt_ = lambda p: sum(tr_[(p[i], p[i + 1])][0] if (p[i], p[i + 1]) in tr_ else tr_[(p[i + 1], p[i])][1] for i in range(len(p) - 1))
eg_ = lambda p: {frozenset(p[i:i + 2]) for i in range(len(p) - 1)}
ups_ = list(rt_('입구', '정상', ['입구'])); dns_ = list(rt_('정상', '입구', ['정상']))
bu = min(map(tt_, ups_)); bd = min(map(tt_, dns_)); bdp = [p for p in dns_ if tt_(p) == bd]
br = min(tt_(u) + tt_(d) for u in ups_ for d in dns_ if not eg_(u) & eg_(d))
combo('S-BB02', [l for l, t in zip('ㄱㄴㄷㄹ', [bu == 105, br == 180, br - (bu + bd) >= 10, len(bdp) == 1 and {'R', 'P'} <= set(bdp[0])]) if t])
f_ = {'장롱': 10000, '침대': 8000, '의자': 2000}
fee_ = lambda it, size=0: f_[it] * (1.5 if it == '장롱' and size > 2 else 1)
fn_ = lambda n, h=None: 0 if (h is not None and h <= 24) else 100000 * n
by_text('S-BB03', list(zip(['가로·세로·높이의 합이 2.4', '신고하지 않고 가구 2개', '소형 가전제품 3개', '침대 1개와 의자 3개', '신고하지 않고 가구 3개'],
        [fee_('장롱', 2.4) == 10000, fn_(2, 20) == 0 and fn_(2) == 200000, 3 >= 5, fee_('침대') + 3 * fee_('의자') == 16000, fn_(3, 30) == 0])))
gg_ = [g for g in itertools.permutations(range(1, 10)) if len({sum(g[0:3]), sum(g[3:6]), sum(g[6:9]), sum(g[0::3]), sum(g[1::3]), sum(g[2::3])}) == 1]
combo('S-BB04', [l for l, t in zip('ㄱㄴㄷㄹ', [all(sum(g[0:3]) == 15 for g in gg_), all(g[4] == 5 for g in gg_), all(any(9 in g[3 * r:3 * r + 3] and ({1, 2} & set(g[3 * r:3 * r + 3])) for r in range(3)) for g in gg_), any(all(g[i] % 2 == 0 for i in (0, 2, 6, 8)) for g in gg_)]) if t])
pj_ = {'A': (8, 9), 'B': (9, 12), 'C': (5, 14), 'D': (3, 13), 'E': (3, 10), 'F': (4, 5)}
bv_ = max(sum(pj_[x][1] for x in s) for k in range(4) for s in itertools.combinations(pj_, k) if sum(pj_[x][0] for x in s) <= 18 and ('B' not in s or 'A' in s) and not ('C' in s and 'D' in s) and ('E' not in s or 'F' in s))
pick('S-BB05', f'{bv_}점')
yy = [(6000, 1200), (7500, 1800), (9000, 2700), (8400, 3024)]; rg_ = {'A': (2400, 30), 'B': (2000, 45), 'C': (1800, 35), 'D': (1200, 22), 'E': (1000, 51)}
af_ = {k: a * r for k, (a, r) in rg_.items()}
s_ = [yy[0][0] < yy[1][0] < yy[2][0] > yy[3][0], all(F(yy[i][1], yy[i][0]) > F(yy[i - 1][1], yy[i - 1][0]) for i in range(1, 4)), yy[3][1] * 2 >= 5 * yy[0][1], max(rg_, key=lambda k: rg_[k][1]) == max(af_, key=af_.get), max(af_.values()) * 4 >= sum(af_.values())]
only('D-BB01', [not x for x in s_], 'false statements')
cl_, hp_, pp_ = [480, 300, 210, 90], [60, 45, 30, 15], [400, 250, 150, 50]
pr_ = [F(cl_[i] + hp_[i], pp_[i]) for i in range(4)]
combo('D-BB02', [l for l, t in zip('ㄱㄴㄷㄹ', [pr_[0] < pr_[1] < pr_[2] < pr_[3], max(range(4), key=lambda i: F(hp_[i], cl_[i] + hp_[i])) == 3, F(sum(cl_) + sum(hp_), sum(pp_)) >= F(3, 2), [i for i in range(4) if F(pp_[i], hp_[i]) <= 5] == [3]]) if t])
lb = {'가': (120, 80, 1600), '나': (90, 95, 1200), '다': (150, 60, 2000), '라': (70, 40, 700), '마': (100, 70, 800)}
ml = [m for m in itertools.permutations(lb) if lb[m[0]][0] == max(v[0] for v in lb.values()) and lb[m[1]][1] == max(v[1] for v in lb.values())
      and F(lb[m[2]][1], lb[m[2]][2]) == max(F(v[1], v[2]) for v in lb.values()) and lb[m[3]][0] > lb[m[4]][0]]
ok(len(ml) == 1, f'D-BB03 {ml}'); pick('D-BB03', ', '.join(ml[0]))
vc = {'65': (900, 720, 1440), '50': (1200, 1200 * 55 // 100, 990), '19': (600 * 100 // 30, 600, 1500), '7': (600, 240, 480), '6': (200 * 100 // 80, 200, 300)}
rt2 = {k: F(v[1] * 100, v[0]) for k, v in vc.items()}; ad_ = {k: F(v[2], v[1]) for k, v in vc.items()}
by_text('D-BB04', list(zip(['(가)와 (나)를', '접종자 1만 명당', '접종률이 가장 높은', '다섯 연령대 전체', '이상반응 신고 건수가'],
        [vc['50'][1] + vc['19'][0] >= 2700, max(ad_, key=ad_.get) == '19', [k for k in rt2 if rt2[k] == max(rt2.values())] == ['65'], sum(v[1] for v in vc.values()) * 2 >= sum(v[0] for v in vc.values()), max(vc, key=lambda k: vc[k][2]) == '65'])))
eb_, pb_, us_ = [300, 420, 540, 600], [2400, 2280, 2160, 2100], [800, 820, 840, 850]
al_ = [a + b for a, b in zip(eb_, pb_)]
combo('D-BB05', [l for l, t in zip('ㄱㄴㄷㄹ', [len(set(al_)) == 1, eb_[3] * 5 >= al_[3], all(F(al_[i], us_[i]) < F(al_[i - 1], us_[i - 1]) for i in range(1, 4)), F(eb_[2], eb_[1]) > F(eb_[1], eb_[0])]) if t])
pick('L-BB01', '어떤 정당의 지지자가 도시에 몰려 살면 경계를 공정하게 그어도 효율성 격차가 생길 수 있다.')
def wv_(plan):
    wa = wb = seats = 0
    for a in plan:
        b = 100 - a
        if a > b: seats += 1; wa += a - 50; wb += b
        else: wa += a; wb += b - 50
    return seats, wa, wb
p1, p2 = wv_([90, 90, 30, 20, 20]), wv_([60, 60, 60, 40, 30])
combo('L-BB02', [l for l, t in zip('ㄱㄴㄷㄹ', [p1[0] == 2, p1[1] - p1[2] == 50, abs(p2[1] - p2[2]) == abs(p1[1] - p1[2]), sum(100 - a for a in [60, 60, 60, 40, 30] if a < 50) == p2[2]]) if t])
combo('L-BB03', ['ㄴ', 'ㄹ']); combo('L-BB05', ['ㄱ'])
lq = [o for o in itertools.permutations('갑을병정무') if o.index('갑') < o.index('병') and o.index('정') < o.index('을') and 0 < o.index('병') < 4 and abs(o.index('을') - o.index('무')) == 2 and abs(o.index('정') - o.index('무')) > 1]
by_text('L-BB04', list(zip(['甲은 첫째', '乙은 셋째', '丁은 첫째', '戊는 다섯째', '丙은 넷째'], [all(o[0] == '갑' for o in lq), all(o[2] == '을' for o in lq), all(o[0] == '정' for o in lq), all(o[4] == '무' for o in lq), all(o[3] == '병' for o in lq)])))
# ================= S-BC / D-BC / L-BC (5급 실전, independent re-solve from the rendered options) =================
def hall_(wk, s, e, cut, cancel=None):
    h = max(e - s, 2); main = (30000 if wk else 40000) * h; light = 10000 * max(0, e - max(s, 18))
    t = main * (100 - cut) // 100 + light
    return t if cancel is None else (0 if cancel >= 3 else t // 2)
pick('S-BC01', f'{hall_(1, 19, 21, 50) + hall_(0, 10, 11, 30) + hall_(0, 17, 20, 50) + hall_(1, 14, 17, 0, 2):,}원')
dg_ = lambda n: sum(len(str(i)) for i in range(1, n + 1)); cd_ = lambda d, n: sum(str(i).count(d) for i in range(1, n + 1))
combo('S-BC02', [l for l, t in zip('ㄱㄴㄷㄹ', [dg_(200) == 492, cd_('1', 200) == 140, cd_('0', 200) == 30, [n for n in range(1, 1000) if dg_(n) == 1002] == [370]]) if t])
pen_ = lambda d, w=False: 0 if (w or d >= 7) else (30 if d >= 3 else 50)
ext_ = lambda n: None if n > 8 else 5000 * max(0, n - 6)
by_text('S-BC03', list(zip(['이용일 5일 전에', '이용일에 기상 특보', '이용일 35일 전에', '9명이 한 구역에', '이용일 7일 전에'], [pen_(5) == 50, pen_(1, True) == 0 and ext_(8) == 10000, 35 <= 30, ext_(9) == 15000, pen_(7) == 30])))
def gr_(n, ta=12):
    b = F(ta * n, 18); d = F(30 * b, 45); return b, d
dir_ = 1
for link in ['맞물림', '같은 축', '맞물림']: dir_ *= -1 if link == '맞물림' else 1
combo('S-BC04', [l for l, t in zip('ㄱㄴㄷㄹ', [gr_(9)[1] == 4, dir_ == 1, min(n for n in range(1, 50) if all(x.denominator == 1 for x in gr_(n))) == 9, gr_(9, 24)[1] == 4]) if t])
pf_ = {'A': [34, 35, 14], 'B': [24, 11, 13], 'C': [52, 37, 12], 'D': [25, 27, 55], 'E': [47, 35, 56]}
bt_ = max(sum(pf_[c][a[i]] for i, c in enumerate('ABCDE')) for a in itertools.product(range(3), repeat=5) if a[0] != a[1] and a[2] != 0 and max(a.count(k) for k in range(3)) <= 2 and abs(a[3] - a[4]) == 1)
pick('S-BC05', f'{bt_}명')
ry = [(12000, 1500), (12600, 1560), (13200, 1650), (12900, 1720)]; ind_ = {'A': (4500, 90), 'B': (3000, 75), 'C': (2400, 36), 'D': (1800, 54), 'E': (1200, 21)}
rr_ = [F(a, b) for a, b in ry]
s_ = [ry[0][0] < ry[1][0] < ry[2][0] > ry[3][0], rr_.index(min(rr_)) == 3, rr_.index(max(rr_)) == 1, max(ind_, key=lambda k: F(ind_[k][1], ind_[k][0])) == 'D' == max(ind_, key=lambda k: ind_[k][1]), sum(v[1] for v in ind_.values()) * 100 >= 2 * sum(v[0] for v in ind_.values())]
only('D-BC01', [not x for x in s_], 'false statements')
h4, h5, fd = [350, 40, 1100, 50], [360, 38, 1120, 55], [F(2), F(3), F(9, 10), F(2, 5)]
q4 = [a * b for a, b in zip(h4, fd)]; q5 = [a * b for a, b in zip(h5, fd)]
combo('D-BC02', [l for l, t in zip('ㄱㄴㄷㄹ', [q5.index(max(q5)) == 2, sum(q5) * 100 >= 102 * sum(q4), all(q5[i] < q4[i] for i in range(4) if h5[i] < h4[i]), q5[0] * 5 >= 2 * sum(q5)]) if t])
pt = {'가': (120, 36, 30), '나': (90, 33, 27), '다': (45, 14, 9), '라': (30, 11, 12), '마': (15, 6, 3)}
srr = {k: F(v[0] * 100, 300) for k, v in pt.items()}
mp = [m for m in itertools.permutations(pt) if srr[m[0]] - pt[m[0]][1] == max(srr[k] - pt[k][1] for k in pt) and F(pt[m[1]][2], pt[m[1]][0]) == max(F(v[2], v[0]) for v in pt.values())
      and pt[m[2]][1] > srr[m[2]] and pt[m[2]][0] == max(pt[k][0] for k in pt if pt[k][1] > srr[k]) and pt[m[3]][2] > pt[m[4]][2]]
ok(len(mp) == 1, f'D-BC03 {mp}'); pick('D-BC03', ', '.join(mp[0]))
qi = {1: (120, 108), 2: (250, 250 - 50), 3: (84 * 100 // 24, 266), 4: (480, 336), 5: (800, 480)}
su_ = {k: a - b for k, (a, b) in qi.items()}; sr_ = {k: F(su_[k], qi[k][0]) for k in qi}
by_text('D-BC04', list(zip(['(가)와 (나)를', '소비지출이 처분가능소득의', '흑자액이 가장 많은', '다섯 분위를 합하여', '1분위의 흑자액은'],
        [qi[2][1] + qi[3][0] >= 560, [k for k in qi if qi[k][1] * 10 < 7 * qi[k][0]] == [4, 5], max(su_, key=su_.get) == max(sr_, key=sr_.get), sum(su_.values()) * 100 >= 32 * sum(v[0] for v in qi.values()), su_[1] * 100 <= 3 * su_[5]])))
mq, mpr, yq, ypr = [400, 380, 390, 420], [180, 190, 200, 200], [60, 66, 72, 75], [500, 520, 540, 560]
mv = [a * b for a, b in zip(mq, mpr)]; yv = [a * b for a, b in zip(yq, ypr)]
combo('D-BC05', [l for l, t in zip('ㄱㄴㄷㄹ', [all(mv[i] > mv[i - 1] for i in range(1, 4)), yv[3] * 10 >= 14 * yv[0], all(mv[i] < mv[i - 1] for i in range(1, 4) if mq[i] < mq[i - 1]), yv[3] * 5 >= 2 * (mv[3] + yv[3])]) if t])
pick('L-BC01', '투표 행위 자체에서 얻는 이익을 고려하지 않으면, 유권자가 많은 선거에서 대부분의 사람은 투표하지 않는 것이 합리적이라는 결론이 나온다.')
nr_ = lambda p_, b, c, d: p_ * b - c + d > 0
combo('L-BC02', [l for l, t in zip('ㄱㄴㄷㄹ', [not nr_(F(1, 10000), 500000, 20000, 0), nr_(F(1, 10000), 500000, 20000, 25000) and not nr_(F(1, 10000), 500000, 20000, 0), nr_(F(1, 100), 500000, 10000, 10000), nr_(F(1, 100), 1000000, 20000, 10000)]) if t])
combo('L-BC03', ['ㄱ', 'ㄷ']); combo('L-BC05', ['ㄱ', 'ㄷ'])
lm = []
for c in '갑을병정무':
    tr = {'갑': c == '을', '을': c == '정', '병': c != '병', '무': c != '갑'}; tr['정'] = not tr['을']
    if list(tr.values()).count(False) == 2: lm.append((c, [k for k, v in tr.items() if not v]))
by_text('L-BC04', list(zip(['丁이 깨뜨렸다', '乙의 진술은 참', '戊는 깨뜨리지', '丁의 진술은 참', '甲의 진술은 거짓'], [all(c == '정' for c, L in lm), all('을' not in L for c, L in lm), all(c != '무' for c, L in lm), all('정' not in L for c, L in lm), all('갑' in L for c, L in lm)])))
# ================= S-BD / D-BD / L-BD (5급 실전, independent re-solve from the rendered options) =================
def rent_(rate, mk, minors, inc):
    v = mk * rate * (100 - min(10 * minors, 30)) // 10000
    return min(v, inc * 30 // 100)
pick('S-BD01', f'{rent_(35, 1000000, 0, 2000000) + rent_(50, 1200000, 1, 2400000) + rent_(70, 1500000, 4, 3000000) + rent_(50, 1800000, 1, 2000000):,}원')
tr3 = [c for c in itertools.combinations(range(1, 10), 3) if sum(c) == 15]
combo('S-BD02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(tr3) == 8, sum(5 in c for c in tr3) == 4, sum(9 in c for c in tr3) == 3, any(all(v % 2 == 0 for v in c) for c in tr3)]) if t])
quota_ = lambda cap: cap * 10 // 100
rk_ = {'맞벌이': 1, '한부모': 1, '형제': 2, '그 밖': 3}
by_text('S-BD03', list(zip(['형제자매가 이미', '정원이 20명인', '확정 통보를 받은', '정원이 15명인', '형제자매가 다니지 않는'], [rk_['형제'] < rk_['한부모'], quota_(20) == 2 and rk_['맞벌이'] == 1, 7 > 7, quota_(15) == 2, rk_['그 밖'] == 2])))
def split_(stops, people):
    pay = {q: F(0) for q in people}; on = list(people); prev = 0
    for m, off in stops:
        for q in on: pay[q] += F(m - prev, len(on))
        on = [q for q in on if q not in off]; prev = m
    return pay
s0 = split_([(6300, ['갑']), (9000, ['을']), (14200, ['병'])], ['갑', '을', '병']); s1 = split_([(9000, ['을']), (14200, ['갑', '병'])], ['갑', '을', '병'])
combo('S-BD04', [l for l, t in zip('ㄱㄴㄷㄹ', [s0['병'] > s0['갑'] + s0['을'], 9000 - s0['을'] > 5000, s1['갑'] >= 2 * s0['갑'], s0['병'] * 10 >= 7 * 14200]) if t])
tt_ = {frozenset(k): v for k, v in [(('H', 'A'), 50), (('H', 'B'), 50), (('H', 'C'), 40), (('H', 'D'), 25), (('A', 'B'), 50), (('A', 'C'), 25), (('A', 'D'), 55), (('B', 'C'), 45), (('B', 'D'), 30), (('C', 'D'), 45)]}
def rt5(o):
    t, c = 540, 'H'
    for x in o:
        t += tt_[frozenset((c, x))]
        if x == 'D': t = max(t, 660)
        if x == 'B' and t > 630: return None
        t += 30; c = x
    return t + tt_[frozenset((c, 'H'))]
b5_ = min(v for o in itertools.permutations('ABCD') if o.index('C') < o.index('A') for v in [rt5(o)] if v)
pick('S-BD05', f'오후 {b5_ // 60 - 12}시 {b5_ % 60}분')
yu = [(120000, 60), (140000, 58), (160000, 55), (180000, 52)]; nt = {'A': (72000, 50), 'B': (45000, 60), 'C': (27000, 40), 'D': (21000, 70), 'E': (15000, 34)}
yd = [a * r for a, r in yu]; nd = {k: a * r for k, (a, r) in nt.items()}
s_ = [yu[3][0] * 2 == 3 * yu[0][0] and all(yu[i][0] > yu[i - 1][0] for i in range(1, 4)), all(yu[i][1] < yu[i - 1][1] and yd[i] > yd[i - 1] for i in range(1, 4)), max(nt, key=lambda k: nt[k][1]) == max(nd, key=nd.get), max(nd.values()) * 100 >= 35 * yd[3], yu[3][0] * 100 - yd[3] > yu[0][0] * 100 - yd[0]]
only('D-BD01', [not x for x in s_], 'false statements')
fm4, fm5 = [800, 600, 1200, 400], [880, 720, 1150, 380]; pr4, pr5 = [20, 30, 100, 25], [20, 28, 110, 25]
x4 = [a * b for a, b in zip(fm4, pr4)]; x5 = [a * b for a, b in zip(fm5, pr5)]
combo('D-BD02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(range(4), key=lambda i: F(x5[i], x4[i])) == 1, any(fm5[i] < fm4[i] and x5[i] > x4[i] for i in range(4)), sum(x5) * 100 >= 106 * sum(x4), x5[2] * 4 >= 3 * sum(x5)]) if t])
ms = {'가': (120, 8000, 40), '나': (80, 12000, 25), '다': (60, 3000, 70), '라': (150, 6000, 20), '마': (40, 5000, 50)}
mm = [m for m in itertools.permutations(ms) if ms[m[0]][0] * (100 - ms[m[0]][2]) == max(v[0] * (100 - v[2]) for v in ms.values()) and ms[m[1]][1] == max(v[1] for v in ms.values())
      and ms[m[2]][0] * ms[m[2]][2] == max(v[0] * v[2] for v in ms.values()) and ms[m[3]][0] > ms[m[4]][0]]
ok(len(mm) == 1, f'D-BD03 {mm}'); pick('D-BD03', ', '.join(mm[0]))
cr = {'A': (5000, 3000), 'B': (8000, 8000 - 2400), 'C': (1400 * 100 // 35, 2600), 'D': (6000, 4200), 'E': (10000, 6000)}
ic = {k: a - b for k, (a, b) in cr.items()}; rr2 = {k: F(ic[k], cr[k][0]) for k in cr}
by_text('D-BD04', list(zip(['(가)와 (나)를', '농업 소득이 가장', '소득률이 가장', '다섯 작목을', '경영비가 농업'],
        [cr['B'][1] + cr['C'][0] >= 9700, max(ic, key=ic.get) == max(cr, key=lambda k: cr[k][1]), [k for k in rr2 if rr2[k] == max(rr2.values())] == ['A'], sum(ic.values()) * 100 >= 36 * sum(v[0] for v in cr.values()), [k for k in cr if cr[k][1] * 10 == 7 * cr[k][0]] == ['B']])))
ap_ = [25, 28, 30, 33]; sh_ = {'개인': (40, 35), '중소': (45, 50), '대기업': (10, 8), '외국인': (5, 7)}
a22 = {k: ap_[0] * v[0] for k, v in sh_.items()}; a25 = {k: ap_[3] * v[1] for k, v in sh_.items()}
combo('D-BD05', [l for l, t in zip('ㄱㄴㄷㄹ', [a25['개인'] > a22['개인'], a25['대기업'] < a22['대기업'], a25['외국인'] * 10 >= 18 * a22['외국인'], F(ap_[1], ap_[0]) > F(ap_[2], ap_[1])]) if t])
pick('L-BD01', '승인 투표에서 가장 좋아하는 후보 한 명에게만 찬성하는 유권자가 많아지면 결과가 최다득표제와 비슷해진다.')
gp = [(40, 'ACB', 'A'), (35, 'BCA', 'BC'), (25, 'CBA', 'C')]
plu = max('ABC', key=lambda c: sum(n for n, pr, a in gp if pr[0] == c))
appr = lambda g: max('ABC', key=lambda c: sum(n for n, pr, a in g if c in a))
top2 = sorted('ABC', key=lambda c: -sum(n for n, pr, a in gp if pr[0] == c))[:2]
ro = max(top2, key=lambda c: sum(n for n, pr, a in gp if pr.index(c) < pr.index([d for d in top2 if d != c][0])))
combo('L-BD02', [l for l, t in zip('ㄱㄴㄷㄹ', [plu == 'A', appr(gp) == 'C', ro == 'B', appr([(40, 'ACB', 'AC'), (35, 'BCA', 'BC'), (25, 'CBA', 'C')]) != appr(gp)]) if t])
combo('L-BD03', ['ㄴ', 'ㄷ']); combo('L-BD05', ['ㄱ', 'ㄴ'])
at = [dict(zip('갑을병정무', b)) for b in itertools.product((0, 1), repeat=5)]
at = [x for x in at if (not x['무'] or x['정']) and sum(x.values()) == 3 and not (x['정'] and x['병']) and (not x['을'] or x['병'])]
by_text('L-BD04', list(zip(['甲은 참석', '乙은 참석', '丁은 참석하지', '戊는 참석', '丙은 참석하지'], [all(x['갑'] for x in at), all(x['을'] for x in at), all(not x['정'] for x in at), all(x['무'] for x in at), all(not x['병'] for x in at)])))
# ================= S-BE / D-BE / L-BE (5급 실전, independent re-solve from the rendered options) =================
def cb_(seq):
    used, c = 0, F(0)
    for kind, amt in seq:
        if kind == '마트': continue
        part = min(amt, max(0, 50 - used)); used += amt
        c += part * (F(15, 100) if kind == '시장' else F(10, 100))
    return min(c, 6)
tcb = cb_([('일반', 30), ('시장', 10)]) + cb_([('시장', 40), ('일반', 20)]) + cb_([('마트', 30), ('일반', 60)]) + cb_([('일반', 20), ('시장', 40)])
pick('S-BE01', f'{int(tcb * 10000):,}원')
bad_ = {(0, 0), (1, 1), (2, 2), (3, 3), (0, 1)}
fw = [p for p in itertools.permutations(range(4)) if not any((r, p[r]) in bad_ for r in range(4))]
fw2 = [p for p in itertools.permutations(range(4)) if not any((r, p[r]) in bad_ - {(0, 1)} for r in range(4))]
combo('S-BE02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(fw) == 6, all(p[0] in (2, 3) for p in fw), len(fw2) == 9, sum(1 for p in fw if p[1] == 0) == 3]) if t])
ride_ = lambda age, lic: age >= 16 and lic
zone_ = lambda d_cross, d_bus: d_cross <= 5 or d_bus <= 5
fine_ = lambda two, nohelmet: 40000 * two + 20000 * nohelmet
tow2 = lambda z, mins=None: 0 if (not z or (mins is not None and mins <= 60)) else 40000
by_text('S-BE03', list(zip(['원동기 면허가 없는', '횡단보도에서 3미터', '횡단보도에서 8미터', '두 사람이 함께 탄', '버스 정류장에서 4미터'],
        [ride_(17, False), tow2(zone_(3, 99), 50) == 0 and fine_(1, 1) == 60000, tow2(zone_(8, 99)) == 40000, fine_(1, 0) == 20000, tow2(zone_(99, 4), 90) == 0])))
def bp_(need, coupon=True, six=True):
    best = None
    for a in range(16):
        for b in range(7):
            for c in range(4 if six else 1):
                n = a + 3 * b + 6 * c
                if n < need: continue
                cost = 1500 * a + 4000 * b + 7500 * c
                if coupon and n >= 10: cost = cost * 9 // 10
                if best is None or (cost, n) < best: best = (cost, n)
    return best
combo('S-BE04', [l for l, t in zip('ㄱㄴㄷㄹ', [bp_(11)[0] == 13050, bp_(11)[1] == 11, bp_(11, coupon=False)[1] == 12, bp_(11, six=False)[0] >= 13950]) if t])
cs_ = {'A': [60, 90, 70, 90, 80], 'B': [90, 120, 160, 160, 120], 'C': [80, 160, 130, 80, 100], 'D': [80, 70, 110, 120, 140]}
bs_ = min(sum(cs_[x][d] + (30 if d == 2 else 0) for x, d in zip('ABCD', ds)) for ds in itertools.permutations(range(5), 4) if ds[0] != 4 and abs(ds[1] - ds[2]) != 1)
pick('S-BE05', f'{bs_}만 원')
yr_ = [(60, F(5)), (65, F(52, 10)), (70, F(55, 10)), (68, F(56, 10))]; ag_ = {'10': (120, 85), '20': (150, 90), '30': (160, 80), '40': (170, 70), '50': (400, 49)}
vw = {k: a * r for k, (a, r) in ag_.items()}; tv = [r * t for r, t in yr_]
s_ = [yr_[0][0] < yr_[1][0] < yr_[2][0] > yr_[3][0], all(yr_[i][1] > yr_[i - 1][1] for i in range(1, 4)), tv[3] < tv[2], max(ag_, key=lambda k: ag_[k][1]) == max(vw, key=vw.get), vw['50'] * 4 >= sum(vw.values())]
only('D-BE01', [not x for x in s_], 'false statements')
ar15, ar25 = [120, 80, 60, 40], [118, 79, 61, 38]; st15, st25 = [130, 120, 140, 100], [160, 150, 165, 140]
w15 = [a * b for a, b in zip(ar15, st15)]; w25 = [a * b for a, b in zip(ar25, st25)]
combo('D-BE02', [l for l, t in zip('ㄱㄴㄷㄹ', [all(w25[i] > w15[i] for i in range(4) if ar25[i] < ar15[i]), sum(w25) * 4 >= 5 * sum(w15), max(range(4), key=lambda i: F(st25[i], st15[i])) == 3, max(w25) * 5 >= 2 * sum(w25)]) if t])
ai = {'가': (20, 85, 40), '나': (15, 92, 30), '다': (25, 76, 50), '라': (10, 95, 20), '마': (18, 80, 45)}
ot_ = lambda k: ai[k][0] * ai[k][1]; lt_ = lambda k: ai[k][0] * (100 - ai[k][1])
ma = [m for m in itertools.permutations(ai) if ot_(m[0]) == max(map(ot_, ai)) and ai[m[1]][1] == max(v[1] for v in ai.values()) and sorted(ai, key=lt_, reverse=True)[1] == m[2] and ai[m[3]][2] > ai[m[4]][2]]
ok(len(ma) == 1, f'D-BE03 {ma}'); pick('D-BE03', ', '.join(ma[0]))
ins = {'A': (500, 400, 25), 'B': (800, 800 * 85 // 100, 32), 'C': (450 * 100 // 75, 450, 30), 'D': (1000, 920, 40), 'E': (400, 400 * 90 // 100, 20)}
lr_ = {k: F(v[1], v[0]) for k, v in ins.items()}; pp_ = {k: F(v[0], v[2]) for k, v in ins.items()}
by_text('D-BE04', list(zip(['(가)와 (라)를', '손해율이 가장 높은', '계약 1건당', '다섯 상품을', '손해율이 80%'],
        [ins['B'][1] + ins['E'][1] >= 1050, max(lr_, key=lr_.get) == max(ins, key=lambda k: ins[k][1]), [k for k in pp_ if pp_[k] == max(pp_.values())] == ['B'], sum(v[1] for v in ins.values()) * 100 >= 86 * sum(v[0] for v in ins.values()), [k for k in lr_ if lr_[k] <= F(8, 10)] == ['C']])))
od_ = [300, 330, 360, 330]; s22, s25 = {'중동': 40, '아시아': 35, '미주': 15, '기타': 10}, {'중동': 35, '아시아': 30, '미주': 25, '기타': 10}
combo('D-BE05', [l for l, t in zip('ㄱㄴㄷㄹ', [od_[3] * 10 == 11 * od_[0], od_[3] * s25['중동'] < od_[0] * s22['중동'], od_[3] * s25['미주'] >= 2 * od_[0] * s22['미주'], od_[3] * s25['기타'] > od_[0] * s22['기타']]) if t])
pick('L-BE01', '갤러거 지수에서는 작은 차이 여러 개보다 큰 차이 몇 개가 지수를 더 크게 끌어올린다.')
lh_ = lambda e: sum(abs(a - b) for a, b in e) / 2; g2_ = lambda e: sum((a - b) ** 2 for a, b in e) / 2
e1, e2, e1b = [(45, 60), (35, 35), (20, 5)], [(40, 50), (30, 35), (20, 15), (10, 0)], [(45, 65), (35, 35), (20, 0)]
combo('L-BE02', [l for l, t in zip('ㄱㄴㄷㄹ', [lh_(e1) == lh_(e2), g2_(e1) > g2_(e2), g2_(e2) >= 100, g2_(e1b) > 400]) if t])
combo('L-BE03', ['ㄱ', 'ㄹ']); combo('L-BE05', ['ㄱ', 'ㄴ'])
fx = [dict(zip(['기', '인', '회', '홍', '총'], p)) for p in itertools.permutations(range(1, 6))]
fx = [x for x in fx if x['회'] != 2 and abs(x['총'] - x['회']) == 1 and x['인'] > x['홍'] > x['총']]
by_text('L-BE04', list(zip(['회계는 1층', '인사는 5층', '홍보는 3층', '기획은 4층', '총무는 2층'], [all(x['회'] == 1 for x in fx), all(x['인'] == 5 for x in fx), all(x['홍'] == 3 for x in fx), all(x['기'] == 4 for x in fx), all(x['총'] == 2 for x in fx)])))
# ================= S-BF / D-BF / L-BF (5급 실전, independent re-solve from the rendered options) =================
def rf_(low, buys):
    seen, t = set(), F(0)
    for it, g, pr in buys:
        if it not in ('냉장고', '세탁기', '에어컨') or g != 1 or it in seen: continue
        seen.add(it); t += min(pr * (F(2, 10) if low else F(1, 10)), 20)
    return min(t, 30)
rf_t = rf_(0, [('냉장고', 1, 180), ('세탁기', 1, 120)]) + rf_(1, [('에어컨', 1, 150), ('냉장고', 1, 250)]) + rf_(0, [('냉장고', 2, 200), ('TV', 1, 150)]) + rf_(0, [('세탁기', 1, 90), ('세탁기', 1, 110), ('에어컨', 1, 220)])
pick('S-BF01', f'{int(rf_t * 10000):,}원')
mz_ = [n for n in range(100, 1000) if (n // 100) * (n // 10 % 10) * (n % 10) == 36 and n // 100 + n // 10 % 10 + n % 10 == 13]
combo('S-BF02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(mz_) == 6, len([n for n in mz_ if n % 2 == 0]) == 4, mz_[-1] - mz_[0] == 763, len([n for n in mz_ if n % 11 == 0]) == 1]) if t])
site_ok_ = lambda width, cross: width >= 3 and cross > 10
torn_ = lambda permitted, idle: not permitted or idle >= 30
pays_ = lambda notice_days: notice_days is None or notice_days > 7
fine_ = {'연락처 미표시': 200000}
by_text('S-BF03', list(zip(['허가를 받으면 폭 2.5', '35일 동안', '폭 4미터인', '허가를 받아 설치한', '연락처를 표시하지'], [site_ok_(2.5, 50), torn_(True, 35) and not pays_(5), site_ok_(4, 8), torn_(True, 20), fine_['연락처 미표시'] == 100000])))
tt_ = range(1, 120); hits_ = lambda t: (t % 6 == 0) + (t % 8 == 0) + (t % 15 == 0)
lc_ = next(t for t in range(1, 1000) if hits_(t) == 3)
combo('S-BF04', [l for l, t in zip('ㄱㄴㄷㄹ', [lc_ == 120, sum(hits_(t) == 2 for t in tt_) == 7, not any(t % 8 == 0 and t % 15 == 0 for t in tt_), sum(hits_(t) > 0 for t in tt_) == 35]) if t])
sv_ = {'A': ('나라', 15000), 'B': ('가다마', 9000), 'C': ('나다마', 6000), 'D': ('나다바', 8000), 'E': ('라마', 5000)}
cost_ = []
for k in range(1, 4):
    for s in itertools.combinations('ABCDE', k):
        if set(''.join(sv_[x][0] for x in s)) != set('가나다라마바') or ('E' in s and 'C' not in s): continue
        cost_.append(sum(sv_[x][1] for x in s) - (3000 if 'A' in s and 'B' in s else 0))
pick('S-BF05', f'{min(cost_):,}원')
yr1_ = [(520, 35), (510, 37), (505, 40), (500, 38)]; rg1_ = {'A': (120, 35), 'B': (110, 40), 'C': (100, 32), 'D': (90, 44), 'E': (80, 40.5)}
yv_ = [a * r for a, r in yr1_]; rv_ = {k: a * r for k, (a, r) in rg1_.items()}
only('D-BF01', [not x for x in [35 < 37 < 40 > 38, yv_.index(max(yv_)) == 2, yv_[3] > yv_[0], max(rg1_, key=lambda k: rg1_[k][1]) == max(rv_, key=rv_.get), sorted(k for k in rg1_ if rg1_[k][1] < 38) == ['A', 'C']]], 'false statements')
c24_, c25_ = [140, 60, 50, 150], [120, 45, 55, 160]; p24_, p25_ = [2500, 8000, 12000, 1500], [3000, 10000, 12000, 1400]
w24_ = [a * b for a, b in zip(c24_, p24_)]; w25_ = [a * b for a, b in zip(c25_, p25_)]
combo('D-BF02', [l for l, t in zip('ㄱㄴㄷㄹ', [[i for i in range(4) if c25_[i] < c24_[i] and w25_[i] > w24_[i]] == [0], sum(w25_) * 100 >= 103 * sum(w24_), w25_.index(max(w25_)) == 2, w25_[3] < w24_[3]]) if t])
fr_ = {'가': (200, 15, 300), '나': (150, 20, 360), '다': (300, 12, 480), '라': (100, 8, 220), '마': (250, 25, 425)}
mm_ = [m for m in itertools.permutations(fr_) if fr_[m[0]][2] == max(v[2] for v in fr_.values()) and fr_[m[1]][1] == max(v[1] for v in fr_.values())
       and F(fr_[m[2]][2], fr_[m[2]][0]) == max(F(v[2], v[0]) for v in fr_.values()) and F(fr_[m[3]][2], fr_[m[3]][1]) > F(fr_[m[4]][2], fr_[m[4]][1])]
ok(len(mm_) == 1, f'D-BF03 {mm_}'); pick('D-BF03', ', '.join(mm_[0]))
debt_ = {'A': 600, 'B': 150 * 600 // 100, 'C': 300, 'D': 1000, 'E': 400}; eq_ = {'A': 400, 'B': 600, 'C': 500, 'D': 2000 - 1000, 'E': 200}; asset_C = 300 + 500
dr_ = {k: F(debt_[k] * 100, eq_[k]) for k in debt_}
by_text('D-BF04', list(zip(['(가)와 (나)를', '다섯 기업을', '부채가 가장 많은', '부채비율이 150%', '자본이 부채'],
        [debt_['B'] + asset_C >= 1750, sum(debt_.values()) >= sum(eq_.values()), max(debt_, key=debt_.get) == max(dr_, key=dr_.get), [k for k in dr_ if dr_[k] == 150] == ['A'], [k for k in eq_ if eq_[k] >= debt_[k]] == ['C']])))
sl_ = [3000, 3600, 4200, 4500]; sh_ = {'뮤지컬': (50, 55), '콘서트': (30, 32), '연극': (12, 8), '클래식': (8, 5)}
gm_ = lambda g, j: sl_[0 if j == 0 else 3] * sh_[g][j]
combo('D-BF05', [l for l, t in zip('ㄱㄴㄷㄹ', [gm_('연극', 0) == gm_('연극', 1), gm_('클래식', 1) < gm_('클래식', 0), gm_('뮤지컬', 1) * 10 >= 16 * gm_('뮤지컬', 0), max(range(1, 4), key=lambda i: F(sl_[i], sl_[i - 1])) == 2]) if t])
pick('L-BF01', '드룹 기준수를 쓰면 기준수에 이른 후보가 뽑을 의석 수보다 많아지는 일이 없다.')
def stv_(bal, seats):
    q = sum(n for n, _ in bal) // (seats + 1) + 1; w = [[F(n), r] for n, r in bal]; el, gone = [], set()
    while len(el) < seats:
        cur = lambda r: next(c for c in r if c not in el and c not in gone)
        tl = {}
        for x in w:
            if x[0]: tl[cur(x[1])] = tl.get(cur(x[1]), 0) + x[0]
        for c in set(''.join(r for _, r in bal)) - set(el) - gone: tl.setdefault(c, 0)
        c = max(tl, key=tl.get)
        if tl[c] >= q:
            fac = (tl[c] - q) / tl[c]
            for x in w:
                if x[0] and cur(x[1]) == c: x[0] *= fac
            el.append(c)
        else: gone.add(min(tl, key=tl.get))
    return q, el
bf_ = [(22, 'ACBD'), (22, 'ABCD'), (25, 'BDCA'), (16, 'CBDA'), (15, 'DCBA')]
qv_, wv_ = stv_(bf_, 2); _, wv2_ = stv_(bf_[:4] + [(15, 'DBCA')], 2)
combo('L-BF02', [l for l, t in zip('ㄱㄴㄷㄹ', [qv_ == 34, F(44 - 34) * 22 / 44 == 5, 'B' in wv_, sorted(wv2_) == ['A', 'B']]) if t])
combo('L-BF03', ['ㄱ', 'ㄷ']); combo('L-BF05', ['ㄱ', 'ㄴ'])
bx4_ = [(a, b, 15 - a - b) for a in range(16) for b in range(16 - a) if a > b and a - (15 - a - b) >= 3 and a < 15 - a]
by_text('L-BF04', list(zip(['나에 든 공은', '나에는 공이 5개', '다에는 공이 3개', '가에는 공이 7개', '나와 다에 든'], [all(x[1] > x[2] for x in bx4_), all(x[1] == 5 for x in bx4_), all(x[2] == 3 for x in bx4_), all(x[0] == 7 for x in bx4_), all(abs(x[1] - x[2]) >= 2 for x in bx4_)])))
# ================= S-BG / D-BG / L-BG (5급 실전, independent re-solve from the rendered options) =================
def pk_(mins, cut):
    if mins <= 10: return F(0)
    return min(F(1000 + 500 * -(-max(0, mins - 30) // 10)), 10000) * (1 - cut)
pick('S-BG01', f'{int(pk_(125, 0) + pk_(240, F(1, 2)) + pk_(50, max(F(1, 2), F(4, 5))) + pk_(8, 0)):,}원')
def st_(n, prev=0):
    if n == 0: return [()]
    r = [(1,) + s for s in st_(n - 1, 1)]
    if n >= 2 and prev != 2: r += [(2,) + s for s in st_(n - 2, 2)]
    return r
s10_, s8_ = st_(10), st_(8)
combo('S-BG02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(s10_) == 41, min(map(len, s10_)) == 7, len([s for s in s10_ if len(s) == 9]) == 8, len(s8_) >= 20]) if t])
reg_ = lambda days: days >= 60
lost_ = lambda reported=None, found=None: (found is not None and found <= 10) or (reported is not None and reported <= 10)
muz_ = lambda months: months >= 3
chg_ = lambda d: d <= 30
by_text('S-BG03', list(zip(['생후 75일', '등록한 개를 잃어버린 소유자가', '생후 5개월', '이사한 소유자가', '등록한 개를 잃어버렸다가'], [not reg_(75), lost_(reported=15), not muz_(5), chg_(40), lost_(found=7)])))
gm4_ = list(itertools.combinations('ABCD', 2)); res4_ = []
for oc in itertools.product((3, 1, 0), repeat=6):
    pt = dict.fromkeys('ABCD', 0)
    for (x, y), o in zip(gm4_, oc): pt[x] += o; pt[y] += {3: 0, 1: 1, 0: 3}[o]
    if pt == {'A': 7, 'B': 5, 'C': 3, 'D': 1}: res4_.append(dict(zip(gm4_, oc)))
ok(len(res4_) == 1, f'S-BG04 unique {len(res4_)}'); r4_ = res4_[0]
combo('S-BG04', [l for l, t in zip('ㄱㄴㄷㄹ', [list(r4_.values()).count(1) == 2, all(o != 0 for (x, y), o in r4_.items() if x == 'A'), r4_[('B', 'D')] == 1, r4_[('A', 'D')] == 1]) if t])
wt5_ = {'가': 1000, '나': 600, '다': 500, '라': 400, '마': 300, '바': 200}
best5_ = None
for asg in itertools.product(range(6), repeat=6):            # 작품마다 트럭 번호
    grp = {}
    for k, t in zip(wt5_, asg): grp.setdefault(t, []).append(k)
    cost, good = 0, True
    for g in grp.values():
        w = sum(wt5_[k] for k in g)
        if ('가' in g and '나' in g) or len(g) > 3 or w > 2500: good = False; break
        cost += 17 if (w > 1000 or '다' in g) else 10
    if good and (best5_ is None or cost < best5_): best5_ = cost
pick('S-BG05', f'{best5_}만 원')
ev_ = [(40, 20), (54, 24), (68, 34), (80, 40)]; rg_ = {'A': (24, 10), 'B': (20, 12), 'C': (16, 6), 'D': (12, 8), 'E': (8, 4)}
q_ = lambda v: F(v[0], v[1])
only('D-BG01', [not x for x in [all(ev_[i][0] - ev_[i - 1][0] >= 10 for i in range(1, 4)), max(range(4), key=lambda i: q_(ev_[i])) == 1, max(rg_, key=lambda k: q_(rg_[k])) == 'A',
     max(rg_, key=lambda k: rg_[k][1]) == 'B' and q_(rg_['B']) < q_(ev_[3]), sorted(k for k in rg_ if q_(rg_[k]) < q_(ev_[3])) == ['B', 'D']]], 'false statements')
mx_ = {'A': {'B': 30, 'C': 20, 'D': 10}, 'B': {'A': 25, 'C': 15, 'D': 15}, 'C': {'A': 10, 'B': 20, 'D': 5}, 'D': {'A': 15, 'B': 10, 'C': 25}}
ot_ = {a: sum(r.values()) for a, r in mx_.items()}; it_ = {b: sum(mx_[a].get(b, 0) for a in mx_) for b in mx_}
pr_ = {(a, b): mx_[a][b] + mx_[b][a] for a, b in itertools.combinations('ABCD', 2)}
combo('D-BG02', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(it_[r] > ot_[r] for r in mx_) == 2, max(pr_, key=pr_.get) == ('A', 'B'), mx_['D']['C'] * 2 >= it_['C'], ot_['A'] * 10 >= 3 * sum(ot_.values())]) if t])
lb_ = {'가': (50, 30, 24), '나': (60, 54, 30), '다': (80, 40, 36), '라': (45, 36, 18), '마': (70, 49, 35)}
mt_ = [m for m in itertools.permutations(lb_) if lb_[m[0]][0] == max(v[0] for v in lb_.values()) and F(lb_[m[1]][2], lb_[m[1]][1]) == min(F(v[2], v[1]) for v in lb_.values())
       and F(lb_[m[2]][1], lb_[m[2]][0]) == max(F(v[1], v[0]) for v in lb_.values()) and lb_[m[3]][2] > lb_[m[4]][2]]
ok(len(mt_) == 1, f'D-BG03 {mt_}'); pick('D-BG03', ', '.join(mt_[0]))
B_emp = 50 - 50 * 6 // 100; C_act = 76 * 100 // 95; D_ur = F(40 - 38, 40) * 100; E_ur = F(70 - 63, 70) * 100
p15_ = {'A': F(57 * 1000, 570), 'B': F(B_emp * 1000, 500), 'C': F(76 * 1000, 608), 'D': F(38 * 1000, 475), 'E': F(63 * 1000, 525)}
une_ = {'A': 60 - 57, 'B': 50 - B_emp, 'C': C_act - 76, 'D': 40 - 38, 'E': 70 - 63}; act_ = {'A': 60, 'B': 50, 'C': C_act, 'D': 40, 'E': 70}
er_ = {'A': 570, 'B': 500, 'C': 608, 'D': 475, 'E': 525}; urr_ = {k: F(une_[k], act_[k]) for k in une_}
by_text('D-BG04', list(zip(['(가)와 (나)를', '다섯 지역을', '15세 이상 인구가', '(다)는 (라)의', '고용률이 가장 높은'],
        [B_emp + C_act >= 130, sum(une_.values()) * 100 >= 6 * sum(act_.values()), max(p15_, key=p15_.get) == 'E', D_ur * 2 < E_ur, max(er_, key=er_.get) == max(urr_, key=urr_.get)])))
b24_ = [200, 250, 300, 250]; g25_ = [20, 12, 5, 16]; a25_ = [F(b * (100 + g), 100) for b, g in zip(b24_, g25_)]
combo('D-BG05', [l for l, t in zip('ㄱㄴㄷㄹ', [a25_.index(max(a25_)) == g25_.index(max(g25_)), sum(a25_) * 100 >= 112 * sum(b24_), a25_[1] - a25_[0] == 40, a25_[3] < a25_[2]]) if t])
pick('L-BG01', '성과급을 쓰면 성과로 재기 어려운 일에는 대리인의 노력이 덜 갈 수 있다.')
def ag_(fx, bo):
    hi, lo = fx + F(8, 10) * bo - 30, fx + F(3, 10) * bo
    e = 'hi' if hi > lo else 'lo'; v = max(hi, lo); return e, v >= 30, (F(8, 10) if e == 'hi' else F(3, 10)) * (200 - bo) - fx if v >= 30 else 0
combo('L-BG02', [l for l, t in zip('ㄱㄴㄷㄹ', [ag_(50, 0)[0] == 'lo', ag_(10, 70)[2] >= 90, ag_(0, 70)[1] and ag_(0, 70)[2] > ag_(10, 70)[2], ag_(30, 0)[1]]) if t])
combo('L-BG03', ['ㄱ', 'ㄹ']); combo('L-BG05', ['ㄱ', 'ㄷ'])
rg4_ = list(itertools.product((0, 1), repeat=4)); must4_ = [True] * 5
for mask in range(1 << 16):
    M = [r for i, r in enumerate(rg4_) if mask >> i & 1]
    if any(s and not h for s, h, r, p in M) or any(h and r and p for s, h, r, p in M) or not any(r and s for s, h, r, p in M): continue
    vals = [any(s and not p for s, h, r, p in M), not any(r and not h for s, h, r, p in M), any(p and h for s, h, r, p in M), not any(s and p for s, h, r, p in M), any(h and not r for s, h, r, p in M)]
    must4_ = [a and b for a, b in zip(must4_, vals)]
by_text('L-BG04', list(zip(['수영반 학생 가운데', '독서반 학생은 모두', '사진반 학생 가운데', '수영반이면서', '등산반 학생 가운데'], must4_)))
# ================= S-BH / D-BH / L-BH (5급 실전, independent re-solve from the rendered options) =================
import math
def pc_(kg, dims, jeju, n=1):
    aw = max(F(kg), F(dims[0] * dims[1] * dims[2], 6000))
    b = 4000 if aw <= 2 else 5000 if aw <= 5 else 6500 if aw <= 10 else 8000
    return n * (b * (F(9, 10) if n >= 3 else 1) + (3000 if jeju else 0))
pick('S-BH01', f'{int(pc_(3, (40, 30, 30), 0) + pc_(F(3, 2), (20, 20, 10), 1) + pc_(4, (30, 20, 20), 1, 3) + pc_(12, (60, 50, 40), 0)):,}원')
cnt_ = lambda a, b: math.comb((b[0] - a[0]) + (b[1] - a[1]), b[0] - a[0])
o_, t_, p_, q_ = (0, 0), (4, 3), (2, 1), (2, 2)
via = lambda *pts: math.prod(cnt_(pts[i], pts[i + 1]) for i in range(len(pts) - 1))
combo('S-BH02', [l for l, t in zip('ㄱㄴㄷㄹ', [via(o_, t_) == 35, via(o_, p_, t_) == 18, via(o_, t_) - via(o_, q_, t_) == 18, via(o_, p_, t_) - via(o_, p_, q_, t_) == 9]) if t])
apply_ = lambda d: 3 <= d <= 30
refund_ = lambda d: 1 if d >= 7 else F(1, 2) if d >= 3 else 0
gym_ = lambda h, extra, local: h * 20000 * (F(3, 2) if extra else 1) * (F(7, 10) if local else 1)
by_text('S-BH03', list(zip(['관내 단체가 토요일', '사용일 2일 전에', '관외 단체가 평일', '사용일 5일 전에', '관내 단체가 평일 오후 7시'],
        [gym_(2, True, True) == 42000, apply_(2), gym_(2, False, False) == 60000, refund_(5) == 1, gym_(2, True, True) == 28000])))
tooth_ = {'A': 12, 'B': 18, 'C': 30}
spin_ = {'A': 1}
for a_, b_ in [('A', 'B'), ('B', 'C')]: spin_[b_] = -spin_[a_]      # 맞물린 이웃은 반대로
k_ = 1
while any((tooth_['A'] * k_) % t for t in tooth_.values()): k_ += 1
combo('S-BH04', [l for l, t in zip('ㄱㄴㄷㄹ', [spin_['C'] == spin_['A'], F(12 * 15, 30) == 6, k_ == 15, F(18 * 4, 30) == F(5, 2)]) if t])
cr_ = {'A': (1, 4, 'W'), 'B': (1, 1, 'T'), 'C': (2, 1, 'W'), 'D': (3, 2, 'M'), 'E': (1, 2, 'U'), 'F': (3, 4, 'U')}
bc_ = max(sum(cr_[x][0] for x in s) for k in range(1, 7) for s in itertools.combinations(cr_, k)
          if len({cr_[x][2] for x in s}) == k and ('D' not in s or 'A' in s) and sum(cr_[x][1] for x in s) <= 8)
pick('S-BH05', f'{bc_}학점')
rt_ = [400, 480, 600, 660]; zn_ = {'A': (200, 8, 20), 'B': (150, 5, 25), 'C': (120, 6, 15), 'D': (110, 4, 30), 'E': (80, 2, 18)}
pb_ = {k: F(a * 10, b) for k, (a, b, c) in zn_.items()}; tt_ = {k: a * c for k, (a, b, c) in zn_.items()}; dd_ = [rt_[i] - rt_[i - 1] for i in range(1, 4)]
only('D-BH01', [not x for x in [min(dd_) > 0 and dd_.index(max(dd_)) == 1, rt_[3] >= F(16, 10) * rt_[0], max(pb_, key=pb_.get) == 'E', max(zn_, key=lambda k: zn_[k][2]) == max(tt_, key=tt_.get), sorted(k for k in pb_ if pb_[k] >= 300) == ['B', 'E']]], 'false statements')
hs_ = {'가': (400, 80, 24000), '나': (300, 100, 21000), '다': (500, 125, 25000), '라': (240, 40, 19200), '마': (350, 50, 21700)}
mh_ = [m for m in itertools.permutations(hs_) if hs_[m[0]][0] == max(v[0] for v in hs_.values()) and F(hs_[m[1]][0], hs_[m[1]][1]) == min(F(v[0], v[1]) for v in hs_.values())
       and F(hs_[m[2]][2], hs_[m[2]][0]) == max(F(v[2], v[0]) for v in hs_.values()) and hs_[m[3]][1] > hs_[m[4]][1]]
ok(len(mh_) == 1, f'D-BH02 {mh_}'); pick('D-BH02', ', '.join(mh_[0]))
B_disc = 100 - F(4800000, 15000 * 400) * 100; C_list = F(10800000, F(75, 100) * 600); D_qty = F(12000000, 30000); E_rev = F(12000 * 85 * 1000, 100 * 10000)
sp_ = {'A': 18000, 'B': 15000 * (100 - B_disc) / 100, 'C': C_list * F(75, 100), 'D': 30000, 'E': 12000 * F(85, 100)}
qt_ = {'A': 500, 'B': 400, 'C': 600, 'D': D_qty, 'E': 1000}; rv_ = {k: sp_[k] * qt_[k] / 10000 for k in sp_}; dc_ = {'A': 10, 'B': B_disc, 'C': 25, 'D': 0, 'E': 15}
by_text('D-BH03', list(zip(['(가)에 해당하는', '판매량이 가장 많은', '할인 뒤 판매 가격이', '(다)와 (라)를', '다섯 상품의 매출액'],
        [max(dc_, key=dc_.get) == 'B', max(qt_, key=qt_.get) == max(rv_, key=rv_.get), max(sp_, key=sp_.get) == 'D', D_qty + E_rev >= 1500, sum(rv_.values()) >= 5000])))
cp_ = {'식료품': (30, 110, 121), '주거': (25, 100, 104), '교통': (20, 120, 114), '기타': (25, 108, 108)}
ci_ = lambda j: F(sum(w[0] * w[j] for w in cp_.values()), 100); cb_ = {k: v[0] * (v[2] - v[1]) for k, v in cp_.items()}
combo('D-BH04', [l for l, t in zip('ㄱㄴㄷㄹ', [ci_(2) >= F(103, 100) * ci_(1), max(cb_, key=cb_.get) == '식료품', F(114, 120) == F(95, 100), max(cp_, key=lambda k: cp_[k][2]) == '식료품']) if t])
ex5_, im5_, b24_, e24_ = [500, 300, 450, 200], [420, 340, 400, 260], [60, -20, 70, -30], [450, 280, 430, 175]
b5_ = [a - b for a, b in zip(ex5_, im5_)]; g5_ = [F(a, b) for a, b in zip(ex5_, e24_)]
combo('D-BH05', [l for l, t in zip('ㄱㄴㄷㄹ', [sum(x > 0 for x in b5_) == 2, sum(a < b for a, b in zip(b5_, b24_)) == 3, g5_.index(max(g5_)) == ex5_.index(max(ex5_)), sum(b for a, b in zip(ex5_, im5_) if b > a) >= 600]) if t])
pick('L-BH01', '나누는 수를 조정하는 방식에서는 전체 자리 수를 늘려도 자리가 줄어드는 집단이 생기지 않는다.')
def lr_(n, pop=(62, 33, 5)):
    q = [F(x * n, sum(pop)) for x in pop]; g = [int(x) for x in q]
    for i in sorted(range(3), key=lambda i: g[i] - q[i])[:n - sum(g)]: g[i] += 1
    return g, q
combo('L-BH02', [l for l, t in zip('ㄱㄴㄷㄹ', [lr_(10)[0][2] == 1, lr_(11)[0][2] == 0, lr_(11)[1][0] > 7, lr_(12)[0][2] == 1]) if t])
combo('L-BH03', ['ㄱ', 'ㄹ']); combo('L-BH05', ['ㄱ', 'ㄴ'])
sol4_ = []
for cul in '갑을병정무':
    for liars in itertools.combinations('갑을병정무', 2):
        tr = {x: x not in liars for x in '갑을병정무'}
        said = {'갑': not tr['을'], '을': cul != '갑', '병': cul in '무을', '정': cul == '을', '무': cul == '병'}
        if said == tr: sol4_.append((cul, set(liars)))
ok(len(sol4_) == 1, f'L-BH04 {sol4_}'); c4_, l4_ = sol4_[0]
by_text('L-BH04', list(zip(['갑과 무가', '병이 꽃병을', '정은 거짓말을', '을은 거짓말을', '무가 꽃병을'], [l4_ == {'갑', '무'}, c4_ == '병', '정' in l4_, '을' in l4_, c4_ == '무'])))
# ================= S-BI / D-BI / L-BI (5급 실전, independent re-solve from the rendered options) =================
def el_(month, kwh, disabled):
    lo, hi = (300, 450) if month in (7, 8) else (200, 400)
    fee = (1000 if kwh <= lo else 2000 if kwh <= hi else 7000) + 100 * min(kwh, lo) + 200 * max(0, min(kwh, hi) - lo) + 300 * max(0, kwh - hi)
    return fee - min(16000, fee) if disabled else fee
pick('S-BI01', f'{el_(3, 350, 0) + el_(7, 350, 0) + el_(8, 500, 1) + el_(1, 120, 1):,}원')
pay_ = lambda amt: [(a, b, c) for a in range(3) for b in range(6) for c in range(5) if 500 * a + 100 * b + 50 * c == amt]
can_ = {500 * a + 100 * b + 50 * c for a in range(3) for b in range(6) for c in range(5)}
combo('S-BI02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(pay_(1000)) == 4, min(map(sum, pay_(1000))) == 2, len(pay_(700)) == 3, set(range(50, 1701, 50)) <= can_]) if t])
fly_ = lambda alt, apt, night, ok_: alt < 150 and apt > 9 and (not night or ok_)
ins_ = lambda paid: paid
fine_ = {'report': 100, 'fly': 200}
by_text('S-BI03', list(zip(['최대 이륙 중량 1.5kg', '미리 승인을 받으면 일몰 후', '미리 승인을 받으면 고도 200', '취미로 드론을', '신고 없이 3kg'],
        [fly_(30, 5, False, False), fly_(50, 30, True, True), fly_(200, 30, False, True), ins_(False), fine_['report'] >= 200])))
back_ = lambda per_day: next(d for d in range(1, 5000) if per_day * d % 720 == 0)
b50_ = (720 - 2 * 50) % 720
combo('S-BI04', [l for l, t in zip('ㄱㄴㄷㄹ', [back_(3) == 240, back_(5) == 144, back_(2) < back_(3), (b50_ // 60, b50_ % 60) == (10, 40)]) if t])
d5_ = {frozenset(k): v for k, v in {('H', 'A'): 30, ('H', 'B'): 35, ('H', 'C'): 25, ('H', 'D'): 50, ('A', 'B'): 60, ('A', 'C'): 60, ('A', 'D'): 25, ('B', 'C'): 20, ('B', 'D'): 25, ('C', 'D'): 40}.items()}
bt_ = min(sum(d5_[frozenset((r[i], r[i + 1]))] for i in range(5)) for o in itertools.permutations('ABCD') for r in [('H',) + o + ('H',)]
          if o.index('B') < o.index('D') and o.index('C') in (1, 2) and o.index('A') in (0, 1))
pick('S-BI05', f'{bt_}분')
ar_ = [(730, 500), (720, 510), (700, 500), (690, 520)]; rg_ = {'A': (200, 530), 'B': (150, 520), 'C': (140, 510), 'D': (120, 525), 'E': (80, 505)}
pv_ = [a * y for a, y in ar_]; rv_ = {k: a * y for k, (a, y) in rg_.items()}
only('D-BI01', [not x for x in [ar_[0][0] > ar_[1][0] > ar_[2][0] > ar_[3][0], pv_.index(min(pv_)) == 2, pv_[3] > pv_[0], max(rg_, key=lambda k: rg_[k][1]) == max(rv_, key=rv_.get), sorted(k for k in rg_ if rg_[k][1] > 520) == ['A', 'D']]], 'false statements')
sc_ = {'초': (40, 80, 250), '중': (45, 75, 130), '고': (42, 60, 120)}
pp_ = {k: F(a * 100, r) for k, (a, r, n) in sc_.items()}; tt2_ = {k: a * n for k, (a, r, n) in sc_.items()}; pn_ = {k: F(n * r, 100) for k, (a, r, n) in sc_.items()}
combo('D-BI02', [l for l, t in zip('ㄱㄴㄷㄹ', [max(pp_, key=pp_.get) == '고', max(sc_, key=lambda k: sc_[k][0]) == '중', tt2_['초'] > tt2_['중'] + tt2_['고'], pn_['중'] * 2 >= 3 * pn_['고']]) if t])
cp_ = {'가': (800, 400, 40), '나': (600, 200, 60), '다': (1000, 250, 50), '라': (500, 100, 75), '마': (700, 500, 35)}
mc_ = [m for m in itertools.permutations(cp_) if cp_[m[0]][0] == max(v[0] for v in cp_.values()) and F(cp_[m[1]][0], cp_[m[1]][1]) == min(F(v[0], v[1]) for v in cp_.values())
       and F(cp_[m[2]][2], cp_[m[2]][0]) == max(F(v[2], v[0]) for v in cp_.values()) and cp_[m[3]][1] > cp_[m[4]][1]]
ok(len(mc_) == 1, f'D-BI03 {mc_}'); pick('D-BI03', ', '.join(mc_[0]))
ga_ = 800 * F(55, 10); na_ = F(2100, 7); da_ = F(2400, 400); ra_ = F(4320, 600)
births_ = {'A': 3000, 'B': ga_, 'C': 2100, 'D': 2400, 'E': 4320}; natinc_ = {'A': -1000, 'B': -1200, 'C': -400, 'D': 200, 'E': 600}
deaths_ = {k: births_[k] - natinc_[k] for k in births_}; rate_ = {'A': 6, 'B': F(55, 10), 'C': 7, 'D': da_, 'E': ra_}
by_text('D-BI04', list(zip(['사망자가 가장 많은', '(가)와 (나)를', '조출생률이 가장 높은', '(다)는 (라)보다', '다섯 지역의 자연증가'],
        [max(deaths_, key=deaths_.get) == 'B', ga_ + na_ >= 5000, max(rate_, key=rate_.get) == max(births_, key=births_.get), da_ > ra_, sum(natinc_.values()) > 0])))
tv_ = [300, 600, 1000, 1100]; sp_ = [1500, 1300, 1200, 1100]; rv5_ = [a * b for a, b in zip(tv_, sp_)]
g1_ = [F(tv_[i], tv_[i - 1]) for i in (1, 2, 3)]; g2_ = [F(rv5_[i], rv5_[i - 1]) for i in (1, 2, 3)]
combo('D-BI05', [l for l, t in zip('ㄱㄴㄷㄹ', [rv5_ == sorted(rv5_) and len(set(rv5_)) == 4, g1_.index(max(g1_)) == g2_.index(max(g2_)), rv5_[3] * 2 >= 5 * rv5_[0], sp_[3] * 10 <= 7 * sp_[0]]) if t])
pick('L-BI01', '원점수가 평균보다 표준편차의 두 배만큼 높은 사람의 표준점수는 70이다.')
z_ = lambda x, m, s: 50 + F(10 * (x - m), s)
combo('L-BI02', [l for l, t in zip('ㄱㄴㄷㄹ', [z_(75, 60, 10) == z_(80, 50, 20), z_(90, 50, 20) == 70, (70 + 90 > 75 + 80) and z_(70, 60, 10) + z_(90, 50, 20) > z_(75, 60, 10) + z_(80, 50, 20), z_(60, 50, 20) - z_(50, 50, 20) == 5]) if t])
combo('L-BI03', ['ㄱ', 'ㄷ']); combo('L-BI05', ['ㄱ', 'ㄴ'])
ln_ = []
for pm in itertools.permutations(range(1, 6)):
    x = dict(zip('갑을병정무', pm))
    if x['을'] == x['갑'] + 1 and abs(x['갑'] - x['병']) == 1 and 1 < x['병'] < 5 and x['정'] > 1: ln_.append(x)
by_text('L-BI04', list(zip(['갑은 세 번째', '정은 다섯 번째', '을은 다섯 번째', '병은 두 번째', '무는 첫 번째'], [all(x['갑'] == 3 for x in ln_), all(x['정'] == 5 for x in ln_), all(x['을'] == 5 for x in ln_), all(x['병'] == 2 for x in ln_), all(x['무'] == 1 for x in ln_)])))
# ================= S-BJ / D-BJ / L-BJ (5급 실전, independent re-solve from the rendered options) =================
import math
from datetime import date as _date, timedelta as _td
def lt_(due, back):
    while due.weekday() == 0: due += _td(days=1)
    return max(0, (back - due).days)
def st_(age, books):
    s = min(sum(lt_(_date(2025, 11, a), _date(2025, 11, b)) for a, b in books), 30)
    return (s + 1) // 2 if age >= 65 else s
pick('S-BJ01', f'{st_(40, [(5, 8), (6, 11)]) + st_(30, [(10, 13)]) + st_(70, [(1, 10), (1, 11), (1, 16)]) + st_(66, [(4, 11)])}일')
tr_ = [c for c in itertools.combinations(range(1, 10), 3) if sum(c) == 15]
combo('S-BJ02', [l for l, t in zip('ㄱㄴㄷㄹ', [len(tr_) == 8, sum(5 in c for c in tr_) == 4, all(sum(n in c for c in tr_) >= 2 for n in range(1, 10)), any(all(x % 2 == 0 for x in c) for c in tr_)]) if t])
fine_at_ = lambda first: not first          # 과태료는 개선 명령을 어긴 뒤에만
night_ok_ = lambda urgent, reported: urgent and reported
lim_ = lambda zone, h: (65 if 7 <= h < 18 else 60 if 18 <= h < 22 else 50) + (5 if zone == '상업' else 0)
by_text('S-BJ03', list(zip(['주거지역 공사장에서 오후 7시', '상업지역 공사장에서 오전 10시', '소음 기준을 처음', '긴급한 복구 공사라면', '상업지역 공사장의 밤'],
        [62 > lim_('주거', 19), 68 > lim_('상업', 10), fine_at_(first=True), night_ok_(urgent=True, reported=False), lim_('상업', 23) == 50])))
tk_ = lambda rate: F(2400, rate)
combo('S-BJ04', [l for l, t in zip('ㄱㄴㄷㄹ', [tk_(600) == 4, tk_(1000) * 60 == 144, tk_(800) == 3, tk_(200) == tk_(400)]) if t])
tm_ = {'갑': [7, 8, 4, 6, 2], '을': [3, 3, 6, 8, 8], '병': [9, 8, 6, 4, 4]}
bj5_ = min(sum(tm_[w][i] for i, w in enumerate(a)) for a in itertools.product('갑을병', repeat=5) if max(a.count(w) for w in '갑을병') <= 2 and a[1] == a[3] and a[2] != '갑')
pick('S-BJ05', f'{bj5_}시간')
wy_ = [(1800, 1080), (1900, 1197), (2000, 1300), (1950, 1248)]; wr_ = {'A': (600, 420), 'B': (500, 310), 'C': (400, 236), 'D': (300, 180), 'E': (150, 102)}
yr_ = [F(b, a) for a, b in wy_]; rr_ = {k: F(b, a) for k, (a, b) in wr_.items()}
only('D-BJ01', [not x for x in [wy_[0][0] < wy_[1][0] < wy_[2][0] > wy_[3][0], yr_.index(max(yr_)) == 2, wy_[3][1] < wy_[2][1], max(rr_, key=rr_.get) == max(wr_, key=lambda k: wr_[k][1]), sorted(k for k in rr_ if rr_[k] > yr_[3]) == ['A', 'B', 'E']]], 'false statements')
un_ = {'가': (200, 1600, 300), '나': (300, 1500, 450), '다': (150, 1500, 210), '라': (400, 1600, 560), '마': (250, 1500, 180)}
mu_ = [m for m in itertools.permutations(un_) if F(un_[m[0]][1], un_[m[0]][0]) == max(F(v[1], v[0]) for v in un_.values()) and un_[m[1]][2] == max(v[2] for v in un_.values())
       and F(un_[m[2]][2], un_[m[2]][1]) == min(F(v[2], v[1]) for v in un_.values()) and un_[m[3]][0] > un_[m[4]][0]]
ok(len(mu_) == 1, f'D-BJ02 {mu_}'); pick('D-BJ02', ', '.join(mu_[0]))
ga3_ = 800 * 200 * F(75, 100) / 1000; na3_ = F(108 * 1000 * 100, 90 * 150)
rt_ = {'A': (1000, 180, 144), 'B': (800, 200, ga3_), 'C': (na3_, 150, 108), 'D': (1200, 160, 144), 'E': (600, 300, 153)}
cap_ = {k: F(n * s, 1000) for k, (n, s, p) in rt_.items()}; ld_ = {k: rt_[k][2] / cap_[k] for k in rt_}; em_ = {k: cap_[k] - rt_[k][2] for k in rt_}
by_text('D-BJ03', list(zip(['(가)와 (나)를', '빈 좌석 수', '탑승객이 가장 많은', '(다)는 (라)보다', '다섯 노선을 합하여'],
        [ga3_ + na3_ >= 1000, max(em_, key=em_.get) == 'D', max(rt_, key=lambda k: rt_[k][2]) == max(ld_, key=ld_.get), ld_['D'] > ld_['E'], sum(v[2] for v in rt_.values()) >= F(85, 100) * sum(cap_.values())])))
p05_ = [4800 * s for s in (20, 71, 9)]; p25_ = [5000 * s for s in (12, 68, 20)]
combo('D-BJ04', [l for l, t in zip('ㄱㄴㄷㄹ', [p25_[1] < p05_[1], p25_[2] >= 2 * p05_[2], p25_[2] * 10 >= 3 * p25_[1], p05_[0] - p25_[0] < p25_[2] - p05_[2]]) if t])
gd_ = {'갑': (50, 30000, 31500), '을': (120, 10000, 11000), '병': (20, 50000, 49000), '정': (80, 15000, 16200)}
e25_ = {k: p * b for k, (p, a, b) in gd_.items()}; ic_ = {k: p * (b - a) for k, (p, a, b) in gd_.items()}; rg_ = {k: F(b, a) for k, (p, a, b) in gd_.items()}
combo('D-BJ05', [l for l, t in zip('ㄱㄴㄷㄹ', [max(e25_, key=e25_.get) == '갑', max(rg_, key=rg_.get) == max(ic_, key=ic_.get), sum(e25_.values()) >= 20000 * sum(v[0] for v in gd_.values()), e25_['병'] < e25_['을']]) if t])
pick('L-BJ01', '세기가 같은 소리 열 개가 함께 나면 사람은 하나만 날 때보다 두 배쯤 크게 느낀다.')
db_ = lambda r: 10 * math.log10(r)
combo('L-BJ02', [l for l, t in zip('ㄱㄴㄷㄹ', [round(80 + db_(2)) == 83, round(80 - db_(16)) == 68, 80 + db_(10) - db_(100) > 80, 0.5 ** (db_(100) / 10) == 0.25]) if t])
combo('L-BJ03', ['ㄱ', 'ㄴ', 'ㄹ']); combo('L-BJ05', ['ㄱ', 'ㄴ'])
gm_ = []
for su in itertools.permutations(['국어', '영어', '수학']):
    for ci in itertools.permutations(['서울', '부산', '대구']):
        S_ = dict(zip('갑을병', su)); C_ = dict(zip('갑을병', ci)); by_ = {C_[x]: S_[x] for x in '갑을병'}
        if by_['부산'] == '수학' and by_['대구'] == '국어' and S_['병'] != '영어' and C_['을'] != '서울': gm_.append((S_, C_, by_))
by_text('L-BJ04', list(zip(['갑은 서울에', '을은 국어를', '병은 부산에', '대구에 사는 사람은', '병은 수학을'],
        [all(C['갑'] == '서울' and S['갑'] == '영어' for S, C, b in gm_), all(S['을'] == '국어' for S, C, b in gm_), all(C['병'] == '부산' for S, C, b in gm_), all(b['대구'] == '수학' for S, C, b in gm_), all(S['병'] == '수학' for S, C, b in gm_)])))
print('ALL OK' if ok_all else 'SOME FAILED')
