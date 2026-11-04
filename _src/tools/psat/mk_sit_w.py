# 상황판단 S-W01..S-W10 — 5급 수준(중·상) 정예 문항. 모든 답은 아래 코드가 다시 계산하거나 전수 조사로 확인한다. see psatkit.py
import itertools, datetime as dt
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-w.js'

# ---------------------------------------------------------------- S-W01 연비 표기 환산 (짝 고르기)
KM = 600; PRICE = {'휘발유': 1700, '경유': 1600, 'LPG': 1000}
CAR1 = {'A': ('휘발유', 'kmL', F(25, 2)), 'B': ('경유', 'L100', 6), 'C': ('LPG', 'kmL', 8), 'D': ('휘발유', 'L100', 5)}
def litres(kind, v, misread=False):
    if kind == 'kmL' or misread: return F(KM) / v
    return F(KM) * v / 100
cost1 = {k: litres(kind, v) * PRICE[f] for k, (f, kind, v) in CAR1.items()}
check(cost1 == {'A': 81600, 'B': 57600, 'C': 75000, 'D': 51000}, f'S-W01 {cost1}'); unique_min(cost1, 'S-W01')
best1 = min(cost1, key=cost1.get)
mis1 = {k: litres(kind, v, True) * PRICE[f] for k, (f, kind, v) in CAR1.items()}
check(min(mis1, key=mis1.get) == 'C' and mis1['C'] == 75000, f'S-W01 trap {mis1}')     # 표기를 모두 km/L로 읽으면 C를 고른다
opts1 = ['D, 51,000원', 'B, 57,600원', 'C, 75,000원', 'A, 81,600원', 'D, 204,000원']
ans1 = opts1.index(f'{best1}, {int(cost1[best1]):,}원')
items.append({
 'id': 'S-W01', 'type': '상황판단 · 단위 환산', 'stem': '다음 글을 근거로 판단할 때, 甲이 고를 차량과 그 연료비를 바르게 짝지은 것은?',
 'body': [p('甲은 A~D 차량 가운데 하나를 빌려 600km를 달리려 한다. 甲은 연료비가 가장 적은 차량을 고른다. 차량의 연비는 차량마다 다른 방식으로 표시되어 있다.'),
          table(['차량', '연료', '연비 표시'], [['A', '휘발유', '1L당 12.5km'], ['B', '경유', '100km당 6L'], ['C', 'LPG', '1L당 8km'], ['D', '휘발유', '100km당 5L']], caption='차량별 연료와 연비', num=False),
          box('', ['연료 가격(1L당): 휘발유 1,700원, 경유 1,600원, LPG 1,000원'], plain=True)],
 'options': opts1, 'answer': ans1,
 'explain': [
  steps(['필요한 연료량: A 600 ÷ 12.5 = 48L, B 600 × 6 ÷ 100 = 36L, C 600 ÷ 8 = 75L, D 600 × 5 ÷ 100 = 30L.', '연료비: A 81,600원, B 57,600원, C 75,000원, <b>D 51,000원</b>.']),
  p(f'따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> ‘100km당 L’는 작을수록 좋은 표시이다. 이를 ‘1L당 km’로 읽으면 D가 1L당 5km로 가장 나빠 보이고(204,000원) C를 고르게 된다. 연료 가격만 보고 LPG(C)를 고르는 것도 함정이다.')]})

