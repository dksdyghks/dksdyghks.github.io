# 상황판단 정예 문항 S-C01..S-C12 — written here, checked here, then written out as psat/bank-sit-c.js.
# Laws are fictional (modelled on real statutes); every option is decided by code from the rules as written:
# day counts by the calendar, puzzles by exhaustive search (unique answer / "always true" over all solutions),
# optimisation by trying every case. If any check fails, nothing is written.
import itertools, json, sys, re, datetime as dt
from fractions import Fraction as F

OUT = '/home/user/yohan-ahn/psat/bank-sit-c.js'
CIRC = '①②③④⑤'
fails = []
def check(c, m):
    if not c: fails.append(m)
def ox(items): return {'t': 'ox', 'items': [{'ok': ok, 'v': v, 'why': why} for ok, v, why in items]}
def bx(items): return {'t': 'bx', 'items': [{'label': l, 'text': t, 'ok': ok, 'v': v, 'why': why} for l, t, ok, v, why in items]}
def p(h): return {'t': 'p', 'h': h}
def law(h): return {'t': 'law', 'h': h}
def box(title, items, plain=False): return {'t': 'box', 'title': title, 'items': items, 'plain': plain}
def table(head, rows, caption='', unit='', num=False, note=None):
    b = {'t': 'table', 'caption': caption, 'unit': unit, 'head': head, 'rows': rows, 'num': num}
    if note: b['note'] = note
    return b
def won(x): return f'{int(x):,}원'
O, XX = '옳다', '옳지 않다'
T, NT = '반드시 참이다', '반드시 참이라고 할 수 없다'
items = []
def one_true(flags, ans, tag):
    check([i for i, f in enumerate(flags) if f] == [ans], f'{tag}: true options {flags} vs answer {ans}')
def one_false(flags, ans, tag):
    check([i for i, f in enumerate(flags) if not f] == [ans], f'{tag}: false options {flags} vs answer {ans}')
def combo(truths, options):
    want = ', '.join(k for k in 'ㄱㄴㄷㄹ' if truths.get(k)); hits = [i for i, o in enumerate(options) if o == want]
    check(len(hits) == 1, f'combo {want} in {options}'); return hits[0] if hits else -1

# ---------------------------------------------------------------- S-C01 휴직 (의무·재량, 단서, 기간)
# rule model
must = {'질병': True, '병역': True, '유학': False, '양육': True, '간호': False}   # 제1조: 명하여야 한다(True) / 명할 수 있다(False)
maxlen = {'질병': 2, '유학': 5, '양육': 3}                                      # years incl. extensions
care_total = 3
age_ok = lambda age: age <= 8
st = [must['유학'], must['양육'] and age_ok(8), False, care_total >= 4, maxlen['유학'] >= 6]
# ③: 제1조 제1항은 본인의 의사에도 불구하고 명하여야 한다 → '원하지 않으면 명할 수 없다'는 거짓
one_true(st, 1, 'S-C01')
items.append({
    'id': 'S-C01', 'type': '상황판단 · 법조문', 'lv': 1,
    'stem': '다음 글을 근거로 판단할 때 옳은 것은?',
    'body': [law('<p><b>제○○조(휴직)</b> ① 임용권자는 공무원이 다음 각 호의 어느 하나에 해당하면 본인의 의사에도 불구하고 휴직을 명하여야 한다.<br>1. 신체·정신상의 장애로 장기 요양이 필요할 때<br>2. 병역 복무를 마치기 위하여 징집 또는 소집된 때<br>② 임용권자는 공무원이 다음 각 호의 어느 하나에 해당하는 사유로 휴직을 원하면 휴직을 명할 수 있다. 다만, 제2호의 경우에는 휴직을 명하여야 한다.<br>1. 국외 유학을 하게 된 때<br>2. 만 8세 이하의 자녀를 양육하기 위하여 필요한 때<br>3. 사고나 질병 등으로 장기간 요양이 필요한 부모를 간호하기 위하여 필요한 때</p>'
                 '<p><b>제△△조(휴직 기간)</b> 휴직 기간은 다음 각 호와 같다.<br>1. 제○○조 제1항 제1호: 1년 이내. 다만, 부득이한 경우 1년의 범위에서 연장할 수 있다.<br>2. 제○○조 제1항 제2호: 그 복무 기간이 끝날 때까지<br>3. 제○○조 제2항 제1호: 3년 이내. 다만, 부득이한 경우 2년의 범위에서 연장할 수 있다.<br>4. 제○○조 제2항 제2호: 자녀 1명에 대하여 3년 이내<br>5. 제○○조 제2항 제3호: 1년 이내. 다만, 재직 기간 중 총 3년을 넘을 수 없다.</p>'
                 '<p><b>제□□조(휴직의 효력)</b> 휴직 중인 공무원은 신분은 보유하나 직무에 종사하지 못한다.</p>')],
    'options': ['임용권자는 국외 유학을 하게 된 공무원이 휴직을 원하면 반드시 휴직을 명하여야 한다.', '만 8세인 자녀를 양육하기 위하여 휴직을 원하는 공무원에게 임용권자는 휴직을 명하여야 한다.', '신체상의 장애로 장기 요양이 필요한 공무원이 휴직을 원하지 않으면 임용권자는 휴직을 명할 수 없다.', '부모를 간호하기 위한 휴직은 재직 기간 중 총 4년까지 할 수 있다.', '국외 유학을 위한 휴직은 연장 기간을 포함하여 최장 6년까지 할 수 있다.'],
    'answer': 1,
    'explain': [
        p('<b>출발점</b> 제○○조는 ‘명하여야 한다(의무)’와 ‘명할 수 있다(재량)’를 나누고, 제2항 단서에서 제2호만 다시 의무로 돌린다. 원칙과 단서를 먼저 표시해 두면 선지가 바로 갈린다.'),
        ox([
            (False, XX, '국외 유학은 제2항 제1호로 ‘명할 수 있다’(재량)에 해당한다. 단서가 의무로 돌린 것은 제2호(자녀 양육)뿐이다.'),
            (True, O, '자녀 양육은 제2항 제2호이고, 같은 항 단서에 따라 휴직을 ‘명하여야 한다’. ‘만 8세 이하’에는 만 8세가 포함된다. <b>함정</b>: 제2항 본문만 읽고 재량으로 보거나, ‘이하’를 ‘미만’으로 읽으면 틀린다.'),
            (False, XX, '제1항은 ‘본인의 의사에도 불구하고’ 휴직을 명하여야 한다고 정한다. 본인이 원하지 않아도 명하여야 한다.'),
            (False, XX, '제△△조 제5호 단서에 따라 재직 기간 중 총 3년을 넘을 수 없다.'),
            (False, XX, '제△△조 제3호: 3년 이내에 연장 2년의 범위이므로 최장 5년이다.'),
        ]),
        p('따라서 정답은 <b>②</b>이다.'),
    ]})

