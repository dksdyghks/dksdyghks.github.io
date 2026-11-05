# 상황판단 S-BJ01..S-BJ05 — 5급 실전(심화) 수준 정예 문항: 도서 연체 대출 정지(휴관일·상한·감경 순서), 합이 15인 카드 세 장(전수), 공사장 소음 규정, 물탱크 채우기, 작업 배정(243가지 전수, 규칙 모두 필요).
# 모든 답은 아래 코드가 단순 열거·모의 계산으로 다시 확인한다(기대값과 함정 값을 코드로 만든다). see psatkit.py
import itertools, math
from datetime import date, timedelta
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-bj.js'

# ---------------------------------------------------------------- S-BJ01 도서 연체 대출 정지 (법조문 계산)
CLOSED = {0}                                                    # 월요일 휴관(weekday 0)
def late_days(due, back, holiday_rule=True):
    if holiday_rule:
        while due.weekday() in CLOSED: due += timedelta(days=1)
    return max(0, (back - due).days)
D = lambda d: date(2025, 11, d)                                 # 2025년 11월: 10일 월요일
check(D(10).weekday() == 0 and D(13).weekday() == 3, 'S-BJ01 calendar')
LOANS = {'甲': (40, [(D(5), D(8)), (D(6), D(11))]), '乙': (30, [(D(10), D(13))]), '丙': (70, [(D(1), D(10)), (D(1), D(11)), (D(1), D(16))]), '丁': (66, [(D(4), D(11))])}   # 나이, [(반납 예정일, 반납일)]
def stop(k, holiday=True, cap_first=True, senior=True, ceil_=True):
    age, ls = LOANS[k]; s = sum(late_days(a, b, holiday) for a, b in ls)
    half = lambda x: -(-x // 2) if ceil_ else x // 2
    if senior and age >= 65: return half(min(s, 30)) if cap_first else min(half(s), 30)
    return min(s, 30)
each1 = {k: stop(k) for k in LOANS}
check(each1 == {'甲': 8, '乙': 2, '丙': 15, '丁': 4}, f'S-BJ01 {each1}')
tot1 = lambda **kw: sum(stop(k, **kw) for k in LOANS)
alts1 = {'정답': tot1(), '휴관일 규정 누락': tot1(holiday=False), '감경 후 상한': tot1(cap_first=False), '내림': tot1(ceil_=False), '감경 누락': tot1(senior=False)}
check(alts1 == {'정답': 29, '휴관일 규정 누락': 30, '감경 후 상한': 31, '내림': 28, '감경 누락': 47}, f'S-BJ01 {alts1}')
vals1 = sorted(alts1.values()); check(len(set(vals1)) == 5, f'S-BJ01 distinct {vals1}')
ans1 = vals1.index(alts1['정답'])
items.append({
 'id': 'S-BJ01', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲~丁이 받는 대출 정지 일수의 합은?',
 'body': [law('<p><b>제○○조(연체일)</b> ① 반납 예정일 다음 날부터 실제 반납한 날까지의 일수를 연체일로 한다. 휴관일도 연체일에 넣는다.<br>② 반납 예정일이 휴관일이면 그다음 개관일을 반납 예정일로 본다.</p>'
              '<p><b>제○○조(대출 정지)</b> ① 연체한 이용자는 연체한 책마다의 연체일을 모두 더한 일수 동안 대출할 수 없다. 다만 이 기간은 30일을 넘지 아니한다.<br>② 65세 이상인 이용자의 대출 정지 기간은 제1항에 따라 정한 기간의 2분의 1로 하며, 1일 미만은 1일로 한다.</p>'),
          box('상황', ['도서관은 매주 월요일에 쉬며, 2025년 11월 10일은 월요일이다.', '甲(40세): 반납 예정일이 11월 5일인 책을 11월 8일에, 예정일이 11월 6일인 책을 11월 11일에 반납하였다.',
                      '乙(30세): 반납 예정일이 11월 10일인 책을 11월 13일에 반납하였다.', '丙(70세): 반납 예정일이 11월 1일인 책 세 권을 각각 11월 10일, 11일, 16일에 반납하였다.', '丁(66세): 반납 예정일이 11월 4일인 책을 11월 11일에 반납하였다.'], plain=True)],
 'options': [f'{v}일' for v in vals1], 'answer': ans1,
 'explain': [
  steps(['甲: 3일 + 5일 = 8일(휴관일인 10일도 연체일에 넣는다).', '乙: 예정일 11월 10일이 휴관일(월)이라 11월 11일을 예정일로 보아 12일·13일의 2일.',
         '丙: 9일 + 10일 + 15일 = 34일 → 30일 상한 → 65세 이상이라 절반 15일.', '丁: 7일 → 절반 3.5일 → 1일 미만을 1일로 보아 4일.']),
  p(f'합 8 + 2 + 15 + 4 = <b>29일</b>. 따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>함정</b> 휴관일 규정을 빼면 30일, 절반으로 줄인 뒤 상한을 적용하면 31일, 1일 미만을 버리면 28일, 65세 감경을 빼면 47일이다.')]})
check(D(5).weekday() == 2 and D(6).weekday() == 3 and late_days(D(6), D(11)) == 5, 'S-BJ01 甲 due dates are open days')

# ---------------------------------------------------------------- S-BJ02 합이 15인 카드 세 장 (전수)
TRI = [c for c in itertools.combinations(range(1, 10), 3) if sum(c) == 15]
cnt = {n: sum(n in t for t in TRI) for n in range(1, 10)}
t2 = {'ㄱ': len(TRI) == 8, 'ㄴ': cnt[5] == 4, 'ㄷ': min(cnt.values()) >= 2, 'ㄹ': any(all(x % 2 == 0 for x in t) for t in TRI)}
check(t2 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and cnt == {1: 2, 2: 3, 3: 2, 4: 3, 5: 4, 6: 3, 7: 2, 8: 3, 9: 2}, f'S-BJ02 {t2} {cnt}')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄱ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-BJ02')
items.append({
 'id': 'S-BJ02', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('1부터 9까지의 숫자가 하나씩 적힌 카드 9장이 있다. 이 가운데 3장을 골라, 적힌 숫자의 합이 15가 되는 묶음을 ‘맞춤 묶음’이라 한다. 고르는 순서는 따지지 않는다.'),
          box('보기', ['ㄱ. 맞춤 묶음은 모두 8가지이다.', 'ㄴ. 5가 적힌 카드가 들어 있는 맞춤 묶음은 4가지이다.', 'ㄷ. 1부터 9까지 어느 카드든 적어도 두 가지 맞춤 묶음에 들어 있다.', 'ㄹ. 세 장 모두 짝수인 맞춤 묶음이 있다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['가장 작은 수부터 나열하면 1·5·9, 1·6·8, 2·4·9, 2·5·8, 2·6·7, 3·4·8, 3·5·7, 4·5·6의 8가지이다(ㄱ).', '5가 든 것: 1·5·9, 2·5·8, 3·5·7, 4·5·6의 4가지(ㄴ).',
         '카드마다 든 묶음 수: 1·3·7·9는 2가지, 2·4·6·8은 3가지, 5는 4가지(ㄷ).', '짝수 세 개의 합은 짝수이므로 15가 될 수 없다(ㄹ).']),
  bx([('ㄱ', '8가지', True, O, '위 목록.'), ('ㄴ', '5가 든 것 4가지', True, O, '1·5·9, 2·5·8, 3·5·7, 4·5·6.'), ('ㄷ', '모든 카드가 두 묶음 이상', True, O, '가장 적은 것도 2가지.'), ('ㄹ', '모두 짝수인 묶음', False, XX, '짝수의 합은 짝수.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. 세 장을 고르는 84가지를 모두 따져 확인하였다.')]})
check(TRI == [(1, 5, 9), (1, 6, 8), (2, 4, 9), (2, 5, 8), (2, 6, 7), (3, 4, 8), (3, 5, 7), (4, 5, 6)] and math.comb(9, 3) == 84, 'S-BJ02 explanation list')

# ---------------------------------------------------------------- S-BJ03 공사장 소음 규정 (법조문 적용, 옳은 것)
LIM = {'주거': {'낮': 65, '저녁': 60, '밤': 50}}; LIM['상업'] = {k: v + 5 for k, v in LIM['주거'].items()}
def slot(h): return '낮' if 7 <= h < 18 else '저녁' if 18 <= h < 22 else '밤'
def over(zone, h, db): return db > LIM[zone][slot(h)]
def fine_now(first_violation): return not first_violation
def night_ok(urgent, reported): return urgent and reported
f3 = [over('주거', 19, 62), over('상업', 10, 68), fine_now(True), night_ok(True, False), LIM['상업']['밤'] == 50]
one_true(f3, 0, 'S-BJ03')
check(LIM['상업'] == {'낮': 70, '저녁': 65, '밤': 55} and slot(19) == '저녁', 'S-BJ03 limits')
items.append({
 'id': 'S-BJ03', 'type': '상황판단 · 법조문 적용', 'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(소음 기준)</b> ① 주거지역 공사장의 소음은 낮(오전 7시부터 오후 6시 전까지) 65데시벨, 저녁(오후 6시부터 오후 10시 전까지) 60데시벨, 밤(오후 10시부터 다음 날 오전 7시 전까지) 50데시벨을 넘어서는 아니 된다.<br>② 상업지역 공사장의 소음 기준은 제1항의 각 기준에 5데시벨을 더한 값으로 한다.</p>'
              '<p><b>제○○조(조치)</b> ① 구청장은 소음 기준을 넘은 공사장에 개선을 명하여야 한다.<br>② 제1항의 개선 명령을 따르지 아니한 자에게는 200만 원 이하의 과태료를 부과한다.</p>'
              '<p><b>제○○조(밤 공사)</b> 밤에는 공사를 하여서는 아니 된다. 다만 긴급한 복구 공사로서 구청장에게 미리 신고한 경우에는 그러하지 아니하다.</p>')],
 'options': ['주거지역 공사장에서 오후 7시에 62데시벨의 소음이 났다면 소음 기준을 넘은 것이다.', '상업지역 공사장에서 오전 10시에 68데시벨의 소음이 났다면 소음 기준을 넘은 것이다.',
             '소음 기준을 처음 넘은 공사장에는 곧바로 과태료를 부과한다.', '긴급한 복구 공사라면 신고하지 않아도 밤에 공사할 수 있다.', '상업지역 공사장의 밤 소음 기준은 50데시벨이다.'],
 'answer': 0,
 'explain': [
  ox([(True, O, '오후 7시는 저녁이고 주거지역 저녁 기준은 60데시벨이다.'), (False, XX, '상업지역 낮 기준은 65 + 5 = 70데시벨이다.'), (False, XX, '먼저 개선 명령을 하고, 이를 따르지 않을 때 과태료를 부과한다.'),
      (False, XX, '긴급 복구 공사도 미리 신고하여야 한다.'), (False, XX, '50 + 5 = 55데시벨이다.')]),
  p('따라서 정답은 <b>①</b>이다. <b>함정</b> 시간대의 경계(오후 6시·10시), 지역 가산, 과태료의 전제(개선 명령 위반), 단서의 요건(긴급 + 신고)을 확인한다.')]})

