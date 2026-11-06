# 상황판단 S-BP01..S-BP05 — 5급 실전(심화) 수준 정예 문항: 공공 캠핑장 이용료(성수기 가산·추가 인원·감면 범위), 화분 색칠(전수), 공공 텃밭 조례, 소금물 농도, 식단 최소 비용(255가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bp.js'

# ---------------------------------------------------------------- S-BP01 공공 캠핑장 이용료 (법조문 계산)
USERS = {'甲': (True, 7, ['금', '토'], 5, True), '乙': (False, 6, ['목', '금'], 4, False), '丙': (True, 8, ['일'], 6, True), '丁': (False, 9, ['토'], 3, True)}   # 관내 주민, 월, 묵은 밤의 요일, 인원, 전기
def fee(k, peak=True, disc=True, disc_all=False, per_night=True):
    res, mon, nights, ppl, el = USERS[k]
    base = sum(F(40000 if d in ('금', '토') else 30000) for d in nights)
    if peak and mon in (7, 8): base *= F(3, 2)
    extra = 5000 * max(0, ppl - 4) * (len(nights) if per_night else 1)
    elec = 5000 * len(nights) if el else 0
    if disc and res:
        if disc_all: return (base + extra + elec) * F(4, 5)
        base *= F(4, 5)
    return base + extra + elec
each1 = {k: int(fee(k)) for k in USERS}
check(each1 == {'甲': 116000, '乙': 70000, '丙': 51000, '丁': 45000}, f'S-BP01 {each1}')
tot1 = lambda **kw: int(sum(fee(k, **kw) for k in USERS))
alts1 = {'정답': tot1(), '성수기 가산 누락': tot1(peak=False), '감면 누락': tot1(disc=False), '감면을 전부에': tot1(disc_all=True), '추가 인원 한 번만': tot1(per_night=False)}
check(alts1 == {'정답': 282000, '성수기 가산 누락': 238000, '감면 누락': 315000, '감면을 전부에': 275000, '추가 인원 한 번만': 277000}, f'S-BP01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BP01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BP01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낸 캠핑장 이용료의 합계는?',
 'body': [law('<p><b>제○○조(이용료)</b> ① 캠핑장 한 구획의 기본 이용료는 1박에 30,000원으로 한다. 다만 금요일 밤과 토요일 밤은 1박에 40,000원으로 한다.<br>② 7월과 8월에는 제1항의 기본 이용료에 그 100분의 50을 더한다.<br>③ 한 구획의 기본 인원은 4명이며, 4명을 넘는 인원에 대해서는 1명 1박마다 5,000원을 더 받는다.</p>'
              '<p><b>제○○조(전기 사용료)</b> 구획에서 전기를 쓰는 경우 1박마다 5,000원을 받는다.</p>'
              '<p><b>제○○조(감면)</b> 관내 주민에게는 제○○조(이용료) 제1항과 제2항에 따른 이용료의 100분의 20을 감면한다. 추가 인원 요금과 전기 사용료는 감면하지 아니한다.</p>'),
          box('상황', ['甲(관내 주민): 7월에 금요일 밤과 토요일 밤 2박, 5명, 전기 사용', '乙: 6월에 목요일 밤과 금요일 밤 2박, 4명, 전기 사용 안 함', '丙(관내 주민): 8월에 일요일 밤 1박, 6명, 전기 사용', '丁: 9월에 토요일 밤 1박, 3명, 전기 사용'], plain=True)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 기본 40,000 × 2 = 80,000원에 성수기 50%를 더해 120,000원, 20% 감면 → 96,000원. 추가 인원 1명 × 2박 = 10,000원, 전기 2박 10,000원 → 116,000원.',
         '乙: 목요일 30,000원 + 금요일 40,000원 = 70,000원.', '丙: 30,000 × 1.5 = 45,000원, 20% 감면 → 36,000원. 추가 인원 2명 × 1박 = 10,000원, 전기 5,000원 → 51,000원.', '丁: 토요일 40,000원 + 전기 5,000원 = 45,000원.']),
  p(f'합계 116,000 + 70,000 + 51,000 + 45,000 = <b>282,000원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 성수기 가산을 빼면 238,000원, 감면을 빼면 315,000원, 추가 인원 요금과 전기 사용료까지 감면하면 275,000원, 추가 인원 요금을 1박마다가 아니라 한 번만 받으면 277,000원이다.')]})

