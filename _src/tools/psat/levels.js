// every leveled generator must produce valid questions at every level
const vm = require('vm'), fs = require('fs');
for (const f of ['core.js', 'gen-lang.js', 'gen-data.js', 'gen-sit.js']) vm.runInThisContext(fs.readFileSync('/home/user/yohan-ahn/psat/' + f, 'utf8'), { filename: f });
const P = globalThis.PSAT; P.debug = true;
for (const [s, gens] of Object.entries(P.gens)) for (const g of gens.filter((x) => x.leveled)) {
  const row = [];
  for (const lv of [1, 2, 3]) {
    let ok = 0, fail = 0, t0 = Date.now(), extra = [];
    for (let i = 0; i < 150; i++) { const q = P.make(s, g, 77 + i * 104729, lv); if (q) { ok++; if (q.lv !== lv) extra.push('lvmismatch'); } else fail++; }
    row.push(`L${lv} ok=${ok} fail=${fail} ${Date.now() - t0}ms${extra.length ? ' ' + extra[0] : ''}`);
  }
  console.log(g.id.padEnd(9), row.join(' | '));
}
