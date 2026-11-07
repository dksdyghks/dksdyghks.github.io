# 상황판단 S-BY01..S-BY05 — 5급 실전(심화) 수준 정예 문항: 도서 연체료(휴관일·권당 상한·감면), 풀리그 승점(경우 구성), 정보공개 결정 기간(첫날 불산입), 세 도시 시차와 회의 시간, 업무 배정(24가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, datetime as dt
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-by.js'

# ---------------------------------------------------------------- S-BY01 도서 연체료 (법조문 계산)
D = lambda m, d: dt.date(2026, m, d)
LN = {'甲': (False, 2, D(11, 3), D(11, 10)), '乙': (True, 1, D(11, 5), D(11, 12)), '丙': (False, 2, D(10, 31), D(12, 1)), '丁': (True, 3, D(11, 14), D(11, 17))}   # 감면 대상, 권수, 반납 기한, 반납일
check(all(r.weekday() != 0 for _, _, _, r in LN.values()) and all(d.weekday() != 0 for _, _, d, _ in LN.values()), 'S-BY01 no due date or return on a closed Monday')
WD = '월화수목금토일'
check(D(11, 1).weekday() == 6 and [WD[d.weekday()] for d in (D(11, 3), D(11, 10), D(11, 5), D(11, 12), D(10, 31), D(12, 1), D(11, 14), D(11, 17))] == list('화화목목토화토화'), 'S-BY01 weekdays printed in the situation')
def late_days(due, ret, skip_closed=True):
    return sum(1 for k in range(1, (ret - due).days + 1) if not (skip_closed and (due + dt.timedelta(k)).weekday() == 0))
def fine(k, skip_closed=True, cap=True, cap_total=False, cut=True):
    disc, n, due, ret = LN[k]
    per = 200 * late_days(due, ret, skip_closed)
    per = min(per, 5000) if cap and not cap_total else per
    tot = per * n
    tot = min(tot, 5000) if cap_total else tot
    return tot * F(1, 2) if cut and disc else tot
each1 = {k: fine(k) for k in LN}
check({k: late_days(LN[k][2], LN[k][3]) for k in LN} == {'甲': 6, '乙': 6, '丙': 26, '丁': 2} and each1 == {'甲': 2400, '乙': 600, '丙': 10000, '丁': 600}, f'S-BY01 {each1}')
tot1 = lambda **kw: sum(fine(k, **kw) for k in LN)
alts1 = {'정답': tot1(), '휴관일도 셈': tot1(skip_closed=False), '상한 누락': tot1(cap=False), '감면 누락': tot1(cut=False), '상한을 사람별 합계에': tot1(cap_total=True)}
check(alts1 == {'정답': 13600, '휴관일도 셈': 14400, '상한 누락': 14000, '감면 누락': 14800, '상한을 사람별 합계에': 8600}, f'S-BY01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BY01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BY01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 낼 연체료의 합계는?',
 'body': [law('<p><b>제○○조(연체료)</b> 대출한 도서를 반납 기한까지 반납하지 아니한 사람은 반납 기한의 다음 날부터 반납한 날까지의 연체 일수에 대하여 1권 1일 200원의 연체료를 낸다.</p>'
              '<p><b>제○○조(휴관일)</b> 도서관은 매주 월요일에 휴관하며, 휴관일은 연체 일수에 넣지 아니한다.</p>'
              '<p><b>제○○조(상한)</b> 연체료는 1권당 5,000원을 넘지 못한다.</p>'
              '<p><b>제○○조(감면)</b> 초등학생 이하와 65세 이상인 사람에게는 제○○조(상한)를 적용한 연체료의 100분의 50을 감면한다.</p>'),
          box('상황', ['2026년 11월 1일은 일요일이다.', '甲(30세): 2권, 반납 기한 11월 3일(화), 11월 10일(화)에 반납', '乙(초등학생): 1권, 반납 기한 11월 5일(목), 11월 12일(목)에 반납',
                      '丙(45세): 2권, 반납 기한 10월 31일(토), 12월 1일(화)에 반납', '丁(70세): 3권, 반납 기한 11월 14일(토), 11월 17일(화)에 반납'], plain=True)],
 'options': [f'{int(v):,}원' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['11월의 월요일은 2, 9, 16, 23, 30일이다.', '甲: 11월 4~10일 7일 가운데 9일(월)을 빼면 6일 → 200 × 6 × 2권 = 2,400원.', '乙: 11월 6~12일에서 9일(월)을 빼면 6일 → 1,200원에서 50% 감면 → 600원.',
         '丙: 11월 1일~12월 1일 31일에서 월요일 5일을 빼면 26일 → 1권 5,200원이지만 상한 5,000원 × 2권 = 10,000원.', '丁: 11월 15~17일에서 16일(월)을 빼면 2일 → 200 × 2 × 3권 = 1,200원에서 50% 감면 → 600원.']),
  p(f'합계 2,400 + 600 + 10,000 + 600 = <b>13,600원</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 상한을 사람별 합계에 적용하면 8,600원, 상한을 빠뜨리면 14,000원, 휴관일까지 세면 14,400원, 감면을 빠뜨리면 14,800원이다.')]})