# ---------------------------------------------------------------- S-BP02 화분 색칠 (전수)
SEQ = [s for s in itertools.product('빨노파', repeat=5) if all(a != b for a, b in zip(s, s[1:]))]
t2 = {'ㄱ': len(SEQ) == 48, 'ㄴ': sum(len(set(s)) == 2 for s in SEQ) == 6, 'ㄷ': sum(s[0] == s[4] for s in SEQ) == 24, 'ㄹ': sum(s.count('빨') == 3 for s in SEQ) == 4}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and sum(s[0] == s[4] for s in SEQ) == 18, f'S-BP02 {t2}')
check(3 * 2 ** 4 == 48 and 3 * 2 == 6 and 2 * 2 == 4, 'S-BP02 explanation counts')
check([s for s in SEQ if s.count('빨') == 3] == [s for s in SEQ if s[0] == s[2] == s[4] == '빨'], 'S-BP02 red three times only at 1·3·5')
opts2 = ['ㄱ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ', 'ㄱ, ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BP02')
items.append({
 'id': 'S-BP02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('화분 다섯 개가 한 줄로 놓여 있다. 각 화분을 빨강, 노랑, 파랑 가운데 한 가지 색으로 칠하되, 바로 옆에 놓인 두 화분은 서로 다른 색으로 칠한다. 세 가지 색을 모두 쓸 필요는 없다.'),
          box('보기', ['ㄱ. 화분을 칠하는 방법은 모두 48가지이다.', 'ㄴ. 두 가지 색만 써서 칠하는 방법은 6가지이다.', 'ㄷ. 양 끝 화분의 색이 같은 방법은 24가지이다.', 'ㄹ. 빨강을 세 번 쓰는 방법은 4가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 첫 화분 3가지, 나머지 네 화분은 바로 앞과 다른 2가지씩 → 3 × 2 × 2 × 2 × 2 = 48가지.', 'ㄴ: 두 색을 고르는 방법 3가지, 고른 두 색을 번갈아 칠하는 방법이 첫 색에 따라 2가지 → 6가지.',
         'ㄷ: 첫 화분의 색마다, 다섯째 화분이 첫 화분과 같은 경우는 6가지이다(첫째가 빨강이면 둘째~넷째를 칠하는 8가지 가운데 넷째가 빨강이 아닌 6가지). → 3 × 6 = 18가지.',
         'ㄹ: 빨강 세 개가 서로 붙지 않으려면 첫째·셋째·다섯째에 와야 하고, 둘째와 넷째는 노랑이나 파랑 → 2 × 2 = 4가지.']),
  bx([('ㄱ', '48가지', True, O, '3 × 2⁴.'), ('ㄴ', '6가지', True, O, '3 × 2.'), ('ㄷ', '24가지', False, XX, '18가지이다.'), ('ㄹ', '4가지', True, O, '2 × 2.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 48가지를 모두 나열해 확인하였다.')]})
red_first = [s for s in SEQ if s[0] == '빨']
check(len(red_first) == 16 and sum(s[4] == '빨' for s in red_first) == 6 and len({s[1:4] for s in red_first}) == 8 and sum(s[3] != '빨' for s in {s[:4] for s in red_first}) == 6, 'S-BP02 explanation ㄷ')

# ---------------------------------------------------------------- S-BP03 공공 텃밭 조례 (법조문 적용, 옳은 것)
def eligible(months, age, disabled=False): return months >= (6 if (age >= 65 or disabled) else 12)
def plots_ok(per_household): return per_household <= 1
def max_years(term, ext_times, ext_len): return term + ext_times * ext_len
def inputs_ok(compost, chem_fert, chem_pest): return not chem_fert and not chem_pest
def reclaim(idle_months, violated=False, lent=False): return idle_months > 3 or violated or lent
f3 = [plots_ok(2), max_years(1, 1, 1) >= 3, inputs_ok(True, True, False), reclaim(2), eligible(8, 70)]
one_true(f3, 4, 'S-BP03')
check(not eligible(8, 60) and eligible(12, 60) and reclaim(4), 'S-BP03 boundaries')
items.append({
 'id': 'S-BP03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(신청 자격)</b> 공공 텃밭은 신청일 현재 갑구에 1년 이상 주소를 둔 사람이 신청할 수 있다. 다만 장애인과 65세 이상인 사람은 6개월 이상 주소를 두었으면 신청할 수 있다.</p>'
              '<p><b>제○○조(분양)</b> ① 텃밭은 한 세대에 한 구획만 분양한다.<br>② 분양 기간은 1년으로 하며, 한 번에 한하여 1년 연장할 수 있다.</p>'
              '<p><b>제○○조(경작)</b> 텃밭에서는 화학 비료와 화학 농약을 쓸 수 없다. 다만 퇴비는 쓸 수 있다.</p>'
              '<p><b>제○○조(회수)</b> 구청장은 분양받은 사람이 다음 각 호의 어느 하나에 해당하면 분양을 취소하고 구획을 회수할 수 있다.<br>1. 3개월을 넘게 경작하지 아니한 경우<br>2. 제○○조(경작)를 위반한 경우<br>3. 구획을 다른 사람에게 빌려준 경우</p>')],
 'options': ['같은 세대인 부부는 각자 한 구획씩 분양받을 수 있다.', '처음 분양받은 사람은 연장을 거쳐 최대 3년 동안 경작할 수 있다.', '퇴비와 함께라면 화학 비료를 쓸 수 있다.', '2개월 동안 경작하지 않으면 구청장은 구획을 회수할 수 있다.', '갑구에 8개월째 주소를 둔 70세 甲은 텃밭을 신청할 수 있다.'],
 'answer': 4,
 'explain': [
  ox([(False, XX, '한 세대에 한 구획만 분양한다.'), (False, XX, '분양 1년에 한 번 1년 연장하여 최대 2년이다.'), (False, XX, '화학 비료는 쓸 수 없고, 퇴비만 쓸 수 있다.'),
      (False, XX, '3개월을 넘게 경작하지 않아야 회수할 수 있다.'), (True, O, '65세 이상이므로 6개월 이상 주소를 두었으면 신청할 수 있다.')]),
  p('따라서 정답은 <b>⑤</b>이다. <b>함정</b> 단서(65세 이상·장애인)의 완화된 기준, 세대 단위, 연장 횟수, ‘넘게’의 기준을 확인한다.')]})

