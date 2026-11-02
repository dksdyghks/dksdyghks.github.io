# Independent re-solve of every computational claim in the curated bank (logic by brute force, numbers by exact arithmetic).
import itertools, datetime as dt, json, subprocess, sys
from fractions import Fraction as F
ok_all = True
def ok(c, m):
    global ok_all
    print(('OK  ' if c else 'FAIL'), m); ok_all &= bool(c)
# pull the bank's answers straight from the JS files
js = r"""
const vm=require('vm'),fs=require('fs');const d='/home/user/yohan-ahn/psat/';
const L=fs.readFileSync(d+'index.html','utf8');for(const f of ['core.js',...[...L.matchAll(/<script src="(bank-[^"?]+)/g)].map(m=>m[1])])vm.runInThisContext(fs.readFileSync(d+f,'utf8'));
const out={};for(const [s,a] of Object.entries(PSAT.bank))for(const q of a)out[q.id]={answer:q.answer,options:q.options.map(o=>o.replace(/<[^>]+>/g,'')),n:q.options.length};
console.log(JSON.stringify(out));"""
B = json.loads(subprocess.check_output(['node', '-e', js]))
print('bank items loaded:', len(B))
A = lambda i: B[i]['answer']

# L-B04: A->B, B->notC, notC->D, D->A ; options in order
models = [m for m in itertools.product([0,1], repeat=4) if (not m[0] or m[1]) and not (m[1] and m[2]) and (m[2] or m[3]) and (not m[3] or m[0])]
opts = [lambda a,b,c,d: a, lambda a,b,c,d: a+b+c+d == 1, lambda a,b,c,d: a == d, lambda a,b,c,d: (not b) or c, lambda a,b,c,d: b or d]
nec = [i for i,f in enumerate(opts) if all(f(*m) for m in models)]
ok(nec == [A('L-B04')], f'L-B04 models={models} necessary={nec} answer={A("L-B04")}')

# L-B05: one culprit, exactly one liar
P_ = ['甲','乙','丙','丁','戊']; sols=[]
for x in P_:
    st = {'甲': x=='乙', '乙': x=='丁', '丙': x!='丙', '丁': x!='丁', '戊': x!='甲'}
    L = [p for p in P_ if not st[p]]
    if len(L) == 1: sols.append(f'{x} · {L[0]}')
ok(len(sols) == 1 and B['L-B05']['options'][A('L-B05')] == sols[0], f'L-B05 solutions={sols} chosen={B["L-B05"]["options"][A("L-B05")]}')

# L-B07: premise ∃(A∧E), conclusion ∃(A∧W); which added premise makes it valid over all models up to 3 individuals
cands = [lambda M: all(e for a,e,w in M if w), lambda M: any(e and w for a,e,w in M), lambda M: all(not w for a,e,w in M if not e), lambda M: any(a and not w for a,e,w in M), lambda M: all(w for a,e,w in M if e)]
valid=[]
for k,f in enumerate(cands):
    good=True
    for n in range(1,4):
        for bits in itertools.product([0,1], repeat=3*n):
            M=[bits[3*i:3*i+3] for i in range(n)]
            if any(a and e for a,e,w in M) and f(M) and not any(a and w for a,e,w in M): good=False; break
        if not good: break
    if good: valid.append(k)
ok(valid == [A('L-B07')], f'L-B07 valid premises={valid} answer={A("L-B07")}')

# D-B01 library
vis=[820,1050,1260,1310,1420]; loan=[1230,1470,1640,1580,1720]; mem=[96,104,115,121,136]
t=[all(loan[i]>loan[i-1] for i in range(1,5)), F(loan[4],mem[4])>F(loan[0],mem[0]),
   max(range(1,5), key=lambda i: F(vis[i]-vis[i-1],vis[i-1]))==1, F(mem[4])>=F(3,2)*mem[0],
   all(F(loan[i],vis[i])<F(loan[i-1],vis[i-1]) for i in range(1,5))]
ok([i for i,x in enumerate(t) if x]==[A('D-B01')], f'D-B01 truths={t}')
# D-B02 matching
T={'A':(52,1820),'B':(18,900),'C':(25,610),'D':(60,1500)}; pc={k:F(g,p) for k,(p,g) in T.items()}
sol=[]
for perm in itertools.permutations('ABCD'):
    e,w,s,n = perm  # 동 서 남 북
    if max(pc,key=pc.get)!=n or not T[e][0]>=2*T[s][0] or not pc[e]<pc[w]: continue
    sol.append({e:'동구',w:'서구',s:'남구',n:'북구'})
