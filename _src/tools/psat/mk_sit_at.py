# 상황판단 S-AT01..S-AT05 — 5급 실전(심화) 수준 정예 문항: 구직급여(조문 셋과 단서·상한·하한), 주사위 굴리기(108가지 상태 전수 탐색), 자동차 정기검사 규정, 숫자 4를 뺀 층 번호(전수 계산), 식품 구매 최소 비용(구매량 전수, 조건 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from collections import deque
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-at.js'

# ---------------------------------------------------------------- S-AT01 구직급여 (법조문 계산, 조문 셋과 단서·상한·하한)
PPL = {'甲': (100000, 2, 45, '계약 기간 만료'), '乙': (150000, 5, 52, '개인 사정으로 스스로 이직'), '丙': (80000, 4, 55, '사업장 이전으로 통근 왕복 3시간 30분이 되어 스스로 이직'), '丁': (120000, F(7, 2), 40, '경영 악화로 해고'), '戊': (130000, F(5, 6), 51, '계약 기간 만료')}
QUAL = {'甲': True, '乙': False, '丙': 'proviso', '丁': True, '戊': True}
def benefit(k, proviso=True, cap=True, floor=True, age=True, self_quit=True):
    wage, yrs, ag, _ = PPL[k]
    q = QUAL[k]
    if q == 'proviso' and not proviso: return 0
    if q is False and self_quit: return 0
    day = F(wage * 60, 100)
    if cap and day > 66000: day = F(66000)
    if floor and day < 60000: day = F(60000)
    days = 120 if yrs < 1 else 150 if yrs < 3 else 180
    if age and ag >= 50: days += 30
    return int(day * days)
B1 = {k: benefit(k) for k in PPL}
check(B1 == {'甲': 9000000, '乙': 0, '丙': 12600000, '丁': 11880000, '戊': 9900000}, f'S-AT01 {B1}')
unique_max(B1, 'S-AT01')
top = lambda **kw: max(PPL, key=lambda k: benefit(k, **kw))
check(top() == '丙' and top(proviso=False) == '丁' and top(floor=False) == '丁' and top(age=False) == '丁' and top(self_quit=False) == '乙', 'S-AT01 every rule changes the answer')
opts1 = ['甲', '乙', '丙', '丁', '戊']
items.append({
 'id': 'S-AT01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~戊 가운데 받을 수 있는 구직급여 총액이 가장 많은 사람은?',
 'body': [law('<p><b>제○○조(수급 자격)</b> 구직급여는 근로자가 자기 뜻과 관계없이 이직한 경우에 지급한다. 다만 다음 각 호의 어느 하나에 해당하여 스스로 이직한 경우에는 자기 뜻과 관계없이 이직한 것으로 본다.<br>1. 임금이 2개월 이상 체불된 경우<br>2. 사업장 이전 등으로 통근 시간이 왕복 3시간 이상이 된 경우</p>'
              '<p><b>제○○조(1일 지급액)</b> 구직급여의 1일 지급액은 이직 전 1일 평균임금의 100분의 60으로 한다. 다만 그 금액이 66,000원을 넘으면 66,000원으로 하고, 60,000원에 못 미치면 60,000원으로 한다.</p>'
              '<p><b>제○○조(지급 일수)</b> 구직급여의 지급 일수는 고용보험 가입 기간이 1년 미만이면 120일, 1년 이상 3년 미만이면 150일, 3년 이상이면 180일로 한다. 다만 이직일 현재 50세 이상인 사람은 각각 30일을 더한다.</p>'),
          table(['이직자', '1일 평균임금', '가입 기간', '나이', '이직 사유'], [[k, f'{w:,}원', ('10개월' if y < 1 else f'{int(y)}년' + (' 6개월' if y != int(y) else '')), f'{a}세', r] for k, (w, y, a, r) in PPL.items()], caption='이직자 현황', num=False)],
 'options': opts1, 'answer': opts1.index(top()),
 'explain': [
  steps(['甲: 100,000 × 0.6 = 60,000원 × 150일 = 900만 원.', '乙: 개인 사정으로 스스로 이직하여 단서에 해당하지 않으므로 받을 수 없다.', '丙: 통근 왕복 3시간 이상(단서 제2호) → 수급 자격 있음. 48,000원 → 하한 60,000원 × (180 + 30)일 = 1,260만 원.',
         '丁: 72,000원 → 상한 66,000원 × 180일 = 1,188만 원.', '戊: 78,000원 → 상한 66,000원 × (120 + 30)일 = 990만 원.']),
  p(f'따라서 가장 많은 사람은 丙이고 정답은 <b>{CIRC[opts1.index(top())]}</b>이다. <b>함정</b> 丙의 통근 단서, 하한, 50세 이상 가산 가운데 하나라도 놓치면 丁(1,188만 원)을 고르게 되고, 乙의 이직 사유를 놓치면 乙(1,386만 원)을 고르게 된다.')]})
