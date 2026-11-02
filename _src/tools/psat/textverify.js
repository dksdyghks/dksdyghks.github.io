// Independent verifier: reads ONLY the rendered text a student sees (stem, passage, options), rebuilds the puzzle
// from the Korean sentences, brute-forces every possibility, and checks that exactly the keyed option is correct.
const vm = require('vm'), fs = require('fs');
const dir = '/home/user/yohan-ahn/psat/';
for (const f of ['core.js', 'gen-lang.js', 'gen-sit.js']) vm.runInThisContext(fs.readFileSync(dir + f, 'utf8'), { filename: f });
const P = globalThis.PSAT;
const strip = (h) => String(h).replace(/<br\s*\/?>/g, '\n').replace(/<(ul|li)[^>]*>/g, '\n').replace(/<\/(li|p)>/g, '\n').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const ORD = { '첫': 1, '두': 2, '세': 3, '네': 4, '다섯': 5, '여섯': 6 };
const NM = '([甲乙丙丁戊己])';
const PT = '(?:은|는|이|가|과|와|을|를)';
function perms(a) { if (a.length <= 1) return [a.slice()]; const o = []; a.forEach((x, i) => { for (const p of perms(a.slice(0, i).concat(a.slice(i + 1)))) o.push([x, ...p]); }); return o; }
let fails = 0, checked = 0;
const fail = (id, msg, q) => { fails++; if (fails <= 12) console.log('FAIL', id, msg, '\n  ', strip(q.stem), '\n  ', strip(q.body.map((b) => b.h || '').join(' ')).slice(0, 400), '\n  ', q.options.map(strip).join(' | '), 'key', q.answer); };