txt = lambda m: ' · '.join(f'{k} {m[k]}' for k in 'ABCD')
ok(len(sol)==1 and B['D-B02']['options'][A('D-B02')]==txt(sol[0]), f'D-B02 solution={txt(sol[0])}')
for i,o in enumerate(B['D-B02']['options']):
    if i!=A('D-B02'): ok(o!=txt(sol[0]), f'D-B02 option {i+1} is wrong as intended')
# D-B03 execution rates
Bd={'기획':(480,437),'인사':(260,226),'홍보':(350,326),'연구':(920,861),'총무':(150,127)}; r={k:F(e,b) for k,(b,e) in Bd.items()}
pair=f'{max(r,key=r.get)} · {min(r,key=r.get)}'
ok(B['D-B03']['options'][A('D-B03')]==pair and B['D-B03']['options'].count(pair)==1, f'D-B03 highest·lowest={pair} rates={ {k: float(round(v*100,2)) for k,v in r.items()} }')
# D-B04 turnout
V={'20대':(F('66.2'),F('71.1'),F('68.4')),'30대':(F('70.5'),F('70.9'),F('73.0')),'40대':(F('74.8'),F('72.6'),F('75.1')),'50대':(F('78.3'),F('81.0'),F('79.4')),'60대 이상':(F('82.1'),F('84.6'),F('85.9'))}
o=list(V)
g=[all(all(V[o[i]][t]<V[o[i+1]][t] for i in range(4)) for t in range(3)), V['60대 이상'][0]<V['60대 이상'][1]<V['60대 이상'][2],
   (V['60대 이상'][2]-V['20대'][2])<(V['60대 이상'][0]-V['20대'][0]), (V['40대'][2]-V['40대'][1])>(V['30대'][2]-V['30대'][1])]
true_set=', '.join(l for l,x in zip('ㄱㄴㄷㄹ',g) if x)
ok(B['D-B04']['options'][A('D-B04')]==true_set and B['D-B04']['options'].count(true_set)==1, f'D-B04 true set={true_set}')
# D-B05 compound growth
gr=(F(110,100)*F(115,100)-1)*100
ok(B['D-B05']['options'][A('D-B05')]==f'{float(gr):.1f}%', f'D-B05 growth={float(gr)}%')
# D-B06 report
R={'A시':(F('27.4'),F('31.9'),F('35.2')),'B시':(F('24.1'),F('29.8'),F('33.6')),'C도':(F('29.6'),F('32.0'),F('34.1')),'D도':(F('22.8'),F('27.5'),F('30.4'))}
rise={k:v[2]-v[0] for k,v in R.items()}
c=[max(R,key=lambda k:R[k][2])=='A시' and R['A시'][2]==F('35.2'), all(R[k][2]>R[k][0] for k in R), max(rise,key=rise.get)=='B시' and rise['B시']==F('9.5'),
   max(R,key=lambda k:R[k][0])=='C도' and min(rise,key=rise.get)=='C도', (R['D도'][2]-R['D도'][1])>(R['A시'][2]-R['A시'][1])]
ok([i for i,x in enumerate(c) if not x]==[A('D-B06')], f'D-B06 statements={c}')
# D-B07 weighted average
avg=F(120*85+80*110+50*64,250*10)
ok(B['D-B07']['options'][A('D-B07')]==f'{float(avg):.2f}년', f'D-B07 avg={float(avg)}')
# D-B08 shares
E={'석탄':210,'가스':180,'원자력':170,'신재생':90,'기타':30}; tot=sum(E.values())
s=[F(E['석탄']+E['가스'],tot)>=F(6,10), F(E['원자력'],tot)==F(1,4), E['신재생']>=4*E['기타'], E['가스']>=F(9,10)*E['석탄'], F(E['신재생']+E['기타'],tot)>=F(2,10)]
ok([i for i,x in enumerate(s) if x]==[A('D-B08')], f'D-B08 total={tot} statements={s}')

# S-B01 committee
reg=9; quorum_call = 3 >= F(reg,3)
term_max = 2+2
reg_x = reg-1; open_with_4 = 4 > reg_x/2
passed = 3 > 6/2  # 출석 6, 찬성 3: 과반수 아님
st=[quorum_call, term_max>=6, passed, open_with_4, False]
ok([i for i,x in enumerate(st) if x]==[A('S-B01')], f'S-B01 statements={st}')
# S-B02 rent support
def sup(age,months,rent,market):
    if age>39 or months>36: return 0
    return min(F(rent)*(F(7,10) if market else F(1,2)),60)*12