# ---------------------------------------------------------------- S-C02 국유재산 사용료 (요율, 일할, 중복감면 금지)
def days_incl(a, b): return (b - a).days + 1
VAL_A, VAL_B = 146_000_000, 91_250_000
annual_A = VAL_A * F(50, 1000); annual_B = VAL_B * F(20, 1000)
dA = days_incl(dt.date(2025, 3, 1), dt.date(2025, 7, 29))
feeA = annual_A * dA / 365 * F(1, 2)
feeB = annual_B * F(1, 2)            # 1 year, both reasons, reduced once
total = feeA + feeB
check(dA == 151 and annual_A / 365 == 20000 and feeA == 1_510_000 and feeB == 912_500 and total == 2_422_500, f'S-C02 numbers {dA} {feeA} {feeB}')
opts = [annual_B / 4 + feeA, feeA - 10_000 + feeB, total, feeA + 10_000 + feeB, annual_A * dA / 365 + feeB]   # double cut on 乙 / 150 days / answer / 152 days / no cut on 甲
check(len(set(opts)) == 5 and sorted(opts) == opts, f'S-C02 options {opts}')
items.append({
    'id': 'S-C02', 'type': '상황판단 · 법조문 계산', 'lv': 2,
    'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲과 乙이 내야 할 사용료의 합은?',
    'body': [law('<p><b>제○○조(사용료)</b> ① 국유재산의 사용허가를 받은 자는 사용료를 내야 한다. 연간 사용료는 해당 재산가액에 다음 각 호의 요율을 곱한 금액으로 한다.<br>1. 경작용: 1천분의 10<br>2. 주거용: 1천분의 20<br>3. 그 밖의 용도: 1천분의 50<br>② 사용 기간이 1년 미만이면 연간 사용료를 사용 일수에 따라 나누어 계산한다. 이 경우 1년은 365일로 하고, 사용 일수는 사용 기간의 첫날과 마지막 날을 모두 넣어 센다.<br>③ 다음 각 호의 어느 하나에 해당하면 제1항과 제2항에 따른 사용료의 100분의 50을 감면한다. 다만, 둘 이상에 해당하더라도 감면은 한 번만 한다.<br>1. 사용허가를 받은 자가 소상공인인 경우<br>2. 사용허가를 받은 자가 재해로 피해를 입어 피해 복구 기간 동안 사용하는 경우</p>'),
             box('상황', ['소상공인 甲은 재산가액 1억 4,600만 원인 국유지를 창고로 쓰기 위해 2025년 3월 1일부터 같은 해 7월 29일까지 사용허가를 받았다.', '소상공인 乙은 재해로 주택이 부서져 피해 복구 기간인 1년 동안 재산가액 9,125만 원인 국유 주택에 살기로 하고 사용허가를 받았다.'])],
    'options': [won(x) for x in opts], 'answer': 2,
    'explain': [
        p('<b>요율부터 고른다.</b> 甲의 창고는 ‘그 밖의 용도’(1천분의 50), 乙의 주택은 ‘주거용’(1천분의 20)이다.'),
        table(['', '연간 사용료', '기간 반영', '감면', '사용료'], [['甲', '1억 4,600만 × 50/1,000 = 730만 원', f'하루 2만 원 × {dA}일 = 302만 원', '소상공인 50%', won(feeA)], ['乙', '9,125만 × 20/1,000 = 182만 5천 원', '1년 전체', '두 사유 해당 → 한 번만 50%', won(feeB)]]),
        p(f'<b>일수</b> 3월 1일 ~ 7월 29일은 첫날과 마지막 날을 모두 넣어 31 + 30 + 31 + 30 + 29 = {dA}일이다. 730만 원 ÷ 365 = 2만 원이 하루 사용료이다.'),
        p(f'합계는 {won(feeA)} + {won(feeB)} = <b>{won(total)}</b>이다. 乙에게 감면을 두 번 적용하면 {won(opts[0])}(①), 일수를 하루 적게(150일) 세면 {won(opts[1])}(②), 하루 많게(152일) 세면 {won(opts[3])}(④), 甲의 소상공인 감면을 빠뜨리면 {won(opts[4])}(⑤)이 된다.'),
    ]})

# ---------------------------------------------------------------- S-C03 청원 처리 기한 (기간 계산, 연장 1회)
def end_after(start, n):   # first day not counted; a Saturday/Sunday end moves to the next Monday
    e = start + dt.timedelta(days=n)
    while e.weekday() >= 5: e += dt.timedelta(days=1)
    return e
gap_recv, gap_note = dt.date(2026, 4, 13), dt.date(2026, 7, 13)
eul_recv = dt.date(2026, 3, 18)
eul_end90 = end_after(eul_recv, 90); eul_end = end_after(eul_end90, 30)
gap_end = end_after(gap_recv, 90)
eul_obj = end_after(eul_end, 30)
check(gap_recv.weekday() == 0 and (gap_recv + dt.timedelta(days=90)).weekday() == 6 and gap_end == dt.date(2026, 7, 13), f'S-C03 甲 {gap_end}')
check(eul_recv.weekday() == 2 and eul_end90 == dt.date(2026, 6, 16) and eul_end == dt.date(2026, 7, 16) and eul_end.weekday() == 3, f'S-C03 乙 {eul_end90} {eul_end}')
check((eul_end + dt.timedelta(days=30)) == dt.date(2026, 8, 15) and eul_obj == dt.date(2026, 8, 17), f'S-C03 이의 {eul_obj}')
st = [gap_note <= gap_end, False, eul_end == dt.date(2026, 8, 15), eul_obj == dt.date(2026, 8, 14), False]
one_true(st, 0, 'S-C03')
items.append({
    'id': 'S-C03', 'type': '상황판단 · 법조문', 'lv': 2,
    'stem': '다음 글과 <상황>을 근거로 판단할 때 옳은 것은?',
    'body': [law('<p><b>제○○조(청원의 처리)</b> ① 청원을 접수한 기관은 90일 이내에 처리 결과를 청원인에게 알려야 한다.<br>② 부득이한 사유로 제1항의 기간 내에 처리하기 어려우면 60일의 범위에서 한 차례만 처리 기간을 연장할 수 있다. 이 경우 연장 사유와 처리 예정 기한을 지체 없이 청원인에게 알려야 한다.<br>③ 청원인은 처리 결과에 이의가 있으면 처리 결과를 통지받은 날부터 30일 이내에 이의신청을 할 수 있다.</p>'
                 '<p><b>제△△조(기간의 계산)</b> 이 법에서 기간을 일(日)로 정한 경우 첫날은 넣지 않고 센다. 기간의 마지막 날이 토요일 또는 일요일이면 그다음 월요일에 기간이 끝난다. 연장된 기간은 원래 기간이 끝난 날의 다음 날부터 센다.</p>'),
             box('상황', ['A청은 2026년 4월 13일(월) 甲의 청원을 접수하였고, 같은 해 7월 13일(월) 甲에게 처리 결과를 알렸다.', 'A청은 2026년 3월 18일(수) 乙의 청원을 접수하였다. A청은 부득이한 사유로 6월 10일(수) 처리 기간을 30일 연장한다고 乙에게 연장 사유와 처리 예정 기한을 알렸고, 7월 16일(목) 처리 결과를 알렸다.', '※ 2026년 7월 12일은 일요일, 8월 15일은 토요일이다. 공휴일은 고려하지 않는다.'], plain=True)],
    'options': ['A청은 甲에게 기간 내에 처리 결과를 알렸다.', 'A청은 乙의 청원에 대해 필요하면 처리 기간을 30일 더 연장할 수 있다.', '乙의 청원은 연장된 기간에 따라 2026년 8월 15일까지 처리하면 된다.', '乙은 2026년 8월 14일까지만 이의신청을 할 수 있다.', 'A청이 처리 기간을 연장할 때에는 乙에게 연장 사유만 알리면 된다.'],
    'answer': 0,
    'explain': [
        p('<b>출발점</b> 첫날을 빼고 세며, 마지막 날이 주말이면 월요일로 넘어간다. 90일·30일 계산은 달마다 남은 날을 더하면 빠르다.'),
        ox([
            (True, O, '4월 13일 다음 날부터 세면 4월 17일 + 5월 31일 + 6월 30일 = 78일, 7월 12일이 90일째이다. 7월 12일이 일요일이므로 기간은 7월 13일(월)에 끝난다. 7월 13일 통지는 기간 내이다. <b>함정</b>: 주말 규정을 빠뜨리면 하루 늦었다고 판단한다.'),
            (False, XX, '제○○조 제2항: 연장은 60일의 범위에서 ‘한 차례만’ 할 수 있다. 이미 30일을 연장하였으므로, 합계가 60일 안이라도 다시 연장할 수 없다.'),
            (False, XX, f'원래 기간: 3월 18일 다음 날부터 13일 + 30일 + 31일 + 16일 = 90일 → 6월 16일(화). 연장 30일은 6월 17일부터 세어 7월 16일(목)이 마지막 날이다. 8월 15일은 60일을 연장한 것처럼 계산한 값이다.'),
            (False, XX, '7월 16일 통지를 받았으므로 다음 날부터 30일째는 8월 15일(토)이고, 주말이므로 8월 17일(월)까지 이의신청을 할 수 있다. 8월 14일에 끝나지 않는다.'),
            (False, XX, '제○○조 제2항 후단: 연장 사유와 ‘처리 예정 기한’을 함께 알려야 한다.'),
        ]),
        p('따라서 정답은 <b>①</b>이다.'),
    ]})

