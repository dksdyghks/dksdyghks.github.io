# 상황판단 S-BZ01..S-BZ05 — 5급 실전(심화) 수준 정예 문항: 수도 요금(구간 단가·감면·하수도), 네 자리 비밀번호(1만 가지 전수), 자원봉사 시간 인정 규정, 한 해의 요일, 홍보 매체 고르기(63가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, datetime as dt
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bz.js'

# ---------------------------------------------------------------- S-BZ01 수도 요금 (법조문 계산)
HH = {'甲': (15, 18, False), '乙': (20, 35, True), '丙': (15, 45, False), '丁': (20, 25, True)}     # 계량기 구경(mm), 사용량(㎥), 다자녀
BASE = {15: 1000, 20: 2000}
BANDS = [(20, 500), (40, 800), (None, 1200)]                                                       # (구간 상한, 1㎥당 원)
def usage_fee(v, flat=False):
    if flat: return v * next(r for top, r in BANDS if top is None or v <= top)
    fee, low = 0, 0
    for top, r in BANDS:
        hi = v if top is None else min(v, top)
        if hi > low: fee += (hi - low) * r
        low = top if top is not None else low
    return fee
def bill(k, flat=False, sewer_after_cut=False, cut_base=False, sewer=True, cut=True):
    mm, v, many = HH[k]
    u = usage_fee(v, flat); disc = cut and many
    u_paid = u * F(4, 5) if disc else u
    base = BASE[mm] * F(4, 5) if disc and cut_base else BASE[mm]
    sw = (u_paid if sewer_after_cut else u) * F(3, 10) if sewer else 0
    return base + u_paid + sw
check([usage_fee(HH[k][1]) for k in HH] == [9000, 22000, 32000, 14000], 'S-BZ01 usage fees')
each1 = {k: bill(k) for k in HH}
check(each1 == {'甲': 12700, '乙': 26200, '丙': 42600, '丁': 17400}, f'S-BZ01 {each1}')
tot1 = lambda **kw: sum(bill(k, **kw) for k in HH)
alts1 = {'정답': tot1(), '전체 사용량에 한 단가': tot1(flat=True), '하수도를 감면 뒤 요금에': tot1(sewer_after_cut=True), '하수도 누락': tot1(sewer=False), '감면 누락': tot1(cut=False)}
check(alts1 == {'정답': 98900, '전체 사용량에 한 단가': 140700, '하수도를 감면 뒤 요금에': 96740, '하수도 누락': 75800, '감면 누락': 106100}, f'S-BZ01 {alts1}')
check(tot1(cut_base=True) == 98100, 'S-BZ01 basic charge is not reduced (trap value not used as an option)')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BZ01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BZ01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낼 한 달 수도 요금의 합계는?',
 'body': [law('<p><b>제○○조(기본요금)</b> 기본요금은 계량기 구경이 15mm이면 1,000원, 20mm이면 2,000원으로 한다.</p>'
              '<p><b>제○○조(사용 요금)</b> 사용 요금은 한 달 사용량 가운데 20㎥ 이하 부분은 1㎥당 500원, 20㎥를 넘고 40㎥ 이하인 부분은 1㎥당 800원, 40㎥를 넘는 부분은 1㎥당 1,200원으로 계산한다.</p>'
              '<p><b>제○○조(감면)</b> 자녀가 셋 이상인 가구에는 사용 요금의 100분의 20을 감면한다. 기본요금은 감면하지 아니한다.</p>'
              '<p><b>제○○조(하수도 사용료)</b> 하수도 사용료는 제○○조(감면)에 따른 감면을 하기 전의 사용 요금에 100분의 30을 곱한 금액으로 하며, 감면하지 아니한다.</p>'
              '<p><b>제○○조(수도 요금)</b> 수도 요금은 기본요금, 감면 뒤의 사용 요금, 하수도 사용료를 더한 금액으로 한다.</p>'),
          box('상황', ['甲: 계량기 15mm, 한 달 18㎥ 사용, 자녀 1명', '乙: 계량기 20mm, 한 달 35㎥ 사용, 자녀 3명', '丙: 계량기 15mm, 한 달 45㎥ 사용, 자녀 없음', '丁: 계량기 20mm, 한 달 25㎥ 사용, 자녀 4명'], plain=True)],
 'options': [f'{int(v):,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['사용 요금: 甲 18 × 500 = 9,000원, 乙 10,000 + 15 × 800 = 22,000원, 丙 10,000 + 16,000 + 5 × 1,200 = 32,000원, 丁 10,000 + 5 × 800 = 14,000원.',
         '甲: 1,000 + 9,000 + 하수도 2,700 = 12,700원.', '乙: 2,000 + 22,000 × 0.8 = 17,600 + 하수도 22,000 × 0.3 = 6,600 → 26,200원.',
         '丙: 1,000 + 32,000 + 9,600 = 42,600원.', '丁: 2,000 + 14,000 × 0.8 = 11,200 + 하수도 4,200 → 17,400원.']),
  p(f'합계 12,700 + 26,200 + 42,600 + 17,400 = <b>98,900원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 하수도 사용료를 빠뜨리면 75,800원, 감면한 뒤의 요금에 하수도 사용료를 매기면 96,740원, 감면을 빠뜨리면 106,100원, 사용량 전체에 그 사용량이 속한 가장 높은 구간의 단가를 매기면 140,700원이다.')]})

