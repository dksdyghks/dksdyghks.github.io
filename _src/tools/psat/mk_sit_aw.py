# 상황판단 S-AW01..S-AW05 — 5급 실전(심화) 수준 정예 문항: 농업 직불금(구간 단가·정액·감액 단서), 타일 색칠(729가지 전수), 개인 과외 교습 신고 규정, 빠르고 느린 시계(정확한 분수 계산), 트럭 적재 최대 이익(조합 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-aw.js'

# ---------------------------------------------------------------- S-AW01 농업 직불금 (법조문 계산, 구간 단가·정액·감액 단서)
FARM = {'甲': (F(3, 2), 2000, 45, True, 10), '乙': (F(4), 1500, 72, False, 20), '丙': (F(8), 1000, 50, False, 15), '丁': (F(2, 5), 500, 66, True, 5), '戊': (F(3), 4000, 58, True, 12)}
# 경작 면적(ha), 농업 외 소득(만 원), 나이, 농약 안전 교육 이수, 농촌 거주 연수
def pay(k, tiers=True, flat=True, cut=True, age=True, income=True):
    ha, inc, ag, edu, yrs = FARM[k]
    if income and inc >= 3700: return F(0)
    if tiers: v = 200 * min(ha, 2) + 150 * max(F(0), min(ha, 6) - 2) + 100 * max(F(0), ha - 6)
    else: v = (200 if ha <= 2 else 150 if ha <= 6 else 100) * ha
    if flat and ha <= F(1, 2) and yrs >= 3: v = F(130)
    if cut and not edu and not (age and ag >= 70): v = v * F(9, 10)
    return v
each1 = {k: pay(k) for k in FARM}
check(each1 == {'甲': 300, '乙': 700, '丙': 1080, '丁': 130, '戊': 0}, f'S-AW01 {each1}')
tot1 = lambda **kw: sum(pay(k, **kw) for k in FARM)
alts1 = {'정답': tot1(), '구간 단가 오해': tot1(tiers=False), '70세 단서 누락': tot1(age=False), '감액 누락': tot1(cut=False), '소득 요건 누락': tot1(income=False)}
check(all(v.denominator == 1 for v in alts1.values()), 'S-AW01 integer amounts')
alts1 = {k: int(v) for k, v in alts1.items()}
check(alts1 == {'정답': 2210, '구간 단가 오해': 1750, '70세 단서 누락': 2140, '감액 누락': 2330, '소득 요건 누락': 2760}, f'S-AW01 {alts1}')
check(pay('丁', flat=False) == 80 and pay('戊', income=False) == 550, 'S-AW01 explanation parts')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, 'S-AW01 distinct')
items.append({
 'id': 'S-AW01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~戊가 받는 직불금의 합계는?',
 'body': [law('<p><b>제○○조(지급 대상)</b> 농지를 경작하는 농업인에게 직불금을 지급한다. 다만 농업 외의 소득이 3,700만 원 이상인 사람에게는 지급하지 아니한다.</p>'
              '<p><b>제○○조(면적 직불금)</b> 직불금은 경작 면적을 다음 각 호의 구간으로 나누어 각 구간의 면적에 해당 단가를 곱한 금액을 더하여 정한다.<br>1. 2ha 이하인 부분: 1ha당 200만 원<br>2. 2ha를 넘고 6ha 이하인 부분: 1ha당 150만 원<br>3. 6ha를 넘는 부분: 1ha당 100만 원</p>'
              '<p><b>제○○조(소농 직불금)</b> 경작 면적이 0.5ha 이하이고 농촌에 3년 이상 거주한 농업인에게는 제2조에도 불구하고 130만 원을 지급한다.</p>'
              '<p><b>제○○조(감액)</b> 농약 안전 사용 교육을 이수하지 아니한 농업인에게는 제2조 또는 제3조에 따른 금액의 100분의 10을 감액한다. 다만 70세 이상인 농업인은 그러하지 아니하다.</p>'),
          table(['농업인', '경작 면적', '농업 외 소득', '나이', '교육 이수'], [['甲', '1.5ha', '2,000만 원', '45세', '이수'], ['乙', '4ha', '1,500만 원', '72세', '미이수'], ['丙', '8ha', '1,000만 원', '50세', '미이수'], ['丁', '0.4ha', '500만 원', '66세', '이수'], ['戊', '3ha', '4,000만 원', '58세', '이수']], caption='농업인 현황', num=False, note='丁은 농촌에 5년째 거주하고 있다.')],
 'options': [f'{v:,}만 원' for v in vals1], 'answer': vals1.index(alts1['정답']),
 'explain': [
  steps(['甲: 1.5 × 200 = 300만 원.', '乙: 2 × 200 + 2 × 150 = 700만 원. 교육을 이수하지 않았지만 70세 이상이라 감액하지 않는다.', '丙: 2 × 200 + 4 × 150 + 2 × 100 = 1,200만 원, 교육 미이수로 10% 감액 → 1,080만 원.',
         '丁: 0.5ha 이하이고 5년 거주 → 소농 직불금 130만 원.', '戊: 농업 외 소득이 3,700만 원 이상이라 지급하지 않는다.']),
  p(f'합계 300 + 700 + 1,080 + 130 + 0 = <b>2,210만 원</b>. 따라서 정답은 <b>{CIRC[vals1.index(alts1["정답"])]}</b>이다. <b>함정</b> 구간을 나누지 않고 전체 면적에 한 단가를 곱하면 1,750만 원, 乙의 70세 단서를 놓치면 2,140만 원, 감액을 빠뜨리면 2,330만 원, 戊의 소득 요건을 놓치면 2,760만 원이다.')]})

