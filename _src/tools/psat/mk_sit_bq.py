# 상황판단 S-BQ01..S-BQ05 — 5급 실전(심화) 수준 정예 문항: 수도 요금(구간별 단가·감면 범위·누수량), 원탁에 앉기(전수), 정보 공개 청구 규정, 일의 양, 선물 세트 구성(63가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bq.js'

# ---------------------------------------------------------------- S-BQ01 수도 요금 (법조문 계산)
USERS = {'甲': (25, False, 0), '乙': (35, True, 0), '丙': (32, False, 10), '丁': (15, True, 0)}      # 계량 사용량(톤), 다자녀 가구, 확인된 누수량(톤)
def water(t, band=True):
    if band: return 500 * min(t, 20) + 800 * max(0, min(t, 30) - 20) + 1000 * max(0, t - 30)
    return t * (500 if t <= 20 else 800 if t <= 30 else 1000)
def bill(k, band=True, disc=True, disc_all=False, leak=True):
    t, many, lk = USERS[k]; u = t - lk if leak else t
    w, s = F(water(u, band)), F(400 * u)
    if disc and many:
        if disc_all: return (w + s) * F(7, 10)
        w *= F(7, 10)
    return w + s
each1 = {k: bill(k) for k in USERS}
check(each1 == {'甲': 24000, '乙': 30100, '丙': 20400, '丁': 11250}, f'S-BQ01 {each1}')
tot1 = lambda **kw: int(sum(bill(k, **kw) for k in USERS))
alts1 = {'정답': tot1(), '구간 아닌 전체 단가': tot1(band=False), '감면 누락': tot1(disc=False), '하수도까지 감면': tot1(disc_all=True), '누수량 포함': tot1(leak=False)}
check(alts1 == {'정답': 85750, '구간 아닌 전체 단가': 106150, '감면 누락': 94900, '하수도까지 감면': 79750, '누수량 포함': 98150}, f'S-BQ01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BQ01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BQ01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낼 수도 요금의 합계는?',
 'body': [law('<p><b>제○○조(상수도 요금)</b> 상수도 요금은 한 달 사용량을 다음 구간으로 나누어 구간마다 해당 단가를 곱한 금액을 더하여 정한다.<br>1. 20톤 이하인 부분: 1톤당 500원<br>2. 20톤을 넘고 30톤 이하인 부분: 1톤당 800원<br>3. 30톤을 넘는 부분: 1톤당 1,000원</p>'
              '<p><b>제○○조(하수도 요금)</b> 하수도 요금은 한 달 사용량 1톤당 400원으로 한다.</p>'
              '<p><b>제○○조(감면)</b> 자녀가 3명 이상인 가구에는 상수도 요금의 100분의 30을 감면한다. 하수도 요금은 감면하지 아니한다.</p>'
              '<p><b>제○○조(누수)</b> 수도관이 새어 사용량이 늘어난 사실이 확인되면, 확인된 누수량을 한 달 사용량에서 빼고 상수도 요금과 하수도 요금을 계산한다.</p>'),
          box('상황', ['甲: 이번 달 사용량 25톤', '乙(자녀 3명): 이번 달 사용량 35톤', '丙: 이번 달 계량된 사용량 32톤, 이 가운데 누수량 10톤이 확인됨', '丁(자녀 4명): 이번 달 사용량 15톤'], plain=True)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 상수도 20 × 500 + 5 × 800 = 14,000원, 하수도 25 × 400 = 10,000원 → 24,000원.', '乙: 상수도 10,000 + 8,000 + 5,000 = 23,000원에서 30% 감면 → 16,100원, 하수도 14,000원 → 30,100원.',
         '丙: 누수량을 빼면 22톤. 상수도 10,000 + 1,600 = 11,600원, 하수도 8,800원 → 20,400원.', '丁: 상수도 7,500원에서 30% 감면 → 5,250원, 하수도 6,000원 → 11,250원.']),
  p(f'합계 24,000 + 30,100 + 20,400 + 11,250 = <b>85,750원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 하수도 요금까지 감면하면 79,750원, 감면을 빼면 94,900원, 누수량을 빼지 않으면 98,150원, 구간별로 나누지 않고 사용량 전체에 그 구간의 단가를 곱하면 106,150원이다.')]})

