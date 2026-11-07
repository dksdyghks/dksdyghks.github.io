# 상황판단 S-CC01..S-CC05 — 5급 실전(심화) 수준 정예 문항: 속도위반 과태료(구간·보호구역·자진 납부), 주사위 두 개(36가지 전수), 택배 분실·훼손 배상 규정, 마주 걷기와 따라잡기, 연수 강좌 고르기(63가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-cc.js'

# ---------------------------------------------------------------- S-CC01 속도위반 과태료 (법조문 계산)
CS = {'甲': (60, 75, False, True), '乙': (30, 55, True, False), '丙': (100, 145, False, True), '丁': (80, 120, False, False)}   # 제한 속도, 주행 속도, 어린이 보호구역, 자진 납부
def base_fine(over, at_least_40=False):
    if over <= 20: return 40000
    if over < 40 or (over == 40 and not at_least_40): return 70000
    return 100000
def fine(k, school=True, cut=True, edge=False, double_speed=False):
    lim, sp, zone, early = CS[k]
    over = sp - lim
    if zone and school and double_speed: amt = base_fine(over * 2, edge)
    else: amt = base_fine(over, edge) * (2 if zone and school else 1)
    return amt * F(4, 5) if cut and early else amt
check([CS[k][1] - CS[k][0] for k in CS] == [15, 25, 45, 40], 'S-CC01 excess speeds')
each1 = {k: fine(k) for k in CS}
check(each1 == {'甲': 32000, '乙': 140000, '丙': 80000, '丁': 70000}, f'S-CC01 {each1}')
tot1 = lambda **kw: sum(fine(k, **kw) for k in CS)
alts1 = {'정답': tot1(), '보호구역 가중 누락': tot1(school=False), '초과 속도를 두 배로 봄': tot1(double_speed=True), '자진 납부 감경 누락': tot1(cut=False), '40km/h를 넘는 구간으로 봄': tot1(edge=True)}
check(alts1 == {'정답': 322000, '보호구역 가중 누락': 252000, '초과 속도를 두 배로 봄': 282000, '자진 납부 감경 누락': 350000, '40km/h를 넘는 구간으로 봄': 352000}, f'S-CC01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-CC01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-CC01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낼 과태료의 합계는?',
 'body': [law('<p><b>제○○조(속도위반 과태료)</b> 제한 속도를 넘어 운전한 사람에게는 넘은 속도에 따라 다음 과태료를 부과한다.<br>1. 20km/h 이하: 40,000원<br>2. 20km/h 초과 40km/h 이하: 70,000원<br>3. 40km/h 초과: 100,000원</p>'
              '<p><b>제○○조(어린이 보호구역)</b> 어린이 보호구역에서 위반한 경우에는 제○○조(속도위반 과태료)에 따른 금액의 2배를 부과한다.</p>'
              '<p><b>제○○조(자진 납부)</b> 의견 제출 기한 안에 과태료를 스스로 낸 사람에게는 부과할 금액의 100분의 20을 줄여 준다.</p>'),
          box('상황', ['甲: 제한 속도 60km/h인 도로에서 75km/h로 운전, 기한 안에 자진 납부', '乙: 제한 속도 30km/h인 어린이 보호구역에서 55km/h로 운전, 자진 납부하지 않음',
                      '丙: 제한 속도 100km/h인 도로에서 145km/h로 운전, 기한 안에 자진 납부', '丁: 제한 속도 80km/h인 도로에서 120km/h로 운전, 자진 납부하지 않음'], plain=True)],
 'options': [f'{int(v):,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 15km/h 초과 → 40,000원, 20% 감경 → 32,000원.', '乙: 25km/h 초과 → 70,000원, 보호구역 2배 → 140,000원.', '丙: 45km/h 초과 → 100,000원, 20% 감경 → 80,000원.', '丁: 정확히 40km/h를 넘었으므로 ‘20km/h 초과 40km/h 이하’ 구간 → 70,000원.']),
  p(f'합계 32,000 + 140,000 + 80,000 + 70,000 = <b>322,000원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 보호구역 2배를 빠뜨리면 252,000원, 넘은 속도를 두 배로 보면 282,000원, 자진 납부 감경을 빠뜨리면 350,000원, 丁을 40km/h 초과 구간으로 보면 352,000원이다.')]})