# ---------------------------------------------------------------- S-BJ04 물탱크 채우기 (수리 추론)
CAP, A_, B_, C_ = 2400, 600, 400, 200          # L, L/시간
hrs = lambda rate: F(CAP, rate)
t4 = {'ㄱ': hrs(A_) == 4, 'ㄴ': hrs(A_ + B_) * 60 == 144, 'ㄷ': hrs(A_ + B_ - C_) == 3, 'ㄹ': hrs(C_) == hrs(B_)}
check(t4 == {'ㄱ': True, 'ㄴ': True, 'ㄷ': True, 'ㄹ': False} and hrs(C_) == 12 and hrs(B_) == 6, f'S-BJ04 {t4}')
opts4 = ['ㄱ, ㄴ', 'ㄱ, ㄹ', 'ㄴ, ㄷ', 'ㄷ, ㄹ', 'ㄱ, ㄴ, ㄷ']; ans4 = combo(t4, opts4, 'S-BJ04')
items.append({
 'id': 'S-BJ04', 'type': '상황판단 · 수리 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('용량이 2,400L인 물탱크에 물을 넣는 수도꼭지 A와 B, 물을 빼는 배수구 C가 있다. A는 1시간에 600L, B는 1시간에 400L의 물을 넣고, C는 열려 있으면 1시간에 200L의 물을 뺀다. 물이 들어오고 나가는 빠르기는 늘 일정하다.'),
          box('보기', ['ㄱ. 빈 탱크에 A만 열면 4시간 만에 가득 찬다.', 'ㄴ. 빈 탱크에 A와 B를 함께 열면 2시간 24분 만에 가득 찬다.', 'ㄷ. 빈 탱크에 A와 B를 열고 C도 열어 두면 3시간 만에 가득 찬다.', 'ㄹ. 가득 찬 탱크에서 C만 열어 물을 모두 빼는 데 걸리는 시간은 빈 탱크를 B만으로 가득 채우는 데 걸리는 시간과 같다.'])],
 'options': opts4, 'answer': ans4,
 'explain': [
  steps(['ㄱ: 2,400 ÷ 600 = 4시간.', 'ㄴ: 2,400 ÷ (600 + 400) = 2.4시간 = 2시간 24분.', 'ㄷ: 2,400 ÷ (600 + 400 − 200) = 3시간.', 'ㄹ: C만 열면 2,400 ÷ 200 = 12시간, B만 열면 2,400 ÷ 400 = 6시간으로 다르다.']),
  bx([('ㄱ', 'A만 4시간', True, O, '2,400 ÷ 600.'), ('ㄴ', 'A·B 2시간 24분', True, O, '0.4시간 = 24분.'), ('ㄷ', 'A·B·C 3시간', True, O, '1시간에 800L.'), ('ㄹ', 'C 빼기 = B 채우기', False, XX, '12시간과 6시간.')]),
  p(f'따라서 정답은 <b>{CIRC[ans4]}</b>이다. <b>함정</b> 2.4시간을 2시간 40분으로 읽지 않는다.')]})