# ---------------------------------------------------------------- S-BQ02 원탁에 앉기 (전수)
PPL = '갑을병정무'
SEATS = sorted({pm[pm.index('갑'):] + pm[:pm.index('갑')] for pm in itertools.permutations(PPL)})      # 회전하여 같은 배치는 하나로 센다
nb = lambda s, a, b: (s.index(a) - s.index(b)) % 5 in (1, 4)
t2 = {'ㄱ': len(SEATS) == 24, 'ㄴ': sum(not nb(s, '갑', '을') for s in SEATS) == 8, 'ㄷ': sum(nb(s, '갑', '을') and nb(s, '병', '정') for s in SEATS) == 4, 'ㄹ': sum(nb(s, '갑', '을') and nb(s, '갑', '병') for s in SEATS) == 4}
check(t2 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': False, 'ㄹ': True}, f'S-BQ02 {t2}')
check(sum(not nb(s, '갑', '을') for s in SEATS) == 12 and sum(nb(s, '갑', '을') and nb(s, '병', '정') for s in SEATS) == 8, 'S-BQ02 actual counts')
check(4 * 3 * 2 * 1 == 24 and 2 * 3 * 2 == 12 and 2 * 2 * 2 == 8 and 2 * 2 == 4, 'S-BQ02 explanation arithmetic')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄱ, ㄹ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ']; ans2 = combo(t2, opts2, 'S-BQ02')
items.append({
 'id': 'S-BQ02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('갑, 을, 병, 정, 무 다섯 사람이 똑같은 의자 다섯 개가 같은 간격으로 놓인 원탁에 둘러앉는다. 원탁을 돌려서 겹치는 배치는 같은 것으로 본다.'),
          box('보기', ['ㄱ. 다섯 사람이 앉는 방법은 모두 24가지이다.', 'ㄴ. 갑과 을이 이웃하지 않게 앉는 방법은 8가지이다.', 'ㄷ. 갑과 을이 이웃하고 병과 정도 이웃하게 앉는 방법은 4가지이다.', 'ㄹ. 갑의 양옆에 을과 병이 앉는 방법은 4가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 갑의 자리를 고정하고 나머지 네 사람을 늘어놓으면 4 × 3 × 2 × 1 = 24가지.', 'ㄴ: 갑과 을이 이웃하는 경우는 을이 갑의 왼쪽·오른쪽 2가지 × 나머지 세 사람 3 × 2 × 1 = 12가지이므로, 이웃하지 않는 경우는 24 − 12 = 12가지.',
         'ㄷ: 갑·을을 한 묶음, 병·정을 한 묶음으로 보면 두 묶음과 무를 원탁에 놓는 방법이 (3 − 1)! = 2가지이고, 각 묶음 안에서 두 사람의 순서가 2가지씩이므로 2 × 2 × 2 = 8가지.', 'ㄹ: 을과 병이 갑의 왼쪽·오른쪽에 앉는 2가지 × 남은 두 자리에 정·무가 앉는 2가지 = 4가지.']),
  bx([('ㄱ', '24가지', True, O, '4!.'), ('ㄴ', '8가지', False, XX, '12가지이다.'), ('ㄷ', '4가지', False, XX, '8가지이다.'), ('ㄹ', '4가지', True, O, '2 × 2.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 24가지 배치를 모두 따져 확인하였다. <b>함정</b> 원탁에서는 한 사람을 고정해 회전으로 겹치는 경우를 지운다.')]})
units = {pm[pm.index('무'):] + pm[:pm.index('무')] for pm in itertools.permutations(['갑을', '병정', '무'])}
check(len(units) == 2 and len(units) * 2 * 2 == sum(nb(s, '갑', '을') and nb(s, '병', '정') for s in SEATS), 'S-BQ02 explanation ㄷ: 2 circular unit orders × 2 × 2')

# ---------------------------------------------------------------- S-BQ03 정보 공개 청구 (법조문 적용, 옳지 않은 것)
WHO_MAY = '누구든지'                                      # 청구권자의 범위(조문 그대로)
can_request = lambda who: WHO_MAY == '누구든지' or who == '국민'
deadline = lambda base, ext: base + ext                  # 결정 기간 + 한 번의 연장
partial_open = lambda separable: separable
fee_relief = lambda public_interest: public_interest
appeal_ok = lambda days: days <= 30
f3 = [can_request('외국인'), deadline(10, 10) == 20, partial_open(True), fee_relief(True), appeal_ok(40)]
one_false(f3, 4, 'S-BQ03')
check(appeal_ok(30) and not appeal_ok(31), 'S-BQ03 boundary')
items.append({
 'id': 'S-BQ03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳지 않은 것은?',
 'body': [law('<p><b>제○○조(청구)</b> 누구든지 공공기관에 그 기관이 가진 정보의 공개를 청구할 수 있다.</p>'
              '<p><b>제○○조(결정 기간)</b> 공공기관은 청구를 받은 날부터 10일 이내에 공개 여부를 결정하여야 한다. 다만 부득이한 경우에는 10일의 범위에서 한 번 연장할 수 있다.</p>'
              '<p><b>제○○조(비공개 정보)</b> ① 공공기관은 다음 각 호의 정보를 공개하지 아니할 수 있다.<br>1. 개인의 사생활을 침해할 우려가 있는 정보<br>2. 진행 중인 재판에 관한 정보<br>② 청구한 정보에 제1항의 정보가 섞여 있더라도 그 부분을 떼어 낼 수 있으면 나머지 부분은 공개하여야 한다.</p>'
              '<p><b>제○○조(비용)</b> 정보 공개에 드는 비용은 청구인이 부담한다. 다만 공익을 위하여 청구한 경우에는 비용을 감면할 수 있다.</p>'
              '<p><b>제○○조(이의신청)</b> 비공개 결정에 불복하는 청구인은 결정을 통지받은 날부터 30일 이내에 그 공공기관에 이의신청을 할 수 있다.</p>')],
 'options': ['외국인도 공공기관에 정보 공개를 청구할 수 있다.', '공공기관은 청구를 받은 날부터 늦어도 20일 안에는 공개 여부를 결정하여야 한다.', '사생활 정보가 일부 담긴 문서라도 그 부분을 떼어 낼 수 있으면 나머지는 공개하여야 한다.',
             '공익을 위하여 정보 공개를 청구한 사람은 공개 비용을 감면받을 수 있다.', '비공개 결정을 통지받은 날부터 40일이 지난 청구인도 이의신청을 할 수 있다.'],
 'answer': 4,
 'explain': [
  ox([(True, O, '누구든지 청구할 수 있다.'), (True, O, '10일에 한 번 10일 연장하여 최대 20일이다.'), (True, O, '떼어 낼 수 있으면 나머지는 공개하여야 한다(제2항).'),
      (True, O, '공익을 위한 청구는 비용을 감면할 수 있다.'), (False, XX, '통지받은 날부터 30일 이내에만 할 수 있다.')]),
  p('따라서 정답은 <b>⑤</b>이다. <b>함정</b> ‘누구든지’의 범위, 연장의 횟수와 길이, 부분 공개 의무를 확인한다.')]})

# ---------------------------------------------------------------- S-BQ04 일의 양 (수리 추론)
HRS = {'A': 6, 'B': 12, 'C': 4}
rate = {k: F(1, v) for k, v in HRS.items()}
t4 = {'ㄱ': 1 / (rate['A'] + rate['B']) == 4, 'ㄴ': 1 / sum(rate.values()) == 2, 'ㄷ': (1 - 2 * rate['A']) / rate['B'] == 6, 'ㄹ': 1 + (1 - rate['A'] - rate['C']) / rate['B'] == 8}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and (1 - 2 * rate['A']) / rate['B'] == 8, f'S-BQ04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BQ04')
items.append({
 'id': 'S-BQ04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('어떤 서류 정리 작업을 A 혼자 하면 6시간, B 혼자 하면 12시간, C 혼자 하면 4시간이 걸린다. 여러 사람이 함께 일하면 각자 혼자 할 때와 같은 빠르기로 일하며, 일을 넘겨받는 데 드는 시간은 없다.'),
          box('보기', ['ㄱ. A와 B가 처음부터 함께하면 4시간 만에 끝난다.', 'ㄴ. 세 사람이 처음부터 함께하면 2시간 만에 끝난다.', 'ㄷ. A가 혼자 2시간 일한 뒤 B가 혼자 나머지를 하면, B는 6시간 일해야 한다.', 'ㄹ. A와 C가 함께 1시간 일한 뒤 B가 혼자 나머지를 하면, 일을 시작하고 8시간 만에 끝난다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['1시간에 하는 일의 양: A 1/6, B 1/12, C 1/4.', 'ㄱ: 1/6 + 1/12 = 1/4 → 4시간.', 'ㄴ: 1/6 + 1/12 + 1/4 = 1/2 → 2시간.', 'ㄷ: A가 2시간에 1/3을 하므로 남은 2/3를 B가 하려면 2/3 ÷ 1/12 = 8시간.', 'ㄹ: A와 C가 1시간에 5/12를 하고, 남은 7/12를 B가 7시간에 한다 → 1 + 7 = 8시간.']),
  bx([('ㄱ', '4시간', True, O, '1/4씩.'), ('ㄴ', '2시간', True, O, '1/2씩.'), ('ㄷ', 'B 6시간', False, XX, '8시간이다.'), ('ㄹ', '8시간', True, O, '1 + 7.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 시간끼리 더하거나 나누지 말고, 1시간에 하는 일의 양으로 바꾸어 더한다.')]})
check(rate['A'] + rate['C'] == F(5, 12) and (1 - F(5, 12)) / rate['B'] == 7, 'S-BQ04 explanation')

# ---------------------------------------------------------------- S-BQ05 선물 세트 구성 (63가지 전수, 규칙 모두 필요)
GIFT = {'A': (18, 5, '과일'), 'B': (15, 13, '차'), 'C': (18, 10, '과일'), 'D': (10, 6, '견과'), 'E': (22, 4, '차'), 'F': (30, 14, '견과')}   # 가격(천 원), 만족도, 종류
BUD = 50
def sets5(r=(1, 1, 1, 1)):
    res = []
    for n in range(1, 7):
        for s in itertools.combinations(GIFT, n):
            if r[0] and sum(GIFT[x][0] for x in s) > BUD: continue
            if r[1] and len({GIFT[x][2] for x in s}) < n: continue
            if r[2] and 'B' in s and 'D' in s: continue
            if r[3] and n < 3: continue
            res.append((sum(GIFT[x][1] for x in s), s))
    return sorted(res, reverse=True)
S5 = sets5(); b5 = S5[0][0]
check(b5 == 20 and [s for v, s in S5 if v == b5] == [('C', 'D', 'E')], f'S-BQ05 {S5[:3]}')
alts5 = [sets5(tuple(0 if j == i else 1 for j in range(4)))[0] for i in range(4)]
check([v for v, s in alts5] == [37, 21, 29, 27] and [s for v, s in alts5] == [('B', 'C', 'F'), ('A', 'C', 'D'), ('B', 'C', 'D'), ('B', 'F')], f'S-BQ05 every rule changes the answer {alts5}')
check(all(len([s for v, s in sets5(tuple(0 if j == i else 1 for j in range(4))) if v == alts5[i][0]]) == 1 for i in range(4)), 'S-BQ05 trap optima unique')
opts5v = sorted([b5] + [v for v, s in alts5]); check(len(set(opts5v)) == 5, f'S-BQ05 {opts5v}')
ans5 = opts5v.index(b5)
withB = [(v, s) for v, s in S5 if 'B' in s]
check(withB == [] and all(len(s) == 3 for v, s in S5), 'S-BQ05 explanation: B never fits, only three-item sets')
items.append({
 'id': 'S-BQ05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 구성할 수 있는 선물 세트의 만족도 합의 최댓값은?',
 'body': [p('甲은 아래 상품 A~F 가운데 몇 가지를 골라 선물 세트 하나를 구성하려 한다. 상품마다 가격, 받는 사람의 만족도, 종류는 아래와 같고, 세트의 만족도는 넣은 상품의 만족도를 더한 것이다. 甲은 다음 규칙을 모두 지키면서 만족도의 합을 가장 크게 하려 한다.'),
          table(['상품', '가격(천 원)', '만족도', '종류'], [[k, str(c), str(v), t] for k, (c, v, t) in GIFT.items()], caption='상품별 가격·만족도·종류', num=False),
          box('규칙', ['가격의 합은 5만 원을 넘을 수 없다.', '같은 종류의 상품은 두 개 이상 넣을 수 없다.', 'B와 D는 함께 넣을 수 없다.', '상품을 세 개 이상 넣어야 한다.'], plain=True)],
 'options': [str(v) for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['종류가 셋(과일·차·견과)이므로 세 개 이상 넣으려면 종류마다 꼭 하나씩, 정확히 세 개를 넣어야 한다.', '만족도가 가장 큰 B(차)를 넣으면 견과는 D를 넣을 수 없어 F(3만 원)를 넣어야 하는데, B + F만으로 4만 5천 원이라 과일을 더할 수 없다. 따라서 B는 넣을 수 없고 차는 E이다.',
         'E(2만 2천 원)와 함께 견과는 D(1만 원)만 예산에 맞는다(F를 넣으면 5만 2천 원). 남은 1만 8천 원으로 과일은 A(5)나 C(10)를 넣을 수 있으므로 C를 넣는다.', '따라서 최댓값은 C·D·E의 <b>20</b>이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 상품 조합 63가지를 모두 따져 확인하였다. <b>함정</b> 예산을 빼면 37(B·C·F), 종류 규칙을 빼면 21(A·C·D), B·D 규칙을 빼면 29(B·C·D), 개수 규칙을 빼면 27(B·F)이 된다.')]})
check(GIFT['B'][0] + GIFT['F'][0] == 45 and GIFT['E'][0] + GIFT['F'][0] == 52 and BUD - GIFT['E'][0] - GIFT['D'][0] == 18 and min(GIFT[x][0] for x in 'AC') == 18, 'S-BQ05 explanation numbers')

REVIEW = {
 'S-BQ01': ('법조문 계산', '상', '2분 30초', '구간별 단가, 감면 대상, 누수량 제외', '구간 계산·감면 범위 착오', '가구별 사용량 → 구간 → 감면 → 하수도', '수도 요금형, 조문 넷, 새로 설계'),
 'S-BQ02': ('경우의 수', '상', '2분', '원순열, 이웃·비이웃, 두 묶음', '회전 중복 셈', '한 사람 고정', '원탁형, 새로 설계(전수)'),
 'S-BQ03': ('법조문 적용', '상', '1분 30초', '청구권자, 연장 횟수, 부분 공개, 이의신청 기간', '기간·연장 착오', '조문별 대조', '정보 공개형, 조문 다섯, 새로 설계'),
 'S-BQ04': ('수리 추론', '상', '2분', '일의 양 합, 나누어 하기', '시간끼리 더함', '1시간 일의 양', '일의 양형, 새로 설계'),
 'S-BQ05': ('최적화', '상', '3분', '예산, 종류 배타, 함께 금지, 최소 개수', '규칙 하나 누락', '종류 셋 = 정확히 세 개', '선물 세트형, 새로 설계(63가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bq.py', 'review/sit-bq.md'), '상황판단 S-BQ 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
