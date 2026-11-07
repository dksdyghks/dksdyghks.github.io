# 상황판단 S-BX01..S-BX05 — 5급 실전(심화) 수준 정예 문항: 공공 회의실 대관료(야간 단가·주말 가산·감면 범위), 주차 칸 배정(전수), 전입 신고 규정, 버스 동시 출발(최소공배수), 연수 과목 고르기(63가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, math
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bx.js'

# ---------------------------------------------------------------- S-BX01 공공 회의실 대관료 (법조문 계산)
RS = {'甲': (False, 14, 17, False, True), '乙': (False, 17, 20, True, False), '丙': (True, 10, 12, False, True), '丁': (True, 18, 20, True, True)}   # 주말, 시작, 끝, 비영리, 냉난방
def fee(k, night_all=False, cut_hvac=False, weekend=True, cut=True):
    wkend, s, e, npo, hvac = RS[k]
    night = any(h >= 18 for h in range(s, e))
    base = sum(F(30000) if (h >= 18 or (night_all and night)) else F(20000) for h in range(s, e))
    if weekend and wkend: base *= F(3, 2)
    hv = F(5000) * (e - s) if hvac else F(0)
    if cut and npo:
        base *= F(6, 10)
        if cut_hvac: hv *= F(6, 10)
    return base + hv
each1 = {k: fee(k) for k in RS}
check(each1 == {'甲': 75000, '乙': 48000, '丙': 70000, '丁': 64000}, f'S-BX01 {each1}')
tot1 = lambda **kw: sum(fee(k, **kw) for k in RS)
alts1 = {'정답': tot1(), '야간 단가를 전체 시간에': tot1(night_all=True), '냉난방비까지 감면': tot1(cut_hvac=True), '주말 가산 누락': tot1(weekend=False), '감면 누락': tot1(cut=False)}
check(alts1 == {'정답': 257000, '야간 단가를 전체 시간에': 263000, '냉난방비까지 감면': 253000, '주말 가산 누락': 219000, '감면 누락': 325000}, f'S-BX01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BX01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BX01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낼 회의실 사용료의 합계는?',
 'body': [law('<p><b>제○○조(기본 사용료)</b> 회의실 사용료는 1시간에 20,000원으로 한다. 다만 오후 6시 이후의 사용 시간은 1시간에 30,000원으로 한다.</p>'
              '<p><b>제○○조(주말 가산)</b> 토요일과 일요일에는 제○○조(기본 사용료)에 따른 금액에 그 100분의 50을 더한다.</p>'
              '<p><b>제○○조(감면)</b> 비영리단체가 사용하는 경우에는 제○○조(기본 사용료)와 제○○조(주말 가산)에 따른 금액의 100분의 40을 감면한다.</p>'
              '<p><b>제○○조(냉난방비)</b> 냉난방을 하면 사용 시간 1시간에 5,000원의 냉난방비를 따로 받는다. 냉난방비는 감면하지 아니한다.</p>'),
          box('상황', ['甲(일반): 수요일 오후 2시~5시 사용, 냉난방 함', '乙(비영리단체): 목요일 오후 5시~8시 사용, 냉난방 안 함', '丙(일반): 토요일 오전 10시~낮 12시 사용, 냉난방 함', '丁(비영리단체): 일요일 오후 6시~8시 사용, 냉난방 함'], plain=True)],
 'options': [f'{int(v):,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 20,000 × 3 = 60,000 + 냉난방 15,000 = 75,000원.', '乙: 오후 5~6시 20,000 + 6~8시 30,000 × 2 = 80,000원에서 40% 감면 → 48,000원.', '丙: 20,000 × 2 = 40,000 × 1.5 = 60,000 + 냉난방 10,000 = 70,000원.', '丁: 30,000 × 2 = 60,000 × 1.5 = 90,000에서 40% 감면 → 54,000 + 냉난방 10,000 = 64,000원.']),
  p(f'합계 75,000 + 48,000 + 70,000 + 64,000 = <b>257,000원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 주말 가산을 빠뜨리면 219,000원, 냉난방비까지 감면하면 253,000원, 乙의 3시간 모두에 야간 단가를 매기면 263,000원, 감면을 빠뜨리면 325,000원이다.')]})