# ---------------------------------------------------------------- S-BJ05 작업 배정 (243가지 전수, 규칙 모두 필요)
WK = ['갑', '을', '병']; TK = 'ABCDE'
TM = {'갑': {'A': 7, 'B': 8, 'C': 4, 'D': 6, 'E': 2}, '을': {'A': 3, 'B': 3, 'C': 6, 'D': 8, 'E': 8}, '병': {'A': 9, 'B': 8, 'C': 6, 'D': 4, 'E': 4}}   # 시간
def plans(r=(1, 1, 1)):
    res = []
    for a in itertools.product(WK, repeat=5):
        d = dict(zip(TK, a))
        if r[0] and max(a.count(w) for w in WK) > 2: continue
        if r[1] and d['B'] != d['D']: continue
        if r[2] and d['C'] == '갑': continue
        res.append((sum(TM[w][t] for t, w in d.items()), d))
    m = min(c for c, _ in res); return m, [d for c, d in res if c == m], res
b5, a5, all5 = plans()
check(b5 == 23 and a5 == [{'A': '을', 'B': '병', 'C': '을', 'D': '병', 'E': '갑'}], f'S-BJ05 {b5} {a5}')
alts5 = [plans(tuple(0 if j == i else 1 for j in range(3)))[0] for i in range(3)]
check(alts5 == [22, 18, 21], f'S-BJ05 every rule changes the answer {alts5}')
costs_all = sorted({c for c, _ in all5}); reach = {c for r in itertools.product((0, 1), repeat=3) for c, _ in plans(r)[2]}
opts5v = [18, 21, b5, costs_all[1], 27]
check(costs_all[1] == 26 and 27 in {c for c, _ in all5} and len(set(opts5v)) == 5 and opts5v == sorted(opts5v), f'S-BJ05 options {opts5v} second {costs_all[:3]}')
ans5 = opts5v.index(b5)
# 해설: B·D를 함께 맡을 사람별 최소: 갑 14, 을 11, 병 12. 그 사람은 두 작업이 다 차므로 A·C·E를 나머지 둘이 나눈다
bd = {w: TM[w]['B'] + TM[w]['D'] for w in WK}
def rest(w):
    others = [x for x in WK if x != w]; best = None
    for a in itertools.product(others, repeat=3):
        d = dict(zip('ACE', a))
        if max(a.count(x) for x in others) > 2 or d['C'] == '갑': continue
        c = sum(TM[x][t] for t, x in d.items()); best = c if best is None or c < best else best
    return best
