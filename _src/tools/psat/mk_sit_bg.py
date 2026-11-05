# 상황판단 S-BG01..S-BG05 — 5급 실전(심화) 수준 정예 문항: 공영주차장 요금(올림·상한·회차·감면 순서), 2칸 연속 금지 계단 오르기(전수), 반려견 등록 규정, 리그 승점으로 경기 결과 복원(729가지 전수), 작품 운송 트럭 배정(분할 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, math
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bg.js'

# ---------------------------------------------------------------- S-BG01 공영주차장 요금 (법조문 계산)
CARS = {'甲': ('일반', 125), '乙': ('경차', 240), '丙': ('장애인 표지 경차', 50), '丁': ('일반', 8)}   # 차종, 주차 시간(분)
RATE = {'일반': 0, '경차': F(50, 100), '장애인 표지 경차': F(80, 100)}
def fee1(k, ceil_=True, cap_first=True, turn=True, max_rate=True):
    kind, m = CARS[k]
    if turn and m <= 10: return F(0)
    over = max(0, m - 30); blocks = -(-over // 10) if ceil_ else over // 10
    base = F(1000 + 500 * blocks)
    r = RATE[kind] if max_rate else (F(50, 100) if '경차' in kind else RATE[kind])
    return min(base, 10000) * (1 - r) if cap_first else min(base * (1 - r), 10000)
each1 = {k: fee1(k) for k in CARS}
check(each1 == {'甲': 6000, '乙': 5000, '丙': 400, '丁': 0}, f'S-BG01 {each1}')
tot1 = lambda **kw: int(sum(fee1(k, **kw) for k in CARS))
alts1 = {'정답': tot1(), '내림': tot1(ceil_=False), '감면 후 상한': tot1(cap_first=False), '경차 감면율 적용': tot1(max_rate=False), '회차 무시': tot1(turn=False)}
check(alts1 == {'정답': 11400, '내림': 10900, '감면 후 상한': 12150, '경차 감면율 적용': 12000, '회차 무시': 12400}, f'S-BG01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BG01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
check(-(-95 // 10) == 10 and -(-210 // 10) == 21 and -(-20 // 10) == 2 and 1000 + 21 * 500 == 11500, 'S-BG01 explanation blocks')
items.append({
 'id': 'S-BG01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낸 주차 요금의 합계는?',
 'body': [law('<p><b>제○○조(요금)</b> ① 주차 요금은 처음 30분까지 1,000원으로 하고, 30분을 넘으면 넘는 시간 10분마다 500원을 더한다. 이 경우 10분 미만의 시간은 10분으로 본다.<br>② 한 번 주차한 차량의 요금은 10,000원을 넘지 아니한다.</p>'
              '<p><b>제○○조(회차)</b> 들어온 뒤 10분 이내에 나가는 차량에는 요금을 받지 아니한다.</p>'
              '<p><b>제○○조(감면)</b> ① 경차는 요금의 100분의 50을, 장애인 표지를 붙인 차량은 요금의 100분의 80을 감면한다.<br>② 제1항의 감면 사유가 둘 이상 해당하면 감면율이 가장 큰 것 하나만 적용한다.<br>③ 감면은 제○○조(요금)에 따라 정해진 요금에 적용한다.</p>'),
          box('상황', ['甲: 일반 승용차로 2시간 5분 주차', '乙: 경차로 4시간 주차', '丙: 장애인 표지를 붙인 경차로 50분 주차', '丁: 일반 승용차로 들어왔다가 8분 만에 나감', '(네 사람 모두 하루 안에 나갔다.)'], plain=True)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 30분을 넘는 95분 → 10분 단위로 올려 10번 → 1,000 + 5,000 = 6,000원.',
         '乙: 넘는 210분 → 21번 → 1,000 + 10,500 = 11,500원이지만 상한으로 10,000원 → 경차 50% 감면 → 5,000원.',
         '丙: 넘는 20분 → 2번 → 2,000원 → 경차(50%)와 장애인 표지(80%) 가운데 큰 80%만 적용 → 400원.',
         '丁: 10분 이내에 나갔으므로 0원.']),
  p(f'합계 6,000 + 5,000 + 400 + 0 = <b>11,400원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 10분 미만을 버리면 10,900원, 감면한 뒤에 상한을 적용하면 12,150원, 丙에 경차 감면율을 적용하면 12,000원, 회차를 놓치면 12,400원이다.')]})

# ---------------------------------------------------------------- S-BG02 2칸 연속 금지 계단 오르기 (전수)
def climbs(n, no_double=True):
    out = []
    def go(rem, last, seq):
        if rem == 0: out.append(tuple(seq)); return
        go(rem - 1, 1, seq + [1]) if rem >= 1 else None
        if rem >= 2 and not (no_double and last == 2): go(rem - 2, 2, seq + [2])
    go(n, 0, []); return out
C10, C8 = climbs(10), climbs(8)
t2 = {'ㄱ': len(C10) == 41, 'ㄴ': min(map(len, C10)) == 7, 'ㄷ': sum(len(s) == 9 for s in C10) == 8, 'ㄹ': len(C8) >= 20}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and sum(len(s) == 9 for s in C10) == 9 and len(C8) == 19, f'S-BG02 {t2}')
check(min(map(len, climbs(10, False))) == 5, 'S-BG02 trap: without the rule 5 steps')
# 해설: 2칸 걸음 k번이면 1칸 걸음 10 − 2k번, 그 사이와 양 끝 11 − 2k곳 가운데 k곳에 2칸 걸음을 넣는다
check([math.comb(11 - 2 * k, k) for k in range(4)] == [1, 9, 21, 10] and sum(math.comb(11 - 2 * k, k) for k in range(6)) == 41, 'S-BG02 explanation combinatorics')
check(all(sum(1 for s in C10 if s.count(2) == k) == math.comb(11 - 2 * k, k) for k in range(6)), 'S-BG02 explanation matches enumeration')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BG02')
items.append({
 'id': 'S-BG02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('甲은 계단을 한 걸음에 1칸 또는 2칸씩 오른다. 다만 2칸짜리 걸음을 연달아 두 번 하지는 않는다. 오르는 걸음의 순서가 다르면 다른 방법으로 본다.'),
          box('보기', ['ㄱ. 10칸 계단을 오르는 방법은 모두 41가지이다.', 'ㄴ. 10칸 계단을 가장 적은 걸음으로 오르면 7걸음이다.', 'ㄷ. 10칸 계단을 정확히 9걸음으로 오르는 방법은 8가지이다.', 'ㄹ. 8칸 계단을 오르는 방법은 20가지 이상이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['2칸 걸음을 k번 하면 1칸 걸음은 10 − 2k번이다. 2칸 걸음끼리 붙지 않으려면 1칸 걸음들의 사이와 양 끝, 모두 11 − 2k곳 가운데 k곳에 하나씩 넣어야 한다.',
         'k = 0, 1, 2, 3일 때 1 + 9 + 21 + 10 = 41가지(ㄱ). k = 4이면 넣을 곳이 3곳뿐이라 불가능하므로 2칸 걸음은 많아야 3번, 가장 적은 걸음은 3 + 4 = 7걸음이다(ㄴ).',
         'ㄷ: 9걸음이면 2칸 걸음 1번, 넣을 곳 9곳 → 9가지이다. ㄹ: 8칸이면 k = 0~3에서 1 + 7 + 10 + 1 = 19가지이다.']),
  bx([('ㄱ', '41가지', True, O, '1 + 9 + 21 + 10.'), ('ㄴ', '7걸음', True, O, '2칸 걸음은 많아야 3번.'), ('ㄷ', '8가지', False, XX, '9가지.'), ('ㄹ', '20가지 이상', False, XX, '19가지.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 오르는 방법을 모두 나열해 확인하였다. <b>함정</b> 연속 금지를 잊으면 가장 적은 걸음이 5걸음이 된다.')]})
check(sum(math.comb(9 - 2 * k, k) for k in range(5)) == 19 and [math.comb(9 - 2 * k, k) for k in range(4)] == [1, 7, 10, 1], 'S-BG02 explanation 8 steps')

# ---------------------------------------------------------------- S-BG03 반려견 등록 규정 (법조문 적용, 옳은 것)
def must_register(age_days): return age_days >= 60                      # 생후 2개월(약 60일) 이상
def lost_report_ok(day_reported, found_day=None): return (found_day is not None and found_day <= 10) or day_reported <= 10
def change_ok(day): return day <= 30
def outing_ok(fierce, age_months, leash, muzzle): return leash and (muzzle or not fierce or age_months < 3)
f3 = [not must_register(75), lost_report_ok(15), outing_ok(True, 5, True, False), change_ok(40)]
check(f3 == [False, False, False, False], f'S-BG03 distractors {f3}')
key3 = lost_report_ok(day_reported=99, found_day=7)
one_true(f3 + [key3], 4, 'S-BG03')
check(outing_ok(True, 2, True, False) and not outing_ok(True, 5, True, False), 'S-BG03 muzzle exception boundary')
items.append({
 'id': 'S-BG03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(등록)</b> 개의 소유자는 생후 2개월 이상인 개를 시장·군수·구청장에게 등록하여야 한다.</p>'
              '<p><b>제○○조(변경신고)</b> ① 등록한 개를 잃어버린 소유자는 잃어버린 날부터 10일 이내에, 소유자나 주소가 바뀐 소유자는 바뀐 날부터 30일 이내에 신고하여야 한다.<br>② 제1항에도 불구하고 잃어버린 개를 신고 기간 안에 되찾은 소유자는 신고하지 아니할 수 있다.</p>'
              '<p><b>제○○조(외출)</b> 소유자는 개와 외출할 때 목줄을 하여야 하며, 맹견에게는 입마개도 하여야 한다. 다만 생후 3개월 미만인 맹견에게는 입마개를 하지 아니할 수 있다.</p>'
              '<p><b>제○○조(과태료)</b> 등록을 하지 아니한 소유자에게는 100만 원 이하, 변경신고를 하지 아니한 소유자에게는 50만 원 이하의 과태료를 부과한다.</p>')],
 'options': ['생후 75일 된 개를 기르는 소유자는 아직 등록하지 않아도 된다.', '등록한 개를 잃어버린 소유자가 잃어버린 날부터 15일째에 신고하였다면 기간 안에 신고한 것이다.',
             '생후 5개월 된 맹견과 외출하는 소유자는 목줄만 하면 된다.', '이사한 소유자가 이사한 날부터 40일째에 주소 변경을 신고하였다면 기간 안에 신고한 것이다.',
             '등록한 개를 잃어버렸다가 7일 만에 되찾은 소유자는 잃어버린 사실을 신고하지 않아도 된다.'],
 'answer': 4,
 'explain': [
  ox([(False, XX, '생후 2개월 이상이면 등록하여야 한다. 75일은 2개월을 넘는다.'), (False, XX, '잃어버린 날부터 10일 이내에 신고하여야 한다.'), (False, XX, '생후 3개월 이상인 맹견에게는 입마개도 하여야 한다.'),
      (False, XX, '주소가 바뀐 날부터 30일 이내에 신고하여야 한다.'), (True, O, '신고 기간(10일) 안에 되찾았으므로 신고하지 아니할 수 있다.')]),
  p('따라서 정답은 <b>⑤</b>이다. <b>함정</b> 2개월·3개월·10일·30일의 경계와, 되찾은 경우의 예외를 확인한다.')]})

