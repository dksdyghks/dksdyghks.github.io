# 상황판단 S-CB01..S-CB05 — 5급 실전(심화) 수준 정예 문항: 장학금 지급(구간·성적 예외·등록금 한도·다자녀), 원 위의 여덟 점(전수), 공원 반려견 동반 규정, 소금물 농도, 축제 프로그램 고르기(64가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-cb.js'

# ---------------------------------------------------------------- S-CB01 장학금 지급 (법조문 계산)
ST = {'甲': (1, 350, 'C', False), '乙': (2, 200, 'A', False), '丙': (3, 400, 'B', False), '丁': (3, 450, 'A', True)}   # 소득 구간, 등록금(만 원), 직전 학기 성적, 셋째 이상 자녀
BAND = {1: 300, 2: 250, 3: 200}
RANK = {'A': 4, 'B': 3, 'C': 2, 'D': 1}
def grant(k, exception=True, cap=True, multi=True, b_excluded=False):
    band, fee, gr, third = ST[k]
    ok = RANK[gr] > RANK['B'] if b_excluded else RANK[gr] >= RANK['B']
    if not ok and exception and band == 1 and RANK[gr] >= RANK['C']: ok = True
    if not ok: return 0
    if multi and third: return fee
    return min(BAND[band], fee) if cap else BAND[band]
each1 = {k: grant(k) for k in ST}
check(each1 == {'甲': 300, '乙': 200, '丙': 200, '丁': 450}, f'S-CB01 {each1}')
tot1 = lambda **kw: sum(grant(k, **kw) for k in ST)
alts1 = {'정답': tot1(), '1구간 예외 누락': tot1(exception=False), '다자녀 전액 누락': tot1(multi=False), 'B를 미달로 봄': tot1(b_excluded=True), '등록금 한도 누락': tot1(cap=False)}
check(alts1 == {'정답': 1150, '1구간 예외 누락': 850, '다자녀 전액 누락': 900, 'B를 미달로 봄': 950, '등록금 한도 누락': 1200}, f'S-CB01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-CB01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-CB01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁에게 이번 학기에 지급할 장학금의 합계는?',
 'body': [law('<p><b>제○○조(지급액)</b> 장학금은 학기마다 소득 구간에 따라 1구간 300만 원, 2구간 250만 원, 3구간 200만 원을 지급한다. 다만 그 학기 등록금보다 많이 지급할 수 없다.</p>'
              '<p><b>제○○조(성적 기준)</b> ① 직전 학기 성적이 B 미만인 학생에게는 장학금을 지급하지 아니한다.<br>② 제1항에도 불구하고 1구간 학생은 직전 학기 성적이 C 이상이면 지급한다.</p>'
              '<p><b>제○○조(다자녀 가구)</b> 셋째 이상 자녀인 학생에게는 제○○조(지급액)에도 불구하고 그 학기 등록금 전액을 지급한다.</p>'),
          box('상황', ['성적은 A, B, C, D 순으로 높다.', '甲: 1구간, 등록금 350만 원, 직전 학기 성적 C', '乙: 2구간, 등록금 200만 원, 직전 학기 성적 A', '丙: 3구간, 등록금 400만 원, 직전 학기 성적 B', '丁: 3구간, 셋째 자녀, 등록금 450만 원, 직전 학기 성적 A'], plain=True)],
 'options': [f'{v:,}만 원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 성적 C는 B 미만이지만 1구간이므로 지급 → 300만 원.', '乙: 2구간 250만 원이지만 등록금 200만 원을 넘을 수 없다 → 200만 원.', '丙: 성적 B는 ‘B 미만’이 아니므로 지급 → 200만 원.', '丁: 셋째 자녀이므로 등록금 전액 450만 원.']),
  p(f'합계 300 + 200 + 200 + 450 = <b>1,150만 원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 1구간 예외를 빠뜨리면 850만 원, 다자녀 전액을 빠뜨리면 900만 원, B를 기준 미달로 보면 950만 원, 등록금 한도를 빠뜨리면 1,200만 원이다.')]})