check(bd == {'갑': 14, '을': 11, '병': 12} and {w: bd[w] + rest(w) for w in WK} == {'갑': 27, '을': 26, '병': 23} and {w: rest(w) for w in WK} == {'갑': 13, '을': 15, '병': 11}, f'S-BJ05 explanation by B·D owner {bd}')
items.append({
 'id': 'S-BJ05', 'type': '상황판단 · 최적화', 'stem': '다음 글을 근거로 판단할 때, 다섯 작업에 드는 시간의 합의 최솟값은?',
 'body': [p('갑, 을, 병 세 사람이 작업 A~E를 나누어 맡는다. 각 작업은 한 사람이 맡으며, 사람마다 작업에 드는 시간은 아래와 같다. 다음 규칙을 모두 지켜야 한다.'),
          table(['작업', '갑', '을', '병'], [[t] + [str(TM[w][t]) for w in WK] for t in TK], caption='사람별 작업 시간', unit='(단위: 시간)'),
          box('규칙', ['한 사람은 작업을 두 개까지만 맡는다.', 'B와 D는 같은 사람이 맡는다.', '갑은 자격이 없어 C를 맡을 수 없다.'], plain=True)],
 'options': [f'{v}시간' for v in opts5v], 'answer': ans5,
 'explain': [
  steps(['B와 D를 맡은 사람은 작업 두 개가 다 차므로 A, C, E는 나머지 두 사람이 나눈다.',
         'B·D를 갑이 맡으면 14시간에 나머지 최소 13시간(을 A·C, 병 E)을 더해 27시간, 을이 맡으면 11시간에 15시간(갑 A·E, 병 C)을 더해 26시간, 병이 맡으면 12시간에 11시간(을 A·C, 갑 E)을 더해 23시간이다.',
         '따라서 병이 B·D(8 + 4 = 12시간)를, 을이 A·C(3 + 6 = 9시간)를, 갑이 E(2시간)를 맡을 때 <b>23시간</b>으로 가장 적다.']),
  p(f'따라서 정답은 <b>{CIRC[ans5]}</b>이다. 작업을 나누는 243가지를 모두 따져 확인하였다. <b>함정</b> 두 작업 제한을 빼면 22시간, B·D 규칙을 빼면 18시간, 갑의 자격 규칙을 빼면 21시간이 된다.')]})