Sx={'A':(34,24,100,False),'B':(38,12,150,True),'C':(41,12,120,False),'D':(29,48,90,True),'E':(36,30,80,True)}
amt={k:sup(*v) for k,v in Sx.items()}; best=max(amt,key=amt.get)
ok(B['S-B02']['options'][A('S-B02')]==best and sorted(amt.values())[-1]!=sorted(amt.values())[-2], f'S-B02 amounts={ {k:int(v) for k,v in amt.items()} }')
# S-B03 seating
names=['甲','乙','丙','丁','戊']; arr=[]
for perm in itertools.permutations(range(1,6)):
    p=dict(zip(names,perm))
    if p['甲'] in (1,5) or p['乙']!=p['丙']-1 or abs(p['丁']-p['戊'])!=2 or not p['丙']>p['甲'] or p['戊']==1: continue
    arr.append(sorted(p,key=p.get))
ok(len(arr)==1 and B['S-B03']['options'][A('S-B03')]==arr[0][2], f'S-B03 arrangement={arr}')
# S-B04 lessons
hol={dt.date(2025,5,5),dt.date(2025,5,6)}; L=[]; cur=dt.date(2025,3,1)
ok(cur.weekday()==5, 'S-B04 2025-03-01 is Saturday')
while len(L)<20:
    if cur.weekday() in (1,3) and cur not in hol: L.append(cur)
    cur+=dt.timedelta(days=1)
lab=f'{L[-1].month}월 {L[-1].day}일({"월화수목금토일"[L[-1].weekday()]})'
ok(B['S-B04']['options'][A('S-B04')]==lab, f'S-B04 20th lesson={lab}')
# S-B05 deposits (만 원)
valid=200000; votes={'甲':(82000,True),'乙':(54000,False),'丙':(26000,False),'丁':(18000,False),'戊':(20000,False)}
def ret(v,won):
    if won or F(v,valid)>=F(15,100): return 1500
    if F(v,valid)>=F(10,100): return 750
    return 0
total=sum(ret(v,w) for v,w in votes.values())
ok(B['S-B05']['options'][A('S-B05')]==f'{total:,}만 원', f'S-B05 total={total}')
# S-B06 hiring
C={'A':(90,70),'B':(80,78),'C':(100,59),'D':(70,85),'E':(85,74)}; sc={k:F(6,10)*a+F(4,10)*b for k,(a,b) in C.items()}
top2=sorted([k for k in C if C[k][1]>=60], key=lambda k:-sc[k])[:2]
ok(B['S-B06']['options'][A('S-B06')]==', '.join(sorted(top2)), f'S-B06 scores={ {k:float(v) for k,v in sc.items()} } top2={top2}')
# S-B07 league
teams='ABCD'; games=list(itertools.combinations(teams,2)); sols=[]
for res in itertools.product('WDL',repeat=6):
    pts=dict.fromkeys(teams,0)
    for (x,y),r_ in zip(games,res):
        if r_=='W': pts[x]+=3
        elif r_=='L': pts[y]+=3
        else: pts[x]+=1; pts[y]+=1
    if pts=={'A':7,'B':5,'C':3,'D':1}: sols.append(dict(zip(games,res)))
fact=[lambda s: s[('A','C')]=='D', lambda s: s[('A','B')]=='L', lambda s: sum(v=='D' for v in s.values())==3, lambda s: s[('B','D')]=='W', lambda s: s[('C','D')]=='W']
must=[i for i,f in enumerate(fact) if all(f(s) for s in sols)]
ok(len(sols)==1 and must==[A('S-B07')], f'S-B07 solutions={len(sols)} must={must}')
# S-B08 plans
cost={'가':33000+(300-200)*100+(12-5)*3000,'나':44000+(12-10)*2500,'다':55000,'라':int(39000*F(8,10))+(12-6)*2000}
best=min(cost,key=cost.get)
ok(B['S-B08']['options'][A('S-B08')]==f'{best} 요금제 · {cost[best]:,}원', f'S-B08 costs={cost}')
for i,o in enumerate(B['S-B08']['options']):
    if i!=A('S-B08'): ok(o!=f'{best} 요금제 · {cost[best]:,}원', f'S-B08 option {i+1} differs from the answer')
# ---- S-L: 상황판단 법조문 (bank-sit-law.js) ----
def won(n): return f'{n:,}만 원'
# S-L02 fines: days run from the day after the deadline to the filing day (inclusive)
def fine(deadline, filed, self_report, needy):
    days=(filed-deadline).days; amt=min(F(2)*days, 100)
    if self_report: amt/=2
    if needy: amt/=2
    return int(amt)  # 1만 원 미만 버림