# ---------------------------------------------------------------- S-BG04 리그 승점으로 경기 결과 복원 (729가지 전수)
TM = 'ABCD'; GM = list(itertools.combinations(TM, 2)); PTS = {'A': 7, 'B': 5, 'C': 3, 'D': 1}
def table4(oc):
    p = dict.fromkeys(TM, 0)
    for (x, y), o in zip(GM, oc):
        if o == 'W': p[x] += 3
        elif o == 'L': p[y] += 3
        else: p[x] += 1; p[y] += 1
    return p
SOL4 = [dict(zip(GM, oc)) for oc in itertools.product('WDL', repeat=6) if table4(oc) == PTS]
check(len(SOL4) == 1, f'S-BG04 unique {SOL4}')
R4 = SOL4[0]
check(R4 == {('A', 'B'): 'D', ('A', 'C'): 'W', ('A', 'D'): 'W', ('B', 'C'): 'W', ('B', 'D'): 'D', ('C', 'D'): 'W'}, f'S-BG04 {R4}')
lost = lambda t: any((g[0] == t and o == 'L') or (g[1] == t and o == 'W') for g, o in R4.items())
t4 = {'ㄱ': sum(o == 'D' for o in R4.values()) == 2, 'ㄴ': not lost('A'), 'ㄷ': R4[('B', 'D')] == 'D', 'ㄹ': R4[('A', 'D')] == 'D'}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False}, f'S-BG04 {t4}')
check(18 - sum(PTS.values()) == 2, 'S-BG04 explanation: each draw removes one point from 18')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BG04')
items.append({
 'id': 'S-BG04', 'type': '상황판단 · 논리 퍼즐', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('A, B, C, D 네 팀이 서로 한 번씩 경기를 하여 모두 6경기를 치렀다. 경기마다 이긴 팀은 승점 3점, 진 팀은 0점을 받고, 비기면 두 팀이 1점씩 받는다. 네 팀의 최종 승점은 A 7점, B 5점, C 3점, D 1점이었다.'),
          box('보기', ['ㄱ. 비긴 경기는 모두 2경기이다.', 'ㄴ. A는 한 경기도 지지 않았다.', 'ㄷ. B와 D의 경기는 비겼다.', 'ㄹ. D가 얻은 승점 1점은 A와의 경기에서 얻은 것이다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['승부가 난 경기는 승점 3점, 비긴 경기는 2점을 낳으므로 비긴 경기 수 = 6 × 3 − (7 + 5 + 3 + 1) = 2이다(ㄱ).',
         '승점으로 보면 A는 2승 1무, B는 1승 2무, C는 1승 2패(비긴 경기가 2경기뿐이라 3무는 불가), D는 1무 2패이다. 비긴 경기에 든 팀은 A 한 번, B 두 번, D 한 번이므로 비긴 경기는 A–B와 B–D이다(ㄷ, ㄹ).',
         '나머지에서 A는 C와 D를 이겼고(ㄴ: A는 지지 않음), B는 C를 이겼으며, C는 D를 이겼다.']),
  bx([('ㄱ', '무승부 2경기', True, O, '18 − 16 = 2.'), ('ㄴ', 'A 무패', True, O, '2승 1무.'), ('ㄷ', 'B–D 무승부', True, O, '무승부는 A–B, B–D.'), ('ㄹ', 'D의 1점은 A전', False, XX, 'B와의 경기에서 얻었다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. 6경기의 결과 729가지를 모두 따져 위 결과 하나만 성립함을 확인하였다.')]})
check({t: (sum((g[0] == t and o == 'W') or (g[1] == t and o == 'L') for g, o in R4.items()), sum(t in g and o == 'D' for g, o in R4.items())) for t in TM} == {'A': (2, 1), 'B': (1, 2), 'C': (1, 0), 'D': (0, 1)}, 'S-BG04 explanation records')

# ---------------------------------------------------------------- S-BG05 작품 운송 트럭 배정 (분할 전수, 규칙 모두 필요)
WT = {'가': 10, '나': 6, '다': 5, '라': 4, '마': 3, '바': 2}      # 무게(100kg)
SMALL, BIG = (10, 10), (25, 17)                                  # (적재 한도 100kg, 요금 만 원)
def parts(xs):
    xs = list(xs)
    if not xs: yield []; return
    for rest in parts(xs[1:]):
        for k in range(len(rest)): yield rest[:k] + [[xs[0]] + rest[k]] + rest[k + 1:]
        yield [[xs[0]]] + rest
PARTS = list(parts(WT))
check(len(PARTS) == 203, 'S-BG05 Bell number')
def plans5(r=(1, 1, 1)):
    res = []
    for P in PARTS:
        tot, ok_ = 0, True
        for g in P:
            w = sum(WT[x] for x in g)
            if (r[0] and '가' in g and '나' in g) or (r[2] and len(g) > 3) or w > BIG[0]: ok_ = False; break
            tot += BIG[1] if (w > SMALL[0] or (r[1] and '다' in g)) else SMALL[1]
        if ok_: res.append((tot, P))
    m = min(t for t, _ in res); return m, res
b5, all5 = plans5()
alts5 = [plans5(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check(b5 == 34 and alts5 == [27, 30, 27], f'S-BG05 every rule changes the answer {b5} {alts5}')
costs_any = {t for r in itertools.product((0, 1), repeat=3) for t, _ in plans5(r)[1]}
FILL = 20
check(FILL not in costs_any and 37 in {t for t, _ in all5}, 'S-BG05 filler unreachable, 37 is a feasible but not cheapest plan')
opts5v = sorted([b5, FILL, 37] + alts5[:2]); check(len(set(opts5v)) == 5, f'S-BG05 {opts5v}')
ans5 = opts5v.index(b5)
# 해설: 트럭 두 대면 각 3점; 소형에는 다 불가, 가·나 중 하나가 들어가야 하는데 가(10) + 2점 또는 나(6) + 2점(최소 3 + 2 = 5)은 한도 초과
two = [P for t, P in all5 if len(P) == 2]
check(all(t == 34 for t, P in all5 if len(P) == 2) and two and min(t for t, P in all5 if len(P) == 3) == 37 and not [P for t, P in all5 if len(P) < 2], 'S-BG05 explanation two trucks')
check(WT['나'] + WT['마'] + WT['바'] > SMALL[0] and sum(WT.values()) > BIG[0], 'S-BG05 explanation weights')
items.append({
 'id': 'S-BG05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 내야 하는 운송비의 최솟값은?',
 'body': [p('미술관 직원 甲은 작품 가~바 여섯 점을 트럭으로 한꺼번에 옮기려 한다. 소형 트럭은 1톤까지 싣고 운송비가 대당 10만 원, 대형 트럭은 2.5톤까지 싣고 운송비가 대당 17만 원이며, 트럭은 종류마다 필요한 만큼 빌릴 수 있다. 작품의 무게는 아래와 같고, 다음 규칙을 모두 지켜야 한다.'),
          table(['작품', '무게(kg)'], [[k, f'{v * 100:,}'] for k, v in WT.items()], caption='작품별 무게', num=True),
          box('규칙', ['가와 나는 같은 트럭에 실을 수 없다.', '다는 온도를 맞춰야 하므로 냉방 장치가 있는 대형 트럭에만 실을 수 있다.', '한 트럭에는 작품을 3점까지만 실을 수 있다.'], plain=True)],
 'options': [f'{v}만 원' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['무게 합이 3톤이라 대형 한 대(2.5톤)로는 부족하고, 한 트럭에 3점까지이므로 트럭은 적어도 두 대 필요하다.',
         '두 대라면 3점씩 싣는다. 다를 실은 트럭은 대형이다. 다른 트럭이 소형이라면, 가와 나는 같은 트럭에 실을 수 없으므로 둘 중 하나는 소형 트럭에 실린다. 그런데 가(1,000kg)에 두 점을 더하거나 나(600kg)에 가장 가벼운 마·바(500kg)를 더해도 1톤을 넘는다. 따라서 두 대 모두 대형이어야 해 34만 원이다.',
         '세 대라면 다를 실은 대형 한 대에 소형 두 대가 들어 적어도 17 + 10 + 10 = 37만 원이다. 따라서 최솟값은 <b>34만 원</b>이다(예: 대형에 나·다·라, 대형에 가·마·바).']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 작품을 트럭에 나누는 203가지를 모두 따져 확인하였다. <b>함정</b> 가·나 분리 규칙이나 3점 제한을 빼면 대형 한 대와 소형 한 대로 27만 원, 냉방 규칙을 빼면 소형 세 대로 30만 원이 된다.')]})
check(any(sorted(map(sorted, P)) == sorted([sorted(['나', '다', '라']), sorted(['가', '마', '바'])]) for t, P in all5 if t == 34), 'S-BG05 explanation example plan')

REVIEW = {
 'S-BG01': ('법조문 계산', '상', '2분 30초', '10분 미만 올림, 상한과 감면의 순서, 회차, 감면 사유 중복', '올림·순서·예외 누락', '사람별 시간 → 요금 → 상한 → 감면', '공영주차장 요금형, 조문 셋, 새로 설계'),
 'S-BG02': ('경우의 수', '상', '2분 30초', '2칸 걸음 수로 나누어 자리 고르기', '연속 금지 누락', '2칸 걸음 개수별 조합', '계단 오르기형, 새로 설계(전수)'),
 'S-BG03': ('법조문 적용', '상', '1분 30초', '개월·일 경계, 맹견 예외, 되찾은 경우의 신고 면제', '경계·단서 착오', '조문별 대조', '반려견 등록형, 조문 넷, 새로 설계'),
 'S-BG04': ('논리 퍼즐', '상', '2분 30초', '승점 합으로 무승부 수, 팀별 전적, 무승부 짝 찾기', '3무 가능성 미배제', '승점 합 18에서 시작', '리그 승점형, 새로 설계(729가지 전수)'),
 'S-BG05': ('최적화', '상', '3분', '트럭 대수 하한, 소형 트럭의 한계, 규칙 셋의 결합', '규칙 하나 누락', '대수 하한부터', '작품 운송형, 새로 설계(203가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bg.py', 'review/sit-bg.md'), '상황판단 S-BG 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
