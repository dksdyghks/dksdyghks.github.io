# 상황판단 S-BB01..S-BB05 — 5급 실전(심화) 수준 정예 문항: 불법 주차 견인료·보관료(조문 넷과 단서·상한), 등산로 왕복(모든 길 전수), 대형 생활폐기물 배출 규정, 3×3 숫자 배치(362,880가지 전수), 개선 사업 선정(64가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bb.js'

# ---------------------------------------------------------------- S-BB01 불법 주차 견인료·보관료 (법조문 계산)
CASE = {'甲': ('승용', 8, 3, False), '乙': ('승합', 13.6, 30, False), '丙': ('승용', 12, 0, True), '丁': ('화물', 9, 7.5, False)}   # 차종, 견인 거리(km), 보관 시간(시간), 견인 전 운전자 도착
def fee1(k, dist_add=True, half=True, storage=True, cap=True):
    kind, km, hrs, back = CASE[k]
    tow = 40000 if kind == '승용' else 50000
    if dist_add and km > 10: tow += 2000 * int(km - 10)
    if back:
        return tow // 2 if half else tow
    st = 0
    if storage:
        h = -int(-F(hrs).limit_denominator() // 1)                     # 1시간 미만은 1시간으로
        st = 1000 * min(h, 6) + 500 * max(h - 6, 0)
        if cap: st = min(st, 15000)
    return tow + st
each1 = {k: fee1(k) for k in CASE}
check(each1 == {'甲': 43000, '乙': 71000, '丙': 22000, '丁': 57000}, f'S-BB01 {each1}')
tot1 = lambda **kw: sum(fee1(k, **kw) for k in CASE)
alts1 = {'정답': tot1(), '거리 가산 누락': tot1(dist_add=False), '현장 감경 누락': tot1(half=False), '보관료 상한 누락': tot1(cap=False), '보관료 누락': tot1(storage=False)}
check(alts1 == {'정답': 193000, '거리 가산 누락': 185000, '현장 감경 누락': 215000, '보관료 상한 누락': 196000, '보관료 누락': 168000}, f'S-BB01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, 'S-BB01 distinct')
ans1 = vals1.index(alts1['정답'])
check(1000 * 6 + 500 * 24 == 18000 and 1000 * 6 + 500 * 2 == 7000 and 2000 * int(13.6 - 10) == 6000 and 2000 * int(12 - 10) == 4000, 'S-BB01 explanation pieces')
items.append({
 'id': 'S-BB01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낸 금액의 합계는?',
 'body': [law('<p><b>제○○조(견인료)</b> 불법 주차 차량의 견인료는 승용차 4만 원, 승합차와 화물차 5만 원으로 한다. 다만 견인 거리가 10킬로미터를 넘으면 넘는 거리 1킬로미터마다 2천 원을 더하며, 1킬로미터 미만은 버린다.</p>'
              '<p><b>제○○조(보관료)</b> 견인한 차량의 보관료는 보관을 시작한 때부터 6시간까지는 1시간마다 1천 원, 그 뒤로는 1시간마다 500원으로 한다. 이때 1시간 미만은 1시간으로 본다.</p>'
              '<p><b>제○○조(보관료 상한)</b> 보관료는 1만 5천 원을 넘을 수 없다.</p>'
              '<p><b>제○○조(현장 감경)</b> 견인차에 차량을 매단 뒤 출발하기 전에 운전자가 돌아오면 견인료의 2분의 1만 받고 차량을 돌려주며, 보관료는 받지 아니한다.</p>'),
          table(['운전자', '차종', '견인 거리', '보관 시간', '견인 출발 전 도착'], [['甲', '승용', '8km', '3시간', '아니요'], ['乙', '승합', '13.6km', '30시간', '아니요'], ['丙', '승용', '12km', '–', '예'], ['丁', '화물', '9km', '7시간 30분', '아니요']], caption='견인 현황', num=False)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 견인료 4만 원 + 보관료 3시간 × 1천 원 = 43,000원.', '乙: 견인료 5만 원 + 넘는 3.6km에서 1km 미만을 버려 3km × 2천 원 = 56,000원. 보관료 6시간 × 1천 원 + 24시간 × 500원 = 18,000원이지만 상한 15,000원 → 71,000원.',
         '丙: 견인차가 출발하기 전에 돌아왔으므로 견인료(4만 원 + 2km × 2천 원 = 44,000원)의 2분의 1인 22,000원만 내고 보관료는 없다.', '丁: 견인료 5만 원 + 보관료 7시간 30분 → 8시간으로 보아 6 × 1천 원 + 2 × 500원 = 7,000원 → 57,000원.']),
  p(f'합계 43,000 + 71,000 + 22,000 + 57,000 = <b>193,000원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 거리 가산을 빠뜨리면 185,000원, 현장 감경을 빠뜨리면 215,000원, 보관료 상한을 빠뜨리면 196,000원, 보관료를 아예 빠뜨리면 168,000원이다.')]})