# ---------------------------------------------------------------- S-BX02 주차 칸 배정 (전수)
CARS = 'ABC'
PLC = list(itertools.permutations(range(5), 3))       # 차 A·B·C가 차지한 칸(0~4)
apart = lambda p: all(abs(x - y) > 1 for x, y in itertools.combinations(p, 2))
t2 = {'ㄱ': len(PLC) == 60, 'ㄴ': sum(apart(p) for p in PLC) == 3, 'ㄷ': sum(sorted(p) in ([0, 1, 2], [1, 2, 3], [2, 3, 4]) for p in PLC) == 12, 'ㄹ': sum(2 not in p for p in PLC) == 24}
check(t2 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': False, 'ㄹ': True} and sum(apart(p) for p in PLC) == 6 and sum(sorted(p) in ([0, 1, 2], [1, 2, 3], [2, 3, 4]) for p in PLC) == 18, f'S-BX02 {t2}')
check(5 * 4 * 3 == 60 and 1 * 6 == 6 and 3 * 6 == 18 and 4 * 6 == 24, 'S-BX02 explanation arithmetic')
opts2 = ['ㄱ, ㄹ', 'ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BX02')
items.append({
 'id': 'S-BX02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('한 줄로 붙어 있는 주차 칸 1~5번에 서로 다른 차 A, B, C를 한 대씩 세운다. 한 칸에는 한 대만 세울 수 있고, 같은 칸에 세우더라도 어느 차를 세우느냐가 다르면 다른 방법으로 센다.'),
          box('보기', ['ㄱ. 세 대를 세우는 방법은 모두 60가지이다.', 'ㄴ. 어느 두 대도 바로 옆 칸에 세우지 않는 방법은 3가지이다.', 'ㄷ. 세 대를 연달아 붙은 세 칸에 세우는 방법은 12가지이다.', 'ㄹ. 가운데 칸(3번)을 비워 두는 방법은 24가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 5 × 4 × 3 = 60가지.', 'ㄴ: 서로 떨어진 세 칸은 1·3·5번뿐이고, 세 차의 순서 3! = 6가지 → 6가지.', 'ㄷ: 연달아 붙은 세 칸은 1~3, 2~4, 3~5번의 3가지 × 6 = 18가지.', 'ㄹ: 남은 네 칸에서 세 칸을 골라 세우면 4 × 3 × 2 = 24가지.']),
  bx([('ㄱ', '60가지', True, O, '5 × 4 × 3.'), ('ㄴ', '3가지', False, XX, '6가지이다.'), ('ㄷ', '12가지', False, XX, '18가지이다.'), ('ㄹ', '24가지', True, O, '4 × 3 × 2.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 60가지를 모두 나열해 확인하였다. <b>함정</b> 칸을 고른 뒤 세 차의 순서(3!)를 곱하는 것을 빠뜨리지 않는다.')]})

# ---------------------------------------------------------------- S-BX03 전입 신고 (법조문 적용, 옳은 것)
DEADLINE = 14
late_fine = lambda months_late: 0 if months_late <= 0 else 10000 if months_late < 3 else 20000 if months_late < 6 else 30000
def must_pay(months_late, good_reason=False): return late_fine(months_late) if not good_reason else 0
who_may_report = {'세대주', '세대원'}
f3 = [20 <= DEADLINE, '세대원' not in who_may_report, must_pay(4) == 20000, must_pay(2, good_reason=True) > 0, must_pay(7) == 50000]
one_true(f3, 2, 'S-BX03')
check(must_pay(7) == 30000 and must_pay(F(5, 2)) == 10000 and must_pay(3) == 20000, 'S-BX03 boundaries')
O3 = ['이사한 날부터 20일째에 전입 신고를 하여도 기한을 지킨 것이다.', '세대주가 아닌 세대원은 어떤 경우에도 전입 신고를 할 수 없다.', '신고 기한이 지나고 4개월 뒤에 신고한 사람은 20,000원의 과태료를 낸다.',
      '정당한 사유가 있더라도 신고 기한이 지나면 과태료를 내야 한다.', '신고 기한이 지나고 7개월 뒤에 신고한 사람은 50,000원의 과태료를 낸다.']
X3 = [(False, XX, '이사한 날부터 14일 이내에 신고하여야 한다.'), (False, XX, '세대주가 신고하지 않으면 세대원이 신고할 수 있다.'), (True, O, '3개월 이상 6개월 미만 늦으면 20,000원이다.'),
      (False, XX, '정당한 사유가 있으면 과태료를 부과하지 아니한다.'), (False, XX, '6개월 이상 늦으면 30,000원이다.')]
order3 = [0, 1, 3, 4, 2]                                   # 정답(옳은 것)을 ⑤에 둔다
f3o = [f3[i] for i in order3]
one_true(f3o, 4, 'S-BX03 reordered')
items.append({
 'id': 'S-BX03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(전입 신고)</b> ① 새 거주지로 이사한 세대는 이사한 날부터 14일 이내에 전입 신고를 하여야 한다.<br>② 전입 신고는 세대주가 한다. 다만 세대주가 신고하지 아니하면 세대원이 신고할 수 있다.</p>'
              '<p><b>제○○조(과태료)</b> ① 제○○조(전입 신고) 제1항의 기한이 지난 뒤에 신고한 사람에게는 늦은 기간에 따라 다음 과태료를 부과한다.<br>1. 3개월 미만: 10,000원<br>2. 3개월 이상 6개월 미만: 20,000원<br>3. 6개월 이상: 30,000원<br>② 질병이나 재해 등 정당한 사유로 기한을 지키지 못한 경우에는 과태료를 부과하지 아니한다.</p>')],
 'options': [O3[i] for i in order3], 'answer': 4,
 'explain': [
  ox([X3[i] for i in order3]),
  p('따라서 정답은 <b>⑤</b>이다. <b>함정</b> 늦은 기간 구간의 경계(‘이상’·‘미만’)와 단서(세대원 신고, 정당한 사유)를 확인한다.')]})