# ---------------------------------------------------------------- S-CC02 주사위 두 개 (36가지 전수)
DICE = list(itertools.product(range(1, 7), repeat=2))
t2 = {'ㄱ': sum(a + b == 7 for a, b in DICE) == 6, 'ㄴ': sum((a + b) % 2 == 0 for a, b in DICE) == 18, 'ㄷ': sum(a * b % 2 == 0 for a, b in DICE) == 24, 'ㄹ': sum(abs(a - b) == 2 for a, b in DICE) == 10}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and sum(a * b % 2 == 0 for a, b in DICE) == 27 and sum(abs(a - b) == 2 for a, b in DICE) == 8, f'S-CC02 {t2}')
check(36 - 3 * 3 == 27 and 2 * 4 == 8, 'S-CC02 explanation: odd × odd = 9 cases; differences of 2 come in 4 pairs, each in two orders')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-CC02')
items.append({
 'id': 'S-CC02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('1부터 6까지의 눈이 하나씩 적힌 주사위 두 개를 하나는 빨간색, 하나는 파란색으로 칠하여 함께 던진다. 두 주사위에 나온 눈을 (빨간 주사위의 눈, 파란 주사위의 눈)으로 적으면, 나올 수 있는 결과는 (1, 1)부터 (6, 6)까지 모두 36가지이다.'),
          box('보기', ['ㄱ. 두 눈의 합이 7인 결과는 6가지이다.', 'ㄴ. 두 눈의 합이 짝수인 결과는 18가지이다.', 'ㄷ. 두 눈의 곱이 짝수인 결과는 24가지이다.', 'ㄹ. 두 눈의 차가 2인 결과는 10가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: (1, 6), (2, 5), (3, 4), (4, 3), (5, 2), (6, 1)의 6가지.', 'ㄴ: 두 눈이 모두 홀수(3 × 3 = 9가지)이거나 모두 짝수(9가지)이면 합이 짝수 → 18가지.',
         'ㄷ: 곱이 홀수인 것은 두 눈이 모두 홀수인 9가지뿐이므로 곱이 짝수인 것은 36 − 9 = 27가지.', 'ㄹ: 차가 2인 두 수는 (1, 3), (2, 4), (3, 5), (4, 6)의 네 쌍이고, 빨간·파란 순서가 둘씩 → 8가지.']),
  bx([('ㄱ', '합 7은 6가지', True, O, '여섯 쌍.'), ('ㄴ', '합 짝수 18가지', True, O, '홀홀 9 + 짝짝 9.'), ('ㄷ', '곱 짝수 24가지', False, XX, '27가지이다.'), ('ㄹ', '차 2는 10가지', False, XX, '8가지이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 36가지를 모두 나열해 확인하였다. <b>함정</b> 두 주사위를 구별하므로 (1, 3)과 (3, 1)은 다른 결과이다.')]})

# ---------------------------------------------------------------- S-CC03 택배 분실·훼손 배상 (법조문 적용, 옳은 것)
CAP_NODECL = 500000
def pay_lost(loss, declared=None, valuables=False):
    if valuables and declared is None: return 0
    return declared if declared is not None else min(loss, CAP_NODECL)
damage_claim_ok = lambda days_after_receipt: days_after_receipt <= 14
lost_claim_years = 1
f3 = [pay_lost(800000) == 800000, pay_lost(1000000, declared=1000000) == 1000000, damage_claim_ok(20), pay_lost(300000, valuables=True) > 0, lost_claim_years * 365 <= 14]
one_true(f3, 1, 'S-CC03')
check(pay_lost(800000) == 500000 and pay_lost(300000) == 300000 and damage_claim_ok(14) and not damage_claim_ok(15), 'S-CC03 values and boundaries')
items.append({
 'id': 'S-CC03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(분실 배상)</b> ① 택배 사업자는 운송 중 물품을 잃어버린 경우 고객이 맡길 때 신고한 가액을 배상한다.<br>② 고객이 가액을 신고하지 아니한 경우에는 실제 손해를 배상하되, 50만 원을 한도로 한다.</p>'
              '<p><b>제○○조(귀중품)</b> 현금이나 유가증권은 고객이 맡길 때 그 종류와 가액을 신고하지 아니하면 잃어버리거나 훼손되어도 배상하지 아니한다.</p>'
              '<p><b>제○○조(청구 기한)</b> ① 물품이 훼손된 경우 고객은 물품을 받은 날부터 14일 이내에 그 사실을 사업자에게 알려야 하며, 이 기간이 지나면 배상을 청구할 수 없다.<br>② 물품을 잃어버린 경우의 배상 청구는 물품을 넘겨주기로 한 날부터 1년 안에 하여야 한다.</p>')],
 'options': ['가액을 신고하지 않고 맡긴 물품을 잃어버려 80만 원의 손해가 났다면 80만 원을 배상받는다.', '가액을 100만 원으로 신고하고 맡긴 물품을 잃어버렸다면 100만 원을 배상받는다.',
             '물품을 받은 날부터 20일 뒤에 훼손 사실을 알려도 배상을 청구할 수 있다.', '종류와 가액을 신고하지 않고 맡긴 현금 30만 원을 잃어버렸다면 30만 원을 배상받는다.', '물품을 잃어버린 경우 넘겨주기로 한 날부터 14일이 지나면 배상을 청구할 수 없다.'],
 'answer': 1,
 'explain': [
  ox([(False, XX, '가액을 신고하지 않았으면 50만 원이 한도이다.'), (True, O, '신고한 가액을 배상한다.'), (False, XX, '훼손 통지는 받은 날부터 14일 이내이다.'), (False, XX, '신고하지 않은 현금은 배상하지 않는다.'), (False, XX, '분실 배상 청구 기한은 1년이다.')]),
  p('따라서 정답은 <b>②</b>이다. <b>함정</b> 훼손(14일)과 분실(1년)의 기한, 신고 여부에 따른 배상액과 한도를 구별한다.')]})