# ---------------------------------------------------------------- S-BB02 등산로 왕복 (모든 길 전수)
TRAIL = {('입구', 'P'): (40, 30), ('입구', 'Q'): (50, 35), ('P', 'Q'): (15, 15), ('P', 'R'): (35, 25), ('Q', 'R'): (30, 25), ('P', '정상'): (70, 45), ('R', '정상'): (30, 15), ('Q', '정상'): (65, 40)}   # (아래→위로 갈 때, 위→아래로 갈 때) 분
def walk(a, b, seen):
    if a == b: yield seen; return
    for (x, y) in TRAIL:
        for u, v in ((x, y), (y, x)):
            if u == a and v not in seen: yield from walk(v, b, seen + [v])
def tm(path): return sum(TRAIL[(path[i], path[i + 1])][0] if (path[i], path[i + 1]) in TRAIL else TRAIL[(path[i + 1], path[i])][1] for i in range(len(path) - 1))
edges = lambda path: {frozenset(path[i:i + 2]) for i in range(len(path) - 1)}
UP = sorted((tm(pp), pp) for pp in walk('입구', '정상', ['입구'])); DOWN = sorted((tm(pp), pp) for pp in walk('정상', '입구', ['정상']))
RT = sorted((tm(u) + tm(d), u, d) for _, u in UP for _, d in DOWN if not (edges(u) & edges(d)))
free = UP[0][0] + DOWN[0][0]
check(UP[0] == (105, ['입구', 'P', 'R', '정상']) and UP[1][0] > 105 and DOWN[0] == (70, ['정상', 'R', 'P', '입구']) and DOWN[1][0] > 70, f'S-BB02 {UP[:2]} {DOWN[:2]}')
check(RT[0][0] == 180 and RT[1][0] > 180 and RT[0][1:] == (['입구', 'P', 'R', '정상'], ['정상', 'Q', '입구']) and free == 175, f'S-BB02 round trip {RT[:2]} {free}')
t2 = {'ㄱ': UP[0][0] == 105, 'ㄴ': RT[0][0] == 180, 'ㄷ': RT[0][0] - free >= 10, 'ㄹ': {'R', 'P'} <= set(DOWN[0][1]) and DOWN[1][0] > DOWN[0][0]}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True}, f'S-BB02 {t2}')
check(tm(['입구', 'Q', '정상']) == 115 and tm(['정상', 'R', 'P', '입구']) == 70 and tm(['입구', 'Q', '정상']) + 70 == 185 and tm(['입구', 'P', '정상']) + tm(['정상', 'R', 'Q', '입구']) == 185, 'S-BB02 explanation alternatives')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BB02')
items.append({
 'id': 'S-BB02', 'type': '상황판단 · 경로 계산', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('甲은 산 입구에서 정상까지 올라갔다가 다시 입구로 내려오려 한다. 산에는 입구, 갈림길 P·Q·R, 정상을 잇는 등산로가 있고, 같은 등산로라도 오르는 방향과 내려가는 방향의 걸리는 시간이 다르다. 甲은 한 번 지난 갈림길을 같은 방향 안에서 다시 지나지 않는다. 갈림길에서 쉬는 시간은 없다.'),
          table(['등산로', '아래에서 위로', '위에서 아래로'], [[f'{a} – {b}', f'{u}분', f'{d}분'] for (a, b), (u, d) in TRAIL.items()], caption='등산로별 걸리는 시간(왼쪽 지점이 아래쪽)', num=False),
          box('보기', ['ㄱ. 입구에서 정상까지 가장 빨리 오르면 105분이 걸린다.', 'ㄴ. 올라갈 때 지난 등산로를 내려올 때 다시 지나지 않는다면, 왕복에 걸리는 가장 짧은 시간은 180분이다.', 'ㄷ. 올라갈 때 지난 등산로를 내려올 때 다시 지나도 된다면, 왕복에 걸리는 가장 짧은 시간은 ㄴ의 경우보다 10분 이상 줄어든다.', 'ㄹ. 정상에서 입구까지 가장 빨리 내려오는 길은 R과 P를 지난다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['오르기: 입구 → P → R → 정상 = 40 + 35 + 30 = 105분이 가장 빠르다(ㄱ). 내려오기: 정상 → R → P → 입구 = 15 + 25 + 30 = 70분이 가장 빠르다(ㄹ).',
         '같은 길을 다시 지나도 된다면 105 + 70 = 175분이다. 그러나 이 두 길은 P–R, R–정상, 입구–P를 함께 쓴다.',
         '같은 길을 피하면: 입구 → P → R → 정상(105분) 뒤 정상 → Q → 입구(40 + 35 = 75분)로 180분이다(ㄴ). 입구 → Q → 정상(115분) 뒤 정상 → R → P → 입구(70분)는 185분, 입구 → P → 정상(110분) 뒤 정상 → R → Q → 입구(75분)도 185분이다. ㄷ: 175분은 180분보다 5분 짧을 뿐이다.']),
  bx([('ㄱ', '오르기 105분', True, O, 'P, R을 지난다.'), ('ㄴ', '왕복 180분', True, O, '105 + 75.'), ('ㄷ', '10분 이상 단축', False, XX, '175분, 5분 단축.'), ('ㄹ', '내려오기는 R·P', True, O, '70분.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 오르는 길과 내려오는 길을 모두 짝지어 확인하였다.')]})

# ---------------------------------------------------------------- S-BB03 대형 생활폐기물 배출 규정 (법조문 적용, 옳은 것)
FEE = {'장롱': 10000, '침대': 8000, '의자': 2000}
def fee3(item, size_sum_m=0): return FEE[item] * (F(3, 2) if item == '장롱' and size_sum_m > 2 else 1)
def free_pickup(kind, n): return kind == '대형 가전' or (kind == '소형 가전' and n >= 5)
def fine3(items_n, self_report_hours=None): return 0 if (self_report_hours is not None and self_report_hours <= 24) else 100000 * items_n
f3 = [fee3('장롱', 2.4) == 10000, fine3(2, 20) == 0 and fine3(2) == 200000, free_pickup('소형 가전', 3), fee3('침대') + fee3('의자') * 3 == 16000, fine3(3, 30) == 0]
one_true(f3, 1, 'S-BB03')
check(fee3('장롱', 2.4) == 15000 and fee3('침대') + fee3('의자') * 3 == 14000 and fine3(3, 30) == 300000 and not free_pickup('소형 가전', 3), 'S-BB03 distractor facts')
items.append({
 'id': 'S-BB03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(배출 신고)</b> 가구 등 대형 생활폐기물을 내놓으려는 자는 미리 구청장에게 신고하고 수수료를 내야 한다.</p>'
              '<p><b>제○○조(수수료)</b> 수수료는 장롱 1만 원, 침대 8천 원, 의자 2천 원으로 한다. 다만 가로·세로·높이의 합이 2미터를 넘는 장롱은 그 1.5배로 한다.</p>'
              '<p><b>제○○조(무상 수거)</b> 냉장고·세탁기 등 대형 가전제품은 신고하면 수수료 없이 수거한다. 소형 가전제품은 한 번에 5개 이상을 내놓는 경우에만 수수료 없이 수거한다.</p>'
              '<p><b>제○○조(과태료)</b> 신고하지 아니하고 대형 생활폐기물을 내놓은 자에게는 1개마다 10만 원의 과태료를 부과한다. 다만 내놓은 때부터 24시간 이내에 신고하고 수수료를 낸 경우에는 부과하지 아니한다.</p>')],
 'options': ['가로·세로·높이의 합이 2.4미터인 장롱을 내놓는 사람의 수수료는 1만 원이다.', '신고하지 않고 가구 2개를 내놓은 사람이 20시간 뒤에 신고하고 수수료를 냈다면 과태료를 내지 않으며, 끝내 신고하지 않았다면 과태료는 20만 원이다.',
             '소형 가전제품 3개를 한 번에 내놓으면 수수료 없이 수거한다.', '침대 1개와 의자 3개를 내놓는 사람의 수수료는 1만 6천 원이다.', '신고하지 않고 가구 3개를 내놓은 사람이 30시간 뒤에 신고하고 수수료를 냈다면 과태료를 내지 않는다.'],
 'answer': 1,
 'explain': [
  ox([(False, XX, '2미터를 넘으므로 1.5배인 1만 5천 원이다.'), (True, O, '24시간 이내에 신고하고 수수료를 냈으므로 면제되고, 신고하지 않았다면 2개 × 10만 원 = 20만 원이다.'), (False, XX, '소형 가전제품은 5개 이상일 때만 무상이다.'),
      (False, XX, '8천 원 + 2천 원 × 3 = 1만 4천 원이다.'), (False, XX, '24시간을 넘겨 신고했으므로 3개 × 10만 원 = 30만 원을 낸다.')]),
  p('따라서 정답은 <b>②</b>이다. <b>함정</b> 크기 단서의 1.5배, 소형 가전의 개수 조건, 과태료 면제의 24시간 경계를 확인한다.')]})