# ---------------------------------------------------------------- S-BX04 버스 동시 출발 (최소공배수)
A, B, C = 12, 18, 15
lcm = lambda *xs: math.lcm(*xs)
together = [t for t in range(0, 181) if t % A == 0 and t % B == 0]
t4 = {'ㄱ': lcm(A, B) == 36, 'ㄴ': len(together) == 5, 'ㄷ': lcm(A, B, C) == 180, 'ㄹ': len([t for t in range(0, 181) if t % A == 0]) == 15}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False} and together == [0, 36, 72, 108, 144, 180] and len([t for t in range(0, 181) if t % A == 0]) == 16, f'S-BX04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BX04')
items.append({
 'id': 'S-BX04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('한 정류장에서 A 버스는 12분마다, B 버스는 18분마다 출발한다. 두 버스는 오전 6시 정각에 함께 출발했고, 그 뒤로도 늦거나 이르게 출발하는 일 없이 정해진 간격을 지킨다.'),
          box('보기', ['ㄱ. 두 버스가 다음으로 함께 출발하는 시각은 오전 6시 36분이다.', 'ㄴ. 오전 6시부터 오전 9시까지(두 시각 포함) 두 버스가 함께 출발하는 것은 5번이다.', 'ㄷ. 15분마다 출발하는 C 버스도 오전 6시 정각에 함께 출발했다면, 세 버스가 다음으로 모두 함께 출발하는 시각은 오전 9시이다.', 'ㄹ. 오전 6시부터 오전 9시까지(두 시각 포함) A 버스는 15번 출발한다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 12와 18의 최소공배수 36분 → 6시 36분.', 'ㄴ: 180분 동안 36분마다 → 0, 36, 72, 108, 144, 180분의 6번.', 'ㄷ: 12, 18, 15의 최소공배수 180분 → 오전 9시.', 'ㄹ: 0분부터 180분까지 12분마다 → 180 ÷ 12 + 1 = 16번.']),
  bx([('ㄱ', '6시 36분', True, O, '최소공배수 36.'), ('ㄴ', '5번', False, XX, '6번이다.'), ('ㄷ', '오전 9시', True, O, '최소공배수 180.'), ('ㄹ', '15번', False, XX, '16번이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 처음과 끝 시각을 모두 포함하면 횟수는 ‘나눈 몫 + 1’이다.')]})

# ---------------------------------------------------------------- S-BX05 연수 과목 고르기 (63가지 전수, 규칙 모두 필요)
CR = {'A': (4, 10, '수'), 'B': (2, 15, '수'), 'C': (2, 18, '화'), 'D': (3, 15, '월'), 'E': (3, 30, '목'), 'F': (3, 24, '월')}   # 학점, 수강료(만 원), 요일
def plans(r=(1, 1, 1)):
    res = []
    for n in range(1, 7):
        for s in itertools.combinations(CR, n):
            if r[0] and sum(CR[x][0] for x in s) < 9: continue
            if r[1] and len({CR[x][2] for x in s}) < n: continue
            if r[2] and 'D' in s and 'B' not in s: continue
            res.append((sum(CR[x][1] for x in s), s))
    return sorted(res)
PL = plans(); b5 = PL[0][0]
check(b5 == 52 and [s for v, s in PL if v == b5] == [('A', 'C', 'F')], f'S-BX05 {PL[:3]}')
alts5 = [plans(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check([v for v, s in alts5] == [10, 40, 43] and [s for v, s in alts5] == [('A',), ('A', 'B', 'D'), ('A', 'C', 'D')], f'S-BX05 every rule changes the answer {alts5}')
sec5 = sorted({v for v, s in PL})[1]
check(sec5 == 58, f'S-BX05 second {sec5}')
opts5v = sorted([b5, sec5] + [v for v, s in alts5]); check(len(set(opts5v)) == 5, f'S-BX05 {opts5v}')
ans5 = opts5v.index(b5)
check(not any('D' in s for v, s in PL) or all(('B' in s) for v, s in PL if 'D' in s), 'S-BX05 D always with B')
check(not any('A' in s and 'B' in s for v, s in PL), 'S-BX05 explanation: A and B never together (both Wednesday)')
items.append({
 'id': 'S-BX05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 낼 수강료 합계의 최솟값은?',
 'body': [p('甲은 연수 과목 A~F 가운데 몇 과목을 골라 수강하려 한다. 과목마다 학점, 수강료, 수업 요일은 아래와 같고, 각 과목은 일주일에 한 번 그 요일 같은 시간에 수업한다. 甲은 다음 규칙을 모두 지키면서 수강료 합계를 가장 적게 하려 한다.'),
          table(['과목', '학점', '수강료(만 원)', '수업 요일'], [[k, str(a), str(b), c] for k, (a, b, c) in CR.items()], caption='과목별 학점·수강료·요일', num=False),
          box('규칙', ['학점의 합이 9학점 이상이어야 한다.', '같은 요일에 수업하는 과목은 둘 이상 들을 수 없다.', 'D를 들으려면 B도 함께 들어야 한다.'], plain=True)],
 'options': [f'{v}만 원' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['가장 싼 A(4학점, 10만 원)를 넣으면 같은 수요일인 B는 들을 수 없고, B가 없으면 D도 들을 수 없다.', 'A에 더해 5학점 이상을 채워야 하는데, 남은 C(화, 2학점, 18만 원)·E(목, 3학점, 30만 원)·F(월, 3학점, 24만 원) 가운데 가장 싼 조합은 C + F(5학점, 42만 원) → 합계 52만 원.',
         'A를 빼면 B(15)·D(15)를 넣어도 5학점이라 C·E·F에서 4학점 이상을 더 채워야 하므로 52만 원보다 비싸다.', '따라서 최솟값은 <b>52만 원</b>(A, C, F)이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 과목 조합 63가지를 모두 따져 확인하였다. <b>함정</b> 학점 규칙을 빼면 10만 원, 요일 규칙을 빼면 40만 원(A·B·D), D·B 규칙을 빼면 43만 원(A·C·D)이 된다.')]})
check(min(v for v, s in PL if 'A' not in s) > 52, 'S-BX05 explanation: without A it costs more')

REVIEW = {
 'S-BX01': ('법조문 계산', '상', '2분 30초', '시간대별 단가, 주말 가산, 감면 대상과 범위, 냉난방비', '단가 구간·감면 범위 착오', '사람별 기본 → 가산 → 감면 → 냉난방비', '회의실 대관료형, 조문 넷, 새로 설계'),
 'S-BX02': ('경우의 수', '상', '2분', '칸 고르기 × 순서, 떨어진 칸, 연속 칸', '순서(3!) 누락', '칸부터 고르기', '주차 칸형, 새로 설계(전수)'),
 'S-BX03': ('법조문 적용', '상', '1분 30초', '신고 기한, 신고자, 늦은 기간 구간, 면제 사유', '구간 경계 착오', '조문별 대조', '전입 신고형, 조문 둘, 새로 설계'),
 'S-BX04': ('수리 추론', '상', '2분', '최소공배수, 양 끝 포함 횟수', '횟수에서 1 누락', '최소공배수 → 횟수', '버스 출발형, 새로 설계'),
 'S-BX05': ('최적화', '상', '3분', '학점 하한, 요일 배타, 동반 수강', '규칙 하나 누락', '가장 싼 과목부터 고정', '연수 과목형, 새로 설계(63가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bx.py', 'review/sit-bx.md'), '상황판단 S-BX 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