# ---------------------------------------------------------------- S-W02 시차 (도착 현지 시각)
OFF = {'서울': 9, '갑시': 4, '을시': 1}
dep_local = dt.datetime(2026, 3, 10, 22, 0)
utc = dep_local - dt.timedelta(hours=OFF['서울'])
arr_utc = utc + dt.timedelta(hours=9 + 3 + 7)
arr_local = arr_utc + dt.timedelta(hours=OFF['을시'])
check(arr_local == dt.datetime(2026, 3, 11, 9, 0), f'S-W02 {arr_local}')
no_tz = dep_local + dt.timedelta(hours=19); no_wait = arr_local - dt.timedelta(hours=3); wrong_sign = dep_local + dt.timedelta(hours=19 + 8)
def kt(t): return f'{t.month}월 {t.day}일 ' + ('오전' if t.hour < 12 else '오후') + f' {t.hour % 12 or 12}시'
vals2 = sorted({arr_local, no_tz, no_wait, wrong_sign, dt.datetime(2026, 3, 11, 3, 0)})
check(len(vals2) == 5, f'S-W02 {vals2}')
items.append({
 'id': 'S-W02', 'type': '상황판단 · 시각 계산', 'stem': '다음 글을 근거로 판단할 때, 甲이 을시에 도착하는 현지 시각은?',
 'body': [p('甲은 서울에서 현지 시각 3월 10일 오후 10시에 출발하여 갑시를 거쳐 을시로 간다. 서울에서 갑시까지는 9시간을 날아가고, 갑시 공항에서 3시간을 기다린 뒤, 갑시에서 을시까지 7시간을 날아간다.'),
          box('', ['각 도시의 현지 시각은 세계 표준시보다 서울은 9시간, 갑시는 4시간, 을시는 1시간 빠르다.'], plain=True)],
 'options': [kt(v) for v in vals2], 'answer': vals2.index(arr_local),
 'explain': [
  steps(['출발: 서울 3월 10일 오후 10시 = 세계 표준시 3월 10일 오후 1시.', '이동 시간 합: 9 + 3 + 7 = 19시간 → 세계 표준시 3월 11일 오전 8시.', '을시 현지 시각 = 세계 표준시 + 1시간 → <b>3월 11일 오전 9시</b>.']),
  p(f'따라서 정답은 <b>{CIRC[vals2.index(arr_local)]}</b>이다. <b>함정</b> 시차를 빼먹으면 오후 5시, 대기 3시간을 빼먹으면 오전 6시, 시차를 거꾸로 더하면 3월 12일 오전 1시가 된다. 경유지(갑시)의 시차는 답에 영향을 주지 않는다.')]})

# ---------------------------------------------------------------- S-W03 사업 고르기 (예산 제약 최적화, 전수 조사)
J3 = {'A': (4, 8), 'B': (3, 5), 'C': (5, 9), 'D': (2, 3), 'E': (6, 10)}   # 비용(억 원), 효과(점)
BUD = 10
feas3 = [s for r in range(6) for s in itertools.combinations(J3, r) if sum(J3[k][0] for k in s) <= BUD and not ('A' in s and 'C' in s)]
val3 = lambda s: sum(J3[k][1] for k in s)
best3 = max(val3(s) for s in feas3)
check(best3 == 18 and [s for s in feas3 if val3(s) == best3] == [('A', 'E')], f'S-W03 {best3}')
g, c = [], 0
for k in sorted(J3, key=lambda k: -F(J3[k][1], J3[k][0])):
    if c + J3[k][0] <= BUD and not (k == 'C' and 'A' in g) and not (k == 'A' and 'C' in g): g.append(k); c += J3[k][0]
check(sorted(g) == ['A', 'B', 'D'] and val3(g) == 16, f'S-W03 greedy {g}')
nox = max(val3(s) for r in range(6) for s in itertools.combinations(J3, r) if sum(J3[k][0] for k in s) <= BUD)
check(nox == 18, f'S-W03 no-exclusion best {nox}')
vals3 = [15, 16, 17, 18, 19]
items.append({
 'id': 'S-W03', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 갑 기관이 얻을 수 있는 효과의 합의 최댓값은?',
 'body': [p('갑 기관은 예산 10억 원 안에서 A~E 사업 가운데 몇 개를 골라 추진한다. 각 사업은 한 번만 고를 수 있고, 고른 사업의 비용 합은 예산을 넘을 수 없다. A 사업과 C 사업은 대상이 겹쳐 함께 추진할 수 없다.'),
          table(['사업', '비용', '효과'], [[k, f'{c_}억 원', f'{v}점'] for k, (c_, v) in J3.items()], caption='사업별 비용과 효과', num=False)],
 'options': [f'{v}점' for v in vals3], 'answer': vals3.index(best3),
 'explain': [
  steps(['비용 1억 원당 효과: A 2, C 1.8, B·E 약 1.67, D 1.5.', '효율이 높은 순서로 담으면 A(4) → C는 A와 함께 못 함 → B(3) → E는 예산 초과 → D(2): A·B·D = 16점. 그러나 이것이 최댓값은 아니다.', '예산 10억 원을 남김없이 쓰는 조합을 따지면: A + E = 18점, B + C + D = 17점, A + B + D = 16점, C + E는 11억 원으로 초과.']),
  p(f'최댓값은 A + E의 <b>18점</b>이다. 따라서 정답은 <b>{CIRC[vals3.index(best3)]}</b>이다. 가능한 모든 조합을 따져 확인하였다. <b>함정</b> 효율 순으로 담는 방법은 예산이 남을 때 최적이 아닐 수 있다.')]})

