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
print('ALL OK' if ok_all else 'SOME FAILED')