# ---------------------------------------------------------------- S-BY02 풀리그 승점 (경우 구성)
TM = range(6); GM = list(itertools.combinations(TM, 2))
def points(res):                          # res: {경기: 이긴 팀 또는 None(무승부)}
    pt = [0] * 6
    for (a, b), w in res.items():
        if w is None: pt[a] += 1; pt[b] += 1
        else: pt[w] += 3
    return pt
def loses(res): return {(b if w == a else a) for (a, b), w in res.items() if w is not None}
all_draw = {g: None for g in GM}
# 다섯 팀이 9점: 팀 5는 모두 지고, 팀 0~4는 서로 원형으로 두 번씩 이긴다(i가 i+1, i+2를 이김).
five9 = {}
for a, b in GM:
    if b == 5: five9[(a, b)] = a
    else: five9[(a, b)] = a if (b - a) % 5 in (1, 2) else b
check(points(five9) == [9, 9, 9, 9, 9, 0], f'S-BY02 witness {points(five9)}')
draws_for_total = lambda total: [d for d in range(len(GM) + 1) if 3 * (len(GM) - d) + 2 * d == total]
t2 = {'ㄱ': len(GM) == 15, 'ㄴ': len(loses(all_draw)) > 0, 'ㄷ': draws_for_total(40) == [5], 'ㄹ': sum(x >= 9 for x in points(five9)) < 5}
check(t2 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False} and sum(points(all_draw)) == 30, f'S-BY02 {t2}')
opts2 = ['ㄱ', 'ㄹ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ']; ans2 = combo(t2, opts2, 'S-BY02')
items.append({
 'id': 'S-BY02', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('여섯 팀이 참가하는 리그에서 모든 팀은 다른 모든 팀과 한 번씩 경기한다. 경기에서 이긴 팀은 승점 3점, 진 팀은 0점을 얻고, 비기면 두 팀이 1점씩 얻는다.'),
          box('보기', ['ㄱ. 리그 전체의 경기 수는 15경기이다.', 'ㄴ. 어느 팀도 한 경기도 지지 않는 결과는 나올 수 없다.', 'ㄷ. 여섯 팀의 승점 합이 40점이면, 비긴 경기는 5경기이다.', 'ㄹ. 승점이 9점 이상인 팀이 다섯 팀일 수는 없다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['ㄱ: 여섯 팀에서 두 팀을 고르는 수 6 × 5 ÷ 2 = 15경기.', 'ㄴ: 15경기가 모두 비기면 어느 팀도 지지 않는다.', 'ㄷ: 승부가 난 경기는 승점 3점, 비긴 경기는 2점을 만든다. 비긴 경기를 d라 하면 3 × (15 − d) + 2d = 40 → d = 5.',
         'ㄹ: 한 팀이 다섯 경기를 모두 지고, 나머지 다섯 팀이 그 팀을 이긴 뒤 서로의 네 경기에서 2승 2패씩 하면(예: 원형으로 앞의 두 팀을 이김) 다섯 팀이 모두 3승 2패, 9점이다.']),
  bx([('ㄱ', '15경기', True, O, '6 × 5 ÷ 2.'), ('ㄴ', '무패 팀만 나올 수 없음', False, XX, '모두 비기면 된다.'), ('ㄷ', '비긴 경기 5', True, O, '45 − 40 = 5.'), ('ㄹ', '9점 이상 다섯 팀 불가', False, XX, '다섯 팀이 3승 2패일 수 있다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. <b>함정</b> ‘있을 수 없다’는 예 하나만 만들면 깨진다. 승점 합은 비긴 경기 하나마다 1점씩 줄어든다.')]})
check(all(3 * (15 - d) + 2 * d == 45 - d for d in range(16)), 'S-BY02 explanation: total = 45 − draws')

# ---------------------------------------------------------------- S-BY03 정보공개 결정 기간 (법조문 적용, 옳은 것)
DECIDE, EXTEND, MAX_EXT, APPEAL = 10, 10, 1, 30
def end_of(start, days): return start + dt.timedelta(days)          # 첫날을 넣지 아니한다
def in_time(asked, decided, ext=0): return ext <= MAX_EXT and decided <= end_of(asked, DECIDE + EXTEND * ext)
deemed = lambda decided_in_time: '공개' if decided_in_time else '비공개'      # 기간 안에 결정하지 않으면 비공개 결정으로 본다
appeal_ok = lambda notified, day: day <= end_of(notified, APPEAL)
f3 = [in_time(D(4, 1), D(4, 21), ext=1), not in_time(D(4, 1), D(4, 11)), MAX_EXT >= 2, deemed(False) == '공개', appeal_ok(D(5, 1), D(6, 3))]
one_true(f3, 0, 'S-BY03')
check(end_of(D(4, 1), 10) == D(4, 11) and end_of(D(4, 1), 20) == D(4, 21) and end_of(D(5, 1), 30) == D(5, 31) and not in_time(D(4, 1), D(4, 22), ext=1), 'S-BY03 dates')
items.append({
 'id': 'S-BY03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(공개 여부의 결정)</b> ① 공공기관은 정보공개 청구를 받으면 그 청구를 받은 날부터 10일 이내에 공개 여부를 결정하여야 한다.<br>② 공공기관은 부득이한 사유로 제1항의 기간 이내에 결정할 수 없을 때에는 그 기간을 10일 늘릴 수 있다. 이 경우 늘린 사실과 사유를 청구인에게 지체 없이 문서로 알려야 하며, 기간을 늘리는 것은 한 차례에 한한다.</p>'
              '<p><b>제○○조(기간의 계산)</b> 이 법에서 날로 정한 기간을 계산할 때에는 그 첫날을 넣지 아니한다.</p>'
              '<p><b>제○○조(비공개 결정의 간주)</b> 공공기관이 공개 여부를 결정하여야 하는 기간 이내에 결정하지 아니한 때에는 비공개 결정을 한 것으로 본다.</p>'
              '<p><b>제○○조(이의신청)</b> 청구인은 비공개 결정의 통지를 받은 날부터 30일 이내에 그 공공기관에 이의신청을 할 수 있다.</p>')],
 'options': ['4월 1일에 청구를 받은 공공기관이 결정 기간을 한 차례 늘렸다면, 4월 21일에 공개 여부를 결정하여도 기간을 지킨 것이다.', '4월 1일에 청구를 받은 공공기관이 기간을 늘리지 않았다면, 4월 11일에 공개 여부를 결정한 것은 기간을 지키지 못한 것이다.',
             '공공기관은 부득이한 사유가 있으면 결정 기간을 두 차례까지 늘릴 수 있다.', '공공기관이 결정 기간 이내에 공개 여부를 결정하지 아니하면 공개 결정을 한 것으로 본다.', '5월 1일에 비공개 결정의 통지를 받은 청구인은 6월 3일에 이의신청을 할 수 있다.'],
 'answer': 0,
 'explain': [
  steps(['첫날(청구를 받은 날)을 넣지 않으므로 4월 1일 청구의 결정 기간은 4월 2일부터 10일째인 4월 11일까지, 한 차례 늘리면 4월 21일까지이다.', '5월 1일 통지를 받으면 이의신청 기간은 5월 2일부터 30일째인 5월 31일까지이다.']),
  ox([(True, O, '늘린 기간의 끝은 4월 21일이다.'), (False, XX, '4월 11일까지가 기간이므로 지킨 것이다.'), (False, XX, '기간을 늘리는 것은 한 차례에 한한다.'), (False, XX, '비공개 결정을 한 것으로 본다.'), (False, XX, '5월 31일이 지났다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> 첫날을 넣지 않는 계산(4월 10일이 아니라 4월 11일)과 간주 규정의 방향(공개가 아니라 비공개)을 확인한다.')]})

# ---------------------------------------------------------------- S-BY04 세 도시 시차와 회의 시간 (보기)
UTC = {'A': 9, 'B': 1, 'C': -4}                 # 협정 세계시와의 차(시간)
def work(city, day=0):                          # 현지 오전 9시~오후 6시를 협정 세계시 기준 분으로
    s = (day * 24 + 9 - UTC[city]) * 60; return (s, s + 9 * 60)
def overlap(*cities):
    best = 0
    for days in itertools.product(range(-1, 2), repeat=len(cities)):
        iv = [work(c, d) for c, d in zip(cities, days)]
        best = max(best, min(e for s, e in iv) - max(s for s, e in iv))
    return best
def starts(a, b, mins):                         # 회의를 시작할 수 있는 시각(협정 세계시 분, 하루 안)
    return sorted({t % 1440 for d1 in range(-1, 2) for d2 in range(-1, 2) for t in range(max(work(a, d1)[0], work(b, d2)[0]), min(work(a, d1)[1], work(b, d2)[1]) - mins + 1)})
local = lambda city, utc_min: ((utc_min + UTC[city] * 60) % 1440)
t4 = {'ㄱ': overlap('A', 'B') >= 60, 'ㄴ': overlap('A', 'B', 'C') >= 30, 'ㄷ': overlap('B', 'C') == 240, 'ㄹ': [local('B', t) for t in starts('A', 'B', 60)] == [9 * 60]}
check(t4 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': True} and overlap('A', 'B') == 60 and overlap('A', 'C') == 0, f'S-BY04 {t4}')
check([local('A', t) for t in starts('A', 'B', 60)] == [17 * 60], 'S-BY04 explanation: A local 5 p.m.')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ']; ans4 = combo(t4, opts4, 'S-BY04')
items.append({
 'id': 'S-BY04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('갑 회사는 도시 A, B, C에 사무소를 두고 있다. 세 도시의 시각은 협정 세계시보다 각각 9시간 빠르고, 1시간 빠르고, 4시간 느리다. 세 사무소는 모두 현지 시각으로 오전 9시부터 오후 6시까지 일하며, 화상 회의는 참석하는 사무소가 모두 일하는 시간 안에서만 연다.'),
          box('보기', ['ㄱ. A와 B 사무소는 1시간짜리 회의를 열 수 있다.', 'ㄴ. 세 사무소가 함께 30분짜리 회의를 열 수 있다.', 'ㄷ. B와 C 사무소가 함께 일하는 시간은 하루 4시간이다.', 'ㄹ. A와 B 사무소가 1시간짜리 회의를 연다면, B의 현지 시각으로 오전 9시에 시작하여야 한다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['협정 세계시로 바꾸면 일하는 시간은 A 0~9시, B 8~17시, C 13~22시이다.', 'ㄱ·ㄹ: A와 B가 겹치는 시간은 8~9시의 1시간뿐이므로 1시간 회의는 B 현지 오전 9시(A 현지 오후 5시)에 시작해야 한다.', 'ㄴ: A(0~9시)와 C(13~22시)가 겹치지 않으므로 세 곳이 함께 할 수 없다.', 'ㄷ: B와 C는 13~17시의 4시간이 겹친다.']),
  bx([('ㄱ', 'A·B 1시간 회의', True, O, '8~9시.'), ('ㄴ', '세 곳 30분 회의', False, XX, 'A와 C가 겹치지 않는다.'), ('ㄷ', 'B·C 4시간', True, O, '13~17시.'), ('ㄹ', 'B 오전 9시 시작', True, O, '겹치는 1시간의 시작.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 시차는 한 기준(협정 세계시)으로 모두 바꾼 뒤 겹치는 구간을 찾는다.')]})

# ---------------------------------------------------------------- S-BY05 업무 배정 (24가지 전수, 규칙 모두 필요)
WK = '甲乙丙丁'; TS = 'ABCD'
HR = {'甲': {'A': 2, 'B': 6, 'C': 2, 'D': 8}, '乙': {'A': 2, 'B': 5, 'C': 7, 'D': 4}, '丙': {'A': 7, 'B': 9, 'C': 6, 'D': 2}, '丁': {'A': 5, 'B': 7, 'C': 7, 'D': 3}}   # 처리 시간(시간)
RULES = [lambda a: a['甲'] != 'A', lambda a: not (a['乙'] == 'B' and a['丙'] == 'D'), lambda a: all(HR[w][a[w]] <= 6 for w in WK)]
def plans5(on=(1, 1, 1)):
    res = []
    for pm in itertools.permutations(TS):
        a = dict(zip(WK, pm))
        if all(r(a) for r, o in zip(RULES, on) if o): res.append((sum(HR[w][a[w]] for w in WK), pm))
    return sorted(res)
PL = plans5(); b5 = PL[0][0]
check(b5 == 17 and [s for v, s in PL if v == b5] == [('B', 'A', 'C', 'D')], f'S-BY05 {PL[:3]}')
alts5 = [plans5(tuple(0 if j == i else 1 for j in range(3))) for i in range(3)]
for i, al in enumerate(alts5): check(al[0][0] < b5 and [v for v, s in al].count(al[0][0]) == 1, f'S-BY05 rule {i} changes the answer {al[:2]}')
check([al[0] for al in alts5] == [(16, ('A', 'B', 'C', 'D')), (14, ('C', 'B', 'D', 'A')), (13, ('C', 'A', 'D', 'B'))], f'S-BY05 traps {[al[0] for al in alts5]}')
sec5 = sorted({v for v, s in PL})[1]
check(sec5 == 21, f'S-BY05 second {sec5}')
opts5v = sorted([b5, sec5] + [al[0][0] for al in alts5]); check(len(set(opts5v)) == 5, f'S-BY05 {opts5v}')
ans5 = opts5v.index(b5)
check([s for v, s in PL if s[2] == 'D'] == [], 'S-BY05 explanation: 丙 on D is infeasible')
items.append({
 'id': 'S-BY05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 네 사람의 처리 시간 합계의 최솟값은?',
 'body': [p('甲, 乙, 丙, 丁 네 사람이 업무 A, B, C, D를 한 사람이 하나씩 맡는다. 사람마다 각 업무를 처리하는 데 걸리는 시간은 아래와 같다. 업무는 다음 규칙을 모두 지키면서 네 사람의 처리 시간 합계가 가장 적도록 배정한다.'),
          table(['구분', 'A', 'B', 'C', 'D'], [[w] + [str(HR[w][t]) for t in TS] for w in WK], caption='사람별 업무 처리 시간', unit='(단위: 시간)', num=False),
          box('규칙', ['甲은 A를 맡지 않는다.', '乙이 B를 맡으면 丙은 D를 맡지 않는다.', '누구도 처리 시간이 7시간 이상인 업무는 맡지 않는다.'], plain=True)],
 'options': [f'{v}시간' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['셋째 규칙과 첫째 규칙으로 맡을 수 있는 업무를 줄이면 甲은 B·C, 乙은 A·B·D, 丙은 C·D, 丁은 A·D이다.', '丙이 D를 맡으면 丁은 A, 甲과 乙이 B·C를 나누는데 乙은 C를 맡을 수 없으므로 乙이 B를 맡게 되어 둘째 규칙에 어긋난다.',
         '따라서 丙은 C(6시간), 甲은 B(6시간)를 맡고, 乙·丁이 A·D를 나눈다: 乙 A(2) + 丁 D(3) = 5시간, 乙 D(4) + 丁 A(5) = 9시간.', '최솟값은 6 + 6 + 2 + 3 = <b>17시간</b>이다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 배정 24가지를 모두 따져 확인하였다. <b>함정</b> 첫째 규칙을 빼면 16시간, 둘째 규칙을 빼면 14시간, 셋째 규칙을 빼면 13시간이 된다.')]})
check(HR['甲']['B'] + HR['乙']['A'] + HR['丙']['C'] + HR['丁']['D'] == 17 and HR['乙']['D'] + HR['丁']['A'] == 9, 'S-BY05 explanation arithmetic')

REVIEW = {
 'S-BY01': ('법조문 계산', '상', '2분 30초', '연체 일수, 휴관일 제외, 권당 상한, 감면 순서', '상한을 합계에 적용', '사람별 일수 → 권당 상한 → 감면', '도서 연체료형, 조문 넷, 새로 설계'),
 'S-BY02': ('수리 추론', '상', '2분', '경기 수, 승점 합과 무승부, 반례 구성', '‘불가능’ 진술을 반례 없이 받아들임', '반례 하나 만들기', '풀리그 승점형, 새로 설계(반례 코드 확인)'),
 'S-BY03': ('법조문 적용', '상', '1분 30초', '첫날 불산입, 연장 한 차례, 간주 규정의 방향', '첫날을 넣어 셈', '날짜를 직접 세기', '정보공개 결정 기간형, 조문 넷, 새로 설계'),
 'S-BY04': ('수리 추론', '상', '2분', '시차를 한 기준으로 바꾸기, 겹치는 구간', '시차 방향 착오', '협정 세계시로 통일', '시차 회의형, 새로 설계'),
 'S-BY05': ('최적화', '상', '3분', '가능한 업무 줄이기, 조건부 금지, 시간 상한', '규칙 하나 누락', '맡을 수 있는 업무부터 줄이기', '업무 배정형, 새로 설계(24가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_by.py', 'review/sit-by.md'), '상황판단 S-BY 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