# ---------------------------------------------------------------- S-C04 유실물 (권리 상실, 보상금 범위, 소유권 귀속)
t = {'ㄱ': 100 * F(5, 100) == 5, 'ㄴ': False, 'ㄷ': False, 'ㄹ': True}
opts = ['ㄱ, ㄹ', 'ㄴ, ㄷ', 'ㄴ, ㄹ', 'ㄱ, ㄴ, ㄷ', 'ㄴ, ㄷ, ㄹ']
ans = combo(t, opts)
items.append({
    'id': 'S-C04', 'type': '상황판단 · 법조문', 'lv': 2,
    'stem': '다음 글을 근거로 판단할 때, <보기>에서 옳은 것만을 모두 고르면?',
    'body': [law('<p><b>제○○조(습득물의 제출)</b> ① 다른 사람이 잃어버린 물건을 습득한 사람은 습득한 날부터 7일 이내에 그 물건을 경찰서에 제출하여야 한다.<br>② 제1항의 기간 내에 물건을 제출하지 아니한 사람은 제△△조의 보상금을 받을 권리와 제□□조에 따라 소유권을 취득할 권리를 잃는다.</p>'
                 '<p><b>제△△조(보상금)</b> ① 물건을 돌려받는 사람은 물건 가액의 100분의 5 이상 100분의 20 이하의 범위에서 습득자에게 보상금을 지급하여야 한다.<br>② 공무원이 직무를 수행하던 중에 습득한 경우에는 보상금을 청구할 수 없다.</p>'
                 '<p><b>제□□조(소유권의 취득)</b> 경찰서장이 습득물을 공고한 날부터 6개월 이내에 소유자가 권리를 주장하지 아니하면 습득자가 그 소유권을 취득한다. 다만, 습득자가 소유권을 취득한 날부터 3개월 이내에 물건을 찾아가지 아니하면 그 소유권은 국가에 귀속된다.</p>'),
             box('보기', ['ㄱ. 甲이 5월 1일 습득한 시가 100만 원의 노트북을 5월 6일 경찰서에 제출하였고 소유자 乙이 노트북을 돌려받았다면, 乙은 甲에게 5만 원 이상의 보상금을 지급하여야 한다.', 'ㄴ. 경찰관 丙이 순찰 근무 중에 지갑을 습득하여 제출하였다면, 丙은 지갑을 돌려받는 소유자에게 보상금을 청구할 수 있다.', 'ㄷ. 丁이 물건을 습득한 지 10일이 지나 경찰서에 제출하였고 공고 후 6개월 동안 소유자가 나타나지 않았다면, 丁이 그 소유권을 취득한다.', 'ㄹ. 기한 내에 물건을 제출한 戊가 공고 후 6개월이 지나 소유권을 취득하였더라도, 그 후 3개월 이내에 물건을 찾아가지 않으면 그 소유권은 국가에 귀속된다.'])],
    'options': opts, 'answer': ans,
    'explain': [
        p('<b>출발점</b> 세 조문의 연결고리는 ‘7일 이내 제출’이다. 제출 기한을 넘기면 보상금과 소유권 취득의 권리를 모두 잃는다(제○○조 제2항).'),
        bx([
            ('ㄱ', '100만 원 노트북, 5일 만에 제출 → 5만 원 이상', True, O, '5월 1일 습득, 5월 6일 제출은 7일 이내이다(첫날을 넣든 빼든 마찬가지). 보상금은 가액의 100분의 5 이상이므로 100만 원 × 5% = 5만 원 이상이다.'),
            ('ㄴ', '경찰관이 순찰 중 습득 → 보상금 청구', False, XX, '제△△조 제2항: 공무원이 직무 수행 중에 습득하면 보상금을 청구할 수 없다.'),
            ('ㄷ', '10일 지나 제출 → 6개월 후 소유권 취득', False, XX, '7일 기한을 넘겨 제출하였으므로 제○○조 제2항에 따라 소유권을 취득할 권리를 잃는다. <b>함정</b>: 제□□조만 보고 ‘6개월 동안 소유자가 없으면 습득자 소유’로 판단하면 틀린다. 다른 조문의 요건(제출 기한)이 먼저 걸러 낸다.'),
            ('ㄹ', '소유권 취득 후 3개월 내 안 찾아가면 국가 귀속', True, O, '제□□조 단서 그대로이다.'),
        ]),
        p(f'따라서 옳은 것은 ㄱ, ㄹ이고 정답은 <b>{CIRC[ans]}</b>이다.'),
    ]})