# ---------------------------------------------------------------- S-AW02 타일 색칠 (729가지 전수)
ADJ = [(0, 1), (1, 2), (3, 4), (4, 5), (0, 3), (1, 4), (2, 5)]        # 윗줄 0·1·2, 아랫줄 3·4·5
COLS = [c for c in itertools.product('빨파노', repeat=6) if all(c[a] != c[b] for a, b in ADJ)]
two = sum(1 for c in COLS if len(set(c)) == 2); mid = sum(1 for c in COLS if c[1] == '빨' and c[4] == '파'); even = sum(1 for c in COLS if all(c.count(x) == 2 for x in '빨파노'))
t2 = {'ㄱ': len(COLS) == 54, 'ㄴ': two == 6, 'ㄷ': mid == 4, 'ㄹ': even == 12}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and mid == 9, f'S-AW02 {t2} {mid}')
tops = {}
for c in COLS: tops.setdefault(c[:3], 0); tops[c[:3]] += 1
by_kind = {('세 색' if len(set(t)) == 3 else '두 색'): n_ for t, n_ in tops.items()}
check(len(tops) == 12 and sorted(set(tops.values())) == [4, 5] and all(n_ == (4 if len(set(t)) == 3 else 5) for t, n_ in tops.items()), f'S-AW02 explanation per top row {tops}')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄹ', 'ㄴ, ㄷ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ']; ans2 = combo(t2, opts2, 'S-AW02')
items.append({
 'id': 'S-AW02', 'type': '상황판단 · 규칙 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('가로 3칸, 세로 2칸으로 이루어진 벽면의 타일 6장을 빨강, 파랑, 노랑 가운데 한 가지 색으로 각각 칠하려 한다. 변을 맞대고 있는 두 타일은 서로 다른 색으로 칠해야 하며, 꼭짓점만 닿는 두 타일은 같은 색이어도 된다. 세 가지 색을 모두 쓸 필요는 없고, 칸의 위치가 다르면 서로 다른 방법으로 센다.'),
          box('보기', ['ㄱ. 타일을 칠하는 방법은 모두 54가지이다.', 'ㄴ. 두 가지 색만으로 칠하는 방법은 6가지이다.', 'ㄷ. 윗줄 가운데 타일을 빨강, 아랫줄 가운데 타일을 파랑으로 칠하는 방법은 4가지이다.', 'ㄹ. 세 가지 색을 두 장씩 쓰는 방법은 12가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['윗줄을 먼저 칠하면 3 × 2 × 2 = 12가지이다. 윗줄이 세 색을 모두 쓰면(6가지) 아랫줄은 4가지, 두 색만 쓰면(빨파빨처럼, 6가지) 아랫줄은 5가지로 칠할 수 있다. 6 × 4 + 6 × 5 = 54가지(ㄱ).',
         'ㄴ: 두 색만 쓰면 바둑판처럼 번갈아 칠할 수밖에 없으므로 색 두 가지를 고르는 3가지 × 어느 색이 왼쪽 위인지 2가지 = 6가지.', 'ㄷ: 가운데 두 장이 정해지면 왼쪽 두 장과 오른쪽 두 장은 각각 3가지씩 칠할 수 있어 9가지이다.',
         'ㄹ: 세로 두 칸은 서로 다른 색이므로, 색마다 두 장씩 쓰려면 세 열이 빨파·빨노·파노를 하나씩 맡아야 한다. 열의 순서(6가지)와 열마다 위아래 배치(8가지) 가운데 가로로 이웃한 칸도 서로 다른 경우를 세면 12가지이다.']),
  bx([('ㄱ', '54가지', True, O, '6 × 4 + 6 × 5.'), ('ㄴ', '두 색 6가지', True, O, '번갈아 칠하는 방법뿐.'), ('ㄷ', '4가지', False, XX, '양쪽 끝 열이 각각 3가지라 9가지.'), ('ㄹ', '두 장씩 12가지', True, O, '모든 방법을 세어 확인.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 세 가지 색으로 칠하는 729가지를 모두 따져 확인하였다.')]})
side = [c for c in COLS if c[1] == '빨' and c[4] == '파']
check(all({frozenset((c[i], c[i + 3])) for i in range(3)} == {frozenset('빨파'), frozenset('빨노'), frozenset('파노')} for c in COLS if all(c.count(x) == 2 for x in '빨파노')), 'S-AW02 explanation ㄹ: three columns take the three colour pairs')
check(len({(c[0], c[3]) for c in side}) == 3 and len({(c[2], c[5]) for c in side}) == 3 and len(side) == 3 * 3, 'S-AW02 explanation ㄷ: 3 × 3')

# ---------------------------------------------------------------- S-AW03 개인 과외 교습 신고 (법조문 적용, 조문 넷, 옳은 것)
need_report = lambda student, on_leave: not (student and not on_leave)
place_ok = lambda place: place in ('교습자의 주거지', '학습자의 주거지')
fee_post_needed = lambda paid: paid
over_fee_ok = lambda consent: False
f3 = [not need_report(True, True), place_ok('카페'), over_fee_ok(True), not need_report(True, False) and place_ok('학습자의 주거지'), fee_post_needed(False)]
one_true(f3, 3, 'S-AW03')
items.append({
 'id': 'S-AW03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(신고)</b> 개인 과외 교습을 하려는 사람은 주소지를 관할하는 교육감에게 신고하여야 한다. 다만 대학(대학원을 포함한다)에 재학 중인 학생은 신고하지 아니하고 교습할 수 있으며, 휴학 중인 학생은 재학 중인 학생으로 보지 아니한다.</p>'
              '<p><b>제○○조(장소)</b> 개인 과외 교습은 교습자의 주거지 또는 학습자의 주거지에서만 할 수 있다.</p>'
              '<p><b>제○○조(교습비)</b> ① 신고한 교습자는 신고한 금액을 넘는 교습비를 받아서는 아니 된다.<br>② 교습비를 받는 교습자는 교습비를 학습자가 볼 수 있도록 게시하여야 한다.</p>'
              '<p><b>제○○조(과태료)</b> 제1조에 따라 신고하여야 하는 사람이 신고하지 아니하고 교습하면 300만 원 이하의 과태료를 부과한다.</p>')],
 'options': ['휴학 중인 대학생은 신고하지 아니하고 개인 과외 교습을 할 수 있다.', '신고한 교습자는 학습자와 합의하면 카페에서 개인 과외 교습을 할 수 있다.', '신고한 교습자는 학습자가 동의하면 신고한 금액보다 많은 교습비를 받을 수 있다.',
             '대학원에 재학 중인 학생은 신고하지 아니하고 학습자의 집에서 개인 과외 교습을 할 수 있다.', '교습비를 받지 않는 교습자도 교습비를 게시하여야 한다.'],
 'answer': 3,
 'explain': [
  ox([(False, XX, '제1조 단서: 휴학생은 재학생으로 보지 않으므로 신고해야 한다.'), (False, XX, '제2조: 교습자 또는 학습자의 주거지에서만 할 수 있다.'), (False, XX, '제3조 제1항: 동의에 관한 예외가 없다.'),
      (True, O, '제1조 단서: 대학원을 포함한 재학생은 신고 없이 교습할 수 있고, 학습자의 주거지는 제2조의 장소이다.'), (False, XX, '제3조 제2항: 교습비를 “받는” 교습자에게만 게시 의무가 있다.')]),
  p('따라서 정답은 <b>④</b>이다. <b>함정</b> 단서 안의 괄호(대학원 포함)와 간주 규정(휴학생 제외)을 함께 읽는다.')]})

