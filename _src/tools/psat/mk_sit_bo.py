# 상황판단 S-BO01..S-BO05 — 5급 실전(심화) 수준 정예 문항: 전기차 충전 요금(심야 할인·점유 수수료·감면 범위), 숫자 카드로 세 자리 수(전수), 공원 거리 공연 규정, 마주 달리는 두 기차, 축제 공연팀 섭외(63가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, math
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bo.js'

# ---------------------------------------------------------------- S-BO01 전기차 충전 요금 (법조문 계산)
USERS = {'甲': ('급속', 40, None, 35, False), '乙': ('완속', 50, 23.5, 0, False), '丙': ('급속', 30, None, 8, True), '丁': ('완속', 20, 22.5, 0, False)}   # 충전기, kWh, 시작 시각(완속), 충전 끝난 뒤 세워 둔 분, 장애인 차량
RATE = {'급속': 320, '완속': 200}
def charge(k, ceil_=True, from_end=False, night_rule=True, disabled=True):
    kind, kwh, start, stay, dis = USERS[k]
    energy = F(RATE[kind] * kwh)
    night = start is not None and (start >= 23 or start < 7)
    if kind == '완속' and (night or (not night_rule and start is not None and start >= 22)): energy *= F(7, 10)
    if disabled and dis: energy /= 2
    occ = 0
    if kind == '급속':
        over = stay if from_end else max(0, stay - 10)
        occ = 1000 * (-(-over // 10) if ceil_ else over // 10)
    return energy + occ
each1 = {k: charge(k) for k in USERS}
check(each1 == {'甲': 15800, '乙': 7000, '丙': 4800, '丁': 4000}, f'S-BO01 {each1}')
tot1 = lambda **kw: int(sum(charge(k, **kw) for k in USERS))
alts1 = {'정답': tot1(), '10분 미만 버림': tot1(ceil_=False), '끝난 때부터 셈': tot1(from_end=True), '오후 10시 반도 할인': tot1(night_rule=False), '감면 누락': tot1(disabled=False)}
check(alts1 == {'정답': 31600, '10분 미만 버림': 30600, '끝난 때부터 셈': 33600, '오후 10시 반도 할인': 30400, '감면 누락': 36400}, f'S-BO01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BO01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BO01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낸 충전 요금의 합계는?',
 'body': [law('<p><b>제○○조(전력량 요금)</b> ① 충전 요금은 충전한 전력량에 따라 급속 충전기는 1kWh당 320원, 완속 충전기는 1kWh당 200원으로 한다.<br>② 완속 충전을 오후 11시부터 다음 날 오전 7시 전까지 시작하면 제1항의 요금에서 100분의 30을 할인한다.</p>'
              '<p><b>제○○조(점유 수수료)</b> 급속 충전기에서 충전이 끝난 뒤 10분을 넘게 차를 세워 두면, 10분을 넘은 시간에 대하여 10분마다 1,000원의 점유 수수료를 받는다. 이 경우 10분 미만의 시간은 10분으로 본다.</p>'
              '<p><b>제○○조(감면)</b> 장애인 차량에는 제○○조(전력량 요금)에 따라 정한 요금의 100분의 50을 감면한다. 점유 수수료는 감면하지 아니한다.</p>'),
          box('상황', ['甲: 급속 충전기로 40kWh 충전, 충전이 끝난 뒤 35분 동안 세워 둠', '乙: 완속 충전기로 오후 11시 30분에 충전을 시작해 50kWh 충전', '丙(장애인 차량): 급속 충전기로 30kWh 충전, 충전이 끝난 뒤 8분 동안 세워 둠', '丁: 완속 충전기로 오후 10시 30분에 충전을 시작해 20kWh 충전'], plain=True)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 40 × 320 = 12,800원 + 점유 수수료(10분을 넘은 25분 → 10분 단위로 올려 3번) 3,000원 = 15,800원.', '乙: 50 × 200 = 10,000원, 오후 11시 이후 시작이라 30% 할인 → 7,000원.',
         '丙: 30 × 320 = 9,600원의 50% 감면 → 4,800원. 8분은 10분을 넘지 않아 점유 수수료가 없다.', '丁: 오후 10시 30분 시작이라 할인 없이 20 × 200 = 4,000원.']),
  p(f'합계 15,800 + 7,000 + 4,800 + 4,000 = <b>31,600원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 10분 미만을 버리면 30,600원, 충전이 끝난 때부터 세면 33,600원, 丁에게도 심야 할인을 주면 30,400원, 장애인 감면을 빼면 36,400원이다.')]})