# ---------------------------------------------------------------- S-W04 출장 여비 (법조문 계산)
def trip(half=True, cap=True, days=4):
    il = sum((1 if (d == 1 and half) else 2) for d in range(1, days + 1))
    meal = F(5, 2) * days
    hotel = [9, 6]
    room = sum(min(h, 7) if cap else h for h in hotel) + 2
    return il + meal + room
ans4 = trip()
alts4 = {'정답': ans4, '공용 차량 감액을 빠뜨리면': trip(half=False), '숙박비 상한을 빠뜨리면': trip(cap=False), '둘 다 빠뜨리면': trip(False, False)}
check(ans4 == 32 and alts4['공용 차량 감액을 빠뜨리면'] == 33 and alts4['숙박비 상한을 빠뜨리면'] == 34 and alts4['둘 다 빠뜨리면'] == 35, f'S-W04 {alts4}')
vals4 = sorted(set(alts4.values()) | {F(59, 2)})
check(len(vals4) == 5, f'S-W04 {vals4}')
def man4(x): return f'{int(x)}만 원' if x == int(x) else f'{int(x)}만 5천 원'
items.append({
 'id': 'S-W04', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲이 받는 여비의 총액은?',
 'body': [law('<p><b>제○○조(여비)</b> ① 출장자에게는 일비, 식비, 숙박비를 지급한다.<br>② 일비와 식비는 출장 일수에 따라 지급하며, 일비는 1일 2만 원, 식비는 1일 2만 5천 원으로 한다. 다만 공용 차량을 이용한 날의 일비는 그 절반으로 한다.<br>'
              '③ 숙박비는 실제 숙박한 밤마다 실제 든 비용을 지급하되, 1박당 7만 원을 넘을 수 없다.<br>④ 친지의 집 등에서 숙박하여 숙박비를 쓰지 않은 경우에는 제3항에도 불구하고 1박당 2만 원을 지급한다.</p>'),
          box('상황', ['甲은 3박 4일 동안 출장을 다녀왔다.', '1일째에는 공용 차량으로 이동하였고, 그날 밤 숙박비로 9만 원을 썼다.', '2일째 밤에는 숙박비로 6만 원을 썼다.', '3일째 밤에는 친지의 집에서 숙박비를 쓰지 않고 묵었다.', '4일째에는 대중교통으로 돌아왔다.'], plain=True)],
 'options': [man4(v) for v in vals4], 'answer': vals4.index(ans4),
 'explain': [
  steps(['일비: 1일째 공용 차량 → 1만 원, 2~4일째 2만 원씩 6만 원 → 7만 원.', '식비: 4일 × 2만 5천 원 = 10만 원.', '숙박비: 1박 9만 원 → 상한 7만 원, 2박 6만 원, 3박 친지 집 2만 원 → 15만 원.']),
  p(f'총액 7 + 10 + 15 = <b>32만 원</b>. 따라서 정답은 <b>{CIRC[vals4.index(ans4)]}</b>이다. <b>함정</b> 감액(공용 차량)을 빠뜨리면 33만 원, 상한을 빠뜨리면 34만 원, 둘 다 빠뜨리면 35만 원이다.')]})

# ---------------------------------------------------------------- S-W05 보험 가입 (기대 비용, 옳은 것)
def ecost(prem, ded, prob, loss=3000):
    return prem + prob * min(ded, loss)