# ---------------------------------------------------------------- S-C05 보조금 (상한, 목적 외 사용 반환 + 가산금, 잔액 반환)
cost = 8000; grant = min(cost * F(70, 100), 5000)         # 만 원
used, misuse = 4200, 300
left = grant - used - misuse
refund = misuse + misuse * F(10, 100) + left
check(grant == 5000 and left == 500 and refund == 830, f'S-C05 {grant} {left} {refund}')
opts = [misuse + misuse * F(10, 100), left, misuse + left, refund, (misuse + left) * F(11, 10)]   # only misuse / only leftover / no surcharge / answer / surcharge on all
check(len(set(opts)) == 5 and sorted(opts) == opts, f'S-C05 options {opts}')
items.append({
    'id': 'S-C05', 'type': '상황판단 · 법조문 계산', 'lv': 2,
    'stem': '다음 글과 <상황>을 근거로 판단할 때, A단체가 반환하여야 할 금액(가산금 포함)은?',
    'body': [law('<p><b>제○○조(보조금의 교부)</b> ① 시장은 사업비의 100분의 70 이내에서 보조금을 교부할 수 있다. 다만, 보조금은 한 사업당 5천만 원을 넘을 수 없다.<br>② 보조사업자는 사업비에서 보조금을 뺀 금액을 스스로 부담하여야 한다.</p>'
                 '<p><b>제△△조(보조금의 반환)</b> ① 보조사업자가 보조금을 교부 목적 외의 용도로 사용한 경우 시장은 그 금액의 반환을 명하여야 한다.<br>② 제1항에 따라 반환을 명하는 경우에는 반환할 금액의 100분의 10에 해당하는 금액을 가산금으로 함께 징수한다.<br>③ 보조사업자는 사업을 마친 후 남은 보조금을 반환하여야 한다. 이 경우에는 가산금을 징수하지 아니한다.</p>'),
             box('상황', ['A단체는 사업비 8천만 원인 사업에 대하여 시장으로부터 법령이 허용하는 최대 금액의 보조금을 받았다. A단체는 받은 보조금 가운데 4,200만 원을 사업에 쓰고, 300만 원은 교부 목적 외의 용도로 사용하였으며, 나머지 보조금은 사업을 마칠 때까지 쓰지 않았다. 시장은 법령에 따라 반환을 명하였다.'], plain=True)],
    'options': [f'{int(x):,}만 원' for x in opts], 'answer': 3,
    'explain': [
        p('<b>보조금부터 확정한다.</b> 사업비의 70%는 5,600만 원이지만, 한 사업당 상한이 5천만 원이므로 보조금은 <b>5,000만 원</b>이다. 쓰지 않은 보조금은 5,000 − 4,200 − 300 = 500만 원이다.'),
        table(['구분', '근거', '금액'], [['목적 외 사용액', '제△△조 제1항', '300만 원'], ['가산금', '제△△조 제2항: 300만 원 × 10%', '30만 원'], ['남은 보조금', '제△△조 제3항(가산금 없음)', '500만 원'], ['합계', '', '830만 원']]),
        p('정답은 <b>④</b>이다. 목적 외 사용분만 보면 330만 원(①), 남은 보조금만 보면 500만 원(②), 가산금을 빠뜨리면 800만 원(③), 남은 보조금에도 가산금을 붙이면 880만 원(⑤)이 된다. 보조금을 상한 없이 5,600만 원으로 잡으면 남은 금액이 1,100만 원이 되어 어느 선지와도 맞지 않는다. 상한을 먼저 적용해야 한다.'),
    ]})

# ---------------------------------------------------------------- S-C06 우수 공무원 선발 (가중치, 가점 상한, 징계 제외, 동점 처리)
C6 = {  # 업무실적, 직무역량, 근무태도, 제안 채택 건수, 정부 포상, 최근 1년 징계
    '甲': (90, 80, 70, 2, False, False), '乙': (85, 85, 90, 0, True, False), '丙': (95, 90, 80, 1, False, True),
    '丁': (80, 95, 85, 4, True, False), '戊': (88, 90, 80, 1, False, False)}
def score(v, cap=True):
    a, b, c, prop, award, disc = v
    base = F(a) * F(5, 10) + F(b) * F(3, 10) + F(c) * F(2, 10)
    bonus = min(prop, 3) + (2 if award else 0)
    return base + (min(bonus, 4) if cap else prop + (2 if award else 0))
def pick(cap=True, discipline=True, tiebreak=(0, 2)):
    cand = [k for k, v in C6.items() if not (discipline and v[5])]
    key = lambda k: (score(C6[k], cap), C6[k][tiebreak[0]], C6[k][tiebreak[1]])
    return sorted(sorted(cand, key=key, reverse=True)[:2])
ans_pair = pick()
check(ans_pair == ['丁', '戊'], f'S-C06 {ans_pair} scores { {k: float(score(v)) for k, v in C6.items()} }')
check(score(C6['乙']) == score(C6['戊']), 'S-C06 tie between 乙 and 戊 is the point')
check(set(pick(discipline=False)) == {'丙', '丁'} and set(pick(tiebreak=(2, 0))) == {'乙', '丁'}, 'S-C06 traps lead to options')
opts = ['甲, 乙', '乙, 丁', '丙, 丁', '丁, 戊', '乙, 戊']
check(opts.index(', '.join(ans_pair)) == 3, 'S-C06 answer position')
items.append({
    'id': 'S-C06', 'type': '상황판단 · 규칙 적용', 'lv': 2,
    'stem': '다음 글과 <상황>을 근거로 판단할 때, 우수 공무원으로 선발되는 사람을 모두 고르면?',
    'body': [{'t': 'passage', 'h': '<p>A부는 다음 기준에 따라 우수 공무원 2명을 선발한다.</p><ul class="cond"><li>평가점수 = 업무실적 × 0.5 + 직무역량 × 0.3 + 근무태도 × 0.2 (각 항목 100점 만점)</li><li>가점: 제안 채택 1건당 1점(최대 3점), 정부 포상을 받은 경우 2점. 가점의 합계는 4점을 넘을 수 없다.</li><li>총점 = 평가점수 + 가점. 총점이 높은 순으로 선발한다.</li><li>총점이 같으면 업무실적 점수가 높은 사람을, 업무실적 점수도 같으면 근무태도 점수가 높은 사람을 선발한다.</li><li>최근 1년 안에 징계를 받은 사람은 선발하지 않는다.</li></ul>'},
             table(['후보', '업무실적', '직무역량', '근무태도', '제안 채택', '정부 포상', '최근 1년 징계'], [[k, str(v[0]), str(v[1]), str(v[2]), f'{v[3]}건', '○' if v[4] else '×', '○' if v[5] else '×'] for k, v in C6.items()], caption='상황', num=True)],
    'options': opts, 'answer': 3,
    'explain': [
        p('<b>먼저 지운다.</b> 丙은 최근 1년 안에 징계를 받아 점수와 상관없이 제외된다.'),
        table(['후보', '평가점수', '가점', '총점'], [[k, f'{float(score(v) - min(min(v[3], 3) + (2 if v[4] else 0), 4)):.1f}', f'{min(min(v[3], 3) + (2 if v[4] else 0), 4)}', f'{float(score(v)):.1f}' + (' (제외)' if v[5] else '')] for k, v in C6.items()], num=True, note='丁의 가점: 제안 4건 → 3점(상한) + 포상 2점 = 5점 → 합계 상한 4점'),
        p('총점은 丁 89.5점이 가장 높고, 乙과 戊가 88.0점으로 같다. 동점이면 업무실적을 먼저 보므로 업무실적 88점인 戊가 85점인 乙에 앞선다. 따라서 선발되는 사람은 丁과 戊이고 정답은 <b>④</b>이다.'),
        p(f'<b>함정</b> 징계 제외를 빠뜨리면 丙({float(score(C6["丙"])):.1f}점)이 1위로 들어가 ③이 된다. 동점 처리에서 근무태도를 먼저 보면 乙(90점)이 앞서 ②가 된다. 丁의 가점 상한을 빠뜨려도 丁은 1위라 결론은 같지만, 이런 조건은 다른 후보의 순위를 바꾸는 경우가 많으니 늘 적용한다.'),
    ]})