# ---------------------------------------------------------------- S-BO02 숫자 카드로 세 자리 수 (전수)
NUMS = [100 * a + 10 * b + c for a, b, c in itertools.permutations(range(5), 3) if a != 0]
t2 = {'ㄱ': len(NUMS) == 48, 'ㄴ': sum(n % 2 == 0 for n in NUMS) == 30, 'ㄷ': sum(n % 3 == 0 for n in NUMS) == 20, 'ㄹ': max(NUMS) - min(NUMS) == 320}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and max(NUMS) - min(NUMS) == 330, f'S-BO02 {t2}')
check(4 * 4 * 3 == 48 and 4 * 3 + 2 * 3 * 3 == 30 and 2 * 4 + 2 * 6 == 20, 'S-BO02 explanation counts')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BO02')
items.append({
 'id': 'S-BO02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('0, 1, 2, 3, 4가 하나씩 적힌 카드 다섯 장이 있다. 이 가운데 세 장을 골라 한 줄로 늘어놓아 세 자리 수를 만든다. 맨 앞에는 0이 올 수 없다.'),
          box('보기', ['ㄱ. 만들 수 있는 세 자리 수는 모두 48개이다.', 'ㄴ. 만들 수 있는 짝수는 30개이다.', 'ㄷ. 만들 수 있는 3의 배수는 20개이다.', 'ㄹ. 만들 수 있는 가장 큰 수와 가장 작은 수의 차는 320이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 맨 앞 4가지(0 제외) × 가운데 4가지 × 끝 3가지 = 48개.', 'ㄴ: 끝이 0이면 4 × 3 = 12개, 끝이 2나 4이면 맨 앞 3가지 × 가운데 3가지 = 9개씩 18개 → 30개.',
         'ㄷ: 세 숫자의 합이 3의 배수인 묶음은 0·1·2, 0·2·4, 1·2·3, 2·3·4이다. 0이 든 묶음은 4개씩, 0이 없는 묶음은 6개씩 만들어 4 + 4 + 6 + 6 = 20개.', 'ㄹ: 432 − 102 = 330.']),
  bx([('ㄱ', '48개', True, O, '4 × 4 × 3.'), ('ㄴ', '짝수 30개', True, O, '12 + 18.'), ('ㄷ', '3의 배수 20개', True, O, '4 + 4 + 6 + 6.'), ('ㄹ', '차 320', False, XX, '432 − 102 = 330.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 48개를 모두 나열해 확인하였다.')]})
check(sorted(set(tuple(sorted(map(int, str(n)))) for n in NUMS if n % 3 == 0)) == [(0, 1, 2), (0, 2, 4), (1, 2, 3), (2, 3, 4)], 'S-BO02 explanation digit sets')

# ---------------------------------------------------------------- S-BO03 공원 거리 공연 규정 (법조문 적용, 옳은 것)
def report_ok(days_before): return days_before >= 3
def time_ok(start, hours): return 10 <= start and start + hours <= 21 and hours <= 2
def loud_ok(db, plaza): return db <= (80 if plaza else 75)
fee_allowed = lambda kind: kind == '모금함'
f3 = [loud_ok(78, True), report_ok(2), time_ok(20, 2), fee_allowed('관람료'), loud_ok(78, False)]
one_true(f3, 0, 'S-BO03')
check(time_ok(19, 2) and not time_ok(20, 2), 'S-BO03 time boundary')
items.append({
 'id': 'S-BO03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(신고)</b> 공원에서 거리 공연을 하려는 사람은 공연일 3일 전까지 공원 관리소에 신고하여야 한다.</p>'
              '<p><b>제○○조(시간)</b> 거리 공연은 오전 10시부터 오후 9시까지 할 수 있으며, 한 번에 2시간을 넘을 수 없다.</p>'
              '<p><b>제○○조(소리 크기)</b> 음향 기기를 쓰는 공연의 소리 크기는 75데시벨 이하여야 한다. 다만 광장에서 하는 공연은 80데시벨 이하로 한다.</p>'
              '<p><b>제○○조(관람료)</b> 거리 공연을 하는 사람은 관람료를 받을 수 없다. 다만 관람객이 자유롭게 돈을 넣는 모금함은 둘 수 있다.</p>')],
 'options': ['광장에서 음향 기기를 써서 78데시벨로 공연할 수 있다.', '공연일 2일 전에 신고하여도 공연할 수 있다.', '오후 8시부터 2시간 동안 공연할 수 있다.', '관람객에게 3천 원의 관람료를 받을 수 있다.', '광장이 아닌 산책로에서 음향 기기를 써서 78데시벨로 공연할 수 있다.'],
 'answer': 0,
 'explain': [
  ox([(True, O, '광장에서는 80데시벨 이하까지 허용된다.'), (False, XX, '공연일 3일 전까지 신고하여야 한다.'), (False, XX, '오후 9시까지만 할 수 있으므로 오후 8시부터는 1시간만 가능하다.'),
      (False, XX, '관람료는 받을 수 없고 모금함만 둘 수 있다.'), (False, XX, '광장이 아니면 75데시벨 이하여야 한다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> 단서의 적용 장소(광장), 끝나는 시각, 관람료와 모금함의 구별을 확인한다.')]})

# ---------------------------------------------------------------- S-BO04 마주 달리는 두 기차 (수리 추론)
DIST, VA, VB = 300, 120, 80
meet = F(DIST, VA + VB)
t4 = {'ㄱ': meet == F(3, 2), 'ㄴ': VA * meet == 180, 'ㄷ': DIST - VB * F(DIST, VA) == 50, 'ㄹ': F(DIST + VB * F(1, 2), VA + VB) * 60 == 102}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and DIST - VB * F(DIST, VA) == 100, f'S-BO04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ']; ans4 = combo(t4, opts4, 'S-BO04')
items.append({
 'id': 'S-BO04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('300km 떨어진 A역과 B역 사이를 잇는 선로가 있다. 기차 갑은 A역에서 B역 쪽으로 시속 120km로, 기차 을은 B역에서 A역 쪽으로 시속 80km로 달린다. 두 기차는 쉬지 않고 일정한 속력으로 달리며, 따로 말이 없으면 같은 시각에 출발한다.'),
          box('보기', ['ㄱ. 두 기차는 출발하고 1시간 30분 뒤에 만난다.', 'ㄴ. 두 기차가 만나는 곳은 A역에서 180km 떨어져 있다.', 'ㄷ. 갑이 B역에 도착할 때 을은 A역까지 50km를 남겨 두고 있다.', 'ㄹ. 을이 갑보다 30분 늦게 출발한다면, 두 기차는 갑이 출발하고 1시간 42분 뒤에 만난다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 두 기차는 1시간에 120 + 80 = 200km씩 가까워지므로 300 ÷ 200 = 1.5시간.', 'ㄴ: 갑은 1.5시간에 180km를 간다.', 'ㄷ: 갑은 300 ÷ 120 = 2.5시간 뒤 B역에 닿고, 그동안 을은 200km를 가서 A역까지 100km가 남는다.',
         'ㄹ: 을이 출발하기 전 30분 동안 갑이 60km를 가므로 남은 240km를 200km/시로 좁히는 데 1.2시간 → 갑 출발 뒤 1.7시간 = 1시간 42분.']),
  bx([('ㄱ', '1시간 30분', True, O, '300 ÷ 200.'), ('ㄴ', 'A역에서 180km', True, O, '120 × 1.5.'), ('ㄷ', '50km 남음', False, XX, '100km 남는다.'), ('ㄹ', '1시간 42분', True, O, '0.5 + 1.2 = 1.7시간.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 늦게 출발한 경우에는 먼저 출발한 쪽이 혼자 간 거리를 빼고 나머지를 두 속력의 합으로 나눈다.')]})

# ---------------------------------------------------------------- S-BO05 축제 공연팀 섭외 (63가지 전수, 규칙 모두 필요)
SLOT = {'가': '오후 1시', '나': '오후 3시', '다': '오후 5시', '라': '오후 7시'}
TEAM = {'A': ('라', 5, 8), 'B': ('나', 3, 3), 'C': ('라', 5, 7), 'D': ('가', 9, 8), 'E': ('나', 4, 6), 'F': ('다', 8, 7)}   # 시간대, 출연료(백만 원), 예상 관객(천 명)
BUD = 20
def books(r=(1, 1, 1)):
    res = []
    for k in range(1, 7):
        for s in itertools.combinations(TEAM, k):
            if r[0] and len({TEAM[x][0] for x in s}) < k: continue
            if r[1] and 'E' in s and 'F' not in s: continue
            if r[2] and sum(TEAM[x][1] for x in s) > BUD: continue
            res.append((sum(TEAM[x][2] for x in s), s))
    m = max(v for v, _ in res); return m, [s for v, s in res if v == m], sorted(res, reverse=True)
b5, a5, all5 = books()
check(b5 == 21 and a5 == [('A', 'E', 'F')], f'S-BO05 {b5} {a5}')
alts5 = [books(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check(alts5 == [24, 22, 29], f'S-BO05 every rule changes the answer {alts5}')
second = sorted({v for v, _ in all5}, reverse=True)[1]
noE = max(v for v, s in all5 if 'E' not in s)
check(second == 20 and noE == 19 and [s for v, s in all5 if v == 20] == [('C', 'E', 'F')], f'S-BO05 {second} {noE}')
opts5v = [second, b5, alts5[1], alts5[0], alts5[2]]; check(opts5v == sorted(opts5v) and len(set(opts5v)) == 5, f'S-BO05 {opts5v}')
ans5 = opts5v.index(b5)
man = lambda th: f'{th // 10}만' + (f' {th % 10}천' if th % 10 else '') + ' 명'      # 천 명 단위 → ‘2만 1천 명’
check([man(v) for v in opts5v] == ['2만 명', '2만 1천 명', '2만 2천 명', '2만 4천 명', '2만 9천 명'], 'S-BO05 option labels')
items.append({
 'id': 'S-BO05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 갑시가 섭외한 공연팀으로 모을 수 있는 예상 관객의 최댓값은?',
 'body': [p('갑시는 하루짜리 축제에 공연팀 A~F 가운데 몇 팀을 섭외하려 한다. 팀마다 공연 시간대, 출연료, 예상 관객은 아래와 같고, 여러 팀의 관객은 단순히 더한다. 출연료 예산은 2천만 원이며, 다음 규칙을 모두 지켜야 한다.'),
          table(['팀', '시간대', '출연료(백만 원)', '예상 관객(천 명)'], [[k, SLOT[t], str(c), str(a)] for k, (t, c, a) in TEAM.items()], caption='공연팀별 시간대·출연료·예상 관객', num=False),
          box('규칙', ['같은 시간대에는 한 팀만 공연할 수 있다.', 'E는 F의 음향 장비를 함께 써야 하므로, E를 섭외하면 F도 섭외해야 한다.', '출연료의 합은 예산을 넘을 수 없다.'], plain=True)],
 'options': [man(v) for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['E를 섭외하면 F도 섭외해야 해 출연료 1,200만 원, 관객 1만 3천 명이고, 남은 800만 원으로 오후 3시(E)·오후 5시(F)가 아닌 시간대의 팀 하나를 더한다. A(오후 7시, 500만 원)를 더하면 2만 1천 명, C를 더하면 2만 명이며 D(900만 원)는 예산을 넘는다.',
         'E를 섭외하지 않으면 시간대마다 한 팀씩 A·B·D(1,700만 원)로 1만 9천 명이 최대이다(F를 더하면 예산을 넘는다).', '따라서 최댓값은 <b>2만 1천 명</b>(A, E, F)이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 섭외 조합 63가지를 모두 따져 확인하였다. <b>함정</b> 시간대 규칙을 빼면 2만 4천 명, E·F 규칙을 빼면 2만 2천 명, 예산을 빼면 2만 9천 명이 된다.')]})
check(max(v for v, s in all5 if 'E' not in s) == 19 and ('A', 'B', 'D') in [s for v, s in all5 if v == 19], 'S-BO05 explanation without E')

REVIEW = {
 'S-BO01': ('법조문 계산', '상', '2분 30초', '충전기별 요금, 심야 할인 시작 시각, 점유 수수료 올림, 감면 대상', '시각·올림·감면 범위 착오', '사람별 전력량 → 할인 → 감면 → 수수료', '전기차 충전형, 조문 셋, 새로 설계'),
 'S-BO02': ('경우의 수', '상', '2분', '맨 앞 0 제외, 짝수, 3의 배수 묶음', '0의 위치 착오', '자리별 경우의 수', '숫자 카드형, 새로 설계(전수)'),
 'S-BO03': ('법조문 적용', '상', '1분 30초', '신고 기한, 끝나는 시각, 단서의 장소, 관람료와 모금함', '단서 범위 착오', '조문별 대조', '거리 공연형, 조문 넷, 새로 설계'),
 'S-BO04': ('수리 추론', '상', '2분', '속력의 합, 늦은 출발', '먼저 간 거리 누락', '가까워지는 속력', '두 기차형, 새로 설계'),
 'S-BO05': ('최적화', '상', '3분', '시간대 배타, 동반 규칙, 예산', '규칙 하나 누락', 'E를 섭외할 때와 안 할 때', '공연팀 섭외형, 새로 설계(63가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bo.py', 'review/sit-bo.md'), '상황판단 S-BO 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
