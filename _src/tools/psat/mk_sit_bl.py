# 상황판단 S-BL01..S-BL05 — 5급 실전(심화) 수준 정예 문항: 재난지원금(가구원·소득 제외·고령 가산 한도·지역화폐 추가의 순서), 오름차순 비밀번호(전수), 주민참여예산 제안 규정, 타들어 가는 두 양초, 점심 메뉴 고르기(63가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, math
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bl.js'

# ---------------------------------------------------------------- S-BL01 재난지원금 (법조문 계산)
BASE = {1: 40, 2: 60, 3: 80}; BASE4 = 100                       # 만 원
HH = {'甲': (1, 1, 200, True), '乙': (5, 3, 600, False), '丙': (3, 0, 900, False), '丁': (2, 2, 300, True)}   # 가구원, 65세 이상 수, 월 소득(만 원), 지역화폐
def aid(k, cap=True, income=True, local_all=True, local=True):
    n, old, inc, lc = HH[k]
    if income and inc > 800: return F(0)
    base = BASE.get(n, BASE4); add = min(old * 10, 20) if cap else old * 10
    if not (local and lc): return F(base + add)
    return (base + add) * F(11, 10) if local_all else base * F(11, 10) + add
each1 = {k: aid(k) for k in HH}
check(each1 == {'甲': 55, '乙': 120, '丙': 0, '丁': 88}, f'S-BL01 {each1}')
tot1 = lambda **kw: int(sum(aid(k, **kw) for k in HH) * 10000)
alts1 = {'정답': tot1(), '가산 한도 누락': tot1(cap=False), '소득 제외 누락': tot1(income=False), '지역화폐 추가를 기본액에만': tot1(local_all=False), '지역화폐 추가 누락': tot1(local=False)}
check(alts1 == {'정답': 2630000, '가산 한도 누락': 2730000, '소득 제외 누락': 3430000, '지역화폐 추가를 기본액에만': 2600000, '지역화폐 추가 누락': 2500000}, f'S-BL01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BL01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BL01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁 네 가구가 받는 재난지원금의 합계는?',
 'body': [law('<p><b>제○○조(지급액)</b> ① 재난지원금은 가구원 수에 따라 1인 가구 40만 원, 2인 가구 60만 원, 3인 가구 80만 원, 4인 이상 가구 100만 원을 지급한다.<br>② 가구원 가운데 65세 이상인 사람이 있으면 1명당 10만 원을 더하되, 더하는 금액은 가구당 20만 원을 넘을 수 없다.</p>'
              '<p><b>제○○조(제외)</b> 월 소득이 800만 원을 넘는 가구에는 지급하지 아니한다.</p>'
              '<p><b>제○○조(지역화폐)</b> 재난지원금을 지역화폐로 받기로 한 가구에는 제○○조(지급액)에 따라 정한 금액의 100분의 10을 더하여 지역화폐로 지급한다.</p>'),
          box('상황', ['甲: 1인 가구(70세), 월 소득 200만 원, 지역화폐로 받기로 함', '乙: 5인 가구(65세 이상 3명), 월 소득 600만 원, 현금으로 받기로 함', '丙: 3인 가구(65세 이상 없음), 월 소득 900만 원', '丁: 2인 가구(66세와 67세), 월 소득 300만 원, 지역화폐로 받기로 함'], plain=True)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 40 + 10 = 50만 원 → 지역화폐 10% 추가 → 55만 원.', '乙: 100 + 가산(3명이지만 한도 20만 원) = 120만 원.', '丙: 월 소득 900만 원으로 제외 → 0원.', '丁: 60 + 20 = 80만 원 → 10% 추가 → 88만 원.']),
  p(f'합계 55 + 120 + 0 + 88 = <b>263만 원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 가산 한도를 빼면 2,730,000원, 소득 제외를 빼면 3,430,000원, 10%를 기본액에만 붙이면 2,600,000원, 지역화폐 추가를 빼면 2,500,000원이다.')]})

