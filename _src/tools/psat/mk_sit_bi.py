# 상황판단 S-BI01..S-BI05 — 5급 실전(심화) 수준 정예 문항: 주택용 전기 요금(누진 구간·하계 완화·할인 한도), 동전으로 값 치르기(전수), 드론 비행 규정, 빠른 시계와 느린 시계, 방문 순서 정하기(24가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, math
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bi.js'

# ---------------------------------------------------------------- S-BI01 주택용 전기 요금 (법조문 계산)
HOUSE = {'甲': (3, 350, False), '乙': (7, 350, False), '丙': (8, 500, True), '丁': (1, 120, True)}     # 월, 사용량 kWh, 장애인 가구
def bill(k, summer=True, base=True, disc=True, floor0=True):
    m, use, dis = HOUSE[k]
    b1, b2 = (300, 450) if (summer and m in (7, 8)) else (200, 400)
    basic = 1000 if use <= b1 else 2000 if use <= b2 else 7000
    energy = min(use, b1) * 100 + max(0, min(use, b2) - b1) * 200 + max(0, use - b2) * 300
    fee = (basic if base else 0) + energy
    if disc and dis: fee = max(fee - 16000, 0) if floor0 else fee - 16000
    return fee
each1 = {k: bill(k) for k in HOUSE}
check(each1 == {'甲': 52000, '乙': 42000, '丙': 66000, '丁': 0}, f'S-BI01 {each1}')
tot1 = lambda **kw: sum(bill(k, **kw) for k in HOUSE)
alts1 = {'정답': tot1(), '하계 완화 누락': tot1(summer=False), '할인 누락': tot1(disc=False), '할인 한도 초과': tot1(floor0=False), '기본요금 누락': tot1(base=False)}
check(alts1 == {'정답': 160000, '하계 완화 누락': 185000, '할인 누락': 189000, '할인 한도 초과': 157000, '기본요금 누락': 149000}, f'S-BI01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BI01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BI01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁 네 가구가 낸 전기 요금의 합계는?',
 'body': [law('<p><b>제○○조(요금)</b> ① 한 달 전기 요금은 기본요금과 전력량 요금을 더한 금액으로 한다.<br>② 기본요금은 한 달 사용량이 200kWh 이하이면 1,000원, 200kWh 초과 400kWh 이하이면 2,000원, 400kWh 초과이면 7,000원으로 한다.<br>③ 전력량 요금은 사용량 가운데 처음 200kWh까지는 kWh당 100원, 200kWh 초과 400kWh까지의 부분은 kWh당 200원, 400kWh를 초과하는 부분은 kWh당 300원으로 계산한다.</p>'
              '<p><b>제○○조(하계 특례)</b> 7월과 8월에는 제2항과 제3항의 200kWh를 300kWh로, 400kWh를 450kWh로 본다.</p>'
              '<p><b>제○○조(할인)</b> 장애인 가구에는 한 달 16,000원을 한도로 요금을 할인한다. 다만 할인액은 그달 요금을 넘을 수 없다.</p>'),
          box('상황', ['甲: 3월 사용량 350kWh', '乙: 7월 사용량 350kWh', '丙(장애인 가구): 8월 사용량 500kWh', '丁(장애인 가구): 1월 사용량 120kWh'], plain=True)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲(3월): 기본 2,000 + 200 × 100 + 150 × 200 = 52,000원.', '乙(7월, 구간 300·450): 기본 2,000 + 300 × 100 + 50 × 200 = 42,000원.',
         '丙(8월): 기본 7,000 + 300 × 100 + 150 × 200 + 50 × 300 = 82,000원 → 16,000원 할인 → 66,000원.', '丁(1월): 기본 1,000 + 120 × 100 = 13,000원 → 할인액은 요금을 넘을 수 없으므로 13,000원 할인 → 0원.']),
  p(f'합계 52,000 + 42,000 + 66,000 + 0 = <b>160,000원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 하계 특례를 빼면 185,000원, 할인을 빼면 189,000원, 丁의 요금을 음수로 두면 157,000원, 기본요금을 빼면 149,000원이다.')]})

# ---------------------------------------------------------------- S-BI02 동전으로 값 치르기 (전수)
COINS = {500: 2, 100: 5, 50: 4}
def ways(amount):
    return [(a, b, c) for a in range(COINS[500] + 1) for b in range(COINS[100] + 1) for c in range(COINS[50] + 1) if 500 * a + 100 * b + 50 * c == amount]
