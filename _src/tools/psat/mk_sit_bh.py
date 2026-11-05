# 상황판단 S-BH01..S-BH05 — 5급 실전(심화) 수준 정예 문항: 소포 요금(부피 무게·지역 추가·묶음 할인의 범위), 막힌 교차로가 있는 최단 경로(전수), 체육관 대관 규정, 맞물린 톱니바퀴 셋, 수강 과목 고르기(63가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, math
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bh.js'

# ---------------------------------------------------------------- S-BH01 소포 요금 (법조문 계산)
BANDS = [(2, 4000), (5, 5000), (10, 6500), (20, 8000)]
SEND = {'甲': [(3, (40, 30, 30), False)], '乙': [(F(3, 2), (20, 20, 10), True)], '丙': [(4, (30, 20, 20), True)] * 3, '丁': [(12, (60, 50, 40), False)]}   # (실제 무게 kg, 가로·세로·높이 cm, 제주 여부)
def base_fee(w): return next(f for lim, f in BANDS if w <= lim)
def fee1(k, vol=True, island=True, disc=True, disc_all=False):
    boxes = SEND[k]; many = disc and len(boxes) >= 3; tot = F(0)
    for w, (a, b, c), isl in boxes:
        aw = max(F(w), F(a * b * c, 6000)) if vol else F(w)
        base = F(base_fee(aw)); extra = 3000 if (island and isl) else 0
        tot += (base + extra) * F(9, 10) if (many and disc_all) else base * (F(9, 10) if many else 1) + extra
    return tot
each1 = {k: fee1(k) for k in SEND}
check(each1 == {'甲': 6500, '乙': 7000, '丙': 22500, '丁': 8000}, f'S-BH01 {each1}')
check(F(40 * 30 * 30, 6000) == 6 and F(60 * 50 * 40, 6000) == 20 and F(30 * 20 * 20, 6000) == 2 and F(20 * 20 * 10, 6000) < F(3, 2), 'S-BH01 volume weights')
tot1 = lambda **kw: int(sum(fee1(k, **kw) for k in SEND))
alts1 = {'정답': tot1(), '부피 무게 누락': tot1(vol=False), '추가 요금까지 할인': tot1(disc_all=True), '할인 누락': tot1(disc=False), '제주 추가 누락': tot1(island=False)}
check(alts1 == {'정답': 44000, '부피 무게 누락': 42500, '추가 요금까지 할인': 43100, '할인 누락': 45500, '제주 추가 누락': 32000}, f'S-BH01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BH01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BH01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낸 소포 요금의 합계는?',
 'body': [law('<p><b>제○○조(기본요금)</b> ① 소포의 기본요금은 적용 무게에 따라 2kg 이하 4,000원, 5kg 이하 5,000원, 10kg 이하 6,500원, 20kg 이하 8,000원으로 한다.<br>② 적용 무게는 실제 무게와 부피 무게(가로·세로·높이를 cm로 재어 곱한 값을 6,000으로 나눈 값, 단위 kg) 가운데 큰 것으로 한다.</p>'
              '<p><b>제○○조(추가 요금)</b> 제주 지역으로 보내는 소포에는 한 개마다 3,000원을 더한다.</p>'
              '<p><b>제○○조(할인)</b> 같은 사람이 같은 날 소포를 3개 이상 보내면 각 소포의 기본요금을 100분의 10 할인한다. 추가 요금은 할인하지 아니한다.</p>'),
          box('상황', ['甲: 실제 무게 3kg, 크기 40×30×30cm인 소포 1개를 서울로 보냈다.', '乙: 실제 무게 1.5kg, 크기 20×20×10cm인 소포 1개를 제주로 보냈다.',
                      '丙: 실제 무게 4kg, 크기 30×20×20cm인 소포 3개를 같은 날 제주로 보냈다.', '丁: 실제 무게 12kg, 크기 60×50×40cm인 소포 1개를 부산으로 보냈다.'], plain=True)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 부피 무게 36,000 ÷ 6,000 = 6kg &gt; 3kg → 적용 6kg → 6,500원.', '乙: 부피 무게 약 0.67kg → 적용 1.5kg → 4,000원 + 제주 3,000원 = 7,000원.',
         '丙: 부피 무게 2kg &lt; 4kg → 5,000원. 3개라 기본요금만 10% 할인 → (4,500 + 3,000) × 3 = 22,500원.', '丁: 부피 무게 120,000 ÷ 6,000 = 20kg → 20kg 이하 구간 8,000원.']),
  p(f'합계 6,500 + 7,000 + 22,500 + 8,000 = <b>44,000원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 부피 무게를 빼면 42,500원, 추가 요금까지 할인하면 43,100원, 할인을 빼면 45,500원, 제주 추가 요금을 빼면 32,000원이다.')]})