# ---------------------------------------------------------------- S-C07 출장 여비 (실비, 일비 감액, 숙박 상한)
train, nights, car_days, days = 110_000, [90_000, 50_000], 1, 3
ilbi = 20_000 * (days - car_days) + 10_000 * car_days
sikbi = 25_000 * days
sukbak = sum(min(x, 70_000) for x in nights)
total7 = train + ilbi + sikbi + sukbak
check(total7 == 355_000, f'S-C07 {total7}')
opts = [total7 - 10_000, total7, total7 + 10_000, total7 + 20_000, total7 + 30_000]   # 공용차량 날 일비 0 / answer / 일비 감액 누락 / 숙박 상한 누락 / 둘 다 누락
check(train + 20_000 * 2 + sikbi + sukbak == opts[0] and train + 20_000 * 3 + sikbi + sukbak == opts[2] and train + ilbi + sikbi + sum(nights) == opts[3] and train + 60_000 + sikbi + sum(nights) == opts[4], 'S-C07 distractors are the named slips')
items.append({
    'id': 'S-C07', 'type': '상황판단 · 비용 계산', 'lv': 1,
    'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲이 받을 출장 여비의 총액은?',
    'body': [{'t': 'passage', 'h': '<p>A기관은 국내 출장 여비를 다음과 같이 지급한다.</p><ul class="cond"><li>교통비: 실제 쓴 금액</li><li>일비: 출장 1일당 2만 원. 다만, 출장지에서 공용차량을 이용한 날에는 1만 원</li><li>식비: 출장 1일당 2만 5천 원</li><li>숙박비: 1박당 실제 쓴 금액. 다만, 1박당 7만 원을 넘을 수 없으며, 서울특별시에서 숙박한 경우에는 1박당 10만 원을 넘을 수 없다.</li></ul>'},
             box('상황', ['甲은 부산에서 2박 3일 동안 출장 업무를 수행하였다. 왕복 기차 요금으로 11만 원을 썼고, 숙박비로 첫째 날 9만 원, 둘째 날 5만 원을 썼다. 출장 둘째 날에는 출장지에서 공용차량을 이용하였다.'], plain=True)],
    'options': [won(x) for x in opts], 'answer': 1,
    'explain': [
        table(['항목', '계산', '금액'], [['교통비', '실비', '110,000원'], ['일비', '2만 원 × 2일 + 1만 원 × 1일', f'{ilbi:,}원'], ['식비', '2만 5천 원 × 3일', f'{sikbi:,}원'], ['숙박비', '첫째 날 9만 원 → 상한 7만 원, 둘째 날 5만 원', f'{sukbak:,}원'], ['합계', '', f'{total7:,}원']]),
        p('정답은 <b>②</b>이다. 공용차량을 쓴 날 일비를 아예 빼면 345,000원(①), 일비 감액을 빠뜨리면 365,000원(③), 숙박비 상한을 빠뜨리면 375,000원(④), 둘 다 빠뜨리면 385,000원(⑤)이 된다. 출장지가 부산이므로 서울특별시의 상한(10만 원)은 적용하지 않는다. <b>빠른 풀이</b>: 항목별 ‘원칙 금액’ 합계(교통 11 + 일비 6 + 식비 7.5 + 숙박 14 = 38.5만 원)에서 예외로 줄어드는 금액(일비 1만 원, 숙박 2만 원)만 빼도 된다.'),
    ]})

# ---------------------------------------------------------------- S-C08 발표 순서 (반드시 참)
P8 = 'ABCDE'
conds8 = [lambda q: q['B'] < q['D'], lambda q: abs(q['A'] - q['C']) != 1, lambda q: q['E'] in (3, 5), lambda q: q['D'] == q['C'] + 1, lambda q: q['A'] != 1]
sols8 = []
for perm in itertools.permutations(P8):
    q = {x: i + 1 for i, x in enumerate(perm)}
    if all(c(q) for c in conds8): sols8.append(q)
check(len(sols8) == 2, f'S-C08 solutions {len(sols8)}')
optf8 = [lambda q: q['B'] == 2, lambda q: q['E'] == 3, lambda q: q['C'] < q['A'], lambda q: abs(q['A'] - q['E']) == 1, lambda q: q['D'] == 5]
always8 = [all(f(q) for q in sols8) for f in optf8]
one_true(always8, 3, 'S-C08')
order = lambda q: ''.join(sorted(q, key=q.get))
items.append({
    'id': 'S-C08', 'type': '상황판단 · 자리 배치', 'lv': 2,
    'stem': '다음 글을 근거로 판단할 때 반드시 참인 것은?',
    'body': [{'t': 'passage', 'h': '<p>A~E 다섯 명이 첫 번째부터 다섯 번째까지 한 명씩 차례로 발표한다. 발표 순서는 다음 조건을 모두 만족한다.</p><ul class="cond lab"><li><span class="lb">(가)</span> B는 D보다 먼저 발표한다.</li><li><span class="lb">(나)</span> A와 C는 연달아 발표하지 않는다.</li><li><span class="lb">(다)</span> E는 세 번째 또는 다섯 번째로 발표한다.</li><li><span class="lb">(라)</span> D는 C의 바로 다음에 발표한다.</li><li><span class="lb">(마)</span> A는 첫 번째로 발표하지 않는다.</li></ul>'}],
    'options': ['B는 두 번째로 발표한다.', 'E는 세 번째로 발표한다.', 'C는 A보다 먼저 발표한다.', 'A와 E는 연달아 발표한다.', 'D는 다섯 번째로 발표한다.'],
    'answer': 3,
    'explain': [
        {'t': 'steps', 'items': [
            {'ind': 0, 'h': '<b>출발점</b> (라)로 C와 D를 ‘CD’ 한 덩어리로 묶는다. (가)에 따라 B는 이 덩어리보다 앞에 있다.'},
            {'ind': 0, 'h': '<b>E가 세 번째인 경우</b> 남은 1·2번과 4·5번 중 ‘CD’는 4·5번에 들어가야 B가 앞선다(1·2번이면 B가 앞에 올 수 없다). 그러면 1·2번에 A와 B가 들어가고, (마)에 따라 A는 2번, B는 1번이다. A(2)와 C(4)는 연달아 있지 않아 (나)도 만족한다. → <b>B A E C D</b>'},
            {'ind': 0, 'h': '<b>E가 다섯 번째인 경우</b> 1~4번에 A, B, ‘CD’가 들어간다. B는 ‘CD’보다 앞이고 A는 1번이 아니므로 B가 1번이다. ‘CD’가 2·3번이면 A는 4번이 되어 D(3)와 이웃하지만 C(2)와는 떨어져 (나)를 만족한다. ‘CD’가 3·4번이면 A는 2번이 되어 C(3)와 연달아 (나)에 어긋난다. → <b>B C D A E</b>'},
        ]},
        ox([
            (False, NT, 'B는 두 경우 모두 첫 번째이다. 두 번째인 경우는 없다.'),
            (False, NT, 'B C D A E에서는 E가 다섯 번째이다.'),
            (False, NT, 'B A E C D에서는 A(2)가 C(4)보다 먼저이다.'),
            (True, T, 'B A E C D에서 A(2)·E(3), B C D A E에서 A(4)·E(5)로 두 경우 모두 연달아 발표한다.'),
            (False, NT, 'B C D A E에서는 D가 세 번째이다.'),
        ]),
        p('따라서 정답은 <b>④</b>이다. <b>빠른 풀이</b>: ‘반드시 참’을 고를 때는 가능한 배열을 하나 찾은 뒤, 그 배열에서 거짓인 선지부터 지우고 남은 선지만 두 번째 배열로 확인한다.'),
    ]})
check({order(q) for q in sols8} == {'BAECD', 'BCDAE'}, 'S-C08 explanation names the two orders')

# ---------------------------------------------------------------- S-C09 한 명만 거짓 (반드시 참)
people9 = ['甲', '乙', '丙', '丁']; teams9 = ['기획', '인사', '재무', '홍보']
stm9 = {'甲': lambda a: a['甲'] != '기획', '乙': lambda a: a['丙'] == '재무', '丙': lambda a: a['丙'] not in ('재무', '인사'), '丁': lambda a: a['甲'] == '홍보'}
sols9 = []
for perm in itertools.permutations(teams9):
    a = dict(zip(people9, perm)); liars = [k for k in people9 if not stm9[k](a)]
    if len(liars) == 1: sols9.append((a, liars[0]))