# ---------------------------------------------------------------- S-BL02 오름차순 비밀번호 (전수)
CODES = list(itertools.combinations(range(10), 4))              # 왼쪽부터 커지므로 숫자 네 개를 고르면 하나로 정해진다
t2 = {'ㄱ': len(CODES) == 210, 'ㄴ': sum(c[0] == 0 for c in CODES) == 84, 'ㄷ': min(map(sum, CODES)) == 6, 'ㄹ': sum(all(x % 2 == 0 for x in c) for c in CODES) == 10}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and sum(all(x % 2 == 0 for x in c) for c in CODES) == 5, f'S-BL02 {t2}')
check(math.comb(10, 4) == 210 and math.comb(9, 3) == 84 and math.comb(5, 4) == 5, 'S-BL02 explanation combinations')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BL02')
items.append({
 'id': 'S-BL02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('甲 회사의 출입 비밀번호는 0부터 9까지의 숫자 가운데 서로 다른 네 숫자로 이루어진 네 자리이며, 왼쪽 자리부터 오른쪽 자리로 갈수록 숫자가 커진다. 첫 자리에 0이 와도 된다.'),
          box('보기', ['ㄱ. 만들 수 있는 비밀번호는 모두 210가지이다.', 'ㄴ. 첫 자리가 0인 비밀번호는 84가지이다.', 'ㄷ. 네 숫자의 합이 가장 작은 비밀번호의 네 숫자 합은 6이다.', 'ㄹ. 짝수로만 이루어진 비밀번호는 10가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['숫자 네 개를 고르기만 하면 커지는 순서로 늘어놓는 방법은 하나뿐이므로, 비밀번호 수는 10개에서 4개를 고르는 수 10C4 = 210이다(ㄱ).', '첫 자리가 0이면 나머지 세 숫자를 1~9에서 고른다: 9C3 = 84(ㄴ).',
         '가장 작은 합은 0, 1, 2, 3을 고른 0123의 6이다(ㄷ).', '짝수 0, 2, 4, 6, 8 가운데 네 개를 고르는 5C4 = 5가지이다(ㄹ).']),
  bx([('ㄱ', '210가지', True, O, '10C4.'), ('ㄴ', '첫 자리 0은 84가지', True, O, '9C3.'), ('ㄷ', '최소 합 6', True, O, '0123.'), ('ㄹ', '짝수만 10가지', False, XX, '5C4 = 5.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 210가지를 모두 따져 확인하였다. <b>함정</b> 순서가 정해져 있으므로 순열이 아니라 조합으로 센다.')]})

# ---------------------------------------------------------------- S-BL03 주민참여예산 제안 규정 (법조문 적용, 옳은 것)
def may_propose(resident, age, student): return (resident and age >= 18) or student
def in_period(m, d): return (m, d) >= (3, 1) and (m, d) <= (4, 30)
def size_ok(cost, joint): return cost <= (10000 if joint else 5000)        # 만 원
def budget_year(selected_year): return selected_year + 1            # 다음 연도 예산에 반영
f3 = [size_ok(8000, True), not may_propose(False, 21, True), in_period(5, 10), size_ok(7000, False), budget_year(2026) == 2026]
one_true(f3, 0, 'S-BL03')
check(may_propose(False, 21, True) and not in_period(5, 10) and not size_ok(7000, False), 'S-BL03 distractor facts')
items.append({
 'id': 'S-BL03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(제안 자격)</b> 시에 주소를 둔 18세 이상의 주민과 시에 있는 학교에 다니는 학생은 주민참여예산 사업을 제안할 수 있다.</p>'
              '<p><b>제○○조(제안 기간)</b> 사업은 매년 3월 1일부터 4월 30일까지 제안할 수 있다.</p>'
              '<p><b>제○○조(사업 규모)</b> 제안할 수 있는 사업은 사업비 5천만 원 이하인 사업으로 한다. 다만 둘 이상의 동이 함께 제안하는 사업은 사업비 1억 원 이하로 한다.</p>'
              '<p><b>제○○조(심사와 반영)</b> 주민참여예산위원회는 제안된 사업을 심사하여 선정하고, 시장은 선정된 사업을 다음 연도 예산에 반영한다.</p>')],
 'options': ['두 동이 함께 사업비 8천만 원인 사업을 제안할 수 있다.', '시에 주소가 없는 사람은 시에 있는 대학에 다니더라도 사업을 제안할 수 없다.', '5월 10일에도 사업을 제안할 수 있다.',
             '한 동이 단독으로 사업비 7천만 원인 사업을 제안할 수 있다.', '선정된 사업은 선정된 해의 예산에 바로 반영된다.'],
 'answer': 0,
 'explain': [
  ox([(True, O, '둘 이상의 동이 함께 제안하면 1억 원 이하까지 제안할 수 있다.'), (False, XX, '시에 있는 학교에 다니는 학생도 제안할 수 있다.'), (False, XX, '제안 기간은 4월 30일까지이다.'),
      (False, XX, '단독 제안은 5천만 원 이하만 할 수 있다.'), (False, XX, '선정된 사업은 다음 연도 예산에 반영한다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> 제안 자격의 두 갈래(주민 또는 학생), 단서의 요건(둘 이상의 동), 반영 시기(다음 연도)를 확인한다.')]})

# ---------------------------------------------------------------- S-BL04 타들어 가는 두 양초 (수리 추론)
LA, RA, LB, RB = 20, 4, 15, 2                                    # cm, cm/시간
lenA = lambda t: max(0, LA - RA * t); lenB = lambda t: max(0, LB - RB * t)
same = F(LA - LB, RA - RB)
t4 = {'ㄱ': F(LA, RA) < F(LB, RB), 'ㄴ': same == F(5, 2), 'ㄷ': lenB(3) - lenA(3) == 3, 'ㄹ': lenB(F(LA, RA)) == 5}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and lenB(3) - lenA(3) == 1, f'S-BL04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ']; ans4 = combo(t4, opts4, 'S-BL04')
items.append({
 'id': 'S-BL04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('길이 20cm인 양초 A와 길이 15cm인 양초 B에 동시에 불을 붙였다. A는 1시간에 4cm씩, B는 1시간에 2cm씩 일정하게 타들어 가며, 다 탄 양초의 길이는 0으로 본다.'),
          box('보기', ['ㄱ. A가 B보다 먼저 다 탄다.', 'ㄴ. 두 양초의 길이가 같아지는 것은 불을 붙이고 2시간 30분 뒤이다.', 'ㄷ. 불을 붙이고 3시간 뒤에는 B가 A보다 3cm 길다.', 'ㄹ. A가 다 탔을 때 B는 5cm 남아 있다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['A는 20 ÷ 4 = 5시간, B는 15 ÷ 2 = 7.5시간에 다 탄다(ㄱ).', '20 − 4t = 15 − 2t에서 t = 2.5시간(ㄴ).', '3시간 뒤: A 20 − 12 = 8cm, B 15 − 6 = 9cm → 차이 1cm(ㄷ).', '5시간 뒤 B는 15 − 10 = 5cm(ㄹ).']),
  bx([('ㄱ', 'A가 먼저', True, O, '5시간 &lt; 7.5시간.'), ('ㄴ', '2시간 30분', True, O, 't = 2.5.'), ('ㄷ', '3cm 차이', False, XX, '1cm.'), ('ㄹ', 'B 5cm 남음', True, O, '15 − 10.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 길이가 같아진 뒤에는 A가 더 빨리 짧아져 B가 더 길다.')]})

# ---------------------------------------------------------------- S-BL05 점심 메뉴 고르기 (63가지 전수, 규칙 모두 필요)
MENU = {'A': ('잡곡밥 정식', 3, 150, 15), 'B': ('비빔밥', 6, 200, 25), 'C': ('두부 샐러드', 6, 100, 30), 'D': ('돈가스', 2, 450, 30), 'E': ('닭가슴살 구이', 4, 300, 30), 'F': ('과일', 2, 200, 5)}   # 값(천 원), 열량(kcal), 단백질(g)
BUD, KCAL = 12, 800
def lunch(r=(1, 1, 1)):
    res = []
    for k in range(1, 7):
        for s in itertools.combinations(MENU, k):
            if sum(MENU[x][1] for x in s) > BUD or sum(MENU[x][2] for x in s) > KCAL: continue
            if r[0] and not ('A' in s or 'B' in s): continue
            if r[1] and 'C' in s and 'D' in s: continue
            if r[2] and 'A' in s and 'B' in s: continue
            res.append((sum(MENU[x][3] for x in s), s))
    m = max(v for v, _ in res); return m, [s for v, s in res if v == m], sorted(res, reverse=True)
b5, a5, all5 = lunch()
check(b5 == 60 and a5 == [('B', 'E', 'F')], f'S-BL05 {b5} {a5}')
alts5 = [lunch(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check(alts5 == [65, 75, 70], f'S-BL05 every rule changes the answer {alts5}')
second = sorted({v for v, _ in all5}, reverse=True)[1]
withA = max(v for v, s in all5 if 'A' in s); withB_C = max(v for v, s in all5 if 'B' in s and 'C' in s); withB_D = max(v for v, s in all5 if 'B' in s and 'D' in s)
check(second == 55 and withA == 50 and withB_C == 55 and withB_D == 55, f'S-BL05 explanation {second} {withA} {withB_C} {withB_D}')
opts5v = sorted({b5, second, *alts5}); check(len(opts5v) == 5, f'S-BL05 {opts5v}')
ans5 = opts5v.index(b5)
items.append({
 'id': 'S-BL05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 고른 메뉴로 얻을 수 있는 단백질의 최댓값은?',
 'body': [p('甲은 1만 2천 원 이하의 돈으로 열량이 모두 800kcal를 넘지 않도록 점심 메뉴를 고르려 한다. 메뉴마다 값, 열량, 단백질은 아래와 같고 같은 메뉴는 한 번만 고를 수 있다. 다음 규칙을 모두 지켜야 한다.'),
          table(['메뉴', '이름', '값(천 원)', '열량(kcal)', '단백질(g)'], [[k, n, str(a), str(b), str(c)] for k, (n, a, b, c) in MENU.items()], caption='메뉴별 값·열량·단백질', num=False),
          box('규칙', ['밥이 든 A나 B 가운데 적어도 하나를 고른다.', 'C와 D는 소스가 같아 함께 고르지 않는다.', 'A와 B는 둘 다 밥이므로 함께 고르지 않는다.'], plain=True)],
 'options': [f'{v}g' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['A와 B 가운데 정확히 하나를 고른다.', 'A(3천 원·150kcal)를 고르면 남은 9천 원·650kcal 안에서 A·C·F, A·D·F, A·E·F 등이 되어 단백질은 많아야 50g이다.',
         'B(6천 원·200kcal)를 고르면 남은 6천 원·600kcal 안에서 E·F(6천 원·500kcal, 35g)를 더해 60g이 된다. C(30g)나 D(30g) 하나만 더하면 55g이다.', '따라서 최댓값은 <b>60g</b>(B, E, F)이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 메뉴 조합 63가지를 모두 따져 확인하였다. <b>함정</b> 밥 규칙을 빼면 65g, C·D 규칙을 빼면 75g, A·B를 함께 고를 수 있다고 보면 70g이 된다.')]})

REVIEW = {
 'S-BL01': ('법조문 계산', '상', '2분 30초', '가구원별 금액, 소득 제외, 가산 한도, 지역화폐 추가의 대상 금액', '한도·대상 금액 착오', '가구별 제외 → 기본 → 가산 → 추가', '재난지원금형, 조문 셋, 새로 설계'),
 'S-BL02': ('경우의 수', '상', '2분', '순서가 정해진 배열은 조합', '순열로 셈', '고르기만 하면 순서가 정해짐', '오름차순 비밀번호형, 새로 설계(전수)'),
 'S-BL03': ('법조문 적용', '상', '1분 30초', '자격의 두 갈래, 기간, 단서 요건, 반영 시기', '단서·시기 착오', '조문별 대조', '주민참여예산형, 조문 넷, 새로 설계'),
 'S-BL04': ('수리 추론', '상', '1분 30초', '일차식 비교, 같아지는 시각, 다 탄 뒤', '같아진 뒤의 대소 착오', '길이 = 처음 − 속도 × 시간', '양초형, 새로 설계'),
 'S-BL05': ('최적화', '상', '3분', '두 제약(값·열량), 배타·필수 규칙', '규칙 하나 누락', '밥 A와 B로 나누기', '점심 메뉴형, 새로 설계(63가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bl.py', 'review/sit-bl.md'), '상황판단 S-BL 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