# ---------------------------------------------------------------- S-BZ02 네 자리 비밀번호 (1만 가지 전수)
PW = list(itertools.product(range(10), repeat=4))
no_rep_adj = lambda w: all(w[i] != w[i + 1] for i in range(3))
distinct = lambda w: len(set(w)) == 4
rising = lambda w: all(w[i] < w[i + 1] for i in range(3))
t2 = {'ㄱ': sum(map(no_rep_adj, PW)) == 7290, 'ㄴ': sum(map(distinct, PW)) == 5040, 'ㄷ': sum(distinct(w) and w[0] != 0 for w in PW) == 4320, 'ㄹ': sum(map(rising, PW)) == 120}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and sum(distinct(w) and w[0] != 0 for w in PW) == 4536 and sum(map(rising, PW)) == 210, f'S-BZ02 {t2}')
check(10 * 9 * 9 * 9 == sum(map(no_rep_adj, PW)) and 9 * 9 * 8 * 7 == 4536, 'S-BZ02 explanation products')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BZ02')
items.append({
 'id': 'S-BZ02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('0부터 9까지의 숫자로 네 자리 비밀번호를 만든다. 첫 자리에도 0을 쓸 수 있고, 따로 정하지 않으면 같은 숫자를 여러 번 써도 된다. 숫자가 같아도 놓인 자리가 다르면 다른 비밀번호로 센다.'),
          box('보기', ['ㄱ. 같은 숫자가 바로 이웃한 자리에 오지 않는 비밀번호는 7,290가지이다.', 'ㄴ. 네 자리 숫자가 모두 다른 비밀번호는 5,040가지이다.',
                      'ㄷ. 네 자리 숫자가 모두 다르고 첫 자리가 0이 아닌 비밀번호는 4,320가지이다.', 'ㄹ. 왼쪽에서 오른쪽으로 갈수록 숫자가 커지는 비밀번호는 120가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 첫 자리 10가지, 이후 자리마다 바로 앞 숫자만 빼고 9가지 → 10 × 9 × 9 × 9 = 7,290.', 'ㄴ: 10 × 9 × 8 × 7 = 5,040.', 'ㄷ: 첫 자리 9가지(0 제외), 이후 9 × 8 × 7 → 4,536가지.',
         'ㄹ: 서로 다른 숫자 넷을 고르면 커지는 순서는 하나뿐이므로 10개에서 4개를 고르는 수 210가지.']),
  bx([('ㄱ', '7,290가지', True, O, '10 × 9³.'), ('ㄴ', '5,040가지', True, O, '10 × 9 × 8 × 7.'), ('ㄷ', '4,320가지', False, XX, '9 × 9 × 8 × 7 = 4,536.'), ('ㄹ', '120가지', False, XX, '고르는 수 210가지.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 1만 가지를 모두 나열해 확인하였다. <b>함정</b> 커지는 순서로 늘어놓는 경우는 순서를 따지지 않고 ‘고르는’ 수이다.')]})

# ---------------------------------------------------------------- S-BZ03 자원봉사 시간 인정 (법조문 적용, 옳은 것)
DAY_CAP, TRAVEL_CAP, EDU_CAP = 8, 1, 4
def credited(act, travel=0, other_region=False, edu_year=0):
    return min(act, DAY_CAP) + (min(travel, TRAVEL_CAP) if other_region else 0)
edu_credit = lambda h: min(h, EDU_CAP)
f3 = [credited(10) == 10, credited(5, travel=1, other_region=False) == 6, edu_credit(6) == 6, credited(5, travel=2, other_region=True) == 7, credited(6, travel=2, other_region=True) == 7]
one_true(f3, 4, 'S-BZ03')
check(credited(10) == 8 and credited(5, 2, True) == 6 and edu_credit(6) == 4, 'S-BZ03 values in explanation')
items.append({
 'id': 'S-BZ03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(활동 시간의 인정)</b> ① 자원봉사 활동 시간은 활동 기관의 장이 확인한 실제 활동 시간으로 인정한다.<br>② 하루에 인정하는 활동 시간은 8시간을 넘지 못한다.</p>'
              '<p><b>제○○조(이동 시간)</b> 활동 장소까지 오가는 데 걸린 시간은 활동 시간으로 인정하지 아니한다. 다만 활동 장소가 거주지와 다른 시·도에 있는 경우에는 1회 활동에 1시간까지 활동 시간에 더하여 인정한다.</p>'
              '<p><b>제○○조(사전 교육)</b> 활동을 위하여 받은 사전 교육 시간은 1년에 4시간까지 활동 시간으로 인정한다.</p>')],
 'options': ['하루에 10시간 활동한 사람은 10시간을 인정받는다.', '거주지와 같은 시·도에서 5시간 활동하고 오가는 데 1시간이 걸린 사람은 6시간을 인정받는다.', '한 해에 사전 교육을 6시간 받은 사람은 그 6시간을 모두 활동 시간으로 인정받는다.',
             '거주지와 다른 시·도에서 5시간 활동하고 오가는 데 2시간이 걸린 사람은 7시간을 인정받는다.', '거주지와 다른 시·도에서 6시간 활동하고 오가는 데 2시간이 걸린 사람은 7시간을 인정받는다.'],
 'answer': 4,
 'explain': [
  ox([(False, XX, '하루 8시간을 넘지 못한다.'), (False, XX, '같은 시·도라면 이동 시간은 인정하지 않으므로 5시간이다.'), (False, XX, '1년에 4시간까지만 인정한다.'),
      (False, XX, '이동 시간은 1시간까지만 더하므로 5 + 1 = 6시간이다.'), (True, O, '6 + 1 = 7시간이다.')]),
  p('따라서 정답은 <b>⑤</b>이다. <b>함정</b> 단서(다른 시·도)의 요건과 한도(1시간), 하루·1년 상한을 각각 확인한다.')]})