check(len(sols9) == 4, f'S-C09 {len(sols9)} solutions')
optf9 = [lambda a, l: a['丙'] == '재무', lambda a, l: l == '乙', lambda a, l: a['乙'] == '인사', lambda a, l: a['丁'] != '기획', lambda a, l: a['甲'] == '홍보']
always9 = [all(f(a, l) for a, l in sols9) for f in optf9]
one_true(always9, 4, 'S-C09')
items.append({
    'id': 'S-C09', 'type': '상황판단 · 참거짓 추론', 'lv': 2,
    'stem': '다음 글을 근거로 판단할 때 반드시 참인 것은?',
    'body': [{'t': 'passage', 'h': '<p>신규 직원 甲, 乙, 丙, 丁은 기획팀, 인사팀, 재무팀, 홍보팀 가운데 서로 다른 한 팀에 한 명씩 배치되었다. 네 사람은 배치 결과에 대하여 다음과 같이 말하였는데, 이 가운데 한 명만 거짓을 말하였다.</p><ul class="cond"><li>甲: 나는 기획팀이 아니다.</li><li>乙: 丙은 재무팀이다.</li><li>丙: 나는 재무팀도 인사팀도 아니다.</li><li>丁: 甲은 홍보팀이다.</li></ul>'}],
    'options': ['丙은 재무팀이다.', '거짓을 말한 사람은 乙이다.', '乙은 인사팀이다.', '丁은 기획팀이 아니다.', '甲은 홍보팀이다.'],
    'answer': 4,
    'explain': [
        p('<b>출발점</b> 서로 부딪치는 두 진술을 찾는다. 乙(‘丙은 재무팀’)과 丙(‘나는 재무팀이 아니다’)은 동시에 참일 수 없다. 거짓은 한 명뿐이므로 거짓말쟁이는 乙과 丙 중 한 명이고, <b>甲과 丁은 참</b>을 말하였다. 丁의 말에 따라 甲은 홍보팀이다.'),
        table(['거짓을 말한 사람', '가능한 배치(甲·乙·丙·丁)'], [[l, '·'.join(a[k] for k in people9)] for a, l in sols9], caption='가능한 경우 전부'),
        ox([
            (False, NT, '乙이 거짓을 말한 경우 丙은 재무팀이 아니다(기획팀).'),
            (False, NT, '丙이 거짓을 말한 경우도 있다(丙이 재무팀).'),
            (False, NT, '乙이 기획팀이거나 재무팀인 경우도 있다.'),
            (False, NT, '甲 홍보·乙 인사·丙 재무·丁 기획인 경우가 있다.'),
            (True, T, '甲과 丁은 어느 경우에나 참을 말하였고, 丁의 말에 따라 甲은 홍보팀이다.'),
        ]),
        p('따라서 정답은 <b>⑤</b>이다. <b>빠른 풀이</b>: 모순 쌍을 찾으면 나머지 진술은 모두 참으로 확정된다. 배치를 끝까지 정하지 않아도 답이 나온다.'),
    ]})

# ---------------------------------------------------------------- S-C10 택배 합포장 최소 요금
w10 = [F(15, 10), F(25, 10), 3, 4, 6, 9]
def fee10(w):
    for lim, f in [(2, 4000), (5, 5500), (10, 7000), (20, 9000)]:
        if w <= lim: return f
    return None
def parts(seq):
    if not seq: yield []; return
    first, rest = seq[0], seq[1:]
    for pp in parts(rest):
        for i in range(len(pp)): yield pp[:i] + [[first] + pp[i]] + pp[i + 1:]
        yield [[first]] + pp
costs = []
for pp in parts(w10):
    fs = [fee10(sum(b)) for b in pp]
    if None in fs: continue
    costs.append(sum(fs) + 500 * len(pp))
best10 = min(costs); sep10 = sum(fee10(w) + 500 for w in w10)
check(best10 == 17000 and sep10 == 37500 and sum(w10) == 26, f'S-C10 {best10} {sep10}')
min3 = min(sum(fee10(sum(b)) for b in pp) + 500 * len(pp) for pp in parts(w10) if len(pp) == 3 and None not in [fee10(sum(b)) for b in pp])
min4 = min(sum(fee10(sum(b)) for b in pp) + 500 * len(pp) for pp in parts(w10) if len(pp) >= 4 and None not in [fee10(sum(b)) for b in pp])
check(min3 == 21500 and min3 >= 18000 and min4 > 18000, f'S-C10 three-box {min3} four+ {min4}')
opts = [15500, 16000, best10, 21500, sep10]
check(16000 == best10 - 1000 and 15500 == 9000 + 5500 + 1000 and sorted(opts) == opts, 'S-C10 distractors')
items.append({
    'id': 'S-C10', 'type': '상황판단 · 비용 계산', 'lv': 2,
    'stem': '다음 글과 <상황>을 근거로 판단할 때, 甲이 물건을 모두 보내는 데 드는 최소 비용은?',
    'body': [{'t': 'passage', 'h': '<p>A택배의 요금은 상자 하나의 무게에 따라 다음과 같다. 20kg을 넘는 상자는 접수하지 않는다.</p>'},
             table(['상자 무게', '2kg 이하', '2kg 초과 5kg 이하', '5kg 초과 10kg 이하', '10kg 초과 20kg 이하'], [['요금', '4,000원', '5,500원', '7,000원', '9,000원']]),
             {'t': 'passage', 'h': '<p>같은 주소로 보내는 물건은 한 상자에 함께 담을 수 있으며, 상자 무게는 담은 물건 무게의 합으로 한다. 상자 하나마다 포장비 500원이 따로 든다.</p>'},
             box('상황', ['甲은 무게가 각각 1.5kg, 2.5kg, 3kg, 4kg, 6kg, 9kg인 물건 6개를 모두 같은 주소로 보내려고 한다.'], plain=True)],
    'options': [won(x) for x in opts], 'answer': 2,
    'explain': [
        p('<b>출발점</b> 물건 무게의 합은 26kg이다. 한 상자는 20kg을 넘을 수 없으므로 상자는 2개 이상 필요하다.'),
        p('<b>상자 2개일 때</b> 한 상자가 20kg 이하이면 다른 상자는 6kg 이상이므로, 둘째 상자 요금은 최소 7,000원(5kg 초과 10kg 이하)이다. 첫째 상자를 16~20kg, 둘째 상자를 6~10kg으로 나누면 9,000 + 7,000 + 포장비 1,000 = <b>17,000원</b>이다. 예: (9 + 6 + 4 = 19kg) + (3 + 2.5 + 1.5 = 7kg).'),
        p('<b>상자 3개 이상일 때</b> 2kg 이하 구간(4,000원)에 넣을 수 있는 물건은 1.5kg 하나뿐이므로 4,000원짜리 상자는 많아야 1개이고, 나머지 상자는 5,500원 이상이다. 상자가 3개면 가장 무거운 상자는 26 ÷ 3 > 8kg이라 7,000원 이상이므로, 요금은 적어도 7,000 + 5,500 + 4,000 = 16,500원에 포장비 1,500원을 더한 18,000원이다. 상자가 4개 이상이면 5,500원 이상인 상자와 포장비가 더 늘어 그보다 비싸다. 따라서 상자 2개, 17,000원이 최소이다(실제 3상자 최소는 21,500원).'),
        p('따라서 정답은 <b>③</b>이다. 포장비를 빠뜨리면 16,000원(②), 6kg인 둘째 상자를 5,500원 구간으로 잘못 넣으면 15,500원(①), 물건마다 따로 보내면 37,500원(⑤)이다.'),
    ]})

