# 상황판단 S-BV01..S-BV05 — 5급 실전(심화) 수준 정예 문항: 공연 예매 취소 수수료(구간·예매 당일 특례·당일 취소), 두 팀 나누기(전수), 자전거 통행 규정, 나이 문제, 출퇴근 교통수단 고르기(규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bv.js'

# ---------------------------------------------------------------- S-BV01 공연 예매 취소 수수료 (법조문 계산)
TK = {'甲': (80000, 8, False), '乙': (60000, 5, True), '丙': (100000, 2, False), '丁': (50000, 0, False)}   # 표값(원), 공연일 며칠 전 취소(0 = 당일), 예매한 날 취소
def fee_rate(days, bought_today, same_day_rule=True, day0_as_30=False, rate_override=None):
    if days == 0: return F(30, 100) if day0_as_30 else F(1)
    if bought_today and same_day_rule and days >= 2: return F(0)
    if rate_override is not None: return rate_override
    if days >= 10: return F(0)
    if days >= 7: return F(10, 100)
    if days >= 3: return F(20, 100)
    return F(30, 100)
def refund(k, **kw):
    price, days, today = TK[k]
    return price * (1 - fee_rate(days, today, **kw))
each1 = {k: refund(k) for k in TK}
check(each1 == {'甲': 72000, '乙': 60000, '丙': 70000, '丁': 0}, f'S-BV01 {each1}')
tot1 = lambda **kw: sum(refund(k, **kw) for k in TK)
TRAP = {'정답': {}, '예매 당일 특례 무시': {'same_day_rule': False}, '당일 취소에도 70% 환불': {'day0_as_30': True}}
alts1 = {n: tot1(**kw) for n, kw in TRAP.items()}
alts1['甲 구간 착오(20%)'] = alts1['정답'] - 80000 * F(10, 100)
alts1['丙 구간 착오(20%)'] = alts1['정답'] + 100000 * F(10, 100)
check(alts1 == {'정답': 202000, '예매 당일 특례 무시': 190000, '당일 취소에도 70% 환불': 237000, '甲 구간 착오(20%)': 194000, '丙 구간 착오(20%)': 212000}, f'S-BV01 {alts1}')
check(refund('甲', rate_override=F(20, 100)) == 64000 and refund('丙', rate_override=F(20, 100)) == 80000, 'S-BV01 band traps: 20% applied to 甲 or 丙')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BV01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BV01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 돌려받는 금액의 합계는?',
 'body': [law('<p><b>제○○조(취소 수수료)</b> ① 예매한 표를 취소하면 표값에서 다음 각 호의 취소 수수료를 빼고 돌려준다.<br>1. 공연일 10일 전까지: 없음<br>2. 공연일 9일 전부터 7일 전까지: 표값의 100분의 10<br>3. 공연일 6일 전부터 3일 전까지: 표값의 100분의 20<br>4. 공연일 2일 전부터 공연일 전날까지: 표값의 100분의 30<br>② 공연 당일에는 취소할 수 없으며 표값을 돌려주지 아니한다.</p>'
              '<p><b>제○○조(예매 당일 취소)</b> 표를 예매한 날에 취소하면 제○○조(취소 수수료) 제1항에도 불구하고 취소 수수료를 받지 아니한다. 다만 공연일 전날과 공연 당일에 예매하여 취소하는 경우는 그러하지 아니하다.</p>'),
          box('상황', ['甲: 80,000원짜리 표를 공연일 8일 전에 취소', '乙: 60,000원짜리 표를 공연일 5일 전에 예매하고 같은 날 취소', '丙: 100,000원짜리 표를 공연일 2일 전에 취소(예매는 한 달 전)', '丁: 50,000원짜리 표를 공연 당일에 취소하려 함'], plain=True)],
 'options': [f'{int(v):,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 8일 전은 ‘9일 전부터 7일 전까지’ → 10% 수수료 → 72,000원.', '乙: 예매한 날 취소했고 공연일 전날·당일이 아니므로 수수료 없이 60,000원.', '丙: 2일 전 → 30% 수수료 → 70,000원.', '丁: 공연 당일에는 취소할 수 없어 0원.']),
  p(f'합계 72,000 + 60,000 + 70,000 + 0 = <b>202,000원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 예매 당일 특례를 빠뜨리면 190,000원, 甲의 구간을 하루 밀려 20%로 보면 194,000원, 丙을 20%로 보면 212,000원, 당일 취소도 30% 수수료로 돌려준다고 보면 237,000원이다.')]})

