# 상황판단 S-BS01..S-BS05 — 5급 실전(심화) 수준 정예 문항: 과태료 감경(위반 차수·감경 중복 금지), 대표단 뽑기(전수), 주택 임대차 갱신 규정, 할인과 쿠폰의 순서, 과제 처리 순서(마감·선행·총시간, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bs.js'

# ---------------------------------------------------------------- S-BS01 과태료 감경 (법조문 계산)
BASE = {1: 20, 2: 40, 3: 80}                                   # 위반 차수별 과태료(만 원), 3차 이상은 80
PEOPLE = {'甲': (2, True, False), '乙': (1, True, True), '丙': (3, False, True), '丁': (4, False, False)}   # 위반 차수, 자진 납부, 기초생활수급자
def fine(k, self_cut=True, poor_cut=True, stack=None):
    n, self_pay, poor = PEOPLE[k]
    base = F(BASE[min(n, 3)])
    cuts = [F(20, 100)] * (self_pay and self_cut) + [F(50, 100)] * (poor and poor_cut)
    if not cuts: return base
    if stack == 'mul': return base * eval_prod([1 - c for c in cuts])
    if stack == 'add': return base * (1 - sum(cuts))
    return base * (1 - max(cuts))
def eval_prod(xs):
    out = F(1)
    for x in xs: out *= x
    return out
each1 = {k: fine(k) for k in PEOPLE}
check(each1 == {'甲': 32, '乙': 10, '丙': 40, '丁': 80}, f'S-BS01 {each1}')
tot1 = lambda **kw: sum(fine(k, **kw) for k in PEOPLE)
alts1 = {'정답': tot1(), '감경 곱하기': tot1(stack='mul'), '감경 더하기': tot1(stack='add'), '자진 납부 감경 누락': tot1(self_cut=False), '수급자 감경 누락': tot1(poor_cut=False)}
check(alts1 == {'정답': 162, '감경 곱하기': 160, '감경 더하기': 158, '자진 납부 감경 누락': 170, '수급자 감경 누락': 208}, f'S-BS01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BS01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BS01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낼 과태료의 합계는?',
 'body': [law('<p><b>제○○조(과태료)</b> 이 법을 위반한 사람에게는 다음 금액의 과태료를 부과한다.<br>1. 1차 위반: 20만 원<br>2. 2차 위반: 40만 원<br>3. 3차 이상 위반: 80만 원</p>'
              '<p><b>제○○조(감경)</b> ① 다음 각 호의 어느 하나에 해당하는 사람에게는 과태료를 감경한다.<br>1. 의견 제출 기간 안에 과태료를 자진하여 내는 사람: 100분의 20<br>2. 「국민기초생활 보장법」에 따른 수급자: 100분의 50<br>② 제1항 각 호에 함께 해당하는 경우에는 감경 비율이 가장 큰 것 하나만 적용한다.</p>'),
          box('상황', ['甲: 2차 위반, 의견 제출 기간 안에 자진 납부', '乙(수급자): 1차 위반, 의견 제출 기간 안에 자진 납부', '丙(수급자): 3차 위반', '丁: 4차 위반'], plain=True)],
 'options': [f'{v}만 원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 40만 원에서 자진 납부 20% 감경 → 32만 원.', '乙: 20만 원. 자진 납부(20%)와 수급자(50%)에 함께 해당하므로 큰 것 하나만 적용해 50% 감경 → 10만 원.', '丙: 80만 원에서 수급자 50% 감경 → 40만 원.', '丁: 4차도 ‘3차 이상’이므로 80만 원.']),
  p(f'합계 32 + 10 + 40 + 80 = <b>162만 원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 乙에게 두 감경을 차례로 곱하면 160만 원, 더해서 70%를 감경하면 158만 원, 자진 납부 감경을 빠뜨리면 170만 원, 수급자 감경을 빠뜨리면 208만 원이다.')]})