# ---------------------------------------------------------------- S-C11 버스 동시 출발
def deps(first, gap): return {first + gap * k for k in range(200) if first + gap * k < 24 * 60}
A11, B11, C11 = deps(360, 12), deps(366, 18), deps(376, 20)
common = sorted(A11 & B11 & C11)
check(common[0] == 7 * 60 + 36, f'S-C11 first common {common[:2]}')
hm = lambda m: f'{m // 60}시 {m % 60:02d}분'
opts = [6 * 60 + 36, 7 * 60, 7 * 60 + 36, 8 * 60 + 12, 10 * 60 + 36]
flags = [m == common[0] for m in opts]
check(common[1] == 10 * 60 + 36, f'S-C11 second common {common[1]}')
one_true(flags, 2, 'S-C11')
check((6 * 60 + 36) in A11 and (6 * 60 + 36) in C11 and (7 * 60) in A11 and (7 * 60) in B11 and (8 * 60 + 12) in A11 and (8 * 60 + 12) in B11, 'S-C11 distractors catch two routes each')
items.append({
    'id': 'S-C11', 'type': '상황판단 · 일정', 'lv': 1,
    'stem': '다음 글을 근거로 판단할 때, 세 노선의 버스가 처음으로 터미널에서 동시에 출발하는 시각은?',
    'body': [{'t': 'passage', 'h': '<p>A터미널에서는 세 노선의 버스가 다음과 같이 출발한다.</p><ul class="cond"><li>1번 버스: 오전 6시 00분에 첫차가 출발하고, 이후 12분마다 출발한다.</li><li>2번 버스: 오전 6시 06분에 첫차가 출발하고, 이후 18분마다 출발한다.</li><li>3번 버스: 오전 6시 16분에 첫차가 출발하고, 이후 20분마다 출발한다.</li></ul>'}],
    'options': ['오전 ' + hm(x) for x in opts], 'answer': 2,
    'explain': [
        p('<b>두 노선부터 맞춘다.</b> 1번(6시 00분, 12분 간격)과 2번(6시 06분, 18분 간격)이 함께 출발하는 시각은 6시 24분, 7시 00분, 7시 36분, … 으로 36분(12와 18의 최소공배수)마다 돌아온다.'),
        p('<b>3번과 맞춘다.</b> 3번은 6시 16분, 36분, 56분, 7시 16분, 36분, … 이다. 6시 24분과 7시 00분은 3번의 출발 시각이 아니고, 7시 36분은 3번의 출발 시각이다(6시 16분 + 20분 × 4). 따라서 처음으로 세 노선이 함께 출발하는 시각은 <b>오전 7시 36분</b>이고 정답은 <b>③</b>이다.'),
        p('<b>함정</b> 6시 36분은 1번과 3번만, 7시 00분과 8시 12분은 1번과 2번만 겹친다. 세 간격의 최소공배수(180분)를 첫차 시각(6시 00분)에 더한 9시 00분을 떠올리기 쉽지만, 첫차 시각이 서로 달라 그렇게 구할 수 없다. 10시 36분은 7시 36분 다음에 다시 함께 출발하는 시각이다.'),
    ]})

# ---------------------------------------------------------------- S-C12 안내문 판단 (상호대차)
limit_req, limit_total, pickup_days, loan_days = 3, 7, 5, 14
holding = 4; notice = dt.date(2025, 3, 10)      # weekday labels only; no year shown
last_pickup = notice + dt.timedelta(days=pickup_days - 1)
st = [4 <= limit_req and holding + 4 <= limit_total, dt.date(2025, 3, 15) <= last_pickup, False, holding + 3 + 1 <= limit_total, True]
check(notice.weekday() == 0 and last_pickup == dt.date(2025, 3, 14) and last_pickup.weekday() == 4 and dt.date(2025, 3, 15).weekday() == 5 and dt.date(2025, 3, 11).weekday() == 1, 'S-C12 weekday labels')
one_true(st, 4, 'S-C12')
items.append({
    'id': 'S-C12', 'type': '상황판단 · 규칙 적용', 'lv': 1,
    'stem': '다음 글과 <상황>을 근거로 판단할 때 옳은 것은?',
    'body': [{'t': 'passage', 'h': '<p><b>○○시 공공도서관 상호대차 서비스 안내</b></p><ul class="cond"><li>상호대차는 ○○시 공공도서관끼리 책을 주고받아, 다른 도서관이 가진 책을 이용자가 원하는 도서관에서 빌릴 수 있게 하는 서비스입니다.</li><li>한 번에 3권까지 신청할 수 있습니다. 다만, 상호대차로 신청 중이거나 빌린 책과 일반 대출로 빌린 책을 모두 합하여 1인당 7권을 넘을 수 없습니다.</li><li>신청한 책이 도착하면 문자로 알려 드립니다. 도착 알림을 받은 날을 포함하여 5일 안에 찾아가지 않으면 신청은 취소됩니다.</li><li>상호대차로 빌린 책의 대출 기간은 14일이며, 연장할 수 없습니다. 일반 대출로 빌린 책은 예약자가 없으면 한 번 7일 연장할 수 있습니다.</li><li>반납이 늦으면 늦은 일수만큼 모든 책의 대출이 정지됩니다.</li></ul>'},
             box('상황', ['甲은 일반 대출로 4권을 빌려 보고 있다. 甲은 상호대차로 3권을 신청하였고, 3월 10일(월)에 도착 알림을 받았다.'], plain=True)],
    'options': ['甲은 상호대차로 한 번에 4권을 신청할 수 있었다.', '甲이 3월 15일(토)에 도서관을 찾아가면 상호대차로 신청한 책을 빌릴 수 있다.', '甲이 일반 대출로 빌린 책을 늦게 반납하면 그 책에 대해서만 대출이 정지된다.', '甲은 상호대차로 3권을 빌린 뒤에도 일반 대출로 1권을 더 빌릴 수 있다.', '甲이 상호대차로 신청한 책을 3월 11일(화)에 빌렸다면, 예약자가 없어도 대출 기간을 연장할 수 없다.'],
    'answer': 4,
    'explain': [
        ox([
            (False, XX, '한 번에 3권까지 신청할 수 있다. 게다가 일반 대출 4권에 4권을 더하면 8권으로 1인당 7권도 넘는다.'),
            (False, XX, '도착 알림을 받은 3월 10일(월)을 포함하여 5일째는 3월 14일(금)이다. 3월 15일(토)에는 이미 신청이 취소되었다. <b>함정</b>: 알림 받은 날을 빼고 세면 15일까지로 착각한다. 안내문은 ‘포함하여’라고 정했다.'),
            (False, XX, '반납이 늦으면 늦은 일수만큼 ‘모든 책’의 대출이 정지된다.'),
            (False, XX, '일반 대출 4권 + 상호대차 3권 = 7권으로 이미 1인당 한도에 이르렀다.'),
            (True, O, '상호대차로 빌린 책은 연장할 수 없다. 예약자가 없으면 7일 연장할 수 있는 것은 일반 대출 책이다.'),
        ]),
        p('따라서 정답은 <b>⑤</b>이다. <b>빠른 풀이</b>: 안내문에서 ‘다만’, ‘포함하여’, ‘연장할 수 없습니다’처럼 원칙을 바꾸는 말에 먼저 표시하고 선지와 대조한다.'),
    ]})

