# 상황판단 S-CA01..S-CA05 — 5급 실전(심화) 수준 정예 문항: 출장 여비(일비 감액·숙박 상한·박 수), 계단 오르기(전수), 야영장 예약 취소 규정, 시침과 분침, 토너 묶음 구매(63가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-ca.js'

# ---------------------------------------------------------------- S-CA01 출장 여비 (법조문 계산)
TRIP = {'甲': ('서울', 3, 120000, 0), '乙': ('부산', 2, 60000, 2), '丙': ('대전', 1, 0, 1)}      # 출장지, 기간(일), 1박 숙박 실비, 공용 차량 이용 일수
DAILY, FOOD, CAP = 25000, 30000, {'서울': 100000}
def travel(k, cut_food=False, no_daily=False, cap_all=False, nights_eq_days=False, cap=True):
    city, d, room, car = TRIP[k]
    daily = sum(DAILY * (0 if no_daily else F(1, 2)) if i < car else DAILY for i in range(d))
    food = sum(FOOD * F(1, 2) if (cut_food and i < car) else FOOD for i in range(d))
    lim = 70000 if cap_all else CAP.get(city, 70000)
    nights = d if nights_eq_days else d - 1
    return daily + food + nights * (min(room, lim) if cap else room)
each1 = {k: travel(k) for k in TRIP}
check(each1 == {'甲': 365000, '乙': 145000, '丙': 42500}, f'S-CA01 {each1}')
tot1 = lambda **kw: sum(travel(k, **kw) for k in TRIP)
alts1 = {'정답': tot1(), '식비도 감액': tot1(cut_food=True), '서울에도 7만 원 상한': tot1(cap_all=True), '상한 누락': tot1(cap=False), '박 수 = 일수': tot1(nights_eq_days=True)}
check(alts1 == {'정답': 552500, '식비도 감액': 507500, '서울에도 7만 원 상한': 492500, '상한 누락': 592500, '박 수 = 일수': 712500}, f'S-CA01 {alts1}')
check(tot1(no_daily=True) == 515000, 'S-CA01 dropping the daily allowance entirely (not used as an option)')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-CA01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-CA01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丙에게 지급할 출장 여비의 합계는?',
 'body': [law('<p><b>제○○조(일비)</b> 일비는 출장 기간 하루에 25,000원으로 한다. 다만 출장지에서 공용 차량을 이용한 날에는 그 날의 일비를 2분의 1로 줄여 지급한다.</p>'
              '<p><b>제○○조(식비)</b> 식비는 출장 기간 하루에 30,000원으로 한다.</p>'
              '<p><b>제○○조(숙박비)</b> 숙박비는 출장 기간 가운데 숙박한 밤마다 실제로 낸 금액을 지급하되, 1박에 서울은 100,000원, 그 밖의 지역은 70,000원을 넘지 못한다.</p>'),
          box('상황', ['甲: 서울 출장 2박 3일, 1박 숙박 실비 120,000원, 공용 차량 이용 없음', '乙: 부산 출장 1박 2일, 1박 숙박 실비 60,000원, 이틀 모두 공용 차량 이용', '丙: 대전 당일 출장, 공용 차량 이용'], plain=True)],
 'options': [f'{int(v):,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 일비 25,000 × 3 = 75,000 + 식비 90,000 + 숙박 상한 100,000 × 2박 = 365,000원.', '乙: 일비 12,500 × 2 = 25,000 + 식비 60,000 + 숙박 60,000 × 1박 = 145,000원.', '丙: 일비 12,500 + 식비 30,000 = 42,500원.']),
  p(f'합계 365,000 + 145,000 + 42,500 = <b>552,500원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 서울에도 70,000원 상한을 적용하면 492,500원, 식비까지 줄이면 507,500원, 상한을 빠뜨리면 592,500원, 출장 일수만큼 숙박비를 주면 712,500원이다.')]})

# ---------------------------------------------------------------- S-CA02 계단 오르기 (전수)
def climbs(n):
    return [w for k in range(n + 1) for w in itertools.product((1, 2), repeat=k) if sum(w) == n]
t2 = {'ㄱ': len(climbs(5)) == 8, 'ㄴ': len(climbs(6)) == 13, 'ㄷ': sum(w.count(2) == 2 for w in climbs(6)) == 4, 'ㄹ': sum(all(not (w[i] == 2 and w[i + 1] == 2) for i in range(len(w) - 1)) for w in climbs(6)) == 8}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and sum(w.count(2) == 2 for w in climbs(6)) == 6
      and sum(all(not (w[i] == 2 and w[i + 1] == 2) for i in range(len(w) - 1)) for w in climbs(6)) == 9, f'S-CA02 {t2}')