# ---------------------------------------------------------------- S-BZ04 한 해의 요일 (보기)
WD = '월화수목금토일'
Y0 = dt.date(2026, 1, 1)
check(WD[Y0.weekday()] == '목' and (dt.date(2027, 1, 1) - Y0).days == 365, 'S-BZ04 premises: 1 Jan 2026 is Thursday, 365 days')
days26 = [Y0 + dt.timedelta(k) for k in range(365)]
t4 = {'ㄱ': WD[dt.date(2026, 12, 31).weekday()] == '목', 'ㄴ': sum(WD[d.weekday()] == '목' for d in days26) == 52, 'ㄷ': WD[dt.date(2027, 1, 1).weekday()] == '금', 'ㄹ': WD[dt.date(2026, 3, 1).weekday()] == '토'}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False} and sum(WD[d.weekday()] == '목' for d in days26) == 53 and WD[dt.date(2026, 3, 1).weekday()] == '일', f'S-BZ04 {t4}')
check((31 + 28) % 7 == 3 and 365 % 7 == 1, 'S-BZ04 explanation remainders')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BZ04')
items.append({
 'id': 'S-BZ04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('2026년 1월 1일은 목요일이다. 2026년은 윤년이 아니어서 2월은 28일까지 있고, 한 해는 365일이다.'),
          box('보기', ['ㄱ. 2026년 12월 31일은 목요일이다.', 'ㄴ. 2026년 한 해 동안 목요일은 52번 있다.', 'ㄷ. 2027년 1월 1일은 금요일이다.', 'ㄹ. 2026년 3월 1일은 토요일이다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['365 = 7 × 52 + 1이므로 52주가 지나고 하루가 남는다. 1월 1일부터 52주(364일) 뒤인 12월 31일은 1월 1일과 같은 목요일이고(ㄱ), 목요일은 52 + 1 = 53번 있다(ㄴ).', 'ㄷ: 12월 31일(목)의 다음 날이므로 금요일.',
         'ㄹ: 3월 1일은 1월 1일부터 31 + 28 = 59일 뒤이고, 59 = 7 × 8 + 3이므로 목요일에서 사흘 뒤인 일요일이다.']),
  bx([('ㄱ', '12월 31일 목요일', True, O, '364일 뒤.'), ('ㄴ', '목요일 52번', False, XX, '53번.'), ('ㄷ', '2027년 1월 1일 금요일', True, O, '365일 뒤.'), ('ㄹ', '3월 1일 토요일', False, XX, '일요일.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> ‘며칠 뒤’를 셀 때 시작한 날을 넣지 않는다. 1월 1일에서 59일 뒤가 3월 1일이다.')]})

# ---------------------------------------------------------------- S-BZ05 홍보 매체 고르기 (63가지 전수, 규칙 모두 필요)
MD = {'A': (12, 20, '신문'), 'B': (20, 25, '신문'), 'C': (20, 60, '라디오'), 'D': (24, 45, '라디오'), 'E': (30, 30, '온라인'), 'F': (40, 25, '온라인')}   # 비용(백만 원), 도달(만 명), 종류
RULES = [lambda s: sum(MD[x][1] for x in s) >= 100, lambda s: not ({MD[x][2] for x in s} >= {'신문', '라디오'}), lambda s: len(s) >= 3]
def plans5(on=(1, 1, 1)):
    return sorted((sum(MD[x][0] for x in s), s) for n in range(1, 7) for s in itertools.combinations(MD, n) if all(r(s) for r, o in zip(RULES, on) if o))
PL = plans5(); b5 = PL[0][0]
check(b5 == 74 and [s for v, s in PL if v == b5] == [('C', 'D', 'E')], f'S-BZ05 {PL[:3]}')
alts5 = [plans5(tuple(0 if j == i else 1 for j in range(3))) for i in range(3)]
for i, al in enumerate(alts5): check(al[0][0] < b5 and [v for v, s in al].count(al[0][0]) == 1, f'S-BZ05 rule {i} changes the answer {al[:2]}')
check([al[0] for al in alts5] == [(62, ('A', 'B', 'E')), (52, ('A', 'B', 'C')), (44, ('C', 'D'))], f'S-BZ05 traps {[al[0] for al in alts5]}')
sec5 = sorted({v for v, s in PL})[1]; check(sec5 == 84, f'S-BZ05 second {sec5}')
opts5v = sorted([b5, sec5] + [al[0][0] for al in alts5]); check(len(set(opts5v)) == 5, f'S-BZ05 {opts5v}')
ans5 = opts5v.index(b5)
check(min(v for v, s in PL if any(MD[x][2] == '신문' for x in s)) == 102, 'S-BZ05 explanation: newspaper plans cost 102')
items.append({
 'id': 'S-BZ05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲 기관이 쓸 홍보 비용의 최솟값은?',
 'body': [p('甲 기관은 새 정책을 알리려고 홍보 매체 A~F 가운데 몇 개를 골라 쓰려 한다. 매체마다 비용, 도달 인원, 종류는 아래와 같고, 한 사람에게 여러 매체가 닿는 경우는 없다고 본다. 甲은 다음 규칙을 모두 지키면서 비용 합계를 가장 적게 하려 한다.'),
          table(['매체', '비용(백만 원)', '도달 인원(만 명)', '종류'], [[k, str(a), str(b), c] for k, (a, b, c) in MD.items()], caption='매체별 비용·도달 인원·종류', num=False),
          box('규칙', ['도달 인원의 합이 100만 명 이상이어야 한다.', '신문 매체와 라디오 매체를 함께 쓰지 않는다.', '매체는 세 개 이상 쓴다.'], plain=True)],
 'options': [f'{v}백만 원' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['둘째 규칙에 따라 고를 수 있는 것은 ‘신문 + 온라인’ 또는 ‘라디오 + 온라인’ 매체이다.', '신문 + 온라인: A·B·E·F를 모두 써야 도달 100만 명이 되어 비용 102백만 원.',
         '라디오 + 온라인: C·D만으로 105만 명이지만 셋째 규칙 때문에 하나를 더해야 하고, 가장 싼 E(30)를 더하면 74백만 원. C·E·F는 90, D·E·F는 94백만 원.', '따라서 최솟값은 <b>74백만 원</b>(C, D, E)이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 매체 조합 63가지를 모두 따져 확인하였다. <b>함정</b> 첫째 규칙을 빼면 62, 둘째 규칙을 빼면 52, 셋째 규칙을 빼면 44백만 원이 된다.')]})
check(sum(MD[x][0] for x in 'CEF') == 90 and sum(MD[x][0] for x in 'DEF') == 94 and sum(MD[x][1] for x in 'CD') == 105, 'S-BZ05 explanation arithmetic')

REVIEW = {
 'S-BZ01': ('법조문 계산', '상', '2분 30초', '구간별 단가, 감면 범위, 하수도의 기준 금액', '하수도 기준을 감면 뒤 요금으로', '가구별 사용 요금 → 감면 → 하수도', '수도 요금형, 조문 다섯, 새로 설계'),
 'S-BZ02': ('경우의 수', '상', '2분', '이웃 제한, 서로 다름, 첫 자리 제한, 고르기', '순서 있는 수와 고르는 수 혼동', '자리마다 곱하기', '비밀번호형, 새로 설계(1만 가지 전수)'),
 'S-BZ03': ('법조문 적용', '상', '1분 30초', '하루 상한, 이동 시간 단서와 한도, 연간 상한', '단서의 한도 누락', '조문별 대조', '자원봉사 시간형, 조문 셋, 새로 설계'),
 'S-BZ04': ('수리 추론', '상', '2분', '365 = 52주 + 1일, 며칠 뒤의 요일', '시작한 날을 넣어 셈', '7로 나눈 나머지', '요일 계산형, 새로 설계(달력으로 확인)'),
 'S-BZ05': ('최적화', '상', '3분', '도달 하한, 종류 배타, 개수 하한', '규칙 하나 누락', '배타 규칙으로 두 무리로 나누기', '홍보 매체형, 새로 설계(63가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bz.py', 'review/sit-bz.md'), '상황판단 S-BZ 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