# ---------------------------------------------------------------- S-CB02 원 위의 여덟 점 (전수)
PTS = range(8)
adj = lambda a, b: (a - b) % 8 in (1, 7)
segs = list(itertools.combinations(PTS, 2)); tris = list(itertools.combinations(PTS, 3)); quads = list(itertools.combinations(PTS, 4))
t2 = {'ㄱ': len(segs) == 24, 'ㄴ': len(tris) == 56, 'ㄷ': len(quads) == 70, 'ㄹ': sum(not any(adj(a, b) for a, b in itertools.combinations(t, 2)) for t in tris) == 16}
check(t2 == {'ㄱ': False, 'ㄴ': True, 'ㄷ': True, 'ㄹ': True} and len(segs) == 28 and sum(adj(a, b) for a, b in segs) == 8, f'S-CB02 {t2}')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-CB02')
check(sum(any(adj(a, b) for a, b in itertools.combinations(t, 2)) for t in tris) == 40 and sum(sum(adj(x, y) for x, y in itertools.combinations(t, 2)) == 2 for t in tris) == 8, 'S-CB02 explanation counts: 8 triangles of three neighbouring points')
items.append({
 'id': 'S-CB02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('원 위에 서로 다른 점 여덟 개가 같은 간격으로 놓여 있다. 이 가운데 몇 개의 점을 골라 곧은 선으로 이어 도형을 만든다. 원 위에서 바로 옆에 있는 두 점을 ‘이웃한 점’이라 하고, 고른 점이 같으면 같은 도형으로 센다.'),
          box('보기', ['ㄱ. 두 점을 이어 만들 수 있는 선분은 24개이다.', 'ㄴ. 세 점을 이어 만들 수 있는 삼각형은 56개이다.', 'ㄷ. 네 점을 이어 만들 수 있는 사각형은 70개이다.', 'ㄹ. 세 점을 이어 만든 삼각형 가운데 어느 두 꼭짓점도 이웃한 점이 아닌 것은 16개이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 8개에서 2개를 고르는 수 8 × 7 ÷ 2 = 28개.', 'ㄴ: 8 × 7 × 6 ÷ 6 = 56개. ㄷ: 8 × 7 × 6 × 5 ÷ 24 = 70개.',
         'ㄹ: 이웃한 두 점을 포함하는 삼각형을 뺀다. 이웃한 세 점으로 된 삼각형 8개, 이웃한 쌍이 정확히 하나인 삼각형은 이웃한 쌍 8가지마다 그 쌍과 이웃하지 않는 나머지 점 4개를 골라 32개 → 56 − 8 − 32 = 16개.']),
  bx([('ㄱ', '선분 24개', False, XX, '28개이다.'), ('ㄴ', '삼각형 56개', True, O, '8개에서 3개 고르기.'), ('ㄷ', '사각형 70개', True, O, '8개에서 4개 고르기.'), ('ㄹ', '이웃 없는 삼각형 16개', True, O, '56 − 8 − 32.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 모든 경우를 나열해 확인하였다. <b>함정</b> 원 위의 점은 어느 세 점도 한 직선 위에 있지 않으므로 고르는 수가 곧 도형의 수이다.')]})
check(sum(sum(adj(x, y) for x, y in itertools.combinations(t, 2)) == 1 for t in tris) == 32, 'S-CB02 explanation: exactly one adjacent pair → 32')

# ---------------------------------------------------------------- S-CB03 공원 반려견 동반 (법조문 적용, 옳은 것)
LEASH_MAX = 2
def leash_ok(length): return length <= LEASH_MAX
def muzzle_needed(fierce, months): return fierce and months >= 3
playground_ok = lambda helper_dog: helper_dog
waste_when = '즉시'
LEASH_FOR = {'맹견', '맹견이 아닌 반려견'}                 # 목줄 조항은 반려견 모두에 적용
f3 = [playground_ok(True), leash_ok(3), not muzzle_needed(True, 5), '맹견이 아닌 반려견' not in LEASH_FOR, waste_when == '공원을 나갈 때']
one_true(f3, 0, 'S-CB03')
check(muzzle_needed(True, 5) and not muzzle_needed(True, 2) and not muzzle_needed(False, 12), 'S-CB03 muzzle boundaries')
items.append({
 'id': 'S-CB03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(목줄)</b> 반려견과 함께 공원에 들어오는 사람은 반려견에게 길이 2m 이하의 목줄을 하여야 한다.</p>'
              '<p><b>제○○조(입마개)</b> 맹견과 함께 공원에 들어오는 사람은 제○○조(목줄)에 따른 목줄 외에 입마개도 하여야 한다. 다만 생후 3개월 미만인 맹견은 그러하지 아니하다.</p>'
              '<p><b>제○○조(배설물)</b> 반려견이 배설한 때에는 함께 온 사람이 즉시 수거하여야 한다.</p>'
              '<p><b>제○○조(출입 제한)</b> 반려견은 공원 안의 어린이 놀이터에 들어갈 수 없다. 다만 장애인 보조견은 그러하지 아니하다.</p>')],
 'options': ['장애인 보조견은 공원 안의 어린이 놀이터에 들어갈 수 있다.', '반려견에게 길이 3m의 목줄을 하면 공원에 들어올 수 있다.', '생후 5개월인 맹견은 입마개를 하지 않아도 공원에 들어올 수 있다.',
             '맹견이 아닌 반려견은 목줄을 하지 않아도 공원에 들어올 수 있다.', '반려견의 배설물은 공원을 나갈 때 수거하면 된다.'],
 'answer': 0,
 'explain': [
  ox([(True, O, '출입 제한 조항의 단서에 해당한다.'), (False, XX, '목줄은 2m 이하여야 한다.'), (False, XX, '입마개 면제는 생후 3개월 미만인 맹견뿐이다.'), (False, XX, '목줄은 모든 반려견에 해야 한다.'), (False, XX, '즉시 수거하여야 한다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> 입마개는 맹견에만, 목줄은 모든 반려견에 적용된다. 단서의 범위(생후 3개월 미만, 장애인 보조견)를 확인한다.')]})

# ---------------------------------------------------------------- S-CB04 소금물 농도 (보기)
def conc(salt, total): return F(salt) / total * 100
mix = lambda *parts: conc(sum(F(c, 100) * w for c, w in parts), sum(w for c, w in parts))
t4 = {'ㄱ': conc(F(10, 100) * 200, 250) == 8, 'ㄴ': mix((20, 100), (10, 300)) == F(25, 2), 'ㄷ': conc(F(10, 100) * 200, 100) == 15, 'ㄹ': conc(F(8, 100) * 500 + 20, 520) == 12}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': False} and conc(F(10, 100) * 200, 100) == 20 and conc(60, 520) == F(150, 13), f'S-CB04 {t4}')
opts4 = ['ㄱ', 'ㄴ', 'ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-CB04')
items.append({
 'id': 'S-CB04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('소금물의 농도(%)는 소금물 전체의 무게에서 소금이 차지하는 비율에 100을 곱한 값이다. 물을 더하거나 증발시키면 소금의 양은 그대로이고 소금물 전체의 무게만 바뀐다. 두 소금물을 섞으면 소금의 양과 전체 무게가 각각 더해진다.'),
          box('보기', ['ㄱ. 농도 10%인 소금물 200g에 물 50g을 더하면 농도는 8%가 된다.', 'ㄴ. 농도 20%인 소금물 100g과 농도 10%인 소금물 300g을 섞으면 농도는 12.5%가 된다.',
                      'ㄷ. 농도 10%인 소금물 200g에서 물 100g을 증발시키면 농도는 15%가 된다.', 'ㄹ. 농도 8%인 소금물 500g에 소금 20g을 더 녹이면 농도는 12%가 된다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 소금 20g ÷ 250g = 8%.', 'ㄴ: 소금 20 + 30 = 50g ÷ 400g = 12.5%.', 'ㄷ: 소금 20g ÷ 100g = 20%.', 'ㄹ: 소금 40 + 20 = 60g ÷ 520g ≈ 11.5%.']),
  bx([('ㄱ', '8%', True, O, '20 ÷ 250.'), ('ㄴ', '12.5%', True, O, '50 ÷ 400.'), ('ㄷ', '15%', False, XX, '20%이다.'), ('ㄹ', '12%', False, XX, '약 11.5%이다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 소금을 더하면 소금물 전체의 무게도 함께 늘어난다(500g → 520g). 섞을 때 농도를 그냥 평균하지 않는다.')]})

# ---------------------------------------------------------------- S-CB05 축제 프로그램 고르기 (64가지 전수, 규칙 모두 필요)
PG = {'A': (30, 35, '야외'), 'B': (20, 55, '야외'), 'C': (30, 70, '야외'), 'D': (20, 70, '실내'), 'E': (45, 40, '실내'), 'F': (30, 30, '실내')}   # 비용(만 원), 예상 만족도(점), 장소
RULES = [lambda s: sum(PG[x][0] for x in s) <= 100, lambda s: sum(PG[x][2] == '야외' for x in s) <= 1, lambda s: 'C' not in s or 'F' in s]
def plans5(on=(1, 1, 1)):
    return sorted(((sum(PG[x][1] for x in s), s) for n in range(0, 7) for s in itertools.combinations(PG, n) if all(r(s) for r, o in zip(RULES, on) if o)), reverse=True)
PL = plans5(); b5 = PL[0][0]
check(b5 == 170 and [s for v, s in PL if v == b5] == [('C', 'D', 'F')], f'S-CB05 {PL[:3]}')
alts5 = [plans5(tuple(0 if j == i else 1 for j in range(3))) for i in range(3)]
for i, al in enumerate(alts5): check(al[0][0] > b5 and [v for v, s in al].count(al[0][0]) == 1, f'S-CB05 rule {i} changes the answer {al[:2]}')
check([al[0] for al in alts5] == [(210, ('C', 'D', 'E', 'F')), (225, ('B', 'C', 'D', 'F')), (180, ('C', 'D', 'E'))], f'S-CB05 traps {[al[0] for al in alts5]}')
sec5 = sorted({v for v, s in PL}, reverse=True)[1]; check(sec5 == 165 and [s for v, s in PL if v == sec5] == [('B', 'D', 'E')], f'S-CB05 second {sec5}')
opts5v = sorted([b5, sec5] + [al[0][0] for al in alts5]); check(len(set(opts5v)) == 5, f'S-CB05 {opts5v}')
ans5 = opts5v.index(b5)
check(max(v for v, s in PL if 'C' not in s) == 165, 'S-CB05 explanation: without C the best is 165')
items.append({
 'id': 'S-CB05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲 구청이 고를 프로그램의 예상 만족도 합계의 최댓값은?',
 'body': [p('甲 구청은 주민 축제에서 운영할 프로그램을 A~F 가운데 몇 개 고르려 한다. 프로그램마다 비용, 예상 만족도, 장소는 아래와 같고, 같은 프로그램은 한 번만 운영한다. 甲은 다음 규칙을 모두 지키면서 예상 만족도의 합계를 가장 크게 하려 한다.'),
          table(['프로그램', '비용(만 원)', '예상 만족도(점)', '장소'], [[k, str(a), str(b), c] for k, (a, b, c) in PG.items()], caption='프로그램별 비용·예상 만족도·장소', num=False),
          box('규칙', ['비용의 합계가 100만 원을 넘지 않아야 한다.', '야외 프로그램은 하나까지만 운영한다.', 'C를 운영하면 F도 운영한다.'], plain=True)],
 'options': [f'{v}점' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['야외 프로그램은 A·B·C 가운데 하나까지이다.', 'C(70점)를 고르면 F(30점)도 골라야 한다. 여기에 D(20만 원, 70점)를 더하면 비용 80만 원, 만족도 170점이고, E(45만 원)까지 더하면 125만 원으로 예산을 넘는다.',
         'C를 고르지 않으면 B(55점)와 실내 프로그램을 조합하는데, B·D·E가 비용 85만 원, 165점으로 가장 크고 B·D·E·F는 115만 원으로 예산을 넘는다.', '따라서 최댓값은 <b>170점</b>(C, D, F)이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 프로그램 조합 64가지를 모두 따져 확인하였다. <b>함정</b> 셋째 규칙을 빼면 180점, 첫째 규칙을 빼면 210점, 둘째 규칙을 빼면 225점이 된다.')]})
check(sum(PG[x][0] for x in 'CDF') == 80 and sum(PG[x][0] for x in 'CDEF') == 125 and sum(PG[x][0] for x in 'BDE') == 85 and sum(PG[x][0] for x in 'BDEF') == 115, 'S-CB05 explanation arithmetic')

REVIEW = {
 'S-CB01': ('법조문 계산', '상', '2분 30초', '구간별 지급액, 등록금 한도, 성적 기준과 예외, 다자녀 전액', '‘미만’ 경계, 예외 누락', '학생별 지급 여부 → 금액 → 한도', '장학금형, 조문 셋, 새로 설계'),
 'S-CB02': ('경우의 수', '상', '2분', '고르는 수, 이웃 제외 삼각형', '이웃 쌍 중복 계산', '전체에서 빼기', '원 위의 점형, 새로 설계(전수)'),
 'S-CB03': ('법조문 적용', '상', '1분 30초', '목줄 길이, 입마개 대상과 예외, 출입 제한 단서', '적용 대상 혼동', '조문별 대조', '반려견 동반형, 조문 넷, 새로 설계'),
 'S-CB04': ('수리 추론', '상', '2분', '소금의 양 보존, 섞기, 증발, 소금 추가', '소금 추가 때 전체 무게 누락', '소금의 양부터', '소금물 농도형, 새로 설계(분수로 확인)'),
 'S-CB05': ('최적화', '상', '3분', '예산 상한, 야외 개수 제한, 동반 운영', '규칙 하나 누락', '야외 프로그램 하나씩 고정', '축제 프로그램형, 새로 설계(64가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_cb.py', 'review/sit-cb.md'), '상황판단 S-CB 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