check(F(100000 * 60, 100) == 60000 and benefit('乙', self_quit=False) == 13860000, 'S-AT01 explanation numbers')

# ---------------------------------------------------------------- S-AT02 주사위 굴리기 (108가지 상태 전수 탐색)
def roll(s):
    r, c, t, f, e = s       # 행, 열, 윗면, 남쪽(아래쪽) 면, 동쪽(오른쪽) 면
    if c < 2: yield (r, c + 1, 7 - e, f, t)
    if c > 0: yield (r, c - 1, e, f, 7 - t)
    if r < 2: yield (r + 1, c, 7 - f, t, e)
    if r > 0: yield (r - 1, c, f, 7 - t, e)
S0 = (0, 0, 1, 2, 3)
DIST = {S0: 0}; q = deque([S0])
while q:
    s = q.popleft()
    for t in roll(s):
        if t not in DIST: DIST[t] = DIST[s] + 1; q.append(t)
def after(n):
    cur = {S0}
    for _ in range(n): cur = {t for s in cur for t in roll(s)}
    return cur
mind = lambda cell, top_: min(d for s, d in DIST.items() if s[:2] == cell and s[2] == top_)
br4 = sorted({s[2] for s in after(4) if s[:2] == (2, 2)})
t2 = {'ㄱ': br4 == [1, 2, 3, 6], 'ㄴ': mind((2, 2), 4) == 6, 'ㄷ': mind((0, 0), 6) <= 4, 'ㄹ': len({s[2] for s in after(2) if s[:2] == (1, 1)}) == 1}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and len(DIST) == 108 and mind((0, 0), 6) == 6, f'S-AT02 {t2}')
check(all((d - s[0] - s[1]) % 2 == 0 for s, d in DIST.items()), 'S-AT02 explanation: number of rolls has the parity of the cell')
ORD = {}
for od in sorted(set(itertools.permutations('RRDD'))):
    s = S0
    for m in od:
        s = [t for t in roll(s) if (t[1] == s[1] + 1 if m == 'R' else t[0] == s[0] + 1)][0]
    ORD[''.join(od)] = s[2]