# ---------------------------------------------------------------- S-BV02 두 팀 나누기 (전수)
PPL = ['갑', '을', '병', '정', '무', '기']; MEN = {'갑', '을', '병'}
SPLITS = {frozenset([frozenset(t), frozenset(set(PPL) - set(t))]) for t in itertools.combinations(PPL, 3)}
same = lambda sp, a, b: any(a in t and b in t for t in sp)
t2 = {'ㄱ': len(SPLITS) == 10, 'ㄴ': sum(same(sp, '갑', '을') for sp in SPLITS) == 4, 'ㄷ': sum(all(t & MEN and t - MEN for t in sp) for sp in SPLITS) == 8,
      'ㄹ': sum(same(sp, '갑', '을') and not same(sp, '갑', '병') for sp in SPLITS) == 4}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and sum(all(t & MEN and t - MEN for t in sp) for sp in SPLITS) == 9 and sum(same(sp, '갑', '을') and not same(sp, '갑', '병') for sp in SPLITS) == 3, f'S-BV02 {t2}')
check(20 // 2 == 10 and 10 - 1 == 9, 'S-BV02 explanation arithmetic')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BV02')
items.append({
 'id': 'S-BV02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('남학생 갑, 을, 병과 여학생 정, 무, 기 여섯 명을 3명씩 두 팀으로 나눈다. 두 팀에는 이름이 없으므로, 팀을 서로 바꾸어도 같은 방법으로 센다.'),
          box('보기', ['ㄱ. 두 팀으로 나누는 방법은 모두 10가지이다.', 'ㄴ. 갑과 을이 같은 팀이 되는 방법은 4가지이다.', 'ㄷ. 두 팀 모두 남학생과 여학생이 섞이도록 나누는 방법은 8가지이다.', 'ㄹ. 갑과 을은 같은 팀이고 병은 다른 팀이 되는 방법은 4가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 6명에서 3명을 고르는 20가지는 두 팀을 서로 바꾼 것이 두 번씩 세어진 것이므로 10가지.', 'ㄴ: 갑·을과 같은 팀이 될 나머지 한 명을 고르는 4가지.', 'ㄷ: 남학생 셋과 여학생 셋으로 나누는 1가지만 빼면 9가지.', 'ㄹ: 갑·을과 같은 팀이 될 한 명을 병이 아닌 여학생 셋 가운데 고르므로 3가지.']),
  bx([('ㄱ', '10가지', True, O, '20 ÷ 2.'), ('ㄴ', '4가지', True, O, '나머지 한 명.'), ('ㄷ', '8가지', False, XX, '9가지이다.'), ('ㄹ', '4가지', False, XX, '3가지이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 10가지를 모두 나열해 확인하였다. <b>함정</b> 이름 없는 두 팀은 바꾸어도 같으므로 2로 나눈다.')]})

# ---------------------------------------------------------------- S-BV03 자전거 통행 규정 (법조문 적용, 옳은 것)
def may_use_sidewalk(age, disabled=False): return age < 13 or age >= 65 or disabled
PRIORITY_ON_SIDEWALK = '보행자'
ride_across_crosswalk = lambda: RULE_CROSS == '타고 건넌다'
RULE_CROSS = '내려서 끌고 간다'
is_bicycle = lambda kind: kind == '페달 보조'
must_use_lane = lambda lane_exists: lane_exists
f3 = [may_use_sidewalk(15), is_bicycle('페달 보조'), ride_across_crosswalk(), may_use_sidewalk(70) and PRIORITY_ON_SIDEWALK == '자전거', not must_use_lane(True)]
one_true(f3, 1, 'S-BV03')
check(may_use_sidewalk(12) and may_use_sidewalk(65) and not may_use_sidewalk(13) and not is_bicycle('스로틀'), 'S-BV03 boundaries')
items.append({
 'id': 'S-BV03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(정의)</b> 이 법에서 ‘자전거’에는 사람이 페달을 밟을 때에만 전동기가 힘을 보태는 전기자전거를 포함한다. 페달을 밟지 않아도 손잡이 조작만으로 움직이는 것은 자전거로 보지 아니한다.</p>'
              '<p><b>제○○조(통행 방법)</b> ① 자전거 운전자는 자전거도로가 있는 곳에서는 자전거도로로 통행하여야 하며, 자전거도로가 없는 곳에서는 차도의 오른쪽 가장자리로 통행하여야 한다.<br>② 제1항에도 불구하고 13세 미만인 어린이, 65세 이상인 사람, 장애인은 보도로 통행할 수 있다. 이 경우 보행자의 통행을 방해하지 않도록 서행하여야 한다.<br>③ 자전거 운전자가 횡단보도를 건널 때에는 자전거에서 내려서 끌고 가야 한다.</p>')],
 'options': ['자전거도로가 없는 곳에서 15세 학생은 자전거를 타고 보도로 통행할 수 있다.', '페달을 밟을 때에만 전동기가 힘을 보태는 전기자전거는 자전거도로로 통행할 수 있다.', '자전거 운전자는 횡단보도를 자전거를 탄 채로 건널 수 있다.',
             '70세 노인은 자전거를 타고 보도로 통행할 수 있으며, 이때 보행자보다 먼저 지나갈 수 있다.', '자전거도로가 있는 곳에서도 차도의 오른쪽 가장자리로 통행하는 것이 허용된다.'],
 'answer': 1,
 'explain': [
  ox([(False, XX, '보도 통행은 13세 미만·65세 이상·장애인만 할 수 있다.'), (True, O, '이런 전기자전거는 자전거에 포함되므로 자전거도로로 통행한다.'), (False, XX, '내려서 끌고 가야 한다.'),
      (False, XX, '보도로 통행할 수는 있지만 보행자의 통행을 방해하지 않도록 서행하여야 한다.'), (False, XX, '자전거도로가 있으면 자전거도로로 통행하여야 한다.')]),
  p('따라서 정답은 <b>②</b>이다. <b>함정</b> 정의 조항의 범위, 단서의 대상과 조건(서행·보행자 우선), 횡단보도 규정을 확인한다.')]})

