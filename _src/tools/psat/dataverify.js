// Independent check of table/chart statements: parse the displayed numbers and the Korean sentence, recompute exactly
// (decimals scaled to integers, ratios by cross-multiplication), and confirm the key.
const vm = require('vm'), fs = require('fs');
const dir = '/home/user/yohan-ahn/psat/';
for (const f of ['core.js', 'gen-data.js']) vm.runInThisContext(fs.readFileSync(dir + f, 'utf8'), { filename: f });
const P = globalThis.PSAT;
const strip = (h) => String(h).replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const num = (s) => Math.round(parseFloat(String(s).replace(/,/g, '')) * 10);   // ×10 integers (one decimal at most)
let fails = 0, checked = 0;
function dataOf(q) {
  const b = q.body[0];
  if (b.t === 'table') return { years: b.head.slice(1).map((y) => parseInt(y, 10)), rows: Object.fromEntries(b.rows.map((r) => [strip(r[0]), r.slice(1).map(num)])) };
  if (b.t === 'chart') return { years: b.cats.map((c) => parseInt(c, 10)), rows: Object.fromEntries(b.series.map((s) => [s.name, s.v.map((v) => Math.round(v * 10))])) };
  return null;
}
function truthOf(text, D) {
  const ents = Object.keys(D.rows), yi = (y) => D.years.indexOf(+y);
  const E = (s) => (ents.includes(s) ? s : null);
  let m;
  if ((m = text.match(/^(.+?)의 .+?(?:은|는) 매년 (증가|감소)하였다\.$/)) && E(m[1])) { const v = D.rows[m[1]]; return v.every((x, i) => i === 0 || (m[2] === '증가' ? x > v[i - 1] : x < v[i - 1])); }
  if ((m = text.match(/^(.+?)의 .+? 전년 대비 (증가폭|증가율)(?:이|가) 가장 큰 해는 (\d{4})년이다\.$/)) && E(m[1])) {
    const v = D.rows[m[1]]; let best = 1;
    for (let i = 2; i < v.length; i++) {
      const better = m[2] === '증가폭' ? (v[i] - v[i - 1]) > (v[best] - v[best - 1]) : (v[i] - v[i - 1]) * v[best - 1] > (v[best] - v[best - 1]) * v[i - 1];
      if (better) best = i;
    }
    return D.years[best] === +m[3];
  }
  if ((m = text.match(/^(\d{4})년 (.+?)의 .+?(?:은|는) (.+?)의 ([\d.]+)배 이상이다\.$/)) && E(m[2]) && E(m[3])) { const i = yi(m[1]); return D.rows[m[2]][i] * 10 >= Math.round(parseFloat(m[4]) * 10) * D.rows[m[3]][i]; }
  if ((m = text.match(/^(\d{4})년 (.+?)(?:과|와) (.+?)의 .+? 차이는 (\d+)%p 이상이다\.$/)) && E(m[2]) && E(m[3])) { const i = yi(m[1]); return Math.abs(D.rows[m[2]][i] - D.rows[m[3]][i]) >= +m[4] * 10; }
  if ((m = text.match(/^(\d{4})년 (.+?)의 .+?(?:은|는) 전체의 (\d+)% 이상이다\.$/)) && E(m[2])) { const i = yi(m[1]); const tot = ents.reduce((s, e) => s + D.rows[e][i], 0); return D.rows[m[2]][i] * 100 >= +m[3] * tot; }
  if ((m = text.match(/^(\d{4})년 .+?(?:이|가) 가장 (?:높|많)은 .+?(?:은|는) (.+?)이다\.$/)) && E(m[2])) { const i = yi(m[1]); const mx = Math.max(...ents.map((e) => D.rows[e][i])); return D.rows[m[2]][i] === mx && ents.filter((e) => D.rows[e][i] === mx).length === 1; }
  if ((m = text.match(/^(\d{4})년 대비 (\d{4})년 .+?의 (?:증가폭|증가량)(?:은|는) (.+?)(?:이|가) (.+?)보다 크다\.$/)) && E(m[3]) && E(m[4])) { const a = yi(m[1]), b = yi(m[2]); return (D.rows[m[3]][b] - D.rows[m[3]][a]) > (D.rows[m[4]][b] - D.rows[m[4]][a]); }
  if ((m = text.match(/^조사 대상 .+? 전체의 .+? 합계가 처음으로 ([\d,]+).*?(?:을|를) 넘은 해는 (\d{4})년이다\.$/))) { const N = num(m[1]); const tot = D.years.map((_, i) => ents.reduce((s, e) => s + D.rows[e][i], 0)); const first = tot.findIndex((t) => t > N); return first >= 0 && D.years[first] === +m[2]; }
  return null;
}
function verify(q) {
  const D = dataOf(q); if (!D) { fails++; console.log('no data', q.id); return; }
  const stem = strip(q.stem);
  const box = q.body.find((b) => b.t === 'box');
  if (box) {
    const items = box.items.map((x) => strip(x).replace(/^[ㄱ-ㅎ]\.\s*/, ''));
    const tv = items.map((t) => truthOf(t, D));
    if (tv.some((t) => t === null)) { fails++; console.log('unparsed', q.id, items[tv.indexOf(null)]); return; }
    const set = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'].filter((_, i) => tv[i]).join(', ');
    const opts = q.options.map(strip);
    if (opts.filter((o) => o === set).length !== 1 || opts[q.answer] !== set) { fails++; console.log('KEY MISMATCH', q.id, set, opts, q.answer); return; }
  } else {
    const tv = q.options.map((o) => truthOf(strip(o), D));
    if (tv.some((t) => t === null)) { fails++; console.log('unparsed', q.id, strip(q.options[tv.indexOf(null)])); return; }
    const want = /옳지 않은/.test(stem) ? false : true;
    if (tv.filter((t) => t === want).length !== 1 || tv[q.answer] !== want) { fails++; console.log('KEY MISMATCH', q.id, tv, q.answer); return; }
  }
  checked++;
}
const N = +(process.env.N || 1000);
for (const id of ['D-table', 'D-bogi', 'D-chart']) {
  const g = P.gens.data.find((x) => x.id === id); const before = checked;
  for (let i = 0; i < N; i++) for (const lv of [1, 2, 3]) { const q = P.make('data', g, 777 + i * 7919 + lv, lv); if (q) verify(q); }
  console.log(id.padEnd(8), 'verified', checked - before);
}
console.log(fails ? `FAILURES: ${fails}` : 'ALL VERIFIED', 'total', checked);