# ---------------------------------------------------------------- 검수표
REVIEW = {
 'S-C01': ('법조문 적용', '하', '1분 20초', '의무·재량 구별, 원칙과 단서, 경계값(이하)', '① 단서 범위 확대 / ③ ‘본인의 의사에도 불구하고’ 누락 / ④⑤ 기간 착오', '단서가 돌려놓은 호(제2호)만 표시하면 ①②가 바로 갈림', '공무원 휴직 규정형, 조문 재구성'),
 'S-C02': ('법조문 적용', '중', '2분', '용도별 요율 선택, 일할계산(양 끝 포함), 중복 감면 금지', '① 감면 두 번 / ②④ 일수 하루 차이 / ⑤ 감면 누락', '730만 ÷ 365 = 2만 원으로 하루 사용료를 먼저 구함', '사용료·감면 계산형, 금액·기간 새로 설계'),
 'S-C03': ('법조문 적용', '상', '2분 30초', '기간 계산(첫날 제외, 주말 이월), 연장의 기산점과 횟수 제한, 통지 내용', '① 주말 이월 누락 / ② ‘한 차례만’ 누락 / ③ 60일 연장으로 착각 / ④ 이의 기한 주말 이월 누락 / ⑤ 통지 내용 일부 누락', '달마다 남은 날을 더해 90일째를 찾음', '기간·절차형, 실제 2026년 달력으로 요일 확인'),
 'S-C04': ('법조문 적용', '중', '1분 40초', '조문 간 연결(제출 기한 → 권리 상실), 예외(직무 중 습득), 단서', 'ㄷ 다른 조문의 요건 누락', '세 조문의 연결고리(7일 제출)부터 확인', '유실물 규정형, 사례 새로 설계'),
 'S-C05': ('법조문 적용', '중', '1분 50초', '교부 상한의 선적용, 목적 외 사용(가산금)과 잔액 반환(가산금 없음) 구별', '①② 일부만 반환 / ③ 가산금 누락 / ⑤ 잔액에도 가산금', '보조금 = min(5,600, 5,000)을 먼저 확정', '보조금 반환형, 수치 새로 설계'),
 'S-C06': ('규정·절차 응용', '중', '2분 10초', '가중합, 가점 상한, 제외 사유, 동점 처리 순서', '③ 징계 제외 누락 / ② 동점 처리 순서 뒤바뀜', '징계자 먼저 제외, 동점 후보 둘만 정밀 비교', '선발 규칙형, 점수 새로 설계(동점이 실제로 발생)'),
 'S-C07': ('규정·절차 응용', '하', '1분 30초', '항목별 원칙과 예외(감액·상한) 적용', '① 감액을 0으로 / ③ 감액 누락 / ④ 상한 누락 / ⑤ 둘 다 누락', '원칙 합계에서 예외로 줄어드는 금액만 뺌', '여비 정산형, 금액 새로 설계'),
 'S-C08': ('조건추론·배열', '중', '2분', '묶음(CD)과 고정 위치(E)로 경우의 수 축소, 반드시 참 판정', '① 위치 오인 / ②③⑤ 한 배열에서만 성립', '한 배열을 찾아 거짓 선지를 지운 뒤 다른 배열로 확인', '순서 배열형, 조건 새로 설계(전수 탐색으로 해 2개 확인)'),
 'S-C09': ('조건추론·참거짓', '중', '1분 40초', '모순 쌍으로 거짓말쟁이 후보 축소, 반드시 참 판정', '①②④⑤ 한 경우만 보고 단정', '모순 쌍 → 나머지 진술 참 확정', '참거짓형, 진술 새로 설계(전수 탐색으로 경우 4개 확인)'),
 'S-C10': ('수리·최적화', '중', '2분', '상한 조건에서 상자 수의 하한, 구간 요금의 경계', '② 포장비 누락 / ① 구간 경계 착오', '26kg → 2상자 필수 → 둘째 상자 6kg 이상', '최소 비용형, 요금표 새로 설계(모든 나눔 203가지 탐색)'),
 'S-C11': ('수리·최적화', '하', '1분 30초', '두 조건을 먼저 맞춘 뒤 셋째 조건 확인(최소공배수 + 첫차 차이)', '①④ 두 노선만 일치 / 최소공배수를 첫차에 더함', '1·2번 공통(36분 주기)을 구해 3번 시각과 대조', '배차 시각형, 시각 새로 설계'),
 'S-C12': ('독해·정보 판단', '하', '1분 20초', '안내문의 한도·기간·예외 적용', '② ‘포함하여’ 누락 / ④ 합산 한도 누락 / ⑤ 정지 범위', '‘다만·포함하여·할 수 없습니다’에 먼저 표시', '안내문 판단형, 안내문 새로 작성'),
}
check(set(REVIEW) == {it['id'] for it in items}, 'review rows for every item')

# ---------------------------------------------------------------- write out
def esc_text(h):
    h = re.sub(r'<(?!/?(b|i|br|sup|sub|p|ul|li|span)\b)', '&lt;', h)
    return re.sub(r'(?<![a-z"\'/0-9])>', '&gt;', h)
for it in items:
    it['lv'] = {'하': 1, '중': 2, '상': 3}[REVIEW[it['id']][1]]
    _m = __import__('re').fullmatch(r'(?:(\d+)분)?\s*(?:(\d+)초)?', REVIEW[it['id']][2].strip()); it['sec'] = int(_m.group(1) or 0) * 60 + int(_m.group(2) or 0)
    for blk in it['explain']:
        if 'h' in blk: blk['h'] = esc_text(blk['h'])
        for x in blk.get('items', []):
            for k in ('why', 'h'):
                if k in x: x[k] = esc_text(x[k])
        if blk.get('t') == 'table':
            blk['rows'] = [[esc_text(c) for c in r] for r in blk['rows']]
            if 'note' in blk: blk['note'] = esc_text(blk['note'])
if fails:
    print('CHECKS FAILED — nothing written:'); [print(' -', f) for f in fails]; sys.exit(1)
pos = [it['answer'] for it in items]
print('answers', pos, 'distribution', [pos.count(i) for i in range(5)])
js = ('/* 송공 — 상황판단 정예 문항(직접 출제, 가상의 조문). 이 파일은 _src/tools/psat/mk_sit_c.py가 만든다: 날짜는 달력으로,\n'
      '   퍼즐은 전수 탐색으로, 최적화는 모든 경우를 따져 정답과 오답을 확인한 뒤에만 쓴다. 손으로 고치지 말고 스크립트를 고친다. */\n'
      '(function (G) {\n  \'use strict\';\n  G.PSAT.addBank(\'sit\', ' + json.dumps(items, ensure_ascii=False, indent=1) + ');\n'
      '})(typeof window !== \'undefined\' ? window : globalThis);\n')
open(OUT, 'w', encoding='utf8').write(js)
print('wrote', OUT, len(items), 'items')
rows = ['| 문항 | 유형 | 난이도 | 예상 시간 | 정답 | 평가요소 | 오답의 오류 유형 | 신속 풀이 | 검증 | 기출과의 관계 |', '|---|---|---|---|---|---|---|---|---|---|']
for it in items:
    c, lv, tm, ev, wr, fast, orig = REVIEW[it['id']]
    rows.append(f"| {it['id']} | {c} | {lv} | {tm} | {CIRC[it['answer']]} | {ev} | {wr} | {fast} | 스크립트로 모든 선지 재판정, 정답 유일 | {orig} |")
open(__file__.replace('mk_sit_c.py', 'review/sit-c.md'), 'w', encoding='utf8').write('# 상황판단 S-C 검수표\n\n' + '\n'.join(rows) + '\n')
print('wrote review/sit-c.md')