# ---------------------------------------------------------------- S-BS02 대표단 뽑기 (전수)
MEN, WOMEN = ['갑', '을', '병', '정'], ['무', '기', '경']
TEAMS = list(itertools.combinations(MEN + WOMEN, 3))
t2 = {'ㄱ': len(TEAMS) == 35, 'ㄴ': sum(any(x in WOMEN for x in t) for t in TEAMS) == 32, 'ㄷ': sum(not ('갑' in t and '을' in t) for t in TEAMS) == 30, 'ㄹ': sum(any(x in WOMEN for x in t) and any(x in MEN for x in t) for t in TEAMS) == 31}
check(t2 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False} and sum(any(x in WOMEN for x in t) for t in TEAMS) == 31 and sum(any(x in WOMEN for x in t) and any(x in MEN for x in t) for t in TEAMS) == 30, f'S-BS02 {t2}')
check(7 * 6 * 5 // 6 == 35 and 35 - 4 == 31 and 35 - 5 == 30 and 35 - 4 - 1 == 30, 'S-BS02 explanation arithmetic')
opts2 = ['ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BS02')
items.append({
 'id': 'S-BS02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('어느 동아리의 회원은 남학생 갑, 을, 병, 정과 여학생 무, 기, 경의 7명이다. 이 가운데 3명을 뽑아 대표단을 꾸린다. 대표단 안에서 맡는 역할은 따로 없으므로, 같은 3명이면 뽑힌 순서가 달라도 같은 대표단이다.'),
          box('보기', ['ㄱ. 대표단을 꾸리는 방법은 모두 35가지이다.', 'ㄴ. 여학생이 한 명 이상 들어가는 방법은 32가지이다.', 'ㄷ. 갑과 을이 함께 뽑히지 않는 방법은 30가지이다.', 'ㄹ. 남학생과 여학생이 모두 들어가는 방법은 31가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 7명에서 3명 → 7 × 6 × 5 ÷ (3 × 2 × 1) = 35가지.', 'ㄴ: 남학생만 뽑는 4가지를 빼면 31가지.', 'ㄷ: 갑과 을이 함께 뽑히는 경우는 나머지 한 명을 고르는 5가지이므로 35 − 5 = 30가지.', 'ㄹ: 남학생만 4가지, 여학생만 1가지를 빼면 30가지.']),
  bx([('ㄱ', '35가지', True, O, '7명 중 3명.'), ('ㄴ', '32가지', False, XX, '31가지이다.'), ('ㄷ', '30가지', True, O, '35 − 5.'), ('ㄹ', '31가지', False, XX, '30가지이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 35가지를 모두 나열해 확인하였다. <b>함정</b> ‘모두 들어간다’는 남학생만, 여학생만인 두 경우를 함께 빼야 한다.')]})

# ---------------------------------------------------------------- S-BS03 주택 임대차 갱신 (법조문 적용, 옳지 않은 것)
def can_request(months_before_end): return 2 <= months_before_end <= 6
RENEW_TIMES = 1                                                # 조문: 갱신 요구는 한 번만
can_request_again = lambda used: used < RENEW_TIMES
def can_refuse(arrears_terms=0, relative_moves_in=False): return arrears_terms >= 2 or relative_moves_in
def max_rent(rent): return rent + rent * F(1, 20)
f3 = [can_request(3), not can_request_again(1), can_refuse(relative_moves_in=True), max_rent(100) >= 105, can_refuse(arrears_terms=1)]
one_false(f3, 4, 'S-BS03')
check(not can_request(1) and can_request(6) and max_rent(100) == 105 and can_refuse(arrears_terms=2), 'S-BS03 boundaries')
items.append({
 'id': 'S-BS03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳지 않은 것은?',
 'body': [law('<p><b>제○○조(계약 갱신 요구)</b> ① 임차인은 임대차 기간이 끝나기 6개월 전부터 2개월 전까지 계약 갱신을 요구할 수 있다. 임대인은 정당한 사유 없이 이를 거절하지 못한다.<br>② 임차인은 제1항에 따른 갱신 요구를 한 번만 할 수 있다.</p>'
              '<p><b>제○○조(거절 사유)</b> 임대인은 다음 각 호의 어느 하나에 해당하는 경우에는 갱신 요구를 거절할 수 있다.<br>1. 임차인이 2기의 차임액에 해당하는 금액에 이르도록 차임을 연체한 사실이 있는 경우<br>2. 임대인(임대인의 직계존속·직계비속을 포함한다)이 그 주택에 실제로 거주하려는 경우</p>'
              '<p><b>제○○조(차임 증액)</b> 계약이 갱신되는 경우 차임의 증액은 약정한 차임의 20분의 1을 넘지 못한다.</p>')],
 'options': ['임대차 기간이 끝나기 3개월 전에 계약 갱신을 요구할 수 있다.', '갱신 요구로 계약이 한 번 갱신되었다면 임차인은 다시 갱신을 요구할 수 없다.', '임대인의 아들이 그 주택에 실제로 살려는 경우 임대인은 갱신 요구를 거절할 수 있다.',
             '약정한 월 차임이 100만 원이면 갱신할 때 105만 원까지 올릴 수 있다.', '차임을 한 달 치 연체한 사실이 있으면 임대인은 갱신 요구를 거절할 수 있다.'],
 'answer': 4,
 'explain': [
  ox([(True, O, '6개월 전부터 2개월 전까지 요구할 수 있다.'), (True, O, '갱신 요구는 한 번만 할 수 있다.'), (True, O, '직계비속도 포함된다.'),
      (True, O, '20분의 1인 5만 원까지 올릴 수 있다.'), (False, XX, '2기의 차임액에 이르도록 연체한 경우에만 거절할 수 있다.')]),
  p('따라서 정답은 <b>⑤</b>이다. <b>함정</b> 기간의 시작과 끝, 횟수, 거주자의 범위, 연체 기준(2기)을 확인한다.')]})

# ---------------------------------------------------------------- S-BS04 할인과 쿠폰의 순서 (수리 추론)
P0 = 50000
pct = lambda x, r: x * (1 - F(r, 100))
flat = lambda x, a: x - a
t4 = {'ㄱ': pct(pct(P0, 20), 10) == 36000, 'ㄴ': pct(pct(P0, 20), 10) - pct(P0, 30) == 1000, 'ㄷ': pct(pct(P0, 10), 20) == pct(pct(P0, 20), 10), 'ㄹ': flat(pct(P0, 20), 5000) == pct(flat(P0, 5000), 20)}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and flat(pct(P0, 20), 5000) == 35000 and pct(flat(P0, 5000), 20) == 36000, f'S-BS04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BS04')
items.append({
 'id': 'S-BS04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('정가 50,000원인 상품이 있다. 비율 할인은 그 단계에서 남아 있는 금액에 비율을 곱해 빼고, 정액 쿠폰은 그 단계에서 남아 있는 금액에서 쿠폰 금액을 뺀다. 할인과 쿠폰을 여러 개 쓰면 정한 순서대로 하나씩 적용한다.'),
          box('보기', ['ㄱ. 20% 할인을 받은 뒤 10% 할인 쿠폰을 쓰면 36,000원을 낸다.', 'ㄴ. ㄱ의 경우는 처음부터 30% 할인을 받을 때보다 1,000원을 더 낸다.', 'ㄷ. 10% 할인 쿠폰을 먼저 쓰고 20% 할인을 받아도 ㄱ과 같은 금액을 낸다.', 'ㄹ. 20% 할인을 받은 뒤 5,000원 쿠폰을 쓰는 경우와, 5,000원 쿠폰을 먼저 쓰고 20% 할인을 받는 경우에 내는 금액은 같다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 50,000 × 0.8 = 40,000 → × 0.9 = 36,000원.', 'ㄴ: 30% 할인이면 35,000원이므로 1,000원 더 낸다.', 'ㄷ: 50,000 × 0.9 × 0.8 = 36,000원으로 같다. 비율 할인끼리는 곱셈이라 순서를 바꿔도 같다.', 'ㄹ: 40,000 − 5,000 = 35,000원, (50,000 − 5,000) × 0.8 = 36,000원으로 다르다.']),
  bx([('ㄱ', '36,000원', True, O, '0.8 × 0.9.'), ('ㄴ', '1,000원 더', True, O, '36,000 − 35,000.'), ('ㄷ', '순서 바꿔도 같음', True, O, '곱셈의 순서.'), ('ㄹ', '정액 쿠폰 순서 무관', False, XX, '35,000원과 36,000원.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 정액 쿠폰은 할인 뒤에 쓸수록 이득이다. 먼저 쓰면 쿠폰 금액에도 할인율이 적용되지 않는 셈이다.')]})

# ---------------------------------------------------------------- S-BS05 과제 처리 순서 (전수, 규칙 모두 필요)
TASK = {'A': (2, 2, 5), 'B': (2, 9, 4), 'C': (1, 10, 8), 'D': (1, 10, 8), 'E': (1, 2, 9), 'F': (4, 6, 2)}    # 걸리는 시간, 마감(시작 후 몇 시간 안에 끝내야 하는지), 점수
CAP = 8
def doable(order, r):
    t, done = 0, set()
    for k in order:
        need, due, _ = TASK[k]
        if r[1] and k == 'C' and 'A' not in done: return False
        t += need
        if r[0] and t > due: return False
        done.add(k)
    return not (r[2] and t > CAP)
def plans(r=(1, 1, 1)):
    res = []
    for n in range(1, 7):
        for s in itertools.combinations(TASK, n):
            if any(doable(o, r) for o in itertools.permutations(s)): res.append((sum(TASK[k][2] for k in s), s))
    return sorted(res, reverse=True)
PL = plans(); b5 = PL[0][0]
check(b5 == 25 and [s for v, s in PL if v == b5] == [('A', 'B', 'C', 'D')], f'S-BS05 {PL[:3]}')
alts5 = [plans(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check([v for v, s in alts5] == [34, 29, 27], f'S-BS05 every rule changes the answer {alts5}')
sec5 = sorted({v for v, s in PL}, reverse=True)[1]
check(sec5 == 23 and max(v for v, s in PL if 'E' in s) == 23 and ('B', 'D', 'E', 'F') in [s for v, s in PL if v == 23], f'S-BS05 second best {sec5}')
opts5v = sorted([sec5, b5] + [v for v, s in alts5]); check(len(set(opts5v)) == 5, f'S-BS05 {opts5v}')
ans5 = opts5v.index(b5)
check(doable(('A', 'C', 'D', 'B'), (1, 1, 1)) and doable(('E', 'D', 'F', 'B'), (1, 1, 1)) and not any(doable(o, (1, 1, 1)) for o in itertools.permutations(('A', 'E'))), 'S-BS05 explanation plans')
items.append({
 'id': 'S-BS05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 얻을 수 있는 점수 합의 최댓값은?',
 'body': [p('甲은 오늘 과제 A~F 가운데 몇 개를 골라 한 번에 하나씩 처리하려 한다. 甲은 작업을 시작한 때부터 쉬지 않고 일하며, 과제를 끝내면 그 과제의 점수를 얻는다. 과제마다 걸리는 시간, 마감, 점수는 아래와 같고, 甲은 다음 규칙을 모두 지킨다.'),
          table(['과제', '걸리는 시간', '마감', '점수'], [[k, f'{a}시간', f'시작 후 {b}시간', str(c)] for k, (a, b, c) in TASK.items()], caption='과제별 걸리는 시간·마감·점수', num=False),
          box('규칙', ['고른 과제는 각각 마감 안에 끝내야 한다.', 'C는 A를 끝낸 뒤에만 시작할 수 있다.', '오늘 일하는 시간은 모두 8시간을 넘을 수 없다.'], plain=True)],
 'options': [str(v) for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['A(2시간)와 E(1시간)는 둘 다 시작 후 2시간 안에 끝내야 하므로 둘 중 하나만 할 수 있다.', 'A를 고르면 A를 먼저 하고 C·D(각 1시간, 8점)를 한 뒤 B(2시간)를 해 6시간에 5 + 8 + 8 + 4 = <b>25점</b>이다. F(4시간)를 더하면 10시간이 되어 8시간을 넘는다.',
         'E를 고르면 C를 할 수 없다(A가 없음). E·D·F·B를 차례로 하면 8시간에 9 + 8 + 2 + 4 = 23점이 최대이다.', '따라서 최댓값은 25점이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 과제 조합과 순서를 모두 따져 확인하였다. <b>함정</b> 마감 규칙을 빼면 34점, 선행 규칙을 빼면 29점, 8시간 규칙을 빼면 27점이 된다.')]})

REVIEW = {
 'S-BS01': ('법조문 계산', '상', '2분', '위반 차수의 ‘이상’, 감경 사유 중복 시 큰 것 하나', '감경 중복 적용', '사람별 기본 금액 → 감경', '과태료 감경형, 조문 둘, 새로 설계'),
 'S-BS02': ('경우의 수', '상', '2분', '조합, 여사건, 함께 뽑히는 경우 빼기', '‘모두 포함’에서 한쪽만 뺌', '전체에서 빼기', '대표단 뽑기형, 새로 설계(전수)'),
 'S-BS03': ('법조문 적용', '상', '1분 30초', '요구 기간, 횟수, 직계비속, 20분의 1, 2기 연체', '연체 기준 착오', '조문별 대조', '임대차 갱신형, 조문 셋, 새로 설계'),
 'S-BS04': ('수리 추론', '상', '2분', '비율 할인의 곱, 정액 쿠폰의 순서', '할인율을 더함', '단계별 남은 금액', '할인·쿠폰 순서형, 새로 설계'),
 'S-BS05': ('최적화', '상', '3분', '마감이 겹치는 과제, 선행 과제, 총시간', '규칙 하나 누락', '마감이 겹치는 둘 중 하나부터', '과제 순서형, 새로 설계(조합·순서 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bs.py', 'review/sit-bs.md'), '상황판단 S-BS 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