# ---------------------------------------------------------------- S-AW04 빠르고 느린 시계 (정확한 분수 계산)
GA, GB = F(16, 15), F(9, 10)              # 甲 시계: 실제 1시간에 64분 / 乙 시계: 54분
show = lambda rate, t: 540 + rate * t     # 9시(540분)에 맞춘 뒤 실제로 t분 지났을 때 시계가 가리키는 시각(분)
real_at = lambda rate, clock_min: (clock_min - 540) / rate
hm = lambda m: (m // 60, m % 60)
t12 = real_at(GA, 720)
t4 = {'ㄱ': show(GA, 180) == 720 + 12, 'ㄴ': show(GB, t12) < 690, 'ㄷ': (GA - GB) * 360 == 60, 'ㄹ': real_at(GB, 720) < real_at(GA, 720)}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False} and t12 == F(675, 4) and show(GB, t12) == F(540 * 8 + 1215, 8) and real_at(GB, 720) == 200, f'S-AW04 {t4}')
check(540 + t12 == F(2835, 4) and show(GB, t12) > 691, 'S-AW04 explanation: 甲 12:00 = 실제 11시 48분 45초, 乙 그때 약 11시 31분 52초')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄷ, ㄹ', 'ㄱ, ㄴ, ㄹ']; ans4 = combo(t4, opts4, 'S-AW04')
items.append({
 'id': 'S-AW04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('甲의 시계는 실제 시간이 1시간 지날 때마다 64분이 지나고, 乙의 시계는 실제 시간이 1시간 지날 때마다 54분이 지난다. 두 시계는 일정한 빠르기로 가며, 甲과 乙은 오늘 실제 시각 오전 9시 정각에 두 시계를 정확히 맞추었다.'),
          box('보기', ['ㄱ. 실제 시각이 정오일 때 甲의 시계는 12시 12분을 가리킨다.', 'ㄴ. 甲의 시계가 12시 정각을 가리킬 때 乙의 시계는 11시 30분보다 이른 시각을 가리킨다.', 'ㄷ. 두 시계가 가리키는 시각의 차이는 실제 시각 오후 3시에 1시간이 된다.', 'ㄹ. 두 사람이 각자 자기 시계로 12시 정각에 약속 장소에 도착한다면 乙이 甲보다 먼저 도착한다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 실제 3시간 동안 甲의 시계는 3 × 64 = 192분, 곧 3시간 12분이 간다.', 'ㄴ: 甲의 시계가 3시간(180분) 가려면 실제로 180 × 60/64 = 168.75분이 지나야 하므로 실제 시각은 11시 48분 45초이다. 그동안 乙의 시계는 168.75 × 54/60 ≈ 151.9분이 가서 약 11시 31분 52초를 가리킨다. 11시 30분보다 늦다.',
         'ㄷ: 두 시계의 차이는 실제 1시간마다 10분씩 벌어지므로 6시간 뒤인 오후 3시에 1시간이 된다.', 'ㄹ: 乙의 시계로 12시는 실제 180 × 60/54 = 200분 뒤인 12시 20분이다. 甲(실제 11시 48분 45초)이 먼저 도착한다.']),
  bx([('ㄱ', '12시 12분', True, O, '64 × 3 = 192분.'), ('ㄴ', '11시 30분보다 이름', False, XX, '약 11시 31분 52초이다.'), ('ㄷ', '오후 3시에 1시간', True, O, '시간당 10분 × 6.'), ('ㄹ', '乙이 먼저', False, XX, '甲 11:48:45, 乙 12:20.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 빠른 시계로 맞춰 오면 실제로는 일찍, 느린 시계로 맞춰 오면 늦게 도착한다.')]})

# ---------------------------------------------------------------- S-AW05 트럭 적재 최대 이익 (조합 전수, 규칙 모두 필요)
GOODS = {'A': (35, 30, 90), 'B': (30, 30, 70), 'C': (35, 15, 50), 'D': (20, 10, 80), 'E': (30, 20, 20), 'F': (35, 25, 40)}   # 무게(kg), 부피(L), 이익(만 원)
NAMES5 = {'A': '세제', 'B': '생수', 'C': '냉동식품', 'D': '과일', 'E': '보냉 상자', 'F': '가전제품'}
def best5(wl=True, vl=True, cold=True, apart=True):
    bestv, arg = None, []
    for k in range(7):
        for s in itertools.combinations('ABCDEF', k):
            if wl and sum(GOODS[x][0] for x in s) > 100: continue
            if vl and sum(GOODS[x][1] for x in s) > 80: continue
            if cold and 'C' in s and 'E' not in s: continue
            if apart and 'A' in s and 'D' in s: continue
            v = sum(GOODS[x][2] for x in s)
            if bestv is None or v > bestv: bestv, arg = v, [s]
            elif v == bestv: arg.append(s)
    return bestv, arg
b5, a5 = best5()
check((b5, a5) == (190, [('B', 'D', 'F')]), f'S-AW05 {b5} {a5}')
traps5 = {'냉동 규칙': best5(cold=False), '분리 규칙': best5(apart=False), '무게 한도': best5(wl=False), '부피 한도': best5(vl=False)}
check(traps5 == {'냉동 규칙': (210, [('A', 'B', 'C')]), '분리 규칙': (240, [('A', 'B', 'D')]), '무게 한도': (220, [('B', 'C', 'D', 'E')]), '부피 한도': (200, [('A', 'B', 'F')])}, f'S-AW05 traps {traps5}')
withA = max(sum(GOODS[x][2] for x in s) for k in range(7) for s in itertools.combinations('ABCEF', k) if 'A' in s and sum(GOODS[x][0] for x in s) <= 100 and sum(GOODS[x][1] for x in s) <= 80 and not ('C' in s and 'E' not in s))
check(withA == 180, f'S-AW05 explanation: best load with A is A·B·E = 180 ({withA})')
opts5 = ['190만 원', '200만 원', '210만 원', '220만 원', '240만 원']
check([int(o[:-3]) for o in opts5].index(b5) == 0, 'S-AW05 options')
items.append({
 'id': 'S-AW05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 트럭 한 대로 얻을 수 있는 이익의 최댓값은?',
 'body': [p('甲은 물건 A~F 가운데 몇 가지를 골라 트럭 한 대에 실어 나르려 한다. 물건은 하나씩만 있고 나누어 실을 수 없다. 트럭에 실은 물건의 무게 합은 100kg, 부피 합은 80L를 넘을 수 없다. 냉동식품(C)을 실으려면 보냉 상자(E)도 함께 실어야 하고, 세제(A)와 과일(D)은 함께 실을 수 없다. 이익은 실은 물건의 이익을 더한 것이다.'),
          table(['물건', '무게(kg)', '부피(L)', '이익(만 원)'], [[f'{k}({NAMES5[k]})', str(w), str(v), str(p_)] for k, (w, v, p_) in GOODS.items()], caption='물건별 무게·부피·이익', num=False)],
 'options': opts5, 'answer': 0,
 'explain': [
  steps(['A를 실으면 D를 실을 수 없다. 이때 가장 나은 조합은 A·B·E(무게 95kg, 부피 80L)의 180만 원이다.', 'A를 빼면 D(이익이 크고 가벼움)를 싣는다. D·B·F: 무게 85kg, 부피 65L, 이익 190만 원.',
         'C를 실으려면 E도 실어야 해(합 65kg, 35L, 70만 원) 남은 자리로는 190만 원을 넘지 못한다.']),
  p('따라서 최댓값은 190만 원이고 정답은 <b>①</b>이다. 물건의 모든 조합을 따져 이 조합 하나뿐임을 확인하였다. <b>함정</b> 보냉 상자 규칙을 빼면 210만 원(A·B·C), A·D 분리 규칙을 빼면 240만 원(A·B·D), 무게 한도를 빼면 220만 원, 부피 한도를 빼면 200만 원이 된다.')]})
check(max(sum(GOODS[x][2] for x in s) for k in range(7) for s in itertools.combinations('ABDF', k) if 'C' not in s and sum(GOODS[x][0] for x in s) <= 100 and sum(GOODS[x][1] for x in s) <= 80 and not ('A' in s and 'D' in s)) == 190 and max(sum(GOODS[x][2] for x in s) for k in range(7) for s in itertools.combinations('ABCDEF', k) if 'C' in s and 'E' in s and sum(GOODS[x][0] for x in s) <= 100 and sum(GOODS[x][1] for x in s) <= 80 and not ('A' in s and 'D' in s)) < 190, 'S-AW05 explanation case split')

REVIEW = {
 'S-AW01': ('법조문 계산', '상', '3분', '구간별 단가 합산, 정액 특례, 감액과 나이 단서, 소득 요건', '구간을 나누지 않음 / 단서 누락', '농업인별 요건 → 구간 계산 → 감액', '농업 직불금형, 조문 넷, 새로 설계'),
 'S-AW02': ('규칙 추론', '상', '2분 30초', '이웃 조건 아래 색칠 경우의 수, 윗줄 유형별 나누기', '윗줄 유형별 경우 수 혼동', '윗줄을 먼저 정하기', '타일 색칠형, 새로 설계(729가지 전수)'),
 'S-AW03': ('법조문 적용', '상', '1분 30초', '단서 안의 괄호·간주 규정, 장소 제한, 교습비 게시 요건', '간주 규정 누락', '조문별 대조', '개인 과외 교습 신고형, 조문 넷, 새로 설계'),
 'S-AW04': ('수리 추론', '상', '2분 30초', '시계 속도 비율로 실제·표시 시각 바꾸기', '비율 방향 혼동', '실제 1시간 기준 비율', '시계 오차형, 새로 설계(정확한 분수 계산)'),
 'S-AW05': ('최적화', '상', '2분 30초', '두 한도와 두 규칙 아래 조합 최대 이익', '규칙 하나 누락', '배타 규칙으로 경우 나누기', '트럭 적재형, 새로 설계(조합 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_aw.py', 'review/sit-aw.md'), '상황판단 S-AW 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
