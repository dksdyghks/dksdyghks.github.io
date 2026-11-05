# 상황판단 S-BF01..S-BF05 — 5급 실전(심화) 수준 정예 문항: 고효율 가전 환급(조문 셋과 대상·비율·한도), 자릿수 조건 세 자리 수(전수), 의류 수거함 규정, 세 알람이 함께 울리는 때(전수), 구독 서비스 고르기(31가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, math
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bf.js'

# ---------------------------------------------------------------- S-BF01 고효율 가전 환급 (법조문 계산)
BUY = {'甲': (False, [('냉장고', 1, 180), ('세탁기', 1, 120)]), '乙': (True, [('에어컨', 1, 150), ('냉장고', 1, 250)]), '丙': (False, [('냉장고', 2, 200), ('TV', 1, 150)]), '丁': (False, [('세탁기', 1, 90), ('세탁기', 1, 110), ('에어컨', 1, 220)])}   # (기초생활수급자, [(품목, 등급, 구매가 만 원)])
ITEMS = ('냉장고', '세탁기', '에어컨')
def refund1(k, item_cap=True, total_cap=True, one_each=True, grade1=True, low_rate=True):
    low, buys = BUY[k]; seen, tot = set(), F(0)
    for item, grade, price in buys:
        if item not in ITEMS or (grade1 and grade != 1): continue
        if one_each and item in seen: continue
        seen.add(item)
        r = price * (F(2, 10) if (low and low_rate) else F(1, 10))
        tot += min(r, 20) if item_cap else r
    return min(tot, 30) if total_cap else tot
each1 = {k: refund1(k) for k in BUY}
check(each1 == {'甲': 30, '乙': 30, '丙': 0, '丁': 29}, f'S-BF01 {each1}')
tot1 = lambda **kw: sum(refund1(k, **kw) for k in BUY)
alts1 = {'정답': tot1(), '1인 한도 누락': tot1(total_cap=False), '품목당 한도 누락': tot1(item_cap=False), '2등급 포함': tot1(grade1=False), '두 한도 모두 누락': tot1(item_cap=False, total_cap=False)}
check(alts1 == {'정답': 89, '1인 한도 누락': 99, '품목당 한도 누락': 90, '2등급 포함': 109, '두 한도 모두 누락': 141}, f'S-BF01 {alts1}')
check(tot1(one_each=False) == 90 and tot1(low_rate=False) == 89, 'S-BF01 other variants (explanation)')
won = {k: int(v * 10000) for k, v in alts1.items()}; vals1 = sorted(won.values()); check(len(set(vals1)) == 5, f'S-BF01 distinct {won}')
ans1 = vals1.index(won['정답'])
items.append({
 'id': 'S-BF01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 받는 환급액의 합계는?',
 'body': [law('<p><b>제○○조(대상)</b> 에너지 효율 1등급인 냉장고, 세탁기, 에어컨을 구매한 사람에게 구매가의 일부를 환급한다. 같은 품목은 1인당 1대까지만 환급하며, 같은 품목을 2대 이상 산 경우에는 먼저 산 1대만 대상으로 한다.</p>'
              '<p><b>제○○조(환급률)</b> 환급액은 구매가의 100분의 10으로 한다. 다만 기초생활수급자는 100분의 20으로 한다.</p>'
              '<p><b>제○○조(한도)</b> 환급액은 품목마다 20만 원을 넘을 수 없고, 1인당 합계 30만 원을 넘을 수 없다.</p>'),
          box('상황', ['甲: 1등급 냉장고 180만 원, 1등급 세탁기 120만 원', '乙(기초생활수급자): 1등급 에어컨 150만 원, 1등급 냉장고 250만 원', '丙: 2등급 냉장고 200만 원, 1등급 TV 150만 원', '丁: 1등급 세탁기 90만 원을 산 뒤 1등급 세탁기 110만 원을 또 샀으며, 1등급 에어컨 220만 원을 샀다.'], plain=True)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 18만 + 12만 = 30만 원(품목당·1인 한도 안).', '乙: 수급자라 20% → 에어컨 30만 원은 품목당 한도로 20만 원, 냉장고 50만 원도 20만 원 → 40만 원이지만 1인 한도로 30만 원.',
         '丙: 냉장고는 2등급이고 TV는 대상 품목이 아니어서 0원.', '丁: 세탁기는 먼저 산 90만 원짜리만 대상 → 9만 원, 에어컨 22만 원은 품목당 한도로 20만 원 → 합 29만 원.']),
  p(f'합계 30 + 30 + 0 + 29 = <b>89만 원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 1인 한도를 빠뜨리면 99만 원, 품목당 한도를 빠뜨리면 90만 원, 2등급까지 넣으면 109만 원, 두 한도를 모두 빠뜨리면 141만 원이다.')]})