W1000, W700 = ways(1000), ways(700)
payable = {500 * a + 100 * b + 50 * c for a in range(3) for b in range(6) for c in range(5)}
t2 = {'ㄱ': len(W1000) == 4, 'ㄴ': min(sum(w) for w in W1000) == 2, 'ㄷ': len(W700) == 3, 'ㄹ': all(v in payable for v in range(50, 1701, 50))}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and len(W700) == 4 and max(payable) == 1700, f'S-BI02 {t2} {W1000} {W700}')
check(sorted(W1000) == [(1, 3, 4), (1, 4, 2), (1, 5, 0), (2, 0, 0)] and sorted(W700) == [(0, 5, 4), (1, 0, 4), (1, 1, 2), (1, 2, 0)], 'S-BI02 explanation lists')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ']; ans2 = combo(t2, opts2, 'S-BI02')
items.append({
 'id': 'S-BI02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('甲의 지갑에는 500원짜리 동전 2개, 100원짜리 동전 5개, 50원짜리 동전 4개만 있다. 甲은 이 동전만으로 거스름돈 없이 값을 정확히 치른다. 같은 종류의 동전끼리는 구별하지 않으며, 종류별 동전 개수가 같으면 같은 방법으로 본다.'),
          box('보기', ['ㄱ. 1,000원을 치르는 방법은 4가지이다.', 'ㄴ. 1,000원을 치를 때 동전을 가장 적게 쓰면 2개를 쓴다.', 'ㄷ. 700원을 치르는 방법은 3가지이다.', 'ㄹ. 50원부터 1,700원까지 50원 단위의 금액은 모두 치를 수 있다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['1,000원: 500원 2개 / 500원 1개 + 100원 5개 / 500원 1개 + 100원 4개 + 50원 2개 / 500원 1개 + 100원 3개 + 50원 4개 → 4가지(ㄱ). 500원을 안 쓰면 100원과 50원을 다 써도 700원이라 불가능하다. 가장 적게 쓰면 500원 2개(ㄴ).',
         '700원: 500원 1개에 200원(100원 2개, 100원 1개 + 50원 2개, 50원 4개) 3가지, 500원 없이 100원 5개 + 50원 4개 1가지 → 4가지(ㄷ).',
         'ㄹ: 100원과 50원으로 0원부터 700원까지 50원 단위를 모두 만들 수 있고, 여기에 500원을 0개, 1개, 2개 더하면 0~700원, 500~1,200원, 1,000~1,700원이 되어 빈틈이 없다.']),
  bx([('ㄱ', '4가지', True, O, '위 4가지.'), ('ㄴ', '2개', True, O, '500원 2개.'), ('ㄷ', '3가지', False, XX, '500원을 쓰지 않는 방법까지 4가지.'), ('ㄹ', '모두 가능', True, O, '세 구간이 겹쳐 빈틈이 없다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 동전 조합을 모두 따져 확인하였다. <b>함정</b> 700원을 500원부터 채우는 방법만 세지 않는다.')]})
check({100 * b + 50 * c for b in range(6) for c in range(5)} == set(range(0, 701, 50)), 'S-BI02 explanation 0..700 complete')

# ---------------------------------------------------------------- S-BI03 드론 비행 규정 (법조문 적용, 옳은 것)
def needs_report(kg): return kg > 2
def may_fly(alt_m, airport_km, night, approved): return alt_m < 150 and airport_km > 9 and (not night or approved)
def need_ins(commercial): return commercial
FINE = {'비행 제한': 2000000, '신고·보험': 1000000}
f3 = [may_fly(50, 5, False, False), may_fly(50, 20, True, True), may_fly(200, 20, False, True), need_ins(False), FINE['신고·보험'] >= 2000000]
one_true(f3, 1, 'S-BI03')
check(not needs_report(1.5) and needs_report(3), 'S-BI03 report threshold')
items.append({
 'id': 'S-BI03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(신고)</b> 최대 이륙 중량이 2kg을 넘는 드론을 날리려는 자는 미리 신고하여야 한다.</p>'
              '<p><b>제○○조(비행 제한)</b> ① 누구든지 다음 각 호의 비행을 하여서는 아니 된다.<br>1. 고도 150미터 이상에서의 비행<br>2. 공항 중심으로부터 반경 9킬로미터 이내에서의 비행<br>3. 일몰 후부터 일출 전까지의 비행<br>② 제1항 제3호의 비행은 미리 승인을 받은 경우에는 할 수 있다.</p>'
              '<p><b>제○○조(보험)</b> 돈을 받고 드론을 날리는 자는 보험에 가입하여야 한다.</p>'
              '<p><b>제○○조(과태료)</b> 비행 제한을 위반한 자에게는 200만 원 이하, 신고나 보험 가입 의무를 위반한 자에게는 100만 원 이하의 과태료를 부과한다.</p>')],
 'options': ['최대 이륙 중량 1.5kg인 드론은 신고 대상이 아니므로 공항 중심에서 5km 떨어진 곳에서도 낮에 날릴 수 있다.', '미리 승인을 받으면 일몰 후에도 공항에서 멀리 떨어진 곳에서 고도 50미터로 드론을 날릴 수 있다.',
             '미리 승인을 받으면 고도 200미터에서도 드론을 날릴 수 있다.', '취미로 드론을 날리는 자도 보험에 가입하여야 한다.', '신고 없이 3kg인 드론을 날린 자에게는 200만 원의 과태료를 부과할 수 있다.'],
 'answer': 1,
 'explain': [
  ox([(False, XX, '신고 대상이 아니어도 공항 반경 9km 이내 비행은 금지된다.'), (True, O, '야간 비행은 미리 승인을 받으면 할 수 있고, 고도와 공항 거리 제한에도 걸리지 않는다.'), (False, XX, '승인으로 풀리는 것은 야간 비행(제3호)뿐이다.'),
      (False, XX, '보험 의무는 돈을 받고 날리는 자에게만 있다.'), (False, XX, '신고 의무 위반은 100만 원 이하이다.')]),
  p('따라서 정답은 <b>②</b>이다. <b>함정</b> 신고 대상이 아니라는 것과 비행 제한이 없다는 것을 혼동하지 않고, 승인 단서가 어느 호에만 붙는지 확인한다.')]})