# ---------------------------------------------------------------- S-CC04 마주 걷기와 따라잡기 (보기)
VA, VB, DIST = 4, 6, 10                      # km/h, km/h, km
meet_t = F(DIST, VA + VB)
catch_t = F(2, VB - VA)
late = F(1, 2); meet_late = late + F(DIST - VA * late, VA + VB)            # B가 30분 늦게 출발할 때 A가 출발하고 만나기까지
t4 = {'ㄱ': meet_t == F(7, 6), 'ㄴ': VA * meet_t == 4, 'ㄷ': catch_t == 1, 'ㄹ': meet_late == F(78, 60)}
check(t4 == {'ㄱ': False, 'ㄴ': True, 'ㄷ': True, 'ㄹ': True} and meet_t == 1 and meet_late * 60 == 78, f'S-CC04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-CC04')
items.append({
 'id': 'S-CC04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('갑은 시속 4km, 을은 시속 6km로 쉬지 않고 같은 빠르기로 걷는다. 두 사람이 걷는 길은 곧은 한 길이며, 따로 말하지 않으면 두 사람은 동시에 출발한다.'),
          box('보기', ['ㄱ. 10km 떨어진 두 곳에서 서로를 향해 걸으면 1시간 10분 뒤에 만난다.', 'ㄴ. 10km 떨어진 두 곳에서 서로를 향해 걸으면 갑의 출발점에서 4km 떨어진 곳에서 만난다.',
                      'ㄷ. 을이 갑보다 2km 뒤에서 갑과 같은 방향으로 걸으면 1시간 뒤에 갑을 따라잡는다.', 'ㄹ. 10km 떨어진 두 곳에서 서로를 향해 걷되 을이 갑보다 30분 늦게 출발하면, 두 사람은 갑이 출발하고 1시간 18분 뒤에 만난다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ·ㄴ: 두 사람 사이는 1시간에 4 + 6 = 10km씩 줄므로 1시간 뒤에 만나고, 그동안 갑은 4km를 걷는다.', 'ㄷ: 같은 방향이면 사이가 1시간에 6 − 4 = 2km씩 줄어 2km를 1시간에 따라잡는다.',
         'ㄹ: 갑이 먼저 30분 동안 2km를 걸어 남은 거리는 8km, 이를 10km/h로 좁히는 데 48분 → 30분 + 48분 = 1시간 18분.']),
  bx([('ㄱ', '1시간 10분', False, XX, '1시간이다.'), ('ㄴ', '갑 출발점에서 4km', True, O, '4 × 1.'), ('ㄷ', '1시간 뒤 따라잡음', True, O, '2 ÷ 2.'), ('ㄹ', '1시간 18분', True, O, '30분 + 48분.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 마주 걸으면 속력을 더하고, 같은 방향이면 뺀다.')]})

# ---------------------------------------------------------------- S-CC05 연수 강좌 고르기 (63가지 전수, 규칙 모두 필요)
CO = {'A': (30, 4), 'B': (30, 6), 'C': (20, 3), 'D': (12, 4), 'E': (10, 2), 'F': (24, 3)}     # 수강료(만 원), 시간
RULES = [lambda s: sum(CO[x][1] for x in s) >= 12, lambda s: not ('B' in s and 'D' in s), lambda s: len(s) <= 3]
def plans5(on=(1, 1, 1)):
    return sorted((sum(CO[x][0] for x in s), s) for n in range(1, 7) for s in itertools.combinations(CO, n) if all(r(s) for r, o in zip(RULES, on) if o))
PL = plans5(); b5 = PL[0][0]
check(b5 == 70 and [s for v, s in PL if v == b5] == [('A', 'B', 'E')], f'S-CC05 {PL[:3]}')
alts5 = [plans5(tuple(0 if j == i else 1 for j in range(3))) for i in range(3)]
for i, al in enumerate(alts5): check(al[0][0] < b5 and [v for v, s in al].count(al[0][0]) == 1, f'S-CC05 rule {i} changes the answer {al[:2]}')
check([al[0] for al in alts5] == [(10, ('E',)), (52, ('B', 'D', 'E')), (66, ('C', 'D', 'E', 'F'))], f'S-CC05 traps {[al[0] for al in alts5]}')
sec5 = sorted({v for v, s in PL})[1]; check(sec5 == 74 and [s for v, s in PL if v == sec5] == [('B', 'C', 'F')], f'S-CC05 second {sec5}')
opts5v = sorted([b5, sec5] + [al[0][0] for al in alts5]); check(len(set(opts5v)) == 5, f'S-CC05 {opts5v}')
ans5 = opts5v.index(b5)
check(all('B' in s for v, s in PL) and max(sum(CO[x][1] for x in s) for s in itertools.combinations('ACDEF', 3)) == 11, 'S-CC05 explanation: B is always needed (without B at most 11 hours)')
items.append({
 'id': 'S-CC05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 낼 수강료 합계의 최솟값은?',
 'body': [p('甲은 연수 강좌 A~F 가운데 몇 개를 골라 들으려 한다. 강좌마다 수강료와 교육 시간은 아래와 같고, 같은 강좌는 한 번만 들을 수 있다. 甲은 다음 규칙을 모두 지키면서 수강료 합계를 가장 적게 하려 한다.'),
          table(['강좌', '수강료(만 원)', '교육 시간(시간)'], [[k, str(a), str(b)] for k, (a, b) in CO.items()], caption='강좌별 수강료와 교육 시간', num=False),
          box('규칙', ['교육 시간의 합이 12시간 이상이어야 한다.', 'B와 D는 함께 듣지 않는다.', '강좌는 세 개까지만 듣는다.'], plain=True)],
 'options': [f'{v}만 원' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['세 강좌로 12시간을 채워야 한다. B(6시간)를 빼면 가장 긴 A·D·C(또는 F)도 4 + 4 + 3 = 11시간이므로 B는 반드시 듣는다.', 'B를 들으면 D는 들을 수 없으므로, 남은 두 강좌로 6시간 이상을 채운다: A + E(6시간, 40만 원), C + F(6시간, 44만 원), A + C(50만 원), A + F(54만 원).',
         '가장 싼 것은 B + A + E = 30 + 30 + 10 = <b>70만 원</b>이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 강좌 조합 63가지를 모두 따져 확인하였다. <b>함정</b> 첫째 규칙을 빼면 10만 원, 둘째 규칙을 빼면 52만 원(B·D·E), 셋째 규칙을 빼면 66만 원(C·D·E·F)이 된다.')]})
check(sum(CO[x][0] for x in 'AE') == 40 and sum(CO[x][0] for x in 'CF') == 44 and sum(CO[x][0] for x in 'AC') == 50 and sum(CO[x][0] for x in 'AF') == 54, 'S-CC05 explanation arithmetic')

REVIEW = {
 'S-CC01': ('법조문 계산', '상', '2분 30초', '초과 속도 구간, 보호구역 가중, 자진 납부 감경', '‘이하’ 경계, 가중 대상 착오', '사람별 구간 → 가중 → 감경', '속도위반 과태료형, 조문 셋, 새로 설계'),
 'S-CC02': ('경우의 수', '상', '2분', '합·곱의 홀짝, 여사건, 순서 있는 쌍', '순서 다른 쌍 누락', '여사건으로 세기', '주사위형, 새로 설계(36가지 전수)'),
 'S-CC03': ('법조문 적용', '상', '1분 30초', '신고 가액과 한도, 귀중품, 훼손·분실 기한', '기한 혼동', '조문별 대조', '택배 배상형, 조문 셋, 새로 설계'),
 'S-CC04': ('수리 추론', '상', '2분', '마주 걷기·따라잡기, 늦은 출발', '속력의 합과 차 혼동', '사이가 줄어드는 속력', '걷기 문제형, 새로 설계(분수로 확인)'),
 'S-CC05': ('최적화', '상', '3분', '시간 하한, 동시 수강 금지, 개수 상한', '규칙 하나 누락', '반드시 들어갈 강좌부터', '연수 강좌형, 새로 설계(63가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_cc.py', 'review/sit-cc.md'), '상황판단 S-CC 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