REVIEW = {
 'S-BJ01': ('법조문 계산', '상', '2분 30초', '휴관일 예정일 이월, 권별 합산, 상한과 감경의 순서, 올림', '순서·올림 누락', '사람별 연체일 → 합 → 상한 → 감경', '도서 연체형, 조문 둘, 새로 설계'),
 'S-BJ02': ('경우의 수', '상', '2분', '합이 일정한 세 수 나열, 홀짝', '묶음 누락', '가장 작은 수부터 나열', '합 15 카드형, 새로 설계(전수)'),
 'S-BJ03': ('법조문 적용', '상', '1분 30초', '시간대 경계, 지역 가산, 과태료의 전제, 단서 요건', '경계·요건 누락', '조문별 대조', '공사장 소음형, 조문 셋, 새로 설계'),
 'S-BJ04': ('수리 추론', '상', '1분 30초', '속도 합·차, 시간 환산', '0.4시간 = 40분 착각', '1시간 순증가량', '물탱크형, 새로 설계'),
 'S-BJ05': ('최적화', '상', '3분', '묶음 규칙으로 경우 나누기, 개수 제한, 자격 제한', '규칙 하나 누락', 'B·D를 맡을 사람별로 나누기', '작업 배정형, 새로 설계(243가지 전수, 규칙 모두 필요)'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_bj.py', 'review/sit-bj.md'), '상황판단 S-BJ 검수표(5급 실전·심화)', '송공 — 상황판단 5급 실전(심화) 정예 문항(직접 출제).')
