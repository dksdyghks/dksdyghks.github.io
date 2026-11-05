# 상황판단 S-AY01..S-AY05 — 5급 실전(심화) 수준 정예 문항: 아이 돌봄 본인 부담금(조문 넷과 단서·상한), 숫자 카드 수 만들기(6을 9로 쓰는 경우까지 전수), 선거 현수막 규정, 사다리 타기(3,125가지 전수), 인쇄 작업 순서(120가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-ay.js'

# ---------------------------------------------------------------- S-AY01 아이 돌봄 본인 부담금 (법조문 계산, 조문 넷과 단서·상한)
FAM = {'甲': ('가', True, 1, 60), '乙': ('나', False, 3, 100), '丙': ('라', True, 1, 40), '丁': ('다', True, 2, 90)}   # 소득 유형, 만 2세 이하 자녀, 자녀 수, 이용 시간
SUP = {'가': F(85, 100), '나': F(60, 100), '다': F(15, 100), '라': F(0)}
def pay1(k, cap=True, infant=True, infant_excl=True, many_cap=True):
    typ, inf, kids, h = FAM[k]
    r = SUP[typ]
    if infant and inf and not (infant_excl and typ == '라'): r += F(5, 100)
    sh = min(h, 80) if cap else h
    v = sh * 12000 * (1 - r) + (h - sh) * 12000
    if kids >= 3: v -= min(v / 10, 50000) if many_cap else v / 10
    return v
each1 = {k: pay1(k) for k in FAM}
check(each1 == {'甲': 72000, '乙': 574000, '丙': 480000, '丁': 888000}, f'S-AY01 {each1}')
tot1 = lambda **kw: sum(pay1(k, **kw) for k in FAM)
alts1 = {'정답': tot1(), '80시간 상한 누락': tot1(cap=False), '영아 가산 누락': tot1(infant=False), '라형 제외 누락': tot1(infant_excl=False), '감경 상한 누락': tot1(many_cap=False)}
check(all(v.denominator == 1 for v in alts1.values()), 'S-AY01 integer amounts')
alts1 = {k: int(v) for k, v in alts1.items()}
check(alts1 == {'정답': 2014000, '80시간 상한 누락': 1848000, '영아 가산 누락': 2098000, '라형 제외 누락': 1990000, '감경 상한 누락': 2001600}, f'S-AY01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, 'S-AY01 distinct')
ans1 = vals1.index(alts1['정답'])
check(pay1('乙', cap=False) == 432000 and pay1('丁', cap=False) == 864000 and pay1('甲', infant=False) == 108000 and pay1('丁', infant=False) == 936000 and pay1('丙', infant_excl=False) == 456000, 'S-AY01 trap pieces')
items.append({
 'id': 'S-AY01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁 가구가 이번 달에 내야 하는 본인 부담금의 합계는?',
 'body': [law('<p><b>제○○조(이용 요금)</b> 아이 돌봄 서비스의 이용 요금은 1시간당 12,000원으로 한다.</p>'
              '<p><b>제○○조(정부 지원)</b> ① 정부는 가구의 소득 유형에 따라 이용 요금의 다음 비율을 지원한다.<br>1. 가형: 100분의 85<br>2. 나형: 100분의 60<br>3. 다형: 100분의 15<br>4. 라형: 지원하지 아니함<br>'
              '② 만 2세 이하의 자녀가 있는 가구는 제1항의 비율에 100분의 5를 더한다. 다만 라형 가구에는 적용하지 아니한다.<br>③ 지원은 한 달에 80시간 이용분까지로 하며, 이를 넘는 시간의 이용 요금은 가구가 모두 부담한다.</p>'
              '<p><b>제○○조(본인 부담금)</b> 가구의 본인 부담금은 이용 요금에서 제2조에 따른 지원액을 뺀 금액으로 한다.</p>'
              '<p><b>제○○조(다자녀 감경)</b> 자녀가 셋 이상인 가구는 제3조에 따른 본인 부담금의 100분의 10을 감경한다. 다만 감경액은 5만 원을 넘을 수 없다.</p>'),
          table(['가구', '소득 유형', '만 2세 이하 자녀', '자녀 수', '이번 달 이용 시간'], [[k, f'{v[0]}형', '있음' if v[1] else '없음', f'{v[2]}명', f'{v[3]}시간'] for k, v in FAM.items()], caption='가구별 이용 현황', num=False)],
 'options': [f'{v:,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 가형 85% + 영아 5% = 90% 지원. 60시간 × 12,000원 × 10% = 72,000원.', '乙: 나형 60% 지원. 80시간분 960,000원 × 40% = 384,000원, 넘는 20시간 240,000원 → 624,000원. 자녀 셋이므로 10%(62,400원)를 감경해야 하나 상한 5만 원 → 574,000원.',
         '丙: 라형은 지원이 없고 영아 가산도 받지 못한다. 40시간 × 12,000원 = 480,000원.', '丁: 다형 15% + 영아 5% = 20% 지원. 80시간분 960,000원 × 80% = 768,000원, 넘는 10시간 120,000원 → 888,000원.']),
  p(f'합계 72,000 + 574,000 + 480,000 + 888,000 = <b>2,014,000원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 80시간 상한을 빠뜨리면 1,848,000원, 영아 가산을 빠뜨리면 2,098,000원, 라형에도 영아 가산을 주면 1,990,000원, 감경 상한을 빠뜨리면 2,001,600원이다.')]})