/* ---------- ordering / seating ---------- */
function orderCons(lines, seat) {
  const cs = [];
  for (const raw of lines) {
    const L = raw.replace(/^\([가-바]\)\s*/, '').trim(); if (!L) continue;
    let m;
    if (seat) {
      if ((m = L.match(new RegExp(`^${NM}${PT} ${NM}보다 왼쪽에 앉는다\\.$`)))) cs.push((p) => p[m[1]] < p[m[2]]);
      else if ((m = L.match(new RegExp(`^${NM}${PT} ${NM}의 바로 왼쪽에 앉는다\\.$`)))) cs.push((p) => p[m[1]] === p[m[2]] - 1);
      else if ((m = L.match(new RegExp(`^${NM}${PT} ${NM}${PT} 이웃하여 앉는다\\.$`)))) cs.push((p) => Math.abs(p[m[1]] - p[m[2]]) === 1);
      else if ((m = L.match(new RegExp(`^${NM}${PT} ${NM}${PT} 이웃하여 앉지 않는다\\.$`)))) cs.push((p) => Math.abs(p[m[1]] - p[m[2]]) !== 1);
      else if ((m = L.match(new RegExp(`^${NM}${PT} ${NM} 사이에는 정확히 (\\d)명이 앉는다\\.$`)))) cs.push((p) => Math.abs(p[m[1]] - p[m[2]]) - 1 === +m[3]);
      else if ((m = L.match(new RegExp(`^${NM}${PT} 양 끝 자리에 앉지 않는다\\.$`)))) cs.push((p, K) => p[m[1]] !== 1 && p[m[1]] !== K);
      else if ((m = L.match(new RegExp(`^${NM}${PT} (\\d)번 자리에 앉지 않는다\\.$`)))) cs.push((p) => p[m[1]] !== +m[2]);
      else if ((m = L.match(new RegExp(`^${NM}${PT} (\\d)번 자리에 앉는다\\.$`)))) cs.push((p) => p[m[1]] === +m[2]);
      else return { bad: L };
    } else {
      if ((m = L.match(new RegExp(`^${NM}${PT} ${NM}보다 먼저 도착하였다\\.$`)))) cs.push((p) => p[m[1]] < p[m[2]]);
      else if ((m = L.match(new RegExp(`^${NM}${PT} ${NM} 바로 다음에 도착하였다\\.$`)))) cs.push((p) => p[m[1]] === p[m[2]] + 1);
      else if ((m = L.match(new RegExp(`^${NM}${PT} ${NM}${PT} 연이어 도착하였다\\.$`)))) cs.push((p) => Math.abs(p[m[1]] - p[m[2]]) === 1);
      else if ((m = L.match(new RegExp(`^${NM}${PT} ${NM}${PT} 연이어 도착하지 않았다\\.$`)))) cs.push((p) => Math.abs(p[m[1]] - p[m[2]]) !== 1);
      else if ((m = L.match(new RegExp(`^${NM}${PT} ${NM} 사이에 정확히 (\\d)명이 도착하였다\\.$`)))) cs.push((p) => Math.abs(p[m[1]] - p[m[2]]) - 1 === +m[3]);
      else if ((m = L.match(new RegExp(`^${NM}${PT} 첫 번째로도, 마지막으로도 도착하지 않았다\\.$`)))) cs.push((p, K) => p[m[1]] !== 1 && p[m[1]] !== K);
      else if ((m = L.match(new RegExp(`^${NM}${PT} (첫|두|세|네|다섯|여섯) 번째로 도착하지 않았다\\.$`)))) cs.push((p) => p[m[1]] !== ORD[m[2]]);
      else if ((m = L.match(new RegExp(`^${NM}${PT} (첫|두|세|네|다섯|여섯) 번째로 도착하였다\\.$`)))) cs.push((p) => p[m[1]] === ORD[m[2]]);
      else return { bad: L };
    }
  }
  return { cs };
}
function verifyOrder(q, seat) {
  const text = strip(q.body[0].h);
  const K = /여섯/.test(text) ? 6 : 5;
  const names = ['甲', '乙', '丙', '丁', '戊', '己'].slice(0, K);
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => /^\([가-바]\)/.test(l));
  const { cs, bad } = orderCons(lines, seat);
  if (bad) return fail(q.id, 'unparsed: ' + bad, q);
  const sols = perms(names).map((pm) => { const p = {}; pm.forEach((x, i) => { p[x] = i + 1; }); return p; }).filter((p) => cs.every((f) => f(p, K)));
  if (sols.length !== 1) return fail(q.id, `solutions=${sols.length}`, q);
  const p = sols[0];
  const st = strip(q.stem); let m;
  const opts = q.options.map((o) => strip(o).trim());
  let truth;
  if ((m = st.match(/(첫|두|세|네|다섯|여섯) 번째로 도착한 사람은/))) truth = opts.map((o) => p[o] === ORD[m[1]]);
  else if ((m = st.match(/(\d)번 자리에 앉는 사람은/))) truth = opts.map((o) => p[o] === +m[1]);
  else if (/반드시 참인 것은/.test(st)) truth = opts.map((o) => { let k;
    if ((k = o.match(new RegExp(`^${NM}${PT} (첫|두|세|네|다섯|여섯) 번째로 도착하였다\\.$`)))) return p[k[1]] === ORD[k[2]];
    if ((k = o.match(new RegExp(`^${NM}${PT} ${NM} 바로 다음에 도착하였다\\.$`)))) return p[k[1]] === p[k[2]] + 1;
    return null; });
  else return fail(q.id, 'unknown stem', q);
  if (truth.some((t) => t === null)) return fail(q.id, 'unparsed option', q);
  if (truth.filter(Boolean).length !== 1 || !truth[q.answer]) return fail(q.id, `truth=${truth}`, q);
  checked++;
}
/* ---------- league ---------- */
function verifyLeague(q) {
  const t = strip(q.body[0].h);
  const m = t.match(/A팀 (\d+)점, B팀 (\d+)점, C팀 (\d+)점, D팀 (\d+)점/);
  if (!m) return fail(q.id, 'no points', q);
  const want = { A: +m[1], B: +m[2], C: +m[3], D: +m[4] };
  const T = ['A', 'B', 'C', 'D'], games = [['A', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'C'], ['B', 'D'], ['C', 'D']];
  const cons = [];
  for (let mm = 0; mm < 729; mm++) {
    const res = []; let x = mm; for (let i = 0; i < 6; i++) { res.push('WDL'[x % 3]); x = Math.floor(x / 3); }
    const pts = { A: 0, B: 0, C: 0, D: 0 };
    games.forEach(([a, b], i) => { if (res[i] === 'W') pts[a] += 3; else if (res[i] === 'L') pts[b] += 3; else { pts[a]++; pts[b]++; } });
    if (T.every((k) => pts[k] === want[k])) cons.push(res);
  }
  if (!cons.length) return fail(q.id, 'no consistent results', q);
  const result = (o, a, b) => { const i = games.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a)); const r = o[i]; if (r === 'D') return 'D'; const winner = r === 'W' ? games[i][0] : games[i][1]; return winner === a ? 'A' : 'B'; };
  const truth = q.options.map((raw) => { const o = strip(raw).trim(); let k;
    const f = (k = o.match(/^([A-D])(?:은|는) ([A-D])(?:을|를) 이겼다\.$/)) ? (r) => result(r, k[1], k[2]) === 'A'
      : (k = o.match(/^([A-D])(?:과|와) ([A-D])(?:은|는) 비겼다\.$/)) ? (r) => result(r, k[1], k[2]) === 'D'
      : (k = o.match(/^무승부 경기는 (\d)경기이다\.$/)) ? (r) => r.filter((x) => x === 'D').length === +k[1]
      : (k = o.match(/^([A-D])(?:은|는) 한 번도 지지 않았다\.$/)) ? (r) => T.filter((x) => x !== k[1]).every((y) => result(r, k[1], y) !== 'B')
      : null;
    return f ? cons.every(f) : null; });
  if (truth.some((t2) => t2 === null)) return fail(q.id, 'unparsed option', q);
  if (truth.filter(Boolean).length !== 1 || !truth[q.answer]) return fail(q.id, `truth=${truth} cons=${cons.length}`, q);
  checked++;
}
/* ---------- liars ---------- */
function verifyLiar(q) {
  const t = strip(q.body[0].h);
  const km = t.match(/이 가운데 (\d)명의 진술만 거짓이다/); if (!km) return fail(q.id, 'no liar count', q);
  const k = +km[1], names = ['甲', '乙', '丙', '丁', '戊'];
  const st = {};
  for (const line of t.split('\n')) { const m = line.match(new RegExp(`^${NM}: “(.*)”$`)); if (m) st[m[1]] = m[2]; }
  if (Object.keys(st).length !== 5) return fail(q.id, 'statements not parsed', q);
  const ev = (sp, s, c, L) => { let m;
    if ((m = s.match(new RegExp(`^${NM}${PT} 거짓말을 하고 있다\\.$`)))) return L.includes(m[1]);
    if ((m = s.match(new RegExp(`^${NM}의 말은 사실이다\\.$`)))) return !L.includes(m[1]);
    if (/^나는 .*지 않았다\.$/.test(s)) return c !== sp;
    if ((m = s.match(new RegExp(`^${NM}${PT} ${NM} 중 한 명이 .*\\.$`)))) return c === m[1] || c === m[2];
    if ((m = s.match(new RegExp(`^${NM}(?:은|는) .*지 않았다\\.$`)))) return c !== m[1];
    if ((m = s.match(new RegExp(`^${NM}(?:이|가) .*\\.$`)))) return c === m[1];
    return null; };
  const sols = [];
  const subsets = (arr, n) => (n === 0 ? [[]] : arr.length < n ? [] : [...subsets(arr.slice(1), n - 1).map((x) => [arr[0], ...x]), ...subsets(arr.slice(1), n)]);
  for (const c of names) for (const L of subsets(names, k)) {
    let ok = true;
    for (const sp of names) { const v = ev(sp, st[sp], c, L); if (v === null) return fail(q.id, 'unparsed statement: ' + st[sp], q); if (v === L.includes(sp)) { ok = false; break; } }
    if (ok) sols.push({ c, L });
  }
  if (!sols.length) return fail(q.id, 'no solution', q);
  const stem = strip(q.stem), opts = q.options.map((o) => strip(o).trim());
  let truth;
  if (/거짓을 진술한 사람을 바르게 짝지은/.test(stem)) truth = opts.map((o) => { const [cc, ll] = o.split(' — '); return sols.every((s) => s.c === cc && s.L.join('·') === ll); });
  else if (/거짓을 진술한 사람은\?/.test(stem)) truth = opts.map((o) => sols.every((s) => s.L.length === 1 && s.L[0] === o));
  else truth = opts.map((o) => sols.every((s) => s.c === o));
  if (truth.filter(Boolean).length !== 1 || !truth[q.answer]) return fail(q.id, `truth=${truth} sols=${JSON.stringify(sols)}`, q);
  checked++;
}
const N = +(process.env.N || 1500);
const run = (subj, id, fn) => { const g = P.gens[subj].find((x) => x.id === id); const before = checked; for (let i = 0; i < N; i++) for (const lv of [1, 2, 3]) { const q = P.make(subj, g, 9001 + i * 6151 + lv, lv); if (q) fn(q); } console.log(id.padEnd(9), 'verified', checked - before); };
run('lang', 'L-order', (q) => verifyOrder(q, false));
run('sit', 'S-seat', (q) => verifyOrder(q, true));
run('sit', 'S-league', verifyLeague);
run('lang', 'L-liar', verifyLiar);
console.log(fails ? `FAILURES: ${fails}` : 'ALL VERIFIED', 'total', checked);