# ---------------------------------------------------------------- S-BF02 자릿수 조건 세 자리 수 (전수)
NUMS = [n for n in range(100, 1000) if math.prod(map(int, str(n))) == 36 and sum(map(int, str(n))) == 13]
t2 = {'ㄱ': len(NUMS) == 6, 'ㄴ': sum(1 for n in NUMS if n % 2 == 0) == 4, 'ㄷ': max(NUMS) - min(NUMS) == 763, 'ㄹ': [n for n in NUMS if n % 11 == 0] == [616]}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and NUMS == [166, 229, 292, 616, 661, 922] and max(NUMS) - min(NUMS) == 756, f'S-BF02 {t2} {NUMS}')
trip = sorted({tuple(sorted(map(int, str(n)))) for n in NUMS})
check(trip == [(1, 6, 6), (2, 2, 9)] and not [t for t in itertools.combinations_with_replacement(range(1, 10), 3) if math.prod(t) == 36 and sum(t) == 13 and t not in trip], 'S-BF02 explanation digit sets')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BF02')
items.append({
 'id': 'S-BF02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('세 자리 자연수 가운데 각 자리 숫자를 모두 곱하면 36이 되고, 모두 더하면 13이 되는 수를 ‘맞춤수’라 한다. 같은 숫자가 두 번 쓰여도 된다.'),
          box('보기', ['ㄱ. 맞춤수는 모두 6개이다.', 'ㄴ. 맞춤수 가운데 짝수는 4개이다.', 'ㄷ. 가장 큰 맞춤수와 가장 작은 맞춤수의 차는 763이다.', 'ㄹ. 맞춤수 가운데 11의 배수는 하나뿐이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['곱이 36이 되는 세 숫자 묶음은 1·4·9, 1·6·6, 2·2·9, 2·3·6, 3·3·4이고, 이 가운데 합이 13인 것은 1·6·6과 2·2·9뿐이다.', '1·6·6으로 166, 616, 661, 2·2·9로 229, 292, 922를 만들 수 있어 모두 6개이다(ㄱ).',
         'ㄴ: 끝자리가 짝수인 것은 166, 616, 292, 922의 4개이다. ㄷ: 922 − 166 = 756이다. ㄹ: 616 = 11 × 56만 11의 배수이다.']),
  bx([('ㄱ', '6개', True, O, '166, 616, 661, 229, 292, 922.'), ('ㄴ', '짝수 4개', True, O, '166, 616, 292, 922.'), ('ㄷ', '차 763', False, XX, '756.'), ('ㄹ', '11의 배수 하나', True, O, '616.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 세 자리 수를 모두 따져 확인하였다.')]})
check(sorted(t for t in itertools.combinations_with_replacement(range(1, 10), 3) if math.prod(t) == 36) == [(1, 4, 9), (1, 6, 6), (2, 2, 9), (2, 3, 6), (3, 3, 4)], 'S-BF02 explanation product-36 sets')

# ---------------------------------------------------------------- S-BF03 의류 수거함 규정 (법조문 적용, 옳은 것)
def can_install(walk_w, cross_m): return walk_w >= 3 and cross_m > 10
def remove_cost(self_removed_days=None): return 0 if (self_removed_days is not None and self_removed_days <= 7) else 1
def fine3(no_contact): return 200000 if no_contact else 0
def must_remove(permitted, days_no_collect): return (not permitted) or days_no_collect >= 30
f3 = [can_install(2.5, 20), must_remove(True, 35) and remove_cost(5) == 0, can_install(4, 8), must_remove(True, 20), fine3(True) == 100000]
one_true(f3, 1, 'S-BF03')
check(not can_install(2.5, 20) and not can_install(4, 8) and not must_remove(True, 20) and fine3(True) == 200000, 'S-BF03 distractor facts')
items.append({
 'id': 'S-BF03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(설치)</b> 의류 수거함을 설치하려는 자는 구청장의 허가를 받아야 한다. 수거함은 폭이 3미터 이상인 보도에만 설치할 수 있으며, 횡단보도로부터 10미터 이내에는 설치할 수 없다.</p>'
              '<p><b>제○○조(관리)</b> 설치자는 수거함마다 관리자의 연락처를 표시하여야 하며, 한 달에 두 번 이상 수거하여야 한다.</p>'
              '<p><b>제○○조(철거)</b> 구청장은 허가 없이 설치된 수거함과 30일 이상 수거하지 않은 수거함을 철거하고 그 비용을 설치자에게 부담시킨다. 다만 철거를 알린 날부터 7일 이내에 설치자가 스스로 철거하면 비용을 부담시키지 아니한다.</p>'
              '<p><b>제○○조(과태료)</b> 제2조를 위반하여 연락처를 표시하지 아니한 설치자에게는 20만 원의 과태료를 부과한다.</p>')],
 'options': ['허가를 받으면 폭 2.5미터인 보도에 수거함을 설치할 수 있다.', '35일 동안 수거하지 않은 수거함은 철거 대상이지만, 철거 통지 후 5일째에 설치자가 스스로 철거하면 비용을 부담하지 않는다.',
             '폭 4미터인 보도라면 횡단보도로부터 8미터 떨어진 곳에도 설치할 수 있다.', '허가를 받아 설치한 수거함은 20일 동안 수거하지 않았더라도 철거 대상이 된다.', '연락처를 표시하지 않은 설치자의 과태료는 10만 원이다.'],
 'answer': 1,
 'explain': [
  ox([(False, XX, '보도 폭이 3미터 이상이어야 한다.'), (True, O, '30일 이상 수거하지 않았으므로 철거 대상이고, 7일 이내에 스스로 철거해 비용이 없다.'), (False, XX, '횡단보도로부터 10미터 이내에는 설치할 수 없다.'),
      (False, XX, '철거 대상은 30일 이상 수거하지 않은 수거함이다.'), (False, XX, '20만 원이다.')]),
  p('따라서 정답은 <b>②</b>이다. <b>함정</b> 폭과 거리의 경계, 30일 기준, 7일 단서를 확인한다.')]})