# ---------------------------------------------------------------- S-AY02 숫자 카드로 세 자리 수 만들기 (6을 9로 쓰는 경우까지 전수)
CARDS = ['0', '1', '4', '6', '7']
def faces(c, flip=True): return ['6', '9'] if (c == '6' and flip) else [c]
def numbers(flip=True):
    out = set()
    for pick in itertools.permutations(CARDS, 3):
        for ds in itertools.product(*[faces(c, flip) for c in pick]):
            if ds[0] != '0': out.add(int(''.join(ds)))
    return sorted(out)
N2 = numbers()
cnt_all = sum(1 for pick in itertools.permutations(CARDS, 3) for ds in itertools.product(*[faces(c) for c in pick]) if ds[0] != '0')
check(cnt_all == len(N2), 'S-AY02 no two card arrangements give the same number')
even = [n_ for n_ in N2 if n_ % 2 == 0]; mul3 = [n_ for n_ in N2 if n_ % 3 == 0]
fake_max = 976                                            # 6 카드를 6과 9로 동시에 쓴 착각
t2 = {'ㄱ': len(N2) == 78, 'ㄴ': max(N2) - min(N2) == fake_max - min(N2), 'ㄷ': len(mul3) == 6, 'ㄹ': len(even) > len(N2) - len(even)}
check(t2 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': True} and max(N2) == 974 and min(N2) == 104 and fake_max - min(N2) == 872, f'S-AY02 {t2}')
check(fake_max not in N2, 'S-AY02 976 cannot be made')
no6 = [n_ for n_ in N2 if not set(str(n_)) & {'6', '9'}]
arr6 = sum(1 for pick in itertools.permutations(CARDS, 3) if '6' in pick and pick[0] != '0')
check(len(no6) == 18 and arr6 == 30 and len(N2) - len(no6) == arr6 * 2 == 60, 'S-AY02 explanation: 18 + 30 × 2')
check(mul3 == [147, 174, 417, 471, 714, 741], 'S-AY02 explanation: only 1, 4, 7')
endc = {d: len([n_ for n_ in N2 if n_ % 10 == d]) for d in (0, 1, 4, 6, 7, 9)}
check(endc == {0: 18, 1: 14, 4: 14, 6: 9, 7: 14, 9: 9} and len(even) == 41, f'S-AY02 explanation endings {endc}')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄷ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-AY02')
items.append({
 'id': 'S-AY02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('甲에게는 숫자 0, 1, 4, 6, 7이 하나씩 적힌 카드 5장이 있다. 甲은 이 가운데 3장을 골라 한 줄로 놓아 세 자리 수를 만든다. 맨 앞에는 0이 적힌 카드를 놓을 수 없다. 6이 적힌 카드는 거꾸로 놓아 9로 쓸 수도 있지만, 한 장이므로 6과 9로 동시에 쓸 수는 없다. 다른 카드는 거꾸로 놓아도 다른 숫자가 되지 않는다.'),
          box('보기', ['ㄱ. 만들 수 있는 세 자리 수는 모두 78개이다.', 'ㄴ. 만들 수 있는 가장 큰 수와 가장 작은 수의 차는 872이다.', 'ㄷ. 만들 수 있는 수 가운데 3의 배수는 6개이다.', 'ㄹ. 만들 수 있는 수 가운데 짝수가 홀수보다 많다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['6 카드를 쓰지 않으면 0, 1, 4, 7로 만드는 수 18개이다(4 × 3 × 2 − 3 × 2). 6 카드를 쓰는 배치는 30가지이고 각각 6과 9 두 가지로 읽히므로 60개이다. 합하면 78개(ㄱ).',
         'ㄴ: 가장 큰 수는 974, 가장 작은 수는 104로 차는 870이다. 976은 6 카드를 9와 6으로 동시에 써야 하므로 만들 수 없다.',
         'ㄷ: 각 숫자를 3으로 나눈 나머지는 0·6·9가 0, 1·4·7이 1이다. 나머지가 0인 카드는 0과 6 카드 두 장뿐이므로 세 수의 합이 3의 배수가 되려면 1, 4, 7을 모두 써야 한다. 147, 174, 417, 471, 714, 741의 6개이다.',
         'ㄹ: 끝자리가 0인 수 18개, 4인 수 14개, 6인 수 9개로 짝수는 41개, 홀수는 37개이다.']),
  bx([('ㄱ', '78개', True, O, '18 + 60.'), ('ㄴ', '차 872', False, XX, '974 − 104 = 870.'), ('ㄷ', '3의 배수 6개', True, O, '1, 4, 7로만.'), ('ㄹ', '짝수가 더 많음', True, O, '41 대 37.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 카드를 놓는 모든 경우를 따져 확인하였다. <b>함정</b> 6 카드를 9로 쓰는 경우를 빠뜨리면 48개가 되고, 976을 가장 큰 수로 착각하면 ㄴ을 옳다고 고르게 된다.')]})
check(len(numbers(False)) == 48, 'S-AY02 trap count')

# ---------------------------------------------------------------- S-AY03 선거 현수막 규정 (법조문 적용, 옳은 것)
import datetime as dt
REG_END, ELEC = dt.date(2026, 5, 16), dt.date(2026, 6, 3)
def max_banners(pops): return sum(3 if pp > 50000 else 2 for pp in pops)
def can_post_day(d): return REG_END < d < ELEC
def can_place(school_m, vacation, corner_m): return (vacation or school_m > 50) and corner_m > 10
def fine3(removal_days): return sum(100000 for d in removal_days if d > ELEC + dt.timedelta(days=3))
f3 = [max_banners([48000, 48000, 62000]) == 7, can_post_day(dt.date(2026, 5, 16)), can_place(30, True, 8), fine3([dt.date(2026, 6, 6)] * 3 + [dt.date(2026, 6, 7)]) == 400000, max_banners([50000]) == 3]
one_true(f3, 0, 'S-AY03')
check(fine3([dt.date(2026, 6, 6)] * 3 + [dt.date(2026, 6, 7)]) == 100000 and max_banners([50000]) == 2 and can_place(30, True, 12) and not can_place(30, False, 12), 'S-AY03 distractor facts')
items.append({
 'id': 'S-AY03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글과 <상황>을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(현수막의 수)</b> 후보자는 선거구 안의 읍·면·동마다 현수막을 2매까지 게시할 수 있다. 다만 인구가 5만 명을 넘는 동에는 3매까지 게시할 수 있다.</p>'
              '<p><b>제○○조(게시 기간)</b> 현수막은 후보자 등록 마감일의 다음 날부터 선거일 전날까지 게시할 수 있다.</p>'
              '<p><b>제○○조(게시 장소)</b> ① 다음 각 호의 장소에는 현수막을 게시할 수 없다.<br>1. 학교 정문으로부터 50미터 이내<br>2. 교차로 모퉁이로부터 10미터 이내<br>② 학교가 방학 중인 때에는 제1항 제1호를 적용하지 아니한다.</p>'
              '<p><b>제○○조(철거)</b> 후보자는 선거일 다음 날부터 3일 이내에 현수막을 모두 철거하여야 한다. 이를 위반하여 기한 안에 철거하지 아니한 현수막에 대해서는 1매당 10만 원의 과태료를 부과한다.</p>'),
          box('상황', ['후보자 등록 마감일은 5월 16일이고, 선거일은 6월 3일이다.'], plain=True)],
 'options': ['인구가 4만 8천 명인 동 두 곳과 6만 2천 명인 동 한 곳으로 이루어진 선거구의 후보자는 현수막을 최대 7매 게시할 수 있다.', '후보자는 5월 16일 오후부터 현수막을 게시할 수 있다.',
             '방학 중인 학교의 정문으로부터 30미터, 교차로 모퉁이로부터 8미터 떨어진 곳에는 현수막을 게시할 수 있다.', '6월 6일까지 현수막 3매를 철거하고 나머지 1매를 6월 7일에 철거한 후보자의 과태료는 40만 원이다.', '인구가 정확히 5만 명인 동에는 현수막을 3매까지 게시할 수 있다.'],
 'answer': 0,
 'explain': [
  ox([(True, O, '2 + 2 + 3 = 7매.'), (False, XX, '등록 마감일의 다음 날인 5월 17일부터이다.'), (False, XX, '방학 중이라 학교 정문 제한은 없지만, 교차로 모퉁이로부터 10미터 이내라 게시할 수 없다.'),
      (False, XX, '철거 기한은 6월 4일부터 3일 이내인 6월 6일이다. 기한을 넘긴 것은 1매이므로 10만 원이다.'), (False, XX, '5만 명을 ‘넘는’ 동만 3매이므로 2매까지이다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> 기간의 시작일(다음 날부터), 단서가 풀어 주는 것은 학교 제한뿐이라는 점, 과태료는 기한을 넘긴 매수에만 부과된다는 점, ‘넘는’의 경계를 확인한다.')]})
check(ELEC + dt.timedelta(days=3) == dt.date(2026, 6, 6) and not can_post_day(ELEC) and can_post_day(dt.date(2026, 5, 17)), 'S-AY03 explanation dates')

# ---------------------------------------------------------------- S-AY04 사다리 타기 (3,125가지 전수)
LEVEL = [(), (0,), (1,), (2,), (0, 2)]                          # 한 층에 그을 수 있는 가로줄(세로줄 i와 i+1 사이)
def result(cfg):
    pos = list(range(4))                                      # pos[p] = 사람 p의 현재 세로줄
    for lv in cfg:
        for i in lv:
            pos = [i + 1 if x == i else i if x == i + 1 else x for x in pos]
    return tuple(pos)
ALL4 = [(cfg, sum(len(lv) for lv in cfg), result(cfg)) for cfg in itertools.product(LEVEL, repeat=5)]
check(len(ALL4) == 3125, 'S-AY04 count')
REV = (3, 2, 1, 0); IDN = (0, 1, 2, 3)
min_rev = min(n_ for c, n_, r in ALL4 if r == REV)
two_res = {r for c, n_, r in ALL4 if n_ == 2}
t4 = {'ㄱ': any(n_ == 3 and r[0] == 3 for c, n_, r in ALL4), 'ㄴ': min_rev == 6, 'ㄷ': not any(n_ == 4 and r == IDN for c, n_, r in ALL4), 'ㄹ': len(two_res) == 6}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True}, f'S-AY04 {t4} {min_rev} {len(two_res)}')
check(min(n_ for c, n_, r in ALL4 if r[0] == 3) == 3, 'S-AY04 explanation: 甲 needs three crossings to reach D')
check(result(((0,), (0,), (2,), (2,), ())) == IDN, 'S-AY04 explanation example: same rung twice cancels')
check(result(((0, 2), (1,), (0, 2), (1,), ())) == REV, 'S-AY04 explanation example: reversal with 6 rungs in 4 levels')
# 가로줄 하나는 두 사람의 자리를 맞바꾸므로, 뒤집힌 순서(바뀐 쌍 6개)에는 6개 이상 필요
inv = lambda r: sum(1 for a in range(4) for b in range(a + 1, 4) if r[a] > r[b])
check(inv(REV) == 6 and all(n_ >= inv(r) for c, n_, r in ALL4), 'S-AY04 explanation: each rung changes the order of one pair')
check(two_res == {IDN, (1, 0, 3, 2), (2, 0, 1, 3), (1, 2, 0, 3), (0, 3, 1, 2), (0, 2, 3, 1)}, f'S-AY04 two-rung results {two_res}')
opts4 = ['ㄱ, ㄷ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ', 'ㄱ, ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-AY04')
items.append({
 'id': 'S-AY04', 'type': '상황판단 · 규칙 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('세로줄 4개가 나란히 그어져 있다. 세로줄의 위쪽 끝에는 왼쪽부터 甲, 乙, 丙, 丁이, 아래쪽 끝에는 왼쪽부터 A, B, C, D가 적혀 있다. 세로줄 사이에는 위에서부터 1층~5층의 다섯 높이에 가로줄을 그을 수 있다. 가로줄은 이웃한 두 세로줄만 잇고, 같은 층에서 한 세로줄에 가로줄 두 개가 닿을 수는 없다.'),
          p('각 사람은 자기 세로줄의 위쪽 끝에서 출발해 아래로 내려가다가 가로줄을 만나면 반드시 그 가로줄을 따라 옆 세로줄로 건너간 뒤 다시 아래로 내려간다. 아래쪽 끝에 적힌 것이 그 사람의 도착 결과이다.'),
          box('보기', ['ㄱ. 가로줄을 3개만 그어 甲이 D에 도착하게 할 수 있다.', 'ㄴ. 甲이 D, 乙이 C, 丙이 B, 丁이 A에 도착하게 하려면 가로줄이 적어도 6개 필요하다.', 'ㄷ. 가로줄을 4개 그었다면, 甲이 A, 乙이 B, 丙이 C, 丁이 D에 도착할 수는 없다.', 'ㄹ. 가로줄을 2개만 그었을 때 나올 수 있는 도착 결과(누가 어디에 도착하는지)는 모두 6가지이다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['가로줄 하나를 지나면 그 가로줄 양쪽 세로줄에 있던 두 사람의 자리가 맞바뀐다. 甲이 D까지 가려면 오른쪽으로 세 번 건너야 하므로 1~3층에 차례로 세 개를 그으면 된다(ㄱ).',
         'ㄴ: 네 사람의 순서를 완전히 뒤집으면 순서가 바뀐 두 사람 쌍이 6개 생기는데, 가로줄 하나는 이웃한 두 사람의 순서만 바꾸므로 6개 이상 필요하다. 1층과 3층에 바깥쪽 두 개씩, 2층과 4층에 가운데 하나씩 그으면 6개로 된다.',
         'ㄷ: 첫째·둘째 세로줄 사이의 1층과 2층에 하나씩, 셋째·넷째 세로줄 사이의 3층과 4층에 하나씩 그으면 바뀐 자리가 다시 돌아와 모두 자기 아래에 도착한다.',
         'ㄹ: 같은 두 세로줄 사이에 두 개를 그으면 모두 제자리(1가지), 첫째·둘째 사이와 셋째·넷째 사이에 하나씩 그으면 1가지, 세로줄 하나를 함께 쓰는 두 가로줄(첫째·둘째 사이와 둘째·셋째 사이, 또는 둘째·셋째 사이와 셋째·넷째 사이)은 어느 쪽이 위에 있느냐에 따라 2가지씩 4가지로, 모두 6가지이다.']),
  bx([('ㄱ', '3개로 甲 → D', True, O, '1~3층에 하나씩.'), ('ㄴ', '적어도 6개', True, O, '순서가 바뀐 쌍 6개.'), ('ㄷ', '4개로는 제자리 불가', False, XX, '같은 가로줄을 두 번 지나면 원래대로.'), ('ㄹ', '6가지', True, O, '제자리 1 + 떨어진 두 가로줄 1 + 붙은 두 가로줄 4.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. 가로줄을 긋는 3,125가지 방법을 모두 따져 확인하였다.')]})

# ---------------------------------------------------------------- S-AY05 인쇄 작업 순서 (120가지 전수, 규칙 모두 필요)
JOBS = {'A': (3, '흑백', 13, 4), 'B': (1, '컬러', 13, 4), 'C': (1, '흑백', 11, 4), 'D': (4, '흑백', 13, 1), 'E': (2, '컬러', 20, 2)}   # 시간, 종류, 마감 시각, 1시간 늦을 때 지체료(만 원)
START = 9
def penalty(order, setup=True):
    t, pen, prev = START, 0, None
    for j in order:
        h, kind, due, w = JOBS[j]
        if setup and prev is not None and JOBS[prev][1] != kind: t += 1
        t += h; pen += max(0, t - due) * w; prev = j
    return pen
def best5(setup=True, prec=True):
    cs = sorted((penalty(o, setup), o) for o in itertools.permutations(JOBS) if not (prec and o.index('D') > o.index('B')))
    return cs[0][0], [o for c, o in cs if c == cs[0][0]]
b5, a5 = best5()
check(b5 == 30 and a5 == [('C', 'A', 'D', 'B', 'E')], f'S-AY05 {b5} {a5}')
check(best5(setup=False)[0] == 24 and best5(prec=False)[0] == 17, f'S-AY05 every rule changes the answer {best5(setup=False)} {best5(prec=False)}')
def penalty_first(order):                                 # 첫 작업 전에도 잉크를 바꾼다고 착각
    t, pen = START + 1, 0
    for i, j in enumerate(order):
        h, kind, due, w = JOBS[j]
        if i and JOBS[order[i - 1]][1] != kind: t += 1
        t += h; pen += max(0, t - due) * w
    return pen
second = sorted((penalty(o), o) for o in itertools.permutations(JOBS) if o.index('D') < o.index('B'))[1]
first_err = min(penalty_first(o) for o in itertools.permutations(JOBS) if o.index('D') < o.index('B'))
check(second == (36, ('C', 'A', 'D', 'E', 'B')) and first_err == 41, f'S-AY05 traps {second} {first_err}')
check(penalty(('C', 'D', 'A', 'B', 'E')) == 43, 'S-AY05 explanation alternative')
opts5 = ['17만 원', '24만 원', '30만 원', '36만 원', '41만 원']
check([int(o[:-3]) for o in opts5].index(b5) == 2, 'S-AY05 options')
items.append({
 'id': 'S-AY05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 甲인쇄소가 내야 하는 지체료의 최솟값은?',
 'body': [p('甲인쇄소는 인쇄기 한 대로 작업 A~E를 오전 9시부터 쉬지 않고 하나씩 차례로 처리한다. 한 작업을 시작하면 끝날 때까지 다른 작업을 할 수 없다. 흑백 작업과 컬러 작업 사이에는 잉크를 바꾸는 데 1시간이 걸리며, 같은 종류의 작업이 이어지면 바꿀 필요가 없다. 첫 작업 전에는 잉크를 바꾸지 않아도 된다. 작업 B에는 작업 D의 결과물이 필요하므로 B는 D가 끝난 뒤에 시작해야 한다.'),
          p('작업이 마감 시각보다 늦게 끝나면, 늦은 시간 1시간마다 작업별 지체료를 낸다.'),
          table(['작업', '걸리는 시간', '종류', '마감 시각', '1시간 지체료'], [[j, f'{v[0]}시간', v[1], f'{v[2]}시', f'{v[3]}만 원'] for j, v in JOBS.items()], caption='작업별 정보', num=False)],
 'options': opts5, 'answer': 2,
 'explain': [
  steps(['B는 D(4시간) 뒤에 와야 하고 D와 종류가 달라 잉크도 바꿔야 하므로, 아무리 빨라도 15시에 끝나 늦을 수밖에 없다. 그러니 지체료가 큰 C·A를 먼저 끝내고, 흑백끼리 이어 잉크 교체를 줄인다.',
         'C(9~10시) → A(10~13시) → D(13~17시, 4시간 늦어 4만 원) → 잉크 교체 1시간 → B(18~19시, 6시간 늦어 24만 원) → E(19~21시, 1시간 늦어 2만 원). 합계 30만 원.',
         'D를 A보다 먼저 하면 A가 늦어져(C → D → A → B → E는 43만 원) 더 많아진다. 모든 순서를 따져 보면 30만 원이 가장 적다.']),
  p('따라서 최솟값은 30만 원이고 정답은 <b>③</b>이다. 작업 순서 120가지를 모두 따져 확인하였다. <b>함정</b> 잉크 교체 시간을 빼면 24만 원, B가 D 뒤라는 조건을 빼면 17만 원이 된다. 첫 작업 전에도 잉크를 바꾼다고 보면 41만 원, E를 B보다 먼저 하면 36만 원이다.')]})
check(penalty(('C', 'A', 'D', 'B', 'E')) == 0 + 0 + 4 + 24 + 2, 'S-AY05 explanation sum')
def b_finish(order):
    t, prev = START, None
    for j in order:
        if prev is not None and JOBS[prev][1] != JOBS[j][1]: t += 1
        t += JOBS[j][0]; prev = j
        if j == 'B': return t
check(min(b_finish(o) for o in itertools.permutations(JOBS) if o.index('D') < o.index('B')) == 15, 'S-AY05 explanation: B ends at 15 at the earliest')

REVIEW = {
 'S-AY01': ('법조문 계산', '상', '2분 30초', '소득 유형별 지원 비율, 가산 단서(라형 제외), 시간 상한, 감경 상한', '단서·상한 누락', '가구별 지원 비율 → 상한 → 감경', '아이 돌봄 지원형, 조문 넷, 새로 설계'),
 'S-AY02': ('경우의 수', '상', '2분 30초', '첫 자리 0 제외, 한 카드의 두 숫자, 3의 배수 판정', '6·9 동시 사용', '카드별로 나누어 세기', '숫자 카드형, 새로 설계(전수)'),
 'S-AY03': ('법조문 적용', '상', '1분 30초', '기간 시작일, 경계 표현, 단서의 범위, 과태료 대상', '단서를 넓게 적용', '조문별 대조', '선거 현수막형, 조문 넷, 새로 설계'),
 'S-AY04': ('규칙 추론', '상', '3분', '가로줄 = 이웃 맞바꿈, 순서가 바뀐 쌍의 수', '같은 가로줄 두 번의 효과 간과', '맞바꿈으로 생각하기', '사다리 타기형, 새로 설계(3,125가지 전수)'),
 'S-AY05': ('최적화', '상', '3분', '선후 관계, 교체 시간, 가중 지체료', '규칙 하나 누락', '지체료 큰 작업부터 고정', '작업 순서형, 새로 설계(120가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_ay.py', 'review/sit-ay.md'), '상황판단 S-AY 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