# ---------------------------------------------------------------- S-BH02 막힌 교차로가 있는 최단 경로 (전수)
W2, H2, P2, Q2 = 4, 3, (2, 1), (2, 2)
def paths(blocked=()):
    out = []
    for moves in set(itertools.permutations('E' * W2 + 'N' * H2)):
        x = y = 0; pts = [(0, 0)]
        for m in moves: x, y = (x + 1, y) if m == 'E' else (x, y + 1); pts.append((x, y))
        if not any(b in pts for b in blocked): out.append(pts)
    return out
ALL2, OPEN2 = paths(), paths((Q2,))
t2 = {'ㄱ': len(ALL2) == 35, 'ㄴ': sum(P2 in p_ for p_ in ALL2) == 18, 'ㄷ': len(OPEN2) == 18, 'ㄹ': sum(P2 in p_ for p_ in OPEN2) == 9}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and len(OPEN2) == 17, f'S-BH02 {t2} {len(OPEN2)}')
check(math.comb(7, 3) == 35 and math.comb(3, 1) * math.comb(4, 2) == 18 and math.comb(4, 2) * math.comb(3, 1) == 18 and 3 * 1 * 3 == 9, 'S-BH02 explanation counts')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BH02')
items.append({
 'id': 'S-BH02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('바둑판 모양의 도로망에서 甲의 집은 교차로 (0, 0)에, 학교는 동쪽으로 4블록, 북쪽으로 3블록 떨어진 교차로 (4, 3)에 있다. 교차로 (a, b)는 집에서 동쪽으로 a블록, 북쪽으로 b블록 떨어진 곳을 뜻한다. 甲은 동쪽이나 북쪽으로만 한 블록씩 움직여 가장 짧은 길로 학교에 간다. 교차로 P는 (2, 1), 교차로 Q는 (2, 2)이다.'),
          box('보기', ['ㄱ. 집에서 학교까지 가장 짧은 길은 35가지이다.', 'ㄴ. P를 지나는 가장 짧은 길은 18가지이다.', 'ㄷ. Q가 공사로 막혀 지날 수 없다면, 가장 짧은 길은 18가지이다.', 'ㄹ. Q가 막혀 있을 때 P를 지나는 가장 짧은 길은 9가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['동쪽 4번, 북쪽 3번을 늘어놓는 방법: 7C3 = 35가지(ㄱ).', 'P를 지나는 길: (0, 0)→P 3C1 = 3, P→(4, 3) 4C2 = 6 → 18가지(ㄴ).',
         'Q를 지나는 길: (0, 0)→Q 4C2 = 6, Q→(4, 3) 3C1 = 3 → 18가지이므로 Q가 막히면 35 − 18 = 17가지(ㄷ).', 'P와 Q를 모두 지나는 길: 3 × 1 × 3 = 9가지이므로 Q가 막혔을 때 P를 지나는 길은 18 − 9 = 9가지(ㄹ).']),
  bx([('ㄱ', '35가지', True, O, '7C3.'), ('ㄴ', 'P 경유 18가지', True, O, '3 × 6.'), ('ㄷ', 'Q 막힘 18가지', False, XX, '17가지.'), ('ㄹ', 'Q 막힘, P 경유 9가지', True, O, '18 − 9.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 길을 모두 나열해 확인하였다. <b>함정</b> Q를 지나는 길의 수(18)와 Q를 피하는 길의 수(17)를 혼동하지 않는다.')]})

# ---------------------------------------------------------------- S-BH03 체육관 대관 규정 (법조문 적용, 옳은 것)
HOURLY = 20000
def fee3(hours, peak, local, peak_rate=True): return hours * HOURLY * (F(3, 2) if (peak and peak_rate) else 1) * (F(7, 10) if local else 1)
def apply_ok(days_before): return 3 <= days_before <= 30
def refund(days_before): return F(1) if days_before >= 7 else F(1, 2) if days_before >= 3 else F(0)
f3 = [fee3(2, True, True) == 42000, apply_ok(2), fee3(2, False, False) == 60000, refund(5) == 1, fee3(2, True, True) == 28000]
one_true(f3, 0, 'S-BH03')
check(fee3(2, False, False) == 40000 and refund(5) == F(1, 2) and fee3(2, True, True, peak_rate=False) == 28000, 'S-BH03 distractor values')
items.append({
 'id': 'S-BH03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(신청)</b> 체육관을 빌리려는 자는 사용일 30일 전부터 3일 전까지 신청하여야 한다.</p>'
              '<p><b>제○○조(사용료)</b> ① 사용료는 1시간에 2만 원으로 한다.<br>② 평일 오후 6시 이후와 토요일·일요일의 사용료는 제1항의 금액에 100분의 50을 더한다.<br>③ 관내에 주소를 둔 단체에는 제1항과 제2항에 따라 정한 사용료의 100분의 30을 감면한다.</p>'
              '<p><b>제○○조(취소)</b> 사용일 7일 전까지 취소하면 사용료 전액을, 사용일 3일 전까지 취소하면 사용료의 절반을 돌려준다. 그 뒤에 취소하면 돌려주지 아니한다.</p>')],
 'options': ['관내 단체가 토요일 오전에 2시간을 쓰면 사용료는 4만 2천 원이다.', '사용일 2일 전에 신청하여도 체육관을 빌릴 수 있다.', '관외 단체가 평일 오후 2시부터 4시까지 쓰면 사용료는 6만 원이다.',
             '사용일 5일 전에 취소하면 사용료 전액을 돌려받는다.', '관내 단체가 평일 오후 7시부터 2시간을 쓰면 사용료는 2만 8천 원이다.'],
 'answer': 0,
 'explain': [
  ox([(True, O, '2 × 2만 원 = 4만 원에 50%를 더해 6만 원, 30% 감면으로 4만 2천 원이다.'), (False, XX, '사용일 3일 전까지 신청하여야 한다.'), (False, XX, '평일 낮이라 가산이 없어 4만 원이다.'),
      (False, XX, '7일 전까지가 아니므로 절반만 돌려받는다.'), (False, XX, '오후 6시 이후라 50%를 더한 6만 원에서 30% 감면하면 4만 2천 원이다. 2만 8천 원은 가산을 빠뜨린 값이다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> 가산 시간대(오후 6시 이후·주말), 감면의 대상 금액(가산 뒤 금액), 신청·취소 기한의 경계를 확인한다.')]})

# ---------------------------------------------------------------- S-BH04 맞물린 톱니바퀴 셋 (수리 추론)
TEETH = {'A': 12, 'B': 18, 'C': 30}
def turns(src, n, dst): return F(TEETH[src] * n, TEETH[dst])
direction = {'A': '시계', 'B': '반시계', 'C': '시계'}                 # A–B, B–C가 맞물리면 이웃끼리 반대로 돈다
first_all = next(k for k in range(1, 1000) if all(turns('A', k, x).denominator == 1 for x in TEETH))
t4 = {'ㄱ': direction['C'] == '시계', 'ㄴ': turns('A', 15, 'C') == 6, 'ㄷ': first_all == 15, 'ㄹ': turns('B', 4, 'C') == F(5, 2)}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and turns('B', 4, 'C') == F(12, 5) and math.lcm(12, 18, 30) == 180, f'S-BH04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄷ, ㄹ', 'ㄱ, ㄴ, ㄷ']; ans4 = combo(t4, opts4, 'S-BH04')
items.append({
 'id': 'S-BH04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('톱니 수가 각각 12개, 18개, 30개인 톱니바퀴 A, B, C가 있다. A와 B가 맞물려 있고, B와 C가 맞물려 있으며, A와 C는 직접 맞물려 있지 않다. 맞물린 두 톱니바퀴는 서로 반대 방향으로 돌고, 한쪽 톱니가 지나간 개수만큼 다른 쪽 톱니도 지나간다. 처음에 세 톱니바퀴에는 각각 표시가 하나씩 되어 있다. 甲은 A를 시계 방향으로 돌린다.'),
          box('보기', ['ㄱ. C는 시계 방향으로 돈다.', 'ㄴ. A가 15바퀴 돌면 C는 6바퀴 돈다.', 'ㄷ. 세 톱니바퀴의 표시가 모두 처음 자리로 함께 돌아오려면 A는 적어도 15바퀴 돌아야 한다.', 'ㄹ. B가 4바퀴 돌면 C는 2바퀴 반 돈다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['방향: A 시계 → B 반시계 → C 시계(ㄱ).', 'A가 15바퀴 돌면 톱니 12 × 15 = 180개가 지나가므로 C는 180 ÷ 30 = 6바퀴(ㄴ).',
         '세 바퀴가 모두 정수 바퀴를 돌려면 지나간 톱니 수가 12, 18, 30의 공배수여야 하고, 가장 작은 것은 180이다. 따라서 A는 적어도 180 ÷ 12 = 15바퀴(ㄷ).', 'B가 4바퀴 돌면 톱니 72개 → C는 72 ÷ 30 = 2.4바퀴이다(ㄹ).']),
  bx([('ㄱ', 'C 시계 방향', True, O, '이웃끼리 반대.'), ('ㄴ', 'C 6바퀴', True, O, '180 ÷ 30.'), ('ㄷ', 'A 15바퀴', True, O, '최소공배수 180.'), ('ㄹ', '2바퀴 반', False, XX, '2.4바퀴.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다.')]})

# ---------------------------------------------------------------- S-BH05 수강 과목 고르기 (63가지 전수, 규칙 모두 필요)
CRS = {'A': (1, 4, '수요일 1교시'), 'B': (1, 1, '목요일 1교시'), 'C': (2, 1, '수요일 1교시'), 'D': (3, 2, '월요일 1교시'), 'E': (1, 2, '화요일 1교시'), 'F': (3, 4, '화요일 1교시')}   # 학점, 주당 시간, 시간대
CAP = 8
def best5(r=(1, 1, 1)):
    res = []
    for k in range(1, 7):
        for s in itertools.combinations(CRS, k):
            if r[0] and len({CRS[x][2] for x in s}) < k: continue
            if r[1] and 'D' in s and 'A' not in s: continue
            if r[2] and sum(CRS[x][1] for x in s) > CAP: continue
            res.append((sum(CRS[x][0] for x in s), s))
    m = max(c for c, _ in res); return m, [s for c, s in res if c == m], res
b5, a5, all5 = best5()
check(b5 == 6 and a5 == [('B', 'C', 'F')], f'S-BH05 {b5} {a5}')
alts5 = [best5(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check(alts5 == [7, 9, 8], f'S-BH05 every rule changes the answer {alts5}')
withD = max(c for c, s in all5 if 'D' in s)
check(withD == 5, f'S-BH05 best plan with D {withD}')
opts5v = sorted({b5, withD, *alts5}); check(len(opts5v) == 5, f'S-BH05 options {opts5v}')
ans5 = opts5v.index(b5)
items.append({
 'id': 'S-BH05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 이번 학기에 얻을 수 있는 학점의 최댓값은?',
 'body': [p('甲은 이번 학기에 과목 A~F 가운데 몇 과목을 들으려 한다. 과목마다 학점, 주당 수업 시간, 수업 시간대는 아래와 같고, 다음 규칙을 모두 지켜야 한다.'),
          table(['과목', '학점', '주당 수업 시간', '시간대'], [[k, str(a), f'{b}시간', c] for k, (a, b, c) in CRS.items()], caption='과목별 학점과 시간', num=False),
          box('규칙', ['시간대가 같은 과목은 함께 들을 수 없다.', 'D는 A를 함께 들을 때에만 들을 수 있다.', '주당 수업 시간의 합은 8시간을 넘을 수 없다.'], plain=True)],
 'options': [f'{v}학점' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['D를 듣는다면 A도 들어야 해 6시간·4학점이 되고, 남은 2시간으로는 A와 시간대가 겹치는 C는 안 되며 B(1시간·1학점)나 E(2시간·1학점) 가운데 하나만 더할 수 있어 5학점이 최대이다.',
         'D를 듣지 않는다면 학점이 높은 F(3학점·4시간)와 C(2학점·1시간)를 듣고, 남은 3시간에 B(1학점)를 더해 6학점이 된다. A는 C와, E는 F와 시간대가 겹친다.',
         '따라서 최댓값은 <b>6학점</b>(B, C, F)이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 과목 조합 63가지를 모두 따져 확인하였다. <b>함정</b> 시간대 규칙을 빼면 7학점, D의 조건을 빼면 9학점, 시간 제한을 빼면 8학점이 된다.')]})
check(max(c for c, s in all5 if 'D' not in s) == 6 and ('A', 'B', 'D') in [s for c, s in all5 if c == 5] and ('A', 'D', 'E') in [s for c, s in all5 if c == 5], 'S-BH05 explanation cases')

REVIEW = {
 'S-BH01': ('법조문 계산', '상', '2분 30초', '부피 무게, 구간 경계, 지역 추가, 할인 범위', '부피 무게·할인 범위 누락', '소포마다 적용 무게 → 기본요금 → 할인 → 추가', '소포 요금형, 조문 셋, 새로 설계'),
 'S-BH02': ('경우의 수', '상', '2분', '최단 경로 조합, 경유·회피, 포함·배제', '경유와 회피 혼동', '구간별 조합 곱', '격자 최단 경로형, 새로 설계(전수)'),
 'S-BH03': ('법조문 적용', '상', '1분 30초', '가산 시간대, 감면 대상 금액, 신청·취소 기한', '가산·기한 경계 착오', '조문별 대조', '체육관 대관형, 조문 셋, 새로 설계'),
 'S-BH04': ('수리 추론', '상', '2분', '맞물림 방향, 톱니 수 비, 최소공배수', '바퀴 수 비를 거꾸로', '지나간 톱니 수로 통일', '톱니바퀴형, 새로 설계'),
 'S-BH05': ('최적화', '상', '3분', '동반 조건, 시간대 충돌, 시간 상한', '규칙 하나 누락', 'D를 들을 때와 안 들을 때로 나누기', '수강 계획형, 새로 설계(63가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bh.py', 'review/sit-bh.md'), '상황판단 S-BH 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
