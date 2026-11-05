# 상황판단 S-AS01..S-AS05 — 5급 실전(심화) 수준 정예 문항: 이행강제금(조문 넷과 단서·상한), 성냥개비 식 고치기(한 개 옮기기 전수), 드론 비행 규정, 물탱크 채우기(구간별 정확한 분수 계산), 보안등 설치 최소 비용(배치 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-as.js'

# ---------------------------------------------------------------- S-AS01 이행강제금 (법조문 계산, 조문 넷과 단서·상한)
CASE = {'甲': (True, 40, 0, False), '乙': (True, 30, 20, True), '丙': (False, 0, 250, False), '丁': (True, 50, 20, False), '戊': (False, 450, 0, False)}   # 주거용, 무허가 건축 ㎡, 무단 용도 변경 ㎡, 같은 위반으로 부과받은 적
def levy(c, proviso=True, extra=True, cap=True, summed=True):
    home, a, b, before = c
    v = F(10 * a + 4 * b)
    area = a + b if summed else max(a, b)
    if home and area <= 60 and not (proviso and before): v /= 2
    if extra and a + b > 200: v *= F(6, 5)
    if cap and v > 5000: v = F(5000)
    return v
each1 = {k: levy(c) for k, c in CASE.items()}
check(each1 == {'甲': 200, '乙': 380, '丙': 1200, '丁': 580, '戊': 5000}, f'S-AS01 {each1}')
tot1 = lambda **kw: int(sum(levy(c, **kw) for c in CASE.values()))
alts1 = {'정답': tot1(), '단서 누락': tot1(proviso=False), '가산 누락': tot1(extra=False), '상한 누락': tot1(cap=False), '면적 합산 누락': tot1(summed=False)}
check(alts1 == {'정답': 7360, '단서 누락': 7170, '가산 누락': 6660, '상한 누락': 7760, '면적 합산 누락': 7070}, f'S-AS01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, 'S-AS01 distinct')
items.append({
 'id': 'S-AS01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~戊에게 이번에 부과되는 이행강제금의 합계는?',
 'body': [law('<p><b>제○○조(이행강제금)</b> 시장은 위반 건축물에 대한 시정명령을 받고 기한까지 이행하지 아니한 건축주에게 다음 각 호의 금액을 더한 이행강제금을 부과한다.<br>1. 허가 없이 건축한 부분: 그 면적 1㎡당 10만 원<br>2. 허가 없이 용도를 바꾼 부분: 그 면적 1㎡당 4만 원</p>'
              '<p><b>제○○조(감경)</b> 위반 건축물이 주거용이고 제1조 각 호의 면적을 합한 위반 면적이 60㎡ 이하이면 이행강제금의 2분의 1을 감경한다. 다만 같은 위반으로 이행강제금을 부과받은 적이 있는 경우에는 감경하지 아니한다.</p>'
              '<p><b>제○○조(가산)</b> 위반 면적이 200㎡를 넘으면 제1조와 제2조에 따라 정한 금액에 그 100분의 20을 더한다.</p>'
              '<p><b>제○○조(상한)</b> 한 번에 부과하는 이행강제금은 5,000만 원을 넘을 수 없다.</p>'),
          table(['건축주', '건축물', '허가 없이 건축', '허가 없이 용도 변경', '비고'], [['甲', '주거용', '40㎡', '—', '—'], ['乙', '주거용', '30㎡', '20㎡', '같은 위반으로 부과받은 적 있음'], ['丙', '상가', '—', '250㎡', '—'], ['丁', '주거용', '50㎡', '20㎡', '—'], ['戊', '공장', '450㎡', '—', '—']], caption='위반 건축물 현황', num=False)],
 'options': [f'{v:,}만 원' for v in vals1], 'answer': vals1.index(alts1['정답']),
 'explain': [
  steps(['甲: 400만 원, 주거용·40㎡ → 감경하여 200만 원.', '乙: 300 + 80 = 380만 원. 50㎡이지만 같은 위반으로 부과받은 적이 있어 감경하지 않는다.', '丙: 1,000만 원, 250㎡ → 100분의 20 가산하여 1,200만 원.',
         '丁: 500 + 80 = 580만 원. 위반 면적은 두 부분을 합한 70㎡이므로 감경 대상이 아니다.', '戊: 4,500만 원 × 1.2 = 5,400만 원 → 상한 5,000만 원.']),
  p(f'합계 200 + 380 + 1,200 + 580 + 5,000 = <b>7,360만 원</b>. 따라서 정답은 <b>{CIRC[vals1.index(alts1["정답"])]}</b>이다. <b>함정</b> 乙의 단서를 놓치면 7,170만 원, 가산을 빠뜨리면 6,660만 원, 상한을 빠뜨리면 7,760만 원, 丁의 면적을 합산하지 않으면 7,070만 원이다.')]})

# ---------------------------------------------------------------- S-AS02 성냥개비 식 고치기 (한 개 옮기기 전수)
SEG = {'0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '+': 'hv', '-': 'h'}
INV = {frozenset(v): k for k, v in SEG.items()}
check(len(INV) == len(SEG), 'S-AS02 shapes distinct')
def moved(expr):
    out = set(); pos = [i for i, c in enumerate(expr) if c != '=']
    for i in pos:
        for s in SEG[expr[i]]:
            for j in pos:
                kind = 'hv' if expr[j] in '+-' else 'abcdefg'
                for t in kind:
                    new = list(expr)
                    if i == j:
                        if t == s: continue
                        sh = (set(SEG[expr[i]]) - {s}) | {t}
                        if t in SEG[expr[i]] or frozenset(sh) not in INV: continue
                        new[i] = INV[frozenset(sh)]
                    else:
                        a_, b_ = set(SEG[expr[i]]) - {s}, set(SEG[expr[j]]) | {t}
                        if t in SEG[expr[j]] or frozenset(a_) not in INV or frozenset(b_) not in INV: continue
                        new[i], new[j] = INV[frozenset(a_)], INV[frozenset(b_)]
                    if any((expr[k] in '+-') != (new[k] in '+-') for k in pos): continue
                    out.add(''.join(new))
    return out
def true_eq(e):
    l_, r_ = e.split('='); a, op, b = l_[0], l_[1], l_[2]
    return (int(a) + int(b) if op == '+' else int(a) - int(b)) == int(r_)
fix = {e: sorted(x for x in moved(e) if true_eq(x)) for e in ['5+7=2', '2+7=3', '8-3=3', '6+4=4']}
check(fix == {'5+7=2': ['9-7=2'], '2+7=3': [], '8-3=3': ['0+3=3', '8-3=5', '8-5=3'], '6+4=4': ['0+4=4', '8-4=4']}, f'S-AS02 {fix}')
t2 = {'ㄱ': len(fix['5+7=2']) > 0, 'ㄴ': len(fix['2+7=3']) > 0, 'ㄷ': len(fix['8-3=3']) == 3, 'ㄹ': fix['6+4=4'] == ['8-4=4']}
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄷ, ㄹ', 'ㄱ, ㄴ, ㄷ']; ans2 = combo(t2, opts2, 'S-AS02')
NAMES2 = {'a': '위 가로(a)', 'b': '오른쪽 위 세로(b)', 'c': '오른쪽 아래 세로(c)', 'd': '아래 가로(d)', 'e': '왼쪽 아래 세로(e)', 'f': '왼쪽 위 세로(f)', 'g': '가운데 가로(g)'}
show = lambda e: e.replace('-', ' − ').replace('+', ' + ').replace('=', ' = ')
items.append({
 'id': 'S-AS02', 'type': '상황판단 · 규칙 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('성냥개비로 ‘한 자리 수 + 한 자리 수 = 한 자리 수’ 또는 ‘한 자리 수 − 한 자리 수 = 한 자리 수’ 꼴의 식을 만든다. 숫자는 디지털 시계처럼 일곱 자리 a~g(위 가로 a, 오른쪽 위 세로 b, 오른쪽 아래 세로 c, 아래 가로 d, 왼쪽 아래 세로 e, 왼쪽 위 세로 f, 가운데 가로 g)에 성냥개비를 놓아 아래 표와 같이 만들고, +는 가로·세로 두 개, −는 가로 한 개로 만든다. ‘한 개 옮기기’란 등호(=)가 아닌 곳에서 성냥개비 하나를 빼서 등호가 아닌 다른 빈자리에 놓는 것이다. 옮긴 뒤 모든 글자는 표의 숫자 또는 +, −여야 하고, 숫자 자리와 기호 자리는 그대로이며 새 글자를 만들 수 없다.'),
          table(['숫자', '쓰는 자리', '개수'], [[k, ', '.join(SEG[k]), str(len(SEG[k]))] for k in '0123456789'], caption='숫자 모양', num=False),
          box('보기', ['ㄱ. 식 5 + 7 = 2는 한 개 옮기기로 참인 식을 만들 수 있다.', 'ㄴ. 식 2 + 7 = 3은 한 개 옮기기로 참인 식을 만들 수 있다.', 'ㄷ. 식 8 − 3 = 3을 한 개 옮기기로 고쳐 만들 수 있는 참인 식은 세 가지이다.', 'ㄹ. 식 6 + 4 = 4를 한 개 옮기기로 고쳐 만들 수 있는 참인 식은 8 − 4 = 4뿐이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: + 의 세로 막대를 빼서 5의 b 자리에 놓으면 9 − 7 = 2가 된다.',
         'ㄴ: 2 + 7 = 3에서 막대 하나로 값을 맞추는 길이 없다. 개수가 같은 숫자끼리(2·3·5, 0·6·9) 바꾸거나, 한 글자에서 빼서 다른 글자에 더하는 경우를 모두 따져도 참인 식이 나오지 않는다.',
         'ㄷ: 8의 g를 빼서 −에 세로로 놓으면 0 + 3 = 3, 오른쪽 3의 b를 f 자리로 옮기면 8 − 3 = 5, 왼쪽 3의 b를 f 자리로 옮기면 8 − 5 = 3이 된다. 이 세 가지뿐이다.',
         'ㄹ: 8 − 4 = 4(+ 의 세로를 6의 b 자리로) 말고도 0 + 4 = 4(6의 g를 b 자리로)가 있다.']),
  bx([('ㄱ', '5 + 7 = 2', True, O, '9 − 7 = 2.'), ('ㄴ', '2 + 7 = 3', False, XX, '어떤 한 개 옮기기로도 참이 되지 않는다.'), ('ㄷ', '8 − 3 = 3 세 가지', True, O, '0 + 3 = 3, 8 − 3 = 5, 8 − 5 = 3.'), ('ㄹ', '6 + 4 = 4 한 가지', False, XX, '0 + 4 = 4도 있다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 성냥개비 하나를 빼고 놓는 모든 경우를 따져 확인하였다.')]})
check(set(SEG['8']) - {'g'} == set(SEG['0']) and (set(SEG['3']) - {'b'}) | {'f'} == set(SEG['5']) and (set(SEG['6']) - {'g'}) | {'b'} == set(SEG['0']) and set(SEG['6']) | {'b'} == set(SEG['8']) and set(SEG['5']) | {'b'} == set(SEG['9']), 'S-AS02 explanation moves')

# ---------------------------------------------------------------- S-AS03 드론 비행 규정 (법조문 적용, 조문 넷, 옳은 것)
def need_ok(kg, near_airport, high): return kg > 20 or near_airport or high
def night_ok(approved): return approved
def license_needed(kg, test_zone): return kg > 2 and not test_zone
def insurance_needed(commercial): return commercial
f3 = [need_ok(15, True, False), not need_ok(30, False, False), not insurance_needed(True), not license_needed(5, False), night_ok(True) is False]
one_true(f3, 0, 'S-AS03')
items.append({
 'id': 'S-AS03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(비행 승인)</b> ① 무게가 20kg을 넘는 드론을 날리려는 사람은 관할 청장의 비행 승인을 받아야 한다.<br>② 다음 각 호의 어느 하나에 해당하는 곳에서 드론을 날리려는 사람은 무게와 관계없이 비행 승인을 받아야 한다.<br>1. 비행장 중심에서 반경 5km 이내<br>2. 지상에서 120m 이상의 높이</p>'
              '<p><b>제○○조(야간 비행)</b> 해가 진 뒤부터 해가 뜨기 전까지는 드론을 날릴 수 없다. 다만 야간 비행에 대하여 관할 청장의 승인을 받은 경우에는 그러하지 아니하다.</p>'
              '<p><b>제○○조(조종 자격)</b> 무게가 2kg을 넘는 드론을 조종하려는 사람은 조종 자격을 갖추어야 한다. 다만 지정된 시험 비행 구역 안에서 조종하는 경우에는 그러하지 아니하다.</p>'
              '<p><b>제○○조(보험)</b> 돈을 받고 촬영·배송 등을 하기 위하여 드론을 사용하는 사람은 무게와 관계없이 보험에 가입하여야 한다.</p>')],
 'options': ['무게 15kg인 드론을 비행장 중심에서 3km 떨어진 곳에서 낮에 날리려면 비행 승인을 받아야 한다.', '무게 30kg인 드론이라도 지정된 시험 비행 구역 안이라면 비행 승인 없이 날릴 수 있다.',
             '무게 1kg인 드론으로 돈을 받고 결혼식을 촬영하는 사람은 보험에 가입하지 않아도 된다.', '무게 5kg인 드론을 시험 비행 구역 밖에서 취미로 조종하는 사람은 조종 자격이 없어도 된다.', '야간 비행에 대하여 승인을 받았더라도 해가 진 뒤에는 드론을 날릴 수 없다.'],
 'answer': 0,
 'explain': [
  ox([(True, O, '제1조 제2항 제1호: 비행장 반경 5km 이내이므로 무게와 관계없이 승인을 받아야 한다.'), (False, XX, '시험 비행 구역 예외는 제3조(조종 자격)의 단서일 뿐, 20kg을 넘으면 제1조 제1항의 승인이 필요하다.'),
      (False, XX, '제4조: 무게와 관계없이 보험에 가입해야 한다.'), (False, XX, '2kg을 넘고 시험 비행 구역 밖이므로 조종 자격이 필요하다.'), (False, XX, '제2조 단서: 승인을 받으면 날릴 수 있다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> 한 조문의 단서(시험 비행 구역)를 다른 조문의 의무(비행 승인)에 끌어다 쓰지 않는다.')]})

# ---------------------------------------------------------------- S-AS04 물탱크 채우기 (구간별 정확한 분수 계산)
def fill(start, open_, half_rule=True):
    lvl, t = F(start), F(0)
    while lvl < 1:
        v = (F(1, 6) if 'A' in open_ else 0) + (F(1, 4) * (F(1, 2) if half_rule and lvl >= F(1, 2) else 1) if 'B' in open_ else 0) - (F(1, 12) if 'C' in open_ else 0)
        if v <= 0: return None
        nxt = F(1, 2) if lvl < F(1, 2) else F(1)
        t += (nxt - lvl) / v; lvl = nxt
    return t
tAB, tA, tB, tABC, tBC = fill(0, 'AB'), fill(0, 'A'), fill(0, 'B'), fill(0, 'ABC'), fill(0, 'BC')
check((tAB, tA, tB, tABC, tBC) == (F(102, 35), 6, 6, F(39, 10), 15), f'S-AS04 {(tAB, tA, tB, tABC, tBC)}')
t4 = {'ㄱ': tAB < 3, 'ㄴ': tB < tA, 'ㄷ': tABC < 4, 'ㄹ': tBC > 12}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': True} and fill(0, 'B', half_rule=False) == 4 and fill(0, 'AB', half_rule=False) == F(12, 5), f'S-AS04 {t4}')
opts4 = ['ㄱ, ㄷ', 'ㄴ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-AS04')
items.append({
 'id': 'S-AS04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('물탱크에 물을 넣는 관 A, B와 물을 빼는 관 C가 있다. 빈 물탱크를 가득 채우는 데 A만 열면 6시간, B만 열면 4시간이 걸리고, 가득 찬 물탱크를 C만 열어 비우는 데는 12시간이 걸린다. 다만 B는 물탱크에 물이 절반 이상 차 있으면 물을 넣는 속도가 원래의 절반으로 줄어든다. A와 C의 속도는 늘 일정하며, 관을 여러 개 열면 각 관의 효과가 그대로 더해진다.'),
          box('보기', ['ㄱ. 빈 물탱크에서 A와 B를 함께 열면 3시간이 되기 전에 가득 찬다.', 'ㄴ. 빈 물탱크에서 B만 열면 A만 열 때보다 빨리 가득 찬다.', 'ㄷ. 빈 물탱크에서 A, B, C를 모두 열면 4시간이 되기 전에 가득 찬다.', 'ㄹ. 빈 물탱크에서 B와 C만 열면 가득 차는 데 12시간이 넘게 걸린다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  p('한 시간에 채우는 양(물탱크 전체 = 1): A 1/6, B 1/4(절반 이상이면 1/8), C −1/12.'),
  steps(['ㄱ: 절반까지 (1/6 + 1/4) = 5/12 → 1.2시간, 나머지 절반 (1/6 + 1/8) = 7/24 → 약 1.71시간. 합 약 2.91시간으로 3시간보다 짧다.', 'ㄴ: B만이면 절반까지 2시간, 나머지 절반 4시간으로 6시간이 걸려 A만 열 때(6시간)와 같다.',
         'ㄷ: 절반까지 1/3 → 1.5시간, 나머지 절반 5/24 → 2.4시간. 합 3.9시간.', 'ㄹ: 절반까지 1/6 → 3시간, 나머지 절반 1/24 → 12시간. 합 15시간.']),
  bx([('ㄱ', 'A + B 3시간 전', True, O, '약 2.91시간.'), ('ㄴ', 'B만 더 빠름', False, XX, '둘 다 6시간이다.'), ('ㄷ', 'A + B + C 4시간 전', True, O, '3.9시간.'), ('ㄹ', 'B + C 12시간 넘게', True, O, '15시간.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> B의 속도 감소를 빠뜨리면 B만 열 때 4시간으로 A보다 빠르다고 잘못 판단한다.')]})

# ---------------------------------------------------------------- S-AS05 보안등 설치 최소 비용 (배치 전수, 규칙 모두 필요)
PTS5 = range(13); POLE5 = {0, 4, 8, 12}; BAN5 = {8}; SCH5 = (6, 7)
def best5(school=True, ban=True, pole=True):
    bestc, arg = None, []
    cand = [x for x in PTS5 if not (ban and x in BAN5)]
    for k in range(1, 8):
        for S in itertools.combinations(cand, k):
            cov = {q: sum(1 for s in S if abs(s - q) <= 2) for q in PTS5}
            if min(cov.values()) == 0 or (school and any(cov[q] < 2 for q in SCH5)): continue
            c = sum(20 if (pole and s in POLE5) else 30 for s in S)
            if bestc is None or c < bestc: bestc, arg = c, [S]
            elif c == bestc: arg.append(S)
    return bestc, arg
b5, a5 = best5()
check((b5, a5) == (100, [(0, 5, 7, 12)]) and best5(school=False)[0] == 80 and best5(ban=False)[0] == 90 and best5(pole=False)[0] == 120, f'S-AS05 {b5} {a5}')
check([x for x in PTS5 if abs(x - 6) <= 2 and abs(x - 7) <= 2] == [5, 6, 7, 8], 'S-AS05 explanation: lights covering both school points')
opts5 = ['80만 원', '90만 원', '100만 원', '110만 원', '120만 원']
check([int(o[:-3]) for o in opts5].index(b5) == 2, 'S-AS05 options')
items.append({
 'id': 'S-AS05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 보안등 설치에 드는 최소 비용은?',
 'body': [p('곧게 뻗은 길 위에 100m 간격으로 지점 0~12가 있다. 甲시는 이 가운데 몇 지점에 보안등을 설치하여 모든 지점을 비추려 한다. 보안등 하나는 설치한 지점과 그 양쪽으로 200m 안에 있는 지점을 비춘다. 보안등을 설치하는 비용은 전신주가 있는 지점(0, 4, 8, 12)이면 1개에 20만 원, 그 밖의 지점이면 1개에 30만 원이다. 지점 6과 7은 학교 앞이어서 각각 보안등 두 개 이상이 비추어야 한다. 지점 8은 바로 옆 주택의 빛 공해 민원 때문에 보안등을 설치할 수 없다.')],
 'options': opts5, 'answer': 2,
 'explain': [
  steps(['지점 6과 7을 함께 비추는 보안등은 지점 5~8에 설치한 것뿐이고, 8은 설치할 수 없으므로 5·6·7 가운데 두 곳(각 30만 원)이 필요하다.', '이 두 등은 지점 3~9 안쪽만 비추므로 지점 0 쪽과 12 쪽에 등이 하나씩 더 필요하다. 가장 싼 것은 전신주가 있는 0과 12(각 20만 원)이다.',
         '0은 0~2, 12는 10~12를 비추므로, 가운데 두 등이 3과 9를 비추려면 5와 7이어야 한다. 0, 5, 7, 12 → 20 + 30 + 30 + 20 = 100만 원.']),
  p('따라서 정답은 <b>③</b>이다. 설치 지점의 모든 조합을 따져 이 배치 하나뿐임을 확인하였다. <b>함정</b> 학교 앞 조건을 빼면 80만 원(0, 4, 8, 12), 설치 금지를 빼면 90만 원, 전신주 할인을 빼면 120만 원이다.')]})

REVIEW = {
 'S-AS01': ('법조문 계산', '상', '2분 30초', '두 위반 면적 합산, 감경과 단서, 가산과 상한의 적용 순서', '면적 합산·단서·상한 누락', '건축주별 금액 → 감경·가산 → 상한', '이행강제금형, 조문 넷, 새로 설계'),
 'S-AS02': ('규칙 추론', '상', '3분', '성냥개비 한 개 옮기기의 모든 경우, 개수 보존', '다른 글자로 옮기는 경우 누락', '개수가 같은 숫자끼리 묶기', '성냥개비 식형, 새로 설계(한 개 옮기기 전수)'),
 'S-AS03': ('법조문 적용', '상', '1분 30초', '승인 요건(무게·장소), 야간 단서, 자격 단서, 보험', '다른 조문의 단서를 끌어다 씀', '조문별 대조', '드론 비행 규정형, 조문 넷, 새로 설계'),
 'S-AS04': ('수리 추론', '상', '2분 30초', '구간별로 바뀌는 속도의 일률 계산', '속도 감소 조건 누락', '절반까지·절반 뒤로 나누기', '물탱크형, 새로 설계(정확한 분수 계산)'),
 'S-AS05': ('최적화', '상', '2분 30초', '구간 덮기, 이중 조건, 설치 금지와 비용 차이', '조건 하나 누락', '학교 앞부터 고정', '보안등 배치형, 새로 설계(조합 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_as.py', 'review/sit-as.md'), '상황판단 S-AS 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