# ---------------------------------------------------------------- S-BP04 소금물 농도 (수리 추론)
A_W, A_C, B_W, B_C = 300, F(10, 100), 200, F(4, 100)
sa, sb = A_W * A_C, B_W * B_C
t4 = {'ㄱ': F(sa + sb, A_W + B_W) == F(76, 1000), 'ㄴ': F(sa, A_W - 50) == F(125, 1000), 'ㄷ': F(sb + 100 * A_C, B_W + 100) == F(6, 100), 'ㄹ': sa / B_C - A_W == 400}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False} and F(sa, A_W - 50) == F(12, 100) and sa / B_C - A_W == 450, f'S-BP04 {t4}')
opts4 = ['ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BP04')
items.append({
 'id': 'S-BP04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('그릇 A에는 농도 10%의 소금물 300g이, 그릇 B에는 농도 4%의 소금물 200g이 들어 있다. 소금물의 농도(%)는 소금의 무게를 소금물 전체의 무게로 나누어 100을 곱한 값이며, 물이 증발할 때 소금은 줄지 않는다.'),
          box('보기', ['ㄱ. A와 B를 모두 한 그릇에 섞으면 농도는 7.6%가 된다.', 'ㄴ. A에서 물 50g을 증발시키면 A의 농도는 12.5%가 된다.', 'ㄷ. A에서 소금물 100g을 덜어 B에 부으면 B의 농도는 6%가 된다.', 'ㄹ. A에 물을 400g 더 부으면 A의 농도는 B와 같아진다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['소금: A 30g, B 8g.', 'ㄱ: (30 + 8) ÷ 500 = 7.6%.', 'ㄴ: 30 ÷ 250 = 12%. 12.5%가 되려면 물 60g을 증발시켜야 한다.', 'ㄷ: 덜어 낸 100g에 소금 10g → (8 + 10) ÷ 300 = 6%.', 'ㄹ: 소금 30g으로 4%가 되려면 소금물이 750g이어야 하므로 물 450g을 더 부어야 한다.']),
  bx([('ㄱ', '7.6%', True, O, '38 ÷ 500.'), ('ㄴ', '12.5%', False, XX, '12%이다.'), ('ㄷ', '6%', True, O, '18 ÷ 300.'), ('ㄹ', '물 400g', False, XX, '450g이 필요하다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 증발·희석 때는 소금 무게가 그대로이고 분모만 바뀐다.')]})
check(F(sa, A_W - 60) == F(125, 1000), 'S-BP04 explanation 60g')

# ---------------------------------------------------------------- S-BP05 식단 최소 비용 (255가지 전수, 규칙 모두 필요)
FD = {'A': ('닭가슴살', 3000, 25, 200, '육류'), 'B': ('두부', 1500, 12, 150, '콩류'), 'C': ('달걀', 1000, 8, 100, '달걀'), 'D': ('현미밥', 1200, 5, 300, '곡류'),
      'E': ('샐러드', 2500, 3, 80, '채소'), 'F': ('소고기', 5000, 30, 450, '육류'), 'G': ('브로콜리', 2000, 4, 50, '채소'), 'H': ('치즈버거', 1500, 22, 520, '곡류')}
PRO, KCAL = 40, 700
def meals(r=(1, 1, 1)):
    res = []
    for n in range(1, 9):
        for s in itertools.combinations(FD, n):
            if r[0] and sum(FD[x][2] for x in s) < PRO: continue
            if r[1] and sum(FD[x][3] for x in s) > KCAL: continue
            if r[2] and not any(FD[x][4] == '채소' for x in s): continue
            res.append((sum(FD[x][1] for x in s), s))
    res.sort(); return res
M5 = meals(); b5 = M5[0][0]
check(b5 == 6500 and [s for v, s in M5 if v == b5] == [('A', 'B', 'G')], f'S-BP05 {M5[:3]}')
alts5 = [meals(tuple(0 if j == i else 1 for j in range(3)))[0][0] for i in range(3)]
check(alts5 == [2000, 6000, 5500], f'S-BP05 every rule changes the answer {alts5}')
sec5 = sorted({v for v, _ in M5})[1:3]
check(sec5 == [7000, 7200], f'S-BP05 second {sec5}')
opts5v = [alts5[2], alts5[1], b5, sec5[0], 7500]; check(opts5v == sorted(opts5v) and len(set(opts5v)) == 5 and 7500 in {v for v, _ in M5}, f'S-BP05 {opts5v}')
ans5 = opts5v.index(b5)
check([s for v, s in meals((1, 0, 1)) if v == 6000] == [('B', 'C', 'G', 'H')] and [s for v, s in meals((1, 1, 0)) if v == 5500] == [('A', 'B', 'C')], 'S-BP05 trap sets')
items.append({
 'id': 'S-BP05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲이 차릴 수 있는 한 끼 식단의 최소 비용은?',
 'body': [p('甲은 아래 음식 A~H 가운데 몇 가지를 골라 한 끼 식단을 차리려 한다. 각 음식은 한 번에 1인분만 고를 수 있고, 식단의 비용·단백질·열량은 고른 음식의 값을 더한 것이다. 甲은 다음 규칙을 모두 지키면서 비용을 가장 적게 하려 한다.'),
          table(['음식', '종류', '비용(원)', '단백질(g)', '열량(kcal)'], [[f'{k}({n})', t, f'{c:,}', str(pr), str(kc)] for k, (n, c, pr, kc, t) in FD.items()], caption='음식별 1인분의 비용·단백질·열량', num=False),
          box('규칙', ['단백질의 합은 40g 이상이어야 한다.', '열량의 합은 700kcal 이하여야 한다.', '채소를 한 가지 이상 넣어야 한다.'], plain=True)],
 'options': [f'{v:,}원' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['채소는 G(2,000원, 4g)와 E(2,500원, 3g)이다. 값이 싼 G를 넣으면 나머지에서 단백질 36g 이상을 채워야 한다.',
         'H(22g)는 단백질이 많고 싸지만 열량이 520kcal이라, 채소와 함께 넣으면 남은 열량이 130kcal 이하여서 음식을 하나밖에 더 넣을 수 없고, 단백질이 가장 많은 C(8g)를 더해도 34g 이하로 모자란다.',
         'H 없이 G에 A(25g)와 B(12g)를 더하면 단백질 41g, 열량 400kcal, 비용 3,000 + 1,500 + 2,000 = <b>6,500원</b>이다. 이보다 싼 조합은 규칙을 하나 이상 어긴다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 음식 조합 255가지를 모두 따져 확인하였다. <b>함정</b> 열량 규칙을 빼면 B·C·G·H로 6,000원, 채소 규칙을 빼면 A·B·C로 5,500원이 된다. 7,000원(A·B·E)은 채소를 E로 바꾼 조합이다.')]})
check(sum(FD[x][3] for x in 'GH') == 570 and sum(FD[x][2] for x in 'GHC') == 34 and sum(FD[x][3] for x in 'GHC') == 670 and sum(FD[x][2] for x in 'ABG') == 41 and sum(FD[x][3] for x in 'ABG') == 400, 'S-BP05 explanation numbers')
check(not any('H' in s and any(FD[x][4] == '채소' for x in s) and sum(FD[x][3] for x in s) <= KCAL and sum(FD[x][2] for x in s) >= PRO for n in range(1, 9) for s in itertools.combinations(FD, n)), 'S-BP05 H with a vegetable never feasible')
check(max(len(s) for n in range(1, 9) for s in itertools.combinations(FD, n) if 'H' in s and any(FD[x][4] == '채소' for x in s) and sum(FD[x][3] for x in s) <= KCAL) == 3, 'S-BP05 only one more food fits')
check(not any(any(FD[x][0] == 'H' for x in s) for v, s in M5 if v <= 6500) and all(any(FD[x][4] == '채소' for x in s) for v, s in M5), 'S-BP05 explanation claims')

REVIEW = {
 'S-BP01': ('법조문 계산', '상', '2분 30초', '금·토 요금, 성수기 가산, 추가 인원 1박마다, 감면 범위', '감면 범위·박 수 착오', '사람별 기본 → 가산 → 감면 → 추가 요금', '캠핑장 이용료형, 조문 셋, 새로 설계'),
 'S-BP02': ('경우의 수', '상', '2분', '이웃 다른 색, 두 색만, 양 끝 같은 색, 빨강 세 번', '양 끝 조건 셈 착오', '앞 화분 기준 2가지씩', '화분 색칠형, 새로 설계(전수)'),
 'S-BP03': ('법조문 적용', '상', '1분 30초', '단서의 완화 기준, 세대 단위, 연장 횟수, ‘넘게’', '단서 범위 착오', '조문별 대조', '공공 텃밭형, 조문 넷, 새로 설계'),
 'S-BP04': ('수리 추론', '상', '2분', '소금 무게 불변, 섞기·증발·희석', '분모 착오', '소금 무게부터', '소금물 농도형, 새로 설계'),
 'S-BP05': ('최적화', '상', '3분', '단백질 하한, 열량 상한, 채소 포함', '규칙 하나 누락', '싼 채소부터 고정', '식단 최소 비용형, 새로 설계(255가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bp.py', 'review/sit-bp.md'), '상황판단 S-BP 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