# ---------------------------------------------------------------- S-BF04 세 알람이 함께 울리는 때 (전수)
PER = [6, 8, 15]; L = math.lcm(*PER)
mid = range(1, L)
two = [t for t in mid if sum(t % q == 0 for q in PER) == 2]; ring = [t for t in mid if any(t % q == 0 for q in PER)]
t4 = {'ㄱ': L == 120, 'ㄴ': len(two) == 7, 'ㄷ': not [t for t in mid if t % 8 == 0 and t % 15 == 0], 'ㄹ': len(ring) == 35}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and len(ring) == 33 and two == [24, 30, 48, 60, 72, 90, 96], f'S-BF04 {t4} {two} {len(ring)}')
check(math.lcm(6, 8) == 24 and math.lcm(6, 15) == 30 and math.lcm(8, 15) == 120 and 19 + 14 + 7 - 4 - 3 == 33, 'S-BF04 explanation counts')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ']; ans4 = combo(t4, opts4, 'S-BF04')
items.append({
 'id': 'S-BF04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('甲의 방에는 알람 A, B, C가 있다. 세 알람은 오전 9시 정각에 함께 울린 뒤, A는 6분마다, B는 8분마다, C는 15분마다 울린다. 알람은 울리는 순간에 바로 꺼지며, 정해진 간격은 바뀌지 않는다.'),
          box('보기', ['ㄱ. 오전 9시 다음으로 세 알람이 처음으로 함께 울리는 때는 오전 11시이다.', 'ㄴ. 오전 9시와 오전 11시 사이(두 시각은 빼고)에 정확히 두 알람만 함께 울리는 때는 7번이다.', 'ㄷ. 오전 9시와 오전 11시 사이에 B와 C가 함께 울리는 때는 없다.', 'ㄹ. 오전 9시와 오전 11시 사이(두 시각은 빼고)에 알람이 하나라도 울리는 시각은 35번이다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['6, 8, 15의 최소공배수는 120이므로 세 알람은 2시간 뒤인 오전 11시에 다시 함께 울린다(ㄱ).', 'A와 B는 24분마다(9:24, 9:48, 10:12, 10:36), A와 C는 30분마다(9:30, 10:00, 10:30) 함께 울려 모두 7번이다(ㄴ). B와 C의 최소공배수는 120분이라 그 사이에는 없다(ㄷ).',
         'ㄹ: 그 사이에 A는 19번, B는 14번, C는 7번 울리고, 겹치는 7번(A·B 4번, A·C 3번)을 빼면 33번이다.']),
  bx([('ㄱ', '오전 11시', True, O, '최소공배수 120분.'), ('ㄴ', '7번', True, O, 'A·B 4번 + A·C 3번.'), ('ㄷ', 'B·C 없음', True, O, '최소공배수 120분.'), ('ㄹ', '35번', False, XX, '19 + 14 + 7 − 7 = 33번.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. 1분마다 따져 확인하였다.')]})
check(len([t for t in mid if t % 6 == 0]) == 19 and len([t for t in mid if t % 8 == 0]) == 14 and len([t for t in mid if t % 15 == 0]) == 7, 'S-BF04 explanation single counts')

# ---------------------------------------------------------------- S-BF05 구독 서비스 고르기 (31가지 전수, 규칙 모두 필요)
SV = {'A': ({'나', '라'}, 15000), 'B': ({'가', '다', '마'}, 9000), 'C': ({'나', '다', '마'}, 6000), 'D': ({'나', '다', '바'}, 8000), 'E': ({'라', '마'}, 5000)}   # 볼 수 있는 작품, 월 요금
WANT = {'가', '나', '다', '라', '마', '바'}
def best5(r=(1, 1, 1)):
    res = []
    for k in range(1, 6):
        for s in itertools.combinations(SV, k):
            if set().union(*[SV[x][0] for x in s]) != WANT: continue
            if r[0] and 'E' in s and 'C' not in s: continue
            if r[2] and len(s) > 3: continue
            c = sum(SV[x][1] for x in s) - (3000 if r[1] and 'A' in s and 'B' in s else 0)
            res.append((c, s))
    res.sort(); return res[0][0], [s for v, s in res if v == res[0][0]], res
b5, a5, all5 = best5()
check(b5 == 29000 and a5 == [('A', 'B', 'D')], f'S-BF05 {b5} {a5}')
alts5 = [best5(tuple(0 if j == i else 1 for j in range(3)))[:2] for i in range(3)]
check(alts5 == [(22000, [('B', 'D', 'E')]), (32000, [('A', 'B', 'D')]), (28000, [('B', 'C', 'D', 'E')])], f'S-BF05 every rule changes the answer {alts5}')
check(len(all5) == 1, f'S-BF05 only one plan satisfies every rule {all5}')
FILLER = 30000                                              # 어느 규칙을 빼도 나오지 않는 단순 오답 값
check(all(v != FILLER for v, _ in best5((0, 0, 0))[2]), 'S-BF05 filler value is not reachable')
opts5v = sorted([b5, FILLER] + [x[0] for x in alts5]); check(len(set(opts5v)) == 5, f'S-BF05 options {opts5v}')
ans5 = opts5v.index(b5)
items.append({
 'id': 'S-BF05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 내야 하는 한 달 구독료의 최솟값은?',
 'body': [p('甲은 작품 가~바 여섯 편을 모두 보려고 영상 구독 서비스 A~E 가운데 몇 개를 한 달 동안 구독하려 한다. 서비스마다 볼 수 있는 작품과 한 달 요금은 아래와 같고, 다음 규칙을 모두 지켜야 한다.'),
          box('규칙', ['E는 C를 구독하는 사람만 함께 구독할 수 있다.', 'A와 B를 함께 구독하면 두 요금의 합에서 3,000원을 깎아 준다.', '한 사람이 동시에 구독할 수 있는 서비스는 세 개까지이다.'], plain=True),
          table(['서비스', '볼 수 있는 작품', '한 달 요금'], [[k, ', '.join(sorted(v[0])), f'{v[1]:,}원'] for k, v in SV.items()], caption='서비스별 작품과 요금', num=False)],
 'options': [f'{v:,}원' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['작품 가는 B에서만, 바는 D에서만 볼 수 있으므로 B와 D는 반드시 구독한다. B와 D로 가, 나, 다, 마, 바를 볼 수 있고 라만 남는다.',
         '라는 A나 E에서 볼 수 있다. E는 C를 함께 구독해야 하므로 B·D·E·C가 되는데, 서비스는 세 개까지라 안 된다. 따라서 A를 구독한다.',
         'A·B·D: 15,000 + 9,000 + 8,000 − 3,000(A·B 할인) = 29,000원.']),
  p(f'따라서 최솟값은 29,000원이고 정답은 <b>{CIRC[ans5]}</b>이다. 구독 조합 31가지를 모두 따져 확인하였다. <b>함정</b> E의 가입 조건을 빼면 B·D·E로 22,000원, A·B 할인을 빼면 32,000원, 세 개 제한을 빼면 B·C·D·E로 28,000원이 된다.')]})
