# 상황판단 S-AU01..S-AU05 — 5급 실전(심화) 수준 정예 문항: 주택 취득세(조문 넷과 단서·감면), 개구리 자리 바꾸기(72가지 상태 전수 탐색), 야생동물 보호 규정, 버스 배차 시각(하루 전수 계산), 공부 시간 배분(배분 전수, 조건 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from collections import deque
from functools import lru_cache
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-au.js'

# ---------------------------------------------------------------- S-AU01 주택 취득세 (법조문 계산, 조문 넷과 단서·감면)
BUY = {'甲': (50000, [], True), '乙': (80000, [30000], False), '丙': (100000, [40000, 50000], False), '丁': (70000, [60000, 8000], False), '戊': (9000, [30000, 20000, 40000], False)}   # 취득가액(만 원), 기존 주택 취득가액, 생애 최초
def tax(k, excl=True, relief=True, cap=True, edu=True):
    price, others, first = BUY[k]
    cnt = 1 + len([o for o in others if not (excl and o <= 10000)])
    if cnt >= 3 and not (excl and price <= 10000): t = F(price * 8, 100)
    else: t = F(price, 100) if price <= 60000 else F(price * 2, 100) if price <= 90000 else F(price * 3, 100)
    if relief and first and price <= 120000: t = max(F(0), t - 200) if cap else F(0)
    return t * F(11, 10) if edu else t
each1 = {k: tax(k) for k in BUY}
check(each1 == {'甲': 330, '乙': 1760, '丙': 8800, '丁': 1540, '戊': 99}, f'S-AU01 {each1}')
tot1 = lambda **kw: int(sum(tax(k, **kw) for k in BUY))
alts1 = {'정답': tot1(), '감면 누락': tot1(relief=False), '제외 단서 누락': tot1(excl=False), '지방교육세 누락': tot1(edu=False), '감면 한도 누락': tot1(cap=False)}
check(alts1 == {'정답': 12529, '감면 누락': 12749, '제외 단서 누락': 17842, '지방교육세 누락': 11390, '감면 한도 누락': 12199}, f'S-AU01 {alts1}')
check(all(float(tax(k)).is_integer() for k in BUY), 'S-AU01 integer amounts')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, 'S-AU01 distinct')
won1 = lambda v: f'{v // 10000}억 {v % 10000:,}만 원' if v >= 10000 else f'{v:,}만 원'
items.append({
 'id': 'S-AU01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~戊가 내야 하는 금액(취득세와 지방교육세)의 합계는?',
 'body': [law('<p><b>제○○조(세율)</b> 주택을 취득한 사람은 취득가액에 다음 각 호의 세율을 곱한 취득세를 낸다.<br>1. 6억 원 이하: 100분의 1<br>2. 6억 원 초과 9억 원 이하: 100분의 2<br>3. 9억 원 초과: 100분의 3</p>'
              '<p><b>제○○조(중과)</b> 주택을 취득한 결과 보유한 주택이 3채 이상이 되면 제1조에도 불구하고 취득가액의 100분의 8을 취득세로 낸다. 다만 취득가액이 1억 원 이하인 주택은 보유 주택 수에 넣지 아니하며, 그런 주택을 취득한 경우에는 이 조를 적용하지 아니한다.</p>'
              '<p><b>제○○조(생애 최초 감면)</b> 본인과 배우자가 주택을 가진 적이 없는 사람이 취득가액 12억 원 이하의 주택을 취득하면 취득세에서 200만 원을 뺀다. 취득세가 200만 원 이하이면 취득세를 내지 아니한다.</p>'
              '<p><b>제○○조(지방교육세)</b> 취득세를 내는 사람은 내야 할 취득세(감면 후 금액)의 100분의 10을 지방교육세로 함께 낸다.</p>'),
          table(['취득자', '취득한 주택의 취득가액', '이미 가진 주택(취득가액)', '비고'], [['甲', '5억 원', '없음', '생애 최초'], ['乙', '8억 원', '1채(3억 원)', '—'], ['丙', '10억 원', '2채(4억 원, 5억 원)', '—'], ['丁', '7억 원', '2채(6억 원, 8천만 원)', '—'], ['戊', '9천만 원', '3채(3억, 2억, 4억 원)', '—']], caption='주택 취득 현황', num=False)],
 'options': [won1(v) for v in vals1], 'answer': vals1.index(alts1['정답']),
 'explain': [
  steps(['甲: 5억 × 1% = 500만 원 − 감면 200만 원 = 300만 원, 교육세 포함 330만 원.', '乙: 2채 → 8억 × 2% = 1,600만 원, 교육세 포함 1,760만 원.', '丙: 3채 → 중과 10억 × 8% = 8,000만 원, 교육세 포함 8,800만 원.',
         '丁: 8천만 원 주택은 세지 않으므로 2채 → 7억 × 2% = 1,400만 원, 교육세 포함 1,540만 원.', '戊: 1억 원 이하 주택을 취득했으므로 중과하지 않는다 → 9천만 × 1% = 90만 원, 교육세 포함 99만 원.']),
  p(f'합계 330 + 1,760 + 8,800 + 1,540 + 99 = <b>1억 2,529만 원</b>. 따라서 정답은 <b>{CIRC[vals1.index(alts1["정답"])]}</b>이다. <b>함정</b> 감면을 빠뜨리면 1억 2,749만 원, 감면 한도(200만 원)를 무시하고 전액 면제하면 1억 2,199만 원, 지방교육세를 빠뜨리면 1억 1,390만 원, 1억 원 이하 주택 단서를 놓치면 1억 7,842만 원이다.')]})