P5 = F(1, 100)
e5 = {'미가입': ecost(0, 3000, P5), 'A': ecost(25, 100, P5), 'B': ecost(15, 1000, P5)}
e5b = {k: v for k, v in {'미가입': ecost(0, 3000, 2 * P5), 'A': ecost(25, 100, 2 * P5), 'B': ecost(15, 1000, 2 * P5)}.items()}
check(e5 == {'미가입': 30, 'A': 26, 'B': 25} and e5b == {'미가입': 60, 'A': 27, 'B': 35}, f'S-W05 {e5} {e5b}')
unique_min(e5, 'S-W05'); unique_min(e5b, 'S-W05')
f5 = [min(e5, key=e5.get) == 'A', e5['미가입'] == 30, e5['B'] == 15, min(e5b, key=e5b.get) == 'B', 25 + 100 == 100]
one_true(f5, 1, 'S-W05')
items.append({
 'id': 'S-W05', 'type': '상황판단 · 기대값 판단', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [p('甲은 1년짜리 화재 보험 A, B 가운데 하나에 가입하거나 가입하지 않으려 한다. 甲의 가게에 1년 안에 화재가 날 확률은 1%이고, 화재가 나면 3,000만 원의 손해가 생긴다. 보험에 가입하면 화재 손해 가운데 자기부담금까지는 甲이 부담하고 나머지는 보험사가 보상한다.'),
          table(['보험', '보험료(1년)', '자기부담금'], [['A', '25만 원', '100만 원'], ['B', '15만 원', '1,000만 원']], caption='보험별 조건', num=False),
          box('', ['기대 비용 = 보험료 + 화재 확률 × 화재가 났을 때 甲이 부담하는 손해'], plain=True)],
 'options': ['기대 비용이 가장 적은 선택은 A에 가입하는 것이다.', '보험에 가입하지 않을 때의 기대 비용은 30만 원이다.', 'B에 가입할 때의 기대 비용은 15만 원이다.', '화재가 날 확률이 2%라면 기대 비용이 가장 적은 선택은 B에 가입하는 것이다.', '화재가 나면 A 가입자가 그해 부담하는 금액은 보험료를 합쳐 100만 원이다.'],
 'answer': 1,
 'explain': [
  p('<b>기대 비용</b> 미가입 0.01 × 3,000 = 30만 원, A 25 + 0.01 × 100 = 26만 원, B 15 + 0.01 × 1,000 = 25만 원.'),
  ox([(False, XX, 'B(25만 원)가 A(26만 원)보다 적다.'), (True, O, '0.01 × 3,000만 원 = 30만 원.'), (False, XX, '보험료 15만 원에 기대 자기부담 10만 원을 더해 25만 원이다.'),
      (False, XX, '확률 2%이면 미가입 60만 원, A 27만 원, B 35만 원으로 A가 가장 적다.'), (False, XX, '보험료 25만 원 + 자기부담금 100만 원 = 125만 원이다.')]),
  p('따라서 정답은 <b>②</b>이다. <b>빠른 풀이</b>: 보험끼리의 비교는 ‘보험료 차이’와 ‘확률 × 자기부담금 차이’만 본다. A는 B보다 보험료가 10만 원 비싸고, 기대 자기부담이 9만 원(1% 기준) 적다.')]})

# ---------------------------------------------------------------- S-W06 리그전 (반드시 참, 전수 조사)
TM = 'ABCD'; G6 = list(itertools.combinations(TM, 2)); PTS6 = {'A': 7, 'B': 4, 'C': 4, 'D': 1}
def res6():
    for out in itertools.product('WDL', repeat=6):            # 앞 팀 기준 승(W)·무(D)·패(L)
        pt = dict.fromkeys(TM, 0)
        for (a, b), o in zip(G6, out):
            if o == 'W': pt[a] += 3
            elif o == 'L': pt[b] += 3
            else: pt[a] += 1; pt[b] += 1
        if pt == PTS6: yield dict(zip(G6, out))