check(sorted(set(ORD.values())) == br4 and len(ORD) == 6, f'S-AT02 explanation orders {ORD}')
c2 = sorted({s[2] for s in after(2) if s[:2] == (1, 1)})
rd = [s for s in roll(S0) if s[1] == 1][0]; rd = [t for t in roll(rd) if t[0] == 1][0]
dr = [s for s in roll(S0) if s[0] == 1][0]; dr = [t for t in roll(dr) if t[1] == 1][0]
check(rd[2] != dr[2] and sorted([rd[2], dr[2]]) == c2, 'S-AT02 ㄹ orders differ')
opts2 = ['ㄱ', 'ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ']; ans2 = combo(t2, opts2, 'S-AT02')
kor = {'R': '오른쪽', 'D': '아래쪽'}
items.append({
 'id': 'S-AT02', 'type': '상황판단 · 규칙 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('가로 3칸, 세로 3칸의 판 왼쪽 위 칸에 주사위를 놓았다. 주사위는 마주 보는 두 면의 눈의 합이 7이며, 처음에 윗면은 1, 아래쪽(판의 아래 방향)을 향한 면은 2, 오른쪽을 향한 면은 3이다. 주사위는 한 번에 한 칸씩 위·아래·왼쪽·오른쪽 가운데 한 방향으로 모서리를 축으로 굴려 옮기며, 판 밖으로는 굴릴 수 없다. 예를 들어 처음 상태에서 오른쪽으로 한 번 굴리면 왼쪽을 향하던 4가 윗면이 된다.'),
          box('보기', ['ㄱ. 4번 굴려 오른쪽 아래 칸에 도착했을 때 윗면의 눈은 1, 2, 3, 6 가운데 하나이다.', 'ㄴ. 윗면이 4인 채로 오른쪽 아래 칸에 도착하려면 적어도 6번 굴려야 한다.', 'ㄷ. 처음 칸으로 돌아오면서 윗면이 6이 되게 하는 것은 4번 이하로 굴려서도 할 수 있다.', 'ㄹ. 2번 굴려 가운데 칸에 도착하면 윗면의 눈은 굴리는 순서와 관계없이 같다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['칸을 바둑판처럼 두 색으로 칠하면 한 번 굴릴 때마다 색이 바뀐다. 오른쪽 아래 칸과 처음 칸은 처음 칸과 같은 색이므로, 이 두 칸에 도착할 때까지 굴린 횟수는 늘 짝수이다.',
         'ㄱ: 4번 만에 가려면 오른쪽 2번, 아래쪽 2번을 어떤 순서로 하는 여섯 가지뿐이다. 이를 모두 굴려 보면 윗면은 ' + ', '.join(f"{'→'.join(kor[m] for m in od)} {v}" for od, v in ORD.items()) + '이다.',
         'ㄴ: ㄱ에서 4번 만에는 4가 나오지 않으므로 다음 짝수인 6번이 필요하고, 실제로 6번에 가능하다.', 'ㄷ: 2번(갔다 오기)이면 윗면이 다시 1이고, 4번 이하의 어떤 방법으로도 6이 되지 않는다(최소 6번).',
         f'ㄹ: 오른쪽 → 아래쪽이면 윗면이 {rd[2]}, 아래쪽 → 오른쪽이면 {dr[2]}로 순서에 따라 다르다.']),
  bx([('ㄱ', '1, 2, 3, 6', True, O, '여섯 가지 순서를 모두 굴려 본 결과이다.'), ('ㄴ', '적어도 6번', True, O, '횟수는 짝수이고 4번으로는 안 된다.'), ('ㄷ', '4번 이하', False, XX, '최소 6번이 필요하다.'), ('ㄹ', '순서와 무관', False, XX, f'{c2[0]} 또는 {c2[1]}로 달라진다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 주사위가 놓일 수 있는 108가지 상태(칸 × 방향)를 모두 탐색하여 확인하였다.')]})
check([s for s in roll(S0) if s[1] == 1][0][2] == 4, 'S-AT02 example in rules')

# ---------------------------------------------------------------- S-AT03 자동차 정기검사 (법조문 적용, 조문 넷, 옳은 것)
def fine(late):
    if late <= 0: return 0
    v = 2 if late <= 30 else 2 + (late - 30) // 3
    return min(v, 30)
first_term = lambda biz: 2 if biz else 4
in_window = lambda days_before: days_before <= 31
abroad_ok = lambda applied_in_window: applied_in_window
f3 = [fine(60) == 12, first_term(True) == 4, abroad_ok(False), fine(120) == 32, in_window(40)]
one_true(f3, 0, 'S-AT03')
check(fine(120) == 30 and 2 + (120 - 30) // 3 == 32, 'S-AT03 cap trap')
items.append({
 'id': 'S-AT03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(검사 기간)</b> 자동차 소유자는 검사 유효기간이 끝나는 날의 전후 각각 31일 이내(이하 ‘검사 기간’이라 한다)에 정기검사를 받아야 한다.</p>'
              '<p><b>제○○조(유효기간)</b> 정기검사의 유효기간은 다음 각 호와 같다. 다만 신규 등록한 자동차의 첫 유효기간은 비사업용 승용차는 4년, 사업용 승용차는 2년으로 한다.<br>1. 비사업용 승용차: 2년<br>2. 사업용 승용차: 1년</p>'
              '<p><b>제○○조(기간 연장)</b> 천재지변, 도난, 사고로 인한 수리, 해외 체류 등 부득이한 사유가 있으면 검사 기간을 연장할 수 있다. 다만 해외 체류를 사유로 하는 경우에는 검사 기간 안에 연장을 신청한 경우에만 연장할 수 있다.</p>'
              '<p><b>제○○조(과태료)</b> 검사 기간이 끝난 뒤에 정기검사를 받은 소유자에게는 다음 각 호의 과태료를 부과한다. 다만 과태료는 30만 원을 넘을 수 없다.<br>1. 검사 기간이 끝난 날부터 30일 이내: 2만 원<br>2. 30일을 넘은 경우: 2만 원에 30일을 넘은 3일마다 1만 원을 더한 금액</p>')],
 'options': ['검사 기간이 끝난 날부터 60일이 지나 정기검사를 받은 소유자의 과태료는 12만 원이다.', '신규 등록한 사업용 승용차는 4년 뒤에 첫 정기검사를 받는다.', '해외에 머무는 소유자는 검사 기간이 끝난 뒤에도 해외 체류를 사유로 검사 기간 연장을 신청할 수 있다.',
             '검사 기간이 끝난 날부터 120일이 지나 정기검사를 받은 소유자의 과태료는 32만 원이다.', '검사 유효기간이 끝나는 날의 40일 전에 받은 정기검사는 검사 기간 안에 받은 것이다.'],
 'answer': 0,
 'explain': [
  ox([(True, O, '30일을 넘은 30일 → 3일마다 1만 원 × 10 = 10만 원, 2만 원을 더해 12만 원.'), (False, XX, '제2조 단서: 사업용 승용차의 첫 유효기간은 2년이다.'), (False, XX, '제3조 단서: 해외 체류는 검사 기간 안에 신청해야 한다.'),
      (False, XX, '2 + 30 = 32만 원이지만 상한 30만 원이 적용된다.'), (False, XX, '끝나는 날 전 31일 이내만 검사 기간이다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> ④는 단서(상한)를, ③은 연장 사유별 단서를 놓치기 쉽다.')]})

# ---------------------------------------------------------------- S-AT04 숫자 4를 뺀 층 번호 (전수 계산)
LAB = [x for x in range(1, 1000) if '4' not in str(x)]
real_of = lambda lab: LAB.index(lab) + 1
t4 = {'ㄱ': LAB[29] == 33, 'ㄴ': real_of(50) == 36, 'ㄷ': LAB[39] == 52, 'ㄹ': len([x for x in LAB if x <= 100]) == 81}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and LAB[39] == 55, f'S-AT04 {t4}')
check(len([x for x in range(1, 51) if '4' in str(x)]) == 14 and len([x for x in range(1, 100) if '4' not in str(x)]) == 9 * 9 - 1, 'S-AT04 explanation counts')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄹ', 'ㄴ, ㄷ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ']; ans4 = combo(t4, opts4, 'S-AT04')
items.append({
 'id': 'S-AT04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('지상 40층인 甲건물은 승강기와 안내판에 층을 표시할 때 숫자 4가 들어간 번호는 쓰지 않는다. 1층부터 위로 올라가며 4가 들어가지 않는 자연수를 작은 것부터 차례로 붙이므로, 실제 1~3번째 층은 1~3층, 실제 4번째 층은 5층으로 표시되고, 13층 다음 층은 15층으로 표시된다. 지하층은 없다.'),
          box('보기', ['ㄱ. 실제 30번째 층은 33층으로 표시된다.', 'ㄴ. 50층으로 표시되는 층은 실제 36번째 층이다.', 'ㄷ. 맨 위층은 52층으로 표시된다.', 'ㄹ. 이 방식으로 층 표시에 쓸 수 있는 100 이하의 자연수는 81개이다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄴ: 1~50 가운데 4가 들어간 수는 4, 14, 24, 34와 40~49의 열 개로 14개이므로, 50은 50 − 14 = 36번째 표시 번호이다.', 'ㄱ: 1~33 가운데 4가 들어간 수는 4, 14, 24의 3개이므로 33은 30번째이다.',
         'ㄷ: 40번째 표시 번호는 36번째인 50 다음으로 51, 52, 53, 55이므로 55층이다.', 'ㄹ: 1~99는 십의 자리와 일의 자리에 4를 뺀 9가지씩 쓸 수 있어 9 × 9 − 1(00) = 80개이고, 100을 더해 81개이다.']),
  bx([('ㄱ', '30번째 → 33', True, O, '4가 든 수 3개.'), ('ㄴ', '50 → 36번째', True, O, '4가 든 수 14개.'), ('ㄷ', '맨 위층 52', False, XX, '55층이다.'), ('ㄹ', '81개', True, O, '80 + 1.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 40~49의 열 개를 하나로 세면 ㄴ과 ㄷ을 틀리게 계산한다.')]})
check(LAB[35:40] == [50, 51, 52, 53, 55], 'S-AT04 explanation ㄷ sequence')

# ---------------------------------------------------------------- S-AT05 식품 구매 최소 비용 (구매량 전수, 조건 모두 필요)
FOOD = {'A': (5000, 4, 1), 'B': (3000, 2, 6), 'C': (2000, 4, 1)}      # 가격, 단백질, 비타민(단위)
def best5(prot=20, vit=20, cmax=1, top=21):
    bestc, arg = None, []
    for qa, qb, qc in itertools.product(range(top), repeat=3):
        if cmax is not None and qc > cmax: continue
        if 4 * qa + 2 * qb + 4 * qc < prot or qa + 6 * qb + qc < vit: continue
        c = 5000 * qa + 3000 * qb + 2000 * qc
        if bestc is None or c < bestc: bestc, arg = c, [(qa, qb, qc)]
        elif c == bestc: arg.append((qa, qb, qc))
    return bestc, arg
b5, a5 = best5()
check((b5, a5) == (24000, [(2, 4, 1)]) and best5(cmax=None)[0] == 17000 and best5(prot=0)[0] == 12000 and best5(vit=0)[0] == 22000, f'S-AT05 {b5} {a5}')
check(best5(cmax=0)[0] == 27000 and best5(cmax=0)[1] == [(3, 4, 0)], 'S-AT05 explanation: without C the best is 27,000')
check(all(FOOD[k][1:] == v for k, v in {'A': (4, 1), 'B': (2, 6), 'C': (4, 1)}.items()), 'S-AT05 data')
opts5 = ['17,000원', '20,000원', '22,000원', '24,000원', '26,000원']
check([int(o[:-1].replace(',', '')) for o in opts5].index(b5) == 3, 'S-AT05 options')
items.append({
 'id': 'S-AT05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 조건을 모두 만족하도록 식품을 사는 데 드는 최소 비용은?',
 'body': [p('甲은 일주일 동안 먹을 식품 A, B, C를 사려 한다. 식품은 한 봉지 단위로만 살 수 있고, 산 식품에 든 단백질의 합은 20단위 이상, 비타민의 합은 20단위 이상이어야 한다. C는 보관 기간이 짧아 한 봉지까지만 살 수 있다.'),
          table(['식품', '1봉지 가격', '단백질', '비타민'], [[k, f'{v[0]:,}원', f'{v[1]}단위', f'{v[2]}단위'] for k, v in FOOD.items()], caption='식품별 가격과 영양소', num=False)],
 'options': opts5, 'answer': 3,
 'explain': [
  steps(['C는 A와 단백질·비타민이 같으면서 값이 싸므로 1봉지를 사는 것이 유리하다. 그러면 A와 B로 단백질 16단위 이상, 비타민 19단위 이상을 채우면 된다.',
         'A 2봉지·B 4봉지: 단백질 8 + 8 = 16, 비타민 2 + 24 = 26 → 10,000 + 12,000 + 2,000 = 24,000원. A를 1봉지로 줄이면 B가 6봉지 필요해 25,000원, A 3봉지면 B 3봉지(비타민)가 필요해 26,000원이다.', 'C를 사지 않으면 A 3봉지·B 4봉지의 27,000원이 가장 싸다.']),
  p('따라서 최소 비용은 24,000원이고 정답은 <b>④</b>이다. 구매량의 모든 조합을 따져 이 조합 하나뿐임을 확인하였다. <b>함정</b> C의 구매 한도를 빼면 17,000원, 비타민 조건을 빼면 22,000원, 단백질 조건을 빼면 12,000원이 된다.')]})
check(min(5000 * a + 3000 * b + 2000 for a in range(21) for b in range(21) if a == 1 and 4 * a + 2 * b + 4 >= 20 and a + 6 * b + 1 >= 20) == 25000 and min(5000 * a + 3000 * b + 2000 for a in range(21) for b in range(21) if a == 3 and 4 * a + 2 * b + 4 >= 20 and a + 6 * b + 1 >= 20) == 26000, 'S-AT05 explanation alternatives')

REVIEW = {
 'S-AT01': ('법조문 계산', '상', '3분', '수급 자격 단서, 1일 지급액 상한·하한, 가입 기간·나이별 지급 일수', '단서·하한·가산 누락', '자격 → 1일액 → 일수', '구직급여형, 조문 셋, 새로 설계(규칙마다 답이 바뀜)'),
 'S-AT02': ('규칙 추론', '상', '3분', '주사위 굴리기의 면 변화, 칸 색의 홀짝', '굴리는 방향별 면 변화 혼동', '칸 색으로 횟수 홀짝 정하기', '주사위 굴리기형, 새로 설계(108가지 상태 전수 탐색)'),
 'S-AT03': ('법조문 적용', '상', '1분 30초', '검사 기간, 첫 유효기간 단서, 연장 단서, 과태료 계산과 상한', '상한·단서 누락', '조문별 대조', '자동차 정기검사형, 조문 넷, 새로 설계'),
 'S-AT04': ('수리 추론', '상', '2분', '특정 숫자를 뺀 번호 체계의 순번 계산', '40~49 누락', '4가 든 수 세기', '층 번호형, 새로 설계(전수 계산)'),
 'S-AT05': ('최적화', '상', '2분 30초', '두 영양 조건과 구매 한도 아래 최소 비용', '구매 한도 누락', '싼 대체재부터 고정', '식품 구매형, 새로 설계(구매량 전수, 조건 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_at.py', 'review/sit-at.md'), '상황판단 S-AT 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