# ---------------------------------------------------------------- S-AU02 개구리 자리 바꾸기 (72가지 상태 전수 탐색)
S0, GOAL = 'LLL_RRR', 'RRR_LLL'
def moves(s):
    i = s.index('_'); out = []
    for j in (i - 1, i - 2):
        if j >= 0 and s[j] == 'L' and (i - j == 1 or s[j + 1] != '_'): t = list(s); t[i], t[j] = t[j], t[i]; out.append((''.join(t), i - j))
    for j in (i + 1, i + 2):
        if j < 7 and s[j] == 'R' and (j - i == 1 or s[j - 1] != '_'): t = list(s); t[i], t[j] = t[j], t[i]; out.append((''.join(t), j - i))
    return out
DIST = {S0: 0}; q = deque([S0])
while q:
    s = q.popleft()
    for t, _ in moves(s):
        if t not in DIST: DIST[t] = DIST[s] + 1; q.append(t)
@lru_cache(None)
def paths(s):
    if s == GOAL: return [[]]
    return [[k] + rest for t, k in moves(s) for rest in paths(t)]
ALLP = paths(S0)
t2 = {'ㄱ': DIST[GOAL] == 15, 'ㄴ': len(ALLP) == 4, 'ㄷ': all(not paths(t) for t, k in moves(S0) if k == 2), 'ㄹ': all(p_.count(1) == 9 for p_ in ALLP)}
check(all(s0[i_ - 2 if k == 2 else 0] == s0[i_ - 1] for t_, k in moves(S0) for s0, i_ in [(S0, 3)] if k == 2 and t_.index('_') == 1) and all(S0[t_.index('_')] == S0[t_.index('_') + (1 if t_.index('_') < 3 else -1)] for t_, k in moves(S0) if k == 2), 'S-AU02 first jumps are over a same-direction frog')
check(t2 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False} and len(ALLP) == 2 and all(len(p_) == 15 and p_.count(1) == 6 and p_.count(2) == 9 for p_ in ALLP) and len(DIST) == 72, f'S-AU02 {t2}')
opts2 = ['ㄱ, ㄷ', 'ㄴ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-AU02')
items.append({
 'id': 'S-AU02', 'type': '상황판단 · 규칙 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('일렬로 놓인 돌 7개 가운데 왼쪽 세 돌에는 오른쪽을 보는 개구리 L 셋이, 오른쪽 세 돌에는 왼쪽을 보는 개구리 R 셋이 앉아 있고, 가운데 돌은 비어 있다. 개구리는 한 번에 한 마리씩 움직이며, 보는 방향으로만 갈 수 있다. 움직이는 방법은 바로 앞의 빈 돌로 옮기는 ‘한 칸 이동’과, 바로 앞의 개구리 한 마리를 넘어 그 너머의 빈 돌로 가는 ‘건너뛰기’ 두 가지뿐이다. 목표는 L 셋과 R 셋의 자리를 맞바꾸어 왼쪽 세 돌에 R, 오른쪽 세 돌에 L이 앉게 하는 것이다.'),
          box('보기', ['ㄱ. 목표를 이루려면 적어도 15번 움직여야 한다.', 'ㄴ. 목표를 이루는 움직임의 순서는 모두 네 가지이다.', 'ㄷ. 첫 번째 움직임을 건너뛰기로 하면 목표를 이룰 수 없다.', 'ㄹ. 목표를 이루는 동안 한 칸 이동은 모두 9번 일어난다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['개구리는 뒤로 갈 수 없으므로 L과 R은 서로 한 번씩만 엇갈리고, 엇갈리는 방법은 건너뛰기뿐이다. L 셋과 R 셋이 모두 엇갈려야 하므로 건너뛰기는 3 × 3 = 9번이다.',
         '개구리마다 4칸씩, 모두 24칸을 가야 하는데 건너뛰기 9번이 18칸을 가므로 한 칸 이동은 6번이다. 따라서 목표를 이룰 때는 언제나 9 + 6 = 15번 움직인다(ㄱ 옳음, ㄹ 틀림).',
         '처음 움직임으로 건너뛸 수 있는 것은 같은 방향의 개구리를 넘는 경우뿐인데, 그러면 이후 어떻게 움직여도 목표에 이를 수 없다(ㄷ). 목표를 이루는 순서는 처음에 L이 움직이느냐 R이 움직이느냐에 따라 두 가지뿐이다(ㄴ).']),
  bx([('ㄱ', '적어도 15번', True, O, '언제나 정확히 15번이다.'), ('ㄴ', '네 가지', False, XX, '두 가지뿐이다.'), ('ㄷ', '첫 건너뛰기 실패', True, O, '어느 쪽이 건너뛰어도 막힌다.'), ('ㄹ', '한 칸 이동 9번', False, XX, '6번이다(건너뛰기가 9번).')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 개구리가 놓일 수 있는 상태를 모두 탐색하여 확인하였다.')]})

# ---------------------------------------------------------------- S-AU03 야생동물 보호 규정 (법조문 적용, 조문 넷, 옳은 것)
def capture_ok(research, permit, crop, team, rescue): return rescue or (research and permit) or (crop and team)
def feed_ok(in_zone, winter_period): return not in_zone or winter_period
def feed_fine(first_year, again_year):
    if again_year is None: return 10
    return 30 if again_year - first_year <= 1 else 10
f3 = [capture_ok(True, False, False, False, False), capture_ok(False, False, False, False, True), capture_ok(False, False, True, False, False), not feed_ok(True, True), feed_fine(0, 2) == 30]
one_true(f3, 1, 'S-AU03')
items.append({
 'id': 'S-AU03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(포획 금지)</b> 누구든지 야생동물을 잡거나 죽여서는 아니 된다. 다만 다음 각 호의 어느 하나에 해당하는 경우에는 그러하지 아니하다.<br>1. 학술 연구를 위하여 시장·군수의 허가를 받은 경우<br>2. 농작물에 피해를 주는 야생동물을 시장·군수가 지정한 피해 방지단이 잡는 경우</p>'
              '<p><b>제○○조(구조)</b> 다치거나 병든 야생동물을 발견한 사람은 야생동물 구조센터에 알릴 수 있다. 이 경우 구조센터에 넘기기 위하여 그 동물을 붙잡아 옮기는 것은 제1조의 잡는 것으로 보지 아니한다.</p>'
              '<p><b>제○○조(먹이 주기 금지)</b> 누구든지 야생동물 보호구역 안에서 야생동물에게 먹이를 주어서는 아니 된다. 다만 겨울철 먹이가 부족하여 시장·군수가 정한 기간에는 그러하지 아니하다.</p>'
              '<p><b>제○○조(과태료)</b> 제3조를 위반한 사람에게는 10만 원의 과태료를 부과한다. 다만 과태료 처분을 받은 날부터 1년 안에 다시 위반한 사람에게는 30만 원을 부과한다.</p>')],
 'options': ['학술 연구가 목적이라면 시장·군수의 허가 없이도 야생동물을 잡을 수 있다.', '다친 고라니를 구조센터에 넘기려고 붙잡아 차에 싣고 간 사람은 제1조를 위반한 것이 아니다.', '농작물 피해를 입은 농민은 그 피해를 준 야생동물을 직접 잡을 수 있다.',
             '야생동물 보호구역 안에서 시장이 정한 겨울철 기간에 먹이를 준 사람에게는 10만 원의 과태료를 부과한다.', '보호구역 안에서 먹이를 주어 과태료 처분을 받은 사람이 그로부터 2년 뒤 다시 먹이를 주다 적발되면 30만 원의 과태료를 부과한다.'],
 'answer': 1,
 'explain': [
  ox([(False, XX, '제1조 제1호: 허가를 받아야 한다.'), (True, O, '제2조 후단: 구조센터에 넘기려고 붙잡아 옮기는 것은 잡는 것으로 보지 않는다.'), (False, XX, '제1조 제2호: 시장·군수가 지정한 피해 방지단만 잡을 수 있다.'),
      (False, XX, '제3조 단서에 해당하여 위반이 아니므로 과태료가 없다.'), (False, XX, '1년이 지난 뒤의 위반이므로 10만 원이다.')]),
  p('따라서 정답은 <b>②</b>이다. <b>함정</b> 단서의 주체(피해 방지단)와 가중 기간(1년)을 정확히 읽는다.')]})

# ---------------------------------------------------------------- S-AU04 버스 배차 시각 (하루 전수 계산)
hm = lambda m: f'{m // 60}:{m % 60:02d}'
DEP = {'A': [360 + 12 * k for k in range(200) if 360 + 12 * k <= 1320], 'B': [366 + 18 * k for k in range(200) if 366 + 18 * k <= 1320], 'C': [370 + 20 * k for k in range(200) if 370 + 20 * k <= 1320]}
AB = sorted(set(DEP['A']) & set(DEP['B'])); AC = sorted(set(DEP['A']) & set(DEP['C'])); BC = sorted(set(DEP['B']) & set(DEP['C']))
t4 = {'ㄱ': hm(AB[0]) == '6:24', 'ㄴ': AC == [], 'ㄷ': [hm(x) for x in BC] == ['8:30', '11:30', '14:30', '17:30', '20:30'], 'ㄹ': len(AB) == 30}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and len(AB) == 27 and all(b - a == 36 for a, b in zip(AB, AB[1:])) and all(b - a == 180 for a, b in zip(BC, BC[1:])), f'S-AU04 {t4} {len(AB)}')
check(all((m - 360) % 12 != 0 for m in DEP['C']), 'S-AU04 explanation: no C departure is on the A grid')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ']; ans4 = combo(t4, opts4, 'S-AU04')
items.append({
 'id': 'S-AU04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('한 버스 정류장에서 A, B, C 세 노선의 버스가 출발한다. A 노선은 6시 정각에 첫차가 출발한 뒤 12분마다, B 노선은 6시 6분에 첫차가 출발한 뒤 18분마다, C 노선은 6시 10분에 첫차가 출발한 뒤 20분마다 출발한다. 세 노선 모두 22시 정각까지 출발하는 버스를 운행하며, 22시 정각에 출발하는 버스도 운행한다.'),
          box('보기', ['ㄱ. A 노선과 B 노선의 버스가 처음으로 동시에 출발하는 시각은 6시 24분이다.', 'ㄴ. A 노선과 C 노선의 버스가 동시에 출발하는 일은 없다.', 'ㄷ. B 노선과 C 노선의 버스는 하루에 다섯 번 동시에 출발한다.', 'ㄹ. A 노선과 B 노선의 버스는 하루에 30번 동시에 출발한다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['6시부터 잰 분으로 쓰면 A는 12의 배수, B는 6에 18의 배수를 더한 값, C는 10에 20의 배수를 더한 값이다.',
         'ㄱ: B의 출발 시각 6, 24, 42, … 가운데 12의 배수인 첫 값은 24분 → 6시 24분. 이후 12와 18의 최소공배수인 36분마다 겹친다.', 'ㄴ: C는 10, 30, 50, …으로 모두 4로 나누면 2가 남는 수인데, 12의 배수는 4로 나누어떨어지므로 겹칠 수 없다.',
         'ㄷ: B와 C가 처음 겹치는 것은 150분(8시 30분)이고, 18과 20의 최소공배수인 180분마다 겹치므로 8시 30분, 11시 30분, 14시 30분, 17시 30분, 20시 30분의 다섯 번이다.', 'ㄹ: 6시 24분부터 22시까지 36분 간격이므로 (936 ÷ 36) + 1 = 27번이다.']),
  bx([('ㄱ', '6시 24분', True, O, '24분이 12와 18 조건을 함께 만족하는 첫 값.'), ('ㄴ', 'A·C 없음', True, O, '4로 나눈 나머지가 다르다.'), ('ㄷ', 'B·C 다섯 번', True, O, '8:30부터 3시간마다.'), ('ㄹ', '30번', False, XX, '27번이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. 하루 출발 시각을 모두 나열하여 확인하였다.')]})
check(all(m % 4 == 2 for m in [x - 360 for x in DEP['C']]) and all((x - 360) % 4 == 0 for x in DEP['A']) and (1320 - AB[0]) // 36 + 1 == 27 and AB[0] - 360 == 24 and BC[0] - 360 == 150, 'S-AU04 explanation arithmetic')

# ---------------------------------------------------------------- S-AU05 공부 시간 배분 (배분 전수, 조건 모두 필요)
SCORE = {'A': [45, 57, 68, 77, 86, 93, 100], 'B': [19, 32, 44, 51, 57, 61, 63], 'C': [32, 44, 56, 67, 77, 87, 93]}
def best5(H=10, floor=50):
    bestv, arg = None, []
    for h in itertools.product(range(7), repeat=3):
        if sum(h) > H: continue
        sc = [SCORE[k][x] for k, x in zip('ABC', h)]
        if floor and min(sc) < floor: continue
        v = sum(sc)
        if bestv is None or v > bestv: bestv, arg = v, [h]
        elif v == bestv: arg.append(h)
    return bestv, arg
b5, a5 = best5()
check((b5, a5) == (206, [(2, 3, 5)]) and best5(floor=0) == (208, [(3, 2, 5)]) and best5(H=9)[0] != b5, f'S-AU05 {b5} {a5}')
check(min(h for h in range(7) if SCORE['B'][h] >= 50) == 3 and min(h for h in range(7) if SCORE['A'][h] >= 50) == 1 and min(h for h in range(7) if SCORE['C'][h] >= 50) == 2, 'S-AU05 explanation: minimum hours per subject')
check(max(SCORE['A'][a] + SCORE['C'][7 - a] for a in range(1, 6)) == 155 and [a for a in range(1, 6) if SCORE['A'][a] + SCORE['C'][7 - a] == 155] == [2] and SCORE['A'][3] + SCORE['C'][4] == 154, 'S-AU05 explanation: best A/C split of the 7 remaining hours is 2/5')
opts5 = ['198점', '202점', '204점', '206점', '208점']
check([int(o[:-1]) for o in opts5].index(b5) == 3, 'S-AU05 options')
items.append({
 'id': 'S-AU05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 얻을 수 있는 세 과목 점수 합계의 최댓값은?',
 'body': [p('甲은 시험 전날 남은 10시간을 과목 A, B, C의 공부에 나누어 쓰려 한다. 공부 시간은 과목마다 0~6시간 가운데 정수로 정하며, 세 과목 공부 시간의 합은 10시간을 넘을 수 없다. 공부 시간에 따른 예상 점수는 아래 표와 같다. 다만 한 과목이라도 50점에 못 미치면 불합격이므로, 甲은 세 과목 모두 50점 이상이 되도록 시간을 나눈다.'),
          table(['공부 시간', 'A', 'B', 'C'], [[f'{h}시간', str(SCORE['A'][h]), str(SCORE['B'][h]), str(SCORE['C'][h])] for h in range(7)], caption='공부 시간별 예상 점수', unit='(단위: 점)')],
 'options': opts5, 'answer': 3,
 'explain': [
  steps(['B가 50점 이상이 되려면 3시간 이상이 필요하다(51점). A는 0시간에도 45점이라 1시간 이상(57점), C는 2시간 이상(56점)이 필요하다.', 'B에 3시간을 쓰면 남은 7시간을 A와 C에 나눈다. A 2·C 5시간이면 68 + 87 = 155점, A 3·C 4시간이면 77 + 77 = 154점 등이어서 A 2·C 5시간이 가장 좋다 → 68 + 51 + 87 = 206점.',
         'B에 4시간 이상을 쓰면 B 점수가 6점 이하로 늘지만 A·C에서 그보다 많이 잃는다.']),
  p('따라서 최댓값은 206점이고 정답은 <b>④</b>이다. 시간 배분의 모든 경우를 따져 확인하였다. <b>함정</b> 50점 조건을 빼면 A 3·B 2·C 5시간의 208점이 최대가 된다.')]})
check(all(best5_v <= 206 for best5_v in [SCORE['A'][a] + SCORE['B'][b] + SCORE['C'][c] for a in range(7) for b in range(4, 7) for c in range(7) if a + b + c <= 10 and min(SCORE['A'][a], SCORE['B'][b], SCORE['C'][c]) >= 50]), 'S-AU05 explanation: B 4h+ is worse')

REVIEW = {
 'S-AU01': ('법조문 계산', '상', '3분', '세율 구간, 중과와 제외 단서, 감면 한도, 부가 세목', '단서·한도·부가세 누락', '취득자별 세율 → 감면 → 교육세', '주택 취득세형, 조문 넷, 새로 설계'),
 'S-AU02': ('규칙 추론', '상', '2분 30초', '엇갈림 횟수와 이동 거리로 이동 수 세기', '건너뛰기·한 칸 이동 수 혼동', '엇갈림 9번 → 이동 거리', '개구리 자리 바꾸기형, 새로 설계(상태 전수 탐색)'),
 'S-AU03': ('법조문 적용', '상', '1분 30초', '포획 금지 단서의 주체·요건, 구조 의제, 먹이 주기 단서, 가중 과태료 기간', '단서 주체·기간 오독', '조문별 대조', '야생동물 보호 규정형, 조문 넷, 새로 설계'),
 'S-AU04': ('수리 추론', '상', '2분 30초', '배차 간격의 최소공배수, 나머지로 겹침 판별', '첫 출발 시각 차이 무시', '분 단위로 바꾸어 나머지 비교', '버스 배차형, 새로 설계(하루 전수 계산)'),
 'S-AU05': ('최적화', '상', '2분 30초', '최소 점수 조건 아래 시간 배분, 한계 점수 비교', '최소 점수 조건 누락', '조건 충족 최소 시간부터 고정', '공부 시간 배분형, 새로 설계(배분 전수, 조건 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_au.py', 'review/sit-au.md'), '상황판단 S-AU 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