# ---------------------------------------------------------------- S-BB04 3×3 숫자 배치 (362,880가지 전수)
GRID = [g for g in itertools.permutations(range(1, 10)) if all(sum(g[3 * r:3 * r + 3]) == sum(g[0:3]) for r in range(3)) and all(sum(g[c::3]) == sum(g[0:3]) for c in range(3))]
rows = lambda g: [g[3 * r:3 * r + 3] for r in range(3)]
t4 = {'ㄱ': all(sum(g[0:3]) == 15 for g in GRID), 'ㄴ': {g[4] for g in GRID} == {5}, 'ㄷ': all(any(9 in r and (1 in r or 2 in r) for r in rows(g)) for g in GRID), 'ㄹ': any(all(g[i] % 2 == 0 for i in (0, 2, 6, 8)) for g in GRID)}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': True} and len(GRID) == 72, f'S-BB04 {t4} {len(GRID)}')
ex4 = [g for g in GRID if all(g[i] % 2 == 0 for i in (0, 2, 6, 8))][0]
check(sorted({g[4] for g in GRID}) == list(range(1, 10)) and sum(range(1, 10)) == 45, 'S-BB04 explanation: total 45, any digit can be in the middle')
EX_MID = [g for g in GRID if g[4] == 1][0]
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BB04')
fmt = lambda g: ' / '.join(' '.join(map(str, r)) for r in rows(g))
items.append({
 'id': 'S-BB04', 'type': '상황판단 · 규칙 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('가로 3칸, 세로 3칸인 판의 아홉 칸에 1부터 9까지의 숫자를 하나씩 써넣으려 한다. 이때 가로 세 줄의 숫자 합과 세로 세 줄의 숫자 합이 모두 같아야 한다. 대각선의 합은 따지지 않는다.'),
          box('보기', ['ㄱ. 각 줄의 숫자 합은 15이다.', 'ㄴ. 가운데 칸에는 5만 쓸 수 있다.', 'ㄷ. 9가 있는 가로줄에는 1이나 2가 반드시 있다.', 'ㄹ. 네 모서리 칸에 모두 짝수를 쓰는 방법이 있다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 1부터 9까지의 합 45를 가로 세 줄이 똑같이 나누므로 각 줄은 15이다.', f'ㄴ: 대각선은 따지지 않으므로 가운데에 5가 아닌 숫자도 올 수 있다. 예컨대 위에서부터 {fmt(EX_MID)}처럼 가운데에 1을 써도 가로·세로 합이 모두 15이다.',
         'ㄷ: 9가 있는 줄의 나머지 두 수는 합이 6이고 서로 다르므로 1과 5 또는 2와 4이다. 어느 경우든 1이나 2가 있다.', f'ㄹ: 예컨대 위에서부터 {fmt(ex4)}로 쓰면 네 모서리가 모두 짝수이다.']),
  bx([('ㄱ', '합 15', True, O, '45 ÷ 3.'), ('ㄴ', '가운데는 5만', False, XX, '대각선 조건이 없다.'), ('ㄷ', '9와 1 또는 2', True, O, '1 + 5, 2 + 4.'), ('ㄹ', '모서리 모두 짝수', True, O, '예시가 있다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. 숫자를 써넣는 362,880가지를 모두 따져 조건에 맞는 72가지를 확인하였다.')]})
check(all(sum(r) == 15 for r in rows(EX_MID)) and all(sum(EX_MID[c::3]) == 15 for c in range(3)) and EX_MID[4] == 1, 'S-BB04 explanation example')

# ---------------------------------------------------------------- S-BB05 개선 사업 선정 (64가지 전수, 규칙 모두 필요)
PRJ = {'A': (8, 9), 'B': (9, 12), 'C': (5, 14), 'D': (3, 13), 'E': (3, 10), 'F': (4, 5)}    # 비용(억 원), 효과 점수
BUDGET = 18
def best5(r=(1, 1, 1, 1)):
    res = []
    for k in range(7):
        for sel in itertools.combinations(PRJ, k):
            if sum(PRJ[x][0] for x in sel) > BUDGET: continue
            if r[0] and 'B' in sel and 'A' not in sel: continue
            if r[1] and 'C' in sel and 'D' in sel: continue
            if r[2] and 'E' in sel and 'F' not in sel: continue
            if r[3] and len(sel) > 3: continue
            res.append((sum(PRJ[x][1] for x in sel), sel))
    res.sort(reverse=True); return res[0][0], [s for v, s in res if v == res[0][0]], res
b5, a5, all5 = best5()
check(b5 == 29 and a5 == [('C', 'E', 'F')], f'S-BB05 {b5} {a5}')
alts5 = [best5(tuple(0 if j == i else 1 for j in range(4)))[:2] for i in range(4)]
check(alts5 == [(31, [('B', 'C', 'F')]), (36, [('A', 'C', 'D')]), (33, [('A', 'C', 'E')]), (37, [('A', 'D', 'E', 'F')])], f'S-BB05 every rule changes the answer {alts5}')
opts5v = sorted([b5] + [x[0] for x in alts5]); check(len(set(opts5v)) == 5 and opts5v.index(b5) == 0, 'S-BB05 options')
check(all5[1][0] == 28 and all5[1][1] == ('D', 'E', 'F'), f'S-BB05 explanation runner-up {all5[1]}')
items.append({
 'id': 'S-BB05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲시가 고른 사업들의 효과 점수 합은?',
 'body': [p('甲시는 예산 18억 원 안에서 개선 사업 A~F 가운데 몇 개를 골라 효과 점수의 합이 가장 크도록 하려 한다. 각 사업은 한 번만 고를 수 있고, 다음 규칙을 모두 지켜야 한다.'),
          box('규칙', ['B를 고르려면 A도 골라야 한다.', 'C와 D는 함께 고를 수 없다.', 'E를 고르려면 F도 골라야 한다.', '사업은 세 개까지만 고를 수 있다.'], plain=True),
          table(['사업', '비용(억 원)', '효과 점수'], [[k, str(a), str(b)] for k, (a, b) in PRJ.items()], caption='사업별 비용과 효과', num=False)],
 'options': [f'{v}점' for v in opts5v], 'answer': 0,
 'explain': [
  steps(['효과 점수가 큰 C(14점)와 D(13점)는 함께 고를 수 없고, B(12점)를 고르면 A도 골라야 해 비용이 17억 원이나 된다.',
         'C와 E를 고르면 E 때문에 F도 골라야 하지만 C·E·F는 비용 12억 원으로 29점이다. D·E·F는 28점, A·C·F나 A·D·F, B를 포함한 조합은 그보다 작다.',
         '사업이 세 개까지라 C·E·F에 더 넣을 수 없다. 모든 조합을 따지면 29점이 가장 크다.']),
  p('따라서 효과 점수 합은 29점이고 정답은 <b>①</b>이다. 가능한 64가지 조합을 모두 따져 확인하였다. <b>함정</b> B·A 규칙을 빼면 31점(B·C·F), C·D 규칙을 빼면 36점(A·C·D), E·F 규칙을 빼면 33점(A·C·E), 세 개 제한을 빼면 37점(A·D·E·F)이다.')]})
check(max(v for v, s in all5 if 'B' in s) < 29 and sum(PRJ[x][1] for x in 'ACF') < 29 and sum(PRJ[x][1] for x in 'ADF') < 29 and PRJ['A'][0] + PRJ['B'][0] == 17, 'S-BB05 explanation comparisons')

REVIEW = {
 'S-BB01': ('법조문 계산', '상', '2분 30초', '차종별 견인료, 거리 가산의 끝수, 보관료 구간·올림·상한, 현장 감경', '단서·상한·감경 누락', '사람별 견인료 → 보관료 → 감경', '견인료·보관료형, 조문 넷, 새로 설계'),
 'S-BB02': ('경로 계산', '상', '3분', '방향별 시간, 왕복에서 같은 길 피하기', '오르막·내리막 시간 혼동', '오르기·내리기 최단부터 겹침 확인', '등산로형, 새로 설계(모든 길 전수)'),
 'S-BB03': ('법조문 적용', '상', '1분 30초', '크기 단서, 개수 조건, 과태료 면제 기한', '단서 누락', '조문별 대조', '대형 생활폐기물형, 조문 넷, 새로 설계'),
 'S-BB04': ('규칙 추론', '상', '2분 30초', '합 고정, 대각선 조건 부재, 9를 포함한 줄', '마방진으로 착각', '전체 합에서 줄 합 구하기', '3×3 숫자 배치형, 새로 설계(362,880가지 전수)'),
 'S-BB05': ('최적화', '상', '3분', '선행·배타·동반·개수 규칙과 예산', '규칙 하나 누락', '효과 큰 사업의 제약부터', '사업 선정형, 새로 설계(64가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bb.py', 'review/sit-bb.md'), '상황판단 S-BB 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