f1=fine(dt.date(2026,3,31),dt.date(2026,4,23),True,True); f2=fine(dt.date(2026,2,28),dt.date(2026,5,31),False,False)
ok(B['S-L02']['options'][A('S-L02')]==won(f1+f2) and (f1,f2)==(11,100), f'S-L02 fines={f1},{f2}')
# S-L03 ordinance: first vote, transfer window, re-vote
reg=21; v1=(16,9); v2=(18,12)
passed1 = v1[0]>reg/2 and v1[1]>v1[0]/2
transfer_ok = (dt.date(2026,9,5)-dt.date(2026,9,1)).days<=5
veto_ok = (dt.date(2026,9,15)-dt.date(2026,9,5)).days<=20
confirmed = v2[0]>reg/2 and F(v2[1],v2[0])>=F(2,3)
st=[not passed1, not transfer_ok, False, confirmed and veto_ok, False]
ok([i for i,x in enumerate(st) if x]==[A('S-L03')] and passed1, f'S-L03 statements={st}')
# S-L05 compensation (만 원)
a=sum([3000,3600,4200])/F(3); b=sum([2100,2400,2700])/F(3)
months=6 if 6>4 else 4
comp=a*2 + b/12*months + 30*months
ok(B['S-L05']['options'][A('S-L05')]==won(int(comp)) and comp.denominator==1, f'S-L05 total={comp}')
# S-L06 recall: term 2026-07-01..2030-06-30, 300,000 voters
start,end=dt.date(2026,7,1),dt.date(2030,6,30); N=300000
def can_request(d,sig):
    one_year_after_start=dt.date(start.year+1,start.month,start.day)
    if d<one_year_after_start: return False
    if dt.date(d.year+1,d.month,d.day)>end: return False  # less than a year left
    return sig>=N*F(10,100)
st=[can_request(dt.date(2027,3,1),30000), can_request(dt.date(2028,3,1),25000), 90000<N*F(1,3), 120000>=N*F(1,3) and 60000>F(120000,2), can_request(dt.date(2029,8,1),40000)]
ok([i for i,x in enumerate(st) if x]==[A('S-L06')] and can_request(dt.date(2028,3,1),30000), f'S-L06 statements={st}')
# S-L07 allowances: same-day meetings pay once; chair x2; cap 100
def allow(days,chair,reviews): return min(days*15*(2 if chair else 1)+reviews*5,100)
tot=allow(5,True,3)+allow(4,False,4)
ok(B['S-L07']['options'][A('S-L07')]==won(tot), f'S-L07 total={tot}')
# S-L09 appeal windows: first day excluded; ends on the last day even on Saturday
disp=dt.date(2026,3,2); end180=disp+dt.timedelta(days=180)
ok(end180==dt.date(2026,8,29) and end180.weekday()==5, f'S-L09 180-day end={end180} weekday={end180.weekday()}')
def lawful(known,filed): return filed<=known+dt.timedelta(days=90) and filed<=end180
J=lawful(dt.date(2026,3,10),dt.date(2026,6,8)); Y=lawful(dt.date(2026,8,20),dt.date(2026,8,28)); Bq=lawful(dt.date(2026,3,5),dt.date(2026,6,4))
st=[Y, not J, Bq, lawful(dt.date(2026,8,20),dt.date(2026,8,31)), not lawful(dt.date(2026,3,9),dt.date(2026,6,4))]
ok([i for i,x in enumerate(st) if x]==[A('S-L09')], f'S-L09 甲={J} 乙={Y} 丙={Bq} statements={st}')
for who,k,want in [('甲',dt.date(2026,3,10),dt.date(2026,6,8)),('乙',dt.date(2026,8,20),dt.date(2026,11,18)),('丙',dt.date(2026,3,5),dt.date(2026,6,3)),('丙@3/9',dt.date(2026,3,9),dt.date(2026,6,7))]:
    ok(k+dt.timedelta(days=90)==want, f'S-L09 90-day end for {who}={k+dt.timedelta(days=90)}')
# S-L10 party subsidy (억 원)
seats={'A':150,'B':120,'C':18,'D':12}; vote={'A':45,'B':35,'C':12,'D':8}; T=F(100)
neg=[p for p in seats if seats[p]>=20]; other=[p for p in seats if p not in neg and seats[p]>=5]
share={p:(T*F(50,100)/len(neg) if p in neg else 0)+(T*F(5,100) if p in other else 0) for p in seats}
rest=T-sum(share.values())
for p in seats: share[p]+=rest/2*F(seats[p],sum(seats.values()))+rest/2*F(vote[p],sum(vote.values()))
c=share['C']; eok=int(c); man=int((c-eok)*10000)
label=f'{eok}억 {man//1000}천만 원' if man else f'{eok}억 원'
ok(B['S-L10']['options'][A('S-L10')]==label and sum(share.values())==T, f'S-L10 shares={ {k:float(v) for k,v in share.items()} } C={label}')
print('ALL OK' if ok_all else 'SOMETHING FAILED')