# ---------------------------------------------------------------- S-BI04 빠른 시계와 느린 시계 (수리 추론)
FAST, SLOW, DIAL = 3, 2, 12 * 60          # 하루에 3분 빠르게, 2분 느리게, 바늘 시계 한 바퀴 720분
def first_day(rate): return next(d for d in range(1, 10000) if (rate * d) % DIAL == 0)
def shows(day, drift): t = (12 * 60 + drift * day) % DIAL; return (t // 60 or 12, t % 60)
tA, tB, tAB = first_day(FAST), first_day(SLOW), first_day(FAST + SLOW)
t4 = {'ㄱ': tA == 240, 'ㄴ': tAB == 144, 'ㄷ': tB < tA, 'ㄹ': shows(50, -SLOW) == (10, 40)}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and tB == 360 and shows(50, -SLOW) == (10, 20) and shows(50, FAST) == (2, 30), f'S-BI04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BI04')
items.append({
 'id': 'S-BI04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('甲은 바늘이 있는 시계 A와 B를 1월 1일 정오에 정확한 시각으로 맞추었다. A는 하루에 3분씩 빨라지고, B는 하루에 2분씩 느려진다. 두 시계는 12시간에 한 바퀴를 도는 보통의 시계이며, 빨라지거나 느려지는 정도는 하루 동안 고르게 일어난다.'),
          box('보기', ['ㄱ. A가 처음으로 다시 정확한 시각을 가리키는 것은 240일 뒤 정오이다.', 'ㄴ. 두 시계가 처음으로 다시 같은 시각을 가리키는 것은 144일 뒤 정오이다.', 'ㄷ. B는 A보다 먼저 다시 정확한 시각을 가리킨다.', 'ㄹ. 50일 뒤 정오에 B는 10시 40분을 가리킨다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['바늘 시계는 720분(12시간) 어긋나면 다시 같은 자리를 가리킨다.', 'A: 720 ÷ 3 = 240일 뒤(ㄱ). B: 720 ÷ 2 = 360일 뒤이므로 A보다 늦다(ㄷ).',
         '두 시계의 차이는 하루 3 + 2 = 5분씩 벌어지므로 720 ÷ 5 = 144일 뒤에 같은 시각을 가리킨다(ㄴ).', '50일 뒤 B는 100분 느리므로 정오에서 1시간 40분 앞선 10시 20분을 가리킨다(ㄹ).']),
  bx([('ㄱ', 'A 240일', True, O, '720 ÷ 3.'), ('ㄴ', '144일', True, O, '720 ÷ 5.'), ('ㄷ', 'B가 먼저', False, XX, 'B는 360일.'), ('ㄹ', '10시 40분', False, XX, '10시 20분.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 24시간이 아니라 12시간(720분) 어긋나면 같은 자리로 돌아온다.')]})

# ---------------------------------------------------------------- S-BI05 방문 순서 정하기 (24가지 전수, 규칙 모두 필요)
TT = {'집A': 30, '집B': 35, '집C': 25, '집D': 50, 'AB': 60, 'AC': 60, 'AD': 25, 'BC': 20, 'BD': 25, 'CD': 40}     # 분
def tt(x, y): return TT.get(x + y, TT.get(y + x)) if '집' not in (x, y) else TT['집' + (y if x == '집' else x)]
def tours(r=(1, 1, 1)):
    res = []
    for o in itertools.permutations('ABCD'):
        if r[0] and o.index('B') > o.index('D'): continue
        if r[1] and o.index('C') not in (1, 2): continue
        if r[2] and o.index('A') not in (0, 1): continue
        path = ('집',) + o + ('집',)
        res.append((sum(tt(path[i], path[i + 1]) for i in range(5)), o))
    m = min(t for t, _ in res); return m, [o for t, o in res if t == m], sorted(res)
b5, a5, all5 = tours()
check(b5 == 185 and a5 == [('A', 'C', 'B', 'D')], f'S-BI05 {b5} {a5}')
alts5 = [tours(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check(alts5 == [150, 180, 150], f'S-BI05 every rule changes the answer {alts5}')
second = sorted({t for t, _ in all5})[1]
reach = {t for r in itertools.product((0, 1), repeat=3) for t, _ in tours(r)[2]}
FILL = 165
check(FILL not in reach and second == 200, f'S-BI05 filler {FILL} second {second} {sorted(reach)}')
opts5v = sorted({b5, second, FILL, *alts5}); check(len(opts5v) == 5, f'S-BI05 {opts5v}')
ans5 = opts5v.index(b5)
check([o for t, o in all5] and len(all5) == 3 and sorted(o for t, o in all5) == [('A', 'B', 'C', 'D'), ('A', 'C', 'B', 'D'), ('B', 'A', 'C', 'D')], f'S-BI05 feasible orders {all5}')
items.append({
 'id': 'S-BI05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 이동하는 데 걸리는 시간의 합의 최솟값은?',
 'body': [p('甲은 집에서 출발하여 A, B, C, D 네 곳을 한 번씩 들른 뒤 집으로 돌아온다. 두 곳 사이의 이동 시간은 아래와 같고(방향과 관계없이 같다), 다음 규칙을 모두 지켜야 한다.'),
          table(['구간', '이동 시간(분)', '구간', '이동 시간(분)'], [['집–A', '30', 'A–B', '60'], ['집–B', '35', 'A–C', '60'], ['집–C', '25', 'A–D', '25'], ['집–D', '50', 'B–C', '20'], ['', '', 'B–D', '25'], ['', '', 'C–D', '40']], caption='구간별 이동 시간', num=False),
          box('규칙', ['B는 D보다 먼저 들른다.', '점심을 먹을 C는 두 번째나 세 번째로 들른다.', 'A는 오후에 문을 닫으므로 첫 번째나 두 번째로 들른다.'], plain=True)],
 'options': [f'{v}분' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['A는 1·2번째, C는 2·3번째, B는 D보다 앞이므로 가능한 순서는 A–B–C–D, A–C–B–D, B–A–C–D 세 가지뿐이다(D는 늘 마지막).',
         'A–B–C–D: 30 + 60 + 20 + 40 + 50 = 200분. A–C–B–D: 30 + 60 + 20 + 25 + 50 = 185분. B–A–C–D: 35 + 60 + 60 + 40 + 50 = 245분.', '따라서 최솟값은 <b>185분</b>이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 방문 순서 24가지를 모두 따져 확인하였다. <b>함정</b> B·D 순서 규칙이나 A의 시간 규칙을 빼면 150분, C의 규칙을 빼면 180분이 된다.')]})
check({o: t for t, o in all5} == {('A', 'B', 'C', 'D'): 200, ('A', 'C', 'B', 'D'): 185, ('B', 'A', 'C', 'D'): 245}, 'S-BI05 explanation sums')

REVIEW = {
 'S-BI01': ('법조문 계산', '상', '2분 30초', '누진 구간, 하계 특례, 기본요금 구간, 할인 한도', '특례·한도 누락', '가구별 구간 → 기본 → 전력량 → 할인', '전기 요금형, 조문 셋, 새로 설계'),
 'S-BI02': ('경우의 수', '상', '2분', '개수 제한 있는 동전 조합, 구간 이어 붙이기', '큰 동전부터만 세기', '500원 개수별로 나누기', '동전 지불형, 새로 설계(전수)'),
 'S-BI03': ('법조문 적용', '상', '1분 30초', '신고와 비행 제한의 구별, 단서의 범위, 보험 대상', '단서 범위 확대', '조문별 대조', '드론 비행형, 조문 넷, 새로 설계'),
 'S-BI04': ('수리 추론', '상', '2분', '12시간 주기, 상대 속도, 시각 계산', '24시간 주기로 착각', '어긋난 분 ÷ 720', '두 시계형, 새로 설계'),
 'S-BI05': ('최적화', '상', '3분', '위치 규칙으로 후보 줄이기, 경로 합', '규칙 하나 누락', '가능한 순서부터 나열', '방문 순서형, 새로 설계(24가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bi.py', 'review/sit-bi.md'), '상황판단 S-BI 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
