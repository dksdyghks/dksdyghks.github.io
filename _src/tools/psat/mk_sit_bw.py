# 상황판단 S-BW01..S-BW05 — 5급 실전(심화) 수준 정예 문항: 출산 지원금(출생 순위·쌍둥이·전입 기간), 피자 토핑 고르기(전수), 통신판매 청약 철회 규정, 배와 강물(속력), 회의 시각 정하기(규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bw.js'

# ---------------------------------------------------------------- S-BW01 출산 지원금 (법조문 계산, 만 원)
FAM = {'甲': ([1], 36), '乙': ([2], 6), '丙': ([3, 4], 24), '丁': ([2], 14)}      # 이번에 태어난 아이의 출생 순위들, 시에 주소를 둔 개월 수
def amount(rank): return 200 if rank == 1 else 300 if rank == 2 else 500
def grant(k, twins_once=False, cut=True, cut_to_zero=False, dings_first=False):
    ranks, months = FAM[k]
    if twins_once: ranks = ranks[:1]
    if dings_first and k == '丁': ranks = [1]
    tot = F(sum(amount(r) for r in ranks))
    if months < 12 and cut: tot = F(0) if cut_to_zero else tot / 2
    return tot
each1 = {k: grant(k) for k in FAM}
check(each1 == {'甲': 200, '乙': 150, '丙': 1000, '丁': 300}, f'S-BW01 {each1}')
tot1 = lambda **kw: sum(grant(k, **kw) for k in FAM)
alts1 = {'정답': tot1(), '쌍둥이 한 명분만': tot1(twins_once=True), '전입 감액 누락': tot1(cut=False), '전입 1년 미만 미지급': tot1(cut_to_zero=True), '丁을 첫째로': tot1(dings_first=True)}
check(alts1 == {'정답': 1650, '쌍둥이 한 명분만': 1150, '전입 감액 누락': 1800, '전입 1년 미만 미지급': 1500, '丁을 첫째로': 1550}, f'S-BW01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BW01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
manwon = lambda v: f'{int(v) // 1000:,}천{int(v) % 1000}만 원'.replace('천0만', '천만') if v >= 1000 else f'{int(v)}만 원'
check([manwon(v) for v in vals1] == ['1천150만 원', '1천500만 원', '1천550만 원', '1천650만 원', '1천800만 원'], f'S-BW01 labels {[manwon(v) for v in vals1]}')
items.append({
 'id': 'S-BW01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 받을 출산 지원금의 합계는?',
 'body': [law('<p><b>제○○조(지원금)</b> ① 시는 아이를 낳은 가정에 아이의 출생 순위에 따라 다음 금액을 지원한다.<br>1. 첫째: 200만 원<br>2. 둘째: 300만 원<br>3. 셋째 이후: 500만 원<br>② 출생 순위는 부모가 기른 모든 자녀를 기준으로 하며, 다른 지역에서 태어난 자녀도 포함한다.<br>③ 쌍둥이 이상을 낳은 경우에는 아이마다 각각의 출생 순위에 따라 지원한다.</p>'
              '<p><b>제○○조(감액)</b> 아이가 태어난 날 현재 시에 주소를 둔 기간이 1년 미만인 가정에는 제○○조(지원금)에 따른 금액의 2분의 1을 지원한다.</p>'),
          box('상황', ['甲: 첫째 아이 출산, 시에 주소를 둔 지 3년', '乙: 둘째 아이 출산, 시에 주소를 둔 지 6개월', '丙: 이미 자녀 둘을 기르고 있으며 이번에 쌍둥이 출산, 시에 주소를 둔 지 2년', '丁: 둘째 아이 출산(첫째는 다른 지역에서 출생), 시에 주소를 둔 지 1년 2개월'], plain=True)],
 'options': [manwon(v) for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 첫째 200만 원.', '乙: 둘째 300만 원이지만 주소를 둔 지 1년 미만이라 절반 → 150만 원.', '丙: 쌍둥이는 셋째와 넷째로 각각 500만 원 → 1,000만 원.', '丁: 다른 지역에서 태어난 첫째도 세므로 둘째 → 300만 원(1년 이상이라 감액 없음).']),
  p(f'합계 200 + 150 + 1,000 + 300 = <b>1천650만 원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 쌍둥이를 한 명분만 주면 1천150만 원, 감액 대상에게 아무것도 주지 않으면 1천500만 원, 丁을 첫째로 보면 1천550만 원, 감액을 빠뜨리면 1천800만 원이다.')]})

# ---------------------------------------------------------------- S-BW02 피자 토핑 고르기 (전수)
MEAT = ['불고기', '햄', '베이컨']; OTHER = ['치즈', '버섯', '올리브']
PICKS = [s for n in (2, 3) for s in itertools.combinations(MEAT + OTHER, n)]
t2 = {'ㄱ': len(PICKS) == 35, 'ㄴ': sum('치즈' in s for s in PICKS) == 15, 'ㄷ': sum(sum(x in MEAT for x in s) == 1 for s in PICKS) == 16, 'ㄹ': sum(not any(x in MEAT for x in s) for s in PICKS) == 4}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': False, 'ㄹ': True} and sum(sum(x in MEAT for x in s) == 1 for s in PICKS) == 18, f'S-BW02 {t2}')
check(15 + 20 == 35 and 5 + 10 == 15 and 3 * 3 + 3 * 3 == 18 and 3 + 1 == 4, 'S-BW02 explanation arithmetic')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ', 'ㄱ, ㄴ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BW02')
items.append({
 'id': 'S-BW02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('피자에 올릴 토핑으로 고기 토핑 3가지(불고기, 햄, 베이컨)와 그 밖의 토핑 3가지(치즈, 버섯, 올리브)가 있다. 서로 다른 토핑을 2가지 이상 3가지 이하로 고르며, 고르는 순서는 따지지 않는다.'),
          box('보기', ['ㄱ. 토핑을 고르는 방법은 모두 35가지이다.', 'ㄴ. 치즈를 넣는 방법은 15가지이다.', 'ㄷ. 고기 토핑을 정확히 한 가지만 넣는 방법은 16가지이다.', 'ㄹ. 고기 토핑을 하나도 넣지 않는 방법은 4가지이다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 6가지에서 2가지 15가지 + 3가지 20가지 = 35가지.', 'ㄴ: 치즈를 넣고 나머지 5가지에서 1가지(5가지) 또는 2가지(10가지) → 15가지.', 'ㄷ: 고기 1가지(3가지) × 그 밖의 토핑 1가지(3가지) 또는 2가지(3가지) → 9 + 9 = 18가지.', 'ㄹ: 그 밖의 토핑 3가지에서 2가지(3가지) 또는 3가지(1가지) → 4가지.']),
  bx([('ㄱ', '35가지', True, O, '15 + 20.'), ('ㄴ', '15가지', True, O, '5 + 10.'), ('ㄷ', '16가지', False, XX, '18가지이다.'), ('ㄹ', '4가지', True, O, '3 + 1.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 35가지를 모두 나열해 확인하였다.')]})

# ---------------------------------------------------------------- S-BW03 통신판매 청약 철회 (법조문 적용, 옳지 않은 것)
def can_withdraw(days_since, opened_to_check=True, opened=False, copyable=False, differs=False, months_since=0):
    if differs: return months_since <= 3
    if days_since > 7: return False
    if opened and copyable: return False
    if opened and not opened_to_check: return False
    return True
f3 = [can_withdraw(5), can_withdraw(3, opened=True, opened_to_check=True), can_withdraw(10), not can_withdraw(2, opened=True, opened_to_check=False, copyable=True), can_withdraw(60, differs=True, months_since=2)]
one_false(f3, 2, 'S-BW03')
check(can_withdraw(7) and not can_withdraw(8) and not can_withdraw(100, differs=True, months_since=4), 'S-BW03 boundaries')
items.append({
 'id': 'S-BW03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳지 않은 것은?',
 'body': [law('<p><b>제○○조(청약 철회)</b> ① 통신판매로 물건을 산 소비자는 물건을 받은 날부터 7일 이내에 청약을 철회할 수 있다.<br>② 다음 각 호의 경우에는 제1항에 따라 청약을 철회할 수 없다.<br>1. 소비자의 책임으로 물건이 훼손된 경우. 다만 내용을 확인하려고 포장을 뜯은 경우는 제외한다.<br>2. 복제할 수 있는 물건의 포장을 뜯은 경우</p>'
              '<p><b>제○○조(표시와 다른 물건)</b> 받은 물건이 광고나 표시와 다르면, 소비자는 물건을 받은 날부터 3개월 이내에 청약을 철회할 수 있다.</p>')],
 'options': ['물건을 받은 날부터 5일째에 청약을 철회할 수 있다.', '내용을 확인하려고 포장을 뜯었더라도 물건을 받은 지 3일째라면 청약을 철회할 수 있다.', '광고와 같은 물건이라도 받은 지 10일째에 청약을 철회할 수 있다.',
             '포장을 뜯은 음악 CD는 받은 지 2일째라도 제○○조(청약 철회)에 따라 청약을 철회할 수 없다.', '광고와 다른 물건을 받은 지 2개월이 지났더라도 청약을 철회할 수 있다.'],
 'answer': 2,
 'explain': [
  ox([(True, O, '7일 이내이다.'), (True, O, '내용 확인을 위해 포장을 뜯은 경우는 제외된다.'), (False, XX, '광고와 같은 물건은 받은 날부터 7일 이내에만 철회할 수 있다.'),
      (True, O, '복제할 수 있는 물건의 포장을 뜯은 경우이다.'), (True, O, '광고와 다르면 3개월 이내에 철회할 수 있다.')]),
  p('따라서 정답은 <b>③</b>이다. <b>함정</b> 일반 철회 기간(7일)과 표시와 다른 물건의 철회 기간(3개월), 포장 훼손의 예외를 구별한다.')]})

# ---------------------------------------------------------------- S-BW04 배와 강물 (수리 추론)
BOAT, RIVER, DIST = 12, 3, 45
down = F(DIST, BOAT + RIVER); up = F(DIST, BOAT - RIVER)
t4 = {'ㄱ': down == 3, 'ㄴ': up == 4, 'ㄷ': F(2 * DIST, down + up) == BOAT, 'ㄹ': (down + up) - F(2 * DIST, BOAT) == F(1, 2)}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': False, 'ㄹ': True} and up == 5 and F(2 * DIST, down + up) == F(45, 4), f'S-BW04 {t4}')
opts4 = ['ㄱ, ㄹ', 'ㄴ, ㄷ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ', 'ㄴ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BW04')
items.append({
 'id': 'S-BW04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('잔잔한 물에서 시속 12km로 가는 배가 있다. 이 배가 시속 3km로 흐르는 강에서 하류의 A 나루와 상류의 B 나루 사이 45km를 오간다. 강을 따라 내려갈 때는 두 속력을 더하고, 거슬러 올라갈 때는 배의 속력에서 강물의 속력을 뺀 속력으로 간다.'),
          box('보기', ['ㄱ. B 나루에서 A 나루로 내려가는 데 3시간이 걸린다.', 'ㄴ. A 나루에서 B 나루로 올라가는 데 4시간이 걸린다.', 'ㄷ. 한 번 왕복할 때의 평균 속력은 시속 12km이다.', 'ㄹ. 강물이 흐르지 않는다면 한 번 왕복하는 시간이 30분 줄어든다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 45 ÷ (12 + 3) = 3시간.', 'ㄴ: 45 ÷ (12 − 3) = 5시간.', 'ㄷ: 왕복 90km ÷ 8시간 = 시속 11.25km로, 12km보다 느리다.', 'ㄹ: 강물이 없으면 90 ÷ 12 = 7.5시간으로 8시간보다 0.5시간 짧다.']),
  bx([('ㄱ', '3시간', True, O, '45 ÷ 15.'), ('ㄴ', '4시간', False, XX, '5시간이다.'), ('ㄷ', '평균 시속 12km', False, XX, '11.25km이다.'), ('ㄹ', '30분 단축', True, O, '8 − 7.5.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 평균 속력은 두 속력의 평균이 아니라 전체 거리 ÷ 전체 시간이다. 느리게 가는 구간에 시간이 더 걸리므로 평균은 낮아진다.')]})

# ---------------------------------------------------------------- S-BW05 회의 시각 정하기 (규칙 모두 필요)
SLOTS = [9, 10, 11, 13, 14, 15, 16]
AV = {'甲': {9, 11, 13, 15, 16}, '乙': {10, 11, 14, 15, 16}, '丙': {9, 10, 11, 14, 15}, '丁': {11, 13, 14, 15, 16}, '戊': {10, 11, 14, 15, 16}, '己': {9, 10, 11, 13, 14}}
ROOM_OFF = {11, 15}
cnt = lambda t: sum(t in v for v in AV.values())
def best(r=(1, 1)):
    ok_ = [t for t in SLOTS if (not r[0] or t in AV['甲']) and (not r[1] or t not in ROOM_OFF)]
    m = max(map(cnt, ok_)); return [t for t in ok_ if cnt(t) == m], m
b5, m5 = best()
check(b5 == [16] and m5 == 4, f'S-BW05 {b5} {m5}')
check(best((0, 1)) == ([14], 5) and best((1, 0)) == ([11], 6), 'S-BW05 every rule changes the answer')
check([cnt(t) for t in SLOTS] == [3, 4, 6, 3, 5, 5, 4], f'S-BW05 counts {[cnt(t) for t in SLOTS]}')
opts5 = [9, 11, 13, 14, 16]; ans5 = opts5.index(16)
items.append({
 'id': 'S-BW05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 회의를 시작할 시각은?',
 'body': [p('갑 팀은 내일 1시간짜리 회의를 한 번 열려고 한다. 회의는 9시, 10시, 11시, 13시, 14시, 15시, 16시 가운데 한 시각에 시작하며, 팀원 6명이 참석할 수 있는 시각은 아래와 같다. 팀은 다음 조건을 모두 지키면서 참석자가 가장 많은 시각에 회의를 연다.'),
          table(['팀원', '참석할 수 있는 시작 시각'], [[k, ', '.join(f'{t}시' for t in sorted(v))] for k, v in AV.items()], caption='팀원별 참석할 수 있는 시각', num=False),
          box('조건', ['甲은 회의에 반드시 참석해야 한다.', '회의실은 11시와 15시에 시작하는 회의에는 쓸 수 없다.'], plain=True)],
 'options': [f'{t}시' for t in opts5], 'answer': ans5,
 'explain': [
  steps(['시각별 참석 가능 인원: 9시 3명, 10시 4명, 11시 6명, 13시 3명, 14시 5명, 15시 5명, 16시 4명.', '甲이 참석할 수 있는 시각은 9·11·13·15·16시이고, 이 가운데 11시와 15시는 회의실을 쓸 수 없다.', '남은 9시(3명), 13시(3명), 16시(4명) 가운데 <b>16시</b>가 가장 많다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. <b>함정</b> 甲의 조건을 빼면 14시(5명), 회의실 조건을 빼면 11시(6명)를 고르게 된다.')]})

REVIEW = {
 'S-BW01': ('법조문 계산', '상', '2분', '출생 순위의 기준, 쌍둥이 각각, 전입 1년 미만 절반', '쌍둥이·순위 착오', '가정별 순위 → 금액 → 감액', '출산 지원금형, 조문 둘, 새로 설계'),
 'S-BW02': ('경우의 수', '상', '2분', '조합의 합, 반드시 포함, 정확히 하나, 하나도 없음', '개수별로 나누지 않음', '고르는 개수별로 나누기', '피자 토핑형, 새로 설계(전수)'),
 'S-BW03': ('법조문 적용', '상', '1분 30초', '7일과 3개월, 포장 훼손의 예외, 복제 가능 물건', '기간 착오', '조문별 대조', '청약 철회형, 조문 둘, 새로 설계'),
 'S-BW04': ('수리 추론', '상', '2분', '속력의 합과 차, 평균 속력', '두 속력의 산술평균', '거리 ÷ 시간', '배와 강물형, 새로 설계'),
 'S-BW05': ('최적화', '상', '1분 30초', '필수 참석자, 사용 불가 시각, 최대 인원', '조건 하나 누락', '조건으로 거른 뒤 인원 비교', '회의 시각형, 새로 설계(조건 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bw.py', 'review/sit-bw.md'), '상황판단 S-BW 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
