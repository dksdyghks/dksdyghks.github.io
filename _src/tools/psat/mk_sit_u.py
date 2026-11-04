# 상황판단 S-U01..S-U10 — 5급 수준(중·상) 정예 문항. 모든 답은 아래 코드가 다시 계산하거나 전수 조사로 확인한다. see psatkit.py
import itertools, datetime as dt
from math import comb
from fractions import Fraction as F
from psatkit import *

items = []
OUT = '/home/user/yohan-ahn/psat/bank-sit-u.js'

# ---------------------------------------------------------------- S-U01 리그전 (승점으로 결과표 복원, 전수 조사)
T1 = ['A', 'B', 'C', 'D']; G1 = list(itertools.combinations(T1, 2))
def pts1(res):
    p = {t: 0 for t in T1}
    for (x, y), r in zip(G1, res):
        if r == 1: p[x] += 3
        elif r == 2: p[y] += 3
        else: p[x] += 1; p[y] += 1
    return p
S1 = [r for r in itertools.product((0, 1, 2), repeat=6) if pts1(r) == {'A': 7, 'B': 4, 'C': 3, 'D': 2}]
check(len(S1) == 1 and dict(zip(G1, S1[0])) == {('A', 'B'): 1, ('A', 'C'): 1, ('A', 'D'): 0, ('B', 'C'): 1, ('B', 'D'): 0, ('C', 'D'): 1}, f'S-U01 {S1}')
R1 = dict(zip(G1, S1[0]))
lost = lambda t: any((x == t and r == 2) or (y == t and r == 1) for (x, y), r in R1.items())
t1 = {'ㄱ': not lost('A'), 'ㄴ': sum(1 for r in R1.values() if r == 0) == 1, 'ㄷ': R1[('C', 'D')] == 1, 'ㄹ': R1[('B', 'C')] == 2}
check(t1 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': False}, f'S-U01 {t1}')
opts1 = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄱ, ㄷ', 'ㄴ, ㄷ']; ans1 = combo(t1, opts1, 'S-U01')
items.append({
 'id': 'S-U01', 'type': '상황판단 · 리그전 추론', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
 'body': [p('A, B, C, D 네 팀이 서로 한 번씩 모두 경기하는 리그전을 치렀다. 이기면 승점 3점, 비기면 1점, 지면 0점을 받는다. 리그전이 끝난 뒤 네 팀의 승점은 A 7점, B 4점, C 3점, D 2점이었다.'),
          box('보기', ['ㄱ. A는 한 경기도 지지 않았다.', 'ㄴ. 비긴 경기는 1경기이다.', 'ㄷ. C는 D를 이겼다.', 'ㄹ. B는 C에게 졌다.'])],
 'options': opts1, 'answer': ans1,
 'explain': [
  steps(['전체 경기 수는 6경기이다. 승부가 난 경기는 승점 3점, 비긴 경기는 2점을 낳으므로 승부가 난 경기를 w라 하면 3w + 2(6 − w) = 7 + 4 + 3 + 2 = 16 → <b>w = 4, 비긴 경기 2</b>.',
         '팀마다 세 경기: A 7점 = 2승 1무, B 4점 = 1승 1무 1패, C 3점 = 1승 2패(3무라면 비긴 경기가 3경기 이상이 되어야 하므로 불가), D 2점 = 2무 1패.',
         '비긴 경기 2경기에 D가 두 번 들어가고, 나머지 비긴 팀은 A와 B → A–D, B–D가 무승부. A는 B·C를 이겼다. B의 1승은 C에게서(A에게 졌고 D와 비김). C의 1승은 D에게서.']),
  bx([('ㄱ', 'A 무패', True, O, '2승 1무이다.'), ('ㄴ', '무승부 1경기', False, XX, '비긴 경기는 A–D, B–D의 2경기이다.'), ('ㄷ', 'C가 D를 이김', True, O, 'C의 유일한 승리이다.'), ('ㄹ', 'B가 C에게 짐', False, XX, 'B가 C를 이겼다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans1]}</b>이다. <b>빠른 풀이</b>: 승점 합계로 무승부 경기 수부터 구하면 팀별 전적이 하나로 정해진다.')]})

# ---------------------------------------------------------------- S-U02 원탁 자리 (반드시 참, 전수 조사)
P2 = ['甲', '乙', '丙', '丁', '戊', '己']
nb = lambda a, b: (a - b) % 6 in (1, 5); opp = lambda a, b: (a - b) % 6 == 3
C2 = {'1': lambda s: opp(s['甲'], s['丁']), '2': lambda s: nb(s['乙'], s['丙']), '3': lambda s: (s['己'] - s['甲']) % 6 == 1}
def sols2(keys): return [s for s in (dict(zip(P2, pm)) for pm in itertools.permutations(range(6))) if s['甲'] == 0 and all(C2[k](s) for k in keys)]
S2 = sols2(C2)
check(sorted(''.join(sorted(P2, key=lambda k: s[k])) for s in S2) == sorted(['甲己戊丁乙丙', '甲己戊丁丙乙']), f'S-U02 {S2}')
for k in C2: check(len(sols2([x for x in C2 if x != k])) > 2, f'S-U02 condition {k} needed')
al2 = lambda f: all(f(s) for s in S2)
t2 = {'ㄱ': al2(lambda s: nb(s['戊'], s['丁'])), 'ㄴ': al2(lambda s: nb(s['乙'], s['甲'])), 'ㄷ': al2(lambda s: [k for k in P2 if opp(s[k], s['己'])][0] in ('乙', '丙')), 'ㄹ': al2(lambda s: not nb(s['丙'], s['甲']) or nb(s['乙'], s['丁']))}
check(t2 == {'ㄱ': True, 'ㄴ': False, 'ㄷ': True, 'ㄹ': True}, f'S-U02 {t2}')
opts2 = ['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄱ, ㄷ, ㄹ']; ans2 = combo(t2, opts2, 'S-U02')
items.append({
 'id': 'S-U02', 'type': '상황판단 · 자리 배치', 'stem': '다음 글을 근거로 판단할 때, <보기>에서 반드시 참인 것만을 모두 고르면?',
 'body': [p('둥근 탁자에 1번부터 6번까지 시계 방향으로 번호가 붙은 의자 6개가 같은 간격으로 놓여 있다. 6번 의자와 1번 의자는 이웃하고, 번호가 3만큼 차이 나는 의자끼리 서로 마주 본다. 甲은 1번 의자에 앉았고, 乙, 丙, 丁, 戊, 己가 나머지 의자에 한 명씩 앉았다.'),
          box('', ['丁은 甲과 마주 보고 앉았다.', '乙과 丙은 이웃하여 앉았다.', '己는 2번 의자에 앉았다.'], plain=True),
          box('보기', ['ㄱ. 戊는 丁과 이웃하여 앉았다.', 'ㄴ. 乙은 甲과 이웃하여 앉았다.', 'ㄷ. 己와 마주 보는 사람은 乙이나 丙이다.', 'ㄹ. 丙이 甲과 이웃하여 앉았다면 乙은 丁과 이웃하여 앉았다.'])],
 'options': opts2, 'answer': ans2,
 'explain': [
  steps(['甲은 1번, 丁은 마주 보는 4번, 己는 2번이다. 남은 의자는 3번, 5번, 6번.', '乙과 丙은 이웃해야 하는데, 남은 3·5·6번 가운데 이웃한 쌍은 5·6번뿐이다(3번의 이웃은 2번 己와 4번 丁) → <b>乙·丙이 5·6번, 戊는 3번</b>.', '경우: 甲己戊丁乙丙(5번 乙, 6번 丙) 또는 甲己戊丁丙乙(5번 丙, 6번 乙).']),
  bx([('ㄱ', '戊·丁 이웃', True, T, '3번과 4번이다.'), ('ㄴ', '乙·甲 이웃', False, NT, '乙이 5번이면 甲(1번)과 이웃하지 않는다.'),
      ('ㄷ', '己의 맞은편', True, T, '2번과 마주 보는 5번에는 乙이나 丙이 앉는다.'), ('ㄹ', '丙 6번 → 乙 5번', True, T, '丙이 甲과 이웃하면 6번이므로 乙은 5번이고, 5번은 丁(4번)과 이웃한다.')]),
  p(f'따라서 정답은 <b>{CIRC[ans2]}</b>이다. <b>빠른 풀이</b>: 고정된 자리(甲·丁·己)를 먼저 놓고, 남은 의자 가운데 이웃한 쌍이 하나뿐임을 이용한다.')]})

# ---------------------------------------------------------------- S-U03 격자 최단 경로 (경우의 수)
def paths3(blocked=(), must=None, W=4, H=3):
    from functools import lru_cache
    @lru_cache(None)
    def f(x, y):
        if (x, y) in blocked: return 0
        if (x, y) == (0, 0): return 1
        return (f(x - 1, y) if x else 0) + (f(x, y - 1) if y else 0)
    return f(W, H)
ans3 = paths3(blocked=((2, 1),))
alts3 = {'정답': ans3, '공사 중인 교차로를 무시하면': paths3(), '공사 중인 교차로를 지나는 경로의 수': comb(3, 1) * comb(4, 2)}
check(ans3 == 17 and alts3 == {'정답': 17, '공사 중인 교차로를 무시하면': 35, '공사 중인 교차로를 지나는 경로의 수': 18}, f'S-U03 {alts3}')
vals3 = sorted(set(alts3.values()) | {11, 13})
items.append({
 'id': 'S-U03', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, 甲이 집에서 학교까지 가는 최단 경로의 수는?',
 'body': [p('바둑판 모양의 길에서 甲의 집은 왼쪽 아래 모퉁이에, 학교는 집에서 동쪽으로 네 블록, 북쪽으로 세 블록 떨어진 모퉁이에 있다. 甲은 늘 동쪽이나 북쪽으로만 한 블록씩 움직여 가장 짧은 길로 학교에 간다.'),
          box('', ['집에서 동쪽으로 두 블록, 북쪽으로 한 블록 떨어진 교차로는 공사 중이어서 지나갈 수 없다.', '지나는 교차로가 하나라도 다르면 다른 경로로 본다.'], plain=True)],
 'options': [f'{v}가지' for v in vals3], 'answer': vals3.index(ans3),
 'explain': [
  steps(['공사가 없다면 동쪽 4번, 북쪽 3번을 늘어놓는 경우의 수: 7! ÷ (4! × 3!) = 35가지.', '공사 중인 교차로(동 2, 북 1)를 지나는 경로: 집 → 그 교차로 3가지 × 그 교차로 → 학교(동 2, 북 2) 6가지 = 18가지.', '35 − 18 = <b>17가지</b>.']),
  p(f'따라서 정답은 <b>{CIRC[vals3.index(ans3)]}</b>이다.'),
  p('<b>함정</b> ' + ', '.join(f'{k} {v}가지' for k, v in alts3.items() if k != '정답') + '이다. 빼야 할 것은 그 교차로를 ‘지나는’ 경로 전체이다.')]})

# ---------------------------------------------------------------- S-U04 비밀번호 (경우의 수, 전수 조사)
def pw4(distinct=True, lead=True, even=True, s=10):
    n_ = 0
    for d in itertools.product(range(10), repeat=4):
        if distinct and len(set(d)) < 4: continue
        if lead and d[0] == 0: continue
        if even and d[3] % 2: continue
        if sum(d) != s: continue
        n_ += 1
    return n_
ans4 = pw4()
alts4 = {'정답': ans4, '첫 자리 0을 허용하면': pw4(lead=False), '끝자리 조건을 빠뜨리면': pw4(even=False)}
check(len(set(alts4.values())) == 3, f'S-U04 {alts4}')
vals4 = sorted(set(alts4.values()) | {56, 72})
check(len(vals4) == 5, f'S-U04 {vals4}')
items.append({
 'id': 'S-U04', 'type': '상황판단 · 경우의 수', 'stem': '다음 글을 근거로 판단할 때, 甲이 정할 수 있는 비밀번호의 수는?',
 'body': [p('甲은 0부터 9까지의 숫자로 네 자리 비밀번호를 정하려 한다. 비밀번호는 다음 조건을 모두 지켜야 한다.'),
          box('', ['네 자리 숫자는 모두 서로 달라야 한다.', '첫째 자리는 0이 아니어야 한다.', '넷째 자리는 짝수(0, 2, 4, 6, 8)여야 한다.', '네 자리 숫자의 합은 10이어야 한다.'], plain=True)],
 'options': [f'{v}가지' for v in vals4], 'answer': vals4.index(ans4),
 'explain': [
  steps(['합이 10인 서로 다른 네 숫자의 묶음: {0, 1, 2, 7}, {0, 1, 3, 6}, {0, 1, 4, 5}, {0, 2, 3, 5}, {1, 2, 3, 4}의 5묶음뿐이다.',
         '0이 든 묶음: 짝수를 넷째 자리에 두고, 0이 첫째 자리에 오지 않게 센다. 예컨대 {0, 1, 2, 7}에서 넷째 자리가 0이면 나머지 3! = 6가지, 2이면 첫째 자리가 0이 아닌 경우 3! − 2! = 4가지 → 10가지.',
         f'같은 방법으로 {{0, 1, 3, 6}} 10가지, {{0, 1, 4, 5}} 10가지, {{0, 2, 3, 5}} 10가지, {{1, 2, 3, 4}}는 넷째 자리 2 또는 4에 나머지 3! → 12가지. 합 <b>{ans4}가지</b>.']),
  p(f'따라서 정답은 <b>{CIRC[vals4.index(ans4)]}</b>이다.'),
  p('<b>함정</b> ' + ', '.join(f'{k} {v}가지' for k, v in alts4.items() if k != '정답') + '이다. 0이 든 묶음은 ‘넷째 자리가 0인 경우’와 ‘0이 아닌 짝수인 경우’를 나누어 센다.')]})
check(ans4 == 52, f'S-U04 hand count {ans4}')

# ---------------------------------------------------------------- S-U05 연가 일수 (법조문 계산)
def leave5(years, first_excl=True, cap=True):
    extra = (years - 1) // 2 if first_excl else years // 2
    if years < 3: extra = 0
    d = 15 + extra
    return min(d, 25) if cap else d
cases5 = {'甲': 10, '乙': 2, '丙': 25}
ans5 = sum(leave5(y) for y in cases5.values())
alts5 = {'정답': ans5, '최초 1년을 빼지 않으면': sum(leave5(y, first_excl=False) for y in cases5.values()), '25일 한도를 빠뜨리면': sum(leave5(y, cap=False) for y in cases5.values())}
check([leave5(y) for y in cases5.values()] == [19, 15, 25] and ans5 == 59 and len(set(alts5.values())) == 3, f'S-U05 {alts5}')
vals5 = sorted(set(alts5.values()) | {55, 57})
check(len(vals5) == 5, f'S-U05 {vals5}')
items.append({
 'id': 'S-U05', 'type': '상황판단 · 법조문 계산', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲, 乙, 丙이 올해 받는 연가 일수의 합은?',
 'body': [law('<p><b>제○○조(연가)</b> ① 1년간 출근율이 100분의 80 이상인 직원에게는 15일의 연가를 준다.<br>'
              '② 3년 이상 계속 근무한 직원에게는 최초 1년을 초과하는 계속 근무 연수 매 2년에 대하여 1일을 제1항의 일수에 더한다. 이 경우 연가 일수의 합계는 25일을 넘을 수 없다.</p>'),
          box('상황', ['甲, 乙, 丙은 모두 지난 1년간 출근율이 100분의 90이다.', '계속 근무 연수는 甲 10년, 乙 2년, 丙 25년이다.'], plain=True)],
 'options': [f'{v}일' for v in vals5], 'answer': vals5.index(ans5),
 'explain': [
  steps(['甲: 최초 1년을 넘는 근무 9년 → 2년마다 1일이므로 4일 → 15 + 4 = 19일.', '乙: 계속 근무 3년 미만이므로 가산 없음 → 15일.', '丙: 최초 1년을 넘는 24년 → 12일 → 27일이지만 한도 25일.', f'합: 19 + 15 + 25 = <b>{ans5}일</b>.']),
  p(f'따라서 정답은 <b>{CIRC[vals5.index(ans5)]}</b>이다.'),
  p('<b>함정</b> ' + ', '.join(f'{k} {v}일' for k, v in alts5.items() if k != '정답') + '이다.')]})

# ---------------------------------------------------------------- S-U06 행정심판 청구 기간 (옳은 것)
def last(d0, n_): return d0 + dt.timedelta(days=n_)              # 첫날 불산입: 그날 + n일이 마지막 날
knew, made = dt.date(2026, 3, 10), dt.date(2026, 1, 20)
end90, end180 = last(knew, 90), last(made, 180)
check((end90, end180) == (dt.date(2026, 6, 8), dt.date(2026, 7, 19)), f'S-U06 {end90} {end180}')
deadline = min(end90, end180)
f6 = [deadline == end180, deadline == dt.date(2026, 6, 8), False, False, False]
one_true(f6, 1, 'S-U06')
items.append({
 'id': 'S-U06', 'type': '상황판단 · 법조문', 'stem': '다음 글과 <상황>을 근거로 판단할 때 옳은 것은?',
 'body': [law('<p><b>제○○조(청구 기간)</b> ① 행정심판은 처분이 있음을 알게 된 날부터 90일 이내에 청구하여야 한다.<br>② 행정심판은 처분이 있었던 날부터 180일이 지나면 청구하지 못한다. 다만 정당한 사유가 있는 경우에는 그러하지 아니하다.<br>'
              '③ 제1항과 제2항의 기간을 셀 때에는 첫날을 넣지 아니한다.</p>'),
          box('상황', ['○○시는 2026년 1월 20일에 甲에게 영업정지 처분을 하였다.', '甲은 해외 체류 중이어서 2026년 3월 10일에야 처분이 있음을 알게 되었다.', '甲에게 제2항 단서의 정당한 사유는 없다.'], plain=True)],
 'options': ['甲은 2026년 7월 19일까지 행정심판을 청구할 수 있다.', '甲이 행정심판을 청구할 수 있는 마지막 날은 2026년 6월 8일이다.', '甲은 처분이 있었던 날부터 90일이 지난 2026년 4월 20일 이후에는 청구할 수 없다.', '甲이 처분이 있음을 늦게 알았으므로 180일의 제한은 적용되지 않는다.', '甲은 처분이 있음을 안 날부터 180일 이내에 청구하면 된다.'],
 'answer': 1,
 'explain': [
  p('<b>두 기간을 모두 지켜야 한다</b> 안 날부터 90일: 3월 11일이 1일째 → 90일째는 <b>6월 8일</b>. 처분이 있었던 날부터 180일: 1월 21일이 1일째 → 180일째는 7월 19일. 둘 가운데 먼저 끝나는 6월 8일이 마지막 날이다.'),
  ox([(False, XX, '180일 기간은 7월 19일까지지만, 그 전에 90일 기간(6월 8일)이 먼저 끝난다.'), (True, O, '안 날부터 90일째이다.'), (False, XX, '90일은 처분이 ‘있음을 안 날’부터 센다. 처분이 있었던 날부터 세는 것은 180일이다.'),
      (False, XX, '180일 제한은 정당한 사유가 있을 때만 적용되지 않는다. 甲에게는 정당한 사유가 없다.'), (False, XX, '안 날부터는 90일이다.')]),
  p('따라서 정답은 <b>②</b>이다. <b>함정</b> 두 기간 가운데 하나만 지키면 된다고 보거나(①), 기산점을 바꿔 읽는 것(③)이다.')]})

# ---------------------------------------------------------------- S-U07 성과급 배분 (규칙 적용)
team7, base7 = 12, 300
def bonus7(rnd=lambda x: int(x)):
    s, a = rnd(team7 * F(20, 100)), rnd(team7 * F(40, 100)); b = team7 - s - a
    return s * base7 * F(15, 10) + a * base7 + b * base7 * F(1, 2), (s, a, b)
ans7, cnt7 = bonus7()
alts7 = {'정답': ans7, '소수점 이하를 반올림하면': bonus7(lambda x: int(x + F(1, 2)))[0], '소수점 이하를 올리면': bonus7(lambda x: -(-x.numerator // x.denominator))[0]}
check(cnt7 == (2, 4, 6) and ans7 == 3000 and len(set(alts7.values())) == 3, f'S-U07 {alts7}')
vals7 = sorted(set(alts7.values()) | {3300, 3600})
check(len(vals7) == 5, f'S-U07 {vals7}')
man7 = lambda v: f'{int(v):,}만 원'
items.append({
 'id': 'S-U07', 'type': '상황판단 · 규칙 적용', 'stem': '다음 글을 근거로 판단할 때, 갑 팀이 받는 성과급의 총액은?',
 'body': [p('○○기관은 팀원들을 S, A, B 세 등급으로 나누어 성과급을 준다. 갑 팀의 팀원은 12명이고, 성과급 기준액은 1인당 300만 원이다.'),
          box('', ['S등급은 팀원 수의 20%, A등급은 40%로 하고, 나머지 팀원은 모두 B등급으로 한다. 등급별 인원을 계산할 때 소수점 이하는 버린다.', '성과급은 S등급 기준액의 150%, A등급 100%, B등급 50%이다.'], plain=True)],
 'options': [man7(v) for v in vals7], 'answer': vals7.index(ans7),
 'explain': [
  steps(['S등급: 12 × 20% = 2.4 → 2명. A등급: 12 × 40% = 4.8 → 4명. B등급: 나머지 6명.', '성과급: 2 × 450 + 4 × 300 + 6 × 150 = 900 + 1,200 + 900 = <b>3,000만 원</b>.']),
  p(f'따라서 정답은 <b>{CIRC[vals7.index(ans7)]}</b>이다.'),
  p('<b>함정</b> ' + ', '.join(f'{k} {man7(v)}' for k, v in alts7.items() if k != '정답') + '이다. 버린 인원은 모두 B등급으로 간다.')]})

# ---------------------------------------------------------------- S-U08 택배 요금 (비용 비교)
def fee8(kg, size, jeju, co):
    if co == 'X': f = 4000 if kg <= 2 else 5500 if kg <= 5 else 7500
    else: f = 3500 if size <= 80 else 6000 if size <= 120 else 8000
    return f + ((3000 if co == 'X' else 2500) if jeju else 0)
box8 = [(1.5, 60, False), (4, 100, True), (6, 70, False)]
cost8 = {co: sum(fee8(*b, co) for b in box8) for co in 'XY'}
bundle = cost8['Y'] * 9 // 10                      # Y사: 한 번에 3개 이상 보내면 합계의 10% 할인
cost8['Y'] = bundle
check(cost8 == {'X': 4000 + 8500 + 7500, 'Y': (3500 + 8500 + 3500) * 9 // 10} and cost8 == {'X': 20000, 'Y': 13950}, f'S-U08 {cost8}')
opts8 = ['X사, 20,000원', 'Y사, 15,500원', 'X사, 17,000원', 'Y사, 11,700원', 'Y사, 13,950원']
best8 = min(cost8, key=cost8.get); ans8 = opts8.index(f'{best8}사, {cost8[best8]:,}원')
check(ans8 == 4, 'S-U08 answer position')
items.append({
 'id': 'S-U08', 'type': '상황판단 · 비용 비교', 'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲이 택배 세 개를 한 회사에 맡겨 한꺼번에 보낼 때 더 적은 비용과 그 회사를 바르게 짝지은 것은?',
 'body': [box('', ['X사: 무게로 요금을 정한다. 2kg 이하 4,000원, 2kg 초과 5kg 이하 5,500원, 5kg 초과 7,500원. 제주로 보내면 3,000원을 더한다.', 'Y사: 가로·세로·높이의 합(cm)으로 요금을 정한다. 80cm 이하 3,500원, 80cm 초과 120cm 이하 6,000원, 120cm 초과 8,000원. 제주로 보내면 2,500원을 더한다. 한 번에 3개 이상 보내면 요금 합계에서 10%를 할인한다.'], plain=True),
          table(['택배', '무게', '세 변의 합', '받는 곳'], [['가', '1.5kg', '60cm', '서울'], ['나', '4kg', '100cm', '제주'], ['다', '6kg', '70cm', '부산']], caption='甲이 보낼 택배', num=False)],
 'options': opts8, 'answer': ans8,
 'explain': [
  steps(['X사: 가 4,000 + 나 (5,500 + 3,000) + 다 7,500 = 20,000원.', 'Y사: 가 3,500 + 나 (6,000 + 2,500) + 다 3,500 = 15,500원 → 3개이므로 10% 할인 → <b>13,950원</b>.']),
  p(f'따라서 정답은 <b>{CIRC[ans8]}</b>이다. <b>함정</b> 할인을 빠뜨리면 15,500원, 제주 추가 요금을 빠뜨리면 X사 17,000원, Y사는 할인 뒤 11,700원이 된다. 무거운 ‘다’가 크기로는 가장 작은 구간이어서 Y사가 유리하다.')]})
check((3500 + 6000 + 3500) * 9 // 10 == 11700 and 4000 + 5500 + 7500 == 17000, 'S-U08 traps')

# ---------------------------------------------------------------- S-U09 강연 일정 (전수 조사)
P9 = ['A', 'B', 'C', 'D', 'E']; DAY = '월화수목금'
C9 = {'1': lambda s: s['A'] < s['B'], '2': lambda s: s['C'] in (1, 3), '3': lambda s: s['D'] == s['A'] + 1, '4': lambda s: s['B'] != 4}
def sols9(keys): return [s for s in (dict(zip(P9, pm)) for pm in itertools.permutations(range(5))) if all(C9[k](s) for k in keys)]
S9 = sols9(C9)
check(len(S9) == 1 and ''.join(sorted(P9, key=lambda k: S9[0][k])) == 'ADBCE', f'S-U09 {S9}')
for k in C9: check(len(sols9([x for x in C9 if x != k])) > 1, f'S-U09 condition {k} needed')
wed = [k for k in P9 if S9[0][k] == 2][0]
opts9 = ['A', 'B', 'C', 'D', 'E']
one_true([o == wed for o in opts9], 1, 'S-U09')
items.append({
 'id': 'S-U09', 'type': '상황판단 · 일정 배정', 'stem': '다음 글을 근거로 판단할 때, 수요일에 열리는 강연은?',
 'body': [p('○○도서관은 다음 주 월요일부터 금요일까지 하루에 하나씩 A~E 다섯 강연을 연다. 강연 일정은 다음 조건을 따른다.'),
          box('', ['A는 B보다 앞선 요일에 열린다.', 'C는 화요일이나 목요일에 열린다.', 'D는 A 바로 다음 날에 열린다.', 'B는 금요일에 열리지 않는다.'], plain=True)],
 'options': opts9, 'answer': 1,
 'explain': [
  steps(['A 다음 날이 D이고 A가 B보다 앞서므로 A–D 묶음 뒤 어딘가에 B가 온다.', 'C가 화요일이면 A–D 묶음은 수–목 또는 목–금인데, 그러면 B가 금요일이거나 들어갈 자리가 없다 → 불가. 따라서 <b>C는 목요일</b>.',
         'C가 목요일이면 A–D 묶음은 월–화(수–목은 C와 겹침) → B는 수요일이나 금요일인데 금요일은 안 되므로 <b>B는 수요일</b>, E는 금요일.']),
  p('일정: 월 A, 화 D, 수 B, 목 C, 금 E. 따라서 정답은 <b>②</b>이다. <b>빠른 풀이</b>: 이어 붙은 묶음(A–D)과 자리가 둘뿐인 C로 갈래를 나눈다.')]})

# ---------------------------------------------------------------- S-U10 엘리베이터 운행 (규칙 독해)
calls10 = [('甲', 4, 9), ('乙', 7, 2), ('丙', 6, 8)]
def run10():
    pos, up, inside, waiting, moved, stops = 1, True, [], list(calls10), 0, []
    while waiting or inside:
        targets = [w[1] for w in waiting] + [d for _, d in inside]
        ahead = [t for t in targets if (t > pos if up else t < pos)]
        if not ahead: up = not up; continue
        nxt = min(ahead) if up else max(ahead)
        moved += abs(nxt - pos); pos = nxt; stops.append(pos)
        inside = [x for x in inside if x[1] != pos]
        for w in [w for w in waiting if w[1] == pos]: waiting.remove(w); inside.append((w[0], w[2]))
    return moved, stops
moved10, stops10 = run10()
fifo = (4 - 1) + (9 - 4) + (9 - 7) + (7 - 2) + (6 - 2) + (8 - 6)
check(moved10 == 15 and stops10 == [4, 6, 7, 8, 9, 2] and fifo == 21, f'S-U10 {moved10} {stops10} {fifo}')
vals10 = [9, 11, 13, 15, 21]
items.append({
 'id': 'S-U10', 'type': '상황판단 · 규칙 독해', 'stem': '다음 글을 근거로 판단할 때, 세 사람이 모두 목적층에 내릴 때까지 엘리베이터가 움직인 층 수의 합은?',
 'body': [p('어느 건물의 엘리베이터는 다음 규칙에 따라 움직인다.'),
          box('', ['엘리베이터는 지금 움직이는 방향에 있는 호출층과 목적층에 가까운 순서대로 선다.', '그 방향에 더 설 곳이 없으면 방향을 바꾼다.', '호출층에서 탄 사람이 누른 목적층은 그때부터 설 곳에 더해진다.'], plain=True),
          box('상황', ['엘리베이터는 1층에 비어 있다가 위로 움직이기 시작한다.', '이때 甲은 4층에서 9층으로, 乙은 7층에서 2층으로, 丙은 6층에서 8층으로 가려고 각자 호출 단추를 눌렀다.', '층과 층 사이를 한 번 움직이면 1개 층을 움직인 것으로 센다.'], plain=True)],
 'options': [f'{v}개 층' for v in vals10], 'answer': vals10.index(moved10),
 'explain': [
  steps(['위로: 4층(甲 탐, 9층 추가) → 6층(丙 탐, 8층 추가) → 7층(乙 탐, 2층 추가) → 8층(丙 내림) → 9층(甲 내림). 1층에서 9층까지 8개 층.', '위쪽에 설 곳이 없으므로 아래로: 2층(乙 내림). 9층에서 2층까지 7개 층.', '합 <b>15개 층</b>.']),
  p(f'따라서 정답은 <b>{CIRC[vals10.index(moved10)]}</b>이다. <b>함정</b> 호출한 순서대로(甲 → 乙 → 丙) 태우고 내려 주면 1 → 4 → 9 → 7 → 2 → 6 → 8로 21개 층이 된다. 규칙은 ‘방향’ 우선이다.')]})

REVIEW = {
 'S-U01': ('리그전 추론', '상', '2분', '승점 합계로 무승부 수, 팀별 전적 확정', 'ㄴ 무승부 수 착오', '3w + 2d = 16', '리그전형, 새로 설계(729가지 전수 확인 유일)'),
 'S-U02': ('자리 배치', '중', '1분 30초', '원탁의 이웃·마주 봄, 조건문 보기', 'ㄴ 한 경우만', '고정 자리부터', '원탁형, 조건 새로 설계(경우 2가지 전수 확인, 조건 모두 필요)'),
 'S-U03': ('경우의 수', '중', '1분 20초', '격자 최단 경로, 여사건', '지나는 경로를 답으로', '전체 − 지나는 경로', '최단 경로형, 새로 설계'),
 'S-U04': ('경우의 수', '상', '2분', '합 조건으로 묶음 열거, 자리 조건', '첫 자리 0 / 끝자리 조건 누락', '묶음 5개 먼저', '비밀번호형, 새로 설계(1만 가지 전수 확인)'),
 'S-U05': ('법조문 계산', '중', '1분 30초', '최초 1년 초과, 2년마다, 한도', '최초 1년 포함 / 한도 누락', '사람별 한 줄', '연가형, 조문 새로 작성'),
 'S-U06': ('법조문', '중', '1분 40초', '두 청구 기간과 기산점, 먼저 끝나는 기간', '한 기간만 / 기산점 혼동', '두 마지막 날 비교', '행정심판 기간형, 가상의 조문'),
 'S-U07': ('규칙 적용', '중', '1분 20초', '비율 인원의 버림과 나머지 처리', '반올림·올림', '인원부터', '성과급 배분형, 새로 설계'),
 'S-U08': ('비용 비교', '중', '1분 40초', '무게·크기 구간, 지역 추가, 묶음 할인', '할인 누락 / 추가 요금 누락', '회사별 합', '택배 요금형, 수치 새로 설계'),
 'S-U09': ('일정 배정', '중', '1분 20초', '붙어 있는 묶음과 두 자리 갈래', 'C 화요일 갈래 미검토', 'C 갈래', '강연 일정형, 조건 새로 설계(유일, 조건 모두 필요)'),
 'S-U10': ('규칙 독해', '중', '1분 40초', '방향 우선 운행 규칙의 모의 실행', '호출 순서대로 처리', '위로 한 번, 아래로 한 번', '엘리베이터형, 새로 작성'),
}
write(items, REVIEW, OUT, 'sit', __file__.replace('mk_sit_u.py', 'review/sit-u.md'), '상황판단 S-U 검수표(5급 수준)', '송공 — 상황판단 5급 수준 정예 문항(직접 출제).')