check(all('B' in s and 'D' in s for v, s in all5) and [x for x in SV if '가' in SV[x][0]] == ['B'] and [x for x in SV if '바' in SV[x][0]] == ['D'], 'S-BF05 explanation: B and D are forced')

REVIEW = {
 'S-BF01': ('법조문 계산', '상', '2분 30초', '대상 품목·등급, 같은 품목 1대, 수급자 비율, 품목당·1인 한도', '한도·대상 누락', '사람별 대상 → 비율 → 한도', '고효율 가전 환급형, 조문 셋, 새로 설계'),
 'S-BF02': ('경우의 수', '상', '2분', '곱과 합 조건의 숫자 묶음, 짝수·배수 판정', '묶음 누락', '곱 36의 묶음부터', '맞춤수형, 새로 설계(전수)'),
 'S-BF03': ('법조문 적용', '상', '1분 30초', '폭·거리 경계, 철거 사유, 자진 철거 단서', '경계·단서 착오', '조문별 대조', '의류 수거함형, 조문 넷, 새로 설계'),
 'S-BF04': ('수리 추론', '상', '2분 30초', '최소공배수, 둘씩 겹침, 포함·배제', '중복 계산', '둘씩 최소공배수', '알람형, 새로 설계(전수)'),
 'S-BF05': ('최적화', '상', '3분', '반드시 필요한 서비스, 동반 조건, 결합 할인, 개수 제한', '규칙 하나 누락', '한 곳에만 있는 작품부터', '구독 서비스형, 새로 설계(31가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bf.py', 'review/sit-bf.md'), '상황판단 S-BF 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