check([len(climbs(n)) for n in range(1, 7)] == [1, 2, 3, 5, 8, 13], 'S-CA02 explanation: each count is the sum of the two before')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-CA02')
items.append({
 'id': 'S-CA02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('갑은 계단을 오를 때 한 걸음에 한 칸 또는 두 칸을 오른다. 계단을 오르는 방법은 걸음마다 오른 칸 수를 차례로 적은 것으로 구별하며, 예컨대 3칸을 오르는 방법은 (1, 1, 1), (1, 2), (2, 1)의 세 가지이다.'),
          box('보기', ['ㄱ. 5칸을 오르는 방법은 8가지이다.', 'ㄴ. 6칸을 오르는 방법은 13가지이다.', 'ㄷ. 6칸을 오르는 방법 가운데 두 칸 걸음을 정확히 두 번 하는 방법은 4가지이다.', 'ㄹ. 6칸을 오르는 방법 가운데 두 칸 걸음을 연달아 하지 않는 방법은 8가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['마지막 걸음이 한 칸이면 앞에서 n−1칸, 두 칸이면 n−2칸을 오른 것이므로 방법의 수는 앞의 두 수의 합이다: 1, 2, 3, 5, 8(5칸, ㄱ), 13(6칸, ㄴ).', 'ㄷ: 두 칸 걸음 둘과 한 칸 걸음 둘, 모두 네 걸음 가운데 두 칸 걸음의 자리를 고르면 4 × 3 ÷ 2 = 6가지.',
         'ㄹ: 두 칸 걸음이 없는 1가지, 하나인 5가지(다섯 걸음 가운데 자리), 둘이면서 붙지 않는 3가지(네 걸음 6가지 가운데 붙은 3가지 제외), 셋이면 반드시 붙는다 → 9가지.']),
  bx([('ㄱ', '5칸 8가지', True, O, '3 + 5.'), ('ㄴ', '6칸 13가지', True, O, '5 + 8.'), ('ㄷ', '두 칸 걸음 두 번 4가지', False, XX, '6가지이다.'), ('ㄹ', '연달아 안 하기 8가지', False, XX, '9가지이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 모든 걸음 순서를 나열해 확인하였다. <b>함정</b> 두 칸 걸음의 수가 같아도 걸음 순서가 다르면 다른 방법이다.')]})

# ---------------------------------------------------------------- S-CA03 야영장 예약 취소 (법조문 적용, 옳은 것)
def cancel_fee(fee, days_before, weather=False):
    if weather: return 0
    if days_before < 0: return fee
    if days_before >= 7: return 0
    if days_before >= 3: return fee * F(3, 10)
    return fee * F(1, 2)
free_change = lambda days_before, used=0: days_before >= 3 and used == 0
f3 = [cancel_fee(50000, 5) == 0, cancel_fee(40000, 1) == 12000, cancel_fee(50000, 0, weather=True) == 25000, free_change(2), cancel_fee(60000, 4) == 18000]
one_true(f3, 4, 'S-CA03')
check(cancel_fee(50000, 5) == 15000 and cancel_fee(40000, 1) == 20000 and cancel_fee(60000, 7) == 0 and cancel_fee(60000, 3) == 18000, 'S-CA03 explanation values and boundaries')
items.append({
 'id': 'S-CA03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(예약 취소)</b> ① 야영장 예약을 취소하는 사람은 다음 구분에 따른 취소 수수료를 낸다.<br>1. 이용일 7일 전까지 취소: 없음<br>2. 이용일 6일 전부터 3일 전까지 취소: 이용료의 100분의 30<br>3. 이용일 2일 전부터 이용일 당일까지 취소: 이용료의 100분의 50<br>4. 취소하지 않고 이용하지 않은 경우: 이용료 전액<br>② 기상 특보가 발효되어 야영장을 이용할 수 없게 된 때에는 제1항에도 불구하고 취소 수수료를 받지 아니한다.</p>'
              '<p><b>제○○조(예약 변경)</b> 이용 날짜는 이용일 3일 전까지 한 차례에 한하여 수수료 없이 바꿀 수 있다.</p>')],
 'options': ['이용일 5일 전에 예약을 취소하면 취소 수수료가 없다.', '이용료가 4만 원인 예약을 이용일 전날 취소하면 취소 수수료는 1만 2천 원이다.', '기상 특보가 발효되어 야영장을 이용할 수 없게 되어 당일 취소하면 이용료의 절반을 낸다.',
             '이용일 2일 전에 이용 날짜를 바꾸면 수수료를 내지 않는다.', '이용료가 6만 원인 예약을 이용일 4일 전에 취소하면 취소 수수료는 1만 8천 원이다.'],
 'answer': 4,
 'explain': [
  ox([(False, XX, '6일 전부터 3일 전까지는 이용료의 30%를 낸다.'), (False, XX, '전날은 2일 전~당일 구간이므로 50%인 2만 원이다.'), (False, XX, '기상 특보로 이용할 수 없으면 수수료를 받지 않는다.'),
      (False, XX, '수수료 없는 변경은 3일 전까지이다.'), (True, O, '6만 원 × 30% = 1만 8천 원이다.')]),
  p('따라서 정답은 <b>⑤</b>이다. <b>함정</b> 구간의 경계(7일 전, 3일 전, 2일 전)와 단서(기상 특보)를 확인한다.')]})