# ---------------------------------------------------------------- S-BV04 나이 문제 (수리 추론)
DAD, SON = 45, 15
ratio_after = lambda n: F(DAD + n, SON + n)
years_to = lambda target: next(n for n in range(0, 100) if ratio_after(n) == target)
t4 = {'ㄱ': ratio_after(5) == F(5, 2), 'ㄴ': years_to(2) == 10, 'ㄷ': ratio_after(-10) == 7, 'ㄹ': next(n for n in range(0, 100) if DAD + SON + 2 * n == 100) == 20}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': True} and years_to(2) == 15, f'S-BV04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BV04')
items.append({
 'id': 'S-BV04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('올해 아버지는 45세이고 아들은 15세이다. 두 사람의 나이는 해마다 1세씩 늘어난다.'),
          box('보기', ['ㄱ. 5년 뒤 아버지의 나이는 아들 나이의 2.5배이다.', 'ㄴ. 아버지의 나이가 아들 나이의 2배가 되는 것은 10년 뒤이다.', 'ㄷ. 10년 전 아버지의 나이는 아들 나이의 7배였다.', 'ㄹ. 두 사람의 나이를 더한 값이 100이 되는 것은 20년 뒤이다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 50 ÷ 20 = 2.5.', 'ㄴ: 나이 차는 늘 30세이므로 아버지가 아들의 2배가 되려면 아들이 30세, 곧 15년 뒤이다(10년 뒤에는 55 ÷ 25 = 2.2배).', 'ㄷ: 35 ÷ 5 = 7.', 'ㄹ: 지금 합 60에서 해마다 2씩 늘어 40을 채우려면 20년 → 65 + 35 = 100.']),
  bx([('ㄱ', '2.5배', True, O, '50 ÷ 20.'), ('ㄴ', '10년 뒤 2배', False, XX, '15년 뒤이다.'), ('ㄷ', '7배', True, O, '35 ÷ 5.'), ('ㄹ', '20년 뒤 합 100', True, O, '60 + 2 × 20.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 두 사람의 나이 차는 변하지 않는다. 배수 문제는 나이 차에서 거꾸로 푼다.')]})
check(ratio_after(10) == F(55, 25), 'S-BV04 explanation 2.2')

# ---------------------------------------------------------------- S-BV05 출퇴근 교통수단 고르기 (규칙 모두 필요)
RT = {'A': (12, 55, 1, 92), 'B': (8, 70, 0, 95), 'C': (9, 50, 2, 93), 'D': (10, 45, 1, 85), 'E': (14, 40, 0, 97), 'F': (15, 35, 1, 99)}   # 월 비용(만 원), 편도 시간(분), 환승(회), 정시 도착률(%)
def pick5(r=(1, 1, 1)):
    ok_ = [k for k, (c, t, x, p_) in RT.items() if (not r[0] or t <= 60) and (not r[1] or x <= 1) and (not r[2] or p_ >= 90)]
    return sorted(ok_, key=lambda k: RT[k][0])
PK = pick5(); b5 = PK[0]
check(b5 == 'A' and RT[PK[1]][0] > RT[b5][0], f'S-BV05 {PK}')
alts5 = [pick5(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check(alts5 == ['B', 'C', 'D'], f'S-BV05 every rule changes the answer {alts5}')
check(len({v[0] for v in RT.values()}) == len(RT), 'S-BV05 costs distinct')
opts5 = sorted(['A', 'B', 'C', 'D', PK[1]], key=lambda k: RT[k][0]); ans5 = opts5.index('A')
check(opts5 == ['B', 'C', 'D', 'A', 'E'], f'S-BV05 {opts5}')
items.append({
 'id': 'S-BV05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 고를 출퇴근 방법은?',
 'body': [p('甲은 출퇴근 방법 A~F 가운데 하나를 고르려 한다. 甲은 다음 조건을 모두 갖춘 방법 가운데 한 달 비용이 가장 적은 것을 고른다.'),
          table(['방법', '한 달 비용(만 원)', '편도 시간(분)', '환승(회)', '정시 도착률(%)'], [[k, str(c), str(t), str(x), str(p_)] for k, (c, t, x, p_) in RT.items()], caption='출퇴근 방법별 비용·시간·환승·정시 도착률', num=False),
          box('조건', ['편도 시간이 60분 이하여야 한다.', '환승은 1회 이하여야 한다.', '정시 도착률이 90% 이상이어야 한다.'], plain=True)],
 'options': list(opts5), 'answer': ans5,
 'explain': [
  steps(['비용이 적은 순서는 B(8), C(9), D(10), A(12), E(14), F(15)이다.', 'B는 편도 70분으로 시간 조건을, C는 환승 2회로 환승 조건을, D는 정시 도착률 85%로 정시 조건을 어긴다.', 'A는 55분·환승 1회·92%로 세 조건을 모두 갖추므로 <b>A</b>를 고른다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. <b>함정</b> 시간 조건을 빼면 B, 환승 조건을 빼면 C, 정시 조건을 빼면 D를 고르게 된다.')]})

REVIEW = {
 'S-BV01': ('법조문 계산', '상', '2분 30초', '날짜 구간, 예매 당일 특례와 그 단서, 당일 취소 불가', '구간 경계·특례 범위 착오', '사람별 구간 → 특례 → 환불액', '공연 취소 수수료형, 조문 둘, 새로 설계'),
 'S-BV02': ('경우의 수', '상', '2분', '이름 없는 팀의 중복, 같은 팀 조건, 여사건', '팀 바꾸기 중복', '한 팀만 정하기', '팀 나누기형, 새로 설계(전수)'),
 'S-BV03': ('법조문 적용', '상', '1분 30초', '정의의 범위, 단서 대상과 조건, 횡단보도', '단서의 조건 누락', '조문별 대조', '자전거 통행형, 조문 둘, 새로 설계'),
 'S-BV04': ('수리 추론', '상', '2분', '변하지 않는 나이 차, 배수, 합', '나이 차가 변한다고 착각', '나이 차에서 거꾸로', '나이 문제형, 새로 설계'),
 'S-BV05': ('최적화', '상', '1분 30초', '조건 셋으로 거른 뒤 비용 비교', '조건 하나 누락', '싼 것부터 조건 확인', '출퇴근 방법형, 새로 설계(조건 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bv.py', 'review/sit-bv.md'), '상황판단 S-BV 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