S6 = list(res6())
check(len(S6) == 3, f'S-W06 {S6}')
al6 = lambda f: all(f(s) for s in S6)
t6 = {'ㄱ': al6(lambda s: s[('A', 'C')] == 'W'), 'ㄴ': al6(lambda s: s[('B', 'C')] != 'L' or s[('A', 'B')] == 'D'), 'ㄷ': al6(lambda s: s[('B', 'C')] == 'D'), 'ㄹ': al6(lambda s: sum(o == 'D' for o in s.values()) == 2)}
check(t6 == {'ㄱ': False, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True}, f'S-W06 {t6}')
opts6 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄷ', 'ㄴ, ㄹ', 'ㄷ, ㄹ']; ans6 = combo(t6, opts6, 'S-W06')
items.append({
 'id': 'S-W06', 'type': '상황판단 · 리그전 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 반드시 참인 것만을 모두 고르면?',
 'body': [p('A~D 네 팀이 서로 한 번씩 경기를 하는 리그전을 치렀다. 이기면 3점, 비기면 1점, 지면 0점을 받는다. 리그전이 끝난 뒤 승점은 A 7점, B 4점, C 4점, D 1점이었다.'),
          box('보기', ['ㄱ. A는 C를 이겼다.', 'ㄴ. C가 B를 이겼다면 A와 B는 비겼다.', 'ㄷ. B와 C는 비겼다.', 'ㄹ. 비긴 경기는 모두 2경기이다.'])],
 'options': opts6, 'answer': ans6,
 'explain': [
  steps(['경기는 6경기이고, 이긴 경기는 3점, 비긴 경기는 2점을 만든다. 승점 합이 16점이므로 비긴 경기는 18 − 16 = <b>2경기</b>이다.', 'D(1점)는 1무 2패, A(7점)는 2승 1무, B·C(4점)는 각각 1승 1무 1패이다.',
         'A가 누구와 비겼는지에 따라 세 경우가 나온다: A–D 무승부(B–C 무승부), A–C 무승부(B–D 무승부, B가 C를 이김), A–B 무승부(C–D 무승부, C가 B를 이김).']),
  bx([('ㄱ', 'A가 C를 이김', False, NT, 'A–C가 무승부인 경우가 있다.'), ('ㄴ', 'C가 B를 이기면 A–B 무승부', True, T, 'C가 B를 이기는 경우는 A–B 무승부인 경우뿐이다.'),
      ('ㄷ', 'B–C 무승부', False, NT, '세 경우 가운데 하나에서만 비겼다.'), ('ㄹ', '무승부 2경기', True, T, '승점 합으로 정해진다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans6]}</b>이다. 729가지 결과를 모두 따져도 이 세 경우뿐이다. <b>빠른 풀이</b>: 리그전은 승점 합 = 3 × 경기 수 − 무승부 수부터 세운다.')]})

# ---------------------------------------------------------------- S-W07 선정 방식 비교 (규칙 계산, 보기)
VOTE = [('ABCD', 3), ('BCDA', 2), ('CBDA', 2)]          # (선호 순서, 위원 수)
def plural(v):
    c = {x: 0 for x in 'ABCD'}
    for o, n in v: c[o[0]] += n
    return c
def borda(v):
    c = {x: 0 for x in 'ABCD'}
    for o, n in v:
        for i, x in enumerate(o): c[x] += (3 - i) * n
    return c
def pair_winner(v):
    w = [x for x in 'ABCD' if all(sum(n for o, n in v if o.index(x) < o.index(y)) * 2 > sum(n for o, n in v) for y in 'ABCD' if y != x)]
    return w[0] if w else None
pl, bo = plural(VOTE), borda(VOTE)
check(pl == {'A': 3, 'B': 2, 'C': 2, 'D': 0} and bo == {'A': 9, 'B': 16, 'C': 13, 'D': 4} and pair_winner(VOTE) == 'B', f'S-W07 {pl} {bo}')
v2 = [('ABCD', 3), ('BCDA', 2), ('CBDA', 1), ('BCDA', 1)]; pl2 = plural(v2)
t7 = {'ㄱ': max(pl, key=pl.get) == 'A' and sorted(pl.values())[-1] != sorted(pl.values())[-2], 'ㄴ': sorted(bo, key=bo.get, reverse=True)[1] == 'C', 'ㄷ': pair_winner(VOTE) == 'B',
      'ㄹ': [k for k in pl2 if pl2[k] == max(pl2.values())] == ['B']}
check(t7 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and pl2['A'] == pl2['B'] == 3, f'S-W07 {t7}')
opts7 = ['ㄱ, ㄴ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans7 = combo(t7, opts7, 'S-W07')
items.append({
 'id': 'S-W07', 'type': '상황판단 · 규칙 계산', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('위원 7명이 후보 A~D에 대해 각자 1위부터 4위까지 순위를 매겼다. 결과는 다음과 같다.'),
          table(['위원', '1위', '2위', '3위', '4위'], [['1~3번(3명)', 'A', 'B', 'C', 'D'], ['4~5번(2명)', 'B', 'C', 'D', 'A'], ['6~7번(2명)', 'C', 'B', 'D', 'A']], caption='위원별 순위', num=False),
          box('', ['방식 1: 1위 표를 가장 많이 받은 후보를 뽑는다.', '방식 2: 위원마다 1위에 3점, 2위에 2점, 3위에 1점, 4위에 0점을 주고 합계가 가장 큰 후보를 뽑는다.', '방식 3: 다른 모든 후보와 일대일로 비교했을 때 각각 과반수의 위원이 더 높은 순위를 준 후보를 뽑는다.'], plain=True),
          box('보기', ['ㄱ. 방식 1로는 A가 뽑힌다.', 'ㄴ. 방식 2의 점수 합계가 두 번째로 큰 후보는 C이다.', 'ㄷ. 방식 3으로는 B가 뽑힌다.', 'ㄹ. 6번 위원이 B를 1위, C를 2위로 바꾸어 매겼다면 방식 1로도 B만 뽑힌다.'])],
 'options': opts7, 'answer': ans7,
 'explain': [
  p('<b>방식 1</b> 1위 표: A 3, B 2, C 2, D 0 → A. <b>방식 2</b> A 3×3 = 9, B 2×3 + 3×2 + 2×2 = 16, C 1×3 + 2×2 + 3×2 = 13, D 0 + 1×2 + 1×2 = 4 → B. <b>방식 3</b> B는 A에게 4 : 3, C에게 5 : 2, D에게 7 : 0으로 앞선다 → B.'),
  bx([('ㄱ', '방식 1 = A', True, O, '1위 표 3표로 가장 많다.'), ('ㄴ', '방식 2 두 번째 = C', True, O, 'B 16 &gt; C 13 &gt; A 9 &gt; D 4.'), ('ㄷ', '방식 3 = B', True, O, 'B만 모든 후보에게 과반수로 앞선다.'),
      ('ㄹ', '바꾼 뒤 방식 1', False, XX, '1위 표가 A 3, B 3, C 1로 A와 B가 같아 B만 뽑히지 않는다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans7]}</b>이다. <b>함정</b> 1위 표만 보는 방식은 2위 이하의 선호를 무시한다. 같은 표에서도 방식에 따라 결과가 달라진다.')]})

# ---------------------------------------------------------------- S-W08 민원 처리 기한 (법조문 적용, 옳은 것)
recv = dt.date(2026, 11, 4)
check(recv.weekday() == 2, 'S-W08 recv is Wednesday')
def addwork(d0, n_):
    d = d0
    while n_:
        d += dt.timedelta(days=1)
        if d.weekday() < 5: n_ -= 1           # 2026년 11월에는 공휴일이 없다
    return d
due8 = addwork(recv, 7); ext8 = addwork(due8, 7)
check(due8 == dt.date(2026, 11, 13) and ext8 == dt.date(2026, 11, 24) and recv + dt.timedelta(days=7) == dt.date(2026, 11, 11) and due8 + dt.timedelta(days=7) == dt.date(2026, 11, 20), f'S-W08 {due8} {ext8}')
f8 = [False, due8 == dt.date(2026, 11, 13), ext8 == dt.date(2026, 11, 20), False, False]
one_true(f8, 1, 'S-W08')
items.append({
 'id': 'S-W08', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글과 <상황>을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(처리 기간)</b> ① 행정기관은 민원을 접수한 날부터 7일 안에 처리하여야 한다.<br>② 행정기관은 부득이한 사유로 제1항의 기간 안에 처리할 수 없는 경우에는 그 기간이 끝난 다음 날부터 7일 안에서 한 차례만 처리 기간을 연장할 수 있다. 이 경우 연장 사유와 처리 예정일을 민원인에게 지체 없이 알려야 한다.</p>'
              '<p><b>제○○조(기간의 계산)</b> 이 법의 처리 기간을 셀 때에는 민원을 접수한 날은 넣지 아니하고, 토요일·일요일과 공휴일은 넣지 아니한다.</p>'),
          box('상황', ['A 행정기관은 2026년 11월 4일(수)에 甲의 민원을 접수하였다.', '2026년 11월에는 공휴일이 없다.'], plain=True)],
 'options': ['甲의 민원은 2026년 11월 11일까지 처리하여야 한다.', '연장하지 않는다면 甲의 민원은 2026년 11월 13일까지 처리하여야 한다.', '처리 기간을 연장하면 甲의 민원은 2026년 11월 20일까지 처리하면 된다.', '처리 기간은 부득이한 사유가 있으면 두 차례까지 연장할 수 있다.', '처리 기간을 연장할 때 그 사실을 甲에게 알릴 필요는 없다.'],
 'answer': 1,
 'explain': [
  steps(['접수일(11월 4일, 수)은 넣지 않는다 → 5일(목) 1, 6일(금) 2, 9일(월) 3, 10일 4, 11일 5, 12일 6, 13일(금) 7 → 기한 <b>11월 13일</b>.', '연장: 기한 다음 날부터 평일 7일 → 16일(월) 1 … 20일(금) 5, 23일(월) 6, 24일(화) 7 → <b>11월 24일</b>.']),
  ox([(False, XX, '달력의 날짜로 7일을 센 값이다. 토요일·일요일은 넣지 않는다.'), (True, O, '평일 7일째가 11월 13일이다.'), (False, XX, '연장 기한은 11월 24일이다(주말 제외).'),
      (False, XX, '“한 차례만” 연장할 수 있다.'), (False, XX, '연장 사유와 처리 예정일을 “지체 없이 알려야 한다”.')]),
  p('따라서 정답은 <b>②</b>이다. <b>함정</b> 기간 계산 규정(첫날 불산입, 주말 제외)을 두 번 모두 적용한다.')]})

# ---------------------------------------------------------------- S-W09 검사 숫자 (독해 계산)
def check_digit(d6, w_odd=3, w_even=1, complement=True):
    s = sum(d * (w_odd if i % 2 == 0 else w_even) for i, d in enumerate(d6))
    return (10 - s % 10) % 10 if complement else s % 10
code9 = [5, 2, None, 4, 0, 9]; last9 = 9
sol9 = [x for x in range(10) if check_digit([5, 2, x, 4, 0, 9]) == last9]
trap_even = [x for x in range(10) if check_digit([5, 2, x, 4, 0, 9], 1, 3) == last9]
trap_comp = [x for x in range(10) if check_digit([5, 2, x, 4, 0, 9], complement=False) == last9]
check(sol9 == [7] and trap_even == [1] and trap_comp == [3], f'S-W09 {sol9} {trap_even} {trap_comp}')
vals9 = [1, 2, 3, 5, 7]
check(all(check_digit([5, 2, v, 4, 0, 9]) != last9 for v in vals9 if v != 7), 'S-W09 fillers wrong')
items.append({
 'id': 'S-W09', 'type': '상황판단 · 독해 계산', 'stem': '다음 글을 근거로 판단할 때, 상품 코드 ‘52□4099’의 □에 들어갈 숫자는?',
 'body': [p('갑사의 상품 코드는 일곱 자리 숫자이다. 앞의 여섯 자리는 상품을 나타내고, 마지막 일곱째 자리는 입력 실수를 잡아내기 위한 검사 숫자로 다음과 같이 정한다.'),
          box('', ['1단계: 첫째·셋째·다섯째 자리 숫자의 합에 3을 곱한다.', '2단계: 둘째·넷째·여섯째 자리 숫자의 합을 1단계의 값에 더한다.', '3단계: 2단계 값의 일의 자리 숫자를 10에서 뺀 값을 검사 숫자로 한다. 다만 일의 자리 숫자가 0이면 검사 숫자는 0이다.'], plain=True)],
 'options': [str(v) for v in vals9], 'answer': vals9.index(7),
 'explain': [
  steps(['□를 x라 하면 1단계: (5 + x + 0) × 3 = 15 + 3x.', '2단계: 15 + 3x + (2 + 4 + 9) = 30 + 3x.', '3단계: 검사 숫자가 9이므로 2단계 값의 일의 자리는 1이다 → 3x의 일의 자리가 1 → x = 7(3 × 7 = 21).']),
  p(f'확인: (5 + 7 + 0) × 3 + 15 = 51, 10 − 1 = 9. 따라서 정답은 <b>{CIRC[vals9.index(7)]}</b>이다. <b>함정</b> 3을 짝수째 자리에 곱하면 1, 3단계의 ‘10에서 뺀다’를 빠뜨리면 3이 나온다.')]})

# ---------------------------------------------------------------- S-W10 회의실 요금제 (비용 최소화)
PLAN = {'시간권': (1, 2), '반일권': (4, 6), '일일권': (9, 10)}     # (이용 가능 시간, 요금 만 원)
def daycost(h, allowed=PLAN):
    best = None
    for a in range(0, 10):
        for b in range(0, 4):
            for c in range(0, 2):
                if a * 1 + b * 4 + c * 9 >= h and ('반일권' in allowed or b == 0) and ('일일권' in allowed or c == 0):
                    v = a * 2 + b * 6 + c * 10
                    best = v if best is None or v < best else best
    return best
USE = {'월': 3, '화': 5, '수': 9, '목': 2}
dc = {k: daycost(h) for k, h in USE.items()}
tot10 = sum(dc.values()); hourly = sum(2 * h for h in USE.values()); naive = sum(2 * h if h < 4 else (6 if h == 4 else 10) for h in USE.values())
check(dc == {'월': 6, '화': 8, '수': 10, '목': 4} and tot10 == 28 and hourly == 38 and naive == 30, f'S-W10 {dc} {tot10} {hourly} {naive}')
vals10 = [26, 28, 30, 34, 38]
items.append({
 'id': 'S-W10', 'type': '상황판단 · 비용 최소화', 'stem': '다음 글을 근거로 판단할 때, 甲이 내야 하는 이용 요금의 최솟값은?',
 'body': [p('甲은 다음 주 월~목요일에 공유 회의실을 빌린다. 이용권은 날마다 따로 사야 하고, 그날 산 이용권은 그날에만 쓸 수 있다. 하루에 여러 장을 사서 이용 시간을 합칠 수 있고, 남은 시간은 돌려받지 못한다.'),
          table(['이용권', '이용 시간', '요금'], [['시간권', '1시간', '2만 원'], ['반일권', '4시간', '6만 원'], ['일일권', '9시간', '10만 원']], caption='이용권 종류', num=False),
          table(['요일', '월', '화', '수', '목'], [['이용 시간'] + [f'{h}시간' for h in USE.values()]], caption='甲의 이용 계획', num=False)],
 'options': [f'{v}만 원' for v in vals10], 'answer': vals10.index(tot10),
 'explain': [
  steps(['월 3시간: 시간권 3장 6만 원 = 반일권 6만 원 → 6만 원.', '화 5시간: 반일권 + 시간권 1장 = 8만 원(일일권 10만 원, 시간권 5장 10만 원보다 싸다).', '수 9시간: 일일권 10만 원(반일권 2장 + 시간권 1장은 14만 원).', '목 2시간: 시간권 2장 4만 원.']),
  p(f'합계 6 + 8 + 10 + 4 = <b>28만 원</b>. 따라서 정답은 <b>{CIRC[vals10.index(tot10)]}</b>이다. <b>함정</b> 시간권만 쓰면 38만 원, 4시간을 넘는 날에 곧바로 일일권을 사면 30만 원이다. 이용권을 섞는 조합을 따진다.')]})

# 정답 위치 균형
move(items, 'S-W05', 0)
move(items, 'S-W08', 4)

REVIEW = {
 'S-W01': ('단위 환산', '중', '1분 20초', '두 연비 표기를 연료량으로 통일', '100km당 L를 km/L로 읽음 / 연료 가격만 봄', '600km에 필요한 L', '차량 연비형, 수치 새로 설계'),
 'S-W02': ('시각 계산', '중', '1분 20초', '표준시로 바꿔 더하고 다시 현지 시각', '시차 누락·부호 반대·대기 누락', '세계 표준시 경유', '경유 비행형, 새로 설계'),
 'S-W03': ('최적화', '중', '1분 40초', '예산 제약과 배제 조건 아래 최대 효과', '효율 순 탐욕 선택', '예산을 남기지 않는 조합', '사업 선택형, 새로 설계(모든 조합 전수 확인, 최적 유일)'),
 'S-W04': ('법조문 계산', '중', '1분 30초', '일비 감액, 숙박비 상한, 정액 숙박', '감액·상한 누락', '항목별 합', '여비 규정형, 새로 설계'),
 'S-W05': ('기대값 판단', '중', '1분 30초', '보험료 + 확률 × 자기부담', '보험료만 비교 / 확률 바뀐 경우', '보험 간 차이만', '화재 보험형, 수치 새로 설계'),
 'S-W06': ('리그전 추론', '상', '2분', '승점 합에서 무승부 수, 세 경우', 'ㄱ·ㄷ 한 경우만', '18 − 16 = 2', '리그전형, 새로 설계(729가지 전수 확인)'),
 'S-W07': ('규칙 계산', '중', '1분 40초', '다수·점수·일대일 세 방식', '바뀐 표에서 동률 놓침', '방식별 표', '선정 방식 비교형, 새로 설계'),
 'S-W08': ('법조문 적용', '중', '1분 20초', '첫날 불산입, 주말 제외, 한 차례 연장, 통지', '달력 날짜로 셈', '평일만 세기', '민원 처리 기간형, 새로 설계(날짜 코드 계산)'),
 'S-W09': ('독해 계산', '중', '1분 10초', '가중합과 10의 보수', '가중치 자리 혼동 / 보수 누락', '3x의 일의 자리', '검사 숫자형, 새로 설계(0~9 전수 확인 유일)'),
 'S-W10': ('비용 최소화', '중', '1분 20초', '날마다 이용권 조합', '시간권만 / 곧바로 일일권', '요일별 최소', '회의실 요금제형, 새로 설계(조합 전수 확인)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_w.py', 'review/sit-w.md'), '상황판단 S-W 검수표(5급 수준)', '송공 — 상황판단 5급 수준 정예 문항(직접 출제).')