# ---------------------------------------------------------------- S-CA04 시침과 분침 (보기)
def angle(minutes):                          # 12시 정각부터 지난 분(분수 가능) → 두 바늘 사이의 작은 각
    hour, minute = F(minutes, 2) % 360, (6 * F(minutes)) % 360
    d = abs(hour - minute); return min(d, 360 - d)
meet = [F(720 * k, 11) for k in range(0, 23)]                          # 겹치는 시각: 12시부터 720/11분마다
check(all(angle(m) == 0 for m in meet) and meet[22] == 1440, 'S-CA04 meeting times')
in_day = [m for m in meet if 0 <= m < 1440]
t4 = {'ㄱ': angle(180) == 90, 'ㄴ': angle(210) == 90, 'ㄷ': 65 < meet[1] < 66, 'ㄹ': len(in_day) == 24}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False} and angle(210) == 75 and len(in_day) == 22 and meet[1] == F(720, 11), f'S-CA04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-CA04')
items.append({
 'id': 'S-CA04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('바늘 두 개짜리 시계에서 분침은 1분에 6°, 시침은 1분에 0.5°씩 쉬지 않고 같은 빠르기로 돈다. 두 바늘 사이의 각은 둘 가운데 180° 이하인 쪽으로 잰다.'),
          box('보기', ['ㄱ. 3시 정각에 두 바늘 사이의 각은 90°이다.', 'ㄴ. 3시 30분에 두 바늘 사이의 각은 90°이다.', 'ㄷ. 12시 정각 다음에 두 바늘이 처음으로 겹치는 시각은 1시 5분과 1시 6분 사이이다.', 'ㄹ. 0시 정각부터 다음 날 0시 정각 직전까지 두 바늘은 24번 겹친다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 시침 90°, 분침 0° → 90°.', 'ㄴ: 3시 30분이면 시침은 90 + 15 = 105°, 분침은 180° → 75°.', 'ㄷ: 분침은 시침보다 1분에 5.5°씩 더 돌므로 360 ÷ 5.5 = 720/11 ≈ 65.45분마다 겹친다 → 1시 5분 27초쯤.',
         'ㄹ: 24시간 = 1,440분 동안 720/11분마다 겹치므로 0시를 포함해 1,440 ÷ (720/11) = 22번(다음 날 0시는 빼고).']),
  bx([('ㄱ', '3시 90°', True, O, '90 − 0.'), ('ㄴ', '3시 30분 90°', False, XX, '75°이다.'), ('ㄷ', '1시 5분~6분 사이', True, O, '약 1시 5분 27초.'), ('ㄹ', '24번', False, XX, '22번이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 분침이 움직이는 동안 시침도 움직인다. 3시 30분의 시침은 3이 아니라 3과 4의 한가운데에 있다.')]})

# ---------------------------------------------------------------- S-CA05 토너 묶음 구매 (63가지 전수, 규칙 모두 필요)
TN = {'A': (18, 12, '가'), 'B': (12, 5, '가'), 'C': (16, 10, '나'), 'D': (8, 5, '나'), 'E': (10, 12, '다'), 'F': (15, 10, '다')}   # 가격(만 원), 토너 개수, 판매처
RULES = [lambda s: sum(TN[x][1] for x in s) >= 20, lambda s: not ('C' in s and 'E' in s), lambda s: len({TN[x][2] for x in s}) >= 2]
def plans5(on=(1, 1, 1)):
    return sorted((sum(TN[x][0] for x in s), s) for n in range(1, 7) for s in itertools.combinations(TN, n) if all(r(s) for r, o in zip(RULES, on) if o))
PL = plans5(); b5 = PL[0][0]
check(b5 == 28 and [s for v, s in PL if v == b5] == [('A', 'E')], f'S-CA05 {PL[:3]}')
alts5 = [plans5(tuple(0 if j == i else 1 for j in range(3))) for i in range(3)]
for i, al in enumerate(alts5): check(al[0][0] < b5 and [v for v, s in al].count(al[0][0]) == 1, f'S-CA05 rule {i} changes the answer {al[:2]}')
check([al[0] for al in alts5] == [(18, ('D', 'E')), (26, ('C', 'E')), (25, ('E', 'F'))], f'S-CA05 traps {[al[0] for al in alts5]}')
sec5 = sorted({v for v, s in PL})[1]; check(sec5 == 30 and [s for v, s in PL if v == sec5] == [('B', 'D', 'E')], f'S-CA05 second {sec5}')
opts5v = sorted([b5, sec5] + [al[0][0] for al in alts5]); check(len(set(opts5v)) == 5, f'S-CA05 {opts5v}')
ans5 = opts5v.index(b5)
check(min(v for v, s in PL if 'E' not in s) == 31, 'S-CA05 explanation: without E the cheapest is 31')
items.append({
 'id': 'S-CA05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲 부서가 낼 토너 구매 비용의 최솟값은?',
 'body': [p('甲 부서는 프린터 토너를 사려고 묶음 상품 A~F 가운데 몇 개를 고르려 한다. 상품마다 가격, 들어 있는 토너 개수, 판매처는 아래와 같고, 같은 상품은 하나만 살 수 있다. 甲은 다음 규칙을 모두 지키면서 비용 합계를 가장 적게 하려 한다.'),
          table(['상품', '가격(만 원)', '토너(개)', '판매처'], [[k, str(a), str(b), c] for k, (a, b, c) in TN.items()], caption='묶음 상품별 가격·토너 개수·판매처', num=False),
          box('규칙', ['토너를 모두 20개 이상 사야 한다.', 'C와 E는 함께 사지 않는다.', '두 곳 이상의 판매처에서 산다.'], plain=True)],
 'options': [f'{v}만 원' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['E(10만 원, 12개)는 1만 원당 토너가 가장 많다. E와 함께 20개를 채우는 상품은 A(12개)·C(10개)·F(10개)인데, C는 둘째 규칙에, 같은 판매처 ‘다’의 F는 셋째 규칙에 걸려 A만 된다 → 18 + 10 = 28만 원.',
         'E와 B·D(5개씩)를 함께 사면 22개, 30만 원이다.', 'E 없이 20개를 채우는 가장 싼 방법은 C + F(20개, 31만 원)이다.', '따라서 최솟값은 <b>28만 원</b>(A, E)이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 상품 조합 63가지를 모두 따져 확인하였다. <b>함정</b> 첫째 규칙을 빼면 18만 원, 셋째 규칙을 빼면 25만 원, 둘째 규칙을 빼면 26만 원이 된다.')]})
check(max(TN, key=lambda k: F(TN[k][1], TN[k][0])) == 'E' and sum(TN[x][1] for x in 'BDE') == 22 and sum(TN[x][1] for x in 'CF') == 20, 'S-CA05 explanation facts')

REVIEW = {
 'S-CA01': ('법조문 계산', '상', '2분 30초', '일비 감액 대상, 지역별 숙박 상한, 박 수 = 일수 − 1', '박 수 착오, 감액 범위 확대', '사람별 일비 → 식비 → 숙박비', '출장 여비형, 조문 셋, 새로 설계'),
 'S-CA02': ('경우의 수', '상', '2분', '앞의 두 경우의 합, 자리 고르기, 붙지 않는 배치', '순서 다른 걸음을 같은 방법으로 셈', '마지막 걸음으로 나누기', '계단 오르기형, 새로 설계(전수)'),
 'S-CA03': ('법조문 적용', '상', '1분 30초', '취소 시점 구간, 기상 특보 단서, 변경 기한', '구간 경계 착오', '조문별 대조', '야영장 취소형, 조문 둘, 새로 설계'),
 'S-CA04': ('수리 추론', '상', '2분', '두 바늘의 상대 속도, 하루 겹침 횟수', '시침의 움직임 무시', '1분에 5.5°', '시계 바늘형, 새로 설계(분수로 확인)'),
 'S-CA05': ('최적화', '상', '3분', '개수 하한, 동시 구매 금지, 판매처 수', '규칙 하나 누락', '단가가 가장 싼 상품부터', '토너 구매형, 새로 설계(63가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_ca.py', 'review/sit-ca.md'), '상황판단 S-CA 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
