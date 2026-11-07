# 상황판단 S-BT01..S-BT05 — 5급 실전(심화) 수준 정예 문항: 평생교육 이용권 지원금(가산 상한·감액 범위), 격자 속 직사각형(전수), 자동차 교환·환불 규정, 원가와 이익률, 사무실 배정(24가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bt.js'

# ---------------------------------------------------------------- S-BT01 평생교육 이용권 지원금 (법조문 계산, 만 원)
PEOPLE = {'甲': (True, True, 40, None), '乙': (False, False, 70, F(40, 100)), '丙': (False, True, 50, F(80, 100)), '丁': (False, False, 30, None)}   # 수급자, 장애인, 나이, 직전 연도 사용 비율(None = 받지 않음)
def grant(k, cap=True, cut=True, cut_all=False, age_add=True):
    poor, dis, age, used = PEOPLE[k]
    base, add = F(35), F(15) * poor + F(10) * dis + F(5) * (age >= 65 and age_add)
    hit = used is not None and used < F(60, 100)
    if cut and hit:
        if cut_all: return (base + add) / 2
        base /= 2
    tot = base + add
    return min(tot, F(50)) if cap else tot
each1 = {k: grant(k) for k in PEOPLE}
check(each1 == {'甲': 50, '乙': F(45, 2), '丙': 45, '丁': 35}, f'S-BT01 {each1}')
tot1 = lambda **kw: sum(grant(k, **kw) for k in PEOPLE)
alts1 = {'정답': tot1(), '상한 무시': tot1(cap=False), '감액 누락': tot1(cut=False), '가산까지 절반': tot1(cut_all=True), '65세 가산 누락': tot1(age_add=False)}
check(alts1 == {'정답': F(305, 2), '상한 무시': F(325, 2), '감액 누락': 170, '가산까지 절반': 150, '65세 가산 누락': F(295, 2)}, f'S-BT01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BT01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
won = lambda man: f'{int(man * 10000):,}원'
items.append({
 'id': 'S-BT01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 올해 받을 평생교육 이용권 지원금의 합계는?',
 'body': [law('<p><b>제○○조(기본 지원금)</b> 평생교육 이용권 지원금은 1인당 연 35만 원으로 한다.</p>'
              '<p><b>제○○조(가산 지원금)</b> ① 다음 각 호에 해당하는 사람에게는 기본 지원금에 다음 금액을 더한다. 둘 이상에 해당하면 각각의 금액을 모두 더한다.<br>1. 「국민기초생활 보장법」에 따른 수급자: 15만 원<br>2. 장애인: 10만 원<br>3. 65세 이상인 사람: 5만 원<br>② 1인당 지원금의 합계는 50만 원을 넘을 수 없다.</p>'
              '<p><b>제○○조(감액)</b> 직전 연도에 지원금을 받았으나 그 금액의 100분의 60 미만을 사용한 사람에게는 기본 지원금의 2분의 1만 지급한다. 가산 지원금은 감액하지 아니한다.</p>'),
          box('상황', ['甲: 40세, 수급자이면서 장애인, 직전 연도에 지원금을 받지 않음', '乙: 70세, 직전 연도에 받은 지원금의 40%를 사용', '丙: 50세 장애인, 직전 연도에 받은 지원금의 80%를 사용', '丁: 30세, 직전 연도에 지원금을 받지 않음'], plain=True)],
 'options': [won(v) for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 35 + 15 + 10 = 60만 원이지만 상한 50만 원.', '乙: 40%만 썼으므로 기본 지원금의 절반 17만 5천 원 + 65세 이상 5만 원 = 22만 5천 원.', '丙: 80%를 썼으므로 감액 없이 35 + 10 = 45만 원.', '丁: 35만 원.']),
  p(f'합계 50 + 22.5 + 45 + 35 = <b>152만 5천 원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 乙의 65세 이상 가산을 빠뜨리면 147만 5천 원, 가산 지원금까지 절반으로 줄이면 150만 원, 상한을 무시하면 162만 5천 원, 감액을 빠뜨리면 170만 원이다.')]})

# ---------------------------------------------------------------- S-BT02 격자 속 직사각형 (전수)
ROWS, COLS = 3, 4
RECTS = [(r1, r2, c1, c2) for r1, r2 in itertools.combinations(range(ROWS + 1), 2) for c1, c2 in itertools.combinations(range(COLS + 1), 2)]
area = lambda x: (x[1] - x[0]) * (x[3] - x[2]); square = lambda x: x[1] - x[0] == x[3] - x[2]
t2 = {'ㄱ': len(RECTS) == 60, 'ㄴ': sum(map(square, RECTS)) == 18, 'ㄷ': sum(area(x) == 1 for x in RECTS) == 12, 'ㄹ': sum(area(x) == 2 for x in RECTS) == 17}
check(t2 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': True} and sum(map(square, RECTS)) == 20, f'S-BT02 {t2}')
check(6 * 10 == 60 and 12 + 6 + 2 == 20 and 3 * 3 + 2 * 4 == 17, 'S-BT02 explanation arithmetic')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BT02')
items.append({
 'id': 'S-BT02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('가로 4칸, 세로 3칸으로 된 격자가 있다. 격자의 칸은 모두 크기가 같은 정사각형이다. 격자의 선을 따라 만들 수 있는 직사각형(정사각형 포함)의 개수를 센다. 크기와 모양이 같아도 놓인 자리가 다르면 다른 직사각형으로 센다.'),
          box('보기', ['ㄱ. 만들 수 있는 직사각형은 모두 60개이다.', 'ㄴ. 이 가운데 정사각형은 18개이다.', 'ㄷ. 칸 1개로 된 직사각형은 12개이다.', 'ㄹ. 칸 2개로 된 직사각형은 17개이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 가로선 4개 가운데 2개, 세로선 5개 가운데 2개를 고르면 직사각형 하나가 정해진다 → 6 × 10 = 60개.', 'ㄴ: 한 변이 1칸인 정사각형 12개, 2칸 2 × 3 = 6개, 3칸 1 × 2 = 2개 → 20개.',
         'ㄷ: 칸 수와 같은 12개.', 'ㄹ: 가로로 2칸인 것은 줄마다 3개씩 9개, 세로로 2칸인 것은 열마다 2개씩 8개 → 17개.']),
  bx([('ㄱ', '60개', True, O, '6 × 10.'), ('ㄴ', '정사각형 18개', False, XX, '20개이다.'), ('ㄷ', '12개', True, O, '칸 수.'), ('ㄹ', '17개', True, O, '9 + 8.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 60개를 모두 나열해 확인하였다. <b>함정</b> 정사각형은 한 변의 길이별로 나누어 센다.')]})

# ---------------------------------------------------------------- S-BT03 자동차 교환·환불 (법조문 적용, 옳은 것)
def eligible(months, km, kind=None, repairs=0, recurred=False, shop_days=0, owner_fault=False):
    if owner_fault or months > 12 or km > 20000: return False
    need = 2 if kind == '중대' else 3
    return (kind is not None and repairs >= need and recurred) or shop_days > 30
f3 = [eligible(18, 10000, '중대', 2, True), eligible(6, 5000, '중대', 1, True), eligible(6, 5000, '일반', 2, True), eligible(6, 5000, '중대', 2, True, owner_fault=True), eligible(8, 15000, shop_days=35)]
one_true(f3, 4, 'S-BT03')
check(eligible(6, 5000, '중대', 2, True) and eligible(6, 5000, '일반', 3, True) and not eligible(8, 15000, shop_days=30), 'S-BT03 boundaries')
items.append({
 'id': 'S-BT03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(교환·환불 요구)</b> 신차를 넘겨받은 날부터 1년 이내이고 주행거리가 2만 km 이내인 자동차에 다음 각 호의 어느 하나에 해당하는 일이 생기면, 소유자는 제작자에게 교환이나 환불을 요구할 수 있다.<br>1. 원동기·동력전달장치·조향장치·제동장치의 하자(이하 ‘중대한 하자’라 한다)로 2회 이상 수리하였으나 같은 하자가 다시 생긴 경우<br>2. 중대한 하자가 아닌 하자로 3회 이상 수리하였으나 같은 하자가 다시 생긴 경우<br>3. 하자를 수리하려고 정비업체에 맡긴 기간이 모두 합하여 30일을 넘는 경우</p>'
              '<p><b>제○○조(제외)</b> 소유자의 고의나 과실로 생긴 하자에는 제○○조(교환·환불 요구)를 적용하지 아니한다.</p>')],
 'options': ['넘겨받은 지 1년 6개월이 된 자동차라도 주행거리가 1만 km라면 교환을 요구할 수 있다.', '제동장치의 하자로 1회 수리하였으나 같은 하자가 다시 생겼다면 교환을 요구할 수 있다.', '오디오 장치의 하자로 2회 수리하였으나 같은 하자가 다시 생겼다면 환불을 요구할 수 있다.',
             '소유자의 과실로 생긴 조향장치 하자로 2회 수리하였으나 다시 생겼다면 교환을 요구할 수 있다.', '넘겨받은 지 8개월, 주행거리 1만 5천 km인 자동차를 여러 하자 수리로 정비업체에 모두 35일 맡겼다면 환불을 요구할 수 있다.'],
 'answer': 4,
 'explain': [
  ox([(False, XX, '넘겨받은 날부터 1년 이내여야 한다.'), (False, XX, '중대한 하자는 2회 이상 수리한 뒤 다시 생겨야 한다.'), (False, XX, '중대한 하자가 아니므로 3회 이상 수리한 뒤 다시 생겨야 한다.'),
      (False, XX, '소유자의 과실로 생긴 하자에는 적용하지 않는다.'), (True, O, '1년·2만 km 이내이고 맡긴 기간이 모두 30일을 넘는다.')]),
  p('따라서 정답은 <b>⑤</b>이다. <b>함정</b> 기간과 거리의 두 요건, 하자의 종류별 수리 횟수, 제외 사유를 함께 확인한다.')]})

# ---------------------------------------------------------------- S-BT04 원가와 이익률 (수리 추론)
COST = 20000; PRICE = COST * F(3, 2)
sell = lambda disc: PRICE * (1 - F(disc, 100))
t4 = {'ㄱ': PRICE == 30000, 'ㄴ': sell(20) - COST == 4000, 'ㄷ': sell(30) < COST, 'ㄹ': F(80 * PRICE + 20 * sell(50) - 100 * COST, 100 * COST) == F(40, 100)}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and sell(30) == 21000 and F(80 * PRICE + 20 * sell(50) - 100 * COST, 100 * COST) == F(35, 100), f'S-BT04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BT04')
items.append({
 'id': 'S-BT04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('갑 상점은 원가 20,000원인 상품에 원가의 50%를 이익으로 붙여 정가를 정한다. 할인은 정가에 할인율을 곱한 만큼 빼며, 이익은 판매 가격에서 원가를 뺀 금액, 이익률은 이익을 원가로 나눈 값이다.'),
          box('보기', ['ㄱ. 이 상품의 정가는 30,000원이다.', 'ㄴ. 정가에서 20% 할인하여 팔면 1개당 이익은 4,000원이다.', 'ㄷ. 정가에서 30% 할인하여 팔면 손해를 본다.', 'ㄹ. 100개 가운데 80개는 정가에, 나머지는 정가에서 50% 할인하여 팔면 전체 이익률은 40%이다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 20,000 × 1.5 = 30,000원.', 'ㄴ: 30,000 × 0.8 = 24,000원 → 이익 4,000원.', 'ㄷ: 30,000 × 0.7 = 21,000원으로 원가보다 1,000원 많아 이익이다.', 'ㄹ: 매출 80 × 30,000 + 20 × 15,000 = 2,700,000원, 원가 2,000,000원 → 이익률 35%.']),
  bx([('ㄱ', '정가 30,000원', True, O, '원가 × 1.5.'), ('ㄴ', '이익 4,000원', True, O, '24,000 − 20,000.'), ('ㄷ', '30% 할인 시 손해', False, XX, '1,000원 이익이다.'), ('ㄹ', '이익률 40%', False, XX, '35%이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 정가에 붙인 50%와 할인율은 기준(원가와 정가)이 다르므로, 30% 할인해도 원가 아래로 내려가지 않는다.')]})

# ---------------------------------------------------------------- S-BT05 사무실 배정 (24가지 전수, 규칙 모두 필요)
SAT = {'甲': [6, 7, 7, 8], '乙': [1, 4, 4, 9], '丙': [5, 2, 7, 4], '丁': [7, 3, 1, 6]}     # 방 1~4에 배정될 때의 만족도
PPL = list(SAT); ROOMS = [1, 2, 3, 4]; floor = lambda r: 1 if r <= 2 else 2
def plans(r=(1, 1, 1)):
    res = []
    for pm in itertools.permutations(ROOMS):
        a = dict(zip(PPL, pm))
        if r[0] and floor(a['甲']) == 2: continue
        if r[1] and floor(a['乙']) == floor(a['丙']): continue
        if r[2] and a['丁'] == 4: continue
        res.append((sum(SAT[k][a[k] - 1] for k in PPL), pm))
    return sorted(res, reverse=True)
PL = plans(); b5 = PL[0][0]
check(b5 == 22 and [pm for v, pm in PL if v == b5] == [(2, 4, 1, 3)], f'S-BT05 {PL[:3]}')
alts5 = [plans(tuple(0 if j == i else 1 for j in range(3))) for i in range(3)]
check([a[0][0] for a in alts5] == [26, 30, 23] and all(a[0][0] > a[1][0] for a in alts5), f'S-BT05 every rule changes the answer {[a[:2] for a in alts5]}')
sec5 = sorted({v for v, _ in PL}, reverse=True)[1]
check(sec5 == 18 and all(pm[3] == 3 for v, pm in PL), f'S-BT05 second best {sec5}; 丁 always in room 3')
opts5v = sorted([sec5, b5] + [a[0][0] for a in alts5]); check(len(set(opts5v)) == 5, f'S-BT05 {opts5v}')
ans5 = opts5v.index(b5)
check(sorted(v for v, _ in PL) == [13, 15, 18, 22], f'S-BT05 the four plans {sorted(v for v, _ in PL)}')
items.append({
 'id': 'S-BT05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 네 사람의 만족도 합의 최댓값은?',
 'body': [p('甲, 乙, 丙, 丁 네 사람을 방 1~4에 한 사람씩 배정한다. 방 1·2는 1층, 방 3·4는 2층에 있다. 각 사람이 각 방에 배정될 때의 만족도는 아래와 같고, 다음 규칙을 모두 지키면서 네 사람의 만족도 합을 가장 크게 하려 한다.'),
          table(['', '방 1', '방 2', '방 3', '방 4'], [[k] + [str(x) for x in v] for k, v in SAT.items()], caption='사람별·방별 만족도', num=False),
          box('규칙', ['甲은 2층 방에 배정하지 않는다.', '乙과 丙은 같은 층에 배정하지 않는다.', '丁은 방 4에 배정하지 않는다.'], plain=True)],
 'options': [str(v) for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['1층에는 甲과, 乙·丙 가운데 한 사람이 간다. 따라서 丁은 2층이고, 방 4에 갈 수 없으므로 방 3이다(만족도 1).', '방 4에는 乙 또는 丙이 간다. 乙이 방 4(9)이면 1층에 甲·丙: 甲 방 2(7) + 丙 방 1(5) = 12 → 합 22. 甲 방 1·丙 방 2이면 6 + 2 = 8 → 합 18.',
         '丙이 방 4(4)이면 1층에 甲·乙: 甲 방 1(6) + 乙 방 2(4) = 10 → 합 15, 甲 방 2·乙 방 1이면 합 13.', '따라서 최댓값은 <b>22</b>이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 배정 24가지를 모두 따져 확인하였다. <b>함정</b> 甲의 규칙을 빼면 26, 乙·丙의 규칙을 빼면 30, 丁의 규칙을 빼면 23이 된다.')]})

REVIEW = {
 'S-BT01': ('법조문 계산', '상', '2분 30초', '가산 합산과 상한, 감액 대상(60% 미만 사용), 감액 범위(기본만)', '감액 대상·범위 착오', '사람별 기본 → 감액 → 가산 → 상한', '평생교육 이용권형, 조문 셋, 새로 설계'),
 'S-BT02': ('경우의 수', '상', '2분', '선 두 개씩 고르기, 정사각형 크기별, 칸 수별', '정사각형 크기 누락', '선 고르기', '격자 직사각형형, 새로 설계(전수)'),
 'S-BT03': ('법조문 적용', '상', '1분 30초', '기간·거리 요건, 하자 종류별 횟수, 누적 기간, 제외 사유', '요건 하나만 보고 판단', '조문별 대조', '자동차 교환·환불형, 조문 둘, 새로 설계'),
 'S-BT04': ('수리 추론', '상', '2분', '원가 기준 이익과 정가 기준 할인', '기준 혼동', '판매 가격 → 이익', '원가·이익률형, 새로 설계'),
 'S-BT05': ('최적화', '상', '3분', '층 규칙으로 자리 고정, 남은 경우 비교', '규칙 하나 누락', '丁의 자리부터', '사무실 배정형, 새로 설계(24가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bt.py', 'review/sit-bt.md'), '상황판단 S-BT 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
